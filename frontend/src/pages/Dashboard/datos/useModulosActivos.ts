/**
 * useModulosActivos — la señal de módulos del municipio para el dashboard.
 *
 * Mismo espíritu que el gating de Configuración (`MODULOS_DEL_GRUPO`, commit
 * cc797ae): `modulosApi.list()` devuelve las filas de `municipio_modulos` y
 * `moduloEfectivo()` resuelve el estado real —fila explícita manda; sin fila,
 * opt-out = activo y opt-in (o clave desconocida, ej. 'inventario', que es un
 * flag sólo-backend) = oculto.
 *
 * `resuelto` es MITAD DEL GATE DE PÁGINA del dashboard: hasta que no sabemos
 * qué módulos tiene el muni no se puede decidir qué secciones existen. Si la
 * llamada falla se cae a la semántica pura (sin filas) para no dejar la
 * pantalla vacía por un error de red, y `resuelto` pasa a true igual.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { modulosApi } from '../../../lib/api';
import { MODULOS, moduloEfectivo } from '../../../lib/enums/modulos';

interface FilaModulo { modulo: string; activo: boolean }

export interface ModulosActivos {
  /** Estado efectivo por clave de módulo. Clave desconocida = false. */
  esActivo: (key: string) => boolean;
  /** Mapa completo (útil para depurar / F2). */
  activos: Record<string, boolean>;
  /** true cuando ya sabemos qué módulos tiene el muni (con dato o con fallback). */
  resuelto: boolean;
}

export function useModulosActivos(municipioId?: number): ModulosActivos {
  const [filas, setFilas] = useState<FilaModulo[]>([]);
  const [resuelto, setResuelto] = useState(false);

  useEffect(() => {
    let cancel = false;
    // Ojo: `resuelto` NO se vuelve a poner en false al cambiar de muni. Sería
    // un setState síncrono dentro del efecto (cascada de renders, lo prohíbe
    // react-hooks/set-state-in-effect) y encima haría parpadear el tablero
    // entero contra el skeleton. Las filas nuevas entran cuando llegan.
    modulosApi.list()
      .then((r) => { if (!cancel) setFilas(((r.data || []) as FilaModulo[])); })
      .catch(() => { if (!cancel) setFilas([]); })
      .finally(() => { if (!cancel) setResuelto(true); });
    return () => { cancel = true; };
  }, [municipioId]);

  const activos = useMemo(() => {
    const mapa: Record<string, boolean> = {};
    MODULOS.forEach((def) => { mapa[def.key] = moduloEfectivo(def, filas); });
    // Claves que el front no tiene en su catálogo pero el muni sí tiene fila:
    // la fila manda, como en Configuración.
    filas.forEach((f) => { if (!(f.modulo in mapa)) mapa[f.modulo] = f.activo; });
    return mapa;
  }, [filas]);

  const esActivo = useCallback((key: string) => activos[key] ?? false, [activos]);

  return { esActivo, activos, resuelto };
}
