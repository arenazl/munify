export type RolUsuario = 'vecino' | 'empleado' | 'supervisor' | 'admin';
export type EstadoReclamo = 'nuevo' | 'asignado' | 'en_proceso' | 'pendiente_confirmacion' | 'resuelto' | 'rechazado';
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

// Dirección organizativa municipal (unidad que gestiona reclamos/trámites)
export type TipoGestion = 'reclamos' | 'tramites' | 'ambos';

export interface DireccionCategoria {
  id: number;
  categoria_id: number;
  categoria: CategoriaSimple;
  tiempo_resolucion_estimado?: number;
  prioridad_default?: number;
  activo: boolean;
}

export interface DireccionTipoTramite {
  id: number;
  tipo_tramite_id: number;
  tipo_tramite: {
    id: number;
    nombre: string;
    icono?: string;
    color?: string;
  };
  activo: boolean;
}

export interface Direccion {
  id: number;
  nombre: string;
  codigo?: string;
  descripcion?: string;
  direccion?: string;  // "Av. San Martin 1234"
  localidad?: string;
  codigo_postal?: string;
  latitud?: number;
  longitud?: number;
  tipo_gestion: TipoGestion;
  activo: boolean;
  created_at?: string;
  categorias_asignadas?: DireccionCategoria[];
  tipos_tramite_asignados?: DireccionTipoTramite[];
}

// Para el drag & drop de asignaciones
export interface CategoriaDisponible {
  id: number;
  nombre: string;
  icono?: string;
  color?: string;
  descripcion?: string;
  direcciones_asignadas: number[];
}

export interface TipoTramiteDisponible {
  id: number;
  nombre: string;
  icono?: string;
  color?: string;
  descripcion?: string;
  direcciones_asignadas: number[];
}

export interface CategoriaSimple {
  id: number;
  nombre: string;
  color?: string;
  icono?: string;
}

export type TipoEmpleado = 'operario' | 'administrativo';

export interface Empleado {
  id: number;
  nombre: string;
  apellido?: string;
  telefono?: string;
  descripcion?: string;
  especialidad?: string;
  tipo: TipoEmpleado;
  zona_id?: number;
  capacidad_maxima: number;
  activo: boolean;
  created_at: string;
  categoria_principal_id?: number;
  categoria_principal?: CategoriaSimple;
  categorias: CategoriaSimple[];
  miembros: { id: number; nombre: string; apellido: string; email: string }[];
}

export interface HorarioSimple {
  dia_semana: number; // 0=Lunes, 6=Domingo
  hora_entrada: string;
  hora_salida: string;
  activo: boolean;
}

export interface EmpleadoDisponibilidad {
  id: number;
  nombre: string;
  apellido?: string;
  especialidad?: string;
  tipo: TipoEmpleado;
  capacidad_maxima: number;
  carga_actual: number;
  disponibilidad: number;
  porcentaje_ocupacion: number;
  horarios: HorarioSimple[];
  horario_texto: string;
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
  es_anonimo?: boolean;
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
  dependencia_asignada?: { id: number; dependencia_id: number; nombre?: string; color?: string; icono?: string };
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

// Tramites - Estructura de 3 niveles
// Nivel 1: TipoTramite (categorías: Obras Privadas, Comercio, etc.)
// Nivel 2: Tramite (procedimientos: Permiso de obra, Habilitación comercial, etc.)
// Nivel 3: Solicitud (solicitudes diarias de vecinos)

export type EstadoSolicitud = 'iniciado' | 'en_revision' | 'requiere_documentacion' | 'en_proceso' | 'aprobado' | 'rechazado' | 'finalizado';

// Nivel 1: Categorías de trámites
export interface TipoTramite {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string;
  codigo?: string;
  icono?: string;
  color?: string;
  activo: boolean;
  orden: number;
  created_at: string;
  tramites?: TramiteCatalogo[];
}

// Nivel 2: Catálogo de trámites específicos
export interface TramiteCatalogo {
  id: number;
  tipo_tramite_id: number;
  tipo_tramite?: TipoTramite;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  requisitos?: string;
  documentos_requeridos?: string;
  tiempo_estimado_dias: number;
  costo?: number;
  url_externa?: string;
  activo: boolean;
  orden: number;
  created_at: string;
}

// Tramite: tipo unificado para compatibilidad (soporta catálogo y solicitudes)
// Nota: Este tipo combina campos de catálogo y solicitud para mantener compatibilidad
export interface Tramite {
  id: number;
  // Campos comunes (requeridos)
  nombre: string;
  created_at: string;
  activo: boolean;
  orden: number;
  // Campos de catálogo
  tipo_tramite_id: number;
  tipo_tramite?: TipoTramite;
  icono?: string;
  color?: string;
  requisitos?: string;
  documentos_requeridos?: string;
  tiempo_estimado_dias: number;
  costo?: number;
  url_externa?: string;
  favorito?: boolean;
  // Campos de solicitud (requeridos para compatibilidad con código viejo)
  municipio_id: number;
  numero_tramite: string;
  asunto: string;
  descripcion?: string;
  estado: EstadoSolicitud;
  tramite_id?: number;
  servicio_id?: number;
  tramite?: TramiteCatalogo;
  servicio?: TramiteCatalogo;
  solicitante_id?: number;
  nombre_solicitante?: string;
  apellido_solicitante?: string;
  dni_solicitante?: string;
  email_solicitante?: string;
  telefono_solicitante?: string;
  direccion_solicitante?: string;
  empleado_id?: number;
  empleado_asignado?: {
    id: number;
    nombre: string;
    apellido?: string;
    especialidad?: string;
  };
  prioridad?: number;
  respuesta?: string;
  observaciones?: string;
  updated_at?: string;
  fecha_resolucion?: string;
}

// Nivel 3: Solicitudes de vecinos
export interface Solicitud {
  id: number;
  municipio_id: number;
  numero_tramite: string;
  asunto: string;
  descripcion?: string;
  estado: EstadoSolicitud;
  tramite_id?: number;
  servicio_id?: number; // Alias deprecado de tramite_id
  tramite?: Tramite;
  servicio?: Tramite; // Alias deprecado de tramite
  solicitante_id?: number;
  nombre_solicitante?: string;
  apellido_solicitante?: string;
  dni_solicitante?: string;
  email_solicitante?: string;
  telefono_solicitante?: string;
  direccion_solicitante?: string;
  empleado_id?: number;
  empleado_asignado?: {
    id: number;
    nombre: string;
    apellido?: string;
    especialidad?: string;
  };
  prioridad: number;
  respuesta?: string;
  observaciones?: string;
  created_at: string;
  updated_at?: string;
  fecha_resolucion?: string;
}

export interface HistorialSolicitud {
  id: number;
  solicitud_id: number;
  usuario_id?: number;
  usuario?: { nombre: string; apellido: string };
  estado_anterior?: EstadoSolicitud;
  estado_nuevo?: EstadoSolicitud;
  accion: string;
  comentario?: string;
  created_at: string;
}

// Alias para compatibilidad temporal (deprecado)
export type EstadoTramite = EstadoSolicitud;
export type HistorialTramite = HistorialSolicitud;

// ServicioTramite: compatibilidad con código viejo que usaba estructura plana
// En la nueva estructura, estas propiedades vienen del Tramite (nivel 2)
export interface ServicioTramite {
  id: number;
  municipio_id?: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  requisitos?: string;
  documentos_requeridos?: string;
  tiempo_estimado_dias: number;
  costo?: number;
  url_externa?: string;
  activo: boolean;
  orden: number;
  favorito: boolean;
  created_at?: string;
  // Campos de TipoTramite
  codigo?: string;
  // Campos de Tramite
  tipo_tramite_id?: number;
}
