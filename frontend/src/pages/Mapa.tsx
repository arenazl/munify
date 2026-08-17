import { useEffect, useState, useMemo, useRef, useCallback, Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
  Polygon,
  Rectangle,
  Circle,
  CircleMarker,
} from 'react-leaflet';
import {
  X,
  MapPin,
  Calendar,
  User,
  Tag,
  Clock,
  Navigation,
  Square,
  FileDown,
  Flame,
  Pencil,
  Trash2,
  Loader2,
  Settings,
  MapPinOff,
  Eraser,
  Building2,
  LocateFixed,
  MapPinned,
  Pause,
  Play,
  AlarmClock,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { estadoColor, estadoLabel, estadoColors, estadoLabels } from '../lib/enums/reclamo';
import { reclamosApi, poiApi, modulosApi, zonasApi } from '../lib/api';
// Suite del estándar v2: la cabecera de módulo va ARRIBA DE TODO y la barra
// de controles es la tarjeta partida (toolbar + filtros). Reemplaza al
// StickyPageHeader viejo, que metía el título DEBAJO del hero.
import { PageHeader } from '../components/abmv2/PageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import { seg, type HeroFrase, type HeroKpi } from '../lib/semanticHero';
import { resolverUmbrales, veredictoMasEsPeor, veredictoMenosEsMejor } from '../lib/veredictos';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Slider } from '../components/ui/Slider';
import { ModernSelect } from '../components/ui/ModernSelect';
// LA botonera del kit: una sola implementación de barra de controles para toda
// la app. Reemplaza al `MapaFiltrosPanel` hecho a mano que vivía acá (toolbar
// + FilterBar propios): ahora los controles del Mapa se DECLARAN y el
// componente decide solo cómo presentarlos según el ancho.
import { AdaptiveFilter, type AdaptiveControl } from '../components/ui/AdaptiveFilter';
// LA consulta guiada del kit: la pantalla no ofrece herramientas con nombre
// técnico, ofrece PREGUNTAS en castellano y arma sola la oración con los
// filtros adentro. Agnóstica: no sabe nada de mapas ni de reclamos.
import {
  ConsultaGuiada,
  type ConsultaAccion,
  type ConsultaFiltro,
  type ConsultaSegmento,
} from '../components/ui/ConsultaGuiada';
import type { RankedListItem } from '../components/ui/RankedList';
import MapaPuntosPanel from '../components/mapa/MapaPuntosPanel';
import {
  Reclamo,
  type PuntoInteres,
  type PoiTipo,
  type PoiReclamosEnZonaResponse,
  type PoiConsolidarResponse,
  type PoiRecalcularResponse,
} from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import jsPDF from 'jspdf';

import {
  recurrentHotspots,
  convexHull,
  reclamosInBBox,
  isResuelto,
  isAbierto,
  computeKPIs,
  topZonas,
  Hotspot,
  BBox,
} from '../lib/mapaUtils';
import MapaStats from '../components/mapa/MapaStats';
import MapaTimelapseBanda, {
  type VelocidadTimelapse,
  type ComparacionVentana,
} from '../components/mapa/MapaTimelapseBanda';

/** Preset del filtro de período (días, o "todo"). */
type TimePreset = '7' | '30' | '90' | '365' | 'all';

// Fix para el icono de Leaflet en Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Tipo para leaflet.heat (no exporta tipos)
declare module 'leaflet' {
  interface HeatLayerInstance extends L.Layer {
    /** Reemplaza los puntos IN SITU (sin recrear la capa ni el canvas). */
    setLatLngs(latlngs: Array<[number, number, number?]>): HeatLayerInstance;
    redraw(): HeatLayerInstance;
  }
  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: { [key: number]: string };
    }
  ): HeatLayerInstance;
}

// Hack canónico de Leaflet+bundler: sacar el resolvedor de URL por defecto para
// que valgan las rutas de `mergeOptions`. Cast a Record (no `any`) para que el
// archivo pase eslint sin cambiar una coma del comportamiento.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

/** Tres tramos de la rampa de densidad (matices de veredicto del theme). */
interface RampaDensidad {
  baja: string;
  media: string;
  alta: string;
}

// Parámetros de detección de zonas calientes. Están acá (y no sueltos en la
// llamada) porque la lista de abajo del mapa MUESTRA estos números en su
// caption: el usuario tiene que leer con qué criterio se armó el ranking.
const HOTSPOT_PARAMS = { radiusMeters: 80, minPoints: 3, daysBack: 90 };

// Alto elástico del lienzo: toma lo que queda de viewport desde donde arranca
// el mapa, dejando aire abajo para que se asome la lista de zonas calientes.
// El piso evita que en una laptop quede aplastado.
const MAPA_ALTO_MIN = 420;
const MAPA_AIRE_INFERIOR = 96;

/** Ancla de la sección del ranking (la acción del hero scrollea acá). El id
 *  del DOM se mantiene estable aunque el ranking cambie de contenido con la
 *  pregunta: es la dirección a la que apuntan deep-links y verificaciones. */
const ID_RANKING = 'mapa-zonas-calientes';

/** Opciones del filtro Período. El label es lo que se LEE dentro de la
 *  oración de la consulta guiada, así que va en minúscula y con su
 *  preposición implícita ("en los últimos 30 días"). */
const PERIODOS = [
  { value: '', label: 'todo el período' },
  { value: '7', label: 'los últimos 7 días' },
  { value: '30', label: 'los últimos 30 días' },
  { value: '90', label: 'los últimos 90 días' },
  { value: '365', label: 'el último año' },
];

const DIA_MS = 24 * 60 * 60 * 1000;

// =====================================================================
// CONSULTA GUIADA — las cuatro preguntas del mapa
// =====================================================================
// Cambio de paradigma: la pantalla NO ofrece herramientas con nombre técnico
// (pins, calor, hotspots, capa, time-lapse) — nadie fuera del que la construyó
// sabe qué hace cada una. Ofrece PREGUNTAS en castellano y decide sola con qué
// las contesta. Cada pregunta define, en un solo lugar:
//   · la ORACIÓN que se lee arriba (con los filtros embebidos),
//   · el ALCANCE de los datos (qué reclamos entran),
//   · cómo se DIBUJA el lienzo (densidad o pines, y de qué color),
//   · si van los círculos de repetición,
//   · si el filtro de período significa algo para esa pregunta.
// El ranking de abajo y la línea de respuesta se derivan de la misma elección.

/** Id de pregunta; '' = "ver todo" (sin pregunta activa). */
type PreguntaId = 'repiten' | 'atrasado' | 'resolvimos' | 'sinllegar';
type ConsultaId = PreguntaId | '';

/** Días abiertos a partir de los cuales un reclamo cuenta como atrasado.
 *  Mismo umbral que el KPI "Abiertos > 30 días" del hero y del Dashboard: un
 *  solo idioma en toda la app. */
const DIAS_ATRASO = 30;

interface PreguntaConfig {
  id: PreguntaId;
  /** Lo que se lee en la píldora. */
  etiqueta: string;
  /** Lo mismo, pero como suena EN MEDIO de la oración (minúscula). */
  enfasis: string;
  plantilla: string;
  ayuda: string;
  icono: LucideIcon;
  /** Con qué se contesta: mancha de densidad o reclamos uno por uno. */
  dibujo: 'densidad' | 'puntos';
  /** Círculos sobre las esquinas que repiten. */
  repeticiones: boolean;
  /** Tinte fijo de los puntos; sin esto se pintan por estado. */
  tinte?: 'malo' | 'bueno' | 'tenue';
  /** ¿El período significa algo para esta pregunta? "Lo atrasado" es viejo por
   *  definición: acotarlo a "los últimos 7 días" daría siempre cero. */
  usaPeriodo: boolean;
}

const PREGUNTAS: PreguntaConfig[] = [
  {
    id: 'repiten',
    etiqueta: 'Dónde se repiten',
    enfasis: 'dónde se repiten',
    plantilla:
      'Mostrame {pregunta} los reclamos de {dependencia}, del tipo {categoria}, en {periodo}.',
    ayuda: 'Las esquinas donde vuelve a aparecer el mismo problema.',
    icono: Flame,
    dibujo: 'densidad',
    repeticiones: true,
    usaPeriodo: true,
  },
  {
    id: 'atrasado',
    etiqueta: 'Lo atrasado',
    enfasis: 'lo atrasado',
    plantilla:
      'Mostrame {pregunta} de {dependencia}, del tipo {categoria}: los que llevan más de 30 días abiertos.',
    ayuda: 'Reclamos todavía abiertos con más de 30 días encima.',
    icono: AlarmClock,
    dibujo: 'puntos',
    repeticiones: false,
    tinte: 'malo',
    usaPeriodo: false,
  },
  {
    id: 'resolvimos',
    etiqueta: 'Qué resolvimos',
    enfasis: 'qué resolvimos',
    plantilla:
      'Mostrame {pregunta} en {periodo}: los reclamos de {dependencia}, del tipo {categoria}, ya cerrados.',
    ayuda: 'Los reclamos que se cerraron dentro del período elegido.',
    icono: CheckCircle2,
    dibujo: 'puntos',
    repeticiones: false,
    tinte: 'bueno',
    usaPeriodo: true,
  },
  {
    id: 'sinllegar',
    etiqueta: 'Dónde no llegamos',
    enfasis: 'dónde no llegamos',
    plantilla:
      'Mostrame {pregunta}: los barrios que no registran ningún reclamo en {periodo}.',
    ayuda: 'Barrios del municipio sin un solo reclamo en el período.',
    icono: MapPinOff,
    // Con la mancha se ve de un vistazo hasta dónde SÍ llegamos, y los huecos
    // quedan rotulados con el nombre del barrio. Con un pin por reclamo (acá
    // son cientos) el mapa se llena justo de lo que la pregunta NO mira.
    dibujo: 'densidad',
    repeticiones: false,
    usaPeriodo: true,
  },
];

/** Salida discreta al costado de las preguntas. Es el ÚNICO lugar donde el
 *  estado es un filtro suelto: cada pregunta ya declara qué estados mira. */
const VER_TODO = {
  label: 'ver todo',
  enfasis: 'todos los reclamos',
  plantilla:
    'Mostrame {pregunta} de {categoria} en {periodo}, a cargo de {dependencia}, con estado {estado}.',
};

/** Días transcurridos desde una fecha ISO (piso, nunca negativo). */
const diasDesde = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DIA_MS));

/** Días que tardó en cerrarse un reclamo; null si no tiene fecha de cierre
 *  cargada — sin el dato no se estima nada. */
function diasResolucion(r: Reclamo): number | null {
  if (!r.fecha_resolucion) return null;
  const ms = new Date(r.fecha_resolucion).getTime() - new Date(r.created_at).getTime();
  return ms > 0 ? ms / DIA_MS : null;
}

/** Barrio/zona del catálogo del municipio (lo que devuelve GET /zonas). */
interface ZonaMunicipio {
  id: number;
  nombre: string;
  latitud_centro?: number | null;
  longitud_centro?: number | null;
}

/** Valor más repetido de una lista (ignora vacíos). */
function masRepetido(valores: Array<string | undefined>): string | undefined {
  const conteo = new Map<string, number>();
  for (const v of valores) {
    const k = (v || '').trim();
    if (!k) continue;
    conteo.set(k, (conteo.get(k) || 0) + 1);
  }
  let top: string | undefined;
  let max = 0;
  for (const [k, n] of conteo) {
    if (n > max) {
      max = n;
      top = k;
    }
  }
  return top;
}

// =====================================================================
// TIME-LAPSE — parámetros de la narración temporal del mapa
// =====================================================================
// El time-lapse NO acumula: barre el dataset con una VENTANA MÓVIL. La versión
// vieja filtraba `created_at <= fecha` desde la fecha más antigua, así que el
// mapa sólo podía EMPEORAR (cada paso sumaba manchas y ninguna se iba): eso no
// cuenta gestión, cuenta que el municipio existe hace tiempo. Con ventana, las
// zonas se ENCIENDEN cuando entra un foco y se APAGAN cuando se deja de
// reclamar ahí — que es exactamente la historia que hay para contar.
//
// TIMELAPSE_VENTANA_DIAS — ancho de la ventana visible. 30 días porque es el
// período con el que ya se lee el resto de la app (preset "Últimos 30 días",
// KPI "Abiertos > 30 días") y porque da masa suficiente para que el heatmap
// dibuje una mancha y no cuatro puntos sueltos.
const TIMELAPSE_VENTANA_DIAS = 30;

// TIMELAPSE_PASOS_OBJETIVO / TIMELAPSE_INTERVALO_MS — velocidad. El paso NO es
// fijo: se calcula para que el recorrido COMPLETO dure siempre lo mismo, mida
// el dataset 90 días o dos años. Con 30 pasos de 900 ms el recorrido tarda
// ~27 s, dentro de la banda de 20-40 s que pidió el dueño para poder narrarlo
// en vivo sin que se le escape ni aburra.
//   · dataset de 90 días → recorrido 60 d ÷ paso 2 d = 30 pasos ≈ 27 s
//   · dataset de 365 días → recorrido 335 d ÷ paso 12 d = 28 pasos ≈ 25 s
// Antes era paso FIJO de 7 días cada 800 ms: 90 días se despachaban en ~10 s
// (imposible de narrar) y un año tardaba casi un minuto.
const TIMELAPSE_PASOS_OBJETIVO = 30;
const TIMELAPSE_PASO_MIN_DIAS = 2;
/* Ritmo del recorrido. Con 900 ms el año entero tardaba ~25 s y la ventana
   se arrastraba: se veía muerto. A 520 ms la vuelta completa queda en ~14 s,
   que es el tiempo que alguien puede hablar encima sin que se haga largo. */
const TIMELAPSE_INTERVALO_MS = 520;

/** Estados del time-lapse. `pausado`/`finalizado` congelan la última ventana. */
type TimelapseEstado = 'inactivo' | 'reproduciendo' | 'pausado' | 'finalizado';

/** Plan del recorrido, derivado del rango real del dataset filtrado. */
interface TimelapsePlan {
  /** Ancho de la ventana móvil, en días. */
  ventanaDias: number;
  /** Días que avanza el cursor por tick. */
  pasoDias: number;
  /** Offset (días desde `min`) del primer y del último cursor. */
  cursorInicial: number;
  cursorFinal: number;
}

/**
 * Plan del time-lapse para un rango de fechas.
 *
 * El cursor es el FINAL de la ventana, así que arranca ya con una ventana
 * llena (empezar en 0 mostraría un mapa vacío durante el primer tercio del
 * recorrido). Si el dataset es más corto que la ventana nominal se usa un
 * tercio del recorrido: con una ventana más ancha que los datos, el time-lapse
 * mostraría siempre lo mismo y no narraría nada.
 */
function planificarTimelapse(rango: { min: number; max: number }): TimelapsePlan {
  const totalDias = Math.max(1, Math.ceil((rango.max - rango.min) / DIA_MS));
  const ventanaDias = Math.min(TIMELAPSE_VENTANA_DIAS, Math.max(1, Math.ceil(totalDias / 3)));
  const recorrido = Math.max(1, totalDias - ventanaDias);
  const pasoDias = Math.max(
    TIMELAPSE_PASO_MIN_DIAS,
    Math.ceil(recorrido / TIMELAPSE_PASOS_OBJETIVO),
  );
  return { ventanaDias, pasoDias, cursorInicial: ventanaDias, cursorFinal: totalDias };
}

/** Reclamos creados dentro de `[desde, hasta]` (ms epoch, ambos inclusive). */
function enVentana(lista: Reclamo[], desde: number, hasta: number): Reclamo[] {
  return lista.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= desde && t <= hasta;
  });
}

// =====================================================================
// ELECTRO — agrupado temporal del pulso del municipio
// =====================================================================
// El electro dibuja el PERÍODO COMPLETO que se está mirando, no la ventana.
// La resolución del agrupado se elige SOLA a partir del ancho del período:
// un año en 365 puntos es ilegible, y un mes en 12 barras mensuales no dice
// nada. Los cortes son los de la lectura natural del calendario (día,
// semana que arranca el lunes, mes).

type EscalaElectro = 'dia' | 'semana' | 'mes';

/** Escala de agrupado según el ancho del período, en días. */
function escalaElectro(spanDias: number): EscalaElectro {
  if (spanDias <= 31) return 'dia';
  if (spanDias <= 180) return 'semana';
  return 'mes';
}

/** Comienzo del tramo que contiene `ms` (medianoche local / lunes / día 1). */
function inicioTramo(ms: number, escala: EscalaElectro): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (escala === 'semana') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else if (escala === 'mes') d.setDate(1);
  return d.getTime();
}

/** Comienzo del tramo siguiente. */
function siguienteTramo(ms: number, escala: EscalaElectro): number {
  const d = new Date(ms);
  if (escala === 'dia') d.setDate(d.getDate() + 1);
  else if (escala === 'semana') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** Cambio de un barrio entre dos períodos. */
interface CambioBarrio {
  nombre: string;
  previo: number;
  actual: number;
  /** actual - previo (negativo = bajó). */
  delta: number;
}

/** Conteo por barrio. Los reclamos sin zona NO entran: no se inventa un barrio. */
function contarPorBarrio(lista: Reclamo[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const r of lista) {
    const nombre = r.zona?.nombre?.trim();
    if (!nombre) continue;
    conteo.set(nombre, (conteo.get(nombre) || 0) + 1);
  }
  return conteo;
}

/**
 * Compara dos períodos y devuelve el barrio que MÁS creció y el que MÁS bajó.
 *
 * ÚNICA implementación de esa cuenta en la pantalla: la usa el KPI "Barrio que
 * más creció" del hero (con las dos mitades del rango observado) y el remate
 * del time-lapse (con la primera ventana contra la última). Antes vivía suelta
 * dentro del memo del KPI; el remate la habría duplicado.
 */
function compararBarrios(
  previo: Reclamo[],
  actual: Reclamo[],
): { subio: CambioBarrio | null; bajo: CambioBarrio | null } {
  const antes = contarPorBarrio(previo);
  const despues = contarPorBarrio(actual);
  let subio: CambioBarrio | null = null;
  let bajo: CambioBarrio | null = null;
  for (const nombre of new Set([...antes.keys(), ...despues.keys()])) {
    const p = antes.get(nombre) || 0;
    const a = despues.get(nombre) || 0;
    const delta = a - p;
    if (delta > 0 && (!subio || delta > subio.delta)) subio = { nombre, previo: p, actual: a, delta };
    if (delta < 0 && (!bajo || delta < bajo.delta)) bajo = { nombre, previo: p, actual: a, delta };
  }
  return { subio, bajo };
}

/** Barrio dominante de un conjunto (el más repetido). Sin zonas → undefined. */
function barrioDominante(lista: Reclamo[]): { nombre: string; count: number } | null {
  let top: { nombre: string; count: number } | null = null;
  for (const [nombre, count] of contarPorBarrio(lista)) {
    if (!top || count > top.count) top = { nombre, count };
  }
  return top;
}

/** "8 jul" — formato corto para el rango del time-lapse (no se repite el año). */
const fechaCorta = (ms: number) =>
  new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

/** "8 de julio" — formato largo para la frase narrada del hero. */
const fechaLarga = (ms: number) =>
  new Date(ms).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

/** Etiqueta del eje del electro: con tramos mensuales el día no significa
 *  nada ("1 ago" para todo agosto engaña), así que se rotula el mes. */
const fechaEje = (ms: number, escala: EscalaElectro) =>
  escala === 'mes'
    ? new Date(ms).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    : fechaCorta(ms);

// =====================================================================
// IDENTIDAD VISUAL DE CADA ÁREA (dependencia)
// =====================================================================
// Cada área se reconoce por DOS señales a la vez: su color y su glifo. Con
// una sola no alcanza — los pines se apilan y hay daltonismo; con las dos, la
// silueta distingue aunque el color no se lea.
//
// Lo primero es SIEMPRE lo que el municipio configuró en la dependencia
// (`color` / `icono`). Estas listas son el paracaídas para el área que quedó
// sin configurar: se reparten por posición, así que son estables entre
// renders y dos áreas nunca comparten señal mientras haya cupo.
const COLORES_AREA = [
  '#2563eb', '#16a34a', '#d97706', '#9333ea',
  '#0891b2', '#db2777', '#65a30d', '#c2410c',
];
const ICONOS_AREA = [
  'wrench', 'construction', 'traffic-cone', 'dog',
  'shield', 'trash-2', 'droplet', 'lightbulb',
];

/** Color del área: el configurado manda; si no hay, uno estable por posición. */
const colorDeArea = (color: string | undefined | null, idx: number) =>
  color || COLORES_AREA[idx % COLORES_AREA.length];

/** Glifo del área: el configurado manda; si no hay, uno estable por posición. */
const iconoDeArea = (icono: string | undefined | null, idx: number) =>
  icono || ICONOS_AREA[idx % ICONOS_AREA.length];

// =====================================================================
// Pin: gota del color del área, con el glifo del área adentro
// =====================================================================
// `glifo` es el SVG del icono lucide ya renderizado a markup (lo precarga la
// página: los imports de lucide son asíncronos y Leaflet necesita HTML
// sincrónico). Sin glifo se dibuja el punto blanco de siempre, así que el pin
// nunca queda a medio dibujar mientras el icono viaja.
const createPinIcon = (color: string, glifo?: string) =>
  L.divIcon({
    className: 'custom-pin-marker',
    html: `
      <div style="position: relative; width: 30px; height: 42px;">
        <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.716 23.284 0 15 0z" fill="${color}"/>
          <circle cx="15" cy="15" r="9" fill="white"/>
        </svg>
        ${glifo
          ? `<div style="position:absolute;top:6px;left:9px;width:12px;height:12px;color:${color};">${glifo}</div>`
          : ''}
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
  });

// =====================================================================
// DIAGNÓSTICO DEL MAPA
// =====================================================================
// El mapa decide qué dibuja a través de varias capas encadenadas (pregunta →
// alcance → tiempo → modo de dibujo) y cuando lo que se ve no coincide con lo
// que se espera, desde afuera no hay forma de saber en cuál se perdió. Estos
// logs cuentan cada eslabón.
//
// Se apagan desde la consola con: localStorage.setItem('mapaDebug', '0')
const debugMapa = () => {
  try { return localStorage.getItem('mapaDebug') !== '0'; } catch { return true; }
};
const logMapa = (evento: string, datos?: unknown) => {
  if (!debugMapa()) return;
  if (datos === undefined) console.log(`[mapa] ${evento}`);
  else console.log(`[mapa] ${evento}`, datos);
};

/**
 * Glifo de un icono lucide como markup SVG, listo para meter en el HTML de un
 * divIcon de Leaflet.
 *
 * Por qué con cache y asincrónico: lucide entrega los iconos por import
 * dinámico (uno por archivo, para no arrastrar el set entero al bundle), y
 * Leaflet arma el marcador con un string HTML sincrónico. Se resuelve una vez
 * por icono y queda cacheado a nivel módulo: son 5 o 6 áreas, no 160 pines.
 */
const glifoCache = new Map<string, string>();

async function cargarGlifo(nombre: string): Promise<string | null> {
  const kebab = nombre
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  const cacheado = glifoCache.get(kebab);
  if (cacheado) return cacheado;
  const importer = dynamicIconImports[kebab as keyof typeof dynamicIconImports];
  if (!importer) {
    logMapa(`glifo "${nombre}" -> NO EXISTE en lucide (buscado como "${kebab}")`);
    return null;
  }
  try {
    const mod = await importer();
    const svg = renderToStaticMarkup(
      createElement(mod.default, { size: 12, strokeWidth: 2.75, color: 'currentColor' }),
    );
    glifoCache.set(kebab, svg);
    logMapa(`glifo "${kebab}" resuelto (${svg.length} chars)`);
    return svg;
  } catch (e) {
    logMapa(`glifo "${kebab}" FALLO al renderizar`, e);
    return null;
  }
}

// =====================================================================
// Marker de POI (modo Puntos): círculo relleno con el color del tipo.
// Se diferencia del pin de reclamo (gota) para no confundir capas.
// =====================================================================
const createPoiIcon = (color: string, selected = false, sizeOverride?: number) => {
  const size = sizeOverride ?? (selected ? 30 : 24);
  const border = size <= 16 ? 2 : 3;
  return L.divIcon({
    className: 'custom-poi-marker',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Estados: color/label canónicos vienen del SSoT `lib/enums/reclamo.ts`.
// Para los combos/leyendas hijos (MapaFiltrosPanel, MapaStats) se pasa el mapa
// de colores SIN la key 'default' (que no es un estado real, solo el fallback).
const ESTADO_COLORS_LISTA: Record<string, string> = Object.fromEntries(
  Object.entries(estadoColors).filter(([k]) => k !== 'default'),
);

// =====================================================================
// Componentes auxiliares dentro del mapa
// =====================================================================
function FitBoundsToMarkers({ reclamos, signal }: { reclamos: Reclamo[]; signal: number }) {
  const map = useMap();
  const lastSignal = useRef(-1);

  useEffect(() => {
    if (signal === lastSignal.current) return;
    lastSignal.current = signal;
    if (reclamos.length === 0) return;
    const timer = setTimeout(() => {
      const valid = reclamos.filter(r => r.latitud != null && r.longitud != null);
      if (valid.length === 0) return;
      map.invalidateSize();
      if (valid.length === 1) {
        map.setView([valid[0].latitud!, valid[0].longitud!], 15);
      } else {
        const latlngs = valid.map(r => L.latLng(r.latitud!, r.longitud!));
        map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 15 });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [reclamos, map, signal]);

  return null;
}

/**
 * Capa de calor. El gradiente NO es una paleta propia: son los tres matices
 * de VEREDICTO del theme (bueno → advertencia → malo) que la página lee de
 * los tokens --pl-*. Así el mapa sigue al tema y a la marca, y la leyenda de
 * densidad de abajo a la izquierda dice exactamente lo que se ve.
 */
function HeatLayer({ reclamos, rampa }: { reclamos: Reclamo[]; rampa: RampaDensidad }) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayerInstance | null>(null);

  const puntos = useMemo(
    () =>
      reclamos
        .filter((r) => r.latitud != null && r.longitud != null)
        .map((r) => [r.latitud!, r.longitud!, 1] as [number, number, number]),
    [reclamos],
  );

  // La capa se crea UNA vez (y sólo se rehace si cambia el mapa o la rampa: el
  // gradiente es opción de construcción de leaflet.heat, no se puede mutar).
  useEffect(() => {
    const heat = L.heatLayer([], {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      max: 3,
      minOpacity: 0.45,
      gradient: {
        0.0: rampa.baja,
        0.55: rampa.media,
        1.0: rampa.alta,
      },
    });
    heat.addTo(map);
    layerRef.current = heat;
    return () => {
      map.removeLayer(heat);
      layerRef.current = null;
    };
  }, [map, rampa]);

  // Los PUNTOS se actualizan in situ. Es el camino caliente: durante el
  // time-lapse esto corre ~30 veces por reproducción, y recrear la capa (lo que
  // hacía la versión anterior) significaba destruir y re-agregar un canvas al
  // mapa en cada tick — jank garantizado y capas huérfanas si un tick pisaba al
  // cleanup del anterior.
  useEffect(() => {
    layerRef.current?.setLatLngs(puntos);
  }, [puntos]);

  return null;
}

/**
 * El lienzo del mapa es ELÁSTICO (toma el alto libre del viewport). Leaflet
 * no se entera solo de que su contenedor cambió: sin `invalidateSize()` deja
 * tiles a medio dibujar y el fitBounds queda descentrado. Un ResizeObserver
 * sobre el contenedor cubre TODOS los casos (resize de ventana, colapso del
 * sidebar, cambio del alto calculado), no sólo el `window.resize`.
 */
function InvalidarAlRedimensionar() {
  const map = useMap();
  useEffect(() => {
    const contenedor = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(contenedor);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function HotspotLayer({ hotspots }: { hotspots: Hotspot[] }) {
  return (
    <>
      {hotspots.map((h, idx) => (
        <CircleMarker
          key={`hotspot-${idx}-${h.centerLat}`}
          center={[h.centerLat, h.centerLng]}
          radius={Math.min(8 + h.recientes * 2, 22)}
          pathOptions={{
            color: '#ef4444',
            weight: 2,
            fillColor: '#ef4444',
            fillOpacity: 0.25,
            className: 'hotspot-pulse',
          }}
        >
          <Tooltip direction="top" permanent={false}>
            <div className="text-xs">
              <p className="font-bold text-red-600 flex items-center gap-1"><Flame size={12} /> Hotspot recurrente</p>
              <p>{h.recientes} reclamos en 90 días</p>
              {h.topDireccion && <p className="text-gray-600">{h.topDireccion}</p>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

/** Etiqueta anclada sobre una zona del mapa. */
interface RotuloMapa {
  id: string;
  lat: number;
  lng: number;
  texto: string;
  tono?: 'malo' | 'bueno' | 'advertencia';
}

/**
 * El mapa ESCRIBE SOBRE SÍ MISMO: además de pintar, rotula las zonas que
 * contestan la pregunta elegida ("10 reclamos · higiene urbana", "sin
 * reclamos hace 120 días"). Son POCAS a propósito (3-4): la gracia es que se
 * lean de un vistazo, no tapar el mapa.
 *
 * Se resuelven con tooltips PERMANENTES de Leaflet colgados de un punto
 * invisible — más liviano que un marker y sin sumar una capa nueva. El estilo
 * sale de `.av2-rotulo` (abmv2.css [MAPA]) sobre tokens --pl-*.
 */
function RotulosLayer({ rotulos }: { rotulos: RotuloMapa[] }) {
  return (
    <>
      {rotulos.map((r, i) => {
        // Se alternan arriba/abajo: dos zonas calientes vecinas ponían sus dos
        // etiquetas en el mismo renglón y una tapaba a la otra.
        const arriba = i % 2 === 0;
        return (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={1}
            interactive={false}
            pathOptions={{ opacity: 0, fillOpacity: 0 }}
          >
            <Tooltip
              permanent
              direction={arriba ? 'top' : 'bottom'}
              offset={[0, arriba ? -8 : 8]}
              className={`av2-rotulo${r.tono ? ` av2-rotulo--${r.tono}` : ''}`}
            >
              {r.texto}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function CoveragePolygon({ points, color }: { points: Array<[number, number]>; color: string }) {
  const hull = useMemo(() => convexHull(points), [points]);
  if (hull.length < 3) return null;
  return (
    <Polygon
      positions={hull}
      pathOptions={{
        color,
        weight: 2,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.12,
        dashArray: '6 4',
      }}
    />
  );
}

interface DrawHandlerProps {
  active: boolean;
  onComplete: (bbox: BBox) => void;
  onCancel: () => void;
}

function DrawHandler({ active, onComplete, onCancel }: DrawHandlerProps) {
  const map = useMap();
  const startRef = useRef<L.LatLng | null>(null);
  const previewRef = useRef<L.Rectangle | null>(null);

  useEffect(() => {
    if (!active) {
      // Restaurar mapa
      map.dragging.enable();
      map.boxZoom.disable();
      map.getContainer().style.cursor = '';
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
      startRef.current = null;
      return;
    }
    map.dragging.disable();
    map.getContainer().style.cursor = 'crosshair';

    const onDown = (e: L.LeafletMouseEvent) => {
      startRef.current = e.latlng;
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (!startRef.current) return;
      const bounds = L.latLngBounds(startRef.current, e.latlng);
      if (previewRef.current) {
        previewRef.current.setBounds(bounds);
      } else {
        previewRef.current = L.rectangle(bounds, {
          color: '#3b82f6',
          weight: 2,
          fillOpacity: 0.1,
          dashArray: '4 4',
        }).addTo(map);
      }
    };
    const onUp = (e: L.LeafletMouseEvent) => {
      if (!startRef.current) return;
      const bounds = L.latLngBounds(startRef.current, e.latlng);
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      if (Math.abs(sw.lat - ne.lat) < 0.0005 || Math.abs(sw.lng - ne.lng) < 0.0005) {
        // Click sin drag — cancelar
        if (previewRef.current) {
          map.removeLayer(previewRef.current);
          previewRef.current = null;
        }
        startRef.current = null;
        onCancel();
        return;
      }
      onComplete({
        minLat: sw.lat,
        maxLat: ne.lat,
        minLng: sw.lng,
        maxLng: ne.lng,
      });
      startRef.current = null;
    };

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);

    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
    };
  }, [active, map, onComplete, onCancel]);

  return null;
}

// Recentrar el mapa programáticamente
function MapController({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 16, { duration: 0.6 });
  }, [target, map]);
  return null;
}

// Click en el mapa (modo Puntos) -> crear POI en esas coords.
function PoiClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      // Ignorar el click que precede a un doble-click (zoom): sin esto, hacer
      // doble-click para acercar abriría el Sheet de "nuevo punto".
      if ((e.originalEvent?.detail ?? 1) > 1) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Fit-bounds genérico sobre una lista de coords (modo Puntos). Mismo patrón que
// FitBoundsToMarkers pero desacoplado del tipo Reclamo.
function FitBoundsToLatLngs({ points, signal }: { points: Array<[number, number]>; signal: number }) {
  const map = useMap();
  const lastSignal = useRef(-1);
  useEffect(() => {
    if (signal === lastSignal.current) return;
    lastSignal.current = signal;
    if (points.length === 0) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) {
        map.setView(points[0], 15);
      } else {
        const latlngs = points.map((p) => L.latLng(p[0], p[1]));
        map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 15 });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [points, map, signal]);
  return null;
}

// =====================================================================
// Componente principal
// =====================================================================
// ViewMode y TimePreset se importan desde MapaFiltrosPanel

// v3: la pantalla pasó de herramientas a CONSULTA GUIADA. `viewMode` y
// `showHotspots` dejaron de existir como preferencia del usuario (los deriva
// la pregunta elegida) y en su lugar se persiste `pregunta`. Versionar la key
// descarta los shapes viejos sin tener que migrarlos.
const FILTROS_STORAGE_KEY = 'mapa_filtros_v3';

type MapMode = 'reclamos' | 'puntos';

interface FiltrosPersistidos {
  filtroEstado: string | null;
  filtroDependencia: number | null;
  timePreset: TimePreset;
  showCoverage: boolean;
  showPois: boolean;
  mapMode: MapMode;
  pregunta: ConsultaId;
}

const DEFAULT_FILTROS: FiltrosPersistidos = {
  filtroEstado: null,
  filtroDependencia: null,
  timePreset: 'all',
  // APAGADA por defecto: el polígono de cobertura es un velo que cubre toda
  // la ciudad y tiñe los pines que están debajo (los verdes de "qué
  // resolvimos" se veían marrones). Es una capa de consulta puntual, no algo
  // que tenga que estar prendido al entrar.
  showCoverage: false,
  showPois: false,
  mapMode: 'reclamos',
  // La pantalla ABRE YA CONTESTADA: nadie tiene que elegir entre cosas que
  // todavía no conoce para ver algo.
  pregunta: 'repiten',
};

function loadFiltrosFromStorage(): FiltrosPersistidos {
  try {
    const raw = localStorage.getItem(FILTROS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTROS;
    const parsed = JSON.parse(raw);
    return {
      filtroEstado:
        typeof parsed.filtroEstado === 'string' || parsed.filtroEstado === null
          ? parsed.filtroEstado
          : DEFAULT_FILTROS.filtroEstado,
      filtroDependencia:
        typeof parsed.filtroDependencia === 'number' ||
        parsed.filtroDependencia === null
          ? parsed.filtroDependencia
          : DEFAULT_FILTROS.filtroDependencia,
      timePreset: ['7', '30', '90', '365', 'all'].includes(parsed.timePreset)
        ? (parsed.timePreset as TimePreset)
        : DEFAULT_FILTROS.timePreset,
      pregunta:
        parsed.pregunta === '' || PREGUNTAS.some((p) => p.id === parsed.pregunta)
          ? (parsed.pregunta as ConsultaId)
          : DEFAULT_FILTROS.pregunta,
      showCoverage:
        typeof parsed.showCoverage === 'boolean'
          ? parsed.showCoverage
          : DEFAULT_FILTROS.showCoverage,
      showPois:
        typeof parsed.showPois === 'boolean'
          ? parsed.showPois
          : DEFAULT_FILTROS.showPois,
      mapMode: ['reclamos', 'puntos'].includes(parsed.mapMode)
        ? (parsed.mapMode as MapMode)
        : DEFAULT_FILTROS.mapMode,
    };
  } catch {
    return DEFAULT_FILTROS;
  }
}

function saveFiltrosToStorage(f: FiltrosPersistidos) {
  try {
    localStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* noop */
  }
}

// Estado del form de POI (Sheet crear/editar). lat/long se editan por drag/click
// en el mapa, no a mano — acá se guardan para el payload y para mostrarlas.
interface PoiFormState {
  nombre: string;
  tipo_id: number | null;
  direccion: string;
  radio_metros: number;
  activo: boolean;
  notas: string;
  latitud: number;
  longitud: number;
}

const POI_RADIO_DEFAULT = 2000;

const POI_FORM_VACIO: PoiFormState = {
  nombre: '',
  tipo_id: null,
  direccion: '',
  radio_metros: POI_RADIO_DEFAULT,
  activo: true,
  notas: '',
  latitud: 0,
  longitud: 0,
};

export default function Mapa() {
  const { theme } = useTheme();
  const { user, municipioActual } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isDarkTheme = (() => {
    const hex = theme.background?.replace('#', '') || '';
    if (hex.length !== 6) return true;
    const n = parseInt(hex, 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff)) / 255;
    return lum < 0.5;
  })();
  const tileUrl = isDarkTheme ? TILE_URLS.dark : TILE_URLS.light;

  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  // Total CRUDO traído de la API (con y sin coordenada). `reclamos` guarda sólo
  // los georreferenciados — los otros no se pueden dibujar. La diferencia entre
  // los dos números es el KPI "Georreferenciados": un reclamo sin coordenada es
  // un reclamo invisible en esta pantalla, y eso es accionable.
  const [totalCargados, setTotalCargados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Reclamo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filtros (con persistencia en localStorage)
  const initialFiltros = useMemo(() => loadFiltrosFromStorage(), []);
  const [filtroEstado, setFiltroEstado] = useState<string | null>(initialFiltros.filtroEstado);
  const filtroCategoria = searchParams.get('categoria');
  const [filtroDependencia, setFiltroDependencia] = useState<number | null>(initialFiltros.filtroDependencia);
  const [timePreset, setTimePreset] = useState<TimePreset>(initialFiltros.timePreset);

  // La PREGUNTA activa manda sobre casi todo lo demás: qué reclamos entran,
  // cómo se dibuja el mapa, qué dice la respuesta y qué rankea la lista de
  // abajo. '' = "ver todo" (sin pregunta).
  const [pregunta, setPregunta] = useState<ConsultaId>(initialFiltros.pregunta);

  const [showCoverage, setShowCoverage] = useState(initialFiltros.showCoverage);

  // Capa opcional de Puntos de Interés sobre el mapa de RECLAMOS (no confundir
  // con el modo Puntos, que es una superficie propia). Persistida en la misma key.
  const [showPois, setShowPois] = useState(initialFiltros.showPois);

  // Modo del mapa: Reclamos (default) | Puntos (POI). Persistido en la misma key.
  const [mapMode, setMapMode] = useState<MapMode>(initialFiltros.mapMode);

  // Persistir filtros cuando cambian
  useEffect(() => {
    saveFiltrosToStorage({
      filtroEstado,
      filtroDependencia,
      timePreset,
      showCoverage,
      showPois,
      mapMode,
      pregunta,
    });
  }, [filtroEstado, filtroDependencia, timePreset, showCoverage, showPois, mapMode, pregunta]);

  // =================================================================
  // MODO PUNTOS (POI) — gate por módulo activo + rol admin/supervisor
  // =================================================================
  const [poiEnabled, setPoiEnabled] = useState(false);
  useEffect(() => {
    if (!user) {
      setPoiEnabled(false);
      return;
    }
    modulosApi
      .list()
      .then((r) => {
        const rows = (r.data || []) as Array<{ modulo: string; activo: boolean }>;
        setPoiEnabled(rows.some((m) => m.modulo === 'poi' && m.activo));
      })
      .catch(() => setPoiEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.municipio_id]);

  const canUsePoi = poiEnabled && (user?.rol === 'admin' || user?.rol === 'supervisor');
  const isPuntos = canUsePoi && mapMode === 'puntos';

  // Estado del modo Puntos
  const [pois, setPois] = useState<PuntoInteres[]>([]);
  const [tipos, setTipos] = useState<PoiTipo[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiSearch, setPoiSearch] = useState('');
  const [poiCounts, setPoiCounts] = useState<Record<number, number>>({});
  const [poiCountsLoading, setPoiCountsLoading] = useState(false);
  const [poiFitSignal, setPoiFitSignal] = useState(0);
  // Bump para remontar los markers (snap-back tras cancelar un drag).
  const [poiRevision, setPoiRevision] = useState(0);
  const [recalculando, setRecalculando] = useState(false);
  const [consolidatingId, setConsolidatingId] = useState<number | null>(null);
  const [poiSelectedId, setPoiSelectedId] = useState<number | null>(null);

  // Sheet de POI (crear/editar)
  const [poiSheetOpen, setPoiSheetOpen] = useState(false);
  const [poiEditing, setPoiEditing] = useState<PuntoInteres | null>(null);
  const [poiSaving, setPoiSaving] = useState(false);
  const [poiForm, setPoiForm] = useState<PoiFormState>(POI_FORM_VACIO);
  const [poiToDelete, setPoiToDelete] = useState<PuntoInteres | null>(null);
  const [poiDragPending, setPoiDragPending] = useState<{ poi: PuntoInteres; lat: number; lng: number } | null>(null);

  // Cargar counts de reclamos-en-zona por POI (una request por punto).
  const loadPoiCounts = useCallback(async (list: PuntoInteres[]) => {
    if (list.length === 0) {
      setPoiCounts({});
      return;
    }
    setPoiCountsLoading(true);
    try {
      const results = await Promise.all(
        list.map((p) =>
          poiApi
            .reclamosEnZona(p.id)
            .then((r) => [p.id, (r.data as PoiReclamosEnZonaResponse).total] as const)
            .catch(() => [p.id, 0] as const),
        ),
      );
      const map: Record<number, number> = {};
      for (const [id, c] of results) map[id] = c;
      setPoiCounts(map);
    } finally {
      setPoiCountsLoading(false);
    }
  }, []);

  const cargarPois = useCallback(async () => {
    setPoiLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        poiApi.listTipos({ activo: true }),
        poiApi.listPuntos(),
      ]);
      setTipos((tRes.data || []) as PoiTipo[]);
      const list = (pRes.data || []) as PuntoInteres[];
      setPois(list);
      setPoiRevision((r) => r + 1);
      setPoiFitSignal((s) => s + 1);
      loadPoiCounts(list);
    } catch {
      toast.error('Error cargando los puntos de interés');
    } finally {
      setPoiLoading(false);
    }
  }, [loadPoiCounts]);

  // Cargar POIs al habilitarse el modo (una vez que el gate resuelve).
  useEffect(() => {
    if (canUsePoi) cargarPois();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUsePoi]);

  // Time-lapse (parámetros y semántica: constantes TIMELAPSE_* del encabezado).
  // `animationDay` = offset EN DÍAS del FINAL de la ventana móvil respecto de
  // la fecha más vieja del dataset. El ref lo espeja porque el tick del
  // intervalo necesita leer el valor vigente sin re-suscribirse en cada paso.
  const [tlEstado, setTlEstado] = useState<TimelapseEstado>('inactivo');
  const [tlBucle, setTlBucle] = useState(false);
  /** Multiplicador de velocidad del recorrido (1x = el intervalo nominal). */
  const [tlVelocidad, setTlVelocidad] = useState<VelocidadTimelapse>(1);
  const [animationDay, setAnimationDay] = useState(0);
  const animationDayRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  // Dibujo
  const [drawMode, setDrawMode] = useState(false);
  const [drawnBBox, setDrawnBBox] = useState<BBox | null>(null);

  // Recentrado programático
  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  // =================================================================
  // Carga de datos en lotes
  // =================================================================
  useEffect(() => {
    const fetchReclamosEnLotes = async () => {
      try {
        const BATCH_SIZE = 100;
        let allReclamos: Reclamo[] = [];
        // Ids CRUDOS (con y sin coordenada). Se deduplica igual que la lista
        // dibujable: si un lote repite un id, el denominador del KPI de
        // georreferenciación no puede inflarse.
        const idsCrudos = new Set<number>();
        let skip = 0;
        let hasMore = true;
        let isFirstBatch = true;

        while (hasMore) {
          if (!isFirstBatch) setLoadingMore(true);
          const response = await reclamosApi.getAll({ skip, limit: BATCH_SIZE });
          const batch = response.data || [];
          const conUbicacion = batch.filter((r: Reclamo) => r.latitud && r.longitud);
          for (const r of batch as Reclamo[]) idsCrudos.add(r.id);
          setTotalCargados(idsCrudos.size);
          allReclamos = [...allReclamos, ...conUbicacion];

          const idsVistos = new Set<number>();
          const sinDuplicados = allReclamos.filter(r => {
            if (idsVistos.has(r.id)) return false;
            idsVistos.add(r.id);
            return true;
          });
          setReclamos(sinDuplicados);

          if (isFirstBatch) {
            setLoading(false);
            isFirstBatch = false;
          }
          if (batch.length < BATCH_SIZE) hasMore = false;
          else skip += BATCH_SIZE;
        }
      } catch (error) {
        console.error('Error cargando reclamos:', error);
        setLoading(false);
      } finally {
        setLoadingMore(false);
      }
    };
    fetchReclamosEnLotes();
  }, []);

  // Catálogo de zonas/barrios del municipio: es el DENOMINADOR del KPI de
  // cobertura territorial (a cuántos barrios llegamos de los que existen).
  // Si el muni no tiene zonas cargadas, el KPI no se muestra — no se inventa.
  // Se leen también las coordenadas del centro (si el muni las cargó): son las
  // que permiten ROTULAR sobre el mapa un barrio al que no llegamos. Si no
  // están, se cae al centroide de sus propios reclamos históricos y, si tampoco
  // hay, el barrio sólo aparece en la lista — nunca se inventa una coordenada.
  const [zonasMunicipio, setZonasMunicipio] = useState<ZonaMunicipio[]>([]);
  useEffect(() => {
    zonasApi
      .getAll(true)
      .then((r) => setZonasMunicipio((r.data || []) as ZonaMunicipio[]))
      .catch(() => setZonasMunicipio([]));
  }, []);

  // =================================================================
  // Lienzo elástico: el mapa toma el alto libre del viewport
  // =================================================================
  // Un alto fijo desperdicia media pantalla en un monitor grande y ahoga el
  // mapa en una laptop. Se mide UNA vez (y en cada resize) dónde arranca el
  // lienzo dentro del documento y se le da todo lo que queda hasta el borde
  // del viewport, menos el aire de la lista de abajo. Leaflet se entera del
  // cambio por el ResizeObserver de <InvalidarAlRedimensionar />.
  const lienzoRef = useRef<HTMLDivElement>(null);
  const [mapaAlto, setMapaAlto] = useState(MAPA_ALTO_MIN);

  useEffect(() => {
    const recalcular = () => {
      const el = lienzoRef.current;
      if (!el) return;
      // Offset dentro del DOCUMENTO (independiente del scroll actual).
      const arranque = el.getBoundingClientRect().top + window.scrollY;
      const disponible = window.innerHeight - arranque - MAPA_AIRE_INFERIOR;
      setMapaAlto(Math.max(MAPA_ALTO_MIN, Math.round(disponible)));
    };
    recalcular();
    window.addEventListener('resize', recalcular);
    // Segunda pasada tras el primer pintado: el hero y la barra de controles
    // recién ahí tienen su alto real (fuentes + KPIs + wrap de los combos).
    const t = window.setTimeout(recalcular, 300);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.clearTimeout(t);
    };
  }, [isPuntos, loading]);

  // Rampa de densidad: los 3 matices de veredicto del theme activo. Leaflet y
  // la leyenda necesitan colores concretos, así que salen de los MISMOS
  // tokens que usa el CSS (patrón polimórfico, cero hex fijos).
  const rampaDensidad = useMemo<RampaDensidad>(() => {
    const cs = getComputedStyle(document.documentElement);
    const leer = (token: string, fallback: string) =>
      cs.getPropertyValue(token).trim() || fallback;
    return {
      baja: leer('--pl-green', theme.primary),
      media: leer('--pl-amber-strong', theme.primary),
      alta: leer('--pl-red', theme.primary),
    };
  }, [theme.primary]);

  /** Los matices de veredicto en color CONCRETO: Leaflet dibuja con valores,
   *  no con custom properties. Salen de los MISMOS tokens que el CSS, así el
   *  mapa sigue al theme y a la marca en vez de quedar clavado en un hex. */
  const tintesMapa = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const leer = (token: string, fallback: string) =>
      cs.getPropertyValue(token).trim() || fallback;
    return {
      malo: leer('--pl-red', theme.primary),
      bueno: leer('--pl-green', theme.primary),
      tenue: leer('--pl-text-muted', theme.textSecondary),
    };
  }, [theme.primary, theme.textSecondary]);

  // =================================================================
  // Universos derivados
  // =================================================================
  // Lista de dependencias presentes en los datos
  const dependenciasDisponibles = useMemo(() => {
    // `color`/`icono` entran como vienen de la config (pueden faltar) y salen
    // ya resueltos abajo, con el reparto por posición.
    const map = new Map<
      number,
      { id: number; nombre: string; color?: string | null; icono?: string | null; count: number }
    >();
    for (const r of reclamos) {
      const d = r.dependencia_asignada;
      if (!d) continue;
      const id = d.id;
      const existing = map.get(id);
      if (existing) existing.count += 1;
      else
        map.set(id, {
          id,
          nombre: d.nombre || `Dependencia #${id}`,
          color: d.color,
          icono: d.icono,
          count: 1,
        });
    }
    // El color y el glifo de reserva se reparten DESPUÉS de ordenar: la señal
    // de cada área queda atada a su posición (la que más reclamos tiene, la
    // primera) y no al orden en que aparecieron en el listado, que cambia con
    // cualquier filtro.
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map((d, idx) => ({
        ...d,
        color: colorDeArea(d.color, idx),
        icono: iconoDeArea(d.icono, idx),
      }));
  }, [reclamos]);

  /** Señal visual por área, para resolver el pin de cada reclamo en O(1). */
  const areaPorId = useMemo(() => {
    const m = new Map<number, { color: string; icono: string }>();
    for (const d of dependenciasDisponibles) m.set(d.id, { color: d.color, icono: d.icono });
    return m;
  }, [dependenciasDisponibles]);

  // Glifos de las áreas presentes, resueltos una vez. Son tantos como áreas
  // (cinco o seis), no como reclamos.
  const [glifosArea, setGlifosArea] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    logMapa(
      `areas detectadas en los datos: ${dependenciasDisponibles.length}`,
      dependenciasDisponibles.map((d) => ({
        id: d.id, nombre: d.nombre, reclamos: d.count, color: d.color, icono: d.icono,
      })),
    );
    const nombres = Array.from(new Set(dependenciasDisponibles.map((d) => d.icono)));
    if (nombres.length === 0) {
      logMapa('sin areas -> no hay glifos que cargar (todos los pines caen al tinte de la pregunta)');
      return;
    }
    Promise.all(nombres.map(async (n) => [n, await cargarGlifo(n)] as const)).then((pares) => {
      if (!vivo) return;
      const nuevos: Record<string, string> = {};
      for (const [n, svg] of pares) if (svg) nuevos[n] = svg;
      logMapa(`glifos: ${Object.keys(nuevos).length} de ${nombres.length} resueltos`, nombres);
      setGlifosArea((prev) => ({ ...prev, ...nuevos }));
    });
    return () => { vivo = false; };
  }, [dependenciasDisponibles]);

  // Rango temporal del dataset
  const dateRange = useMemo(() => {
    if (reclamos.length === 0) return null;
    const ts = reclamos.map(r => new Date(r.created_at).getTime());
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [reclamos]);

  // =================================================================
  // Pipeline de filtros
  // =================================================================
  // La pregunta activa (null = "ver todo") y lo que decide de la pantalla.
  const preguntaConfig = useMemo(
    () => PREGUNTAS.find((p) => p.id === pregunta) ?? null,
    [pregunta],
  );
  /** En "ver todo" el período siempre aplica; en una pregunta, lo dice ella. */
  const preguntaUsaPeriodo = preguntaConfig ? preguntaConfig.usaPeriodo : true;

  // ---- Recorrido temporal: rango visible + plan + ventana ----
  /**
   * PERÍODO QUE SE ESTÁ MIRANDO. Es el rango del dataset RECORTADO por el
   * preset de la oración ("los últimos 90 días"). Manda sobre todo lo temporal
   * de la pantalla: el recorrido barre exactamente esto y el electro dibuja
   * exactamente esto. Antes el recorrido usaba siempre el dataset entero, así
   * que elegir "los últimos 90 días" y darle play barría igual doce meses.
   */
  const rangoVisible = useMemo(() => {
    if (!dateRange) return null;
    if (!preguntaUsaPeriodo || timePreset === 'all') return dateRange;
    const desde = Date.now() - parseInt(timePreset, 10) * DIA_MS;
    // Nunca se inventa historia hacia atrás del primer reclamo, ni se deja un
    // rango vacío si el período elegido no alcanza a los datos.
    const min = Math.min(Math.max(dateRange.min, desde), dateRange.max - DIA_MS);
    return { min, max: dateRange.max };
  }, [dateRange, preguntaUsaPeriodo, timePreset]);

  const timelapsePlan = useMemo(
    () => (rangoVisible ? planificarTimelapse(rangoVisible) : null),
    [rangoVisible],
  );

  /** El time-lapse manda sobre el filtro de período (corriendo o congelado). */
  const tlActivo = tlEstado !== 'inactivo';

  /** Ventana visible del time-lapse. `null` = modo normal, sin tocar nada. */
  const ventanaTimelapse = useMemo(() => {
    if (!tlActivo || !rangoVisible || !timelapsePlan) return null;
    const hasta = rangoVisible.min + animationDay * DIA_MS;
    return { desde: hasta - timelapsePlan.ventanaDias * DIA_MS, hasta };
  }, [tlActivo, rangoVisible, timelapsePlan, animationDay]);

  /** Con qué se dibuja el lienzo. Sin pregunta ("ver todo") se muestran los
   *  reclamos uno por uno: es la vista donde se va a buscar un caso puntual. */
  const dibujoMapa: 'densidad' | 'puntos' = preguntaConfig?.dibujo ?? 'puntos';

  /**
   * Color de cada pin. Por defecto el del ESTADO (el SSoT de lib/enums), pero
   * hay preguntas que se contestan mejor con un solo tinte: en "lo atrasado"
   * todo es alerta y en "qué resolvimos" todo es éxito — repetir ahí la paleta
   * de estados sería ruido, porque el estado ya lo fijó la pregunta.
   */
  /**
   * Color del pin: manda EL ÁREA que atiende el reclamo.
   *
   * Antes mandaba el tinte de la pregunta y los ciento y pico de pines salían
   * todos del mismo color: el mapa mostraba dónde, nunca de quién. La
   * respuesta a la pregunta sigue estando —en el titular, en el rótulo y en el
   * tooltip de cada pin—, pero el color pasa a contestar algo que el mapa no
   * decía. Sin área asignada se cae al tinte de la pregunta, como antes.
   */
  const colorDelPin = useCallback(
    (r: Reclamo) => {
      const area = r.dependencia_asignada ? areaPorId.get(r.dependencia_asignada.id) : undefined;
      if (area) return area.color;
      return preguntaConfig?.tinte ? tintesMapa[preguntaConfig.tinte] : estadoColor(r.estado);
    },
    [areaPorId, preguntaConfig, tintesMapa],
  );

  /** Glifo del pin: el del área. `undefined` hasta que el icono termina de cargar. */
  const glifoDelPin = useCallback(
    (r: Reclamo) => {
      const area = r.dependencia_asignada ? areaPorId.get(r.dependencia_asignada.id) : undefined;
      return area ? glifosArea[area.icono] : undefined;
    },
    [areaPorId, glifosArea],
  );

  // 1) Categoría
  const reclamosPorCategoria = useMemo(() => {
    if (!filtroCategoria) return reclamos;
    return reclamos.filter(r => String(r.categoria?.id ?? 'otros') === filtroCategoria);
  }, [reclamos, filtroCategoria]);

  // 2) Dependencia
  const reclamosPorDependencia = useMemo(() => {
    if (filtroDependencia == null) return reclamosPorCategoria;
    return reclamosPorCategoria.filter(r => r.dependencia_asignada?.id === filtroDependencia);
  }, [reclamosPorCategoria, filtroDependencia]);

  // 3) ALCANCE DE LA PREGUNTA (sin mirar el tiempo). Es lo que reemplaza al
  //    viejo filtro de estado suelto: cada pregunta ya declara qué estados le
  //    importan. Sólo en "ver todo" manda el combo de estado de la oración —
  //    así nunca queda un filtro invisible recortando por detrás.
  const reclamosAlcance = useMemo(() => {
    const base = reclamosPorDependencia;
    switch (pregunta) {
      case 'atrasado':
        return base.filter(
          (r) => isAbierto(r.estado) && diasDesde(r.created_at) > DIAS_ATRASO,
        );
      case 'resolvimos':
        return base.filter((r) => isResuelto(r.estado));
      case 'repiten':
      case 'sinllegar':
        return base;
      default:
        return filtroEstado ? base.filter((r) => r.estado === filtroEstado) : base;
    }
  }, [reclamosPorDependencia, pregunta, filtroEstado]);

  // 4) TIEMPO. El time-lapse (ventana móvil) MANDA sobre el preset, y hay
  //    preguntas donde el período no significa nada ("lo atrasado" es viejo por
  //    definición): ahí no se aplica ni se muestra el combo.
  const aplicarTiempo = useCallback(
    (lista: Reclamo[]) => {
      // ORDEN IMPORTANTE: si la pregunta NO usa período, nada recorta por
      // tiempo — tampoco el recorrido. Al revés, la ventana móvil de 30 días
      // vaciaba "lo atrasado", que por definición tiene MÁS de 30 días: la
      // pantalla decía "nada que dibujar" con 81 atrasados cargados.
      if (!preguntaUsaPeriodo) return lista;
      if (ventanaTimelapse) {
        return enVentana(lista, ventanaTimelapse.desde, ventanaTimelapse.hasta);
      }
      if (timePreset === 'all') return lista;
      const cutoff = Date.now() - parseInt(timePreset, 10) * DIA_MS;
      return lista.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    },
    [ventanaTimelapse, timePreset, preguntaUsaPeriodo],
  );

  // Lo que finalmente se dibuja.
  const reclamosFiltrados = useMemo(
    () => aplicarTiempo(reclamosAlcance),
    [aplicarTiempo, reclamosAlcance],
  );

  // Radiografía de lo que se está por dibujar. Lo importante es `sinArea`: un
  // reclamo sin dependencia asignada no puede tomar color de área y cae al
  // tinte de la pregunta — si son todos, el mapa se ve de un solo color por
  // más que la lógica de áreas esté bien.
  useEffect(() => {
    if (!debugMapa()) return;
    const porColor = new Map<string, number>();
    let sinArea = 0;
    let sinCoords = 0;
    let conGlifo = 0;
    for (const r of reclamosFiltrados) {
      if (!r.dependencia_asignada) sinArea += 1;
      if (r.latitud == null || r.longitud == null) sinCoords += 1;
      if (glifoDelPin(r)) conGlifo += 1;
      const c = colorDelPin(r);
      porColor.set(c, (porColor.get(c) || 0) + 1);
    }
    logMapa(`render · pregunta="${pregunta || 'todo'}" · dibujo="${dibujoMapa}"`, {
      dibujados: reclamosFiltrados.length,
      sinAreaAsignada: sinArea,
      sinCoordenadas: sinCoords,
      conGlifo,
      colores: Object.fromEntries(porColor),
    });
    if (porColor.size === 1 && reclamosFiltrados.length > 1) {
      logMapa('OJO: un solo color para todos los pines. Causa probable: ninguno tiene area asignada, o el modo de dibujo no usa pines.');
    }
  }, [reclamosFiltrados, colorDelPin, glifoDelPin, pregunta, dibujoMapa]);

  // Universo del time-lapse: el alcance de la pregunta SIN el corte temporal.
  // La ventana móvil recorta sobre esto y el remate compara la primera ventana
  // contra la última sobre esto mismo — el remate habla exactamente del mismo
  // universo que se estuvo viendo.
  const reclamosSinTiempo = reclamosAlcance;

  // =================================================================
  // ELECTRO — el pulso del municipio dentro del período visible
  // =================================================================
  // Dos series REALES, agrupadas acá mismo con lo que la pantalla ya cargó
  // (no se le pide nada nuevo al backend):
  //   · ENTRARON  → reclamos por `created_at` dentro del tramo;
  //   · RESOLVIMOS → reclamos por `fecha_resolucion` dentro del tramo (flujo
  //     de salida: un reclamo cerrado en julio cuenta en julio, aunque haya
  //     entrado en mayo).
  // Se guarda además, por tramo de ENTRADA, cuánto tardó cada reclamo en
  // cerrarse: es la cohorte con la que se arma el remate ("el tiempo de
  // respuesta bajó de X días a Y"). Los reclamos sin `fecha_resolucion` no
  // entran en ese promedio — no se estima un cierre que no ocurrió.
  const electroDatos = useMemo(() => {
    if (!rangoVisible) return null;
    const escala = escalaElectro((rangoVisible.max - rangoVisible.min) / DIA_MS);
    const tramos: number[] = [];
    for (
      let t = inicioTramo(rangoVisible.min, escala);
      t <= rangoVisible.max && tramos.length < 400;
      t = siguienteTramo(t, escala)
    ) {
      tramos.push(t);
    }
    if (tramos.length === 0) return null;

    const indice = new Map(tramos.map((t, i) => [t, i]));
    const entradas = tramos.map((t) => ({ t, v: 0 }));
    const resueltos = tramos.map((t) => ({ t, v: 0 }));
    const demoras: number[][] = tramos.map(() => []);

    for (const r of reclamosSinTiempo) {
      const creado = new Date(r.created_at).getTime();
      if (creado >= rangoVisible.min && creado <= rangoVisible.max) {
        const i = indice.get(inicioTramo(creado, escala));
        if (i != null) {
          entradas[i].v += 1;
          const dias = diasResolucion(r);
          if (dias != null) demoras[i].push(dias);
        }
      }
      if (r.fecha_resolucion) {
        const cerrado = new Date(r.fecha_resolucion).getTime();
        if (cerrado >= rangoVisible.min && cerrado <= rangoVisible.max) {
          const j = indice.get(inicioTramo(cerrado, escala));
          if (j != null) resueltos[j].v += 1;
        }
      }
    }
    return { escala, tramos, entradas, resueltos, demoras };
  }, [rangoVisible, reclamosSinTiempo]);

  /**
   * HITO real del municipio: desde cuándo usa el sistema.
   *
   * Prioridad de fuentes (la primera que EXISTA de verdad):
   *   1. `created_at` del municipio — es el dato fiel, pero hoy la API NO lo
   *      expone en el detalle del municipio (`MunicipioDetalle`); sólo lo
   *      devuelve `/municipios/admin/resumen`, que es del super admin. Se lee
   *      igual: el día que el endpoint lo mande, esto funciona sin tocar nada.
   *   2. El PRIMER reclamo cargado del municipio.
   * No hay tercera opción inventada: si no cae dentro del período dibujado,
   * el hito no se pasa y la pantalla no afirma nada.
   */
  const inicioSistema = useMemo(() => {
    const alta = (municipioActual as { created_at?: string } | null)?.created_at;
    if (alta) {
      const t = new Date(alta).getTime();
      if (Number.isFinite(t)) return t;
    }
    return dateRange ? dateRange.min : null;
  }, [municipioActual, dateRange]);

  const hitoElectro = useMemo(() => {
    if (inicioSistema == null || !electroDatos) return null;
    const primero = electroDatos.tramos[0];
    const ultimo = electroDatos.tramos[electroDatos.tramos.length - 1];
    // Estrictamente ADENTRO: pegado a un borde no marca ningún antes/después.
    if (inicioSistema <= primero || inicioSistema >= ultimo) return null;
    return { t: inicioSistema, etiqueta: 'Empezaron a usar el sistema' };
  }, [inicioSistema, electroDatos]);

  /** Rango de la ventana visible, en texto corto ("16 jun – 15 jul"). */
  const rangoVentanaLabel = useMemo(() => {
    if (!ventanaTimelapse) return '';
    const f = (ms: number) =>
      new Date(ms)
        .toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
        .replace(/\./g, '');
    return `${f(ventanaTimelapse.desde)} – ${f(ventanaTimelapse.hasta)}`;
  }, [ventanaTimelapse]);

  /** Eje: primera, dos intermedias y última fecha del período. */
  const marcasEjeElectro = useMemo(() => {
    if (!electroDatos) return [];
    const { tramos, escala } = electroDatos;
    const n = tramos.length;
    const posiciones = [...new Set([0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1])];
    return posiciones
      .filter((i) => i >= 0 && i < n)
      .map((i) => ({ t: tramos[i], label: fechaEje(tramos[i], escala) }));
  }, [electroDatos]);

  /**
   * REMATE: el delta REAL de tiempo de respuesta entre el primer tramo con
   * datos y el último. Se piden al menos 3 reclamos cerrados por tramo — con
   * uno solo el promedio es una anécdota, no una tendencia. Sin delta o sin
   * datos suficientes, no hay frase (la pantalla se calla).
   */
  const remateElectro = useMemo(() => {
    if (!electroDatos) return null;
    const conDatos = electroDatos.demoras
      .map((v, i) => ({ i, v }))
      .filter((x) => x.v.length >= 3);
    if (conDatos.length < 2) return null;
    const promedio = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const inicial = Math.round(promedio(conDatos[0].v));
    const final = Math.round(promedio(conDatos[conDatos.length - 1].v));
    if (inicial === final) return null;

    const cola = hitoElectro
      ? ' desde que la municipalidad usa el sistema.'
      : (() => {
          if (!rangoVisible) return '.';
          const dias = Math.round((rangoVisible.max - rangoVisible.min) / DIA_MS);
          if (dias >= 60) return ` en los últimos ${Math.round(dias / 30)} meses.`;
          return ` en los últimos ${dias} días.`;
        })();
    const verbo = final < inicial ? 'bajó' : 'subió';
    return {
      texto: `El tiempo de respuesta ${verbo} de ${inicial} ${inicial === 1 ? 'día' : 'días'} a ${final}${cola}`,
      mejora: final < inicial,
    };
  }, [electroDatos, hitoElectro, rangoVisible]);

  // Universo para los CONTEOS de los combos de la oración: mismo recorte
  // temporal pero sin el alcance de la pregunta (si no, el combo de estado
  // mostraría ceros en todo lo que la pregunta ya descartó).
  const reclamosPorTiempo = useMemo(
    () => aplicarTiempo(reclamosPorDependencia),
    [aplicarTiempo, reclamosPorDependencia],
  );

  // 5) BBox dibujada (solo afecta lo que se muestra en stats popup, no en mapa)
  const reclamosEnBBox = useMemo(
    () => (drawnBBox ? reclamosInBBox(reclamosFiltrados, drawnBBox) : []),
    [drawnBBox, reclamosFiltrados],
  );

  // Categorías reales del muni (id + color de la DB), con conteo. Cada categoría
  // tiene su propio filtro/leyenda — no se colapsan en un "Otros" indistinguible.
  const categoriasDisponibles = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; count: number }>();
    // Sólo las categorías que la DEPENDENCIA elegida atiende de verdad. Antes
    // se listaban todas y se podía armar "Recolección de residuos a cargo de
    // Tránsito", que no existe y devolvía cero: la dependencia contiene a las
    // categorías, no al revés.
    const universo =
      filtroDependencia == null
        ? reclamos
        : reclamos.filter((r) => r.dependencia_asignada?.id === filtroDependencia);
    for (const r of universo) {
      const c = r.categoria;
      const key = c?.id != null ? String(c.id) : 'otros';
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else
        map.set(key, {
          key,
          label: c?.nombre || 'Sin categoría',
          color: c?.color || theme.textSecondary,
          count: 1,
        });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
    // `filtroDependencia` va SÍ o SÍ en las deps: el memo lo lee para armar el
    // universo. Sin él, el combo "Tipo" quedaba congelado con las 10 categorías
    // del municipio aunque se eligiera un área, y se podían armar combinaciones
    // que no existen ("Tránsito y señalización a cargo de Zoonosis") que siempre
    // devolvían cero -> "Nada que dibujar para esta consulta".
  }, [reclamos, filtroDependencia, theme.textSecondary]);

  const conteosPorEstado = useMemo(() => {
    return reclamosPorTiempo.reduce((acc, r) => {
      acc[r.estado] = (acc[r.estado] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [reclamosPorTiempo]);

  // Hotspots (sobre los reclamos filtrados). Se calculan SIEMPRE: `showHotspots`
  // decide si se dibuja la capa en el mapa, no si el dato existe — la lista
  // rankeada de abajo y el conteo del chip lo necesitan igual.
  const hotspots = useMemo(
    () => recurrentHotspots(reclamosFiltrados, HOTSPOT_PARAMS),
    [reclamosFiltrados],
  );

  // Reclamos que caen dentro de alguna zona caliente (los clusters son
  // disjuntos, así que la suma no cuenta dos veces el mismo reclamo).
  const enZonasCalientes = useMemo(
    () => hotspots.reduce((s, h) => s + h.recientes, 0),
    [hotspots],
  );

  // ---- Ranking de zonas calientes (data del RankedList de abajo del mapa) ----
  // Cada item usa SÓLO lo que el reclamo trae de verdad: la dirección más
  // repetida del cluster, su barrio dominante y su categoría dominante. Si un
  // cluster no tiene dirección, cae a sus coordenadas — no se inventa un nombre.
  const zonasCalientesItems = useMemo<RankedListItem[]>(() => {
    const u = resolverUmbrales();
    return hotspots.map((h) => {
      const barrio = masRepetido(h.reclamos.map((r) => r.zona?.nombre));
      const categoria = masRepetido(h.reclamos.map((r) => r.categoria?.nombre));
      const detalle = [barrio, categoria].filter(Boolean).join(' · ');
      return {
        id: `${h.centerLat.toFixed(5)}|${h.centerLng.toFixed(5)}`,
        titulo:
          h.topDireccion || `${h.centerLat.toFixed(4)}, ${h.centerLng.toFixed(4)}`,
        detalle: detalle || undefined,
        valor: h.recientes,
        valorSub: h.recientes === 1 ? 'reclamo' : 'reclamos',
        tono: veredictoMasEsPeor(h.recientes, u.slaRiesgo) ?? 'neutro',
        onClick: () => setMapTarget({ lat: h.centerLat, lng: h.centerLng, zoom: 17 }),
      };
    });
  }, [hotspots]);

  // Barrios/zonas alcanzados por el filtro actual (numerador de la cobertura).
  const barriosAlcanzados = useMemo(() => {
    const set = new Set<string>();
    for (const r of reclamosFiltrados) {
      const n = r.zona?.nombre?.trim();
      if (n) set.add(n);
    }
    return set;
  }, [reclamosFiltrados]);

  // ---- "Dónde no llegamos": el catálogo de barrios contra los datos ----
  /**
   * Centro de cada barrio. Primero el que cargó el municipio en la zona; si no
   * lo tiene, el centroide de sus propios reclamos históricos. Un barrio sin
   * ninguna de las dos cosas NO se puede rotular en el mapa (aparece sólo en la
   * lista de abajo): no se inventa una coordenada.
   */
  const centrosBarrio = useMemo(() => {
    const centros = new Map<string, { lat: number; lng: number }>();
    for (const z of zonasMunicipio) {
      if (z.latitud_centro != null && z.longitud_centro != null) {
        centros.set(z.nombre.trim(), { lat: z.latitud_centro, lng: z.longitud_centro });
      }
    }
    const acum = new Map<string, { lat: number; lng: number; n: number }>();
    for (const r of reclamos) {
      const nombre = r.zona?.nombre?.trim();
      if (!nombre || centros.has(nombre) || r.latitud == null || r.longitud == null) continue;
      const a = acum.get(nombre) || { lat: 0, lng: 0, n: 0 };
      a.lat += r.latitud;
      a.lng += r.longitud;
      a.n += 1;
      acum.set(nombre, a);
    }
    for (const [nombre, a] of acum) centros.set(nombre, { lat: a.lat / a.n, lng: a.lng / a.n });
    return centros;
  }, [reclamos, zonasMunicipio]);

  /**
   * Barrios del catálogo que NO aparecen en lo que se está mirando, con su
   * historia real: cuántos reclamos tuvieron alguna vez y hace cuánto fue el
   * último. Es la materia prima de la pregunta "dónde no llegamos" — para la
   * respuesta, los rótulos del mapa y el ranking de abajo.
   */
  const barriosSinCobertura = useMemo(() => {
    if (zonasMunicipio.length === 0) return [];
    const historico = new Map<string, { total: number; ultimo: number }>();
    for (const r of reclamos) {
      const nombre = r.zona?.nombre?.trim();
      if (!nombre) continue;
      const t = new Date(r.created_at).getTime();
      const h = historico.get(nombre);
      if (h) {
        h.total += 1;
        h.ultimo = Math.max(h.ultimo, t);
      } else {
        historico.set(nombre, { total: 1, ultimo: t });
      }
    }
    return zonasMunicipio
      .map((z) => {
        const nombre = z.nombre.trim();
        const h = historico.get(nombre);
        return {
          nombre,
          total: h?.total ?? 0,
          diasSinReclamos: h ? Math.max(0, Math.floor((Date.now() - h.ultimo) / DIA_MS)) : null,
          centro: centrosBarrio.get(nombre) ?? null,
        };
      })
      .filter((z) => !barriosAlcanzados.has(z.nombre))
      .sort((a, b) => b.total - a.total);
  }, [zonasMunicipio, reclamos, centrosBarrio, barriosAlcanzados]);

  // Barrio que más creció: se parte el rango de fechas OBSERVADO en el filtro
  // por la mitad y se compara cuántos reclamos tuvo cada barrio en cada mitad.
  // Mismo criterio que usa `computeKPIs` para su tendencia — un solo idioma.
  // La cuenta en sí es `compararBarrios`, compartida con el remate del
  // time-lapse (que le pasa la primera ventana contra la última).
  const barrioQueMasCrecio = useMemo(() => {
    const conFecha = reclamosFiltrados.filter((r) => r.zona?.nombre);
    if (conFecha.length < 4) return null;
    const ts = conFecha.map((r) => new Date(r.created_at).getTime());
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    if (max <= min) return null;
    const mitad = min + (max - min) / 2;
    const previo = conFecha.filter((r) => new Date(r.created_at).getTime() < mitad);
    const actual = conFecha.filter((r) => new Date(r.created_at).getTime() >= mitad);
    return compararBarrios(previo, actual).subio;
  }, [reclamosFiltrados]);

  // =================================================================
  // Cada pregunta reconfigura TAMBIÉN la lista de abajo del mapa
  // =================================================================
  // Mismo componente (`RankedList`), otro contenido y otro encabezado. Los tres
  // rankings de abajo se arman con lo que el reclamo trae DE VERDAD; lo que no
  // existe (una fecha de cierre sin cargar, un barrio sin coordenada) se dice,
  // no se estima.

  /** "Lo atrasado": los que más tiempo llevan esperando. */
  const atrasadosItems = useMemo<RankedListItem[]>(
    () =>
      [...reclamosFiltrados]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, 8)
        .map((r) => {
          const dias = diasDesde(r.created_at);
          const detalle = [r.direccion || r.zona?.nombre, r.categoria?.nombre]
            .filter(Boolean)
            .join(' · ');
          return {
            id: `atrasado-${r.id}`,
            titulo: r.titulo,
            detalle: detalle || undefined,
            valor: dias,
            valorSub: 'días abiertos',
            tono:
              veredictoMasEsPeor(dias, {
                advertencia: DIAS_ATRASO,
                malo: DIAS_ATRASO * 3,
              }) ?? 'malo',
            onClick: () => {
              if (r.latitud != null && r.longitud != null) {
                setMapTarget({ lat: r.latitud, lng: r.longitud, zoom: 17 });
              }
              setSelected(r);
              setSidebarOpen(true);
            },
          };
        }),
    [reclamosFiltrados],
  );

  /** "Qué resolvimos": los que se cerraron más rápido. Si el municipio no carga
   *  la fecha de cierre no se inventa un tiempo: se rankea por categoría, que
   *  es un dato que sí existe. */
  const resueltosItems = useMemo<RankedListItem[]>(() => {
    const u = resolverUmbrales();
    const conTiempo = reclamosFiltrados
      .map((r) => ({ r, dias: diasResolucion(r) }))
      .filter((x): x is { r: Reclamo; dias: number } => x.dias != null)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 8);

    if (conTiempo.length > 0) {
      return conTiempo.map(({ r, dias }) => {
        const detalle = [r.direccion || r.zona?.nombre, r.categoria?.nombre]
          .filter(Boolean)
          .join(' · ');
        return {
          id: `resuelto-${r.id}`,
          titulo: r.titulo,
          detalle: detalle || undefined,
          valor: dias < 1 ? '<1' : Math.round(dias),
          valorSub: 'días en cerrar',
          tono: veredictoMenosEsMejor(dias, u.tiempoResolucionDias) ?? 'bueno',
          onClick: () => {
            if (r.latitud != null && r.longitud != null) {
              setMapTarget({ lat: r.latitud, lng: r.longitud, zoom: 17 });
            }
            setSelected(r);
            setSidebarOpen(true);
          },
        };
      });
    }

    const porCategoria = new Map<string, number>();
    for (const r of reclamosFiltrados) {
      const k = r.categoria?.nombre || 'Sin categoría';
      porCategoria.set(k, (porCategoria.get(k) || 0) + 1);
    }
    return [...porCategoria.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nombre, n]) => ({
        id: `resuelto-cat-${nombre}`,
        titulo: nombre,
        detalle: 'sin fecha de cierre cargada',
        valor: n,
        valorSub: n === 1 ? 'cerrado' : 'cerrados',
        tono: 'bueno' as const,
      }));
  }, [reclamosFiltrados]);

  /** "Dónde no llegamos": los barrios sin atención, con su historia real. */
  const sinCoberturaItems = useMemo<RankedListItem[]>(
    () =>
      barriosSinCobertura.slice(0, 8).map((b) => {
        const centro = b.centro;
        return {
          id: `sincobertura-${b.nombre}`,
          titulo: b.nombre,
          detalle:
            b.diasSinReclamos == null
              ? 'nunca registró un reclamo'
              : `último reclamo hace ${b.diasSinReclamos} ${b.diasSinReclamos === 1 ? 'día' : 'días'}`,
          valor: b.total,
          valorSub: b.total === 1 ? 'histórico' : 'históricos',
          tono: b.total === 0 ? ('malo' as const) : ('advertencia' as const),
          onClick: centro
            ? () => setMapTarget({ lat: centro.lat, lng: centro.lng, zoom: 14 })
            : undefined,
        };
      }),
    [barriosSinCobertura],
  );

  /** La lista de abajo, ya resuelta para la pregunta activa. */
  const ranking = useMemo(() => {
    switch (pregunta) {
      case 'atrasado':
        return {
          titulo: 'Los que más esperan',
          caption: `abiertos hace más de ${DIAS_ATRASO} días`,
          icono: AlarmClock,
          tono: 'malo' as const,
          vacio: 'Ningún reclamo lleva más de 30 días abierto con este filtro.',
          items: atrasadosItems,
        };
      case 'resolvimos':
        return {
          titulo: 'Los que resolvimos más rápido',
          caption: 'cerrados dentro del período',
          icono: CheckCircle2,
          tono: 'bueno' as const,
          vacio: 'Todavía no se cerró ningún reclamo en este período.',
          items: resueltosItems,
        };
      case 'sinllegar':
        return {
          titulo: 'Barrios sin atención',
          caption:
            zonasMunicipio.length > 0
              ? `sobre los ${zonasMunicipio.length} barrios del municipio`
              : 'el municipio no tiene barrios cargados',
          icono: MapPinOff,
          tono: 'advertencia' as const,
          vacio: 'Todos los barrios del municipio registran reclamos en el período.',
          items: sinCoberturaItems,
        };
      default:
        return {
          titulo: 'Dónde más se repite',
          caption: `radio ${HOTSPOT_PARAMS.radiusMeters} m · últimos ${HOTSPOT_PARAMS.daysBack} días`,
          icono: Flame,
          tono: 'malo' as const,
          vacio: 'Ninguna esquina repite reclamos con este filtro.',
          items: zonasCalientesItems,
        };
    }
  }, [
    pregunta,
    atrasadosItems,
    resueltosItems,
    sinCoberturaItems,
    zonasCalientesItems,
    zonasMunicipio.length,
  ]);

  // =================================================================
  // El mapa escribe sobre sí mismo: rótulos de la pregunta activa
  // =================================================================
  // Pocos (3-4) y sobre lo que contesta la pregunta. Todos con datos reales.
  const rotulos = useMemo<RotuloMapa[]>(() => {
    switch (pregunta) {
      case 'atrasado':
        return [...reclamosFiltrados]
          .filter((r) => r.latitud != null && r.longitud != null)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .slice(0, 3)
          .map((r) => ({
            id: `rot-atrasado-${r.id}`,
            lat: r.latitud!,
            lng: r.longitud!,
            texto: `${diasDesde(r.created_at)} días sin resolver`,
            tono: 'malo' as const,
          }));
      case 'resolvimos':
        return topZonas(reclamosFiltrados, 3, 150).map((z, i) => ({
          id: `rot-resuelto-${i}-${z.centerLat.toFixed(4)}`,
          lat: z.centerLat,
          lng: z.centerLng,
          texto: `${z.reclamos.length} ${z.reclamos.length === 1 ? 'resuelto' : 'resueltos'}`,
          tono: 'bueno' as const,
        }));
      case 'sinllegar':
        return barriosSinCobertura
          .filter((b) => b.centro)
          .slice(0, 4)
          .map((b) => ({
            id: `rot-sincobertura-${b.nombre}`,
            lat: b.centro!.lat,
            lng: b.centro!.lng,
            texto:
              b.diasSinReclamos == null
                ? `${b.nombre} · sin reclamos registrados`
                : `${b.nombre} · sin reclamos hace ${b.diasSinReclamos} días`,
            tono: 'advertencia' as const,
          }));
      case 'repiten':
        return hotspots.slice(0, 4).map((h, i) => {
          const categoria = masRepetido(h.reclamos.map((r) => r.categoria?.nombre));
          return {
            id: `rot-repite-${i}-${h.centerLat.toFixed(4)}`,
            lat: h.centerLat,
            lng: h.centerLng,
            texto: `${h.recientes} reclamos${categoria ? ` · ${categoria}` : ''}`,
            tono: 'malo' as const,
          };
        });
      default:
        return [];
    }
  }, [pregunta, reclamosFiltrados, hotspots, barriosSinCobertura]);

  // =================================================================
  // La RESPUESTA: una línea corta, en el mismo idioma de la pregunta
  // =================================================================
  // Cada número sale de lo que la pantalla ya calculó. Si no hay con qué
  // contestar, la línea lo DICE — nunca se completa con un número inventado.
  const respuestaConsulta = useMemo<ConsultaSegmento[]>(() => {
    if (loading || reclamos.length === 0) return [];
    const u = resolverUmbrales();
    const total = reclamosFiltrados.length;

    if (total === 0) {
      if (loadingMore) {
        return [{ texto: 'Buscando reclamos en el historial...', tono: 'neutro' }];
      }
    }

    switch (pregunta) {
      case 'repiten': {
        if (total === 0) return [{ texto: 'No hay reclamos que mirar con este filtro.' }];
        if (hotspots.length === 0) {
          return [
            { texto: 'Ninguna esquina repite reclamos', tono: 'bueno' },
            { texto: `: los ${total} están dispersos por el municipio.` },
          ];
        }
        const deCada10 = Math.round((enZonasCalientes / total) * 10);
        return [
          {
            texto: `${hotspots.length} ${hotspots.length === 1 ? 'esquina concentra' : 'esquinas concentran'} ${enZonasCalientes} ${enZonasCalientes === 1 ? 'reclamo' : 'reclamos'}`,
            tono: veredictoMasEsPeor(hotspots.length, u.slaRiesgo) ?? 'neutro',
          },
          { texto: `: ${deCada10} de cada 10 de los que estás viendo.` },
        ];
      }
      case 'atrasado': {
        if (total === 0) {
          return [
            { texto: `Ningún reclamo lleva más de ${DIAS_ATRASO} días abierto`, tono: 'bueno' },
            { texto: ': todo dentro del plazo.' },
          ];
        }
        const maxDias = Math.max(...reclamosFiltrados.map((r) => diasDesde(r.created_at)));
        const tramos: ConsultaSegmento[] = [
          {
            texto: `${total} ${total === 1 ? 'reclamo lleva' : 'reclamos llevan'} más de ${DIAS_ATRASO} días abiertos`,
            tono: veredictoMasEsPeor(total, u.vencidos) ?? 'neutro',
          },
          { texto: `, el más viejo hace ${maxDias} días` },
        ];
        const top = barrioDominante(reclamosFiltrados);
        if (top) tramos.push({ texto: `; ${top.count} de ellos en ${top.nombre}` });
        tramos.push({ texto: '.' });
        return tramos;
      }
      case 'resolvimos': {
        if (total === 0) {
          return [
            { texto: 'Todavía no se cerró ningún reclamo en este período', tono: 'advertencia' },
            { texto: '.' },
          ];
        }
        const tiempos = reclamosFiltrados
          .map((r) => diasResolucion(r))
          .filter((d): d is number => d != null);
        const tramos: ConsultaSegmento[] = [
          {
            texto: `${total} ${total === 1 ? 'reclamo cerrado' : 'reclamos cerrados'}`,
            tono: 'bueno',
          },
        ];
        if (tiempos.length > 0) {
          const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
          tramos.push({ texto: ', en promedio a los ' });
          tramos.push({
            texto: `${promedio.toFixed(0)} días`,
            tono: veredictoMenosEsMejor(promedio, u.tiempoResolucionDias) ?? 'neutro',
          });
          if (tiempos.length < total) {
            tramos.push({ texto: ` (sobre ${tiempos.length} con fecha de cierre cargada)` });
          }
        } else {
          tramos.push({ texto: ', sin fecha de cierre cargada para saber cuánto tardaron' });
        }
        tramos.push({ texto: '.' });
        return tramos;
      }
      case 'sinllegar': {
        if (zonasMunicipio.length === 0) {
          return [
            {
              texto: 'El municipio todavía no tiene barrios cargados',
              tono: 'advertencia',
            },
            { texto: ': sin ese listado no se puede decir a dónde no llegamos.' },
          ];
        }
        const sin = barriosSinCobertura.length;
        if (sin === 0) {
          return [
            {
              texto: `Los ${zonasMunicipio.length} barrios del municipio registran reclamos`,
              tono: 'bueno',
            },
            { texto: ' en el período.' },
          ];
        }
        const nunca = barriosSinCobertura.filter((b) => b.total === 0).length;
        const tramos: ConsultaSegmento[] = [
          {
            texto: `${sin} de ${zonasMunicipio.length} barrios sin ningún reclamo en el período`,
            tono: veredictoMasEsPeor(sin, u.sinAsignar) ?? 'advertencia',
          },
        ];
        if (nunca > 0) {
          tramos.push({
            texto: `, y ${nunca} ${nunca === 1 ? 'nunca registró' : 'nunca registraron'} uno`,
          });
        }
        tramos.push({ texto: '.' });
        return tramos;
      }
      default: {
        if (total === 0) return [{ texto: 'Ningún reclamo entra en este filtro.' }];
        const tramos: ConsultaSegmento[] = [
          { texto: `${total} ${total === 1 ? 'reclamo' : 'reclamos'} sobre el mapa` },
        ];
        if (zonasMunicipio.length > 0) {
          tramos.push({ texto: ', repartidos en ' });
          tramos.push({
            texto: `${barriosAlcanzados.size} de ${zonasMunicipio.length} barrios`,
            tono: barriosAlcanzados.size === zonasMunicipio.length ? 'bueno' : 'advertencia',
          });
        }
        tramos.push({ texto: '.' });
        return tramos;
      }
    }
  }, [
    loading,
    loadingMore,
    reclamos.length,
    pregunta,
    reclamosFiltrados,
    hotspots,
    enZonasCalientes,
    zonasMunicipio.length,
    barriosSinCobertura,
    barriosAlcanzados,
  ]);

  // ---- Datos de la NARRACIÓN del time-lapse (todos reales, de la ventana) ----

  /** Ventana anterior: da el delta que colorea el conteo de la frase narrada. */
  const reclamosVentanaPrevia = useMemo(() => {
    if (!ventanaTimelapse || !timelapsePlan) return null;
    // En el primer paso no hay ventana previa contra la cual comparar.
    if (animationDay <= timelapsePlan.cursorInicial) return null;
    const paso = timelapsePlan.pasoDias * DIA_MS;
    return enVentana(reclamosSinTiempo, ventanaTimelapse.desde - paso, ventanaTimelapse.hasta - paso);
  }, [ventanaTimelapse, timelapsePlan, animationDay, reclamosSinTiempo]);

  /**
   * Cómo viene la ventana actual contra la anterior. En el primer paso no hay
   * con qué comparar y se dice — antes que mostrar un 0% que no significa nada.
   */
  const comparacionVentana = useMemo<ComparacionVentana>(() => {
    if (reclamosVentanaPrevia == null || reclamosVentanaPrevia.length === 0) {
      return { texto: 'sin período previo', tono: 'neutro' };
    }
    const previo = reclamosVentanaPrevia.length;
    const pct = Math.round(((reclamosFiltrados.length - previo) / previo) * 100);
    if (pct === 0) return { texto: 'igual que el período anterior', tono: 'neutro' };
    // Que entren MENOS reclamos es la buena noticia.
    return {
      texto: `${pct > 0 ? '+' : ''}${pct}% vs. el período anterior`,
      tono: pct > 0 ? 'malo' : 'bueno',
    };
  }, [reclamosFiltrados.length, reclamosVentanaPrevia]);


  /**
   * Remate del recorrido: la PRIMERA ventana contra la ÚLTIMA. Es la misma
   * comparación por períodos del KPI "Barrio que más creció", con otros dos
   * períodos — por eso comparte `compararBarrios` y no duplica la cuenta.
   * No depende de `animationDay`: se calcula una vez por combinación de
   * filtros, no en cada tick.
   */
  const timelapseRemate = useMemo(() => {
    if (!rangoVisible || !timelapsePlan) return null;
    const { ventanaDias, cursorInicial, cursorFinal } = timelapsePlan;
    const anchoMs = ventanaDias * DIA_MS;
    const finPrimera = rangoVisible.min + cursorInicial * DIA_MS;
    const finUltima = rangoVisible.min + cursorFinal * DIA_MS;
    const primera = enVentana(reclamosSinTiempo, finPrimera - anchoMs, finPrimera);
    const ultima = enVentana(reclamosSinTiempo, finUltima - anchoMs, finUltima);
    const { subio, bajo } = compararBarrios(primera, ultima);
    return {
      diasRecorridos: cursorFinal,
      ventanaDias,
      primera: primera.length,
      ultima: ultima.length,
      subio,
      bajo,
    };
  }, [rangoVisible, timelapsePlan, reclamosSinTiempo]);

  // ---- Controles del time-lapse ----
  // Declarados ACÁ (y no con el resto de los handlers) porque el memo de las
  // frases del hero los referencia: el remate ofrece "Volver a reproducir".

  /** Mueve el cursor manteniendo ref y estado en sincronía. */
  const irADiaTimelapse = useCallback((dia: number) => {
    animationDayRef.current = dia;
    setAnimationDay(dia);
  }, []);

  /** Play / Pausa / Reanudar / Repetir, según en qué estado esté. */
  const timelapseToggle = useCallback(() => {
    if (!timelapsePlan) return;
    if (tlEstado === 'reproduciendo') {
      setTlEstado('pausado');
      return;
    }
    if (tlEstado === 'pausado') {
      setTlEstado('reproduciendo');
      return;
    }
    // 'inactivo' | 'finalizado' → arrancar el recorrido de cero.
    irADiaTimelapse(timelapsePlan.cursorInicial);
    setTlEstado('reproduciendo');
  }, [tlEstado, timelapsePlan, irADiaTimelapse]);

  /** Click en el electro: mueve el cursor del recorrido a ese momento. */
  const saltarAMomento = useCallback(
    (t: number) => {
      if (!rangoVisible || !timelapsePlan) return;
      const dia = Math.round((t - rangoVisible.min) / DIA_MS);
      irADiaTimelapse(
        Math.max(timelapsePlan.cursorInicial, Math.min(timelapsePlan.cursorFinal, dia)),
      );
    },
    [rangoVisible, timelapsePlan, irADiaTimelapse],
  );

  /** Salir del time-lapse: vuelve al modo normal (manda el filtro de período). */
  const timelapseReset = useCallback(() => {
    setTlEstado('inactivo');
    irADiaTimelapse(timelapsePlan?.cursorInicial ?? 0);
  }, [timelapsePlan, irADiaTimelapse]);

  // Reclamos que la API devolvió SIN coordenada: el mapa no los puede dibujar.
  const sinCoordenada = Math.max(0, totalCargados - reclamos.length);

  // Acción del hero: contesta "dónde se repiten" y baja a la lista.
  const irAZonasCalientes = useCallback(() => {
    setPregunta('repiten');
    document
      .getElementById(ID_RANKING)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Frases del hero semántico (reemplaza al PageHint estático). Solo datos ya
  // cargados: sin datos → [] y el hero no renderiza. Veredictos vía lib/veredictos.
  const heroFrases = useMemo<HeroFrase[]>(() => {
    const u = resolverUmbrales();

    if (isPuntos) {
      if (poiLoading) return [];
      if (pois.length === 0) {
        return [
          {
            segmentos: [
              seg('Todavía no marcaste ningún punto', 'advertencia'),
              seg('. Hacé click en el mapa para crear el primero.'),
            ],
          },
        ];
      }
      const frases: HeroFrase[] = [
        {
          segmentos: [
            seg('Tenés '),
            seg(`${pois.length} ${pois.length === 1 ? 'punto marcado' : 'puntos marcados'}`, 'bueno'),
            tipos.length > 0
              ? seg(` en el mapa, sobre ${tipos.length} ${tipos.length === 1 ? 'tipo disponible' : 'tipos disponibles'}.`)
              : seg(' en el mapa.'),
          ],
        },
      ];
      if (!poiCountsLoading && Object.keys(poiCounts).length > 0) {
        let topPoi: PuntoInteres | null = null;
        let topCount = 0;
        for (const p of pois) {
          const c = poiCounts[p.id] ?? 0;
          if (c > topCount) {
            topCount = c;
            topPoi = p;
          }
        }
        if (topPoi && topCount > 0) {
          frases.push({
            segmentos: [
              seg('El punto con más reclamos en zona es '),
              seg(topPoi.nombre),
              seg(', con '),
              seg(
                `${topCount} ${topCount === 1 ? 'reclamo' : 'reclamos'}`,
                veredictoMasEsPeor(topCount, u.slaRiesgo),
              ),
              seg('.'),
            ],
            acciones: [{ label: 'Ver reclamos', to: '/gestion/reclamos', primaria: true }],
          });
        }
      }
      return frases;
    }

    // Modo reclamos — la frase de ESTA pantalla habla de GEOGRAFÍA: dónde se
    // concentra, hasta dónde llegamos y dónde está creciendo. Los tiempos de
    // resolución son la historia del Dashboard, no la del mapa.
    if (loading || reclamos.length === 0) return [];

    // ---- TIME-LAPSE REPRODUCIENDO: el hero NARRA la ventana visible ----
    // Una sola frase (sin carrusel) que se reescribe en cada paso con los datos
    // REALES de la ventana. Al pausar o resetear vuelve sola a las frases
    // geográficas de abajo: la lista cambia de largo pero el componente no se
    // remonta, así que no parpadea.
    if (tlEstado === 'reproduciendo' && ventanaTimelapse) {
      const n = reclamosFiltrados.length;
      const cabecera = seg(
        `Del ${fechaLarga(ventanaTimelapse.desde)} al ${fechaLarga(ventanaTimelapse.hasta)}: `,
      );
      if (n === 0) {
        return [{ segmentos: [cabecera, seg('sin reclamos nuevos'), seg('.')] }];
      }
      // El color del conteo sale de comparar con la ventana ANTERIOR: sube =
      // advertencia/malo, baja = bueno. En el primer paso no hay con qué
      // comparar, así que va neutro (no se inventa una tendencia).
      const previa = reclamosVentanaPrevia?.length ?? null;
      const delta = previa == null ? 0 : n - previa;
      const veredictoEntradas =
        previa == null || delta === 0
          ? undefined
          : delta > 0
            ? veredictoMasEsPeor(delta, u.slaRiesgo)
            : ('bueno' as const);
      const segmentos = [
        cabecera,
        seg('entraron '),
        seg(`${n} ${n === 1 ? 'reclamo' : 'reclamos'}`, veredictoEntradas),
      ];
      // El barrio dominante sale de los mismos datos de la ventana. Si en el
      // filtro no hay zonas cargadas, la frase simplemente no lo dice.
      const top = barrioDominante(reclamosFiltrados);
      if (top) {
        segmentos.push(
          seg(', '),
          seg(`${top.count} en ${top.nombre}`, veredictoMasEsPeor(top.count, u.slaRiesgo)),
        );
      }
      segmentos.push(seg('.'));
      return [{ segmentos }];
    }

    // ---- TIME-LAPSE TERMINADO: el remate (primera ventana vs última) ----
    if (tlEstado === 'finalizado' && timelapseRemate) {
      const { diasRecorridos, ventanaDias, primera, ultima, subio, bajo } = timelapseRemate;
      const deltaTotal = ultima - primera;
      const segmentos = [
        seg(`En ${diasRecorridos} días, comparando los primeros ${ventanaDias} con los últimos ${ventanaDias}: `),
        seg('el municipio pasó de '),
        seg(`${primera}`),
        seg(' a '),
        seg(
          `${ultima} ${ultima === 1 ? 'reclamo' : 'reclamos'} por ventana`,
          deltaTotal > 0
            ? veredictoMasEsPeor(deltaTotal, u.slaRiesgo)
            : deltaTotal < 0
              ? 'bueno'
              : undefined,
        ),
      ];
      if (subio) {
        segmentos.push(
          seg('; '),
          seg(
            `${subio.nombre} pasó de ${subio.previo} a ${subio.actual}`,
            veredictoMasEsPeor(subio.delta, u.slaRiesgo),
          ),
        );
      }
      if (bajo) {
        segmentos.push(
          seg('; '),
          seg(`${bajo.nombre} bajó de ${bajo.previo} a ${bajo.actual}`, 'bueno'),
        );
      }
      segmentos.push(seg('.'));
      return [
        {
          segmentos,
          acciones: [
            { label: 'Volver a reproducir', onClick: timelapseToggle, primaria: true },
            { label: 'Salir del time-lapse', onClick: timelapseReset },
          ],
        },
      ];
    }

    const segmentosA = [
      seg('Estás viendo '),
      seg(`${reclamosFiltrados.length} ${reclamosFiltrados.length === 1 ? 'reclamo' : 'reclamos'}`),
      seg(' sobre el mapa'),
    ];
    if (barriosAlcanzados.size > 0 && zonasMunicipio.length > 0) {
      segmentosA.push(
        seg(', repartidos en '),
        seg(
          `${barriosAlcanzados.size} de ${zonasMunicipio.length} barrios`,
          barriosAlcanzados.size === zonasMunicipio.length ? 'bueno' : 'advertencia',
        ),
      );
    }
    if (hotspots.length > 0) {
      segmentosA.push(
        seg(', y '),
        seg(
          `${hotspots.length} ${hotspots.length === 1 ? 'zona caliente concentra' : 'zonas calientes concentran'} ${enZonasCalientes} ${enZonasCalientes === 1 ? 'reclamo' : 'reclamos'}`,
          veredictoMasEsPeor(hotspots.length, u.slaRiesgo),
        ),
        seg(` de los últimos ${HOTSPOT_PARAMS.daysBack} días`),
      );
    }
    segmentosA.push(seg('.'));

    const fraseA: HeroFrase = {
      segmentos: segmentosA,
      acciones:
        hotspots.length > 0
          ? [
              {
                label: `Ver las ${hotspots.length} zonas calientes`,
                onClick: irAZonasCalientes,
                primaria: true,
              },
            ]
          : undefined,
    };

    const frases: HeroFrase[] = [fraseA];

    // Segunda frase: dónde está creciendo (o, si no hay señal de crecimiento,
    // qué tan completa está la georreferenciación).
    if (barrioQueMasCrecio) {
      frases.push({
        segmentos: [
          seg('El barrio que más creció es '),
          seg(barrioQueMasCrecio.nombre),
          seg(': pasó de '),
          seg(`${barrioQueMasCrecio.previo}`),
          seg(' a '),
          seg(
            `${barrioQueMasCrecio.actual} reclamos`,
            veredictoMasEsPeor(barrioQueMasCrecio.delta, u.slaRiesgo),
          ),
          seg(' respecto de la primera mitad del período.'),
        ],
      });
    } else if (sinCoordenada > 0) {
      frases.push({
        segmentos: [
          seg(`${sinCoordenada} ${sinCoordenada === 1 ? 'reclamo no tiene' : 'reclamos no tienen'} coordenada`, 'advertencia'),
          seg(' y no se ven en el mapa: cargarles la dirección los vuelve visibles.'),
        ],
      });
    }

    return frases;
  }, [
    isPuntos,
    poiLoading,
    pois,
    tipos.length,
    poiCounts,
    poiCountsLoading,
    loading,
    reclamos.length,
    reclamosFiltrados,
    hotspots.length,
    enZonasCalientes,
    barriosAlcanzados.size,
    zonasMunicipio.length,
    barrioQueMasCrecio,
    sinCoordenada,
    irAZonasCalientes,
    tlEstado,
    ventanaTimelapse,
    reclamosVentanaPrevia,
    timelapseRemate,
    timelapseToggle,
    timelapseReset,
  ]);

  // KPIs del strip del hero (solo modo Reclamos; en Puntos el hero va sin
  // strip). Son métricas GEOGRÁFICAS: cuántos reclamos se pueden ubicar, a
  // cuántos barrios llegamos, dónde está creciendo y qué lleva demasiado
  // abierto. Lo que responde "cuánto tardamos" (% resueltos, resolución
  // media) vive en el Dashboard: acá sería ruido. Las zonas calientes NO son
  // KPI porque la lista rankeada de abajo lo dice mejor y sin duplicar.
  const heroKpis = useMemo<HeroKpi[] | undefined>(() => {
    if (isPuntos || loading || reclamos.length === 0) return undefined;
    const u = resolverUmbrales();
    const kpis: HeroKpi[] = [];

    // 1) Calidad de carga: un reclamo sin coordenada es invisible en el mapa.
    //    Se mide contra el umbral de cantidad de "sin asignar" (misma idea:
    //    items que quedaron fuera del circuito y hay que ir a buscar).
    const pctGeo = totalCargados > 0 ? (reclamos.length / totalCargados) * 100 : 100;
    kpis.push({
      etiqueta: 'Georreferenciados',
      valor: reclamos.length,
      sub:
        sinCoordenada === 0
          ? `los ${totalCargados} tienen coordenada`
          : `${sinCoordenada} sin coordenada · ${pctGeo.toFixed(0)}%`,
      veredicto: veredictoMasEsPeor(sinCoordenada, u.sinAsignar),
    });

    // 2) Cobertura territorial: dónde NO estamos llegando. Sólo si el muni
    //    tiene zonas cargadas — sin catálogo no hay denominador honesto.
    if (zonasMunicipio.length > 0) {
      const sinReclamos = Math.max(0, zonasMunicipio.length - barriosAlcanzados.size);
      kpis.push({
        etiqueta: 'Barrios alcanzados',
        valor: `${barriosAlcanzados.size} de ${zonasMunicipio.length}`,
        sub:
          sinReclamos === 0
            ? 'todo el municipio con reclamos'
            : `${sinReclamos} sin ningún reclamo en el filtro`,
        veredicto: veredictoMasEsPeor(sinReclamos, u.sinAsignar),
      });
    }

    // 3) Dónde se está moviendo el mapa.
    if (barrioQueMasCrecio) {
      kpis.push({
        etiqueta: 'Barrio que más creció',
        valor: `+${barrioQueMasCrecio.delta}`,
        sub: `${barrioQueMasCrecio.nombre} · ${barrioQueMasCrecio.previo} → ${barrioQueMasCrecio.actual}`,
        veredicto: veredictoMasEsPeor(barrioQueMasCrecio.delta, u.slaRiesgo),
      });
    }

    // 4) Lo que hay que ir a resolver sí o sí (el único de tiempo que se queda:
    //    marca un punto del mapa al que hay que volver).
    const abiertos30 = computeKPIs(reclamosFiltrados).abiertos30dPlus;
    kpis.push({
      etiqueta: 'Abiertos > 30 días',
      valor: abiertos30,
      sub:
        abiertos30 > 0
          ? abiertos30 === 1
            ? 'requiere revisión urgente'
            : 'requieren revisión urgente'
          : 'todo dentro del SLA',
      veredicto: veredictoMasEsPeor(abiertos30, u.vencidos),
    });

    return kpis;
  }, [
    isPuntos,
    loading,
    reclamos.length,
    reclamosFiltrados,
    totalCargados,
    sinCoordenada,
    zonasMunicipio.length,
    barriosAlcanzados.size,
    barrioQueMasCrecio,
  ]);

  // Puntos para coverage por dependencia (sobre todos los reclamos de esa dependencia, sin filtro de tiempo)
  const coveragePoints = useMemo(() => {
    if (filtroDependencia == null || !showCoverage) return [];
    return reclamos
      .filter(r => r.dependencia_asignada?.id === filtroDependencia)
      .filter(r => r.latitud != null && r.longitud != null)
      .map(r => [r.latitud!, r.longitud!] as [number, number]);
  }, [reclamos, filtroDependencia, showCoverage]);

  const coverageColor = useMemo(() => {
    if (filtroDependencia == null) return '#6366f1';
    return dependenciasDisponibles.find(d => d.id === filtroDependencia)?.color || '#6366f1';
  }, [filtroDependencia, dependenciasDisponibles]);

  // =================================================================
  // Time-lapse: loop de reproducción
  // =================================================================
  // Un `setInterval` que corre el cursor `pasoDias` por tick. La última ventana
  // se queda un tick completo en pantalla antes de cerrar; ahí el recorrido o
  // vuelve al principio (bucle) o pasa a 'finalizado' y el hero muestra el
  // remate. Se maneja con el ref y NO con el updater funcional de `setState`
  // para que el efecto no tenga que re-suscribirse en cada paso (y para no
  // meter un `setState` de otro estado dentro de un updater, que en StrictMode
  // se ejecuta dos veces).
  useEffect(() => {
    if (tlEstado !== 'reproduciendo' || !timelapsePlan) return;
    const { pasoDias, cursorInicial, cursorFinal } = timelapsePlan;

    // Avance CONTINUO cuadro a cuadro (no saltos de N días con setInterval):
    // con saltos el recorrido daba tirones y se sentía muerto. Acá el cursor
    // se desliza a una velocidad constante en días por segundo, y el navegador
    // lo dibuja a 60 fps.
    const diasPorSegundo = (pasoDias * 1000) / TIMELAPSE_INTERVALO_MS;
    let ultimo = performance.now();
    let vivo = true;

    const cuadro = (ahora: number) => {
      if (!vivo) return;
      const dt = Math.min(0.25, (ahora - ultimo) / 1000); // clamp: pestaña en 2° plano
      ultimo = ahora;

      const siguiente = animationDayRef.current + diasPorSegundo * tlVelocidad * dt;
      if (siguiente >= cursorFinal) {
        if (!tlBucle) {
          animationDayRef.current = cursorFinal;
          setAnimationDay(cursorFinal);
          setTlEstado('finalizado');
          return;
        }
        animationDayRef.current = cursorInicial;
        setAnimationDay(cursorInicial);
      } else {
        animationDayRef.current = siguiente;
        setAnimationDay(siguiente);
      }
      animationRef.current = requestAnimationFrame(cuadro);
    };

    animationRef.current = requestAnimationFrame(cuadro);
    return () => {
      vivo = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [tlEstado, tlBucle, timelapsePlan, tlVelocidad]);

  /* La barra de progreso murió con la banda vieja: ahora el avance se lee
     en el electro (el cursor sobre la línea dice dónde va el recorrido). */

  /** Etiqueta del botón mientras el time-lapse está activo ("8 jul – 7 ago"). */
  const rangoTimelapseLabel = ventanaTimelapse
    ? `${fechaCorta(ventanaTimelapse.desde)} – ${fechaCorta(ventanaTimelapse.hasta)}`
    : null;

  // =================================================================
  // Handlers
  // =================================================================
  const handleMarkerClick = (r: Reclamo) => {
    setSelected(r);
    setSidebarOpen(true);
  };
  const closeSidebar = () => {
    setSidebarOpen(false);
    setSelected(null);
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleDrawComplete = useCallback((bbox: BBox) => {
    setDrawnBBox(bbox);
    setDrawMode(false);
  }, []);
  const handleDrawCancel = useCallback(() => setDrawMode(false), []);
  const clearDrawnBBox = () => setDrawnBBox(null);

  const handleClearAllFiltros = () => {
    setSearchParams({});
    setFiltroEstado(null);
    setFiltroDependencia(null);
    setTimePreset('all');
    setPregunta(DEFAULT_FILTROS.pregunta);
    setShowCoverage(true);
    setShowPois(false);
    timelapseReset();
  };

  /**
   * Elegir una pregunta reconfigura TODA la pantalla (mapa, respuesta, lista).
   * El filtro de estado se limpia al entrar en una pregunta: cada una ya dice
   * qué estados mira, y un estado invisible recortando por detrás es
   * exactamente lo que esta pantalla vino a eliminar.
   */
  const handlePreguntaChange = (id: string) => {
    const siguiente = (PREGUNTAS.some((p) => p.id === id) ? id : '') as ConsultaId;
    setPregunta(siguiente);
    if (siguiente !== '') setFiltroEstado(null);
    // "Cómo fue apareciendo" ES el recorrido: elegirla lo arranca, y salir de
    // ella lo apaga. Sin esto habría que elegir la pregunta Y ADEMÁS buscar un
    // play escondido para que pase algo.
    // Cambiar de pregunta corta el recorrido: el time-lapse acompaña a UNA
    // consulta, y seguir corriendo sobre otra mostraría datos de la anterior.
    if (tlEstado !== 'inactivo') timelapseReset();
  };

  /** El preset de período y el time-lapse compiten por el eje temporal: elegir
   *  un período sale del time-lapse en vez de dejar dos verdades en pantalla. */
  const handleTimePresetChange = (p: TimePreset) => {
    timelapseReset();
    setTimePreset(p);
  };

  const handleCategoriaChange = (key: string | null) => {
    if (key == null) setSearchParams({});
    else setSearchParams({ categoria: key });
    setFiltroEstado(null);
  };

  const handleToggleDraw = () => {
    setDrawnBBox(null);
    setDrawMode((d) => !d);
  };

  // =================================================================
  // Handlers del modo Puntos
  // =================================================================
  const poiPoints = useMemo<Array<[number, number]>>(
    () => pois.map((p) => [p.latitud, p.longitud]),
    [pois],
  );

  const getPoiCenter = (): [number, number] => {
    if (pois.length === 0) return getMapCenter();
    const lat = pois.reduce((s, p) => s + p.latitud, 0) / pois.length;
    const lng = pois.reduce((s, p) => s + p.longitud, 0) / pois.length;
    return [lat, lng];
  };

  const abrirNuevoPoi = (lat: number, lng: number) => {
    const defTipo = tipos[0];
    setPoiEditing(null);
    setPoiSelectedId(null);
    setPoiForm({
      nombre: '',
      tipo_id: defTipo ? defTipo.id : null,
      direccion: '',
      radio_metros: defTipo?.radio_default_metros ?? POI_RADIO_DEFAULT,
      activo: true,
      notas: '',
      latitud: lat,
      longitud: lng,
    });
    setPoiSheetOpen(true);
  };

  const abrirEditPoi = (poi: PuntoInteres) => {
    setPoiEditing(poi);
    setPoiSelectedId(poi.id);
    setPoiForm({
      nombre: poi.nombre,
      tipo_id: poi.tipo_id,
      direccion: poi.direccion || '',
      radio_metros: poi.radio_metros,
      activo: poi.activo,
      notas: poi.notas || '',
      latitud: poi.latitud,
      longitud: poi.longitud,
    });
    setPoiSheetOpen(true);
  };

  // Click en una fila del panel: recentra el mapa y abre el Sheet en edición.
  const seleccionarPoi = (poi: PuntoInteres) => {
    setMapTarget({ lat: poi.latitud, lng: poi.longitud, zoom: 15 });
    abrirEditPoi(poi);
  };

  // Al elegir un tipo en el Sheet: si estamos CREANDO, autocompletar el radio
  // con el default del tipo (en edición se respeta el radio ya guardado).
  const handlePoiTipoChange = (tipoIdStr: string) => {
    const tipoId = tipoIdStr === '' ? null : Number(tipoIdStr);
    setPoiForm((f) => {
      const t = tipos.find((x) => x.id === tipoId);
      const radio = !poiEditing && t?.radio_default_metros ? t.radio_default_metros : f.radio_metros;
      return { ...f, tipo_id: tipoId, radio_metros: radio };
    });
  };

  const guardarPoi = async () => {
    if (!poiForm.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (poiForm.tipo_id == null) {
      toast.error('Elegí un tipo de punto');
      return;
    }
    setPoiSaving(true);
    try {
      const payload = {
        tipo_id: poiForm.tipo_id,
        nombre: poiForm.nombre.trim(),
        direccion: poiForm.direccion.trim() || null,
        latitud: poiForm.latitud,
        longitud: poiForm.longitud,
        radio_metros: poiForm.radio_metros,
        activo: poiForm.activo,
        notas: poiForm.notas.trim() || null,
      };
      if (poiEditing) {
        await poiApi.updatePunto(poiEditing.id, payload);
        toast.success('Punto actualizado');
      } else {
        await poiApi.createPunto(payload);
        toast.success('Punto creado');
      }
      setPoiSheetOpen(false);
      await cargarPois();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error guardando el punto');
    } finally {
      setPoiSaving(false);
    }
  };

  const eliminarPoi = async () => {
    if (!poiToDelete) return;
    const id = poiToDelete.id;
    try {
      await poiApi.deletePunto(id);
      toast.success('Punto eliminado');
      setPoiToDelete(null);
      if (poiEditing?.id === id) {
        setPoiSheetOpen(false);
        setPoiEditing(null);
      }
      await cargarPois();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error eliminando el punto');
      setPoiToDelete(null);
    }
  };

  // Drag del marker -> confirmar y persistir la nueva ubicación.
  const confirmarMovimiento = async () => {
    if (!poiDragPending) return;
    const { poi, lat, lng } = poiDragPending;
    setPoiDragPending(null);
    try {
      await poiApi.updatePunto(poi.id, {
        tipo_id: poi.tipo_id,
        nombre: poi.nombre,
        direccion: poi.direccion ?? null,
        latitud: lat,
        longitud: lng,
        radio_metros: poi.radio_metros,
        activo: poi.activo,
        notas: poi.notas ?? null,
      });
      toast.success('Punto reubicado');
      await cargarPois();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error moviendo el punto');
      setPoiRevision((r) => r + 1); // snap-back al lugar original
    }
  };

  const cancelarMovimiento = () => {
    setPoiDragPending(null);
    setPoiRevision((r) => r + 1); // remonta el marker en su posición guardada
  };

  const recalcularZonas = async () => {
    setRecalculando(true);
    try {
      const r = await poiApi.recalcular();
      const n = (r.data as PoiRecalcularResponse)?.reclamos_en_zona ?? 0;
      toast.success(`Zonas recalculadas: ${n} reclamos en zona`);
      await loadPoiCounts(pois);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error recalculando las zonas');
    } finally {
      setRecalculando(false);
    }
  };

  const consolidarPoi = async (poi: PuntoInteres) => {
    setConsolidatingId(poi.id);
    try {
      const r = await poiApi.consolidar(poi.id);
      const data = r.data as PoiConsolidarResponse;
      toast.success(
        data.creada
          ? `OT ${data.numero} creada con ${data.reclamos_count} reclamos`
          : `OT ${data.numero} actualizada (${data.reclamos_count} reclamos)`,
      );
      await loadPoiCounts(pois);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error consolidando en OT');
    } finally {
      setConsolidatingId(null);
    }
  };

  // =================================================================
  // Export PDF de zona dibujada
  // =================================================================
  const exportZonaPdf = () => {
    if (!drawnBBox || reclamosEnBBox.length === 0) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const kpis = computeKPIs(reclamosEnBBox);
    const zonas = topZonas(reclamosEnBBox, 5, 150);

    const W = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Reporte de Zona — Mapa de Reclamos', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, margin, y);
    y += 6;
    doc.text(
      `Coordenadas: ${drawnBBox.minLat.toFixed(5)}, ${drawnBBox.minLng.toFixed(5)} → ${drawnBBox.maxLat.toFixed(5)}, ${drawnBBox.maxLng.toFixed(5)}`,
      margin,
      y,
    );
    y += 10;
    doc.setTextColor(0);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Indicadores principales', margin, y);
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`• Total reclamos en la zona: ${kpis.total}`, margin, y); y += 6;
    doc.text(`• Resueltos: ${kpis.resueltos} (${kpis.pctResueltos.toFixed(0)}%)`, margin, y); y += 6;
    doc.text(
      `• Tiempo medio de resolución: ${kpis.tiempoMedioDias != null ? kpis.tiempoMedioDias.toFixed(1) + ' días' : 's/d'}`,
      margin,
      y,
    ); y += 6;
    doc.text(`• Abiertos > 30 días: ${kpis.abiertos30dPlus}`, margin, y); y += 10;

    if (zonas.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Top zonas dentro del área', margin, y);
      y += 7;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      zonas.forEach((z, idx) => {
        const dir = z.topDireccion || `${z.centerLat.toFixed(4)}, ${z.centerLng.toFixed(4)}`;
        doc.text(`${idx + 1}. ${dir} — ${z.reclamos.length} reclamos`, margin, y);
        y += 6;
      });
      y += 4;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Listado de reclamos', margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    reclamosEnBBox.slice(0, 40).forEach((r, idx) => {
      if (y > 280) {
        doc.addPage();
        y = margin;
      }
      const linea = `${idx + 1}. #${r.id} — ${r.titulo} [${estadoLabel(r.estado)}] ${r.direccion || ''}`;
      const split = doc.splitTextToSize(linea, W - margin * 2);
      doc.text(split, margin, y);
      y += split.length * 4 + 2;
    });
    if (reclamosEnBBox.length > 40) {
      y += 3;
      doc.setTextColor(150);
      doc.text(`...y ${reclamosEnBBox.length - 40} reclamos más.`, margin, y);
    }

    doc.save(`reporte-zona-${Date.now()}.pdf`);
  };

  // =================================================================
  // Universos para pills/centros
  // =================================================================
  const getMapCenter = (): [number, number] => {
    if (reclamos.length === 0) return [-34.6037, -58.3816];
    const lat = reclamos.reduce((s, r) => s + (r.latitud || 0), 0) / reclamos.length;
    const lng = reclamos.reduce((s, r) => s + (r.longitud || 0), 0) / reclamos.length;
    return [lat, lng];
  };

  // Cambió la consulta (la pregunta o alguno de sus filtros): el universo
  // dibujado es otro, así que se vuelve a encuadrar el mapa.
  useEffect(() => {
    setFitSignal(s => s + 1);
  }, [pregunta, filtroCategoria, filtroDependencia, filtroEstado, timePreset]);

  // En modo Puntos no bloqueamos por la carga de reclamos (el panel de POIs
  // tiene su propio loading). El spinner global es solo para el modo Reclamos.
  if (loading && !isPuntos) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: theme.primary }}
        ></div>
      </div>
    );
  }

  // =================================================================
  // Marco de la pantalla (estándar v2.2): cabecera → hero → controles → mapa
  // =================================================================
  // Cabecera de módulo: eyebrow = el módulo, H1 = lo que el usuario viene a
  // resolver acá, bajada = qué está mirando. Un copy por modo: el mapa de
  // reclamos y el de puntos de interés NO son el mismo trabajo. El eyebrow se
  // auto-oculta si repite el último tramo de la miga (anti-eco del PageHeader).
  const cabecera = isPuntos
    ? {
        eyebrow: 'Mapa',
        title: 'Los lugares que seguís de cerca y qué se reclama alrededor',
        description:
          'Plazas, escuelas, centros de salud o cualquier punto que quieras vigilar, con su radio de influencia y los reclamos que caen adentro. Click en el mapa para marcar uno nuevo.',
      }
    : {
        eyebrow: 'Mapa',
        title: 'Dónde se concentran los reclamos del municipio',
        description:
          'Elegí una pregunta y el mapa te la contesta: dónde se repite el mismo problema, qué quedó atrasado, qué se resolvió y a qué barrios no estamos llegando.',
      };

  // =================================================================
  // Los controles: qué SUPERFICIE se mira (botonera) y qué se PREGUNTA
  // =================================================================
  // La botonera del kit queda para lo único que no es una consulta: elegir
  // entre el mapa de reclamos y el de puntos de interés (dos trabajos
  // distintos, con paneles distintos). Si el municipio no tiene el módulo de
  // puntos, no hay botonera: la pantalla arranca directo en la pregunta.
  const controlesMapa: AdaptiveControl[] = [];
  if (canUsePoi) {
    controlesMapa.push({
      tipo: 'toggles',
      id: 'superficie',
      etiqueta: 'MAPA DE',
      opciones: [
        { value: 'reclamos', label: 'Reclamos' },
        { value: 'puntos', label: 'Puntos de interés' },
      ],
      value: mapMode,
      onChange: (v) => setMapMode(v as MapMode),
    });
  }

  // --- Los filtros VIVEN DENTRO de la oración de la consulta ---
  // El label de cada opción es lo que se LEE en la frase, así que va en
  // minúscula y con su preposición ("cualquier categoría", "todas las áreas").
  // Los conteos entre paréntesis son datos reales del universo filtrado.
  const filtrosConsulta: ConsultaFiltro[] = [
    // ORDEN: primero la DEPENDENCIA y después el TIPO. La dependencia contiene
    // a las categorías, así que al revés se podían armar combinaciones que no
    // existen ("residuos a cargo de Tránsito") y la pantalla devolvía cero.
    {
      id: 'dependencia',
      etiqueta: 'Área',
      valor: filtroDependencia == null ? '' : String(filtroDependencia),
      anchoMin: 168,
      buscable: dependenciasDisponibles.length > 6,
      opciones: [
        { value: '', label: 'todas las áreas' },
        ...dependenciasDisponibles.map((d) => ({
          value: String(d.id),
          label: `${d.nombre} (${d.count})`,
        })),
      ],
      onChange: (v) => {
        setFiltroDependencia(v === '' ? null : Number(v));
        // El tipo elegido puede no pertenecer al área nueva: se limpia antes
        // de que quede una combinación imposible en pantalla.
        handleCategoriaChange(null);
      },
    },
    {
      id: 'categoria',
      etiqueta: 'Tipo',
      valor: filtroCategoria ?? '',
      anchoMin: 172,
      buscable: categoriasDisponibles.length > 6,
      opciones: [
        { value: '', label: 'cualquier tipo' },
        ...categoriasDisponibles.map((c) => ({
          value: c.key,
          label: `${c.label} (${c.count})`,
        })),
      ],
      onChange: (v) => handleCategoriaChange(v === '' ? null : v),
    },
    {
      id: 'periodo',
      etiqueta: 'Período',
      valor: timePreset === 'all' ? '' : timePreset,
      anchoMin: 168,
      opciones: PERIODOS,
      onChange: (v) => handleTimePresetChange((v === '' ? 'all' : v) as TimePreset),
    },
    {
      id: 'estado',
      etiqueta: 'Estado',
      valor: filtroEstado ?? '',
      anchoMin: 150,
      opciones: [
        { value: '', label: 'cualquiera' },
        ...Object.keys(ESTADO_COLORS_LISTA).map((estado) => ({
          value: estado,
          label: `${(estadoLabels[estado] || estado).toLowerCase()} (${conteosPorEstado[estado] || 0})`,
        })),
      ],
      onChange: (v) => setFiltroEstado(v === '' ? null : v),
    },
  ];

  // NOTA: la fila de la consulta queda LIMPIA — sólo la pregunta, la respuesta
  // y la oración. Las herramientas se repartieron por naturaleza, que es como
  // se navegan:
  //   · centrar / puntos de interés / cobertura → FLOTAN SOBRE EL MAPA, al
  //     lado del zoom, que es donde todo el mundo los busca (más abajo, en el
  //     lienzo);
  //   · el informe de una zona → PANEL PROPIO abajo, junto a los resultados:
  //     no es un control del mapa, es una acción que produce un documento.

  // --- El play CONTINÚA la oración: se aplica a la vista elegida ---
  // No es una pregunta más ni una herramienta suelta: reproduce, con ventana
  // móvil, LO QUE ESTÉ SELECCIONADO. Mientras corre muestra el rango real.
  const continuacionConsulta: ConsultaAccion = {
    id: 'timelapse',
    /* Con "Evolución" el botón se explica: el play pelado se leía como
       "aplicar filtros" (feedback del dueño, 2026-08-13) — y los combos ya
       aplican solos, así que ese malentendido era puro costo. */
    // Una sola palabra: no compite con la oración ni se encima en tablet
    // (el label largo "Ver la evolución" sí lo hacía). Mientras reproduce,
    // el texto pasa a ser el rango que se está viendo.
    label: tlEstado === 'reproduciendo' ? (rangoTimelapseLabel ?? 'Pausar') : 'Evolución',
    titulo:
      tlEstado === 'reproduciendo'
        ? 'Pausar'
        : tlEstado === 'pausado'
          ? 'Seguir'
          : tlEstado === 'finalizado'
            ? 'Verlo de nuevo'
            : 'Ver la evolución',
    icono: tlEstado === 'reproduciendo' ? Pause : Play,
    activo: tlActivo,
    disabled: timelapsePlan == null,
    onClick: timelapseToggle,
  };

  return (
    <div className="av2-page" data-module="mapa">
      {/* CSS para animación de hotspots (no ocupa lugar en el flujo) */}
      <style>{`
        @keyframes hotspot-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.15); }
        }
        .leaflet-interactive.hotspot-pulse {
          animation: hotspot-pulse 1.6s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      {/* 1. Cabecera de módulo: eyebrow + H1 + bajada. Lo PRIMERO que se lee. */}
      <PageHeader
        eyebrow={cabecera.eyebrow}
        title={cabecera.title}
        description={cabecera.description}
      />

      {/* 2. ModuleHero = SemanticHero con la stat strip adentro. */}
      <div className="av2-hero-wrap">
        <SemanticHero
          etiqueta={isPuntos ? 'MAPA · PUNTOS DE INTERÉS' : 'MAPA · RECLAMOS'}
          frases={heroFrases}
          kpis={heroKpis}
          className="av2-hero"
        />
      </div>

      {/* 3. La CONSULTA GUIADA. La pantalla ya no ofrece herramientas con
          nombre técnico: ofrece PREGUNTAS, arma sola la oración con los
          filtros adentro y contesta abajo con datos reales. La botonera del
          kit queda arriba sólo para elegir la superficie (reclamos / puntos
          de interés), que no es una consulta sino otro trabajo. */}
      <div className="av2-controles">
        {controlesMapa.length > 0 && (
          <AdaptiveFilter
            controles={controlesMapa}
            busy={loadingMore}
            className="av2-mapa-botonera"
          />
        )}

        {!isPuntos && (
          <ConsultaGuiada
            titulo="¿Qué querés ver en el mapa?"
            preguntas={PREGUNTAS}
            valor={pregunta}
            onChange={handlePreguntaChange}
            filtros={filtrosConsulta}
            respuesta={respuestaConsulta.length > 0 ? respuestaConsulta : undefined}
            continuacion={continuacionConsulta}
            verTodo={VER_TODO}
          />
        )}


      </div>

      {/* ============================ MODO RECLAMOS ============================ */}
      {!isPuntos && (
        <>
      <div className="av2-mapa" ref={lienzoRef}>
        {/* Alto ELÁSTICO: --av2-mapa-alto es el único valor runtime (el resto
            del estilo vive en abmv2.css [MAPA]). */}
        <div
          className="av2-mapa-lienzo"
          style={{ '--av2-mapa-alto': `${mapaAlto}px` } as CSSProperties}
        >
          <MapContainer
            center={getMapCenter()}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer attribution="&copy; OSM &copy; CARTO" url={tileUrl} />

            <FitBoundsToMarkers reclamos={reclamosFiltrados} signal={fitSignal} />
            <MapController target={mapTarget} />
            <InvalidarAlRedimensionar />

            {/* Coverage por dependencia */}
            {filtroDependencia != null && showCoverage && coveragePoints.length >= 3 && (
              <CoveragePolygon points={coveragePoints} color={coverageColor} />
            )}

            {/* Capa opcional de Puntos de Interés (tenue) sobre el mapa de
                reclamos. Reutiliza pois ya cargados por cargarPois(); se dibuja
                antes que los pins para que los reclamos queden por encima. */}
            {canUsePoi && showPois &&
              pois.map((poi) => {
                const color = poi.tipo_color || theme.primary;
                return (
                  <Fragment key={`poi-layer-${poi.id}`}>
                    <Circle
                      center={[poi.latitud, poi.longitud]}
                      radius={poi.radio_metros}
                      interactive={false}
                      pathOptions={{
                        color,
                        weight: 1,
                        opacity: 0.35,
                        fillColor: color,
                        fillOpacity: poi.activo ? 0.06 : 0.03,
                        dashArray: poi.activo ? undefined : '6 4',
                      }}
                    />
                    <Marker
                      position={[poi.latitud, poi.longitud]}
                      icon={createPoiIcon(color, false, 14)}
                    >
                      <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                        <div className="font-medium text-sm">{poi.nombre}</div>
                        <div className="text-xs text-gray-500">
                          {poi.tipo_nombre || 'Sin tipo'} · {poi.radio_metros} m
                        </div>
                      </Tooltip>
                    </Marker>
                  </Fragment>
                );
              })}

            {/* CÓMO se contesta la pregunta. No lo elige el usuario en un
                combo con nombres técnicos: lo decide la pregunta.
                  · densidad → la mancha, para ver dónde se amontona;
                  · puntos   → un reclamo por pin, con su color. */}
            {dibujoMapa === 'densidad' && (
              <HeatLayer reclamos={reclamosFiltrados} rampa={rampaDensidad} />
            )}

            {dibujoMapa === 'puntos' &&
              reclamosFiltrados.map(r => (
                <Marker
                  key={r.id}
                  position={[r.latitud!, r.longitud!]}
                  icon={createPinIcon(colorDelPin(r), glifoDelPin(r))}
                  eventHandlers={{ click: () => handleMarkerClick(r) }}
                >
                  <Tooltip direction="top" offset={[0, -42]} permanent={false}>
                    <div className="font-medium text-sm">{r.titulo}</div>
                    <div className="text-xs text-gray-500">{r.direccion}</div>
                    {r.dependencia_asignada?.nombre && (
                      <div className="text-xs font-medium" style={{ color: colorDelPin(r) }}>
                        {r.dependencia_asignada.nombre}
                      </div>
                    )}
                  </Tooltip>
                </Marker>
              ))}

            {/* Círculos sobre las esquinas que repiten (sólo esa pregunta). */}
            {preguntaConfig?.repeticiones && <HotspotLayer hotspots={hotspots} />}

            {/* El mapa se rotula a sí mismo con lo que contesta la pregunta.
                La `key` por pregunta lo REMONTA al cambiar: sin eso Leaflet
                dejaba burbujas vacías de los rótulos anteriores flotando sobre
                el mapa (los tooltips permanentes no se reciclan bien cuando
                cambia todo el conjunto). */}
            <RotulosLayer key={`rotulos-${pregunta || 'todo'}`} rotulos={rotulos} />

            {/* Drawn rectangle */}
            {drawnBBox && (
              <Rectangle
                bounds={[
                  [drawnBBox.minLat, drawnBBox.minLng],
                  [drawnBBox.maxLat, drawnBBox.maxLng],
                ]}
                pathOptions={{
                  color: theme.primary,
                  weight: 2,
                  fillOpacity: 0.05,
                  dashArray: '4 4',
                }}
              />
            )}

            {/* Draw handler */}
            <DrawHandler
              active={drawMode}
              onComplete={handleDrawComplete}
              onCancel={handleDrawCancel}
            />
          </MapContainer>
        </div>

        {/* Controles del CANVAS, flotando sobre el mapa al lado del zoom: en
            cualquier mapa que la gente haya usado en su vida están ahí, no en
            una barra arriba. Mismo tratamiento visual que la leyenda de
            densidad (superficie, borde y sombra flotante de los tokens). */}
        <div className="av2-mapa-controles">
          <button
            type="button"
            className="av2-mapa-ctrl"
            onClick={() => setFitSignal((s) => s + 1)}
            title="Centrar el mapa"
            aria-label="Centrar el mapa"
          >
            <LocateFixed size={16} strokeWidth={2} aria-hidden />
          </button>
          {canUsePoi && (
            <button
              type="button"
              className={`av2-mapa-ctrl${showPois ? ' av2-mapa-ctrl--activo' : ''}`}
              onClick={() => setShowPois((s) => !s)}
              aria-pressed={showPois}
              title="Mostrar los puntos de interés"
              aria-label="Mostrar los puntos de interés"
            >
              <MapPinned size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
          {filtroDependencia != null && (
            <button
              type="button"
              className={`av2-mapa-ctrl${showCoverage ? ' av2-mapa-ctrl--activo' : ''}`}
              onClick={() => setShowCoverage((s) => !s)}
              aria-pressed={showCoverage}
              title="Hasta dónde llega el área"
              aria-label="Hasta dónde llega el área"
            >
              <Building2 size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>

        {/* Leyenda de densidad: sólo tiene sentido con la mancha de calor
            encendida. La rampa son los 3 matices de veredicto del theme —
            los MISMOS que pinta el heatmap, así la leyenda no miente.
            No se rotula "1 · 10+": la intensidad de leaflet.heat está
            normalizada, no equivale a una cantidad de reclamos. */}
        {dibujoMapa === 'densidad' && reclamosFiltrados.length > 0 && (
          <div className="av2-mapa-leyenda">
            <span className="av2-mapa-leyenda-titulo">Densidad</span>
            <span className="av2-mapa-leyenda-extremo">menos</span>
            <span className="av2-mapa-leyenda-rampa" aria-hidden />
            <span className="av2-mapa-leyenda-extremo">más</span>
          </div>
        )}

        {/* Vacío: sin esto el mapa queda mudo y parece roto. */}
        {reclamosFiltrados.length === 0 && (
          <div className="av2-mapa-vacio">
            <div className="av2-mapa-vacio-card">
              <MapPinOff size={26} strokeWidth={1.6} aria-hidden />
              <p className="av2-mapa-vacio-titulo">Nada que dibujar para esta consulta</p>
              <p className="av2-mapa-vacio-texto">
                {reclamos.length > 0
                  ? `Hay ${reclamos.length.toLocaleString('es-AR')} reclamos ubicados en el mapa, pero ninguno entra en lo que preguntaste.`
                  : 'Todavía no hay reclamos con coordenada para dibujar en el mapa.'}
              </p>
              {reclamos.length > 0 && (
                <button type="button" className="av2-btn-secundario" onClick={handleClearAllFiltros}>
                  <Eraser size={14} strokeWidth={2} aria-hidden />
                  Volver a empezar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Hint mientras marcás el área del informe. El resumen y la descarga
            NO viven acá: viven en el panel "Informe de una zona" de abajo. */}
        {drawMode && !drawnBBox && (
          <div className="av2-mapa-hint">
            <Pencil size={12} strokeWidth={2} aria-hidden />
            Arrastrá sobre el mapa para marcar la zona del informe
          </div>
        )}
      </div>

      {/* Banda del time-lapse: sólo mientras el recorrido está activo. */}
        {/* El reproductor aparece CUANDO SE LO LLAMA: se monta al apretar el
            play de la oración y no antes. En reposo la pantalla no muestra
            controles de algo que el usuario todavía no pidió. */}
        {tlActivo && timelapsePlan && !isPuntos && (
          <MapaTimelapseBanda
            ventanaDias={timelapsePlan.ventanaDias}
            rangoLabel={rangoVentanaLabel}
            reclamosEnVentana={reclamosFiltrados.length}
            comparacion={comparacionVentana}
            reproduciendo={tlEstado === 'reproduciendo'}
            finalizado={tlEstado === 'finalizado'}
            onTogglePlay={timelapseToggle}
            velocidad={tlVelocidad}
            onVelocidad={setTlVelocidad}
            bucle={tlBucle}
            onToggleBucle={() => setTlBucle((b) => !b)}
            onReset={timelapseReset}
            serieEntradas={electroDatos?.entradas ?? []}
            serieResueltos={electroDatos?.resueltos ?? []}
            hito={hitoElectro}
            cursor={ventanaTimelapse?.hasta ?? null}
            ventana={ventanaTimelapse ? [ventanaTimelapse.desde, ventanaTimelapse.hasta] : null}
            marcasEje={marcasEjeElectro}
            onSeleccionar={saltarAMomento}
            ariaLabelElectro="Reclamos que entraron y se resolvieron a lo largo del período"
            /* SIEMPRE visible, no sólo al terminar el recorrido: es la
               conclusión del período y lo más valioso de la pantalla —
               esconderla detrás de 30 segundos de animación era perderla. */
            remate={remateElectro}
          />
        )}

      {/* === Informe de una zona: no es un control del mapa, es una acción que
             PRODUCE UN DOCUMENTO. Por eso tiene panel propio, con el nombre de
             lo que genera y el resumen de lo que va a entrar adentro. === */}
      <section className="av2-panel av2-informe">
        <div className="av2-panel-head">
          <FileDown size={16} strokeWidth={2} aria-hidden />
          <h2 className="av2-panel-titulo">Informe de una zona</h2>
          <span className="av2-panel-caption">PDF con el detalle de los reclamos del área</span>
        </div>
        <div className="av2-informe-fila">
          {!drawnBBox ? (
            <>
              <p className="av2-informe-texto">
                Marcá un área del mapa y descargás el detalle de esos reclamos en PDF:
                los indicadores del área, las cinco zonas que más repiten y el listado
                reclamo por reclamo.
              </p>
              <div className="av2-informe-acciones">
                <button
                  type="button"
                  className={`av2-btn-secundario${drawMode ? ' av2-btn-secundario--activo' : ''}`}
                  onClick={handleToggleDraw}
                >
                  <Square size={14} strokeWidth={2} aria-hidden />
                  {drawMode ? 'Cancelar el marcado' : 'Marcar el área en el mapa'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="av2-informe-texto">
                <span className="av2-informe-resumen">
                  {reclamosEnBBox.length}{' '}
                  {reclamosEnBBox.length === 1 ? 'reclamo' : 'reclamos'}
                </span>{' '}
                en el área marcada.{' '}
                {reclamosEnBBox.length === 0
                  ? 'Movete o marcá otra zona: así el informe saldría vacío.'
                  : 'Eso es lo que va a salir en el informe.'}
              </p>
              <div className="av2-informe-snapshot">
                <ZonaSnapshot reclamos={reclamosEnBBox} theme={theme} />
              </div>
              <div className="av2-informe-acciones">
                <button
                  type="button"
                  className="av2-btn-primario"
                  onClick={exportZonaPdf}
                  disabled={reclamosEnBBox.length === 0}
                >
                  <FileDown size={14} strokeWidth={2} aria-hidden />
                  Descargar el informe
                </button>
                <button type="button" className="av2-btn-secundario" onClick={clearDrawnBBox}>
                  <X size={14} strokeWidth={2} aria-hidden />
                  Borrar el área
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* === Sección de análisis debajo del mapa. El ranking NO es fijo:
             cambia con la pregunta (mismo componente, otro contenido y otro
             encabezado) y va acompañado de los paneles de estado y
             tendencia. === */}
      <MapaStats
        reclamos={reclamosFiltrados}
        statusColors={ESTADO_COLORS_LISTA}
        statusLabels={estadoLabels}
        ranking={ranking.items}
        rankingId={ID_RANKING}
        rankingTitulo={ranking.titulo}
        rankingCaption={ranking.caption}
        rankingIcono={ranking.icono}
        rankingTono={ranking.tono}
        rankingVacio={ranking.vacio}
      />
        </>
      )}

      {/* ============================= MODO PUNTOS ============================= */}
      {isPuntos && (
        <div className="flex flex-col lg:flex-row gap-4 mt-3">
          <div className="av2-mapa av2-mapa--pegado flex-1 min-w-0" ref={lienzoRef}>
            <div
              className="av2-mapa-lienzo"
              style={{ '--av2-mapa-alto': `${mapaAlto}px` } as CSSProperties}
            >
              <MapContainer
                center={getPoiCenter()}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer attribution="&copy; OSM &copy; CARTO" url={tileUrl} />

                <FitBoundsToLatLngs points={poiPoints} signal={poiFitSignal} />
                <MapController target={mapTarget} />
                <InvalidarAlRedimensionar />
                <PoiClickHandler onPick={abrirNuevoPoi} />

                {pois.map((poi) => {
                  const color = poi.tipo_color || theme.primary;
                  return (
                    <Fragment key={`poi-${poi.id}-${poiRevision}`}>
                      <Circle
                        center={[poi.latitud, poi.longitud]}
                        radius={poi.radio_metros}
                        interactive={false}
                        pathOptions={{
                          color,
                          weight: 2,
                          opacity: 0.7,
                          fillColor: color,
                          fillOpacity: poi.activo ? 0.12 : 0.05,
                          dashArray: poi.activo ? undefined : '6 4',
                        }}
                      />
                      <Marker
                        position={[poi.latitud, poi.longitud]}
                        draggable
                        icon={createPoiIcon(color, poiSelectedId === poi.id)}
                        eventHandlers={{
                          click: () => abrirEditPoi(poi),
                          dragend: (e) => {
                            const ll = (e.target as L.Marker).getLatLng();
                            setPoiDragPending({ poi, lat: ll.lat, lng: ll.lng });
                          },
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -14]} permanent={false}>
                          <div className="font-medium text-sm">{poi.nombre}</div>
                          <div className="text-xs text-gray-500">
                            {poi.tipo_nombre || 'Sin tipo'} · {poi.radio_metros} m
                          </div>
                        </Tooltip>
                      </Marker>
                    </Fragment>
                  );
                })}
              </MapContainer>
            </div>

            {/* Hint flotante para crear */}
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] px-4 py-2 rounded-full text-xs font-medium shadow-lg pointer-events-none flex items-center gap-1.5"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
            >
              <MapPin size={12} /> Click en el mapa para crear un punto · arrastrá para mover
            </div>
          </div>

          <MapaPuntosPanel
            pois={pois}
            loading={poiLoading}
            search={poiSearch}
            onSearchChange={setPoiSearch}
            counts={poiCounts}
            countsLoading={poiCountsLoading}
            selectedId={poiSelectedId}
            onSelect={seleccionarPoi}
            onConsolidar={consolidarPoi}
            consolidatingId={consolidatingId}
            onDelete={(poi) => setPoiToDelete(poi)}
            onRecalcular={recalcularZonas}
            recalculando={recalculando}
          />
        </div>
      )}

      {/* Side Drawer */}
      {createPortal(
        <>
          <div
            onClick={closeSidebar}
            className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 z-[9998] ${
              sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />
          <div
            className={`fixed top-0 right-0 h-screen w-full sm:w-[420px] transform transition-transform duration-300 ease-in-out z-[9999] ${
              sidebarOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{
              backgroundColor: theme.card,
              borderLeft: `1px solid ${theme.border}`,
              boxShadow: sidebarOpen ? '-8px 0 32px rgba(0,0,0,0.25)' : 'none',
            }}
          >
            {selected && (
              <div className="h-full flex flex-col">
                <div
                  className="p-4 flex items-center justify-between"
                  style={{ borderBottom: `1px solid ${theme.border}` }}
                >
                  <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                    Detalle del Reclamo
                  </h3>
                  <button
                    onClick={closeSidebar}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: theme.textSecondary }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.backgroundSecondary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-3 py-1 text-sm font-medium rounded-full text-white"
                      style={{ backgroundColor: estadoColor(selected.estado) }}
                    >
                      {estadoLabel(selected.estado)}
                    </span>
                    <span className="text-xs" style={{ color: theme.textSecondary }}>
                      #{selected.id}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xl font-bold" style={{ color: theme.text }}>
                      {selected.titulo}
                    </h4>
                  </div>

                  {selected.descripcion && (
                    <div>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        {selected.descripcion}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Tag className="h-5 w-5" style={{ color: selected.categoria?.color || theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Categoría</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {selected.categoria?.nombre || 'Sin categoría'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <MapPin className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Dirección</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {selected.direccion || 'Sin dirección'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Navigation className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Coordenadas</p>
                        <p className="font-medium font-mono text-sm" style={{ color: theme.text }}>
                          {selected.latitud?.toFixed(6)}, {selected.longitud?.toFixed(6)}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Calendar className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Fecha de creación</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {formatDate(selected.created_at)}
                        </p>
                      </div>
                    </div>

                    {selected.creador && (
                      <div
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{ backgroundColor: theme.backgroundSecondary }}
                      >
                        <User className="h-5 w-5" style={{ color: theme.primary }} />
                        <div>
                          <p className="text-xs" style={{ color: theme.textSecondary }}>Reportado por</p>
                          <p className="font-medium" style={{ color: theme.text }}>
                            {selected.creador.nombre} {selected.creador.apellido}
                          </p>
                        </div>
                      </div>
                    )}

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Clock className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Tiempo transcurrido</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {Math.floor(
                            (Date.now() - new Date(selected.created_at).getTime()) /
                              (1000 * 60 * 60 * 24),
                          )}{' '}
                          días
                        </p>
                      </div>
                    </div>
                  </div>

                  {selected.documentos &&
                    selected.documentos.filter(d => d.tipo?.startsWith('image')).length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                          Imágenes (
                          {selected.documentos.filter(d => d.tipo?.startsWith('image')).length})
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {selected.documentos
                            .filter(d => d.tipo?.startsWith('image'))
                            .map((doc, idx) => (
                              <img
                                key={idx}
                                src={doc.url}
                                alt={`Imagen ${idx + 1}`}
                                className="rounded-lg object-cover h-24 w-full"
                              />
                            ))}
                        </div>
                      </div>
                    )}

                  <button
                    onClick={() => {
                      const id = selected.id;
                      closeSidebar();
                      navigate(`/gestion/reclamos?abrir=${id}`);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Settings className="h-5 w-5" />
                    Gestionar reclamo
                  </button>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}

      {/* Sheet de POI (crear / editar) */}
      <Sheet
        open={poiSheetOpen}
        onClose={() => setPoiSheetOpen(false)}
        title={poiEditing ? 'Editar punto de interés' : 'Nuevo punto de interés'}
        description={
          poiEditing
            ? poiEditing.tipo_nombre || undefined
            : 'Definí su zona de influencia (radio)'
        }
        stickyFooter={
          <div className="flex items-center justify-between gap-2">
            {poiEditing ? (
              <button
                onClick={() => {
                  const target = poiEditing;
                  setPoiSheetOpen(false);
                  setPoiToDelete(target);
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-1.5"
                style={{ backgroundColor: '#ef444415', color: '#ef4444' }}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPoiSheetOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarPoi}
                disabled={poiSaving}
                className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {poiSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={poiForm.nombre}
              onChange={(e) => setPoiForm({ ...poiForm, nombre: e.target.value })}
              placeholder="Ej: Hospital Central, Escuela N°3, Plaza San Martín..."
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Tipo <span className="text-red-500">*</span>
            </label>
            <ModernSelect
              value={poiForm.tipo_id == null ? '' : String(poiForm.tipo_id)}
              onChange={handlePoiTipoChange}
              placeholder="Elegí un tipo"
              searchable={tipos.length > 6}
              options={tipos.map((t) => ({
                value: String(t.id),
                label: t.nombre,
                color: t.color || undefined,
              }))}
            />
            {tipos.length === 0 && (
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                No hay tipos de punto. Creálos en Configuración → Tipos de Punto.
              </p>
            )}
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Dirección <span style={{ color: theme.textSecondary }}>(opcional)</span>
            </label>
            <input
              type="text"
              value={poiForm.direccion}
              onChange={(e) => setPoiForm({ ...poiForm, direccion: e.target.value })}
              placeholder="Ej: Av. Siempre Viva 742"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          {/* Radio */}
          <div>
            <Slider
              label="Radio de zona (m)"
              value={poiForm.radio_metros}
              onChange={(v) => setPoiForm({ ...poiForm, radio_metros: v })}
              min={100}
              max={10000}
              step={100}
            />
          </div>

          {/* Coordenadas (read-only; se mueven por drag) */}
          <div
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <Navigation className="h-5 w-5 flex-shrink-0" style={{ color: theme.primary }} />
            <div className="min-w-0">
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Coordenadas {poiEditing ? '(arrastrá el marker en el mapa para mover)' : ''}
              </p>
              <p className="text-sm font-mono" style={{ color: theme.text }}>
                {poiForm.latitud.toFixed(6)}, {poiForm.longitud.toFixed(6)}
              </p>
            </div>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: theme.text }}>
              Activo
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={poiForm.activo}
              onClick={() => setPoiForm({ ...poiForm, activo: !poiForm.activo })}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ backgroundColor: poiForm.activo ? theme.primary : theme.border }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: poiForm.activo ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Notas <span style={{ color: theme.textSecondary }}>(opcional)</span>
            </label>
            <textarea
              rows={3}
              value={poiForm.notas}
              onChange={(e) => setPoiForm({ ...poiForm, notas: e.target.value })}
              placeholder="Contexto de la zona, referencias, etc."
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
        </div>
      </Sheet>

      {/* Confirmar borrado de POI */}
      <ConfirmModal
        isOpen={!!poiToDelete}
        onClose={() => setPoiToDelete(null)}
        onConfirm={eliminarPoi}
        title="Eliminar punto de interés"
        message={`¿Eliminar "${poiToDelete?.nombre}"? Los reclamos dejarán de asociarse a esta zona.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />

      {/* Confirmar movimiento (drag del marker) */}
      <ConfirmModal
        isOpen={!!poiDragPending}
        onClose={cancelarMovimiento}
        onConfirm={confirmarMovimiento}
        title="Mover punto"
        message={
          poiDragPending
            ? `¿Reubicar "${poiDragPending.poi.nombre}" a las nuevas coordenadas?`
            : ''
        }
        confirmText="Mover"
        cancelText="Cancelar"
        variant="warning"
      />
    </div>
  );
}

// =====================================================================
// Mini-snapshot para popup de zona dibujada
// =====================================================================
function ZonaSnapshot({
  reclamos,
  theme,
}: {
  reclamos: Reclamo[];
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  if (reclamos.length === 0) {
    return (
      <p className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>
        No hay reclamos en el área seleccionada.
      </p>
    );
  }
  const resueltos = reclamos.filter(r => isResuelto(r.estado)).length;
  const abiertos = reclamos.length - resueltos;
  // Top categoría
  const catCounts: Record<string, number> = {};
  for (const r of reclamos) {
    const k = r.categoria?.nombre || 'Sin categoría';
    catCounts[k] = (catCounts[k] || 0) + 1;
  }
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: theme.text }}>{reclamos.length}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Total</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: estadoColor('finalizado') }}>{resueltos}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Resueltos</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: estadoColor('recibido') }}>{abiertos}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Abiertos</p>
        </div>
      </div>
      {topCat && (
        <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: theme.background, color: theme.text }}>
          <span style={{ color: theme.textSecondary }}>Top categoría: </span>
          <span className="font-bold">{topCat[0]}</span> ({topCat[1]})
        </div>
      )}
    </div>
  );
}
