import { useEffect, useState } from 'react';
import { modulosApi } from '../lib/api';

/**
 * Hook para consultar si un módulo está activado para el municipio actual.
 *
 * Cache en memoria por la sesión (no se vuelve a pedir al backend).
 */
const cache: Record<string, boolean> = {};
let loaded = false;
let loadingPromise: Promise<void> | null = null;

async function preload() {
  if (loaded || loadingPromise) return loadingPromise || Promise.resolve();
  loadingPromise = (async () => {
    try {
      const res = await modulosApi.list();
      for (const m of res.data as Array<{ modulo: string; activo: boolean }>) {
        cache[m.modulo] = m.activo;
      }
    } catch {
      // silent
    } finally {
      loaded = true;
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

export function invalidateModulos() {
  loaded = false;
  for (const k of Object.keys(cache)) delete cache[k];
}

export function useModulo(nombre: string): { activo: boolean; loading: boolean } {
  const [state, setState] = useState({
    activo: cache[nombre] ?? false,
    loading: !loaded,
  });

  useEffect(() => {
    let mounted = true;
    preload().then(() => {
      if (!mounted) return;
      setState({ activo: cache[nombre] ?? false, loading: false });
    });
    return () => { mounted = false; };
  }, [nombre]);

  return state;
}
