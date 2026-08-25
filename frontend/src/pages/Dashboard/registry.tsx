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
import type { SeccionProps } from './tipos';

/** Hooks de datos que una sección necesita montados. */
export type DominioDatos = 'reclamos' | 'tramites' | 'finanzas';

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

export const DOMINIOS: DominioDatos[] = ['reclamos', 'tramites', 'finanzas'];

/** ¿El módulo que enciende este dominio está activo en el muni? */
export const dominioActivo = (esActivo: (m: string) => boolean, d: DominioDatos): boolean =>
  esActivo(MODULO_DE_DOMINIO[d]);

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
  secciones: SeccionDashboard[] = SECCIONES,
): SeccionDashboard[] {
  const presentes = DOMINIOS.filter((d) => dominioActivo(esActivo, d));
  return secciones.filter((s) => {
    if (!s.requiere.every(esActivo)) return false;
    if (s.soloSiDominioSolo === undefined) return true;
    const solo = presentes.every((d) => s.dominios.includes(d));
    return s.soloSiDominioSolo ? solo : !solo;
  });
}

/** Los dominios que hay que montar para las secciones dadas. */
export function dominiosDeSecciones(secciones: SeccionDashboard[]): Set<DominioDatos> {
  const set = new Set<DominioDatos>();
  secciones.forEach((s) => s.dominios.forEach((d) => set.add(d)));
  return set;
}
