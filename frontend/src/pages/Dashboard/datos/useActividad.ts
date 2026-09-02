/**
 * useActividad — cuánta historia y cuánta actividad reciente tiene cada
 * dominio (`GET /dashboard/actividad`).
 *
 * Se pide UNA vez por carga, junto con los módulos: NO depende de `depId` ni
 * de `refreshKey`. La actividad ORDENA la pantalla, no la informa — si
 * cambiara con el combo de dependencia o con cada pull-to-refresh, los bloques
 * se reacomodarían debajo del dedo del usuario.
 *
 * FAIL-OPEN: mientras no llegó (o si falló) `datos` queda en null y el tablero
 * se comporta como antes de este WO — orden canónico y nada oculto por datos.
 * Una pantalla vacía por un fetch caído sería peor que un orden subóptimo.
 */
import { useEffect, useState } from 'react';
import { dashboardApi } from '../../../lib/api';
import type { Actividad, MapaActividad } from '../tipos';

/** Normaliza la respuesta: un dominio que el backend no mande queda en cero,
 *  que es lo mismo que "no tiene historia" y el tablero ya sabe leerlo. */
const CERO = { total: 0, ultimos30: 0 };
const normalizar = (raw: unknown): MapaActividad => {
  const r = (raw ?? {}) as Partial<MapaActividad>;
  return {
    reclamos: r.reclamos ?? CERO,
    tramites: r.tramites ?? CERO,
    finanzas: r.finanzas ?? CERO,
  };
};

export function useActividad(municipioId?: number): Actividad {
  const [datos, setDatos] = useState<MapaActividad | null>(null);
  const [resuelto, setResuelto] = useState(false);

  useEffect(() => {
    let cancel = false;
    dashboardApi.getActividad()
      .then((r) => { if (!cancel) setDatos(normalizar(r.data)); })
      .catch((err) => {
        // Sin actividad el tablero no se rompe: cae al orden canónico.
        console.error('Error cargando la actividad del tablero:', err);
        if (!cancel) setDatos(null);
      })
      .finally(() => { if (!cancel) setResuelto(true); });
    return () => { cancel = true; };
  }, [municipioId]);

  return { datos, resuelto };
}
