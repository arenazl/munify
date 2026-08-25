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
import type { SeccionProps } from './tipos';

/** Hooks de datos que una sección necesita montados. */
export type DominioDatos = 'reclamos' | 'tramites';

export interface SeccionDashboard {
  id: string;
  /** Módulos del muni, semántica `moduloEfectivo`. Se evalúan en AND. */
  requiere: string[];
  /** Qué hooks de dominio necesita montados. */
  dominios: DominioDatos[];
  /** 'full' = fila propia; 'media' = dos consecutivas visibles comparten fila. */
  layout: 'full' | 'media';
  /** Pares completa/resumen del mismo dominio (F3): completa ⇔ su dominio está
   *  solo; resumen ⇔ convive con otros. Sin declarar = siempre. */
  variante?: 'completa' | 'resumen';
  soloSiDominioSolo?: boolean;
  Componente: React.FC<SeccionProps>;
}

/**
 * ORDEN FIJO de la pantalla:
 * cinta de conteos → cola → mapa/tendencia → analítica → voz.
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
];

/** Las secciones cuyos módulos están TODOS activos, en el orden del registro. */
export function seccionesVisibles(
  esActivo: (modulo: string) => boolean,
  secciones: SeccionDashboard[] = SECCIONES,
): SeccionDashboard[] {
  return secciones.filter((s) => s.requiere.every(esActivo));
}

/** Los dominios que hay que montar para las secciones dadas. */
export function dominiosDeSecciones(secciones: SeccionDashboard[]): Set<DominioDatos> {
  const set = new Set<DominioDatos>();
  secciones.forEach((s) => s.dominios.forEach((d) => set.add(d)));
  return set;
}
