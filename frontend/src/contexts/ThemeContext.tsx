import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeName = 'dark' | 'light' | 'blue' | 'green';

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
  green: {
    name: 'green',
    label: 'Verde',
    background: '#0d1f17',
    backgroundSecondary: '#122a1e',
    text: '#e2e8f0',
    textSecondary: '#94a3b8',
    border: '#1e4d3a',
    primary: '#10b981',
    primaryHover: '#059669',
    card: '#1a3a2a',
    sidebar: '#081410',
    sidebarText: '#e2e8f0',
    sidebarTextSecondary: '#64748b',
    contentBackground: '#0d1f17',
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
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
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

  // Fallback to dark theme if themeName is invalid
  const baseTheme = themes[themeName] || themes.dark;

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

  theme = {
    ...theme,
    sidebar: sidebarColor,
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

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
  };

  const setCustomPrimary = (color: string | null) => {
    setCustomPrimaryState(color);
  };

  const setCustomSidebar = (color: string | null) => {
    setCustomSidebarState(color);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, customPrimary, setCustomPrimary, customSidebar, setCustomSidebar }}>
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
