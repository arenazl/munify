// Utilidades geoespaciales y de analítica para la página de Mapa.
// Sin dependencias externas — solo math + types del frontend.

import { Reclamo } from '../types';

// =====================================================================
// Distancia haversine (en metros)
// =====================================================================
const EARTH_R = 6371000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

// =====================================================================
// Estados "resueltos" / "abiertos" / "rechazados"
// =====================================================================
export const ESTADOS_RESUELTOS = new Set(['finalizado', 'resuelto', 'pendiente_confirmacion']);
export const ESTADOS_RECHAZADOS = new Set(['rechazado']);
export const ESTADOS_ABIERTOS = new Set(['recibido', 'en_curso', 'asignado', 'nuevo', 'en_proceso', 'pospuesto']);

export function isResuelto(estado: string): boolean {
  return ESTADOS_RESUELTOS.has(estado);
}
export function isAbierto(estado: string): boolean {
  return ESTADOS_ABIERTOS.has(estado);
}

// =====================================================================
// Clustering greedy por proximidad (radio en metros)
// =====================================================================
export interface Cluster {
  centerLat: number;
  centerLng: number;
  reclamos: Reclamo[];
  // Dirección dominante (la más repetida) — útil como label
  topDireccion?: string;
}

export function clusterByProximity(reclamos: Reclamo[], radiusMeters: number): Cluster[] {
  const valid = reclamos.filter(r => r.latitud != null && r.longitud != null);
  const clusters: Cluster[] = [];

  for (const r of valid) {
    let assigned = false;
    for (const c of clusters) {
      if (haversineMeters(r.latitud!, r.longitud!, c.centerLat, c.centerLng) <= radiusMeters) {
        c.reclamos.push(r);
        // Recalcular centroide incremental
        const n = c.reclamos.length;
        c.centerLat = c.centerLat + (r.latitud! - c.centerLat) / n;
        c.centerLng = c.centerLng + (r.longitud! - c.centerLng) / n;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({
        centerLat: r.latitud!,
        centerLng: r.longitud!,
        reclamos: [r],
      });
    }
  }

  // Calcular dirección dominante por cluster (la más frecuente)
  for (const c of clusters) {
    const counts: Record<string, number> = {};
    for (const r of c.reclamos) {
      const dir = (r.direccion || '').trim();
      if (!dir) continue;
      counts[dir] = (counts[dir] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) c.topDireccion = top[0];
  }

  return clusters;
}

// =====================================================================
// Top K zonas calientes (clusters ordenados por cantidad)
// =====================================================================
export function topZonas(reclamos: Reclamo[], k: number = 5, radiusMeters: number = 200): Cluster[] {
  return clusterByProximity(reclamos, radiusMeters)
    .filter(c => c.reclamos.length > 1)
    .sort((a, b) => b.reclamos.length - a.reclamos.length)
    .slice(0, k);
}

// =====================================================================
// Hotspots recurrentes: clusters con >= minPoints en últimos N días
// =====================================================================
export interface Hotspot extends Cluster {
  recientes: number; // count en ventana temporal
}

export function recurrentHotspots(
  reclamos: Reclamo[],
  options: { radiusMeters?: number; minPoints?: number; daysBack?: number } = {},
): Hotspot[] {
  const { radiusMeters = 80, minPoints = 3, daysBack = 90 } = options;
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const recientes = reclamos.filter(r => new Date(r.created_at).getTime() >= cutoff);
  return clusterByProximity(recientes, radiusMeters)
    .filter(c => c.reclamos.length >= minPoints)
    .map(c => ({ ...c, recientes: c.reclamos.length }))
    .sort((a, b) => b.recientes - a.recientes);
}

// =====================================================================
// KPIs principales
// =====================================================================
export interface MapaKPIs {
  total: number;              // total reclamos en el conjunto filtrado
  conUbicacion: number;       // cuántos tienen lat/lng
  pctGeo: number;             // % cobertura geo
  resueltos: number;
  pctResueltos: number;
  // Tiempo medio de resolución en días (solo reclamos resueltos con fecha)
  tiempoMedioDias: number | null;
  // Abiertos con > 30 días
  abiertos30dPlus: number;
  // Tendencia % resueltos vs período anterior (mismo largo de ventana)
  tendenciaResueltosPp: number | null; // diff en puntos porcentuales (e.g., +5pp)
}

export function computeKPIs(reclamos: Reclamo[]): MapaKPIs {
  const total = reclamos.length;
  const conUbicacion = reclamos.filter(r => r.latitud != null && r.longitud != null).length;
  const resueltos = reclamos.filter(r => isResuelto(r.estado)).length;
  const pctResueltos = total > 0 ? (resueltos / total) * 100 : 0;
  const pctGeo = total > 0 ? (conUbicacion / total) * 100 : 0;

  // Tiempo medio (en días) entre created_at y fecha_resolucion
  const tiempos: number[] = [];
  for (const r of reclamos) {
    if (!isResuelto(r.estado)) continue;
    if (!r.fecha_resolucion) continue;
    const ms = new Date(r.fecha_resolucion).getTime() - new Date(r.created_at).getTime();
    if (ms > 0) tiempos.push(ms / (1000 * 60 * 60 * 24));
  }
  const tiempoMedioDias = tiempos.length > 0
    ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length
    : null;

  // Abiertos con > 30 días
  const ahora = Date.now();
  const abiertos30dPlus = reclamos.filter(r => {
    if (!isAbierto(r.estado)) return false;
    const dias = (ahora - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return dias > 30;
  }).length;

  // Tendencia: comparar % resueltos del período actual vs anterior, definidos por
  // la fecha más vieja del set como ancla. Si el set abarca N días, comparamos
  // los últimos N/2 días contra los anteriores N/2.
  let tendenciaResueltosPp: number | null = null;
  if (total >= 4) {
    const fechas = reclamos.map(r => new Date(r.created_at).getTime()).sort((a, b) => a - b);
    const span = fechas[fechas.length - 1] - fechas[0];
    if (span > 0) {
      const mid = fechas[0] + span / 2;
      const prev = reclamos.filter(r => new Date(r.created_at).getTime() < mid);
      const curr = reclamos.filter(r => new Date(r.created_at).getTime() >= mid);
      if (prev.length > 0 && curr.length > 0) {
        const prevPct = (prev.filter(r => isResuelto(r.estado)).length / prev.length) * 100;
        const currPct = (curr.filter(r => isResuelto(r.estado)).length / curr.length) * 100;
        tendenciaResueltosPp = currPct - prevPct;
      }
    }
  }

  return {
    total,
    conUbicacion,
    pctGeo,
    resueltos,
    pctResueltos,
    tiempoMedioDias,
    abiertos30dPlus,
    tendenciaResueltosPp,
  };
}

// =====================================================================
// Serie diaria para sparkline (últimos N días, 0-fill)
// =====================================================================
export interface DailyPoint {
  date: string;     // YYYY-MM-DD
  count: number;
  ts: number;       // timestamp del inicio del día
}

export function dailyTimeline(reclamos: Reclamo[], days: number = 30): DailyPoint[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const points: DailyPoint[] = [];
  const buckets: Record<string, number> = {};

  for (const r of reclamos) {
    const d = new Date(r.created_at);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = (buckets[key] || 0) + 1;
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, count: buckets[key] || 0, ts: d.getTime() });
  }

  return points;
}

// =====================================================================
// Convex hull (Andrew's monotone chain) para coverage polygon
// =====================================================================
type Pt = { x: number; y: number };

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function convexHull(latlngs: Array<[number, number]>): Array<[number, number]> {
  if (latlngs.length < 3) return [...latlngs];
  // x = lng, y = lat
  const points: Pt[] = latlngs.map(([lat, lng]) => ({ x: lng, y: lat }));
  points.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const lower: Pt[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Pt[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return [...lower, ...upper].map(p => [p.y, p.x] as [number, number]);
}

// =====================================================================
// Helpers de filtrado en bbox (para herramienta de dibujo)
// =====================================================================
export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function reclamosInBBox(reclamos: Reclamo[], bbox: BBox): Reclamo[] {
  return reclamos.filter(r => {
    if (r.latitud == null || r.longitud == null) return false;
    return (
      r.latitud >= bbox.minLat &&
      r.latitud <= bbox.maxLat &&
      r.longitud >= bbox.minLng &&
      r.longitud <= bbox.maxLng
    );
  });
}

// =====================================================================
// Distribución por estado (para donut)
// =====================================================================
export function distribucionEstados(reclamos: Reclamo[]): Array<{ estado: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const r of reclamos) {
    counts[r.estado] = (counts[r.estado] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([estado, count]) => ({ estado, count }))
    .sort((a, b) => b.count - a.count);
}
