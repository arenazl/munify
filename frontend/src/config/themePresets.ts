/**
 * Sistema de Temas — Munify
 *
 * Un tema se define con lo MÍNIMO: un color BASE + un MODO (claro/oscuro).
 * TODO lo demás se deriva. Son tres ejes INDEPENDIENTES que se combinan
 * libremente (cualquier acento sobre cualquier fondo es válido):
 *
 *   1. TEMA DE FONDO  → `bgThemes` (3 claros + 3 oscuros). Aporta `base` y `modo`.
 *   2. ACENTO         → `accents`. Transversal: pinta botones, activos, detalles.
 *   3. BARRA LATERAL  → `sidebarModes`. Cómo se arma el fondo del sidebar
 *                       (sigue al tema / teñido del acento / claro siempre).
 *
 * ANTES cada combinación fondo×acento tenía que nacer como preset nuevo —
 * por eso la colección se había desbordado a 40 paletas con duplicados
 * ("Verde Oscuro" y "Verde Claro" = mismo acento, distinto fondo; "Papel" y
 * "Tinta" = el mismo neutro invertido). Separando los ejes, 6 fondos × 7
 * acentos × 3 sidebars = 126 apariencias con 16 valores declarados.
 *
 * Los 13 campos de `ThemeColors` salen de `buildThemeColors()`. El segundo
 * tono (backgroundSecondary / card / border) NO se declara: es el `base` con
 * un escalón de luminosidad.
 */

export type ThemeMode = 'claro' | 'oscuro';

/** Cómo se arma el fondo de la barra lateral (eje 3). */
export type SidebarMode = 'organico' | 'tinte' | 'claro';

/**
 * @deprecated Eje viejo (tonalidad del sidebar: clasico/vintage/vibrante).
 * Se mantiene el TIPO porque `brands/` lo declara y porque hay preferencias
 * guardadas en localStorage con estos valores. Se traduce a `SidebarMode`
 * en `resolveSidebarMode()`. No usar en código nuevo.
 */
export type ThemeVariant = 'clasico' | 'vintage' | 'vibrante';

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

  /** Fondo con un lavado MUY sutil del acento (gradiente), para contenedores
   *  "agrupación" (header de ABMPage, tabla, cards, Sheet). Opcional — si no
   *  está definido, los componentes caen a `card` (flat). Se aplica en los
   *  temas de modo CLARO. */
  cardAccentBg?: string;
}

/** Un tema de fondo: lo único declarado a mano es `base` + `modo`. */
export interface BgTheme {
  id: string;
  name: string;
  modo: ThemeMode;
  /** Color base del fondo. TODO el resto de las superficies sale de acá. */
  base: string;
  /** ID del acento que se aplica al elegir este tema, mientras el usuario no
   *  haya elegido uno propio (si eligió, esa elección manda). */
  acentoRecomendado: string;
  /**
   * Acentos que este fondo LUCE mejor, en orden. Es una recomendación, NO una
   * restricción: el selector ofrece los del catálogo completo sobre cualquier
   * tema, como dice el canvas ("el acento se aplica sobre cualquier tema").
   *
   * Hubo una vuelta previa en la que este campo filtraba la lista. Se revirtió
   * a pedido del dueño: en Paraguay Limpio dejaba un solo acento visible y no
   * había forma de cambiarlo aunque el municipio quisiera.
   */
  acentos: string[];
}

/** Un acento del catálogo transversal. */
export interface AccentOption {
  id: string;
  name: string;
  /** Un hex fijo, o un hex POR MODO. El "Neutro" usa la segunda forma: sobre
   *  fondo oscuro resuelve a blanco y sobre fondo claro a negro — es el mismo
   *  acento, no dos (reemplaza al par de presets Papel/Tinta). */
  color: string | Record<ThemeMode, string>;
}

export interface SidebarModeOption {
  id: SidebarMode;
  name: string;
  description: string;
}

// ============================================================
// Funciones auxiliares de color
// ============================================================

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

// Luminancia relativa (0 oscuro → 1 claro) y su lectura binaria, para decidir
// textos por contraste.
const luminanciaDe = (hex: string): number => {
  const num = parseInt(hex.replace('#', ''), 16);
  return ((num >> 16) * 0.299 + ((num >> 8) & 0xff) * 0.587 + (num & 0xff) * 0.114) / 255;
};

const isLightColor = (hex: string): boolean => luminanciaDe(hex) > 0.5;

// Los dos "tintas" que la app usa sobre superficies de color.
const TINTA_OSCURA = '#1e293b';
const TINTA_CLARA = '#ffffff';

/** Luminancia WCAG (sRGB linealizado) — sólo para decidir contrastes. */
const luminanciaWcag = (hex: string): number => {
  const num = parseInt(hex.replace('#', ''), 16);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(num >> 16) + 0.7152 * canal((num >> 8) & 0xff) + 0.0722 * canal(num & 0xff);
};

const contraste = (a: string, b: string): number => {
  const [alto, bajo] = [luminanciaWcag(a), luminanciaWcag(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
};

/**
 * Texto sobre una superficie de color (el acento): el que MÁS contraste da.
 * Se decide por contraste real y no por un umbral de luminancia, porque los
 * acentos que caen justo en el límite (el olivo, por ejemplo) quedaban con
 * texto blanco a 3.1:1 — ilegible. Así siempre gana la tinta correcta.
 */
const tintaSobre = (fondo: string): string =>
  contraste(TINTA_CLARA, fondo) >= contraste(TINTA_OSCURA, fondo) ? TINTA_CLARA : TINTA_OSCURA;

/**
 * Deriva los 13 campos de `ThemeColors` a partir de tres colores.
 *
 * Es el motor de siempre (ex `generateColors()` / el `buildWith()` interno de
 * `genCuratedVariants()`), con la misma matemática: el segundo tono es el base
 * con un escalón de luminosidad, y los textos se eligen por contraste.
 */
function derivarColores(rawBg: string, sidebar: string, acento: string): ThemeColors {
  // Si el tema elige un fondo MUY claro (blanco puro, casi-blanco, crema),
  // el FONDO baja un escalón para que las cards resalten, y las cards se
  // quedan con el color original (blanco/cremita).
  // El escalón sale del propio base (antes era un gris azulado fijo, que le
  // robaba la temperatura a los temas cálidos: Marfil terminaba con fondo frío).
  const isCasiBlanco = luminanciaDe(rawBg) > 0.92;
  const bg = isCasiBlanco ? darken(rawBg, 6) : rawBg;

  const bgIsLight = isLightColor(bg);
  const sidebarIsLight = isLightColor(sidebar);

  return {
    background: bg,
    backgroundSecondary: bgIsLight ? darken(bg, 3) : lighten(bg, 3),
    contentBackground: bg,
    card: isCasiBlanco ? rawBg : lighten(bg, 5),
    sidebar: sidebar,
    sidebarText: sidebarIsLight ? TINTA_OSCURA : TINTA_CLARA,
    sidebarTextSecondary: sidebarIsLight ? '#475569' : '#94a3b8',
    text: bgIsLight ? TINTA_OSCURA : TINTA_CLARA,
    textSecondary: bgIsLight ? '#475569' : '#94a3b8',
    primary: acento,
    primaryHover: darken(acento, 12),
    primaryText: tintaSobre(acento),
    border: bgIsLight ? darken(bg, 10) : lighten(bg, 10),
  };
}

/** Lavado sutil del acento sobre el card — diagonal, se disuelve rápido para
 *  no competir con el contenido. */
const accentWash = (card: string, primary: string): string =>
  `linear-gradient(160deg, ${mixColors(card, primary, 0.07)} 0%, ${card} 60%)`;

// ============================================================
// EJE 1 — TEMAS DE FONDO (3 claros + 3 oscuros)
// Los `base` son los de los mejores temas de la colección anterior; lo que se
// fue es la paleta de 4 colores con el acento adentro.
// ============================================================

export const bgThemes: BgTheme[] = [
  // ---- CLAROS ----
  { id: 'blanco', name: 'Blanco', modo: 'claro', base: '#f7f8fa', acentoRecomendado: 'indigo',
    acentos: ['indigo', 'celeste', 'verde', 'negro'] },
  { id: 'marfil', name: 'Marfil', modo: 'claro', base: '#faf8f3', acentoRecomendado: 'olivo',
    acentos: ['olivo', 'ambar', 'verde', 'negro'] },
  // Ámbar apagado: cálido como el marfil pero un punto más gris, para que a
  // pantalla completa no se lea amarillo.
  { id: 'ambar', name: 'Ámbar', modo: 'claro', base: '#f5f2ea', acentoRecomendado: 'ambar',
    acentos: ['ambar', 'olivo', 'verde', 'negro'] },

  // ---- OSCUROS ----
  /* Los tres oscuros tienen que distinguirse DE UN VISTAZO (feedback del
     dueño 2026-08-13: "gris, negro y azul los veo muy similares"):
     negro = negro casi puro · gris = carbón claramente más claro y neutro ·
     azul = azul marino con matiz visible, de la familia del acento azul. */
  { id: 'negro', name: 'Negro', modo: 'oscuro', base: '#0a0a0a', acentoRecomendado: 'blanco',
    acentos: ['blanco', 'ambar', 'turquesa', 'celeste'] },
  { id: 'gris', name: 'Gris', modo: 'oscuro', base: '#26282d', acentoRecomendado: 'celeste',
    acentos: ['celeste', 'turquesa', 'ambar', 'blanco'] },
  { id: 'azul', name: 'Azul', modo: 'oscuro', base: '#101d36', acentoRecomendado: 'indigo',
    acentos: ['indigo', 'turquesa', 'celeste', 'blanco'] },
];

/**
 * IDs viejos → nuevos. Los temas se renombraron a lo que el dueño nombra
 * ("negro, gris, azul" / "blanco, marfil, ámbar"), y hay usuarios con el id
 * anterior guardado en localStorage: sin esta tabla, esos usuarios abrirían la
 * app con el tema por defecto y pensarían que se les borró la preferencia.
 */
export const ALIAS_TEMAS: Record<string, string> = {
  niebla: 'blanco',
  carbon: 'gris',
  midnight: 'azul',
};

// ============================================================
// EJE 2 — ACENTOS (transversales: cualquiera sobre cualquier fondo)
// Son los acentos que ya usaban los presets viejos, ahora como eje propio.
// ============================================================

export const accents: AccentOption[] = [
  { id: 'verde', name: 'Verde', color: '#1b7a3d' },
  { id: 'esmeralda', name: 'Esmeralda', color: '#059669' },
  { id: 'turquesa', name: 'Turquesa', color: '#14b8a6' },
  { id: 'celeste', name: 'Celeste', color: '#0369a1' },
  { id: 'azul', name: 'Azul', color: '#2563eb' },
  { id: 'indigo', name: 'Índigo', color: '#4f46e5' },
  { id: 'violeta', name: 'Violeta', color: '#7c3aed' },
  { id: 'rosa', name: 'Rosa', color: '#db2777' },
  { id: 'rojo', name: 'Rojo', color: '#dc2626' },
  { id: 'naranja', name: 'Naranja', color: '#ea580c' },
  { id: 'ambar', name: 'Ámbar', color: '#f59e0b' },
  { id: 'olivo', name: 'Olivo', color: '#65a30d' },
  // Se resuelve por MODO: blanco sobre oscuro, negro sobre claro.
  { id: 'neutro', name: 'Neutro', color: { oscuro: '#fafafa', claro: '#171717' } },
];

// ============================================================
// EJE 3 — FONDO DE LA BARRA LATERAL
// ============================================================

export const sidebarModes: SidebarModeOption[] = [
  // Los tres son el MISMO acento lavado sobre la base, en tres intensidades
  // (ver sidebarColor). Ninguno es un color propio.
  { id: 'tinte', name: 'Tinte', description: 'Se nota el acento en la barra' },
  { id: 'organico', name: 'Orgánico', description: 'El acento se insinúa' },
  { id: 'claro', name: 'Claro', description: 'Apenas separada del fondo' },
];

// Configuración por defecto — tema oscuro estilo VS Code, sin acento elegido
// (usa el `acentoRecomendado` del tema) y sidebar siguiendo al tema.
export const defaultThemeConfig = {
  presetId: 'gris',
  sidebarMode: 'organico' as SidebarMode,
};

// ============================================================
// Resolución + derivación
// ============================================================

/** Tema de fondo por id. TOLERANTE: un id desconocido cae al default. */
export function getBgTheme(id: string | null | undefined): BgTheme {
  return (
    bgThemes.find((t) => t.id === id) ||
    bgThemes.find((t) => t.id === defaultThemeConfig.presetId) ||
    bgThemes[0]
  );
}

/** Color final de un acento para un modo dado (resuelve el Neutro). */
export function resolveAccentColor(accentId: string | null | undefined, modo: ThemeMode): string {
  const acento = accents.find((a) => a.id === accentId) || accents[0];
  return typeof acento.color === 'string' ? acento.color : acento.color[modo];
}

/** Fondo del sidebar según el eje 3, derivado del tema y del acento activo.
 *  Exportada para que el selector de Apariencia previsualice EXACTAMENTE la
 *  barra que va a quedar, no una aproximación. */
export function sidebarColor(tema: BgTheme, acento: string, modo: SidebarMode): string {
  // Las tres opciones NO son colores propios: son la MISMA idea con distinta
  // intensidad — el acento lavado sobre la base del tema. Por eso la barra
  // siempre pertenece al tema (nunca una barra blanca sobre un tema oscuro,
  // que era lo que hacía la opción "claro" y rompía el modo).
  //
  // La escala va de más a menos invasiva:
  //   tinte    → se nota que la barra está teñida del acento
  //   orgánico → el acento se insinúa, la barra sigue leyéndose como el tema
  //   claro    → apenas un grado de separación con el fondo
  //
  // En los temas oscuros la mezcla necesita un punto más para percibirse: el
  // ojo distingue peor entre tonos oscuros que entre claros.
  const claro = tema.modo === 'claro';
  /* Intensidades bien separadas (feedback del dueño 2026-08-13: "Tinte,
     Orgánico y Claro son muy parecidos"): tinte se NOTA, orgánico se
     insinúa, claro es casi el fondo con un escalón. */
  const intensidad =
    modo === 'tinte' ? (claro ? 0.32 : 0.45)
    : modo === 'organico' ? (claro ? 0.14 : 0.2)
    : (claro ? 0.03 : 0.05);

  const teñida = mixColors(tema.base, acento, intensidad);
  // Además del tinte, un escalón de luminosidad contra el fondo para que la
  // barra se separe aunque el acento sea casi del color de la base. El
  // escalón también distingue: "claro" se separa más por LUZ que por tinte.
  const escalon = modo === 'claro' ? 7 : 4;
  return claro ? darken(teñida, escalon) : lighten(teñida, escalon);
}

/**
 * Arma los 13 campos del tema activo desde los 3 ejes.
 * Es la ÚNICA función que produce `ThemeColors`.
 */
export function buildThemeColors(
  bgId: string | null | undefined,
  accentId: string | null | undefined,
  sidebarMode: SidebarMode,
): ThemeColors {
  const tema = getBgTheme(bgId);
  const acento = resolveAccentColor(accentId ?? tema.acentoRecomendado, tema.modo);
  const colores = derivarColores(tema.base, sidebarColor(tema, acento, sidebarMode), acento);
  // El lavado de acento en las cards es para los temas claros (en los oscuros
  // ensucia el contraste del contenido).
  return tema.modo === 'claro'
    ? { ...colores, cardAccentBg: accentWash(colores.card, colores.primary) }
    : colores;
}

// ============================================================
// COMPATIBILIDAD con la colección vieja
// Un usuario con un preset viejo guardado (o una marca que lo declara) NO
// tiene que romperse: se traduce al par (fondo, acento) equivalente, y lo
// desconocido cae al default sin tirar error.
// ============================================================

interface LegacySelection {
  bgId: string;
  /** Acento EXPLÍCITO heredado del preset viejo (null = seguir la
   *  recomendación del tema). */
  accentId: string | null;
}

const LEGACY_PRESETS: Record<string, LegacySelection> = {
  // Curados que se mantienen (mismo id) pero traían el acento adentro.
  'carbon-vsc': { bgId: 'carbon', accentId: 'celeste' },
  grafito: { bgId: 'carbon', accentId: 'ambar' },
  // El par sobrio Papel/Tinta era exactamente "acento neutro por modo".
  tinta: { bgId: 'onix', accentId: 'neutro' },
  papel: { bgId: 'perla', accentId: 'neutro' },
  // Los tres "azul SaaS" compartían fondo navy y cambiaban el azul.
  indigo: { bgId: 'midnight', accentId: 'indigo' },
  cobalto: { bgId: 'midnight', accentId: 'celeste' },
  acero: { bgId: 'midnight', accentId: 'celeste' },
  // Par verde de marca (white-label): mismo acento, dos fondos.
  'onix-verde': { bgId: 'onix', accentId: 'verde' },
  'nieve-verde': { bgId: 'niebla', accentId: 'verde' },
};

/**
 * Traduce un id de preset guardado (nuevo o viejo) al par (fondo, acento).
 * Cualquier id desconocido —'sunset', 'forest', un tema borrado— cae al
 * default sin excepción.
 */
export function resolveSavedPreset(id: string | null | undefined): LegacySelection {
  if (id) {
    if (bgThemes.some((t) => t.id === id)) return { bgId: id, accentId: null };
    const legacy = LEGACY_PRESETS[id];
    if (legacy) return legacy;
  }
  return { bgId: defaultThemeConfig.presetId, accentId: null };
}

/** Acento guardado → id válido, o null (= seguir la recomendación del tema). */
export function resolveSavedAccent(id: string | null | undefined): string | null {
  return id && accents.some((a) => a.id === id) ? id : null;
}

/**
 * Modo de sidebar tolerante: acepta los valores nuevos y los del eje viejo
 * (clasico = sidebar clara, vintage/vibrante = seguía al tema).
 */
export function resolveSidebarMode(value: string | null | undefined): SidebarMode {
  switch (value) {
    case 'organico':
    case 'tinte':
    case 'claro':
      return value;
    case 'clasico':
      return 'claro';
    case 'vintage':
    case 'vibrante':
      return 'organico';
    default:
      return defaultThemeConfig.sidebarMode;
  }
}
