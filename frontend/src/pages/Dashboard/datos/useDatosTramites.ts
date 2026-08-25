/**
 * useDatosTramites — el dominio trámites del dashboard.
 *
 * Hoy es una sola llamada (`GET /dashboard/tramites-stats`), que en el
 * monolito viajaba pegada a la de reclamos en un `Promise.all`. Separada, un
 * muni con trámites apagado deja de pedirla — que es el punto del WO.
 *
 * `enabled` = módulo activo Y página lista. El hook se llama SIEMPRE.
 */
import { useEffect, useState } from 'react';
import { dashboardApi } from '../../../lib/api';
import type { DashboardStats } from '../../../types';
import type { DatosTramites } from '../tipos';

export interface OpcionesDatosTramites {
  enabled: boolean;
  depId?: number;
  refreshKey: number;
}

export function useDatosTramites(opts: OpcionesDatosTramites): DatosTramites {
  const { enabled, depId, refreshKey } = opts;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    dashboardApi.getTramitesStats(depId)
      .then((res) => { if (!cancel) setStats(res.data); })
      .catch((err) => {
        console.error('Error cargando tramites stats:', err);
        if (!cancel) setStats(null);
      })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [enabled, depId, refreshKey]);

  return { stats, cargando: enabled ? cargando : false };
}
