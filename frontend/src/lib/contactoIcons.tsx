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

// Un icono fijo por tipo de contacto. El color va aparte (TIPO_CONTACTO_COLORS).
const ICON_BY_TIPO: Record<string, LucideIcon> = {
  concejal: Landmark,
  empleado: IdCard,
  profesional: Briefcase,
  proveedor: Truck,
  contratista: HardHat,
  beneficiario: HandCoins,
  otro: User,
};

export function contactoIconByTipo(tipo: string | null | undefined): LucideIcon {
  if (!tipo) return User;
  return ICON_BY_TIPO[tipo] || User;
}
