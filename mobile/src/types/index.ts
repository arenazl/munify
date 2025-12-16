export type RolUsuario = 'vecino' | 'empleado' | 'supervisor' | 'admin';
export type EstadoReclamo = 'nuevo' | 'asignado' | 'en_proceso' | 'resuelto' | 'rechazado';
export type MotivoRechazo = 'no_competencia' | 'duplicado' | 'info_insuficiente' | 'fuera_jurisdiccion' | 'otro';

export interface User {
  id: number;
  municipio_id?: number;
  email: string;
  nombre: string;
  apellido: string;
  telefono?: string;
  dni?: string;
  direccion?: string;
  rol: RolUsuario;
  activo: boolean;
  empleado_id?: number;
  created_at: string;
}

export interface Categoria {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  tiempo_resolucion_estimado: number;
  prioridad_default: number;
  activo: boolean;
  created_at: string;
}

export interface Zona {
  id: number;
  nombre: string;
  codigo?: string;
  descripcion?: string;
  latitud_centro?: number;
  longitud_centro?: number;
  activo: boolean;
  created_at: string;
}

export interface Documento {
  id: number;
  nombre_original: string;
  url: string;
  tipo: string;
  etapa?: string;
}

export interface Reclamo {
  id: number;
  titulo: string;
  descripcion: string;
  estado: EstadoReclamo;
  prioridad: number;
  direccion: string;
  latitud?: number;
  longitud?: number;
  referencia?: string;
  motivo_rechazo?: MotivoRechazo;
  descripcion_rechazo?: string;
  resolucion?: string;
  fecha_resolucion?: string;
  fecha_programada?: string;
  hora_inicio?: string;
  hora_fin?: string;
  created_at: string;
  updated_at?: string;
  categoria: { id: number; nombre: string; icono?: string; color?: string };
  zona?: { id: number; nombre: string; codigo?: string };
  creador: { id: number; nombre: string; apellido: string; email: string };
  empleado_asignado?: { id: number; nombre: string; apellido?: string; especialidad?: string };
  documentos: Documento[];
}

export interface Notificacion {
  id: number;
  titulo: string;
  mensaje: string;
  tipo: string;
  reclamo_id?: number;
  leida: boolean;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  por_estado: Record<EstadoReclamo, number>;
  hoy: number;
  semana: number;
  tiempo_promedio_dias: number;
}

export interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  logo_url?: string;
  activo: boolean;
}

// Estado de color según estado del reclamo
export const estadoColors: Record<EstadoReclamo, string> = {
  nuevo: '#3b82f6',
  asignado: '#f59e0b',
  en_proceso: '#8b5cf6',
  resuelto: '#10b981',
  rechazado: '#ef4444',
};

export const estadoLabels: Record<EstadoReclamo, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};
