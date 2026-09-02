import { Clock, UserCheck, Play, OctagonAlert, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import type { EstadoOrdenTrabajo } from '../../types';

// Single Source of Truth del estado de órdenes de trabajo (campo).
// Si mañana se agrega un estado, se toca SOLO este archivo.

export const otEstadoLabels: Record<EstadoOrdenTrabajo, string> = {
  pendiente: 'Pendiente',
  asignada: 'Asignada',
  en_curso: 'En curso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const otEstadoColors: Record<EstadoOrdenTrabajo, string> = {
  pendiente: '#6b7280',
  asignada: '#3b82f6',
  en_curso: '#f59e0b',
  bloqueada: '#f97316', // advertencia: OT frenada en campo (no final)
  completada: '#10b981',
  cancelada: '#ef4444',
};

export const otEstadoIcons: Record<EstadoOrdenTrabajo, LucideIcon> = {
  pendiente: Clock,
  asignada: UserCheck,
  en_curso: Play,
  bloqueada: OctagonAlert,
  completada: CheckCircle2,
  cancelada: XCircle,
};

// Patrón resiliente: estados desconocidos no rompen la UI
export const otEstadoLabel = (e?: string | null): string =>
  (e && otEstadoLabels[e as EstadoOrdenTrabajo]) || e || '';

export const otEstadoColor = (e?: string | null): string =>
  (e && otEstadoColors[e as EstadoOrdenTrabajo]) || '#6b7280';

export const OT_ESTADO_OPTIONS = (Object.keys(otEstadoLabels) as EstadoOrdenTrabajo[])
  .map((e) => ({ value: e, label: otEstadoLabels[e] }));

// Motivos de bloqueo (T6) — espeja MOTIVO_BLOQUEO_LABELS del backend.
export const OT_MOTIVO_BLOQUEO_OPTIONS = [
  { value: 'falta_material', label: 'Falta de material' },
  { value: 'clima', label: 'Clima' },
  { value: 'vecino_ausente', label: 'Vecino ausente' },
  { value: 'otro', label: 'Otro' },
] as const;

export type MotivoBloqueoOT = (typeof OT_MOTIVO_BLOQUEO_OPTIONS)[number]['value'];
