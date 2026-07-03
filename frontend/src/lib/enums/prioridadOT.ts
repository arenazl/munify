import { ChevronDown, Minus, ChevronUp, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { PrioridadOT } from '../../types';

// Single Source of Truth de la prioridad de una OT (patrón resiliente).

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

export const PRIORIDAD_OPTIONS = (Object.keys(prioridadLabels) as PrioridadOT[])
  .map((p) => ({ value: p, label: prioridadLabels[p] }));
