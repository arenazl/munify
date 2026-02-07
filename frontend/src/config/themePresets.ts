/**
 * Sistema de Temas Predefinidos - Munify
 *
 * 12 paletas de colores inspiradas en colorhunt.co
 * Cada tema tiene 3 variantes: clásico, vintage, vibrante
 * TODAS las variantes se generan automáticamente con generateVariants()
 */

export type ThemeVariant = 'clasico' | 'vintage' | 'vibrante';


export interface ThemePreset {
  id: string;
  name: string;
  // Colores de la paleta (4 colores como en colorhunt.co)
  palette: [string, string, string, string];
  variants: {
    clasico: ThemeColors;
    vintage: ThemeColors;
    vibrante: ThemeColors;
  };
}

export interface ThemeColors {
  // Fondos
  background: string;
  backgroundSecondary: string;
  contentBackground: string;
  card: string;

  // Sidebar
  sidebar: string;
  sidebarText: string;
  sidebarTextSecondary: string;

  // Textos
  text: string;
  textSecondary: string;

  // Acento/Primary
  primary: string;
  primaryHover: string;
  primaryText: string; // Color de texto sobre el primary (blanco o negro según contraste)

  // Bordes
  border: string;
}

// Funciones auxiliares de color
const darken = (hex: string, percent: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
  const B = Math.max(0, (num & 0x0000ff) - amt);
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
};

const lighten = (hex: string, percent: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
};

const mixColors = (hex1: string, hex2: string, ratio: number): string => {
  const num1 = parseInt(hex1.replace('#', ''), 16);
  const num2 = parseInt(hex2.replace('#', ''), 16);
  const R = Math.round((num1 >> 16) * (1 - ratio) + (num2 >> 16) * ratio);
  const G = Math.round(((num1 >> 8) & 0x00ff) * (1 - ratio) + ((num2 >> 8) & 0x00ff) * ratio);
  const B = Math.round((num1 & 0x0000ff) * (1 - ratio) + (num2 & 0x0000ff) * ratio);
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
};

// Calcular si un color es claro u oscuro (para determinar texto sobre primary)
const isLightColor = (hex: string): boolean => {
  const num = parseInt(hex.replace('#', ''), 16);
  const R = num >> 16;
  const G = (num >> 8) & 0x00ff;
  const B = num & 0x0000ff;
  // Fórmula de luminancia relativa
  const luminance = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
  return luminance > 0.5;
};

// Función para generar colores de una variante
function generateColors(
  palette: [string, string, string, string],
  bgIndex: number,
  sidebarIndex: number,
  primaryIndex: number
): ThemeColors {
  const bg = palette[bgIndex];
  const sidebar = palette[sidebarIndex];
  const primary = palette[primaryIndex];

  // Determinar si el fondo es claro u oscuro
  const bgIsLight = isLightColor(bg);
  const sidebarIsLight = isLightColor(sidebar);

  return {
    background: bg,
    backgroundSecondary: bgIsLight ? darken(bg, 3) : lighten(bg, 3),
    contentBackground: bg,
    card: bgIsLight ? lighten(bg, 5) : lighten(bg, 5),
    sidebar: sidebar,
    sidebarText: sidebarIsLight ? '#1e293b' : '#ffffff',
    sidebarTextSecondary: sidebarIsLight ? '#475569' : '#94a3b8',
    text: bgIsLight ? '#1e293b' : '#ffffff',
    textSecondary: bgIsLight ? '#475569' : '#94a3b8',
    primary: primary,
    primaryHover: darken(primary, 12),
    primaryText: isLightColor(primary) ? '#1e293b' : '#ffffff',
    border: bgIsLight ? darken(bg, 10) : lighten(bg, 10),
  };
}

// Función auxiliar para generar las 3 variantes de un tema
interface VariantConfig {
  bgIndex: number;
  sidebarIndex: number;
  primaryIndex: number;
}

function generateVariants(
  palette: [string, string, string, string],
  config: {
    clasico: VariantConfig;
    vintage: VariantConfig;
    vibrante: VariantConfig;
  }
): ThemePreset['variants'] {
  return {
    clasico: generateColors(palette, config.clasico.bgIndex, config.clasico.sidebarIndex, config.clasico.primaryIndex),
    vintage: generateColors(palette, config.vintage.bgIndex, config.vintage.sidebarIndex, config.vintage.primaryIndex),
    vibrante: generateColors(palette, config.vibrante.bgIndex, config.vibrante.sidebarIndex, config.vibrante.primaryIndex),
  };
}

// 12 Temas predefinidos - TODOS usando generateVariants()
export const themePresets: ThemePreset[] = [
  // 1. Midnight Blue - Elegante y profesional
  {
    id: 'midnight',
    name: 'Midnight',
    palette: ['#0a0f1a', '#1a2744', '#3b82f6', '#60a5fa'],
    variants: generateVariants(['#0a0f1a', '#1a2744', '#3b82f6', '#60a5fa'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 2. Forest - Verde naturaleza
  {
    id: 'forest',
    name: 'Forest',
    palette: ['#0d1f12', '#1a3d22', '#22c55e', '#86efac'],
    variants: generateVariants(['#0d1f12', '#1a3d22', '#22c55e', '#86efac'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 3. Sunset - Cálido naranja/rojo
  {
    id: 'sunset',
    name: 'Sunset',
    palette: ['#1a0f0a', '#3d1f12', '#f97316', '#fdba74'],
    variants: generateVariants(['#1a0f0a', '#3d1f12', '#f97316', '#fdba74'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 4. Ocean - Azul marino profundo
  {
    id: 'ocean',
    name: 'Ocean',
    palette: ['#0c1929', '#132f4c', '#0ea5e9', '#7dd3fc'],
    variants: generateVariants(['#0c1929', '#132f4c', '#0ea5e9', '#7dd3fc'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 5. Lavender - Púrpura suave
  {
    id: 'lavender',
    name: 'Lavender',
    palette: ['#1a0f2e', '#2d1b4e', '#a855f7', '#d8b4fe'],
    variants: generateVariants(['#1a0f2e', '#2d1b4e', '#a855f7', '#d8b4fe'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 6. Rose - Rosa elegante
  {
    id: 'rose',
    name: 'Rose',
    palette: ['#1f0a14', '#3d1428', '#ec4899', '#f9a8d4'],
    variants: generateVariants(['#1f0a14', '#3d1428', '#ec4899', '#f9a8d4'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 7. Sand - Beige/Arena cálido (tema claro)
  {
    id: 'sand',
    name: 'Sand',
    palette: ['#f5f0e8', '#e8e0d5', '#a67c52', '#8b6642'],
    variants: generateVariants(['#f5f0e8', '#e8e0d5', '#a67c52', '#8b6642'], {
      clasico: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 2 },  // Sidebar oscuro para contraste
      vintage: { bgIndex: 1, sidebarIndex: 3, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },  // Sidebar claro
    }),
  },

  // 8. Arctic - Gris azulado frío (tema claro)
  {
    id: 'arctic',
    name: 'Arctic',
    palette: ['#f8fafc', '#e2e8f0', '#3b82f6', '#1e40af'],
    variants: generateVariants(['#f8fafc', '#e2e8f0', '#3b82f6', '#1e40af'], {
      clasico: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 2 },  // Sidebar azul oscuro
      vintage: { bgIndex: 1, sidebarIndex: 3, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },  // Sidebar gris claro
    }),
  },

  // 9. Slate - Gris neutro oscuro
  {
    id: 'slate',
    name: 'Slate',
    palette: ['#0f172a', '#1e293b', '#64748b', '#94a3b8'],
    variants: generateVariants(['#0f172a', '#1e293b', '#64748b', '#94a3b8'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 10. Monochrome - Escala de grises pura
  {
    id: 'monochrome',
    name: 'Monochrome',
    palette: ['#0a0a0a', '#1a1a1a', '#666666', '#e0e0e0'],
    variants: generateVariants(['#0a0a0a', '#1a1a1a', '#666666', '#e0e0e0'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 2 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // 11. Ember - Tonos carbón cálidos con rojo
  {
    id: 'ember',
    name: 'Ember',
    palette: ['#1c1917', '#292524', '#dc2626', '#fca5a5'],
    variants: generateVariants(['#1c1917', '#292524', '#dc2626', '#fca5a5'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },  // Sidebar rojo
    }),
  },

  // 12. Graphite - Gris grafito profesional
  {
    id: 'graphite',
    name: 'Graphite',
    palette: ['#18181b', '#27272a', '#52525b', '#a1a1aa'],
    variants: generateVariants(['#18181b', '#27272a', '#52525b', '#a1a1aa'], {
      clasico: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
      vintage: { bgIndex: 1, sidebarIndex: 2, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // 13. MindfulSpace - Neumorphic pastel (tema claro)
  {
    id: 'mindful',
    name: 'MindfulSpace',
    palette: ['#E8EEF5', '#c5ccd6', '#34d399', '#22d3ee'],
    variants: generateVariants(['#E8EEF5', '#c5ccd6', '#34d399', '#22d3ee'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // 14. Sales CRM - Profesional azul/verde (tema claro)
  {
    id: 'salescrm',
    name: 'Sales CRM',
    palette: ['#f1f5f9', '#1e3a5f', '#2563eb', '#16a34a'],
    variants: generateVariants(['#f1f5f9', '#1e3a5f', '#2563eb', '#16a34a'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // 15. AI Writer - Minimal neutral + AI black + blue accent (tema claro)
  {
    id: 'aiwriter',
    name: 'AI Writer',
    palette: ['#F5F5F5', '#E5E5E5', '#18181B', '#3B82F6'],
    variants: generateVariants(['#F5F5F5', '#E5E5E5', '#18181B', '#3B82F6'], {
      clasico: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },  // Fondo neutral, sidebar AI black, acento blue
      vintage: { bgIndex: 1, sidebarIndex: 2, primaryIndex: 3 },  // Fondo gris, sidebar AI black
      vibrante: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 2 },  // Sidebar blue, acento black
    }),
  },
];

// Helper para obtener un tema por ID y variante
export function getThemeColors(presetId: string, variant: ThemeVariant): ThemeColors | null {
  const preset = themePresets.find(p => p.id === presetId);
  if (!preset) return null;
  return preset.variants[variant];
}

// Helper para obtener todos los presets como opciones
export function getPresetOptions() {
  return themePresets.map(preset => ({
    id: preset.id,
    name: preset.name,
    palette: preset.palette,
  }));
}

// Configuración por defecto
export const defaultThemeConfig = {
  presetId: 'graphite',
  variant: 'clasico' as ThemeVariant,
};
