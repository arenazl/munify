/**
 * Tipos del Dashboard modular.
 *
 * Salieron tal cual del monolito `pages/Dashboard.tsx` (1.314 líneas) al
 * partirlo en orquestador + registry + hooks por dominio + secciones.
 * Acá viven SOLO las formas de los datos y el contexto que el orquestador le
 * pasa a cada sección; el contrato de sección (`SeccionDashboard`) vive en
 * `registry.tsx`, que es donde tiene que estar la condición de visibilidad.
 */
import type { DashboardStats } from '../../types';
import type { Municipio } from '../../contexts/AuthContext';

// ---------------------------------------------------------------- analytics

export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensidad: number;
  estado: string;
  categoria: string;
}

export interface ReclamoRecurrente {
  direccion: string;
  zona: string;
  cantidad: number;
  categorias: string[];
  /** La categoría que más pesa en esa esquina, y cuántos de sus reclamos son.
   *  Es lo que deja decir "6 de cada 10 son de Higiene urbana" cuando se está
   *  mirando el mapa sin filtrar por categoría. Opcional: si el backend viejo
   *  todavía no las manda, la fila muestra sólo la dirección. */
  categoria_top?: string | null;
  categoria_top_cantidad?: number;
  /** Antigüedad del reclamo más viejo de esa esquina, en días. */
  dias_mas_viejo?: number | null;
  /** Centro de la esquina (promedio de sus reclamos), para encuadrar el mapa.
   *  null si esos reclamos no tienen coordenadas: ese foco se saltea. */
  lat?: number | null;
  lng?: number | null;
}

export interface ReclamoSimilarGrupo {
  id: number;
  titulo: string;
  direccion: string;
  categoria: { id: number; nombre: string } | null;
  zona: string | null;
  cantidad_reportes: number;
  created_at: string;
}

export interface TendenciaData {
  fecha: string;
  /** Reclamos ingresados ese día (contrato histórico del endpoint). */
  cantidad: number;
  /**
   * Reclamos cerrados ese día. OPCIONAL a propósito: si el backend todavía no
   * la devuelve, el gráfico dibuja sólo ingresados y oculta la leyenda —
   * jamás se inventa la serie.
   */
  resueltos?: number;
}

export interface ZonaCobertura {
  zona_nombre: string;
  total_reclamos: number;
  resueltos: number;
  pendientes: number;
  tasa_resolucion: number;
  indice_atencion: number;
}

export interface CoberturaResumen {
  zonas_criticas: number;
  tasa_resolucion_global: number;
}

export interface TiempoCategoria {
  categoria: string;
  color: string;
  dias_promedio: number;
}

export interface ReclamoResumen {
  id: number;
  titulo: string;
  direccion: string | null;
  categoria: string;
  zona: string | null;
  dias_antiguedad: number;
  prioridad: number;
}

export interface MetricasDetalle {
  urgentes: ReclamoResumen[];
  sin_asignar: ReclamoResumen[];
  para_hoy: ReclamoResumen[];
  /** Trabajados por la cuadrilla, esperando el cierre del supervisor. */
  esperando_visto_bueno: ReclamoResumen[];
  resueltos: ReclamoResumen[];
}

export interface MetricasAccion {
  urgentes: number;
  sin_asignar: number;
  vencidos: number;
  para_hoy: number;
  /** Ya trabajados por la cuadrilla, esperando que un supervisor los cierre. */
  esperando_visto_bueno?: number;
  resueltos_semana: number;
  /** Entrados en los mismos 7 días: sin esto, "resueltos" no dice si el
   *  municipio va ganando o acumulando. */
  entraron_semana?: number;
  cambio_eficiencia: number;
  empleados_activos: number;
  total_empleados: number;
}

/** Respuesta de GET /calificaciones/estadisticas (schema EstadisticasCalificaciones) */
export interface CalifEstadisticas {
  total_calificaciones: number;
  promedio_general: number;
  promedio_tiempo_respuesta: number;
  promedio_calidad_trabajo: number;
  promedio_atencion: number;
  distribucion: Record<string, number>;
  tags_frecuentes: { tag: string; count: number }[];
}

export interface ConteoCategoria { categoria: string; cantidad: number }
export interface ConteoZona { zona: string; cantidad: number }

// ------------------------------------------------------------- por dominio

/** Todo lo que produce `useDatosReclamos`. Con el módulo apagado queda vacío
 *  y `cargando` en false: ningún request sale y ninguna sección espera. */
export interface DatosReclamos {
  stats: DashboardStats | null;
  porCategoria: ConteoCategoria[];
  porZona: ConteoZona[];
  metricasAccion: MetricasAccion | null;
  metricasDetalle: MetricasDetalle | null;
  tendencias: TendenciaData[];
  recurrentes: ReclamoRecurrente[];
  heatmap: HeatmapPoint[];
  cobertura: ZonaCobertura[];
  coberturaResumen: CoberturaResumen | null;
  tiempoResolucion: TiempoCategoria[];
  califStats: CalifEstadisticas | null;
  /** Primera carga de los datos base (stats). Nunca vuelve a true en refresh. */
  cargando: boolean;
  cargandoAnalytics: boolean;
  cargandoHeatmap: boolean;
  /** Refresco en caliente (cambio de dependencia / pull-to-refresh). */
  refrescando: boolean;
}

export interface DatosTramites {
  stats: DashboardStats | null;
  cargando: boolean;
}

/** Lo que recibe CADA sección: los hooks de todos los dominios montados. */
export interface DatosDashboard {
  reclamos: DatosReclamos;
  tramites: DatosTramites;
}

/** Contexto de la pantalla — lo transversal, no los datos. */
export interface DashboardCtx {
  /** Dependencia filtrada; undefined = vista consolidada. */
  depId?: number;
  /** Detalle del muni. null mientras no se resolvió (super admin sin contexto). */
  municipio: Municipio | null;
  /** Nombre del muni ya limpio (sin "Municipalidad de"). */
  municipioNombre: string;
  /** Nombre de la dependencia filtrada; null = vista consolidada. */
  dependenciaNombre: string | null;
  refreshKey: number;
}

/** Props de toda sección del dashboard. */
export interface SeccionProps {
  datos: DatosDashboard;
  ctx: DashboardCtx;
}
