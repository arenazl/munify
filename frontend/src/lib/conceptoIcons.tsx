import {
  ShoppingCart,
  Wallet,
  Home,
  Users,
  Zap,
  Fuel,
  Wrench,
  Car,
  Package,
  Receipt,
  Tag,
  type LucideIcon,
} from 'lucide-react';

// Mapping concepto -> icono lucide. Se matchea por la PRIMERA palabra del
// concepto en lowercase contra estas keywords; primera coincidencia gana.
// Para conceptos que no matchean, fallback a Tag.
const ICON_MAP: Array<[string[], LucideIcon]> = [
  [['compra', 'compras'], ShoppingCart],
  [['pago', 'paga', 'abono'], Wallet],
  [['alquiler', 'alquileres', 'renta'], Home],
  [['sueldo', 'sueldos', 'salario', 'salarios', 'honorario', 'honorarios'], Users],
  [['servicio', 'servicios', 'luz', 'agua', 'gas', 'internet', 'telefono', 'teléfono'], Zap],
  [['combustible', 'combustibles', 'nafta', 'gasoil', 'gasolina'], Fuel],
  [['mantenimiento', 'reparacion', 'reparación', 'reparaciones', 'arreglo', 'arreglos'], Wrench],
  [['viatico', 'viático', 'viaticos', 'viáticos', 'viaje', 'viajes'], Car],
  [['insumo', 'insumos', 'papel', 'libreria', 'librería', 'materiales', 'material'], Package],
  [['impuesto', 'impuestos', 'tasa', 'tasas', 'retencion', 'retención'], Receipt],
];

export function conceptoIcon(nombre: string | null | undefined): LucideIcon {
  if (!nombre) return Tag;
  const first = nombre.trim().toLowerCase().split(/\s+/)[0];
  if (!first) return Tag;
  for (const [keys, Icon] of ICON_MAP) {
    if (keys.includes(first)) return Icon;
  }
  return Tag;
}
