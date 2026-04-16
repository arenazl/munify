import { useEffect, useState, useCallback } from 'react';
import { vecinoApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export interface BadgesVecino {
  reclamos: number;
  tramites: number;
  tasas: number;
}

const EMPTY: BadgesVecino = { reclamos: 0, tramites: 0, tasas: 0 };

/**
 * Lee los contadores de items pendientes del vecino (reclamos, tramites, tasas)
 * para mostrar badges en sidebar y bottom nav. Refresca cada 60s y cuando se
 * dispara el evento 'munify:refresh-badges' (por ejemplo al crear un reclamo).
 */
export function useVecinoBadges(): BadgesVecino & { refresh: () => void } {
  const { user } = useAuth();
  const [badges, setBadges] = useState<BadgesVecino>(EMPTY);

  const cargar = useCallback(async () => {
    if (!user || user.rol !== 'vecino') {
      setBadges(EMPTY);
      return;
    }
    try {
      const res = await vecinoApi.resumenBadges();
      setBadges({
        reclamos: res.data.reclamos_pendientes,
        tramites: res.data.tramites_pendientes,
        tasas: res.data.tasas_pendientes,
      });
    } catch (err) {
      // Silencioso — no es critico que los badges no carguen.
      console.warn('[useVecinoBadges] error', err);
    }
  }, [user]);

  useEffect(() => {
    cargar();
    // Refresh periódico (60 seg) para que los badges se actualicen aunque el
    // vecino no recargue la página.
    const interval = setInterval(cargar, 60_000);
    // Listener para refresh manual (ej. al crear reclamo/tramite).
    const onRefresh = () => cargar();
    window.addEventListener('munify:refresh-badges', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('munify:refresh-badges', onRefresh);
    };
  }, [cargar]);

  return { ...badges, refresh: cargar };
}
