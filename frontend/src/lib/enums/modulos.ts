import {
  Home, ClipboardList, FileCheck, Map, ScanLine, Receipt, Wallet,
  LayoutDashboard, CalendarClock, Activity, Sparkles, PiggyBank, Hammer,
  FileSignature, Users, MapPin, Megaphone, UserCheck, CalendarCheck, Boxes,
  type LucideIcon,
} from 'lucide-react';

// Single Source of Truth del catálogo de módulos por municipio
// (tabla municipio_modulos). Si aparece un módulo nuevo, se agrega SOLO acá.
//
// Semántica doble (histórica, ver navigation.ts):
//  - optIn: false → sin fila en la tabla = ACTIVO (se apaga con fila activo=false)
//  - optIn: true  → sin fila en la tabla = OCULTO (se prende con fila activo=true)

export interface ModuloDef {
  key: string;
  label: string;
  descripcion: string;
  icon: LucideIcon;
  optIn: boolean;
}

export const MODULOS: ModuloDef[] = [
  { key: 'dashboard', label: 'Dashboard', descripcion: 'Resumen y métricas del municipio', icon: Home, optIn: false },
  { key: 'reclamos', label: 'Reclamos', descripcion: 'Gestión de reclamos del vecino', icon: ClipboardList, optIn: false },
  { key: 'tramites', label: 'Trámites', descripcion: 'Trámites online con documentación y turnos', icon: FileCheck, optIn: false },
  { key: 'mapa', label: 'Mapa', descripcion: 'Mapa de reclamos con capa de calor', icon: Map, optIn: false },
  { key: 'mostrador', label: 'Mostrador', descripcion: 'Ventanilla asistida con biometría', icon: ScanLine, optIn: false },
  // OPT-IN desde 2026-08-29: Munify no cubre tasas hoy y el módulo aparecía
  // solo en todos los municipios (sin fila = activo). Ahora hay que prenderlo
  // a propósito; los munis que ya lo tienen prendido no se ven afectados.
  { key: 'tasas', label: 'Tasas', descripcion: 'Padrón y deudas (canal ciudadano, no calcula tasas)', icon: Receipt, optIn: true },
  { key: 'pagos', label: 'Cobros', descripcion: 'Cobro online (gateway por proveedor)', icon: Wallet, optIn: false },
  { key: 'tablero', label: 'Tablero', descripcion: 'Kanban de reclamos', icon: LayoutDashboard, optIn: false },
  { key: 'planificacion', label: 'Planificación', descripcion: 'Agenda semanal de trabajos', icon: CalendarClock, optIn: false },
  { key: 'sla', label: 'SLA', descripcion: 'Tiempos máximos y alertas de vencimiento', icon: Activity, optIn: false },
  { key: 'panel-bi', label: 'Análisis', descripcion: 'Panel BI con consultas en lenguaje natural (requiere IA)', icon: Sparkles, optIn: false },
  { key: 'tesoreria', label: 'Tesorería', descripcion: 'Gastos, cajas, contactos, conciliación y reportes financieros', icon: PiggyBank, optIn: true },
  { key: 'sueldos', label: 'Sueldos', descripcion: 'Liquidaciones, empleados con sueldo y pagos recurrentes', icon: Users, optIn: true },
  { key: 'contaduria', label: 'Contaduría', descripcion: 'Órdenes de pago con autorización formal y sus reportes', icon: FileSignature, optIn: true },
  { key: 'ordenes_trabajo', label: 'Órdenes de trabajo', descripcion: 'OTs de campo con cuadrillas y materiales', icon: Hammer, optIn: true },
  { key: 'poi', label: 'Puntos de interés', descripcion: 'POIs en el mapa (hospital, escuela, bomberos...) con radio de zona y prioridad', icon: MapPin, optIn: true },
  // Fusion de `inventario` + `flota` (2026-09-02). En el modelo nunca
  // estuvieron separados: un vehiculo es un item con naturaleza ACTIVO y
  // `flota_cargas` solo le cuelga el combustible. `inventario` ademas era un
  // modulo fantasma: la tabla y el sidebar lo usaban, pero no figuraba aca,
  // asi que no se podia prender ni apagar desde Configuracion.
  { key: 'patrimonio', label: 'Patrimonio', descripcion: 'Lo que tiene el municipio: materiales, vehículos y bienes, con sus movimientos y compras', icon: Boxes, optIn: true },
  { key: 'reservas', label: 'Reservas', descripcion: 'Préstamo de salón, cancha y maquinaria al vecino', icon: CalendarCheck, optIn: true },
  { key: 'presentismo', label: 'Presentismo', descripcion: 'Jornadas fichadas por la cuadrilla; alimenta el premio de Sueldos', icon: UserCheck, optIn: true },
  { key: 'comunicacion', label: 'Comunicación', descripcion: 'Avisos y novedades del municipio al celular del vecino', icon: Megaphone, optIn: true },
];

/** Estado efectivo de un módulo dado el set de filas de la tabla. */
export const moduloEfectivo = (
  def: ModuloDef,
  filas: { modulo: string; activo: boolean }[],
): boolean => {
  const fila = filas.find(f => f.modulo === def.key);
  if (fila) return fila.activo;
  return !def.optIn; // sin fila: opt-out = activo, opt-in = oculto
};
