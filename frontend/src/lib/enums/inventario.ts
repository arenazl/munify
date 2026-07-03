import {
  Truck, Package, CheckCircle2, Wrench, Ban, type LucideIcon,
} from 'lucide-react';
import type { NaturalezaInventario, EstadoActivo } from '../../types';

// Single Source of Truth de los estados del módulo de inventario.
// Si mañana se agrega un valor, se toca SOLO este archivo (patrón resiliente).

// ---------------- Naturaleza (activo | consumible) ----------------

export const naturalezaLabels: Record<NaturalezaInventario, string> = {
  activo: 'Activo',
  consumible: 'Consumible',
};

// Descripción larga para la UI de configuración.
export const naturalezaDescripcion: Record<NaturalezaInventario, string> = {
  activo: 'Bien reutilizable (camioneta, herramienta): se toma y se libera.',
  consumible: 'Material con stock (cemento, caños): se descuenta al usarse.',
};

export const naturalezaColors: Record<NaturalezaInventario, string> = {
  activo: '#3b82f6',
  consumible: '#10b981',
};

export const naturalezaIcons: Record<NaturalezaInventario, LucideIcon> = {
  activo: Truck,
  consumible: Package,
};

// ---------------- Estado operativo del activo ----------------

export const estadoActivoLabels: Record<EstadoActivo, string> = {
  disponible: 'Disponible',
  en_uso: 'En uso',
  mantenimiento: 'Mantenimiento',
  baja: 'De baja',
};

export const estadoActivoColors: Record<EstadoActivo, string> = {
  disponible: '#10b981',
  en_uso: '#f59e0b',
  mantenimiento: '#6b7280',
  baja: '#ef4444',
};

export const estadoActivoIcons: Record<EstadoActivo, LucideIcon> = {
  disponible: CheckCircle2,
  en_uso: Truck,
  mantenimiento: Wrench,
  baja: Ban,
};

// ---------------- Helpers resilientes ----------------

export const naturalezaLabel = (n?: string | null): string =>
  (n && naturalezaLabels[n as NaturalezaInventario]) || n || '';

export const naturalezaColor = (n?: string | null): string =>
  (n && naturalezaColors[n as NaturalezaInventario]) || '#6b7280';

export const estadoActivoLabel = (e?: string | null): string =>
  (e && estadoActivoLabels[e as EstadoActivo]) || e || '';

export const estadoActivoColor = (e?: string | null): string =>
  (e && estadoActivoColors[e as EstadoActivo]) || '#6b7280';

export const NATURALEZA_OPTIONS = (Object.keys(naturalezaLabels) as NaturalezaInventario[])
  .map((n) => ({ value: n, label: naturalezaLabels[n] }));

export const ESTADO_ACTIVO_OPTIONS = (Object.keys(estadoActivoLabels) as EstadoActivo[])
  .map((e) => ({ value: e, label: estadoActivoLabels[e] }));
