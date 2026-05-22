export type RolUsuario = 'vecino' | 'supervisor' | 'admin';
export type EstadoReclamo = 'recibido' | 'en_curso' | 'finalizado' | 'pospuesto' | 'rechazado' | 'nuevo' | 'asignado' | 'en_proceso' | 'pendiente_confirmacion' | 'resuelto';
export type MotivoRechazo = 'no_competencia' | 'duplicado' | 'info_insuficiente' | 'fuera_jurisdiccion' | 'otro';

// Info de dependencia para usuarios de dependencia
export interface DependenciaInfo {
  id: number;
  nombre: string;
  color?: string;
  icono?: string;
  direccion?: string;
  telefono?: string;
}

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
  municipio_dependencia_id?: number;
  dependencia?: DependenciaInfo;
  created_at: string;
  // Super admin = usuario sin municipio asignado (cross-tenant).
  // Lo devuelve el endpoint /auth/me.
  is_super_admin?: boolean;
  // Nivel KYC: 0=basico, 1=email, 2=DNI+selfie (Didit). Bloquea edicion
  // de campos verificados (DNI/nombre/apellido) en los wizards.
  nivel_verificacion?: number;
  cuenta_verificada?: boolean;
}

// =====================================================================
// CATEGORÍAS (per-municipio, sin catálogo global)
// =====================================================================

export interface CategoriaReclamo {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  tiempo_resolucion_estimado: number;
  prioridad_default: number;
  orden: number;
  activo: boolean;
  created_at: string;
}

export interface CategoriaTramite {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  color?: string;
  orden: number;
  activo: boolean;
  created_at: string;
}

// Alias temporal usado en código que aún se refiere genéricamente a "Categoria"
// (sólo para reclamos — el dominio histórico). El frontend nuevo debería usar
// CategoriaReclamo o CategoriaTramite explícitamente.
export type Categoria = CategoriaReclamo;

export interface CategoriaSimple {
  id: number;
  nombre: string;
  color?: string;
  icono?: string;
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

// =====================================================================
// EMPLEADOS
// =====================================================================

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
  municipio_dependencia_id?: number;
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

// =====================================================================
// RECLAMOS
// =====================================================================

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
  tiempo_estimado_dias?: number;
  tiempo_estimado_horas?: number;
  fecha_estimada_resolucion?: string;
  fecha_recibido?: string;
  created_at: string;
  updated_at?: string;
  categoria: { id: number; nombre: string; icono?: string; color?: string };
  zona?: { id: number; nombre: string; codigo?: string };
  creador: { id: number; nombre: string; apellido: string; email: string; telefono?: string };
  dependencia_asignada?: { id: number; dependencia_id: number; nombre?: string; color?: string; icono?: string };
  documentos: Documento[];
  imagenes?: string[];
  confirmado_vecino?: boolean | null;
  fecha_confirmacion_vecino?: string;
  comentario_confirmacion_vecino?: string;
  personas?: ReclamoPersona[];
}

export interface ReclamoPersona {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  created_at: string;
  es_creador_original: boolean;
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

// =====================================================================
// TRÁMITES (per-municipio, 2 niveles: CategoriaTramite -> Tramite)
// =====================================================================

export type EstadoSolicitud =
  | 'recibido'
  | 'en_curso'
  | 'finalizado'
  | 'pospuesto'
  | 'rechazado';

export interface TramiteDocumentoRequerido {
  id: number;
  tramite_id: number;
  nombre: string;
  descripcion?: string;
  obligatorio: boolean;
  orden: number;
  created_at?: string;
}

export interface Tramite {
  id: number;
  municipio_id: number;
  categoria_tramite_id: number;
  categoria_tramite?: { id: number; nombre: string; icono?: string; color?: string };
  nombre: string;
  descripcion?: string;
  icono?: string;
  tiempo_estimado_dias: number;
  costo?: number;
  url_externa?: string;
  requiere_validacion_dni?: boolean;
  requiere_validacion_facial?: boolean;
  // CENAT — Fase 3 bundle pagos
  requiere_cenat?: boolean;
  monto_cenat_referencia?: number;
  // KYC visible — Fase 5 bundle pagos
  requiere_kyc?: boolean;
  nivel_kyc_minimo?: number;
  // Configuración de cobro
  tipo_pago?: string;        // 'boton_pago' | 'rapipago' | 'adhesion_debito' | 'qr'
  momento_pago?: string;     // 'inicio' | 'fin'
  // Turnero presencial
  requiere_turno?: boolean;
  duracion_turno_min?: number;  // 15 / 30 / 60
  activo: boolean;
  orden: number;
  documentos_requeridos: TramiteDocumentoRequerido[];
  created_at: string;
}

export interface Solicitud {
  id: number;
  municipio_id: number;
  numero_tramite: string;
  asunto: string;
  descripcion?: string;
  estado: EstadoSolicitud;
  tramite_id?: number;
  tramite?: Tramite;
  solicitante_id?: number;
  nombre_solicitante?: string;
  apellido_solicitante?: string;
  dni_solicitante?: string;
  email_solicitante?: string;
  telefono_solicitante?: string;
  direccion_solicitante?: string;
  municipio_dependencia_id?: number;
  dependencia_asignada?: {
    id: number;
    dependencia_id: number;
    nombre?: string;
    color?: string;
    icono?: string;
  };
  empleado_id?: number | null;
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

// Documento subido a una solicitud, con datos de verificación
export interface DocumentoSolicitud {
  id: number;
  nombre_original: string;
  url: string;
  tipo: string;
  tipo_documento?: string;
  descripcion?: string;
  etapa?: string;
  mime_type?: string;
  tamanio?: number;
  tramite_documento_requerido_id?: number;
  verificado: boolean;
  verificado_por_id?: number;
  fecha_verificacion?: string;
  created_at: string;
}

// Item del checklist combinado para verificación de documentos
export interface ChecklistDocumentoItem {
  requerido_id?: number;
  nombre: string;
  descripcion?: string;
  obligatorio: boolean;
  orden: number;
  documento_id?: number;
  documento_url?: string;
  documento_nombre?: string;
  /** "imagen" | "documento" | "verificacion_manual" */
  documento_tipo?: string;
  verificado: boolean;
  verificado_por_id?: number;
  verificado_por_nombre?: string;
  fecha_verificacion?: string;
  rechazado?: boolean;
  motivo_rechazo?: string | null;
  rechazado_por_nombre?: string | null;
  fecha_rechazo?: string | null;
}

// =====================================================================
// TASAS (3er pilar)
// =====================================================================

export interface TipoTasa {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  icono: string;
  color: string;
  ciclo: 'mensual' | 'bimestral' | 'cuatrimestral' | 'anual' | 'one_shot';
  activo: boolean;
  orden: number;
}

export interface Partida {
  id: number;
  municipio_id: number;
  tipo_tasa_id: number;
  tipo_tasa?: TipoTasa;
  identificador: string;
  titular_user_id?: number | null;
  titular_dni?: string | null;
  titular_nombre?: string | null;
  objeto?: Record<string, unknown> | null;
  estado: 'activa' | 'baja' | 'suspendida';
  created_at: string;
  deudas_pendientes?: number;
  monto_pendiente?: string | number;
}

export interface Deuda {
  id: number;
  partida_id: number;
  periodo: string;
  importe: string | number;
  importe_original?: string | number | null;
  recargo: string | number;
  descuento: string | number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: 'pendiente' | 'pagada' | 'vencida' | 'en_plan_pago' | 'anulada';
  fecha_pago?: string | null;
  pago_externo_id?: string | null;
  codigo_barras?: string | null;
  observaciones?: string | null;
  created_at: string;
  tipo_tasa_nombre?: string | null;
  partida_identificador?: string | null;
}

export interface ResumenTasasVecino {
  partidas_total: number;
  deudas_pendientes: number;
  deudas_vencidas: number;
  monto_total_pendiente: string | number;
  proxima_vencimiento?: string | null;
}

export interface ChecklistDocumentos {
  solicitud_id: number;
  items: ChecklistDocumentoItem[];
  todos_verificados: boolean;
  total_obligatorios: number;
  total_obligatorios_verificados: number;
  total_obligatorios_subidos?: number;
  documentos_enviados_revision?: boolean;
  fecha_envio_revision?: string | null;
}

// =====================================================================
// COMPATIBILIDAD: aliases para código todavía no migrado
// (se eliminan a medida que avance el refactor)
// =====================================================================

// Alias del tipo viejo `ServicioTramite` que el TramiteWizard sigue usando.
// En el nuevo modelo equivale a `Tramite`.
export type ServicioTramite = Tramite;

// Alias deprecado: el modelo viejo tenía un nivel intermedio TipoTramite.
// Ahora existe `CategoriaTramite` que cumple ese rol. Se conserva el alias
// para que las pantallas viejas no exploten al instante (cada una se va a
// migrar a CategoriaTramite con su refactor).
export type TipoTramite = CategoriaTramite;

// Alias deprecado: tipo unificado catalogo+solicitud. Ahora son `Tramite` y
// `Solicitud` separados.
export type TramiteCatalogo = Tramite;

// Alias para tipos legacy que NO se usan más pero quedan en imports sueltos
export type EstadoTramite = EstadoSolicitud;
export type HistorialTramite = HistorialSolicitud;

// =====================================================================
// TESORERIA (control de gastos del intendente)
// =====================================================================

export type TipoContacto =
  | 'concejal' | 'empleado' | 'profesional'
  | 'proveedor' | 'contratista' | 'beneficiario' | 'otro';

export type DestinoGasto = 'dependencia' | 'contacto';
export type TipoFinanciacion = 'contado' | 'cuotas' | 'prestamo' | 'recurrente';
export type FrecuenciaRecurrencia =
  | 'semanal' | 'quincenal' | 'mensual'
  | 'bimestral' | 'trimestral' | 'anual';
export type FormaPago =
  | 'efectivo' | 'transferencia' | 'cheque'
  | 'tarjeta' | 'mercadopago' | 'otro';
export type EstadoGastoCuota = 'pendiente' | 'pagada' | 'vencida' | 'cancelada';

export interface Contacto {
  id: number;
  municipio_id: number;
  nombre: string;
  apellido?: string | null;
  dni?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  paraje_id?: number | null;
  latitud?: number | null;
  longitud?: number | null;
  alias_pago?: string | null;
  tipo: TipoContacto;
  subtipo?: string | null;
  tipo_empleado_id?: number | null;
  notas?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface GastoCuota {
  id: number;
  gasto_id: number;
  numero: number;
  monto: string;  // Decimal serializado como string
  fecha_vencimiento: string;
  fecha_pago?: string | null;
  estado: EstadoGastoCuota;
  forma_pago?: FormaPago | null;
  comprobante?: string | null;
  notas?: string | null;
}

export interface Gasto {
  id: number;
  municipio_id: number;
  creador_id: number;
  destino_tipo: DestinoGasto;
  destino_dependencia_id?: number | null;
  destino_contacto_id?: number | null;
  concepto: string;
  descripcion?: string | null;
  observaciones?: string | null;
  monto_pesos: string;
  cotizacion_usd?: string | null;
  monto_usd?: string | null;
  fecha: string;
  tipo_financiacion: TipoFinanciacion;
  forma_pago: FormaPago;
  cuotas_total?: number | null;
  frecuencia?: FrecuenciaRecurrencia | null;
  fecha_fin_recurrencia?: string | null;
  caja_id?: number | null;
  nro_factura?: string | null;
  factura_url?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
  cuotas?: GastoCuota[];
  proyectos?: GastoProyectoLink[];
}

export type EstadoProyecto = 'activo' | 'pausado' | 'finalizado';

export interface GastoProyectoLink {
  proyecto_id: number;
  proyecto_nombre: string;
  monto_asignado: string;
}

export interface GastoProyectoAssignment {
  proyecto_id: number;
  monto_asignado: number;
}

export interface ProyectoResumen {
  total_imputado: string;
  cantidad_gastos: number;
  porcentaje_presupuesto?: number | null;
}

export interface Proyecto {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string | null;
  presupuesto?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  estado: EstadoProyecto;
  activo: boolean;
  created_at: string;
  updated_at: string;
  resumen?: ProyectoResumen | null;
}

export interface TipoConcepto {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string | null;
  color?: string | null;
  icono?: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  cantidad_conceptos?: number | null;
}

export interface Concepto {
  id: number;
  municipio_id: number;
  tipo_concepto_id: number;
  tipo_concepto_nombre?: string | null;
  tipo_concepto_color?: string | null;
  nombre: string;
  descripcion?: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface TipoEmpleadoCatalogo {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string | null;
  color?: string | null;
  icono?: string | null;
  orden: number;
  activo: boolean;
  cantidad_empleados?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Caja {
  id: number;
  municipio_id: number;
  nombre: string;
  codigo?: string | null;
  descripcion?: string | null;
  color?: string | null;
  icono?: string | null;
  saldo_inicial: string;
  fecha_apertura?: string | null;
  orden: number;
  activo: boolean;
  total_ingresos?: string | null;
  total_egresos?: string | null;
  saldo_actual?: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoMovimientoCaja = 'ingreso' | 'egreso';
export type FrecuenciaPago = 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'anual';

export interface Premio {
  id: number;
  municipio_id: number;
  nombre: string;
  monto: string;
  descripcion?: string | null;
  color?: string | null;
  icono?: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export type EstadoOrdenPago = 'pendiente' | 'autorizada' | 'pagada' | 'anulada';
export type EtapaContable = 'preventivo' | 'compromiso' | 'devengado' | 'pagado';

export interface RetencionAplicada {
  id?: number | null;
  nombre: string;
  porcentaje: number;
  monto: number;
}

export interface ContaduriaRetencion {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string | null;
  porcentaje: string;
  color?: string | null;
  activo: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface OrdenPago {
  id: number;
  municipio_id: number;
  numero: string;
  destino_tipo: 'contacto' | 'dependencia';
  destino_contacto_id?: number | null;
  destino_dependencia_id?: number | null;
  concepto: string;
  descripcion?: string | null;
  monto_pesos: string;
  caja_id?: number | null;
  nro_factura?: string | null;
  factura_url?: string | null;
  estado: EstadoOrdenPago;
  etapa_contable: EtapaContable;
  retenciones?: RetencionAplicada[] | null;
  monto_neto?: string | null;
  fecha_emision: string;
  fecha_vencimiento?: string | null;
  fecha_autorizacion?: string | null;
  fecha_pago?: string | null;
  fecha_devengado?: string | null;
  fecha_anulacion?: string | null;
  creador_id: number;
  autorizado_por_id?: number | null;
  anulado_por_id?: number | null;
  gasto_id?: number | null;
  motivo_anulacion?: string | null;
  notas?: string | null;
  // Enriquecidos
  contacto_nombre?: string | null;
  dependencia_nombre?: string | null;
  caja_nombre?: string | null;
  creador_nombre?: string | null;
  autorizado_por_nombre?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimientoCaja {
  id: number;
  municipio_id: number;
  caja_id: number;
  caja_nombre?: string | null;
  gasto_id?: number | null;
  tipo: TipoMovimientoCaja;
  monto: string;
  fecha: string;
  concepto: string;
  descripcion?: string | null;
  created_at: string;
}

export interface Paraje {
  id: number;
  municipio_id: number;
  nombre: string;
  descripcion?: string | null;
  color?: string | null;
  icono?: string | null;
  poligono?: number[][] | null;  // [[lat, lon], ...]
  centro_lat?: number | null;
  centro_lon?: number | null;
  orden: number;
  activo: boolean;
  cantidad_contactos?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PagoProgramado {
  id: number;
  municipio_id: number;
  contacto_id: number;
  contacto_nombre?: string | null;
  caja_id?: number | null;
  caja_nombre?: string | null;
  concepto: string;
  descripcion?: string | null;
  monto_pesos: string;
  forma_pago: string;
  frecuencia: FrecuenciaPago;
  dia_del_mes: number;
  fecha_inicio: string;
  fecha_fin?: string | null;
  proximo_pago: string;
  ultimo_pago?: string | null;
  notas?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CotizacionUSD {
  fecha: string;
  fuente: string;
  blue_compra?: string | null;
  blue_venta?: string | null;
  oficial_compra?: string | null;
  oficial_venta?: string | null;
  valor_sugerido?: string | null;
}

export interface ProyeccionMes {
  anio: number;
  mes: number;
  total_pesos: string;
  total_usd?: string | null;
  cantidad_cuotas: number;
  cuotas_vencidas?: number;
}

export interface DesgloseTipoFinanciacion {
  tipo: string;
  total_pesos: string;
  cantidad_cuotas: number;
}

export interface ProyeccionResponse {
  desde: string;
  hasta: string;
  total_pesos: string;
  cantidad_cuotas: number;
  cuotas_vencidas?: number;
  mes_pico?: ProyeccionMes | null;
  por_mes: ProyeccionMes[];
  desglose_por_tipo?: DesgloseTipoFinanciacion[];
}

export interface CuotaProyeccion {
  cuota_id: number;
  gasto_id: number;
  concepto: string;
  contacto_nombre: string | null;
  dependencia_nombre: string | null;
  monto: string;
  fecha_vencimiento: string;
  estado: string;
  numero_cuota: number;
  total_cuotas: number | null;
  tipo_financiacion: string;
}

export interface ConceptoGastoGrupo {
  nombre: string;
  conceptos: string[];
}

export interface ConceptosCatalogo {
  version: number;
  descripcion?: string;
  grupos: ConceptoGastoGrupo[];
}

export interface MunicipioModulo {
  id: number;
  municipio_id: number;
  modulo: string;
  activo: boolean;
}
