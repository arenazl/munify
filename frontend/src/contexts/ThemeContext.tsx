import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Get municipio from AuthContext to load its theme config
  const { municipioActual } = useAuth();

  // Estado del preset y variante seleccionados
  const [currentPresetId, setCurrentPresetId] = useState<string>(() => {
    const saved = localStorage.getItem('themePresetId');
    return saved || defaultThemeConfig.presetId;
  });

  const [currentVariant, setCurrentVariant] = useState<ThemeVariant>(() => {
    const saved = localStorage.getItem('themeVariant') as ThemeVariant;
    return saved || defaultThemeConfig.variant;
  });

  // Estados de imágenes de fondo
  const [sidebarBgImage, setSidebarBgImageState] = useState<string | null>(() => {
    const saved = localStorage.getItem('sidebarBgImage');
    return saved && saved !== 'null' ? saved : null;
  });

  const [sidebarBgOpacity, setSidebarBgOpacityState] = useState<number>(() => {
    const saved = localStorage.getItem('sidebarBgOpacity');
    return saved ? parseFloat(saved) : 0.3;
  });

  const [contentBgImage, setContentBgImageState] = useState<string | null>(() => {
    const saved = localStorage.getItem('contentBgImage');
    return saved && saved !== 'null' ? saved : null;
  });

  const [contentBgOpacity, setContentBgOpacityState] = useState<number>(() => {
    const saved = localStorage.getItem('contentBgOpacity');
    return saved ? parseFloat(saved) : 0.1;
  });

  // Cargar configuración del tema desde el municipio cuando cambie
  useEffect(() => {
    if (municipioActual?.tema_config) {
      const config = municipioActual.tema_config;

      // Aplicar preset y variante
      if (config.presetId) setCurrentPresetId(config.presetId);
      if (config.variant) setCurrentVariant(config.variant as ThemeVariant);

      // Aplicar imágenes de fondo
      if (config.sidebarBgImage !== undefined) setSidebarBgImageState(config.sidebarBgImage);
      if (config.sidebarBgOpacity !== undefined) setSidebarBgOpacityState(config.sidebarBgOpacity);
      if (config.contentBgImage !== undefined) setContentBgImageState(config.contentBgImage);
      if (config.contentBgOpacity !== undefined) setContentBgOpacityState(config.contentBgOpacity);
    }
  }, [municipioActual]);

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

  // Guardar preset en localStorage
  useEffect(() => {
    localStorage.setItem('themePresetId', currentPresetId);
  }, [currentPresetId]);

  useEffect(() => {
    localStorage.setItem('themeVariant', currentVariant);
  }, [currentVariant]);

  // Guardar imágenes de fondo en localStorage
  useEffect(() => {
    if (sidebarBgImage) {
      localStorage.setItem('sidebarBgImage', sidebarBgImage);
    } else {
      localStorage.removeItem('sidebarBgImage');
    }
  }, [sidebarBgImage]);

  useEffect(() => {
    localStorage.setItem('sidebarBgOpacity', String(sidebarBgOpacity));
  }, [sidebarBgOpacity]);

  useEffect(() => {
    if (contentBgImage) {
      localStorage.setItem('contentBgImage', contentBgImage);
    } else {
      localStorage.removeItem('contentBgImage');
    }
  }, [contentBgImage]);

  useEffect(() => {
    localStorage.setItem('contentBgOpacity', String(contentBgOpacity));
  }, [contentBgOpacity]);

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
