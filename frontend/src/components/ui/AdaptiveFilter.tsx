/**
 * AdaptiveFilter — LA BOTONERA del KIT. Una o dos filas, nunca desborda.
 *
 * AGNÓSTICO: es un componente del framework, no de esta app. No sabe qué
 * filtra ni qué dispara (capas, mapas, sucursales, vendedores…): todo entra
 * por props. Cero lógica de dominio, cero colores fijos — los estilos viven
 * en styles/adaptive-filter.css sobre tokens --pl-*.
 *
 * DOS NIVELES DE ESTRUCTURA
 *
 *   1. CONTROLES (`tipo`), la unidad atómica:
 *        'opciones'  N opciones, una activa. Píldoras ⇄ `+K` ⇄ combo.
 *        'toggles'   2-4 opciones excluyentes SIEMPRE juntas (segmented),
 *                    con etiqueta opcional adelante. Nunca se parte.
 *        'accion'    botón icono + label (+ badge). Degrada a SÓLO icono.
 *        'icono'     botón cuadrado, sólo icono, nunca label.
 *        'busqueda'  input con lupa; absorbe el espacio elástico de la fila.
 *
 *   2. GRUPO ETIQUETADO (`tipo: 'grupo'`), la unidad SEMÁNTICA: un rótulo en
 *      caps que envuelve N controles de CUALQUIER tipo ("CAPA", "VISTA",
 *      "ANÁLISIS", "REPRODUCCIÓN"). Sin esto, una fila de nueve controles es
 *      una ensalada: el usuario no sabe para qué sirve cada cosa.
 *      El grupo es INDIVISIBLE: no se parte entre filas ni entre lados, y
 *      cuando aprieta degrada HACIA ADENTRO (sus controles se comprimen);
 *      recién después colapsa entero a un botón compacto que CONSERVA el
 *      rótulo y abre sus controles en un panel sobre la fila.
 *      El rótulo es lo ÚLTIMO que se sacrifica: sin rótulo, el usuario
 *      vuelve a no saber qué está mirando.
 *
 * ORDEN DE DEGRADACIÓN (el corazón). Nunca desaparece una capacidad, sólo
 * se comprime su presentación. De menos a más agresivo:
 *   1. la búsqueda se encoge de su ancho ideal a su ancho mínimo;
 *   2. las píldoras que no entran pasan al control `+K`;
 *   3. las acciones pierden el label y quedan en icono (el `title` conserva
 *      el texto);
 *   4. los toggles colapsan a combo;
 *   5. los grupos etiquetados colapsan a su botón compacto (con rótulo);
 *   6. la búsqueda colapsa a un botón de lupa que la abre sobre la fila;
 *   7. último recurso: se ocultan los RÓTULOS de los grupos, y los grupos de
 *      opciones que no entren ni con una píldora caen a combo.
 * La búsqueda es el elemento elástico: es la primera en ceder ancho y la
 * anteúltima en cambiar de forma.
 *
 * FILAS: cada control (o grupo) declara `fila: 1 | 2` (default 1). Las dos
 * filas viven en la MISMA tarjeta, separadas por un hairline; si hay una
 * sola, la tarjeta lleva igual sus cuatro esquinas redondeadas. Cada fila se
 * mide y se degrada por su cuenta, y ambas arrancan en la MISMA X (cuando
 * hay rótulo de barra, las filas siguientes reservan su sangría).
 *
 * ALINEACIÓN: `lado: 'inicio' | 'fin'` parte la fila en dos bloques con un
 * separador elástico en el medio (si hay búsqueda, el elástico es ella), así
 * no quedan huecos muertos. Entre bloques de contexto consecutivos
 * ('opciones' / 'toggles' / 'grupo') se dibuja un divisor vertical de
 * 1px × 24px; `divisor: true|false` lo fuerza o lo suprime. NUNCA hay
 * divisores dentro de un grupo.
 *
 * SIMETRÍA: una sola altura para todo (`--af-h`, 34px), un solo radio de
 * botón (`--af-r`), un solo tamaño de icono (`--af-icono`) y dos gaps con
 * jerarquía: `--af-gap-interno` dentro de un grupo, `--af-gap-bloque` entre
 * bloques. Los números viven en el CSS, no acá.
 *
 * ETIQUETAS: los labels de las píldoras se ABREVIAN por palabra (Secretaría →
 * Sec., Dirección → Dir.) para que entren muchas más por línea. No se truncan
 * con puntos suspensivos: el texto completo vive en el `title`. El diccionario
 * es una prop (`abreviaturas`) porque cada dominio/idioma tiene el suyo.
 *
 * MEDICIÓN SIN LOOP INFINITO (el error clásico): jamás se mide el nodo real.
 * Si se midiera, al recortar contenido se dejaría de desbordar → volvería
 * todo → desbordaría… parpadeo eterno. Acá se mide SIEMPRE contra nodos cuyo
 * ancho NO depende de la decisión:
 *   1. `.af-fantasma` — render fantasma, por fila, con TODAS las variantes de
 *      cada control (píldoras completas + sonda del `+K`, segmented + su
 *      combo, acción con label + acción en icono, botón de búsqueda, rótulo
 *      de grupo + botón compacto con y sin rótulo) y una sonda del divisor.
 *      Absoluto, alto 0, `visibility:hidden`, `width:max-content`. De ahí
 *      salen todos los anchos y los gaps (leídos del CSS computado, nunca
 *      hardcodeados).
 *   2. `.af-cuerpo` — contenedor `flex: 1 1 0%; min-width: 0`: su ancho es el
 *      espacio libre de la fila, independiente de su contenido.
 * El plan es una función PURA de esas medidas (`planificarFila`), así que no
 * hay realimentación posible. El `ResizeObserver` mira ambos nodos: el cuerpo
 * capta el resize de ventana/sidebar; el fantasma, cambios de opciones o de
 * tipografía (font swap). Los paneles (búsqueda abierta, grupo colapsado) son
 * ABSOLUTOS sobre la fila justamente para no entrar en esa ecuación.
 *
 * COMPATIBILIDAD: la prop `groups` (API vieja, sólo grupos de opciones) sigue
 * viva y se traduce a `controles` de tipo 'opciones' — mismo DOM, mismo
 * cálculo, mismo resultado.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter, Search, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { ModernSelect } from './ModernSelect';

export interface AdaptiveFilterOption {
  value: string;
  label: string;
}

/** Fila donde vive el control: 1 = superior, 2 = bajo el hairline. */
export type AdaptiveFilaId = 1 | 2;
/** Lado del separador elástico. */
export type AdaptiveLado = 'inicio' | 'fin';

interface AdaptiveControlBase {
  /** Clave estable del control. */
  id: string;
  /** Fila (default 1). Dentro de un grupo se ignora: manda el grupo. */
  fila?: AdaptiveFilaId;
  /** Bloque de la fila (default 'inicio'). Dentro de un grupo se ignora. */
  lado?: AdaptiveLado;
  /** Divisor vertical ANTES de este control. Default: automático (entre dos
   *  bloques de contexto consecutivos del mismo lado). Dentro de un grupo se
   *  ignora: adentro NUNCA hay divisores. */
  divisor?: boolean;
}

/** N opciones, una activa. Píldoras ⇄ `+K` ⇄ combo. */
export interface AdaptiveControlOpciones extends AdaptiveControlBase {
  tipo: 'opciones';
  /** Texto de la opción "todas" y del combo cuando colapsa. */
  placeholder: string;
  opciones: AdaptiveFilterOption[];
  /** Valor seleccionado; '' = todas. */
  value: string;
  onChange: (value: string) => void;
}

/** 2-4 opciones excluyentes que se ven SIEMPRE juntas (segmented control). */
export interface AdaptiveControlToggles extends AdaptiveControlBase {
  tipo: 'toggles';
  /** Rótulo corto antes del grupo. Redundante si ya vive en un `'grupo'`. */
  etiqueta?: string;
  opciones: AdaptiveFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Botón de acción: icono + label (+ badge). Degrada a sólo icono. */
export interface AdaptiveControlAccion extends AdaptiveControlBase {
  tipo: 'accion';
  label: string;
  icono: LucideIcon;
  onClick: () => void;
  /** Acción con estado encendido/apagado (acento suave cuando está activa). */
  activo?: boolean;
  badge?: string | number;
  disabled?: boolean;
}

/** Botón cuadrado, sólo icono. Nunca muestra label. */
export interface AdaptiveControlIcono extends AdaptiveControlBase {
  tipo: 'icono';
  /** Texto accesible (title + aria-label). */
  label: string;
  icono: LucideIcon;
  onClick: () => void;
  activo?: boolean;
  disabled?: boolean;
}

/** Input de búsqueda. Absorbe el espacio elástico de la fila. */
export interface AdaptiveControlBusqueda extends AdaptiveControlBase {
  tipo: 'busqueda';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Ancho reservado cuando sobra espacio (px). Default 260. */
  anchoIdeal?: number;
  /** Ancho mínimo antes de colapsar a botón (px). Default 132. */
  anchoMinimo?: number;
}

/** Los cinco controles atómicos. Son los únicos que pueden vivir en un grupo. */
export type AdaptiveControlSimple =
  | AdaptiveControlOpciones
  | AdaptiveControlToggles
  | AdaptiveControlAccion
  | AdaptiveControlIcono
  | AdaptiveControlBusqueda;

/**
 * Grupo ETIQUETADO: un rótulo que le pone nombre a un conjunto de controles.
 * Es la unidad semántica de la botonera y es INDIVISIBLE (ver cabecera).
 * Los `fila` / `lado` / `divisor` de los hijos se ignoran: manda el grupo.
 */
export interface AdaptiveControlGrupo extends AdaptiveControlBase {
  tipo: 'grupo';
  /** Rótulo en caps (se muestra tal cual llega, el CSS lo pone en mayúsculas). */
  etiqueta: string;
  /** Icono del botón compacto cuando el grupo colapsa sin rótulo. */
  icono?: LucideIcon;
  controles: AdaptiveControlSimple[];
}

export type AdaptiveControl = AdaptiveControlSimple | AdaptiveControlGrupo;

/**
 * @deprecated API vieja (sólo grupos de opciones). Equivale a `controles` con
 * `tipo: 'opciones'`; se mantiene para no romper las pantallas que ya la usan.
 */
export interface AdaptiveFilterGroup {
  /** Clave estable del grupo. */
  id: string;
  /** Texto del combo cuando colapsa y de la opción "todas". */
  placeholder: string;
  options: AdaptiveFilterOption[];
  /** Valor seleccionado; '' = todas. */
  value: string;
  onChange: (value: string) => void;
}

export interface AdaptiveFilterProps {
  /** Controles y grupos de la botonera (API actual). */
  controles?: AdaptiveControl[];
  /** @deprecated usar `controles`. Se traduce a controles de tipo 'opciones'. */
  groups?: AdaptiveFilterGroup[];
  /** Rótulo de la izquierda de la fila 1. Default: "FILTRAR" con `groups`,
   *  ninguno con `controles`. `null` lo oculta siempre. */
  label?: string | null;
  icon?: LucideIcon;
  /** Diccionario palabra → abreviatura para los labels de las píldoras.
   *  Default: castellano administrativo (Sec./Subsec./Dir./Depto./Adm./Muni.).
   *  Pasar un mapa propio lo reemplaza; `{}` desactiva las abreviaturas. */
  abreviaturas?: Record<string, string>;
  /** Indicador de recarga al final de la primera fila. */
  busy?: boolean;
  className?: string;
}

/**
 * Diccionario por defecto (castellano administrativo). Claves en minúscula;
 * se incluyen las variantes sin tilde porque los datos reales vienen de
 * cualquier manera. No se exporta a propósito (fast-refresh: este archivo
 * sólo exporta el componente): pasar `abreviaturas` REEMPLAZA este default.
 */
const ABREVIATURAS_ES: Record<string, string> = {
  'secretaría': 'Sec.',
  'secretaria': 'Sec.',
  'subsecretaría': 'Subsec.',
  'subsecretaria': 'Subsec.',
  'dirección': 'Dir.',
  'direccion': 'Dir.',
  'departamento': 'Depto.',
  'administración': 'Adm.',
  'administracion': 'Adm.',
  'municipalidad': 'Muni.',
};

/** Colchón (px) contra redondeos subpíxel: nunca desbordar por medio píxel. */
const SEGURIDAD = 2;
/** Sólo si el navegador no resuelve el `gap` computado (no debería pasar). */
const GAP_PILL_FALLBACK = 6;
const GAP_BLOQUE_FALLBACK = 10;
const GAP_INTERNO_FALLBACK = 8;
/** Anchos por defecto de la búsqueda (px). Se pisan por control. */
const BUSQUEDA_IDEAL = 260;
const BUSQUEDA_MIN = 132;

/** Opción sintética "todas" que abre cada grupo (índice 0 de las píldoras). */
const opcionTodas = (c: AdaptiveControlOpciones): AdaptiveFilterOption => ({
  value: '',
  label: c.placeholder,
});

/** Píldoras de un grupo: "todas" + sus opciones, en orden natural. */
const pillsDe = (c: AdaptiveControlOpciones): AdaptiveFilterOption[] => [
  opcionTodas(c),
  ...c.opciones,
];

const noop = () => {};

/**
 * Abrevia palabra por palabra con el diccionario. Comparación en minúscula
 * y sin puntuación final; `hasOwnProperty` para no tomar claves heredadas
 * del prototipo (un label con la palabra "constructor" no puede romper el
 * render).
 */
const abreviar = (texto: string, mapa: Record<string, string>): string =>
  texto.replace(/\S+/g, (palabra) => {
    const limpia = palabra.toLowerCase().replace(/[.,;:]+$/, '');
    return Object.prototype.hasOwnProperty.call(mapa, limpia) ? mapa[limpia] : palabra;
  });

/* ============================================================
   Modelo de medición y planificación (puro, sin DOM)
   ============================================================ */

/** Medidas crudas de un grupo de opciones, tomadas del fantasma. */
interface MedidaGrupo {
  /** gap entre píldoras (CSS computado). */
  gap: number;
  /** ancho de cada píldora, en orden natural (0 = "todas"). */
  pills: number[];
  /** ancho del control `+K` (sonda del fantasma, con el K más largo posible). */
  mas: number;
}

/** Medidas de un control, por variante. El grupo etiquetado es recursivo. */
type MedidaItem =
  | { tipo: 'opciones'; grupo: MedidaGrupo; sel: number }
  | { tipo: 'toggles'; seg: number; combo: number }
  | { tipo: 'accion'; full: number; icono: number }
  | { tipo: 'icono'; ancho: number }
  | { tipo: 'busqueda'; ideal: number; min: number; boton: number }
  | {
      tipo: 'grupo';
      /** ancho del rótulo en caps. */
      rotulo: number;
      /** gap interno del bloque (CSS computado). */
      gap: number;
      /** botón compacto CON rótulo / sólo icono. */
      menu: number;
      menuMin: number;
      hijos: MedidaItem[];
    };

interface MedidasFila {
  /** Ancho libre de la fila (ya con el colchón de seguridad descontado). */
  disponible: number;
  /** Gaps entre items + ancho de los divisores: constante, no depende del plan. */
  overhead: number;
  items: MedidaItem[];
}

type ModoBusqueda = 'ideal' | 'min' | 'boton';
type ModoAccion = 'full' | 'icono';
type ModoToggles = 'seg' | 'combo';
type ModoGrupo = 'abierto' | 'menu';
type ModoRotulos = 'on' | 'off';

/** Resultado del cálculo para un grupo de opciones. */
interface PlanGrupo {
  modo: 'pills' | 'combo';
  /** Índices de píldoras visibles, EN EL ORDEN en que se dibujan. */
  visibles: number[];
  /** Índices que van al control `+K` (o al combo si `modo === 'combo'`). */
  ocultas: number[];
}

/** Estado de presentación de una fila (sin el detalle de los `+K`). */
interface EstadoFila {
  busqueda: ModoBusqueda;
  accion: ModoAccion;
  toggles: ModoToggles;
  grupo: ModoGrupo;
  rotulos: ModoRotulos;
}

interface PlanFila extends EstadoFila {
  /** Un plan por control 'opciones' VIVO de la fila, en orden de render. */
  opciones: PlanGrupo[];
}

const indices = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/**
 * Cuántas píldoras entran en `cuota` y cuáles quedan en el `+K`.
 * Puro: sólo números. `seleccionado` es el índice de la píldora activa.
 */
function resolverGrupo(
  m: MedidaGrupo,
  seleccionado: number,
  cuota: number,
): { plan: PlanGrupo; usado: number } {
  const total = m.pills.length;
  const natural = m.pills.reduce((a, w) => a + w, 0) + m.gap * (total - 1);

  // Entran todas: ni +K ni recorte.
  if (natural <= cuota) {
    return { plan: { modo: 'pills', visibles: indices(total), ocultas: [] }, usado: natural };
  }

  // Hay overflow ⇒ se reserva el ancho del control +K antes de repartir.
  const presupuesto = cuota - (m.gap + m.mas);
  const acomodar = (orden: number[]) => {
    const visibles: number[] = [];
    let acc = 0;
    for (const i of orden) {
      const costo = visibles.length === 0 ? m.pills[i] : m.gap + m.pills[i];
      if (acc + costo > presupuesto) break;
      acc += costo;
      visibles.push(i);
    }
    return { visibles, acc };
  };

  let r = acomodar(indices(total));
  // La opción ACTIVA siempre visible: si quedó afuera, se adelanta justo
  // detrás de "todas" (que es el reset y no se pierde nunca) y se recalcula.
  if (seleccionado > 0 && !r.visibles.includes(seleccionado)) {
    const orden = [0, seleccionado, ...indices(total).filter((i) => i !== 0 && i !== seleccionado)];
    r = acomodar(orden);
  }

  // Fallback real: no entra ni la primera píldora ⇒ el grupo entero a combo.
  if (r.visibles.length === 0) {
    return { plan: { modo: 'combo', visibles: [], ocultas: indices(total) }, usado: cuota };
  }

  const ocultas = indices(total).filter((i) => !r.visibles.includes(i));
  return { plan: { modo: 'pills', visibles: r.visibles, ocultas }, usado: r.acc + m.gap + m.mas };
}

/**
 * Reparto entre los grupos de opciones VIVOS de una fila. `disponible` ya
 * viene NETO (sin gaps, divisores, rótulos ni el ancho de los demás
 * controles). Con un solo grupo la cuota es todo; con varios se reparte en
 * proporción a lo que necesita cada uno y el sobrante de cada grupo se
 * arrastra al siguiente (izquierda → derecha). Cada grupo resuelve su propio
 * `+K`, y puede haber mezcla (uno con píldoras y otro en combo): la fila no
 * queda partida.
 */
function repartirGrupos(
  medidas: { grupo: MedidaGrupo; sel: number }[],
  disponible: number,
): PlanGrupo[] {
  const n = medidas.length;
  const naturales = medidas.map(
    ({ grupo: m }) => m.pills.reduce((a, w) => a + w, 0) + m.gap * (m.pills.length - 1),
  );
  const totalNatural = naturales.reduce((a, w) => a + w, 0);

  if (totalNatural <= disponible) {
    return medidas.map(({ grupo: m }) => ({
      modo: 'pills' as const,
      visibles: indices(m.pills.length),
      ocultas: [],
    }));
  }

  const plan: PlanGrupo[] = [];
  let sobrante = 0;
  for (let i = 0; i < n; i++) {
    const cuota = (n === 1 ? disponible : (disponible * naturales[i]) / totalNatural) + sobrante;
    const r = resolverGrupo(medidas[i].grupo, medidas[i].sel, cuota);
    sobrante = cuota - r.usado;
    plan.push(r.plan);
  }
  return plan;
}

/**
 * Escalera de degradación. Cada peldaño baja UNA presentación y exige un
 * mínimo de calidad para aceptarse:
 *   'completo' = todas las píldoras a la vista (ni un `+K`);
 *   'sinCombo' = puede haber `+K`, pero ningún grupo de opciones colapsado;
 *   'ninguna'  = último recurso, se acepta lo que salga.
 * El rótulo de los grupos cae en el ÚLTIMO peldaño, a propósito: es lo que le
 * dice al usuario qué está mirando.
 */
const ESCALERA: { estado: EstadoFila; exigencia: 'completo' | 'sinCombo' | 'ninguna' }[] = [
  { estado: { busqueda: 'ideal', accion: 'full', toggles: 'seg', grupo: 'abierto', rotulos: 'on' }, exigencia: 'completo' },
  { estado: { busqueda: 'min', accion: 'full', toggles: 'seg', grupo: 'abierto', rotulos: 'on' }, exigencia: 'completo' },
  { estado: { busqueda: 'min', accion: 'full', toggles: 'seg', grupo: 'abierto', rotulos: 'on' }, exigencia: 'sinCombo' },
  { estado: { busqueda: 'min', accion: 'icono', toggles: 'seg', grupo: 'abierto', rotulos: 'on' }, exigencia: 'sinCombo' },
  { estado: { busqueda: 'min', accion: 'icono', toggles: 'combo', grupo: 'abierto', rotulos: 'on' }, exigencia: 'sinCombo' },
  { estado: { busqueda: 'min', accion: 'icono', toggles: 'combo', grupo: 'menu', rotulos: 'on' }, exigencia: 'sinCombo' },
  { estado: { busqueda: 'boton', accion: 'icono', toggles: 'combo', grupo: 'menu', rotulos: 'on' }, exigencia: 'sinCombo' },
  { estado: { busqueda: 'boton', accion: 'icono', toggles: 'combo', grupo: 'menu', rotulos: 'off' }, exigencia: 'ninguna' },
];

/** Ancho de todo lo que NO son grupos de opciones, para un estado dado. */
function anchoFijo(items: MedidaItem[], e: EstadoFila): number {
  let total = 0;
  for (const it of items) {
    switch (it.tipo) {
      case 'opciones':
        break; // lo resuelve `repartirGrupos` con el neto
      case 'toggles':
        total += e.toggles === 'seg' ? it.seg : it.combo;
        break;
      case 'accion':
        total += e.accion === 'full' ? it.full : it.icono;
        break;
      case 'icono':
        total += it.ancho;
        break;
      case 'busqueda':
        total += e.busqueda === 'ideal' ? it.ideal : e.busqueda === 'min' ? it.min : it.boton;
        break;
      case 'grupo': {
        if (e.grupo === 'menu') {
          total += e.rotulos === 'on' ? it.menu : it.menuMin;
          break;
        }
        const conRotulo = e.rotulos === 'on';
        const piezas = it.hijos.length + (conRotulo ? 1 : 0);
        total +=
          (conRotulo ? it.rotulo : 0) +
          it.gap * Math.max(0, piezas - 1) +
          anchoFijo(it.hijos, e);
        break;
      }
    }
  }
  return total;
}

/** Grupos de opciones VIVOS (los de un grupo colapsado no cuentan), en orden. */
function recolectarOpciones(
  items: MedidaItem[],
  e: EstadoFila,
): { grupo: MedidaGrupo; sel: number }[] {
  const out: { grupo: MedidaGrupo; sel: number }[] = [];
  for (const it of items) {
    if (it.tipo === 'opciones') out.push({ grupo: it.grupo, sel: it.sel });
    else if (it.tipo === 'grupo' && e.grupo === 'abierto') {
      out.push(...recolectarOpciones(it.hijos, e));
    }
  }
  return out;
}

/**
 * Plan de una fila: baja peldaño a peldaño hasta que entra. Función PURA de
 * las medidas ⇒ imposible realimentar el layout.
 */
function planificarFila(m: MedidasFila): PlanFila {
  const evaluar = (paso: (typeof ESCALERA)[number]) => {
    const grupos = recolectarOpciones(m.items, paso.estado);
    const neto = m.disponible - m.overhead - anchoFijo(m.items, paso.estado);
    const opciones = grupos.length ? repartirGrupos(grupos, neto) : [];
    const cabe =
      grupos.length === 0
        ? neto >= 0
        : paso.exigencia === 'completo'
          ? neto >= 0 && opciones.every((g) => g.modo === 'pills' && g.ocultas.length === 0)
          : opciones.every((g) => g.modo === 'pills');
    return { cabe, plan: { ...paso.estado, opciones } };
  };

  const ultimo = ESCALERA.length - 1;
  for (let i = 0; i < ultimo; i++) {
    const r = evaluar(ESCALERA[i]);
    if (r.cabe) return r.plan;
  }
  return evaluar(ESCALERA[ultimo]).plan;
}

const mismoGrupo = (a: PlanGrupo, b: PlanGrupo): boolean =>
  a.modo === b.modo && a.visibles.join() === b.visibles.join() && a.ocultas.join() === b.ocultas.join();

const mismoPlan = (a: PlanFila | undefined, b: PlanFila): boolean =>
  !!a &&
  a.busqueda === b.busqueda &&
  a.accion === b.accion &&
  a.toggles === b.toggles &&
  a.grupo === b.grupo &&
  a.rotulos === b.rotulos &&
  a.opciones.length === b.opciones.length &&
  a.opciones.every((g, i) => mismoGrupo(g, b.opciones[i]));

const leerGap = (el: Element, fallback: number): number => {
  const v = parseFloat(getComputedStyle(el).columnGap);
  return Number.isFinite(v) ? v : fallback;
};

/* ============================================================
   Layout: reparto de controles en filas y bloques
   ============================================================ */

/** Bloques de contexto: entre dos consecutivos va un divisor vertical. */
const esBloque = (c: AdaptiveControl): boolean =>
  c.tipo === 'opciones' || c.tipo === 'toggles' || c.tipo === 'grupo';

interface ItemFila {
  control: AdaptiveControl;
  /** Divisor vertical ANTES de este control. */
  divisor: boolean;
}

interface FilaLayout {
  id: AdaptiveFilaId;
  inicio: ItemFila[];
  fin: ItemFila[];
  /** Controles en orden de render (inicio y después fin). */
  controles: AdaptiveControl[];
  /** Separador elástico entre los dos bloques. */
  empuje: boolean;
  nItems: number;
  nDivisores: number;
}

/**
 * Resuelve los divisores de un bloque: explícito gana sobre automático, salvo
 * al abrir la fila (`abre`), donde no hay nada de qué separar.
 */
function armarBloque(controles: AdaptiveControl[], abre: boolean): ItemFila[] {
  return controles.map((control, i) => ({
    control,
    divisor:
      i === 0 && abre
        ? false
        : (control.divisor ?? (i > 0 && esBloque(controles[i - 1]) && esBloque(control))),
  }));
}

function armarFilas(controles: AdaptiveControl[]): FilaLayout[] {
  const ids: AdaptiveFilaId[] = [1, 2];
  return ids
    .filter((id) => controles.some((c) => (c.fila ?? 1) === id))
    .map((id) => {
      const dela = controles.filter((c) => (c.fila ?? 1) === id);
      const inicio = armarBloque(dela.filter((c) => (c.lado ?? 'inicio') === 'inicio'), true);
      const fin = armarBloque(dela.filter((c) => c.lado === 'fin'), false);
      const nDivisores = [...inicio, ...fin].filter((i) => i.divisor).length;
      const empuje = fin.length > 0;
      return {
        id,
        inicio,
        fin,
        controles: [...inicio, ...fin].map((i) => i.control),
        empuje,
        nDivisores,
        nItems: dela.length + nDivisores + (empuje ? 1 : 0),
      };
    });
}

/** Controles de opciones VIVOS de una fila, en el mismo orden que el plan. */
function opcionesVivas(
  controles: AdaptiveControl[],
  modoGrupo: ModoGrupo,
): AdaptiveControlOpciones[] {
  const out: AdaptiveControlOpciones[] = [];
  for (const c of controles) {
    if (c.tipo === 'opciones') out.push(c);
    else if (c.tipo === 'grupo' && modoGrupo === 'abierto') {
      for (const h of c.controles) if (h.tipo === 'opciones') out.push(h);
    }
  }
  return out;
}

/* ============================================================
   Componente
   ============================================================ */

export function AdaptiveFilter({
  controles,
  groups,
  label,
  icon: Icono = Filter,
  abreviaturas = ABREVIATURAS_ES,
  busy = false,
  className,
}: AdaptiveFilterProps) {
  const cuerposRef = useRef<(HTMLDivElement | null)[]>([]);
  const fantasmasRef = useRef<(HTMLDivElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  // Vacío = todavía sin medir ⇒ se dibuja todo entero (el layout effect corre
  // antes del primer paint, así que nunca se ve desbordado).
  const [planes, setPlanes] = useState<Record<number, PlanFila>>({});
  /** Panel abierto sobre una fila: id de la búsqueda o del grupo colapsado. */
  const [panel, setPanel] = useState<string | null>(null);

  // API vieja `groups` → controles de tipo 'opciones'. Mismo DOM, mismo plan.
  const lista = useMemo<AdaptiveControl[]>(() => {
    if (controles) return controles;
    return (groups ?? []).map((g) => ({
      tipo: 'opciones' as const,
      id: g.id,
      placeholder: g.placeholder,
      opciones: g.options,
      value: g.value,
      onChange: g.onChange,
    }));
  }, [controles, groups]);

  const filas = useMemo(() => armarFilas(lista), [lista]);

  // Firma de forma + selección: cambia cuando cambian los controles, sus
  // opciones o el valor activo (la píldora activa pesa distinto: es 600).
  const firma = useMemo(() => {
    const deControl = (c: AdaptiveControl): string => {
      const base = `${c.tipo}#${c.id}#${c.fila ?? 1}#${c.lado ?? 'inicio'}`;
      if (c.tipo === 'grupo') {
        return `${base}#${c.etiqueta}#[${c.controles.map(deControl).join('|')}]`;
      }
      if (c.tipo === 'opciones' || c.tipo === 'toggles') {
        const etiqueta = c.tipo === 'opciones' ? c.placeholder : (c.etiqueta ?? '');
        return `${base}#${c.value}#${etiqueta}#${c.opciones.map((o) => o.label).join('~')}`;
      }
      if (c.tipo === 'busqueda') return `${base}#${c.anchoIdeal ?? ''}#${c.anchoMinimo ?? ''}`;
      // 'accion' | 'icono': sólo la acción tiene badge.
      return `${base}#${c.label}#${c.tipo === 'accion' ? (c.badge ?? '') : ''}`;
    };
    return lista.map(deControl).join('||');
  }, [lista]);

  useLayoutEffect(() => {
    if (filas.length === 0) return;

    const medir = () => {
      const siguiente: Record<number, PlanFila> = {};
      let completo = true;

      filas.forEach((fila, iFila) => {
        const cuerpo = cuerposRef.current[iFila];
        const fantasma = fantasmasRef.current[iFila];
        if (!cuerpo || !fantasma) {
          completo = false;
          return;
        }
        const medidas = medirFila(cuerpo, fantasma, fila);
        if (!medidas) {
          completo = false;
          return;
        }
        siguiente[fila.id] = planificarFila(medidas);
      });

      // Oculto / sin layout / fantasma desincronizado: no decidir con basura.
      if (!completo) return;
      setPlanes((previo) =>
        filas.every((f) => mismoPlan(previo[f.id], siguiente[f.id])) ? previo : siguiente,
      );
    };

    medir();
    const ro = new ResizeObserver(medir);
    cuerposRef.current.forEach((el) => el && ro.observe(el));
    fantasmasRef.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
    // `firma` cubre controles/opciones/valor; `filas` se lee dentro de `medir`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  // Panel abierto: se cierra con un click afuera (el `Escape` lo maneja cada
  // panel). El listener sólo vive mientras hay panel. Se ignora el click sobre
  // el DISPARADOR del panel: si no, el `pointerdown` cerraría y el `click`
  // volvería a abrir — el botón dejaría de funcionar como toggle.
  useEffect(() => {
    if (!panel) return;
    const afuera = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (panelRef.current?.contains(t as Node)) return;
      if (t?.closest?.('[aria-expanded="true"]')) return;
      setPanel(null);
    };
    document.addEventListener('pointerdown', afuera);
    return () => document.removeEventListener('pointerdown', afuera);
  }, [panel]);

  if (lista.length === 0) return null;

  // Con la API vieja el rótulo "FILTRAR" es el default histórico; con la
  // botonera heterogénea no hay rótulo salvo que lo pidan explícito.
  const rotuloBarra = label !== undefined ? label : groups && !controles ? 'FILTRAR' : null;

  /* ---------- renders por tipo (compartidos con el fantasma) ---------- */

  const pill = (c: AdaptiveControlOpciones, opcion: AdaptiveFilterOption, viva: boolean) => {
    const activa = opcion.value === c.value;
    return (
      <button
        key={opcion.value || '__todas__'}
        type="button"
        className={`af-pill${activa ? ' af-pill--activa' : ''}`}
        title={opcion.label}
        aria-pressed={activa}
        tabIndex={viva ? undefined : -1}
        onClick={viva ? () => c.onChange(opcion.value) : undefined}
      >
        {abreviar(opcion.label, abreviaturas)}
      </button>
    );
  };

  /** Grupo de opciones en modo píldoras (+ el `+K` si algo quedó afuera). */
  const grupoPills = (c: AdaptiveControlOpciones, p: PlanGrupo | null, viva: boolean) => {
    const todas = pillsDe(c);
    const visibles = p ? p.visibles : indices(todas.length);
    const ocultas = p ? p.ocultas : [];
    return (
      <div
        className="af-grupo"
        role="group"
        aria-label={c.placeholder}
        data-af-grupo={viva ? undefined : ''}
      >
        {visibles.map((idx) => pill(c, todas[idx], viva))}
        {(!viva || ocultas.length > 0) && (
          <div
            className="af-mas"
            role="group"
            aria-label={`Otras ${ocultas.length} opciones de ${c.placeholder}`}
            data-af-mas={viva ? undefined : ''}
          >
            <ModernSelect
              variant="v2"
              value=""
              onChange={viva ? c.onChange : noop}
              options={viva ? ocultas.map((idx) => todas[idx]) : []}
              placeholder={`+${viva ? ocultas.length : c.opciones.length}`}
              searchable={viva && ocultas.length > 8}
              abbreviate={false}
            />
          </div>
        )}
      </div>
    );
  };

  /** Grupo de opciones colapsado entero a combo (no entraba ni una píldora). */
  const grupoCombo = (c: AdaptiveControlOpciones, viva: boolean) => (
    <div className="af-combo" role="group" aria-label={c.placeholder}>
      <ModernSelect
        variant="v2"
        value={c.value}
        onChange={viva ? c.onChange : noop}
        options={pillsDe(c)}
        placeholder={c.placeholder}
        searchable={viva && c.opciones.length > 8}
      />
    </div>
  );

  const toggles = (c: AdaptiveControlToggles, viva: boolean, medida?: string) => (
    <div className="af-toggles" role="group" aria-label={c.etiqueta || undefined} data-af-med={medida}>
      {c.etiqueta && <span className="af-rotulo">{c.etiqueta}</span>}
      <div className="af-seg">
        {c.opciones.map((o) => {
          const activa = o.value === c.value;
          return (
            <button
              key={o.value}
              type="button"
              className={`af-seg-op${activa ? ' af-seg-op--activa' : ''}`}
              aria-pressed={activa}
              title={o.label}
              tabIndex={viva ? undefined : -1}
              onClick={viva ? () => c.onChange(o.value) : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const togglesCombo = (c: AdaptiveControlToggles, viva: boolean, medida?: string) => (
    <div className="af-togglescombo" role="group" aria-label={c.etiqueta || undefined} data-af-med={medida}>
      <ModernSelect
        variant="v2"
        value={c.value}
        onChange={viva ? c.onChange : noop}
        options={c.opciones}
        placeholder={c.etiqueta ?? ''}
      />
    </div>
  );

  const accion = (c: AdaptiveControlAccion, modo: ModoAccion, viva: boolean, medida?: string) => (
    <button
      type="button"
      className={`af-accion${c.activo ? ' af-accion--activa' : ''}${
        modo === 'icono' ? ' af-accion--icono' : ''
      }`}
      title={c.label}
      aria-label={modo === 'icono' ? c.label : undefined}
      aria-pressed={typeof c.activo === 'boolean' ? c.activo : undefined}
      disabled={c.disabled}
      tabIndex={viva ? undefined : -1}
      onClick={viva ? c.onClick : undefined}
      data-af-med={medida}
    >
      <c.icono className="af-ico" aria-hidden="true" />
      {modo === 'full' && <span className="af-accion-label">{c.label}</span>}
      {modo === 'full' && c.badge !== undefined && c.badge !== '' && (
        <span className="af-accion-badge">{c.badge}</span>
      )}
    </button>
  );

  const botonIcono = (c: AdaptiveControlIcono, viva: boolean, medida?: string) => (
    <button
      type="button"
      className={`af-iconobtn${c.activo ? ' af-iconobtn--activo' : ''}`}
      title={c.label}
      aria-label={c.label}
      aria-pressed={typeof c.activo === 'boolean' ? c.activo : undefined}
      disabled={c.disabled}
      tabIndex={viva ? undefined : -1}
      onClick={viva ? c.onClick : undefined}
      data-af-med={medida}
    >
      <c.icono className="af-ico" aria-hidden="true" />
    </button>
  );

  const busqueda = (c: AdaptiveControlBusqueda, modo: ModoBusqueda, viva: boolean) => (
    <div
      className="af-busqueda"
      style={{
        flexBasis: modo === 'ideal' ? (c.anchoIdeal ?? BUSQUEDA_IDEAL) : (c.anchoMinimo ?? BUSQUEDA_MIN),
      }}
    >
      <Search className="af-ico af-ico--tenue" aria-hidden="true" />
      <input
        className="af-busqueda-input"
        type="search"
        value={c.value}
        placeholder={c.placeholder ?? 'Buscar'}
        aria-label={c.placeholder ?? 'Buscar'}
        tabIndex={viva ? undefined : -1}
        onChange={viva ? (e) => c.onChange(e.target.value) : noop}
      />
    </div>
  );

  const busquedaBoton = (c: AdaptiveControlBusqueda, viva: boolean, medida?: string) => (
    <button
      type="button"
      className={`af-iconobtn${c.value ? ' af-iconobtn--activo' : ''}`}
      title={c.placeholder ?? 'Buscar'}
      aria-label={c.placeholder ?? 'Buscar'}
      aria-expanded={panel === c.id}
      tabIndex={viva ? undefined : -1}
      onClick={viva ? () => setPanel((a) => (a === c.id ? null : c.id)) : undefined}
      data-af-med={medida}
    >
      <Search className="af-ico" aria-hidden="true" />
    </button>
  );

  /** Botón compacto de un grupo colapsado: conserva el rótulo mientras pueda. */
  const grupoMenu = (
    c: AdaptiveControlGrupo,
    conRotulo: boolean,
    viva: boolean,
    medida?: string,
  ) => {
    const IconoGrupo = c.icono ?? SlidersHorizontal;
    return (
      <button
        type="button"
        className={`af-grupomenu${conRotulo ? '' : ' af-grupomenu--icono'}`}
        title={c.etiqueta}
        aria-label={c.etiqueta}
        aria-haspopup="true"
        aria-expanded={panel === c.id}
        tabIndex={viva ? undefined : -1}
        onClick={viva ? () => setPanel((a) => (a === c.id ? null : c.id)) : undefined}
        data-af-med={medida}
      >
        {conRotulo ? (
          <>
            <span className="af-rotulo">{c.etiqueta}</span>
            <ChevronDown className="af-ico af-ico--tenue" aria-hidden="true" />
          </>
        ) : (
          <IconoGrupo className="af-ico" aria-hidden="true" />
        )}
      </button>
    );
  };

  /** Un control simple en su presentación vigente según el plan de la fila. */
  const renderSimple = (
    c: AdaptiveControlSimple,
    plan: PlanFila | undefined,
    p: PlanGrupo | null,
  ) => {
    switch (c.tipo) {
      case 'opciones':
        return p?.modo === 'combo' ? grupoCombo(c, true) : grupoPills(c, p, true);
      case 'toggles':
        return plan?.toggles === 'combo' ? togglesCombo(c, true) : toggles(c, true);
      case 'accion':
        return accion(c, plan?.accion === 'icono' ? 'icono' : 'full', true);
      case 'icono':
        return botonIcono(c, true);
      case 'busqueda':
        return plan?.busqueda === 'boton'
          ? busquedaBoton(c, true)
          : busqueda(c, plan?.busqueda ?? 'ideal', true);
    }
  };

  /** Todas las variantes de un control simple, para que el fantasma las mida. */
  const renderSonda = (c: AdaptiveControlSimple) => {
    switch (c.tipo) {
      case 'opciones':
        return grupoPills(c, null, false);
      case 'toggles':
        return (
          <>
            {toggles(c, false, `${c.id}:seg`)}
            {togglesCombo(c, false, `${c.id}:combo`)}
          </>
        );
      case 'accion':
        return (
          <>
            {accion(c, 'full', false, `${c.id}:full`)}
            {accion(c, 'icono', false, `${c.id}:icono`)}
          </>
        );
      case 'icono':
        return botonIcono(c, false, `${c.id}:icono`);
      case 'busqueda':
        return busquedaBoton(c, false, `${c.id}:boton`);
    }
  };

  const filaConPanel = panel ? filas.find((f) => f.controles.some((c) => c.id === panel)) : undefined;
  const abierto = filaConPanel?.controles.find((c) => c.id === panel);

  return (
    <div className={`af${className ? ` ${className}` : ''}`}>
      {filas.map((fila, iFila) => {
        const plan = planes[fila.id];
        const modoGrupo = plan?.grupo ?? 'abierto';
        // Índice del plan por control de opciones vivo: el render y la
        // medición recorren en el MISMO orden, así nunca se desalinean.
        const idxPlan = new Map(
          opcionesVivas(fila.controles, modoGrupo).map((c, i) => [c.id, i]),
        );
        const planDe = (c: AdaptiveControlOpciones): PlanGrupo | null => {
          const i = idxPlan.get(c.id);
          return i === undefined ? null : (plan?.opciones[i] ?? null);
        };

        const simple = (c: AdaptiveControlSimple) =>
          renderSimple(c, plan, c.tipo === 'opciones' ? planDe(c) : null);

        const bloque = (c: AdaptiveControlGrupo) =>
          modoGrupo === 'menu' ? (
            grupoMenu(c, plan?.rotulos !== 'off', true)
          ) : (
            <div className="af-bloque" role="group" aria-label={c.etiqueta}>
              {plan?.rotulos !== 'off' && <span className="af-rotulo">{c.etiqueta}</span>}
              {c.controles.map((h) => (
                <Fragment key={h.id}>{simple(h)}</Fragment>
              ))}
            </div>
          );

        const items = (lote: ItemFila[]) =>
          lote.map(({ control, divisor }) => (
            <Fragment key={control.id}>
              {divisor && <span className="af-sep" aria-hidden="true" />}
              {control.tipo === 'grupo' ? bloque(control) : simple(control)}
            </Fragment>
          ));

        const conRotuloBarra = rotuloBarra !== null;
        return (
          <div
            className={`af-fila${conRotuloBarra ? ' af-fila--rotulada' : ''}`}
            key={fila.id}
          >
            {conRotuloBarra && (
              // En las filas 2+ la misma marca se repite INVISIBLE para que
              // los controles arranquen exactamente en la misma X que arriba.
              <span className="af-marca" aria-hidden={iFila > 0} data-af-fantasma={iFila > 0 ? '' : undefined}>
                <Icono className="af-ico af-ico--tenue" aria-hidden="true" />
                <span className="af-label">{rotuloBarra}</span>
              </span>
            )}

            <div
              className="af-cuerpo"
              ref={(el) => {
                cuerposRef.current[iFila] = el;
              }}
            >
              {items(fila.inicio)}
              {fila.empuje && (
                <span
                  className={`af-empuje${
                    plan?.busqueda !== 'boton' && fila.controles.some(tieneBusqueda)
                      ? ' af-empuje--fijo'
                      : ''
                  }`}
                  aria-hidden="true"
                />
              )}
              {items(fila.fin)}

              {/* Fantasma de medición: SIEMPRE montado, con TODAS las variantes
                  de cada control (píldoras completas + sonda del `+K` con el K
                  más largo posible, segmented + combo, acción con label +
                  acción en icono, rótulo de grupo + botón compacto con y sin
                  rótulo) y una sonda del divisor. Nunca visible ni clickeable
                  — ver cabecera. */}
              <div
                className="af-fantasma"
                aria-hidden="true"
                ref={(el) => {
                  fantasmasRef.current[iFila] = el;
                }}
              >
                {fila.controles.map((c) =>
                  c.tipo === 'grupo' ? (
                    <Fragment key={c.id}>
                      <div className="af-bloque" data-af-bloque={c.id}>
                        <span className="af-rotulo" data-af-med={`${c.id}:rotulo`}>
                          {c.etiqueta}
                        </span>
                        {c.controles.map((h) => (
                          <Fragment key={h.id}>{renderSonda(h)}</Fragment>
                        ))}
                      </div>
                      {grupoMenu(c, true, false, `${c.id}:menu`)}
                      {grupoMenu(c, false, false, `${c.id}:menu-min`)}
                    </Fragment>
                  ) : (
                    <Fragment key={c.id}>{renderSonda(c)}</Fragment>
                  ),
                )}
                <span className="af-sep" />
              </div>
            </div>

            {iFila === 0 && busy && <span className="af-spin" role="status" aria-label="Actualizando" />}

            {/* Panel sobre la fila: búsqueda colapsada abierta, o los controles
                de un grupo que colapsó. Es ABSOLUTO, así que no compite por el
                ancho y no realimenta la medición. */}
            {abierto && filaConPanel?.id === fila.id && (
              <div className="af-panel" ref={panelRef}>
                {abierto.tipo === 'busqueda' ? (
                  <>
                    <Search className="af-ico af-ico--tenue" aria-hidden="true" />
                    <input
                      className="af-busqueda-input"
                      type="search"
                      autoFocus
                      value={abierto.value}
                      placeholder={abierto.placeholder ?? 'Buscar'}
                      aria-label={abierto.placeholder ?? 'Buscar'}
                      onChange={(e) => abierto.onChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setPanel(null);
                      }}
                    />
                  </>
                ) : abierto.tipo === 'grupo' ? (
                  <>
                    <span className="af-rotulo">{abierto.etiqueta}</span>
                    {abierto.controles.map((h) => (
                      <Fragment key={h.id}>{renderSimple(h, undefined, null)}</Fragment>
                    ))}
                  </>
                ) : null}
                <button
                  type="button"
                  className="af-panel-cerrar"
                  aria-label="Cerrar"
                  onClick={() => setPanel(null)}
                >
                  <X className="af-ico" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** ¿El control (o alguno de sus hijos) es una búsqueda? */
function tieneBusqueda(c: AdaptiveControl): boolean {
  return c.tipo === 'busqueda' || (c.tipo === 'grupo' && c.controles.some((h) => h.tipo === 'busqueda'));
}

/* ============================================================
   Medición (único punto que toca el DOM)
   ============================================================ */

/** Cursor sobre los `[data-af-grupo]` del fantasma, en orden de documento. */
interface Cursor {
  grupos: HTMLElement[];
  i: number;
}

function medirSimple(
  c: AdaptiveControlSimple,
  anchos: Map<string, number>,
  cur: Cursor,
): MedidaItem | null {
  if (c.tipo === 'opciones') {
    const el = cur.grupos[cur.i++];
    if (!el) return null;
    const pills = Array.from(el.querySelectorAll<HTMLElement>('.af-pill')).map(
      (p) => p.getBoundingClientRect().width,
    );
    const mas = el.querySelector<HTMLElement>('[data-af-mas]')?.getBoundingClientRect().width ?? 0;
    if (pills.length === 0 || mas === 0) return null;
    const sel = pillsDe(c).findIndex((o) => o.value === c.value);
    return {
      tipo: 'opciones',
      sel: sel < 0 ? 0 : sel,
      grupo: { gap: leerGap(el, GAP_PILL_FALLBACK), pills, mas },
    };
  }
  if (c.tipo === 'toggles') {
    const seg = anchos.get(`${c.id}:seg`) ?? 0;
    const combo = anchos.get(`${c.id}:combo`) ?? 0;
    return seg && combo ? { tipo: 'toggles', seg, combo } : null;
  }
  if (c.tipo === 'accion') {
    const full = anchos.get(`${c.id}:full`) ?? 0;
    const icono = anchos.get(`${c.id}:icono`) ?? 0;
    return full && icono ? { tipo: 'accion', full, icono } : null;
  }
  if (c.tipo === 'icono') {
    const ancho = anchos.get(`${c.id}:icono`) ?? 0;
    return ancho ? { tipo: 'icono', ancho } : null;
  }
  const boton = anchos.get(`${c.id}:boton`) ?? 0;
  return boton
    ? {
        tipo: 'busqueda',
        ideal: c.anchoIdeal ?? BUSQUEDA_IDEAL,
        min: c.anchoMinimo ?? BUSQUEDA_MIN,
        boton,
      }
    : null;
}

function medirFila(
  cuerpo: HTMLElement,
  fantasma: HTMLElement,
  fila: FilaLayout,
): MedidasFila | null {
  const disponible = cuerpo.clientWidth - SEGURIDAD;
  if (disponible <= 0) return null;

  const anchos = new Map<string, number>();
  fantasma.querySelectorAll<HTMLElement>('[data-af-med]').forEach((el) => {
    const clave = el.dataset.afMed;
    if (clave) anchos.set(clave, el.getBoundingClientRect().width);
  });

  const cur: Cursor = {
    grupos: Array.from(fantasma.querySelectorAll<HTMLElement>('[data-af-grupo]')),
    i: 0,
  };
  const nGrupos = fila.controles.reduce(
    (n, c) =>
      n +
      (c.tipo === 'opciones' ? 1 : c.tipo === 'grupo' ? c.controles.filter((h) => h.tipo === 'opciones').length : 0),
    0,
  );
  // Fantasma desincronizado con el plan: mejor no decidir.
  if (cur.grupos.length !== nGrupos) return null;

  const items: MedidaItem[] = [];
  for (const c of fila.controles) {
    if (c.tipo === 'grupo') {
      const rotulo = anchos.get(`${c.id}:rotulo`) ?? 0;
      const menu = anchos.get(`${c.id}:menu`) ?? 0;
      const menuMin = anchos.get(`${c.id}:menu-min`) ?? 0;
      const bloqueEl = fantasma.querySelector<HTMLElement>(`[data-af-bloque="${CSS.escape(c.id)}"]`);
      if (!rotulo || !menu || !menuMin || !bloqueEl) return null;
      const hijos: MedidaItem[] = [];
      for (const h of c.controles) {
        const m = medirSimple(h, anchos, cur);
        if (!m) return null;
        hijos.push(m);
      }
      items.push({
        tipo: 'grupo',
        rotulo,
        menu,
        menuMin,
        gap: leerGap(bloqueEl, GAP_INTERNO_FALLBACK),
        hijos,
      });
    } else {
      const m = medirSimple(c, anchos, cur);
      if (!m) return null;
      items.push(m);
    }
  }

  const gap = leerGap(cuerpo, GAP_BLOQUE_FALLBACK);
  const sep = fantasma.querySelector<HTMLElement>('.af-sep')?.getBoundingClientRect().width ?? 1;
  return {
    disponible,
    items,
    overhead: gap * Math.max(0, fila.nItems - 1) + sep * fila.nDivisores,
  };
}

export default AdaptiveFilter;
