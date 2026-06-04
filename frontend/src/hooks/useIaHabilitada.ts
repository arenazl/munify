import { useEffect, useState } from 'react';
import { iaConfigApi } from '../lib/api';

/**
 * Gate central de IA: indica si el municipio actual tiene la IA habilitada.
 *
 * Una sola carga por sesión (cache en memoria, igual que useModulo). TODAS las
 * superficies de IA del front consultan este hook para mostrarse/ocultarse, así
 * apagar la IA de un municipio (desde el panel del superadmin) las saca a todas
 * de un solo lugar — no hay ifs sueltos por pantalla.
 *
 * Default: false hasta que carga (no muestra IA "por las dudas").
 */
let cache: { habilitada: boolean; provider: string; modelo: string } | null = null;
let loaded = false;
let loadingPromise: Promise<void> | null = null;

async function preload() {
  if (loaded || loadingPromise) return loadingPromise || Promise.resolve();
  loadingPromise = (async () => {
    try {
      const res = await iaConfigApi.getActual();
      cache = { habilitada: !!res.data.habilitada, provider: res.data.provider, modelo: res.data.modelo };
    } catch {
      cache = { habilitada: false, provider: 'gemini', modelo: '' };
    } finally {
      loaded = true;
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

/** Refrescar tras cambiar la config (ej: el superadmin la togglea). */
export function invalidateIaConfig() {
  loaded = false;
  cache = null;
}

/** Carga (o devuelve cacheado) la config de IA del muni actual. */
export async function fetchIaHabilitada(): Promise<boolean> {
  await preload();
  return cache?.habilitada ?? false;
}

/** Hook: true si la IA está habilitada para el municipio actual. */
export function useIaHabilitada(): boolean {
  const [habilitada, setHabilitada] = useState<boolean>(cache?.habilitada ?? false);
  useEffect(() => {
    let mounted = true;
    preload().then(() => { if (mounted) setHabilitada(cache?.habilitada ?? false); });
    return () => { mounted = false; };
  }, []);
  return habilitada;
}
