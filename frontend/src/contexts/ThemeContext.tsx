import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  themePresets,
  ThemePreset,
  ThemeColors,
  ThemeVariant,
  defaultThemeConfig,
  getThemeColors,
} from '../config/themePresets';

// Exportar tipos necesarios
export type { ThemePreset, ThemeColors, ThemeVariant };
export { themePresets };

// Interfaz del tema activo (combina colors + metadata)
export interface Theme extends ThemeColors {
  name: string;
  label: string;
}

interface ThemeContextType {
  // Tema actual (colores + metadata)
  theme: Theme;

  // Selección de preset y variante
  currentPresetId: string;
  currentVariant: ThemeVariant;
  setPreset: (presetId: string, variant: ThemeVariant) => void;

  // Imágenes de fondo
  sidebarBgImage: string | null;
  setSidebarBgImage: (url: string | null) => void;
  sidebarBgOpacity: number;
  setSidebarBgOpacity: (opacity: number) => void;
  contentBgImage: string | null;
  setContentBgImage: (url: string | null) => void;
  contentBgOpacity: number;
  setContentBgOpacity: (opacity: number) => void;

  // Lista de presets disponibles
  presets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Las preferencias de tema se guardan por usuario para no mezclarlas entre
// logins en el mismo navegador. Las claves globales quedan como fallback para
// sesiones anónimas / previos al login.
const userScopedKey = (userId: number | undefined, key: string) =>
  userId ? `user_${userId}:${key}` : key;

const readTheme = (userId: number | undefined) => {
  const preset = localStorage.getItem(userScopedKey(userId, 'themePresetId'));
  const variant = localStorage.getItem(userScopedKey(userId, 'themeVariant')) as ThemeVariant | null;
  const sidebarBg = localStorage.getItem(userScopedKey(userId, 'sidebarBgImage'));
  const sidebarOp = localStorage.getItem(userScopedKey(userId, 'sidebarBgOpacity'));
  const contentBg = localStorage.getItem(userScopedKey(userId, 'contentBgImage'));
  const contentOp = localStorage.getItem(userScopedKey(userId, 'contentBgOpacity'));
  return { preset, variant, sidebarBg, sidebarOp, contentBg, contentOp };
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Get user + municipio from AuthContext to load per-user theme config
  const { user, municipioActual } = useAuth();

  // Estado del preset y variante seleccionados — inicialmente desde el usuario
  // actual (si ya hay sesión) o las claves globales como fallback
  const initial = readTheme(user?.id);

  const [currentPresetId, setCurrentPresetId] = useState<string>(
    initial.preset || defaultThemeConfig.presetId
  );
  const [currentVariant, setCurrentVariant] = useState<ThemeVariant>(
    initial.variant || defaultThemeConfig.variant
  );
  const [sidebarBgImage, setSidebarBgImageState] = useState<string | null>(
    initial.sidebarBg && initial.sidebarBg !== 'null' ? initial.sidebarBg : null
  );
  const [sidebarBgOpacity, setSidebarBgOpacityState] = useState<number>(
    initial.sidebarOp ? parseFloat(initial.sidebarOp) : 0.3
  );
  const [contentBgImage, setContentBgImageState] = useState<string | null>(
    initial.contentBg && initial.contentBg !== 'null' ? initial.contentBg : null
  );
  const [contentBgOpacity, setContentBgOpacityState] = useState<number>(
    initial.contentOp ? parseFloat(initial.contentOp) : 0.1
  );

  // Flag para evitar guardar en localStorage durante la hidratación inicial
  // al cambiar de usuario/municipio (sobrescribiría la preferencia recién leída).
  const hydratingRef = useRef(true);

  // Al cambiar el usuario logueado (o el municipio) rehidratar el tema:
  // 1° preferencia guardada del usuario, 2° default del municipio, 3° default global.
  useEffect(() => {
    hydratingRef.current = true;

    const saved = readTheme(user?.id);
    const muniConfig = municipioActual?.tema_config;

    const preset = saved.preset || muniConfig?.presetId || defaultThemeConfig.presetId;
    const variant = (saved.variant || (muniConfig?.variant as ThemeVariant) || defaultThemeConfig.variant) as ThemeVariant;

    const sidebarBg = saved.sidebarBg !== null
      ? (saved.sidebarBg && saved.sidebarBg !== 'null' ? saved.sidebarBg : null)
      : (muniConfig?.sidebarBgImage ?? null);
    const sidebarOp = saved.sidebarOp !== null
      ? parseFloat(saved.sidebarOp)
      : (muniConfig?.sidebarBgOpacity ?? 0.3);
    const contentBg = saved.contentBg !== null
      ? (saved.contentBg && saved.contentBg !== 'null' ? saved.contentBg : null)
      : (muniConfig?.contentBgImage ?? null);
    const contentOp = saved.contentOp !== null
      ? parseFloat(saved.contentOp)
      : (muniConfig?.contentBgOpacity ?? 0.1);

    setCurrentPresetId(preset);
    setCurrentVariant(variant);
    setSidebarBgImageState(sidebarBg);
    setSidebarBgOpacityState(sidebarOp);
    setContentBgImageState(contentBg);
    setContentBgOpacityState(contentOp);

    // Dejamos de hidratar en el próximo microtask, después de que los setState
    // hagan flush — así los effects que persisten en localStorage ignoran este
    // ciclo y sólo guardan cambios originados por el usuario.
    const t = setTimeout(() => { hydratingRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [user?.id, municipioActual]);

  // Obtener los colores del tema actual
  const themeColors = getThemeColors(currentPresetId, currentVariant);
  const currentPreset = themePresets.find(p => p.id === currentPresetId);

  // Fallback a carbon/clasico si no se encuentra el preset
  const fallbackColors = getThemeColors('carbon', 'clasico')!;
  const activeColors = themeColors || fallbackColors;

  // Construir el objeto tema completo
  const theme: Theme = {
    ...activeColors,
    name: currentPresetId,
    label: currentPreset?.name || 'Carbon',
  };

  // Aplicar CSS variables cuando cambia el tema
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', theme.background);
    root.style.setProperty('--bg-secondary', theme.backgroundSecondary);
    root.style.setProperty('--text-primary', theme.text);
    root.style.setProperty('--text-secondary', theme.textSecondary);
    root.style.setProperty('--border-color', theme.border);
    root.style.setProperty('--color-primary', theme.primary);
    root.style.setProperty('--color-primary-hover', theme.primaryHover);
    root.style.setProperty('--bg-card', theme.card);
    root.style.setProperty('--bg-sidebar', theme.sidebar);

    // Aplicar al body directamente
    document.body.style.backgroundColor = theme.background;
    document.body.style.color = theme.text;
  }, [theme]);

  // Guardar preset/variante/fondos en localStorage con scope por usuario.
  // Durante la hidratación inicial (switch de usuario/municipio) no guardamos
  // para no pisar la preferencia recién leída con los defaults.
  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'themePresetId'), currentPresetId);
  }, [currentPresetId, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'themeVariant'), currentVariant);
  }, [currentVariant, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    const key = userScopedKey(user?.id, 'sidebarBgImage');
    if (sidebarBgImage) {
      localStorage.setItem(key, sidebarBgImage);
    } else {
      localStorage.removeItem(key);
    }
  }, [sidebarBgImage, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'sidebarBgOpacity'), String(sidebarBgOpacity));
  }, [sidebarBgOpacity, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    const key = userScopedKey(user?.id, 'contentBgImage');
    if (contentBgImage) {
      localStorage.setItem(key, contentBgImage);
    } else {
      localStorage.removeItem(key);
    }
  }, [contentBgImage, user?.id]);

  useEffect(() => {
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'contentBgOpacity'), String(contentBgOpacity));
  }, [contentBgOpacity, user?.id]);

  // Función para cambiar preset y variante
  const setPreset = (presetId: string, variant: ThemeVariant) => {
    setCurrentPresetId(presetId);
    setCurrentVariant(variant);
  };

  const setSidebarBgImage = (url: string | null) => {
    setSidebarBgImageState(url);
  };

  const setSidebarBgOpacity = (opacity: number) => {
    setSidebarBgOpacityState(opacity);
  };

  const setContentBgImage = (url: string | null) => {
    setContentBgImageState(url);
  };

  const setContentBgOpacity = (opacity: number) => {
    setContentBgOpacityState(opacity);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        currentPresetId,
        currentVariant,
        setPreset,
        sidebarBgImage,
        setSidebarBgImage,
        sidebarBgOpacity,
        setSidebarBgOpacity,
        contentBgImage,
        setContentBgImage,
        contentBgOpacity,
        setContentBgOpacity,
        presets: themePresets,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
