export interface Theme {
  background: string;
  backgroundSecondary: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryHover: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export const darkTheme: Theme = {
  background: '#0f0f1a',
  backgroundSecondary: '#1a1a2e',
  card: '#16213e',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  border: '#334155',
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

export const lightTheme: Theme = {
  background: '#f8fafc',
  backgroundSecondary: '#f1f5f9',
  card: '#ffffff',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 30,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
};
