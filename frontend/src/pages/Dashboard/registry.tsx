/**
 * registry.tsx — el REGISTRO de secciones del dashboard.
 *
 * La condición de visibilidad de cada bloque vive ACÁ, una sola vez. Nada de
 * `if (tramites)` regados por el JSX: el orquestador filtra este array contra
 * los módulos del muni y renderiza lo que queda. Los perfiles EMERGEN —un
 * muni sólo-tesorería no ve reclamos porque ninguna sección de reclamos
 * matchea, no porque haya un if que lo esconda.
 *
 * Para agregar una sección: se escribe el componente en `secciones/`, se
 * declara acá con su `requiere` y sus `dominios`, y listo.
 */
import type React from 'react';
import { CintaConteos } from './secciones/CintaConteos';
import { ColaReclamos } from './secciones/ColaReclamos';
import { MapaTendencia } from './secciones/MapaTendencia';
import { AnaliticaReclamos } from './secciones/AnaliticaReclamos';
import { VozVecino } from './secciones/VozVecino';
import { HeroFinanciero } from './secciones/HeroFinanciero';
import { ColasPagos } from './secciones/ColasPagos';
import { TendenciaGastos } from './secciones/TendenciaGastos';
import { FinanzasResumen } from './secciones/FinanzasResumen';
import { DOMINIOS, type DominioDatos, type MapaActividad, type SeccionProps } from './tipos';

// El dominio de datos (y su orden canónico, `DOMINIOS`) viven en `tipos.ts`:
// los armadores de copy también etiquetan por dominio y no pueden importar
// este archivo, que arrastra todos los componentes de sección. NO se
// re-exportan desde acá: un re-export en un módulo con componentes rompe el
// fast refresh (regla react-refresh/only-export-components).

/**
 * El módulo que enciende cada dominio de datos.
 *
 * Los dos primeros se llaman igual que su módulo; 'finanzas' no, porque el
 * dominio agrupa lo que cuelga de tesorería (la agenda de pagos, la nómina,
 * la contaduría) y el módulo que lo habilita es `tesoreria`. El mapa existe
 * para que esa diferencia se declare UNA vez y no aparezca como un
 * `d === 'finanzas' ? 'tesoreria' : d` regado por el orquestador.
 */
export const MODULO_DE_DOMINIO: Record<DominioDatos, string> = {
  reclamos: 'reclamos',
  tramites: 'tramites',
  finanzas: 'tesoreria',
};

/** ¿El módulo que enciende este dominio está activo en el muni? */
export const dominioActivo = (esActivo: (m: string) => boolean, d: DominioDatos): boolean =>
  esActivo(MODULO_DE_DOMINIO[d]);

/**
 * ¿El dominio tiene HISTORIA? (principio 1.4: visible = módulo activo Y con
 * historia). `total = 0` es un módulo prototipo: está prendido pero nunca se
 * usó, así que sus secciones no se muestran ni se fetchean.
 *
 * Sin actividad (todavía no llegó, o el fetch falló) devuelve true: el orden y
 * la visibilidad por datos son una MEJORA, no un requisito — jamás una
 * pantalla vacía por un GET caído.
 */
export const dominioConHistoria = (actividad: MapaActividad | null, d: DominioDatos): boolean =>
  actividad ? actividad[d].total > 0 : true;

/**
 * Los dominios ordenados por actividad de 30 días, desc. Empate → orden
 * canónico. Sin actividad, orden canónico a secas.
 *
 * Este MISMO array prioriza tres cosas, para que la pantalla hable con una
 * sola voz: el orden de los bloques de secciones, el pool del strip del hero y
 * el orden de las frases del carrusel.
 */
export function prioridadDominios(actividad: MapaActividad | null): DominioDatos[] {
  if (!actividad) return [...DOMINIOS];
  return [...DOMINIOS].sort((a, b) => {
    const dif = actividad[b].ultimos30 - actividad[a].ultimos30;
    return dif !== 0 ? dif : DOMINIOS.indexOf(a) - DOMINIOS.indexOf(b);
  });
}

export interface SeccionDashboard {
  id: string;
  /** Módulos del muni, semántica `moduloEfectivo`. Se evalúan en AND. */
  requiere: string[];
  /** Qué hooks de dominio necesita montados. */
  dominios: DominioDatos[];
  /** 'full' = fila propia; 'media' = dos consecutivas visibles comparten fila. */
  layout: 'full' | 'media';
  /**
   * Pares completa/resumen del mismo dominio: la COMPLETA se muestra cuando su
   * dominio está solo en la pantalla, y la RESUMEN cuando convive con otros.
   * `variante` es documentación (qué mitad del par es cada una); lo que decide
   * es `soloSiDominioSolo`.
   */
  variante?: 'completa' | 'resumen';
  /**
   * - `true`  → visible SÓLO si su dominio está solo (ningún otro dominio del
   *             muni está activo). Es la mitad COMPLETA del par.
   * - `false` → visible SÓLO si CONVIVE con otro dominio. Es la RESUMEN.
   * - sin declarar → visible siempre (sujeto a `requiere`).
   */
  soloSiDominioSolo?: boolean;
  /**
   * `true` → la sección NO entra en el orden dinámico: queda arriba, fija, en
   * el orden del registro. Es la cinta de conteos, que es de la PANTALLA (va
   * pegada al hero) y no de un dominio.
   */
  fija?: boolean;
  Componente: React.FC<SeccionProps>;
}

/**
 * ORDEN FIJO de la pantalla:
 * cinta de conteos → cola → mapa/tendencia → analítica → voz → FINANZAS.
 *
 * El bloque financiero va DESPUÉS de lo operativo: en un muni full (Merlo)
 * primero se resuelve la calle y el mostrador, y la plata cierra. En un muni
 * sólo-financiero (San Pedro Norte) las secciones de reclamos no existen, así
 * que finanzas queda arriba sin que nadie lo programe.
 * (El orden dinámico por actividad es F2b; hasta entonces manda este array.)
 */
export const SECCIONES: SeccionDashboard[] = [
  {
    id: 'cinta-conteos',
    // Sin `requiere`: la cinta es de la PANTALLA, no de un módulo. Pide los
    // dos dominios y arma un tramo por cada uno que tenga datos — con el
    // módulo apagado ese `stats` es null y su tramo no existe. Sin ningún
    // tramo el componente no dibuja nada.
    //
    // Ojo al tocar esto: el orquestador monta un dominio sólo si su módulo
    // está activo. Sin ese filtro, esta sección (que siempre es visible)
    // haría fetchear reclamos y trámites a un muni que no los tiene.
    requiere: [],
    dominios: ['reclamos', 'tramites'],
    layout: 'full',
    // Va pegada al hero, arriba de todo: no la mueve el orden por actividad.
    fija: true,
    Componente: CintaConteos,
  },
  {
    id: 'cola-reclamos',
    requiere: ['reclamos'],
    dominios: ['reclamos'],
    layout: 'full',
    Componente: ColaReclamos,
  },
  {
    id: 'mapa-tendencia',
    requiere: ['reclamos'],
    dominios: ['reclamos'],
    layout: 'full',
    Componente: MapaTendencia,
  },
  {
    id: 'analitica-reclamos',
    requiere: ['reclamos'],
    dominios: ['reclamos'],
    layout: 'full',
    Componente: AnaliticaReclamos,
  },
  {
    id: 'voz-vecino',
    requiere: ['reclamos'],
    dominios: ['reclamos'],
    layout: 'full',
    Componente: VozVecino,
  },

  // ---------------------------------------------------------- FINANZAS
  // Par completa/resumen: las tres primeras son la versión completa (el muni
  // sólo-financiero), la última es el resumen de tres preguntas (cuando la
  // plata convive con reclamos/trámites).
  {
    id: 'hero-financiero',
    requiere: ['tesoreria'],
    dominios: ['finanzas'],
    layout: 'full',
    variante: 'completa',
    soloSiDominioSolo: true,
    Componente: HeroFinanciero,
  },
  {
    id: 'colas-pagos',
    requiere: ['tesoreria'],
    dominios: ['finanzas'],
    layout: 'full',
    variante: 'completa',
    soloSiDominioSolo: true,
    Componente: ColasPagos,
  },
  {
    id: 'tendencia-gastos',
    requiere: ['tesoreria'],
    dominios: ['finanzas'],
    layout: 'full',
    variante: 'completa',
    soloSiDominioSolo: true,
    Componente: TendenciaGastos,
  },
  {
    id: 'finanzas-resumen',
    requiere: ['tesoreria'],
    dominios: ['finanzas'],
    layout: 'full',
    variante: 'resumen',
    soloSiDominioSolo: false,
    Componente: FinanzasResumen,
  },
];

/**
 * Las secciones cuyos módulos están TODOS activos, en el orden del registro,
 * ya resuelto el par completa/resumen.
 *
 * "Su dominio está SOLO" = ningún otro dominio del muni está encendido. Se
 * mide contra los MÓDULOS, no contra las secciones candidatas: la cinta de
 * conteos declara reclamos y trámites y es visible siempre, así que contar
 * dominios de secciones diría que en San Pedro Norte conviven tres.
 */
export function seccionesVisibles(
  esActivo: (modulo: string) => boolean,
  actividad: MapaActividad | null = null,
  secciones: SeccionDashboard[] = SECCIONES,
): SeccionDashboard[] {
  const presentes = DOMINIOS.filter(
    (d) => dominioActivo(esActivo, d) && dominioConHistoria(actividad, d),
  );
  return secciones.filter((s) => {
    if (!s.requiere.every(esActivo)) return false;
    // Historia: alcanza con que UNO de sus dominios la tenga. Todas las
    // secciones declaran un único dominio menos la cinta, que declara dos y
    // arma un tramo por cada uno con datos — gatearla contra el primero la
    // mataría en un muni que sólo usa trámites.
    if (!s.dominios.some((d) => dominioConHistoria(actividad, d))) return false;
    if (s.soloSiDominioSolo === undefined) return true;
    const solo = presentes.every((d) => s.dominios.includes(d));
    return s.soloSiDominioSolo ? solo : !solo;
  });
}

/**
 * El ORDEN de la pantalla: las fijas arriba (la cinta), y después las
 * secciones agrupadas en BLOQUES por su dominio principal, con los bloques
 * ordenados por actividad.
 *
 * Dentro de un bloque manda el orden del registro: la cola antes que el mapa,
 * el mapa antes que la analítica. Lo que se mueve es el bloque ENTERO — un
 * muni que vive de la tesorería ve la plata arriba, uno que vive de la calle
 * ve los reclamos, y en ningún caso se intercalan secciones de dominios
 * distintos.
 *
 * Se llama UNA vez (useMemo sobre la actividad ya resuelta): la pantalla no
 * baila mientras el usuario la mira.
 */
export function ordenarPorActividad(
  visibles: SeccionDashboard[],
  prioridad: DominioDatos[],
): SeccionDashboard[] {
  const fijas = visibles.filter((s) => s.fija);
  const moviles = visibles.filter((s) => !s.fija);
  const bloques = prioridad.flatMap((d) => moviles.filter((s) => s.dominios[0] === d));
  // Una sección cuyo dominio principal no esté en la prioridad no se pierde:
  // cierra la pantalla en el orden del registro.
  const sobrantes = moviles.filter((s) => !bloques.includes(s));
  return [...fijas, ...bloques, ...sobrantes];
}

/** Los dominios que hay que montar para las secciones dadas. */
export function dominiosDeSecciones(secciones: SeccionDashboard[]): Set<DominioDatos> {
  const set = new Set<DominioDatos>();
  secciones.forEach((s) => s.dominios.forEach((d) => set.add(d)));
  return set;
}
