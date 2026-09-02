/**
 * Tipos del Dashboard modular.
 *
 * Salieron tal cual del monolito `pages/Dashboard.tsx` (1.314 líneas) al
 * partirlo en orquestador + registry + hooks por dominio + secciones.
 * Acá viven SOLO las formas de los datos y el contexto que el orquestador le
 * pasa a cada sección; el contrato de sección (`SeccionDashboard`) vive en
 * `registry.tsx`, que es donde tiene que estar la condición de visibilidad.
 */
import type { LucideIcon } from 'lucide-react';
import type { Caja, DashboardStats, PagoProgramado } from '../../types';
import type { Municipio } from '../../contexts/AuthContext';

// ------------------------------------------------------- pregunta semántica

/**
 * Una PREGUNTA del tablero, ya resuelta por un armador: la pregunta, su
 * respuesta, el veredicto y el porqué en prosa. Es exactamente lo que come
 * `KpiSemantico`, que es una pieza boba y no calcula nada.
 *
 * Vive acá porque la usan los armadores de TODOS los dominios (finanzas,
 * trámites, y los que vengan). Tenerla una vez es lo que evita que el
 * armador de trámites tenga que importar el de finanzas para reusar su
 * forma — o, peor, que la copie.
 */
export interface PreguntaSemantica {
  id: string;
  pregunta: string;
  icono: LucideIcon;
  tono: 'bueno' | 'malo' | 'advertencia' | 'info' | 'neutro';
  valor: string;
  unidad?: string;
  /** Partes de la explicación: el texto plano y lo que va en negrita. */
  detalle: { texto: string; fuerte?: boolean }[];
  pie?: string;
  accion: { label: string; to: string };
}

// ------------------------------------------------------------- dominios

/**
 * Los tres dominios de datos del tablero: qué hook hay que montar, qué módulo
 * lo enciende y en qué orden se muestran cuando la actividad empata.
 *
 * Vive acá (y no en `registry.tsx`) para que los armadores de copy puedan
 * etiquetar sus frases sin importar el registro de secciones, que arrastra
 * componentes.
 */
export type DominioDatos = 'reclamos' | 'tramites' | 'finanzas';

/** ORDEN CANÓNICO. Es el desempate del orden dinámico y el orden en que se
 *  dibuja el strip del hero. */
export const DOMINIOS: DominioDatos[] = ['reclamos', 'tramites', 'finanzas'];

/** Lo que devuelve `GET /dashboard/actividad` para UN dominio. */
export interface ActividadDominio {
  /** Historia completa. 0 = "módulo prototipo": prendido pero nunca usado. */
  total: number;
  /** Casos de los últimos 30 días. Es lo que ordena los bloques. */
  ultimos30: number;
}

/** La respuesta completa del endpoint. */
export type MapaActividad = Record<DominioDatos, ActividadDominio>;

/** Lo que expone `useActividad`. */
export interface Actividad {
  /** null = todavía no llegó, o falló. En ambos casos el tablero cae al orden
   *  canónico y NO esconde nada (fail-open). */
  datos: MapaActividad | null;
  /** true cuando ya se sabe (con dato o con error). */
  resuelto: boolean;
}

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

// ---------------------------------------------------- circuito de trámites

/**
 * Las solicitudes ABIERTAS repartidas por quién tiene la pelota
 * (`GET /dashboard/tramites-circuito`).
 *
 * La distinción vecino/municipio es la información nueva del bloque: una
 * cola de 30 no dice lo mismo si 24 duermen en una dependencia que si 24
 * esperan que alguien pague. El backend clasifica por estado real y devuelve
 * el desglose crudo para que el copy pueda nombrar el motivo.
 */
export interface CuellosTramites {
  abiertas: number;
  esperando_vecino: number;
  esperando_municipio: number;
  /** { estado: cantidad } de lo que espera al vecino (pendiente de pago…). */
  por_estado_vecino: Record<string, number>;
  /** Ídem del lado del municipio (recibido, en curso, pospuesto…). */
  por_estado_municipio: Record<string, number>;
  /** Antigüedad de la abierta más vieja. null si no hay ninguna abierta. */
  dias_mas_vieja: number | null;
  top_dependencia: { nombre: string; cantidad: number } | null;
  /** Cuántas dependencias tienen alguna abierta. Con una sola, "la que más
   *  concentra" no informa nada y el copy nombra el trámite en su lugar. */
  dependencias_con_abiertas: number;
  top_tramite: { nombre: string; cantidad: number } | null;
  tramites_con_abiertas: number;
}

/**
 * El presentismo del turnero. La ventana son los turnos YA OCURRIDOS de los
 * últimos `dias`; los que todavía no llegaron van en `proximos` y no ensucian
 * el porcentaje.
 *
 * `sin_marcar` son los que pasaron y siguen en 'reservado': NO son ausentes,
 * son turnos que nadie registró. Tenerlos aparte es lo que evita contar como
 * falta lo que sólo es un mostrador que no carga el resultado.
 */
export interface TurnosCircuito {
  dias: number;
  /** Turnos ya ocurridos en la ventana (presentados + ausentes + cancelados + sin marcar). */
  total: number;
  presentados: number;
  ausentes: number;
  cancelados: number;
  sin_marcar: number;
  /** Agendados de acá a `dias` días. */
  proximos: number;
  /** La hora del día con más ausencias, si hubo alguna. */
  franja_ausencias: { hora: number; cantidad: number } | null;
}

export interface TipoTramiteCircuito {
  tramite_id: number;
  nombre: string;
  solicitudes: number;
  /** Cierres con fecha real de resolución (los únicos que se pueden medir). */
  cerradas: number;
  /** Promedio de duración en MINUTOS. null = ningún cierre medible; 0 = los
   *  cierres existen y fueron instantáneos. No es lo mismo y se dice distinto. */
  minutos_promedio: number | null;
}

export interface TiposCircuito {
  dias: number;
  /** Solicitudes de la ventana (la suma de `items`). */
  total: number;
  /** Tipos con movimiento, del más pedido al menos. */
  items: TipoTramiteCircuito[];
  /** El de mayor promedio, sólo si promedia MÁS de cero y sale de al menos
   *  dos cierres. null cuando todo cierra en el acto: ahí no hay un trámite
   *  que duela más y afirmarlo sería inventarlo. */
  mas_lento: TipoTramiteCircuito | null;
  /** El promedio de los OTROS tipos comparables, con la misma vara que eligió
   *  a `mas_lento`. Es contra esto que se dice "tarda X contra Y del resto";
   *  null cuando no hay otro tipo con tiempo fiable y no hay comparación. */
  promedio_resto_minutos: number | null;
}

/** La respuesta completa de `GET /dashboard/tramites-circuito`. */
export interface TramitesCircuito {
  cuellos: CuellosTramites;
  turnos: TurnosCircuito;
  tipos: TiposCircuito;
}

export interface DatosTramites {
  stats: DashboardStats | null;
  /** null = módulo apagado, todavía no llegó, o el GET falló. En los tres
   *  casos la sección del circuito no dibuja nada — jamás un tablero roto
   *  por un endpoint caído. */
  circuito: TramitesCircuito | null;
  cargando: boolean;
}

// ------------------------------------------------------------- finanzas

/** Un día de la serie de gasto (GET /tesoreria/gastos/serie). La serie es
 *  CONTIGUA: los días sin gasto llegan con monto 0, así el promedio por día
 *  se calcula sobre días de calendario y no sobre "días con movimiento". */
export interface PuntoSerieGasto {
  /** 'YYYY-MM-DD' */
  fecha: string;
  monto: number;
}

/** Conteo + monto de una pila (OPs esperando firma, movimientos sin conciliar).
 *  null cuando el módulo que la produce está apagado: "null" y "cero" NO son
 *  lo mismo y el copy los dice distinto. */
export interface PilaFinanciera {
  cantidad: number;
  monto: number;
}

/** La nómina programada (GET /tesoreria/agenda/reportes). */
export interface NominaResumen {
  /** Contactos tipo empleado activos. */
  empleados: number;
  /** Suma de los pagos programados activos. */
  masa: number;
  /** Cuántos pagos programados activos la componen. */
  pagos: number;
}

/**
 * Todo lo que produce `useDatosFinanzas`.
 *
 * Los agregados del mes NO viven acá: salen de `serie` (que ya trae el día a
 * día) en los armadores. Un endpoint menos y un número menos que puede
 * contradecir al gráfico que tiene al lado.
 */
export interface DatosFinanzas {
  /** Cajas ACTIVAS con su saldo calculado (incluye las tipo tarjeta, que el
   *  armador separa: el "saldo" de una tarjeta es crédito, no plata). */
  cajas: Caja[];
  /** Pagos programados ACTIVOS de la agenda. */
  pagos: PagoProgramado[];
  serie: PuntoSerieGasto[];
  /** Primer día en que el muni cargó gastos A MANO ('YYYY-MM-DD'): la
   *  tendencia arranca ahí y deja afuera las importaciones en ráfaga. null =
   *  sin señal (la tendencia cae a su regla de densidad). */
  desdeOperativo: string | null;
  /** OPs en estado pendiente. null = módulo contaduría apagado. */
  opPendientes: PilaFinanciera | null;
  /** Movimientos de caja sin conciliar. null = no se pidió (contaduría ON). */
  conciliacion: PilaFinanciera | null;
  /** null = módulo sueldos apagado. */
  nomina: NominaResumen | null;
  cargando: boolean;
}

/** Lo que recibe CADA sección: los hooks de todos los dominios montados. */
export interface DatosDashboard {
  reclamos: DatosReclamos;
  tramites: DatosTramites;
  finanzas: DatosFinanzas;
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
  /**
   * Estado efectivo de un módulo del muni (semántica `moduloEfectivo`).
   *
   * Las secciones lo usan SÓLO para elegir de su POOL —la 5.ª tarjeta
   * financiera es "OP por autorizar" o "conciliación pendiente" según
   * contaduría—, nunca para esconderse: si una sección entera depende de un
   * módulo, eso se declara en `requiere` del registry y se resuelve una vez.
   */
  esActivo: (modulo: string) => boolean;
}

/** Props de toda sección del dashboard. */
export interface SeccionProps {
  datos: DatosDashboard;
  ctx: DashboardCtx;
}
