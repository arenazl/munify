/**
 * Single source of truth para los estados de reclamos y solicitudes.
 *
 * Antes estaban duplicados en ~14 archivos, cada uno con su propia tabla
 * de colores, iconos y labels. Cualquier cambio (ej: agregar un estado
 * nuevo, cambiar un color) implicaba tocar todos los archivos.
 *
 * Ahora todo vive acá. Las pantallas importan los helpers y listo.
 *
 * Tanto `Reclamo` como `Solicitud` comparten los mismos 5 estados
 * canónicos: recibido, en_curso, finalizado, pospuesto, rechazado.
 *
 * Los reclamos viejos en la DB pueden tener estados legacy
 * (`nuevo`, `asignado`, `en_proceso`, `pendiente_confirmacion`, `resuelto`).
 * Los mapeamos a los nuevos para que la UI los muestre consistentemente.
 */
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  PauseCircle,
  type LucideIcon,
} from 'lucide-react';

/** Estados canónicos del sistema (nuevos, limpios). */
export type EstadoCanonico =
  | 'recibido'
  | 'en_curso'
  | 'finalizado'
  | 'pospuesto'
  | 'rechazado';

export interface EstadoInfo {
  /** Key canónica (post-normalización) */
  key: EstadoCanonico;
  /** Label para mostrar en UI */
  label: string;
  /** Color principal del estado */
  color: string;
  /** Background (con alpha) — para badges/cards */
  bg: string;
  /** Ícono lucide asociado */
  icon: LucideIcon;
}

// ============================================================
// Configuración canónica (los 5 estados nuevos)
// ============================================================

const ESTADOS_CANONICOS: Record<EstadoCanonico, EstadoInfo> = {
  recibido: {
    key: 'recibido',
    label: 'Recibido',
    color: '#3b82f6',
    bg: '#3b82f615',
    icon: Clock,
  },
  en_curso: {
    key: 'en_curso',
    label: 'En curso',
    color: '#8b5cf6',
    bg: '#8b5cf615',
    icon: Loader2,
  },
  finalizado: {
    key: 'finalizado',
    label: 'Finalizado',
    color: '#10b981',
    bg: '#10b98115',
    icon: CheckCircle2,
  },
  pospuesto: {
    key: 'pospuesto',
    label: 'Pospuesto',
    color: '#f59e0b',
    bg: '#f59e0b15',
    icon: PauseCircle,
  },
  rechazado: {
    key: 'rechazado',
    label: 'Rechazado',
    color: '#ef4444',
    bg: '#ef444415',
    icon: XCircle,
  },
};

// ============================================================
// Mapeo legacy → canónico
// ============================================================
// Los reclamos viejos pueden tener estos valores en la DB. Los
// normalizamos a los nuevos para que la UI siempre hable un solo idioma.

const LEGACY_MAP: Record<string, EstadoCanonico> = {
  // Legacy de reclamos
  nuevo: 'recibido',
  asignado: 'recibido',
  en_proceso: 'en_curso',
  pendiente_confirmacion: 'en_curso',
  resuelto: 'finalizado',
  // Legacy de trámites (del modelo viejo)
  iniciado: 'recibido',
  en_revision: 'en_curso',
  requiere_documentacion: 'en_curso',
  aprobado: 'finalizado',
};

// ============================================================
// Helpers públicos
// ============================================================

/**
 * Normaliza cualquier estado (nuevo o legacy) a su forma canónica.
 * Si recibe un valor desconocido, devuelve 'recibido' como fallback seguro.
 */
export function normalizarEstado(estado: string | null | undefined): EstadoCanonico {
  if (!estado) return 'recibido';
  const lower = estado.toLowerCase();
  if (lower in ESTADOS_CANONICOS) return lower as EstadoCanonico;
  if (lower in LEGACY_MAP) return LEGACY_MAP[lower];
  return 'recibido';
}

/** Devuelve la configuración completa (label, color, bg, icono) de un estado. */
export function getEstadoInfo(estado: string | null | undefined): EstadoInfo {
  return ESTADOS_CANONICOS[normalizarEstado(estado)];
}

export function getEstadoLabel(estado: string | null | undefined): string {
  return getEstadoInfo(estado).label;
}

export function getEstadoColor(estado: string | null | undefined): string {
  return getEstadoInfo(estado).color;
}

export function getEstadoBg(estado: string | null | undefined): string {
  return getEstadoInfo(estado).bg;
}

export function getEstadoIcon(estado: string | null | undefined): LucideIcon {
  return getEstadoInfo(estado).icon;
}

/** Lista de todos los estados canónicos — útil para filtros en UI. */
export const ESTADOS_LIST: EstadoInfo[] = Object.values(ESTADOS_CANONICOS);

// ============================================================
// Transiciones válidas
// ============================================================

/**
 * Mapa de transiciones permitidas: desde cada estado, a cuáles se puede pasar.
 * La UI lo usa para decidir qué botones mostrar en el panel de acciones.
 */
export const TRANSICIONES: Record<EstadoCanonico, EstadoCanonico[]> = {
  recibido: ['en_curso', 'rechazado'],
  en_curso: ['finalizado', 'pospuesto', 'rechazado'],
  pospuesto: ['en_curso', 'finalizado', 'rechazado'],
  finalizado: [],  // estado final
  rechazado: [],   // estado final
};

export function puedeTransicionar(
  desde: string | null | undefined,
  hacia: EstadoCanonico,
): boolean {
  const origen = normalizarEstado(desde);
  return TRANSICIONES[origen].includes(hacia);
}
