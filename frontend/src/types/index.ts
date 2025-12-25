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

export interface CategoriaSimple {
  id: number;
  nombre: string;
  color?: string;
  icono?: string;
}

export interface Empleado {
  id: number;
  nombre: string;
  apellido?: string;
  descripcion?: string;
  especialidad?: string;
  zona_id?: number;
  capacidad_maxima: number;
  activo: boolean;
  created_at: string;
  categoria_principal_id?: number;
  categoria_principal?: CategoriaSimple;
  categorias: CategoriaSimple[];
  miembros: { id: number; nombre: string; apellido: string; email: string }[];
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
  creador: { id: number; nombre: string; apellido: string; email: string; telefono?: string };
  empleado_asignado?: { id: number; nombre: string; apellido?: string; especialidad?: string };
  documentos: Documento[];
}

export interface DisponibilidadEmpleado {
  fecha: string;
  bloques_ocupados: {
    reclamo_id: number;
    titulo: string;
    hora_inicio: string;
    hora_fin: string;
  }[];
  proximo_disponible: string;
  hora_fin_jornada: string;
  dia_lleno: boolean;
}

export interface HistorialReclamo {
  id: number;
  reclamo_id: number;
  estado_anterior?: EstadoReclamo;
  estado_nuevo: EstadoReclamo;
  accion: string;
  comentario?: string;
  created_at: string;
  usuario: { id: number; nombre: string; apellido: string };
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
