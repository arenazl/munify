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

/** Cuánto tira el gris del tema hacia un lado. Es el segundo eje del selector:
 *  el primero es claro/oscuro y este dice si ese claro (u oscuro) es plano,
 *  tostado o azulado. Con los dos ejes, elegir tema son dos preguntas cortas en
 *  vez de comparar seis muestras casi iguales. */
export type Temperatura = 'neutro' | 'calido' | 'frio';

/** Un tema de fondo: lo único declarado a mano es `base` + `modo`. */
export interface BgTheme {
  id: string;
  name: string;
  modo: ThemeMode;
  /** Su columna en la matriz del selector. Dos temas nunca comparten
   *  (modo, temperatura): si comparten, uno de los dos sobra. */
  temperatura: Temperatura;
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

/**
 * Texto sobre una superficie de color (el acento): REGLA ÚNICA (dueño
 * 2026-08-13): acento oscuro → tinta clara, acento claro → tinta oscura.
 * Es la MISMA vara que `--pl-on-accent` — todo el kit elige la tinta igual.
 *
 * CÓMO se decide (tercera vara, 2026-08-27 — las dos anteriores fallaron en
 * un color cada una):
 *   1. `luminanciaDe() > 0.5`: el azul medio (#4a90e2, 0.52) y el verde
 *      (#22c55e, 0.53) daban "claros" → botón azul con texto azul (bug QA).
 *   2. WCAG `contraste(blanco) >= 3` (2026-08-25): salvó al azul (3.7:1)
 *      pero el verde quedó en 2.1:1 → botón verde con tinta oscura (bug QA
 *      del 27/8). La norma es matemática, no perceptual: sobre verdes medios
 *      "gana" el negro aunque el ojo pida blanco.
 *   3. AHORA: luminancia PERCEPTUAL (la misma `luminanciaDe`, coeficientes
 *      YIQ) con el umbral donde el ojo lo pone: 0.59, entre el verde pleno
 *      (0.53 → blanca) y la lima (0.63 → oscura). Azul 0.52, cian 0.52,
 *      rojo 0.47 → blanca; lima 0.63, ámbar 0.65, amarillo 0.69 y los
 *      pasteles → oscura. Margen de ±0.05 a cada lado del corte.
 */
const tintaSobre = (fondo: string): string =>
  luminanciaDe(fondo) > 0.59 ? TINTA_OSCURA : TINTA_CLARA;

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
// EJE 1 — TEMAS DE FONDO: una MATRIZ, no una lista
//
// Siguen siendo seis, pero ya no se eligen de un listado plano donde había que
// adivinar la diferencia entre Marfil y Ámbar. Son dos preguntas:
//
//                 neutro      cálido      frío
//     oscuro      Grafito     Tabaco      Marino
//     claro       Nieve       Marfil      Hielo
//
// Cada casillero se puede nombrar y ninguno se solapa con el de al lado, que
// era el problema real: el dueño marcó el 2026-08-13 que "gris, negro y azul
// los veo muy similares" --- tres neutros oscuros compitiendo entre sí.
//
// QUE CAMBIO Y POR QUE
//   - Se va el NEGRO PURO (#0a0a0a): sobre negro las tarjetas no se despegan y
//     la sombra directamente no existe. El neutro oscuro arranca un paso
//     adentro, en #1b2027.
//   - Se va el BLANCO PURO: sin blanco roto hay que ponerle borde a todo. El
//     neutro claro es #fafaf9, y así las tarjetas blancas se despegan solas.
//   - MARFIL y ÁMBAR eran el mismo tema a un paso de distancia: se funden en
//     un solo cálido claro.
//   - Aparece HIELO, el claro frío. Era el hueco real de la grilla: existía el
//     oscuro frío (Marino) y no su equivalente claro.
// ============================================================

export const bgThemes: BgTheme[] = [
  // ---- OSCUROS ----
  { id: 'grafito', name: 'Grafito', modo: 'oscuro', temperatura: 'neutro', base: '#1b2027',
    acentoRecomendado: 'azul', acentos: ['azul', 'turquesa', 'violeta', 'gris'] },
  { id: 'tabaco', name: 'Tabaco', modo: 'oscuro', temperatura: 'calido', base: '#241f1b',
    acentoRecomendado: 'terracota', acentos: ['terracota', 'dorado', 'vino', 'gris'] },
  { id: 'marino', name: 'Marino', modo: 'oscuro', temperatura: 'frio', base: '#18202f',
    acentoRecomendado: 'azul', acentos: ['azul', 'violeta', 'turquesa', 'gris'] },

  // ---- CLAROS ----
  { id: 'nieve', name: 'Nieve', modo: 'claro', temperatura: 'neutro', base: '#fafaf9',
    acentoRecomendado: 'azul', acentos: ['azul', 'violeta', 'verde', 'gris'] },
  { id: 'marfil', name: 'Marfil', modo: 'claro', temperatura: 'calido', base: '#f7f4ee',
    acentoRecomendado: 'terracota', acentos: ['terracota', 'dorado', 'vino', 'gris'] },
  { id: 'hielo', name: 'Hielo', modo: 'claro', temperatura: 'frio', base: '#f3f6fa',
    acentoRecomendado: 'turquesa', acentos: ['turquesa', 'azul', 'verde', 'gris'] },
];

/**
 * IDs viejos → nuevos. Los temas se renombraron a lo que el dueño nombra
 * ("negro, gris, azul" / "blanco, marfil, ámbar"), y hay usuarios con el id
 * anterior guardado en localStorage: sin esta tabla, esos usuarios abrirían la
 * app con el tema por defecto y pensarían que se les borró la preferencia.
 */
export const ALIAS_TEMAS: Record<string, string> = {
  // Nombres de dos generaciones atrás
  niebla: 'nieve',
  carbon: 'grafito',
  midnight: 'marino',
  // La lista plana anterior. Los tres neutros oscuros caen todos en Grafito
  // --- eran el mismo tema con distinto brillo --- y Ámbar se funde con Marfil.
  blanco: 'nieve',
  gris: 'grafito',
  negro: 'grafito',
  azul: 'marino',
  ambar: 'marfil',
};

// ============================================================
// EJE 2 — ACENTOS: una paleta CERRADA de ocho
// ============================================================
// Ocho, no un selector libre de color. Es la recomendación explícita del canvas
// ("Munify - Rail y topbar", 6b) y la razón es concreta: cada acento tiene que
// funcionar sobre el rail oscuro Y sobre blanco, y con color libre alguien
// elige un amarillo con el que la píldora activa deja de leerse. Estos ocho
// están probados contra las dos superficies.
//
// El contraste del texto sobre el acento ya no se fija a mano en ningún lado
// (ver `contrastar()` en lib/colorUtils): se calcula. Las dos cosas van juntas
// --- paleta acotada y tinta por contraste --- y es lo que el canvas pide.
// ============================================================

export const accents: AccentOption[] = [
  { id: 'azul', name: 'Azul', color: '#4b87f5' },
  { id: 'verde', name: 'Verde', color: '#2fb37e' },
  { id: 'terracota', name: 'Terracota', color: '#d96a3f' },
  { id: 'vino', name: 'Vino', color: '#b4515e' },
  { id: 'violeta', name: 'Violeta', color: '#7c6ce0' },
  { id: 'turquesa', name: 'Turquesa', color: '#0fa3b1' },
  { id: 'dorado', name: 'Dorado', color: '#c79a2b' },
  { id: 'gris', name: 'Gris', color: '#6b7480' },
];

/**
 * Acentos viejos → los ocho de ahora.
 *
 * Trece se volvieron ocho, y no por prolijidad: cada acento tiene que verse
 * contra el rail oscuro Y contra blanco, y varios de los que había no pasaban
 * esa doble prueba. Los que se van no desaparecen sin más — caen en el vecino
 * más cercano de la paleta nueva, así que nadie pierde su color, sólo lo ve un
 * poco más calibrado.
 */
export const ALIAS_ACENTOS: Record<string, string> = {
  esmeralda: 'verde',
  olivo: 'verde',
  celeste: 'azul',
  indigo: 'violeta',
  rosa: 'vino',
  rojo: 'vino',
  naranja: 'terracota',
  ambar: 'dorado',
  blanco: 'gris',
  negro: 'gris',
  neutro: 'gris',
};
// ============================================================
// EJE 3 — FONDO DE LA BARRA LATERAL
// ============================================================

export const sidebarModes: SidebarModeOption[] = [
  // Dos, no tres. Los dos son el MISMO acento lavado sobre la base, en dos
  // intensidades (ver sidebarColor); ninguno es un color propio.
  //
  // SE FUE "TINTE", el que teñía la barra con el acento al 6%. No es cuestión
  // de gusto: el canvas lo probó contra la paleta entera y lo descartó ---"con
  // el amarillo y el lima este no sirve"---, mientras que los otros dos aguantan
  // cualquier acento. Dejar los tres significaba que el municipio podía elegir
  // la combinación que no se lee, y el trabajo del selector es justamente que
  // no pueda.
  { id: 'organico', name: 'Orgánico', description: 'El acento se insinúa' },
  { id: 'claro', name: 'Claro', description: 'Apenas separada del fondo' },
];

// ============================================================
// EL ESTILO DE ARRANQUE — uno solo, igual para todos los municipios
// ============================================================
// Un municipio que todavía no eligió nada NO tiene que verse distinto de otro
// que tampoco eligió: la app arranca igual en los dos y a partir de ahí cada
// uno la personaliza si quiere. Sin un default único, "no elegir" se convertía
// en una decisión estética por omisión, y dos demos seguidas se veían distintas
// sin que nadie hubiera tocado nada.
//
// Grafito + azul es el par del canvas ("Munify - Rail y topbar", 6a).
export const defaultThemeConfig = {
  // Marino: el oscuro FRIO, el azul de la marca. Antes era Grafito, un gris
  // neutro que no dice nada de Munify.
  presetId: 'marino',
  accentId: 'azul',
  sidebarMode: 'organico' as SidebarMode,
};

/**
 * La foto del banner cuando el municipio no subió la suya.
 *
 * NO es un adorno opcional: sin ella el hero queda un rectángulo de color
 * plano, y eso baja la calidad de la app entera en la primera pantalla que ve
 * un intendente. Que el municipio no haya cargado su foto es un dato que
 * nosotros tenemos que cubrir, no un permiso para mostrar menos.
 *
 * Va servida desde `public/` y no desde un CDN de terceros: el banner es lo
 * primero que se pinta, y depender de una red ajena para eso es cambiar un
 * hueco por otro peor —el que aparece a veces—.
 */
export const PORTADA_FALLBACK = '/banner-fallback.jpg';

// ============================================================
// Resolución + derivación
// ============================================================

/** Tema de fondo por id. TOLERANTE: un id desconocido cae al default. */
export function getBgTheme(id: string | null | undefined): BgTheme {
  // El alias se aplica ACÁ, que es el único punto por donde pasa la resolución
  // de un tema guardado. `ALIAS_TEMAS` existía pero no lo llamaba nadie: era
  // una tabla muerta, así que un usuario con un nombre viejo guardado ya venía
  // cayendo al tema por defecto en silencio. Con la matriz eso se agravaba
  // —`gris`, `negro`, `azul`, `blanco` y `ambar` dejaron de existir como ids—
  // y todos ellos habrían perdido su preferencia de golpe.
  const resuelto = (id && ALIAS_TEMAS[id]) || id;
  return (
    bgThemes.find((t) => t.id === resuelto) ||
    bgThemes.find((t) => t.id === defaultThemeConfig.presetId) ||
    bgThemes[0]
  );
}

/** Color final de un acento para un modo dado (resuelve el Neutro). */
export function resolveAccentColor(accentId: string | null | undefined, modo: ThemeMode): string {
  const id = (accentId && ALIAS_ACENTOS[accentId]) || accentId;
  const acento = accents.find((a) => a.id === id) || accents[0];
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

/** Acento guardado → id válido, o null (= seguir la recomendación del tema).
 *
 *  Pasa por `ALIAS_ACENTOS` igual que los temas por `ALIAS_TEMAS`: la paleta se
 *  cerró de trece a ocho, y sin esto todos los que tenían Rojo, Índigo, Rosa,
 *  Naranja, Ámbar, Olivo, Celeste o Esmeralda guardado perderían su color de
 *  golpe. Cada uno cae en el vecino más cercano de la paleta nueva. */
export function resolveSavedAccent(id: string | null | undefined): string | null {
  const resuelto = (id && ALIAS_ACENTOS[id]) || id;
  return resuelto && accents.some((a) => a.id === resuelto) ? resuelto : null;
}

/**
 * Modo de sidebar tolerante: acepta los valores nuevos y los del eje viejo
 * (clasico = sidebar clara, vintage/vibrante = seguía al tema).
 */
export function resolveSidebarMode(value: string | null | undefined): SidebarMode {
  switch (value) {
    case 'organico':
    case 'claro':
      return value;
    // El modo que se descartó por no aguantar toda la paleta: quien lo tenga
    // guardado pasa al vecino más cercano, que es el mismo lavado más suave.
    case 'tinte':
      return 'organico';
    case 'clasico':
      return 'claro';
    case 'vintage':
    case 'vibrante':
      return 'organico';
    default:
      return defaultThemeConfig.sidebarMode;
  }
}
