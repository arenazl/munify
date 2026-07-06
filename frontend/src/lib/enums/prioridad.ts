import { ChevronDown, Minus, ChevronUp, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { PrioridadOT } from '../../types';

// Single Source of Truth de la prioridad (patrón resiliente).
// La prioridad canónica del trabajo vive en la OT (enum baja/media/alta/urgente).
// Cualquier pantalla que muestre/edite prioridad (OT, reclamo, SLA...) importa
// desde acá. `lib/enums/prioridadOT.ts` queda como alias de compatibilidad.

export const prioridadLabels: Record<PrioridadOT, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const prioridadColors: Record<PrioridadOT, string> = {
  baja: '#64748b',
  media: '#3b82f6',
  alta: '#f59e0b',
  urgente: '#ef4444',
};

export const prioridadIcons: Record<PrioridadOT, LucideIcon> = {
  baja: ChevronDown,
  media: Minus,
  alta: ChevronUp,
  urgente: AlertTriangle,
};

export const prioridadLabel = (p?: string | null): string =>
  (p && prioridadLabels[p as PrioridadOT]) || p || '';

export const prioridadColor = (p?: string | null): string =>
  (p && prioridadColors[p as PrioridadOT]) || '#64748b';

export const prioridadIcon = (p?: string | null): LucideIcon =>
  (p && prioridadIcons[p as PrioridadOT]) || Minus;

export const PRIORIDAD_OPTIONS = (Object.keys(prioridadLabels) as PrioridadOT[])
  .map((p) => ({ value: p, label: prioridadLabels[p] }));

/**
 * Orden canónico de severidad (mayor = más urgente). SSoT para ordenar
 * cualquier vista guiada (Inbox de Reclamos/Trámites) por prioridad real:
 * urgente > alta > media > baja.
 */
export const prioridadRank: Record<PrioridadOT, number> = {
  baja: 1,
  media: 2,
  alta: 3,
  urgente: 4,
};

/** Rank de prioridad, resiliente: null/desconocida → rank de 'media' (mismo
 *  fallback que ya usa el resto de la app para prioridad ausente). */
export const prioridadRankOf = (p?: string | null): number =>
  (p && prioridadRank[p as PrioridadOT]) || prioridadRank.media;

/**
 * Paleta "semáforo" (rojo/amarillo/verde) para indicadores de severidad en
 * vistas guiadas, donde se prioriza la lectura rápida por color. Distinta a
 * propósito de `prioridadColors` (la paleta de marca que ya usan las pantallas
 * de OT/badges) — no se quiso re-teñir pantallas ya shippeadas. Mapeo pedido
 * por el dueño: urgente/alta = rojo, media = amarillo, baja = verde.
 */
export const prioridadSeverityColors: Record<PrioridadOT, string> = {
  baja: '#22c55e',
  media: '#eab308',
  alta: '#ef4444',
  urgente: '#ef4444',
};

export const prioridadSeverityColor = (p?: string | null): string =>
  (p && prioridadSeverityColors[p as PrioridadOT]) || prioridadSeverityColors.media;

/**
 * Convierte la escala numérica LEGACY de prioridad de Trámites
 * (`solicitudes.prioridad`, Integer 1=urgente..5=baja — ver
 * `backend/models/tramite.py`) al enum canónico `PrioridadOT`, para que la
 * vista guiada de Trámites reuse el mismo color/icono/label/orden que
 * Reclamos sin duplicar la paleta. Reclamos usa `prioridad_ot` (viene de la
 * OT); Trámites no tiene OT propia, solo este entero.
 */
export const prioridadOTFromNumero = (n?: number | null): PrioridadOT => {
  if (n == null) return 'media';
  if (n <= 1) return 'urgente';
  if (n === 2) return 'alta';
  if (n === 3) return 'media';
  return 'baja';
};
