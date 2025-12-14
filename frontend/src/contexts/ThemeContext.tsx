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
}

export const themes: Record<ThemeName, Theme> = {
  dark: {
    name: 'dark',
    label: 'Oscuro',
    background: '#1a1a2e',
    backgroundSecondary: '#16213e',
    text: '#ffffff',
    textSecondary: '#a0aec0',
    border: '#2d3748',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    card: '#1e293b',
    sidebar: '#0f172a',
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
  },
};

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
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

  // Fallback to dark theme if themeName is invalid
  const theme = themes[themeName] || themes.dark;

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

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme }}>
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
