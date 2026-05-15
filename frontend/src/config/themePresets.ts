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
  /** Familia del tema: 'light' (suaves), 'azul' (SaaS modernos), 'dark' (carbón VS Code) */
  family?: 'light' | 'azul' | 'dark';
  /** Si true, el tema NO aparece en el selector pero sigue funcionando
   * si algun usuario lo tiene guardado en localStorage. Se usa para
   * desactivar gradualmente la coleccion vieja sin romper sesiones. */
  archived?: boolean;
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
  const rawBg = palette[bgIndex];
  const sidebar = palette[sidebarIndex];
  const primary = palette[primaryIndex];

  // Si el preset elige un fondo MUY claro (blanco puro, casi-blanco,
  // crema, etc.), lo reemplazamos por un gris suave (#e8eef5) para que
  // las cards resalten. Cards quedan en blanco/cremita para los light.
  const rawNum = parseInt(rawBg.replace('#', ''), 16);
  const lum = ((rawNum >> 16) * 0.299 + ((rawNum >> 8) & 0xff) * 0.587 + (rawNum & 0xff) * 0.114) / 255;
  const isCasiBlanco = lum > 0.92;
  const bg = isCasiBlanco ? '#e8eef5' : rawBg;

  const bgIsLight = isLightColor(bg);
  const sidebarIsLight = isLightColor(sidebar);

  return {
    background: bg,
    backgroundSecondary: bgIsLight ? darken(bg, 3) : lighten(bg, 3),
    contentBackground: bg,
    // Cards: si el bg original era casi-blanco, las dejamos en el
    // color original (blanco o crema) para que resalten contra el gris.
    card: isCasiBlanco ? rawBg : lighten(bg, 5),
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

/**
 * Para los 9 temas curados: las 3 variantes (clasico/vintage/vibrante)
 * funcionan como "Clara / Media / Oscura" del SIDEBAR, manteniendo el
 * mismo bg y primary que el tema. Asi el user puede elegir la tonalidad
 * del sidebar que prefiera sin salirse del tema.
 *
 * sidebars: [clara, media, oscura] — todas en el mismo hue del tema,
 * pero con distinta luma.
 */
function genCuratedVariants(
  palette: [string, string, string, string],
  bgIndex: number,
  primaryIndex: number,
  sidebars: [string, string, string],
): ThemePreset['variants'] {
  const bg = palette[bgIndex];
  const primary = palette[primaryIndex];
  const buildWith = (sidebar: string): ThemeColors => {
    const fakePalette: [string, string, string, string] = [bg, sidebar, primary, primary];
    return generateColors(fakePalette, 0, 1, 2);
  };
  return {
    clasico: buildWith(sidebars[0]),   // Sidebar CLARA
    vintage: buildWith(sidebars[1]),   // Sidebar MEDIA
    vibrante: buildWith(sidebars[2]),  // Sidebar OSCURA
  };
}

// ============================================================
// COLECCION CURADA — 9 temas oficiales (3 light suaves + 3 azul SaaS + 3 dark VS Code)
// El resto de los temas (Midnight, Forest, Sunset, etc.) estan `archived: true`:
// siguen funcionando si alguien los tiene seleccionados pero no aparecen en el
// selector. Para reactivar uno viejo, sacarle el flag `archived`.
// ============================================================
export const themePresets: ThemePreset[] = [

  // ---- LIGHT (blancos suaves, NUNCA blanco puro) ----
  // Variantes = tonalidad del sidebar: Clara / Media / Oscura.

  // 1. Niebla — blanco grisaceo suave, acento indigo. Linear-style.
  {
    id: 'niebla',
    name: 'Niebla',
    family: 'light',
    palette: ['#f4f6fa', '#e7ebf3', '#1e293b', '#4f46e5'],
    variants: genCuratedVariants(['#f4f6fa', '#e7ebf3', '#1e293b', '#4f46e5'], 0, 3,
      ['#e7ebf3', '#475569', '#1e293b']),
  },

  // 2. Marfil — beige calido, acento verde olivo. Editorial/civic.
  {
    id: 'marfil',
    name: 'Marfil',
    family: 'light',
    palette: ['#faf8f3', '#efece4', '#1f2937', '#65a30d'],
    variants: genCuratedVariants(['#faf8f3', '#efece4', '#1f2937', '#65a30d'], 0, 3,
      ['#efece4', '#57534e', '#292524']),
  },

  // 3. Perla — gris perlado limpio, acento azul acero. Escandinavo.
  {
    id: 'perla',
    name: 'Perla',
    family: 'light',
    palette: ['#f1f5f9', '#e2e8f0', '#0f172a', '#0369a1'],
    variants: genCuratedVariants(['#f1f5f9', '#e2e8f0', '#0f172a', '#0369a1'], 0, 3,
      ['#e2e8f0', '#475569', '#0f172a']),
  },

  // ---- AZUL (SaaS modernos, fondo azul-grisaceo) ----

  // 4. Indigo — fondo slate-900 oscuro, acento indigo brillante. Premium SaaS.
  {
    id: 'indigo',
    name: 'Indigo',
    family: 'azul',
    palette: ['#0f172a', '#1e293b', '#6366f1', '#a5b4fc'],
    variants: genCuratedVariants(['#0f172a', '#1e293b', '#6366f1', '#a5b4fc'], 0, 2,
      ['#334155', '#1e293b', '#0b1426']),
  },

  // 5. Cobalto — fondo navy, sidebar azul-grisaceo, acento celeste.
  {
    id: 'cobalto',
    name: 'Cobalto',
    family: 'azul',
    palette: ['#0b1426', '#172033', '#3b82f6', '#93c5fd'],
    variants: genCuratedVariants(['#0b1426', '#172033', '#3b82f6', '#93c5fd'], 0, 2,
      ['#2a3b5a', '#172033', '#070d18']),
  },

  // 6. Acero — fondo gris-azulado, acento azul electrico.
  {
    id: 'acero',
    name: 'Acero',
    family: 'azul',
    palette: ['#111827', '#1f2937', '#2563eb', '#60a5fa'],
    variants: genCuratedVariants(['#111827', '#1f2937', '#2563eb', '#60a5fa'], 0, 2,
      ['#374151', '#1f2937', '#0c1220']),
  },

  // ---- DARK (gris carbon VS Code, NUNCA negro puro) ----

  // 7. Carbon VSC — replica el dark de VS Code (#1e1e1e + #252526).
  {
    id: 'carbon-vsc',
    name: 'Carbon',
    family: 'dark',
    palette: ['#1e1e1e', '#252526', '#0e639c', '#9cdcfe'],
    variants: genCuratedVariants(['#1e1e1e', '#252526', '#0e639c', '#9cdcfe'], 0, 2,
      ['#3a3a3a', '#252526', '#161616']),
  },

  // 8. Grafito — gris carbon mas neutro, acento ambar.
  {
    id: 'grafito',
    name: 'Grafito',
    family: 'dark',
    palette: ['#1f2024', '#2a2c31', '#404249', '#f59e0b'],
    variants: genCuratedVariants(['#1f2024', '#2a2c31', '#404249', '#f59e0b'], 0, 3,
      ['#3f4147', '#2a2c31', '#15161a']),
  },

  // 9. Onix — el mas oscuro del set, casi negro pero NO negro puro.
  {
    id: 'onix',
    name: 'Onix',
    family: 'dark',
    palette: ['#1a1a1d', '#222226', '#2d2d33', '#14b8a6'],
    variants: genCuratedVariants(['#1a1a1d', '#222226', '#2d2d33', '#14b8a6'], 0, 3,
      ['#3a3a40', '#222226', '#101012']),
  },

  // ---- SOBRIOS (escala de grises pura, sin color) ----

  // 10. Papel — light sobrio. Blanco crudo + grises + acento negro.
  // Para usuarios que prefieren neutralidad absoluta sin colores vibrantes.
  {
    id: 'papel',
    name: 'Papel',
    family: 'light',
    palette: ['#f5f5f5', '#e5e5e5', '#404040', '#171717'],
    variants: genCuratedVariants(['#f5f5f5', '#e5e5e5', '#404040', '#171717'], 0, 3,
      ['#e5e5e5', '#525252', '#171717']),
  },

  // 11. Tinta — dark sobrio. Negros + grises carbon + acento blanco roto.
  {
    id: 'tinta',
    name: 'Tinta',
    family: 'dark',
    palette: ['#0a0a0a', '#171717', '#262626', '#fafafa'],
    variants: genCuratedVariants(['#0a0a0a', '#171717', '#262626', '#fafafa'], 0, 3,
      ['#404040', '#171717', '#000000']),
  },

  // ============================================================
  // TEMAS LEGACY — desactivados (archived: true). Quedan por compatibilidad
  // con usuarios que los tengan en localStorage. NO aparecen en el selector.
  // ============================================================

  // 1. Midnight Blue - Elegante y profesional
  {
    id: 'midnight',
    name: 'Midnight',
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
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
    archived: true,
    palette: ['#F5F5F5', '#E5E5E5', '#18181B', '#3B82F6'],
    variants: generateVariants(['#F5F5F5', '#E5E5E5', '#18181B', '#3B82F6'], {
      clasico: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },  // Fondo neutral, sidebar AI black, acento blue
      vintage: { bgIndex: 1, sidebarIndex: 2, primaryIndex: 3 },  // Fondo gris, sidebar AI black
      vibrante: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 2 },  // Sidebar blue, acento black
    }),
  },

  // 16. Generative Art - Canvas neutral oscuro con acentos vibrantes (Web3/NFT/AI Art)
  {
    id: 'generative',
    name: 'Generative Art',
    archived: true,
    palette: ['#121212', '#1A1A1A', '#8B5CF6', '#EC4899'],
    variants: generateVariants(['#121212', '#1A1A1A', '#8B5CF6', '#EC4899'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },  // Fondo canvas, sidebar charcoal, acento purple
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },  // Fondo charcoal, sidebar canvas, acento pink
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },  // Sidebar purple, acento neon pink
    }),
  },

  // 17. AI Image Gen - Dark mode creativo con acentos vibrantes (AI art generation)
  {
    id: 'aimagegen',
    name: 'AI Image Gen',
    archived: true,
    palette: ['#0F0F0F', '#1C1C1E', '#06B6D4', '#F59E0B'],
    variants: generateVariants(['#0F0F0F', '#1C1C1E', '#06B6D4', '#F59E0B'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },  // Fondo deep black, sidebar dark, acento cyan
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },  // Fondo dark, sidebar black, acento amber
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },  // Sidebar cyan, acento amber vibrante
    }),
  },

  // ====================================================================
  // PALETAS SOBRIAS Y PROFESIONALES (gobierno / corporativo / institucional)
  // ====================================================================

  // 18. Onyx - Negro profundo con acento dorado sobrio (corporativo premium)
  {
    id: 'onyx',
    name: 'Onyx',
    archived: true,
    palette: ['#0a0a0a', '#1a1a1a', '#9b8755', '#d4b986'],
    variants: generateVariants(['#0a0a0a', '#1a1a1a', '#9b8755', '#d4b986'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 19. Pearl - Blancos cálidos + navy (institucional clean)
  {
    id: 'pearl',
    name: 'Pearl',
    archived: true,
    palette: ['#fafaf9', '#f0eee8', '#1e3a5f', '#475569'],
    variants: generateVariants(['#fafaf9', '#f0eee8', '#1e3a5f', '#475569'], {
      clasico: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 2 },  // Sidebar navy oscuro
      vintage: { bgIndex: 1, sidebarIndex: 2, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },  // Sidebar claro
    }),
  },

  // 20. Espresso - Café tostado + crema (cálido pro)
  {
    id: 'espresso',
    name: 'Espresso',
    archived: true,
    palette: ['#1c1410', '#2e211a', '#8b5a3c', '#c9a878'],
    variants: generateVariants(['#1c1410', '#2e211a', '#8b5a3c', '#c9a878'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 21. Steel - Acero industrial + cyan sobrio (tech/SaaS pro)
  {
    id: 'steel',
    name: 'Steel',
    archived: true,
    palette: ['#111418', '#1f2937', '#334155', '#0891b2'],
    variants: generateVariants(['#111418', '#1f2937', '#334155', '#0891b2'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
      vintage: { bgIndex: 1, sidebarIndex: 2, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // 22. Sage - Verde salvia apagado + crema (calmo / juridico)
  {
    id: 'sage',
    name: 'Sage',
    archived: true,
    palette: ['#f5f5f0', '#e7e5dc', '#5a6e58', '#3d5a4f'],
    variants: generateVariants(['#f5f5f0', '#e7e5dc', '#5a6e58', '#3d5a4f'], {
      clasico: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 2 },  // Sidebar verde oscuro
      vintage: { bgIndex: 1, sidebarIndex: 3, primaryIndex: 2 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },

  // 23. Bordeaux - Vino oscuro + nude (sofisticado / institucional)
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    archived: true,
    palette: ['#1a0d0f', '#2e1418', '#8b1e3f', '#c9a097'],
    variants: generateVariants(['#1a0d0f', '#2e1418', '#8b1e3f', '#c9a097'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 2 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 3 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // ====================================================================
  // PALETAS B&N / GRISES (minimalistas, neutras, editoriales)
  // ====================================================================

  // 24. Paper - Blanco papel editorial con tipografía negra (tema claro)
  {
    id: 'paper',
    name: 'Paper',
    archived: true,
    palette: ['#ffffff', '#f4f4f4', '#8a8a8a', '#1a1a1a'],
    variants: generateVariants(['#ffffff', '#f4f4f4', '#8a8a8a', '#1a1a1a'], {
      clasico: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 3 },  // Fondo puro, sidebar negro
      vintage: { bgIndex: 1, sidebarIndex: 3, primaryIndex: 3 },  // Fondo crudo
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },  // Sidebar gris claro
    }),
  },

  // 25. Ink - Negro tinta profundo + blanco roto (editorial dark)
  {
    id: 'ink',
    name: 'Ink',
    archived: true,
    palette: ['#000000', '#121212', '#a3a3a3', '#ffffff'],
    variants: generateVariants(['#000000', '#121212', '#a3a3a3', '#ffffff'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },  // Negro puro + acento blanco
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 2 },  // Acento gris
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },  // Sidebar gris claro
    }),
  },

  // 26. Concrete - Gris cemento medio (neutro industrial)
  {
    id: 'concrete',
    name: 'Concrete',
    archived: true,
    palette: ['#2a2a2a', '#3d3d3d', '#6b6b6b', '#cfcfcf'],
    variants: generateVariants(['#2a2a2a', '#3d3d3d', '#6b6b6b', '#cfcfcf'], {
      clasico: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
      vintage: { bgIndex: 1, sidebarIndex: 0, primaryIndex: 2 },
      vibrante: { bgIndex: 0, sidebarIndex: 2, primaryIndex: 3 },
    }),
  },

  // 27. Platinum - Gris plateado claro + carbón (tema claro profesional)
  {
    id: 'platinum',
    name: 'Platinum',
    archived: true,
    palette: ['#f5f5f7', '#e5e5ea', '#86868b', '#1d1d1f'],
    variants: generateVariants(['#f5f5f7', '#e5e5ea', '#86868b', '#1d1d1f'], {
      clasico: { bgIndex: 0, sidebarIndex: 3, primaryIndex: 3 },  // Fondo platino, sidebar carbón
      vintage: { bgIndex: 1, sidebarIndex: 3, primaryIndex: 2 },
      vibrante: { bgIndex: 0, sidebarIndex: 1, primaryIndex: 3 },
    }),
  },
];

// Helper para obtener un tema por ID y variante
export function getThemeColors(presetId: string, variant: ThemeVariant): ThemeColors | null {
  const preset = themePresets.find(p => p.id === presetId);
  if (!preset) return null;
  return preset.variants[variant];
}

// Helper para obtener los presets activos (no archivados) — los unicos
// que aparecen en el selector. Los archivados siguen disponibles via
// getThemeColors() para no romper sesiones con tema viejo seleccionado.
export function getActivePresets(): ThemePreset[] {
  return themePresets.filter(p => !p.archived);
}

// Helper para obtener todos los presets como opciones (solo activos).
export function getPresetOptions() {
  return getActivePresets().map(preset => ({
    id: preset.id,
    name: preset.name,
    family: preset.family,
    palette: preset.palette,
  }));
}

// Configuracion por defecto — tema dark estilo VS Code
export const defaultThemeConfig = {
  presetId: 'carbon-vsc',
  variant: 'clasico' as ThemeVariant,
};

