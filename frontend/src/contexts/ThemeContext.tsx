import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  themePresets,
  ThemePreset,
  ThemeColors,
  ThemeVariant,
  defaultThemeConfig,
  getThemeColors,
  getActivePresets,
} from '../config/themePresets';
import { DEFAULT_FONT_ID } from '../config/fontPresets';
import { applyFontFamily } from '../lib/fontLoader';
import { mix, lighten, darken, alpha, isLight } from '../lib/colorUtils';
import { BRAND } from '../brands';

// Preset/variante por defecto de la MARCA activa: sólo si la marca declara
// `fixedTheme` (identidad de color fija). Munify no lo setea → undefined, y el
// tema sigue saliendo del municipio / default global, como siempre.
const brandDefaultPreset = BRAND.fixedTheme ? BRAND.themePresetId : undefined;
const brandDefaultVariant = BRAND.fixedTheme ? BRAND.themeVariant : undefined;

// Presets que ofrece el selector: si la marca declara los suyos (fixedTheme),
// se muestran ESOS (p.ej. el par verde claro/oscuro); si no, la colección de
// Munify. Munify no setea themePresetIds → getActivePresets(), como siempre.
const selectorPresets: ThemePreset[] =
  BRAND.fixedTheme && BRAND.themePresetIds?.length
    ? (BRAND.themePresetIds
        .map((id) => themePresets.find((p) => p.id === id))
        .filter(Boolean) as ThemePreset[])
    : getActivePresets();

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

  // Tipografia (solo persiste si user es superadmin/admin)
  currentFontId: string;
  setFont: (fontId: string) => void;

  // Lista de presets disponibles (solo activos, sin archivados)
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
  const fontId = localStorage.getItem(userScopedKey(userId, 'fontId'));
  return { preset, variant, sidebarBg, sidebarOp, contentBg, contentOp, fontId };
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Get user + municipio from AuthContext to load per-user theme config
  const { user, municipioActual } = useAuth();

  // Estado del preset y variante seleccionados — inicialmente desde el usuario
  // actual (si ya hay sesión) o las claves globales como fallback
  const initial = readTheme(user?.id);

  const [currentPresetId, setCurrentPresetId] = useState<string>(
    initial.preset || brandDefaultPreset || defaultThemeConfig.presetId
  );
  const [currentVariant, setCurrentVariant] = useState<ThemeVariant>(
    initial.variant || brandDefaultVariant || defaultThemeConfig.variant
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
  const [currentFontId, setCurrentFontId] = useState<string>(
    initial.fontId || DEFAULT_FONT_ID
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

    const preset = saved.preset || brandDefaultPreset || muniConfig?.presetId || defaultThemeConfig.presetId;
    const variant = (saved.variant || brandDefaultVariant || (muniConfig?.variant as ThemeVariant) || defaultThemeConfig.variant) as ThemeVariant;

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

    // Fuente: prioridad localStorage del usuario > tema_config del muni > default
    const fontId = saved.fontId || (muniConfig as any)?.fontId || DEFAULT_FONT_ID;
    setCurrentFontId(fontId);

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

    // ---- Puente POLIMÓRFICO de tokens del rediseño v2 (--pl-*) ----
    // La paleta completa de Claude Design se DERIVA del theme activo: acento,
    // tintes, superficies, textos, rampa de datos y scrims del hero. Así el
    // rediseño funciona en todos los presets y marcas sin un color fijo.
    // (Los tokens estáticos —tipografía/espaciado/radios— viven en
    // styles/pl-tokens.css.)
    const p = theme.primary;
    const claro = isLight(theme.background);
    const set = (k: string, v: string) => root.style.setProperty(k, v);

    set('--pl-green', p);
    set('--pl-green-600', theme.primaryHover);
    set('--pl-green-700', claro ? darken(p, 14) : lighten(p, 30)); // texto sobre acento suave
    set('--pl-green-200', mix(theme.card, p, 0.30));
    set('--pl-green-100', mix(theme.card, p, 0.16));
    set('--pl-green-050', mix(theme.card, p, 0.08));
    set('--pl-on-brand', theme.primaryText);

    // Semánticos: ÚNICAS constantes = los 3 matices universales (warning/
    // danger/info). Todas sus variantes (texto accesible, superficie suave)
    // se DERIVAN del theme activo, igual que el resto.
    const AMBER = '#F59E0B';
    const RED = '#E5484D';
    const BLUE = '#3B82F6';
    const semantico = (base: string, prefijo: string) => {
      set(`--pl-${prefijo}`, base);
      set(`--pl-${prefijo}-700`, claro ? darken(base, 22) : lighten(base, 25));
      set(`--pl-${prefijo}-100`, mix(theme.card, base, 0.14));
    };
    semantico(AMBER, 'amber');
    semantico(RED, 'red');
    semantico(BLUE, 'blue');
    set('--pl-amber-strong', AMBER);

    // Rampa para series de datos (acento → neutro)
    set('--pl-data-1', p);
    set('--pl-data-2', mix(p, theme.card, 0.25));
    set('--pl-data-3', mix(p, theme.card, 0.45));
    set('--pl-data-4', mix(p, theme.card, 0.62));
    set('--pl-data-5', mix(theme.card, theme.textSecondary, 0.35));

    // Superficies y texto
    set('--pl-bg', theme.background);
    set('--pl-surface', theme.card);
    set('--pl-surface-2', theme.backgroundSecondary);
    set('--pl-surface-3', mix(theme.card, theme.background, 0.35));
    set('--pl-surface-hover', mix(theme.card, theme.text, 0.05));
    set('--pl-track', mix(theme.card, theme.text, 0.08));
    set('--pl-sidebar-bg', theme.sidebar);
    set('--pl-text', theme.text);
    set('--pl-text-2', mix(theme.text, theme.textSecondary, 0.45));
    set('--pl-text-3', theme.textSecondary);
    set('--pl-text-muted', mix(theme.textSecondary, theme.background, 0.25));
    set('--pl-text-faint', mix(theme.textSecondary, theme.background, 0.45));
    set('--pl-text-disabled', mix(theme.textSecondary, theme.background, 0.62));
    set('--pl-border', alpha(theme.text, 0.08));
    set('--pl-border-strong', alpha(theme.text, 0.14));
    set('--pl-scrim', alpha('#000000', claro ? 0.40 : 0.62));

    // Sombras (suaves en claro, profundas en oscuro)
    set('--pl-shadow-card', claro
      ? '0 1px 2px rgba(13,20,18,.04), 0 2px 6px rgba(13,20,18,.04)'
      : '0 1px 2px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.35)');
    set('--pl-shadow-float', claro
      ? '0 6px 20px rgba(13,20,18,.10), 0 2px 6px rgba(13,20,18,.06)'
      : '0 6px 20px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.35)');

    // Hero: gradiente del acento + veils sobre foto, todo derivado del primary
    set('--pl-hero-gradient', `linear-gradient(180deg, ${p} 0%, ${darken(p, 25)} 100%)`);
    set('--pl-hero-veil',
      `linear-gradient(96deg, ${alpha(darken(p, 38), 0.90)} 0%, ${alpha(darken(p, 30), 0.62)} 42%, ` +
      `${alpha(p, 0.18)} 78%, ${alpha(lighten(p, 8), 0.06)} 100%)`);
    set('--pl-hero-fade',
      `linear-gradient(180deg, ${alpha(darken(p, 42), 0.28)} 0%, rgba(0,0,0,0) 30%, ${alpha(darken(p, 42), 0.42)} 100%)`);
    set('--pl-hero-strip',
      `linear-gradient(180deg, ${alpha(darken(p, 45), 0.62)} 0%, ${alpha(darken(p, 45), 0.82)} 100%)`);

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

  // Aplicar la fuente cuando cambia (carga Google Fonts + setea CSS var
  // + setea body.style.fontFamily). Persiste en localStorage del usuario.
  useEffect(() => {
    applyFontFamily(currentFontId);
    if (hydratingRef.current) return;
    localStorage.setItem(userScopedKey(user?.id, 'fontId'), currentFontId);
  }, [currentFontId, user?.id]);

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

  const setFont = (fontId: string) => {
    setCurrentFontId(fontId);
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
        currentFontId,
        setFont,
        presets: selectorPresets,
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
