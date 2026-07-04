import {
  Clock,
  Loader2,
  CheckCircle2,
  PauseCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single Source of Truth de la CARA de un estado de reclamo: color, label e icono.
 *
 * Antes cada pantalla (Tablero, Mapa, Dashboard, cards del vecino...) definía su
 * propia tabla de colores para el mismo estado → el mismo "recibido" se pintaba
 * cyan en las cards, azul en el Tablero, índigo en el Mapa. Esta fase (F3) mata
 * esa divergencia: todos importan de acá.
 *
 * Paleta canónica = la de `components/ui/ReclamoCard.tsx` (badges sólidos):
 * recibido cyan, en_curso ámbar, finalizado verde, pospuesto naranja, rechazado rojo.
 * Se incluyen los estados legacy de la DB (nuevo/asignado/en_proceso/
 * pendiente_confirmacion/resuelto) con su color propio para no perder distinción.
 *
 * Relación con `lib/estadoConfig.ts`: ese archivo es una preocupación distinta
 * (normalización legacy→canónico + transiciones + getEstadoInfo, con una paleta
 * de fondos suaves para Órdenes de Trabajo). Se deja intacto a propósito (lo
 * consume OrdenesTrabajo y los cross-links de F2). `reclamo.ts` es el SSoT VISUAL
 * de las cards/pills de reclamo. Unificar ambas paletas queda como follow-up
 * (requiere OK del dueño porque cambiaría la cara de OrdenesTrabajo).
 *
 * Patrón resiliente (igual que `lib/enums/prioridadOT.ts`): los helpers nunca
 * rompen ante un estado desconocido — caen al gris `default`.
 */

const DEFAULT_COLOR = '#6b7280';

export const estadoColors: Record<string, string> = {
  recibido: '#0891b2',
  en_curso: '#f59e0b',
  finalizado: '#10b981',
  pospuesto: '#f97316',
  rechazado: '#ef4444',
  // Legacy (reclamos viejos de la DB)
  nuevo: '#6366f1',
  asignado: '#3b82f6',
  en_proceso: '#f59e0b',
  pendiente_confirmacion: '#8b5cf6',
  resuelto: '#10b981',
  // Fallback
  default: DEFAULT_COLOR,
};

export const estadoLabels: Record<string, string> = {
  recibido: 'Recibido',
  en_curso: 'En Curso',
  finalizado: 'Finalizado',
  pospuesto: 'Pospuesto',
  rechazado: 'Rechazado',
  // Legacy
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pend. Confirmación',
  resuelto: 'Resuelto',
};

export const estadoIcons: Record<string, LucideIcon> = {
  recibido: Clock,
  en_curso: Loader2,
  finalizado: CheckCircle2,
  pospuesto: PauseCircle,
  rechazado: XCircle,
  // Legacy
  nuevo: Clock,
  asignado: Clock,
  en_proceso: Loader2,
  pendiente_confirmacion: Loader2,
  resuelto: CheckCircle2,
  // Fallback
  default: Clock,
};

/** Color (hex) del estado. Resiliente: estado desconocido/null → gris default. */
export const estadoColor = (estado?: string | null): string =>
  (estado && estadoColors[estado]) || estadoColors.default || DEFAULT_COLOR;

/** Label del estado. Resiliente: estado desconocido → el estado tal cual. */
export const estadoLabel = (estado?: string | null): string =>
  (estado && estadoLabels[estado]) || estado || '';

/** Icono lucide del estado. Resiliente: estado desconocido → Clock. */
export const estadoIcon = (estado?: string | null): LucideIcon =>
  (estado && estadoIcons[estado]) || estadoIcons.default;

/** Opciones (value/label) de los 5 estados canónicos — para filtros / ModernSelect. */
export const ESTADO_OPTIONS = (
  ['recibido', 'en_curso', 'finalizado', 'pospuesto', 'rechazado'] as const
).map((e) => ({ value: e, label: estadoLabels[e] }));
