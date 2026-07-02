import { Clock, UserCheck, Play, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import type { EstadoOrdenTrabajo } from '../../types';

// Single Source of Truth del estado de órdenes de trabajo (campo).
// Si mañana se agrega un estado, se toca SOLO este archivo.

export const otEstadoLabels: Record<EstadoOrdenTrabajo, string> = {
  pendiente: 'Pendiente',
  asignada: 'Asignada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const otEstadoColors: Record<EstadoOrdenTrabajo, string> = {
  pendiente: '#6b7280',
  asignada: '#3b82f6',
  en_curso: '#f59e0b',
  completada: '#10b981',
  cancelada: '#ef4444',
};

export const otEstadoIcons: Record<EstadoOrdenTrabajo, LucideIcon> = {
  pendiente: Clock,
  asignada: UserCheck,
  en_curso: Play,
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
