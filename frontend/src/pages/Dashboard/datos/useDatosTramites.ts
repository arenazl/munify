/**
 * useDatosTramites — el dominio trámites del dashboard.
 *
 * Dos llamadas, cada una con su `.catch` propio:
 *  - `GET /dashboard/tramites-stats` — los conteos crudos de la cinta y del
 *    strip del hero. En el monolito viajaba pegada a la de reclamos en un
 *    `Promise.all`; separada, un muni con trámites apagado deja de pedirla.
 *  - `GET /dashboard/tramites-circuito` — las tres preguntas del bloque
 *    (cuellos, turnos, tipos). Es agregación pura y viaja en paralelo: si se
 *    cae, la cinta y el hero siguen con sus números y lo único que falta es
 *    la sección del circuito, que tolera `circuito = null`.
 *
 * `enabled` = módulo activo Y página lista. El hook se llama SIEMPRE.
 */
import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../../../lib/api';
import type { DashboardStats } from '../../../types';
import type { DatosTramites, TramitesCircuito } from '../tipos';

export interface OpcionesDatosTramites {
  enabled: boolean;
  depId?: number;
  refreshKey: number;
}

export function useDatosTramites(opts: OpcionesDatosTramites): DatosTramites {
  const { enabled, depId, refreshKey } = opts;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [circuito, setCircuito] = useState<TramitesCircuito | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;

    // La primera carga la marca `stats`: es el dato que el gate de página
    // espera. El circuito llena una sección que sabe dibujarse vacía, así que
    // llegar un instante después no bloquea el tablero.
    dashboardApi.getTramitesStats(depId)
      .then((res) => { if (!cancel) setStats(res.data); })
      .catch((err) => {
        console.error('Error cargando tramites stats:', err);
        if (!cancel) setStats(null);
      })
      .finally(() => { if (!cancel) setCargando(false); });

    dashboardApi.getTramitesCircuito(depId)
      .then((res) => { if (!cancel) setCircuito(res.data as TramitesCircuito); })
      .catch((err) => {
        console.error('Error cargando el circuito de tramites:', err);
        if (!cancel) setCircuito(null);
      });

    return () => { cancel = true; };
  }, [enabled, depId, refreshKey]);

  // MEMOIZADO por el mismo motivo que finanzas: la sección hace
  // `useMemo(..., [datos.tramites])` para no rearmar las tres preguntas en
  // cada render, y con un objeto nuevo por render ese memo no serviría.
  return useMemo(() => ({
    stats,
    circuito,
    cargando: enabled ? cargando : false,
  }), [stats, circuito, enabled, cargando]);
}
