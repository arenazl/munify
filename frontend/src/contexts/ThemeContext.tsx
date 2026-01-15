import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type ThemeName = 'dark' | 'light' | 'blue' | 'brown' | 'amber';

interface Theme {
  name: ThemeName;
  label: string;
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryHover: string;
  card: string;
  sidebar: string;
  sidebarText: string;
  sidebarTextSecondary: string;
  contentBackground: string;
}

export const themes: Record<ThemeName, Theme> = {
  dark: {
    name: 'dark',
    label: 'Oscuro',
    background: '#000000',
    backgroundSecondary: '#0a0a0a',
    text: '#ffffff',
    textSecondary: '#a0aec0',
    border: '#1a1a1a',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    card: '#111111',
    sidebar: '#000000',
    sidebarText: '#ffffff',
    sidebarTextSecondary: '#94a3b8',
    contentBackground: '#000000',
  },
  light: {
    name: 'light',
    label: 'Claro',
    background: '#f8fafc',
    backgroundSecondary: '#ffffff',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    card: '#ffffff',
    sidebar: '#1e293b',
    sidebarText: '#ffffff',
    sidebarTextSecondary: '#94a3b8',
    contentBackground: '#f1f5f9',
  },
  blue: {
    name: 'blue',
    label: 'Azul',
    background: '#0c1929',
    backgroundSecondary: '#0f2744',
    text: '#e2e8f0',
    textSecondary: '#94a3b8',
    border: '#1e3a5f',
    primary: '#0ea5e9',
    primaryHover: '#0284c7',
    card: '#132f4c',
    sidebar: '#071318',
    sidebarText: '#e2e8f0',
    sidebarTextSecondary: '#64748b',
    contentBackground: '#0c1929',
  },
  brown: {
    name: 'brown',
    label: 'Marrón',
    background: '#1a1512',
    backgroundSecondary: '#231e1a',
    text: '#e8e4e0',
    textSecondary: '#a8a098',
    border: '#3d3530',
    primary: '#a67c52',
    primaryHover: '#8b6642',
    card: '#2a2420',
    sidebar: '#141210',
    sidebarText: '#e8e4e0',
    sidebarTextSecondary: '#8a8078',
    contentBackground: '#1a1512',
  },
  amber: {
    name: 'amber',
    label: 'Ámbar',
    background: '#fefdfb',
    backgroundSecondary: '#fffbf5',
    text: '#44403c',
    textSecondary: '#78716c',
    border: '#e7e0d8',
    primary: '#d97706',
    primaryHover: '#b45309',
    card: '#fffaf3',
    sidebar: '#44403c',
    sidebarText: '#fef3e2',
    sidebarTextSecondary: '#d6d3d1',
    contentBackground: '#fefcf8',
  },
};

// Colores de acento predefinidos
export const accentColors = [
  { name: 'Negro', value: '#374151', hover: '#1f2937' },
  { name: 'Indigo', value: '#4f46e5', hover: '#4338ca' },
  { name: 'Azul', value: '#3b82f6', hover: '#2563eb' },
  { name: 'Celeste', value: '#0ea5e9', hover: '#0284c7' },
  { name: 'Verde', value: '#10b981', hover: '#059669' },
  { name: 'Esmeralda', value: '#22c55e', hover: '#16a34a' },
  { name: 'Marrón', value: '#a67c52', hover: '#8b6642' },
  { name: 'Amarillo', value: '#eab308', hover: '#ca8a04' },
  { name: 'Naranja', value: '#f97316', hover: '#ea580c' },
  { name: 'Rojo', value: '#ef4444', hover: '#dc2626' },
  { name: 'Rosa', value: '#ec4899', hover: '#db2777' },
  { name: 'Violeta', value: '#8b5cf6', hover: '#7c3aed' },
];

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  customPrimary: string | null;
  setCustomPrimary: (color: string | null) => void;
  customSidebar: string | null;
  setCustomSidebar: (color: string | null) => void;
  customSidebarText: string | null;
  setCustomSidebarText: (color: string | null) => void;
  sidebarBgImage: string | null;
  setSidebarBgImage: (url: string | null) => void;
  sidebarBgOpacity: number;
  setSidebarBgOpacity: (opacity: number) => void;
  contentBgImage: string | null;
  setContentBgImage: (url: string | null) => void;
  contentBgOpacity: number;
  setContentBgOpacity: (opacity: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Get municipio from AuthContext to load its theme config
  const { municipioActual } = useAuth();

  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('theme');
    // Validate that saved theme exists in themes object
    if (saved && saved in themes) {
      return saved as ThemeName;
    }
    return 'dark';
  });

  const [customPrimary, setCustomPrimaryState] = useState<string | null>(() => {
    return localStorage.getItem('customPrimary');
  });

  const [customSidebar, setCustomSidebarState] = useState<string | null>(() => {
    return localStorage.getItem('customSidebar');
  });

  const [customSidebarText, setCustomSidebarTextState] = useState<string | null>(() => {
    return localStorage.getItem('customSidebarText');
  });

  const [sidebarBgImage, setSidebarBgImageState] = useState<string | null>(() => {
    const saved = localStorage.getItem('sidebarBgImage');
    // Solo usar si explícitamente se guardó un valor
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

  // Cargar configuración del tema desde el municipio al montar o cuando cambie
  useEffect(() => {
    if (municipioActual?.tema_config) {
      const config = municipioActual.tema_config;

      // Aplicar tema base si está definido
      if (config.theme && config.theme in themes) {
        setThemeName(config.theme as ThemeName);
      }

      // Aplicar colores personalizados
      if (config.customPrimary) setCustomPrimaryState(config.customPrimary);
      if (config.customSidebar) setCustomSidebarState(config.customSidebar);
      if (config.customSidebarText) setCustomSidebarTextState(config.customSidebarText);

      // Aplicar imágenes de fondo
      if (config.sidebarBgImage !== undefined) setSidebarBgImageState(config.sidebarBgImage);
      if (config.sidebarBgOpacity !== undefined) setSidebarBgOpacityState(config.sidebarBgOpacity);
      if (config.contentBgImage !== undefined) setContentBgImageState(config.contentBgImage);
      if (config.contentBgOpacity !== undefined) setContentBgOpacityState(config.contentBgOpacity);
    }
  }, [municipioActual]);

  // Fallback to dark theme if themeName is invalid
  const baseTheme = themes[themeName] || themes.dark;

  // Función para detectar si un color es claro u oscuro
  const isLightColor = (color: string): boolean => {
    // Convertir hex a RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Calcular luminancia (fórmula estándar)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Umbral más bajo (0.35) para detectar colores medianos como claros
    return luminance > 0.35;
  };

  // Aplicar color de acento personalizado si existe
  let theme: Theme = customPrimary
    ? {
        ...baseTheme,
        primary: customPrimary,
        primaryHover: accentColors.find(c => c.value === customPrimary)?.hover || customPrimary,
      }
    : baseTheme;

  // Aplicar color de sidebar personalizado si existe, sino usar el del tema base
  const sidebarColor = customSidebar || theme.sidebar;

  // Determinar colores de texto del sidebar (personalizado o del tema base)
  const sidebarTextColor = customSidebarText || baseTheme.sidebarText;
  // Para el secundario, derivar del principal
  const sidebarTextSecondaryColor = customSidebarText === '#ffffff' ? '#94a3b8' :
                                     customSidebarText === '#1e293b' ? '#64748b' :
                                     customSidebarText === '#6b7280' ? '#9ca3af' :
                                     baseTheme.sidebarTextSecondary;

  theme = {
    ...theme,
    sidebar: sidebarColor,
    sidebarText: sidebarTextColor,
    sidebarTextSecondary: sidebarTextSecondaryColor,
  };

  useEffect(() => {
    localStorage.setItem('theme', themeName);

    // Aplicar CSS variables al :root
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
  }, [theme, themeName]);

  useEffect(() => {
    if (customPrimary) {
      localStorage.setItem('customPrimary', customPrimary);
    } else {
      localStorage.removeItem('customPrimary');
    }
  }, [customPrimary]);

  useEffect(() => {
    if (customSidebar) {
      localStorage.setItem('customSidebar', customSidebar);
    } else {
      localStorage.removeItem('customSidebar');
    }
  }, [customSidebar]);

  useEffect(() => {
    if (customSidebarText) {
      localStorage.setItem('customSidebarText', customSidebarText);
    } else {
      localStorage.removeItem('customSidebarText');
    }
  }, [customSidebarText]);

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

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
  };

  const setCustomPrimary = (color: string | null) => {
    setCustomPrimaryState(color);
  };

  const setCustomSidebar = (color: string | null) => {
    setCustomSidebarState(color);
  };

  const setCustomSidebarText = (color: string | null) => {
    setCustomSidebarTextState(color);
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
    <ThemeContext.Provider value={{
      theme,
      themeName,
      setTheme,
      customPrimary,
      setCustomPrimary,
      customSidebar,
      setCustomSidebar,
      customSidebarText,
      setCustomSidebarText,
      sidebarBgImage,
      setSidebarBgImage,
      sidebarBgOpacity,
      setSidebarBgOpacity,
      contentBgImage,
      setContentBgImage,
      contentBgOpacity,
      setContentBgOpacity
    }}>
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
