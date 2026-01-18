/**
 * Sistema de Temas Predefinidos - Munify
 *
 * 10 paletas de colores inspiradas en colorhunt.co
 * Cada tema tiene 3 variantes: clásico, vintage, vibrante
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

// Función auxiliar para generar las 3 variantes de un tema
function generateVariants(
  palette: [string, string, string, string],
  config: {
    clasico: { bgIndex: number; sidebarIndex: number; primaryIndex: number; textLight: boolean };
    vintage: { bgIndex: number; sidebarIndex: number; primaryIndex: number; textLight: boolean };
    vibrante: { bgIndex: number; sidebarIndex: number; primaryIndex: number; textLight: boolean };
  }
): ThemePreset['variants'] {
  const generateColors = (
    bgIndex: number,
    sidebarIndex: number,
    primaryIndex: number,
    textLight: boolean
  ): ThemeColors => {
    const bg = palette[bgIndex];
    const sidebar = palette[sidebarIndex];
    const primary = palette[primaryIndex];

    // Calcular colores derivados
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

    return {
      background: bg,
      backgroundSecondary: textLight ? lighten(bg, 5) : darken(bg, 5),
      contentBackground: bg,
      card: textLight ? lighten(bg, 8) : darken(bg, 3),
      sidebar: sidebar,
      sidebarText: textLight ? '#ffffff' : '#1e293b',
      sidebarTextSecondary: textLight ? '#94a3b8' : '#64748b',
      text: textLight ? '#ffffff' : '#1e293b',
      textSecondary: textLight ? '#94a3b8' : '#64748b',
      primary: primary,
      primaryHover: darken(primary, 15),
      primaryText: isLightColor(primary) ? '#1e293b' : '#ffffff',
      border: textLight ? mixColors(bg, '#ffffff', 0.15) : mixColors(bg, '#000000', 0.1),
    };
  };

  return {
    clasico: generateColors(
      config.clasico.bgIndex,
      config.clasico.sidebarIndex,
      config.clasico.primaryIndex,
      config.clasico.textLight
    ),
    vintage: generateColors(
      config.vintage.bgIndex,
      config.vintage.sidebarIndex,
      config.vintage.primaryIndex,
      config.vintage.textLight
    ),
    vibrante: generateColors(
      config.vibrante.bgIndex,
      config.vibrante.sidebarIndex,
      config.vibrante.primaryIndex,
      config.vibrante.textLight
    ),
  };
}

// 10 Temas predefinidos inspirados en colorhunt.co
export const themePresets: ThemePreset[] = [
  // 1. Midnight Blue - Elegante y profesional
  {
    id: 'midnight',
    name: 'Midnight',
    palette: ['#0a0f1a', '#1a2744', '#3b82f6', '#60a5fa'],
    variants: {
      clasico: {
        background: '#0a0f1a',
        backgroundSecondary: '#0f1526',
        contentBackground: '#0a0f1a',
        card: '#111827',
        sidebar: '#1a2744',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#ffffff',
        textSecondary: '#94a3b8',
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryText: '#ffffff',
        border: '#1e3a5f',
      },
      vintage: {
        background: '#1a2744',
        backgroundSecondary: '#1e2d4f',
        contentBackground: '#1a2744',
        card: '#1e3a5f',
        sidebar: '#0a0f1a',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#e2e8f0',
        textSecondary: '#94a3b8',
        primary: '#60a5fa',
        primaryHover: '#3b82f6',
        primaryText: '#1e293b',
        border: '#2d4a6f',
      },
      vibrante: {
        background: '#0a0f1a',
        backgroundSecondary: '#0f1526',
        contentBackground: '#0a0f1a',
        card: '#111827',
        sidebar: '#1a2744',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#ffffff',
        textSecondary: '#94a3b8',
        primary: '#60a5fa',
        primaryHover: '#3b82f6',
        primaryText: '#1e293b',
        border: '#1e3a5f',
      },
    },
  },

  // 2. Forest - Verde naturaleza
  {
    id: 'forest',
    name: 'Forest',
    palette: ['#0d1f12', '#1a3d22', '#22c55e', '#86efac'],
    variants: {
      clasico: {
        background: '#0d1f12',
        backgroundSecondary: '#112818',
        contentBackground: '#0d1f12',
        card: '#14301a',
        sidebar: '#1a3d22',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#86efac',
        text: '#ffffff',
        textSecondary: '#86efac',
        primary: '#22c55e',
        primaryHover: '#16a34a',
        primaryText: '#1e293b',
        border: '#1f4528',
      },
      vintage: {
        background: '#1a3d22',
        backgroundSecondary: '#1e4528',
        contentBackground: '#1a3d22',
        card: '#224d2c',
        sidebar: '#0d1f12',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#86efac',
        text: '#e2e8e4',
        textSecondary: '#86efac',
        primary: '#86efac',
        primaryHover: '#22c55e',
        primaryText: '#1e293b',
        border: '#2d5f38',
      },
      vibrante: {
        background: '#0d1f12',
        backgroundSecondary: '#112818',
        contentBackground: '#0d1f12',
        card: '#14301a',
        sidebar: '#1a3d22',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#86efac',
        text: '#ffffff',
        textSecondary: '#86efac',
        primary: '#86efac',
        primaryHover: '#22c55e',
        primaryText: '#1e293b',
        border: '#1f4528',
      },
    },
  },

  // 3. Sunset - Cálido naranja/rojo
  {
    id: 'sunset',
    name: 'Sunset',
    palette: ['#1a0f0a', '#3d1f12', '#f97316', '#fdba74'],
    variants: {
      clasico: {
        background: '#1a0f0a',
        backgroundSecondary: '#1f1410',
        contentBackground: '#1a0f0a',
        card: '#261812',
        sidebar: '#3d1f12',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#fdba74',
        text: '#ffffff',
        textSecondary: '#fdba74',
        primary: '#f97316',
        primaryHover: '#ea580c',
        primaryText: '#1e293b',
        border: '#4d2818',
      },
      vintage: {
        background: '#3d1f12',
        backgroundSecondary: '#4a2616',
        contentBackground: '#3d1f12',
        card: '#572d1a',
        sidebar: '#1a0f0a',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#fdba74',
        text: '#fef3e2',
        textSecondary: '#fdba74',
        primary: '#fdba74',
        primaryHover: '#f97316',
        primaryText: '#1e293b',
        border: '#6d3d20',
      },
      vibrante: {
        background: '#1a0f0a',
        backgroundSecondary: '#1f1410',
        contentBackground: '#1a0f0a',
        card: '#261812',
        sidebar: '#3d1f12',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#fdba74',
        text: '#ffffff',
        textSecondary: '#fdba74',
        primary: '#fdba74',
        primaryHover: '#f97316',
        primaryText: '#1e293b',
        border: '#4d2818',
      },
    },
  },

  // 4. Ocean - Azul marino profundo
  {
    id: 'ocean',
    name: 'Ocean',
    palette: ['#0c1929', '#132f4c', '#0ea5e9', '#7dd3fc'],
    variants: {
      clasico: {
        background: '#0c1929',
        backgroundSecondary: '#0f2038',
        contentBackground: '#0c1929',
        card: '#132f4c',
        sidebar: '#071318',
        sidebarText: '#e2e8f0',
        sidebarTextSecondary: '#7dd3fc',
        text: '#e2e8f0',
        textSecondary: '#94a3b8',
        primary: '#0ea5e9',
        primaryHover: '#0284c7',
        primaryText: '#1e293b',
        border: '#1e3a5f',
      },
      vintage: {
        background: '#132f4c',
        backgroundSecondary: '#183858',
        contentBackground: '#132f4c',
        card: '#1e4060',
        sidebar: '#0c1929',
        sidebarText: '#e2e8f0',
        sidebarTextSecondary: '#7dd3fc',
        text: '#e2e8f0',
        textSecondary: '#7dd3fc',
        primary: '#7dd3fc',
        primaryHover: '#0ea5e9',
        primaryText: '#1e293b',
        border: '#2d5070',
      },
      vibrante: {
        background: '#0c1929',
        backgroundSecondary: '#0f2038',
        contentBackground: '#0c1929',
        card: '#132f4c',
        sidebar: '#132f4c',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#7dd3fc',
        text: '#e2e8f0',
        textSecondary: '#94a3b8',
        primary: '#7dd3fc',
        primaryHover: '#0ea5e9',
        primaryText: '#1e293b',
        border: '#1e3a5f',
      },
    },
  },

  // 5. Lavender - Púrpura suave
  {
    id: 'lavender',
    name: 'Lavender',
    palette: ['#1a0f2e', '#2d1b4e', '#a855f7', '#d8b4fe'],
    variants: {
      clasico: {
        background: '#1a0f2e',
        backgroundSecondary: '#1f1438',
        contentBackground: '#1a0f2e',
        card: '#251a42',
        sidebar: '#2d1b4e',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#d8b4fe',
        text: '#ffffff',
        textSecondary: '#d8b4fe',
        primary: '#a855f7',
        primaryHover: '#9333ea',
        primaryText: '#1e293b',
        border: '#3d2660',
      },
      vintage: {
        background: '#2d1b4e',
        backgroundSecondary: '#36215c',
        contentBackground: '#2d1b4e',
        card: '#3f286a',
        sidebar: '#1a0f2e',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#d8b4fe',
        text: '#f3e8ff',
        textSecondary: '#d8b4fe',
        primary: '#d8b4fe',
        primaryHover: '#a855f7',
        primaryText: '#1e293b',
        border: '#4f3578',
      },
      vibrante: {
        background: '#1a0f2e',
        backgroundSecondary: '#1f1438',
        contentBackground: '#1a0f2e',
        card: '#251a42',
        sidebar: '#2d1b4e',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#d8b4fe',
        text: '#ffffff',
        textSecondary: '#d8b4fe',
        primary: '#d8b4fe',
        primaryHover: '#a855f7',
        primaryText: '#1e293b',
        border: '#3d2660',
      },
    },
  },

  // 6. Rose - Rosa elegante
  {
    id: 'rose',
    name: 'Rose',
    palette: ['#1f0a14', '#3d1428', '#ec4899', '#f9a8d4'],
    variants: {
      clasico: {
        background: '#1f0a14',
        backgroundSecondary: '#280e1a',
        contentBackground: '#1f0a14',
        card: '#301220',
        sidebar: '#3d1428',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#f9a8d4',
        text: '#ffffff',
        textSecondary: '#f9a8d4',
        primary: '#ec4899',
        primaryHover: '#db2777',
        primaryText: '#1e293b',
        border: '#4d1a32',
      },
      vintage: {
        background: '#3d1428',
        backgroundSecondary: '#4a1830',
        contentBackground: '#3d1428',
        card: '#571c38',
        sidebar: '#1f0a14',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#f9a8d4',
        text: '#fdf2f8',
        textSecondary: '#f9a8d4',
        primary: '#f9a8d4',
        primaryHover: '#ec4899',
        primaryText: '#1e293b',
        border: '#6d2242',
      },
      vibrante: {
        background: '#1f0a14',
        backgroundSecondary: '#280e1a',
        contentBackground: '#1f0a14',
        card: '#301220',
        sidebar: '#3d1428',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#f9a8d4',
        text: '#ffffff',
        textSecondary: '#f9a8d4',
        primary: '#f9a8d4',
        primaryHover: '#ec4899',
        primaryText: '#1e293b',
        border: '#4d1a32',
      },
    },
  },

  // 7. Sand - Beige/Arena cálido (tema claro)
  {
    id: 'sand',
    name: 'Sand',
    palette: ['#f5f0e8', '#e8e0d5', '#a67c52', '#8b6642'],
    variants: {
      clasico: {
        background: '#f5f0e8',
        backgroundSecondary: '#ebe4d8',
        contentBackground: '#f0e9df',
        card: '#faf6ef',
        sidebar: '#3d3731',
        sidebarText: '#fef3e2',
        sidebarTextSecondary: '#d6d3d1',
        text: '#3d3731',
        textSecondary: '#6b635a',
        primary: '#a67c52',
        primaryHover: '#8b6642',
        primaryText: '#1e293b',
        border: '#d4c9b8',
      },
      vintage: {
        background: '#e8e0d5',
        backgroundSecondary: '#dfd6c8',
        contentBackground: '#e8e0d5',
        card: '#f0e9df',
        sidebar: '#4a423a',
        sidebarText: '#fef3e2',
        sidebarTextSecondary: '#d6d3d1',
        text: '#3d3731',
        textSecondary: '#6b635a',
        primary: '#8b6642',
        primaryHover: '#725436',
        primaryText: '#ffffff',
        border: '#c9bda8',
      },
      vibrante: {
        background: '#f5f0e8',
        backgroundSecondary: '#ebe4d8',
        contentBackground: '#f0e9df',
        card: '#faf6ef',
        sidebar: '#e8e0d5',
        sidebarText: '#3d3731',
        sidebarTextSecondary: '#6b635a',
        text: '#3d3731',
        textSecondary: '#6b635a',
        primary: '#8b6642',
        primaryHover: '#725436',
        primaryText: '#ffffff',
        border: '#d4c9b8',
      },
    },
  },

  // 8. Arctic - Gris azulado frío (tema claro)
  {
    id: 'arctic',
    name: 'Arctic',
    palette: ['#f1f5f9', '#e2e8f0', '#3b82f6', '#1e40af'],
    variants: {
      clasico: {
        background: '#f8fafc',
        backgroundSecondary: '#f1f5f9',
        contentBackground: '#f1f5f9',
        card: '#ffffff',
        sidebar: '#1e293b',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#1e293b',
        textSecondary: '#64748b',
        primary: '#3b82f6',
        primaryHover: '#2563eb',
        primaryText: '#ffffff',
        border: '#e2e8f0',
      },
      vintage: {
        background: '#e2e8f0',
        backgroundSecondary: '#d8e0ea',
        contentBackground: '#e2e8f0',
        card: '#f1f5f9',
        sidebar: '#2d3a4f',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#1e293b',
        textSecondary: '#64748b',
        primary: '#1e40af',
        primaryHover: '#1e3a8a',
        primaryText: '#ffffff',
        border: '#cbd5e1',
      },
      vibrante: {
        background: '#f8fafc',
        backgroundSecondary: '#f1f5f9',
        contentBackground: '#f1f5f9',
        card: '#ffffff',
        sidebar: '#e2e8f0',
        sidebarText: '#1e293b',
        sidebarTextSecondary: '#64748b',
        text: '#1e293b',
        textSecondary: '#64748b',
        primary: '#1e40af',
        primaryHover: '#1e3a8a',
        primaryText: '#ffffff',
        border: '#e2e8f0',
      },
    },
  },

  // 9. Slate - Gris neutro oscuro
  {
    id: 'slate',
    name: 'Slate',
    palette: ['#0f172a', '#1e293b', '#64748b', '#94a3b8'],
    variants: {
      clasico: {
        background: '#0f172a',
        backgroundSecondary: '#141c30',
        contentBackground: '#0f172a',
        card: '#1e293b',
        sidebar: '#020617',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#f8fafc',
        textSecondary: '#94a3b8',
        primary: '#64748b',
        primaryHover: '#475569',
        primaryText: '#ffffff',
        border: '#334155',
      },
      vintage: {
        background: '#1e293b',
        backgroundSecondary: '#253244',
        contentBackground: '#1e293b',
        card: '#334155',
        sidebar: '#0f172a',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#f1f5f9',
        textSecondary: '#94a3b8',
        primary: '#94a3b8',
        primaryHover: '#64748b',
        primaryText: '#1e293b',
        border: '#475569',
      },
      vibrante: {
        background: '#0f172a',
        backgroundSecondary: '#141c30',
        contentBackground: '#0f172a',
        card: '#1e293b',
        sidebar: '#1e293b',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#94a3b8',
        text: '#f8fafc',
        textSecondary: '#94a3b8',
        primary: '#94a3b8',
        primaryHover: '#64748b',
        primaryText: '#1e293b',
        border: '#334155',
      },
    },
  },

  // 10. Monochrome - Escala de grises pura (sidebar gris oscuro)
  {
    id: 'monochrome',
    name: 'Monochrome',
    palette: ['#000000', '#1a1a1a', '#666666', '#ffffff'],
    variants: {
      clasico: {
        background: '#000000',
        backgroundSecondary: '#0d0d0d',
        contentBackground: '#000000',
        card: '#1a1a1a',
        sidebar: '#1a1a1a',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#666666',
        text: '#ffffff',
        textSecondary: '#666666',
        primary: '#666666',
        primaryHover: '#555555',
        primaryText: '#ffffff',
        border: '#1a1a1a',
      },
      vintage: {
        background: '#1a1a1a',
        backgroundSecondary: '#222222',
        contentBackground: '#1a1a1a',
        card: '#2a2a2a',
        sidebar: '#000000',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#666666',
        text: '#ffffff',
        textSecondary: '#666666',
        primary: '#666666',
        primaryHover: '#555555',
        primaryText: '#ffffff',
        border: '#333333',
      },
      vibrante: {
        background: '#000000',
        backgroundSecondary: '#0d0d0d',
        contentBackground: '#000000',
        card: '#1a1a1a',
        sidebar: '#666666',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#e0e0e0',
        text: '#ffffff',
        textSecondary: '#666666',
        primary: '#ffffff',
        primaryHover: '#e0e0e0',
        primaryText: '#1e293b',
        border: '#1a1a1a',
      },
    },
  },

  // 11. Ember - Tonos carbón cálidos
  {
    id: 'ember',
    name: 'Ember',
    palette: ['#1c1917', '#292524', '#dc2626', '#fca5a5'],
    variants: {
      clasico: {
        background: '#1c1917',
        backgroundSecondary: '#292524',
        contentBackground: '#1c1917',
        card: '#292524',
        sidebar: '#292524',
        sidebarText: '#fca5a5',
        sidebarTextSecondary: '#a8a29e',
        text: '#fafaf9',
        textSecondary: '#a8a29e',
        primary: '#dc2626',
        primaryHover: '#b91c1c',
        primaryText: '#ffffff',
        border: '#44403c',
      },
      vintage: {
        background: '#292524',
        backgroundSecondary: '#353230',
        contentBackground: '#292524',
        card: '#44403c',
        sidebar: '#1c1917',
        sidebarText: '#fca5a5',
        sidebarTextSecondary: '#a8a29e',
        text: '#fafaf9',
        textSecondary: '#a8a29e',
        primary: '#fca5a5',
        primaryHover: '#f87171',
        primaryText: '#1e293b',
        border: '#57534e',
      },
      vibrante: {
        background: '#1c1917',
        backgroundSecondary: '#292524',
        contentBackground: '#1c1917',
        card: '#292524',
        sidebar: '#dc2626',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#fecaca',
        text: '#fafaf9',
        textSecondary: '#a8a29e',
        primary: '#fca5a5',
        primaryHover: '#f87171',
        primaryText: '#1e293b',
        border: '#44403c',
      },
    },
  },

  // 12. Graphite - Gris grafito profesional (sidebar gris claro)
  {
    id: 'graphite',
    name: 'Graphite',
    palette: ['#18181b', '#27272a', '#52525b', '#a1a1aa'],
    variants: {
      clasico: {
        background: '#18181b',
        backgroundSecondary: '#27272a',
        contentBackground: '#18181b',
        card: '#27272a',
        sidebar: '#52525b',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#a1a1aa',
        text: '#e4e4e7',
        textSecondary: '#a1a1aa',
        primary: '#a1a1aa',
        primaryHover: '#71717a',
        primaryText: '#1e293b',
        border: '#3f3f46',
      },
      vintage: {
        background: '#27272a',
        backgroundSecondary: '#3f3f46',
        contentBackground: '#27272a',
        card: '#3f3f46',
        sidebar: '#71717a',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#d4d4d8',
        text: '#e4e4e7',
        textSecondary: '#a1a1aa',
        primary: '#a1a1aa',
        primaryHover: '#71717a',
        primaryText: '#1e293b',
        border: '#52525b',
      },
      vibrante: {
        background: '#18181b',
        backgroundSecondary: '#27272a',
        contentBackground: '#18181b',
        card: '#27272a',
        sidebar: '#52525b',
        sidebarText: '#ffffff',
        sidebarTextSecondary: '#d4d4d8',
        text: '#e4e4e7',
        textSecondary: '#a1a1aa',
        primary: '#a1a1aa',
        primaryHover: '#71717a',
        primaryText: '#1e293b',
        border: '#3f3f46',
      },
    },
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
