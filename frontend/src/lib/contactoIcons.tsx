import {
  Landmark,
  IdCard,
  Briefcase,
  Truck,
  HardHat,
  HandCoins,
  User,
  type LucideIcon,
} from 'lucide-react';

// Un icono + color fijos por tipo de contacto. Fuente canonica unica (antes
// estaba duplicado en Tesoreria.tsx + CrearGastoWizard.tsx).
const ICON_BY_TIPO: Record<string, LucideIcon> = {
  concejal: Landmark,
  empleado: IdCard,
  profesional: Briefcase,
  proveedor: Truck,
  contratista: HardHat,
  beneficiario: HandCoins,
  otro: User,
};

export const TIPO_CONTACTO_COLORS: Record<string, string> = {
  concejal: '#8b5cf6',
  empleado: '#3b82f6',
  profesional: '#f59e0b',
  proveedor: '#10b981',
  contratista: '#06b6d4',
  beneficiario: '#ec4899',
  otro: '#71717a',
};

export const TIPO_CONTACTO_LABELS: Record<string, string> = {
  concejal: 'Concejales',
  empleado: 'Empleados',
  profesional: 'Profesionales',
  proveedor: 'Proveedores',
  contratista: 'Contratistas',
  beneficiario: 'Beneficiarios',
  otro: 'Otros',
};

export function contactoIconByTipo(tipo: string | null | undefined): LucideIcon {
  if (!tipo) return User;
  return ICON_BY_TIPO[tipo] || User;
}
