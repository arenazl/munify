/**
 * Tipos del módulo Obras que comparten la pantalla de detalle y las piezas del kit.
 * Espejan `backend/schemas/obra.py` (ObraDetalle y sus partes).
 */
import type { Veredicto } from './semanticHero';

export type SituacionEtapa = 'por_empezar' | 'por_empezar_atrasada' | 'en_ritmo' | 'lenta' | 'cara' | 'parada' | 'terminada';

export interface RelojDato {
  pct: number | null;
  valor: string;
  sub?: string | null;
  veredicto?: Veredicto;
}

export interface TresRelojesDato {
  tiempo: RelojDato;
  hecho: RelojDato;
  plata: RelojDato;
  lectura: string;
}

export interface ProyeccionObra {
  fin_previsto?: string | null;
  fin_proyectado?: string | null;
  desvio_dias?: number | null;
  costo_proyectado?: string | null;
  desvio_plata?: string | null;
  base: string;
}

export interface PendienteObra {
  tipo: 'sin_etapa' | 'vencidos_sin_pagar' | 'etapa_vencida' | 'etapa_parada' | 'sin_etapas' | 'sin_presupuesto' | 'sin_avance' | string;
  titulo: string;
  detalle: string;
  n: number;
  monto: string;
  etapa_id?: number | null;
  veredicto: Veredicto;
}

export interface PuntoCurva { fecha: string; real: string; prevista?: string | null; programado: boolean }
export interface PuntoFisico { fecha: string; pct: number; etiqueta: string }

export interface GenteEtapa { ordenes_trabajo: number; horas: number; cuadrillas: string[] }

export interface EtapaObra {
  id: number; orden: number; nombre: string; descripcion?: string | null; incidencia_pct: string; avance_pct: number; estado: string;
  fecha_inicio_prevista?: string | null; fecha_fin_prevista?: string | null; fecha_inicio_real?: string | null; fecha_fin_real?: string | null;
  monto_previsto?: string | null; ejecutado: string; programado: string; n_gastos: number;
  contratista: string; materiales: string; mano_de_obra: string; otros: string;
  monto_previsto_efectivo?: string | null; pct_plata?: number | null; plazo_dias?: number | null; dias_llevados?: number | null; pct_tiempo?: number | null;
  desvio_inicio_dias?: number | null; desvio_fin_dias?: number | null; dias_sin_gastos?: number | null; ultimo_gasto?: string | null;
  situacion: SituacionEtapa; veredicto: Veredicto; frase: string; arrastre?: string | null; gente: GenteEtapa;
}

export interface GastoObra {
  imputacion_id: number; gasto_id: number; fecha: string; monto: string; monto_gasto: string; concepto: string; descripcion?: string | null;
  destino?: { id: number; nombre: string; tipo?: string | null } | null; rubro: string; estado_pago?: string | null;
  etapa_id?: number | null; origen: string; etapa_propuesta_id?: number | null;
}

export interface DetalleObra {
  id: number;
  obra: {
    nombre: string; descripcion?: string | null; tipo: string; tipo_obra?: string | null; modalidad?: string | null; expediente?: string | null;
    fuente_financiamiento?: string | null; monto_contrato?: string | null; presupuesto?: string | null; plazo_dias?: number | null;
    fecha_inicio?: string | null; fecha_fin?: string | null; fecha_inicio_real?: string | null; fecha_fin_real?: string | null;
    estado: string; estado_obra?: string | null; avance?: number | null; publico: boolean; mostrar_monto: boolean;
  };
  contratista?: { id: number; nombre: string } | null;
  inspector?: { id: number; nombre: string } | null;
  barrio?: string | null;
  kpis: { presupuesto_vigente?: string | null; ejecutado: string; comprometido: string; programado: string; avance?: number | null; pct_plata?: number | null; atraso_dias: number; sin_etapa: number; veredicto: Veredicto };
  frase: string;
  relojes?: TresRelojesDato | null;
  proyeccion: ProyeccionObra;
  pendientes: PendienteObra[];
  curva: PuntoCurva[];
  fisico: PuntoFisico[];
  etapas: EtapaObra[];
  gastos: GastoObra[];
  proveedores: { persona: { id: number; nombre: string; tipo?: string | null }; n_gastos: number; total: string }[];
  mes_a_mes: { mes: string; monto: string; acumulado: string; programado: boolean }[];
  gente: { ordenes_trabajo: number; horas: number; cuadrillas: string[]; personas_ot: string[]; sueldos_personas: number; sueldos_total: string };
  linea_desde?: string | null; linea_hasta?: string | null;
}

export const SITUACION_LABEL: Record<SituacionEtapa, string> = {
  por_empezar: 'por empezar',
  por_empezar_atrasada: 'tenía que haber empezado',
  en_ritmo: 'en ritmo',
  lenta: 'lenta',
  cara: 'cara',
  parada: 'parada',
  terminada: 'terminada',
};

export const RUBRO_LABEL: Record<string, string> = { contratista: 'contratista', materiales: 'materiales', mano_de_obra: 'mano de obra', otros: 'otros' };

/** Colores por rubro: tokens del tema, distinguibles entre sí (el dueño no distinguía dos azules). */
// `--pl-green` es el acento del municipio (en SPN es azul), así que no sirve para distinguir rubros.
export const RUBRO_COLOR: Record<string, string> = {
  contratista: 'var(--pl-purple, #8b5cf6)',
  materiales: 'var(--pl-sky, #0ea5e9)',
  mano_de_obra: 'var(--pl-emerald, #10b981)',
  otros: 'var(--pl-amber-strong)',
};

/** Las horas vienen de sumar floats: 151.89999999999998 no es un dato, es ruido. */
export const fmtHoras = (n: number) => `${Math.round((n + Number.EPSILON) * 10) / 10}`.replace('.', ',');

export const fechaCorta = (iso?: string | null) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '—';
