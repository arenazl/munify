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
