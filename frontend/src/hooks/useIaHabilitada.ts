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
let cache: { habilitada: boolean; provider: string; modelo: string; tesoreria: boolean; reclamos: boolean; tramites: boolean } | null = null;
let loaded = false;
let loadingPromise: Promise<void> | null = null;

async function preload() {
  if (loaded || loadingPromise) return loadingPromise || Promise.resolve();
  loadingPromise = (async () => {
    try {
      const res = await iaConfigApi.getActual();
      cache = { habilitada: !!res.data.habilitada, provider: res.data.provider, modelo: res.data.modelo, tesoreria: res.data.tesoreria !== false, reclamos: res.data.reclamos !== false, tramites: res.data.tramites !== false };
    } catch {
      cache = { habilitada: false, provider: 'gemini', modelo: '', tesoreria: true, reclamos: true, tramites: true };
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

/**
 * Hook: true si la IA está habilitada Y el sub-módulo Tesorería tiene IA.
 * Gatea los paneles operativos y el banner Bartolo de Tesorería: se pueden
 * apagar solo en Tesorería aun con la IA general prendida.
 */
export function useIaTesoreria(): boolean {
  const calc = () => (cache?.habilitada ?? false) && (cache?.tesoreria ?? true);
  const [on, setOn] = useState<boolean>(calc());
  useEffect(() => {
    let mounted = true;
    preload().then(() => { if (mounted) setOn(calc()); });
    return () => { mounted = false; };
  }, []);
  return on;
}

/**
 * Hook: true si la IA está habilitada Y el sub-flag del listado de Reclamos
 * tiene IA. Gatea el panel operativo al costado de la grilla de Reclamos: se
 * puede apagar solo ahí aun con la IA general prendida.
 */
export function useIaReclamos(): boolean {
  const calc = () => (cache?.habilitada ?? false) && (cache?.reclamos ?? true);
  const [on, setOn] = useState<boolean>(calc());
  useEffect(() => {
    let mounted = true;
    preload().then(() => { if (mounted) setOn(calc()); });
    return () => { mounted = false; };
  }, []);
  return on;
}

/**
 * Hook: true si la IA está habilitada Y el sub-flag del listado de Trámites
 * tiene IA. Gatea el panel operativo al costado de la grilla de Trámites.
 */
export function useIaTramites(): boolean {
  const calc = () => (cache?.habilitada ?? false) && (cache?.tramites ?? true);
  const [on, setOn] = useState<boolean>(calc());
  useEffect(() => {
    let mounted = true;
    preload().then(() => { if (mounted) setOn(calc()); });
    return () => { mounted = false; };
  }, []);
  return on;
}
