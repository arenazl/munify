/**
 * Single source of truth para la etapa contable de las Ordenes de Pago.
 *
 * Las 4 etapas siguen el ciclo del gasto publico (Ley de Administracion
 * Financiera): PREVENTIVO -> COMPROMISO -> DEVENGADO -> PAGADO.
 *
 * Es una dimension INDEPENDIENTE del `estado` operativo (pendiente /
 * autorizada / pagada / anulada). Una contadora puede tener una OP
 * "autorizada" (estado) en etapa contable "devengado" porque ya recibio
 * el bien/servicio aunque todavia no haya salido el pago.
 */
import {
  Bookmark, FileSignature, PackageCheck, BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import type { EtapaContable } from '../types';

export interface EtapaInfo {
  key: EtapaContable;
  label: string;
  /** Frase corta para tooltip / leyenda */
  hint: string;
  color: string;
  bg: string;
  icon: LucideIcon;
  /** Orden en el ciclo (1..4). Util para barras de progreso. */
  orden: number;
}

const ETAPAS: Record<EtapaContable, EtapaInfo> = {
  preventivo: {
    key: 'preventivo',
    label: 'Preventivo',
    hint: 'Reserva del saldo presupuestario. Todavia no hay compromiso firme.',
    color: '#6b7280',
    bg: '#6b728018',
    icon: Bookmark,
    orden: 1,
  },
  compromiso: {
    key: 'compromiso',
    label: 'Compromiso',
    hint: 'Orden de compra / contrato firmado. Compromete el credito presupuestario.',
    color: '#3b82f6',
    bg: '#3b82f618',
    icon: FileSignature,
    orden: 2,
  },
  devengado: {
    key: 'devengado',
    label: 'Devengado',
    hint: 'Bien recibido o servicio prestado. Obligacion real de pago.',
    color: '#f59e0b',
    bg: '#f59e0b18',
    icon: PackageCheck,
    orden: 3,
  },
  pagado: {
    key: 'pagado',
    label: 'Pagado',
    hint: 'Pago ejecutado. Cierre del ciclo contable.',
    color: '#10b981',
    bg: '#10b98118',
    icon: BadgeCheck,
    orden: 4,
  },
};

export function getEtapaInfo(etapa: string | null | undefined): EtapaInfo {
  if (!etapa) return ETAPAS.preventivo;
  return ETAPAS[etapa as EtapaContable] || ETAPAS.preventivo;
}

export function getEtapaLabel(etapa: string | null | undefined): string {
  return getEtapaInfo(etapa).label;
}

export function getEtapaColor(etapa: string | null | undefined): string {
  return getEtapaInfo(etapa).color;
}

export function getEtapaIcon(etapa: string | null | undefined): LucideIcon {
  return getEtapaInfo(etapa).icon;
}

export const ETAPAS_LIST: EtapaInfo[] = [
  ETAPAS.preventivo,
  ETAPAS.compromiso,
  ETAPAS.devengado,
  ETAPAS.pagado,
];
