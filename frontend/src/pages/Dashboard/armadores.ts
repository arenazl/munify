/**
 * Armadores del Dashboard — la inteligencia de copy y de derivados vive acá,
 * no en el JSX de las secciones (las piezas del kit son BOBAS: el padre
 * declara qué decir y con qué veredicto).
 *
 * Salió del monolito `pages/Dashboard.tsx` sin cambiar una coma del copy:
 *  - `buildKpisPeriodo`: las dos filas de KpiCardV2 (reclamos / trámites).
 *  - `construirFrasesHero`: las frases del SemanticHero.
 * TODO sale de datos reales del backend; los deltas se calculan contra los
 * períodos previos y, si falta la base de comparación, se degrada a un
 * subtexto informativo. JAMÁS se inventan series ni porcentajes.
 */
import { Inbox, CalendarDays, Clock, type LucideIcon } from 'lucide-react';
import type { DashboardStats } from '../../types';
import type { KpiCardV2Props } from '../../components/dashboard/KpiCardV2';
import { seg, type HeroFrase } from '../../lib/semanticHero';
import {
  resolverUmbrales,
  veredictoMasEsPeor,
  veredictoTasa,
  veredictoMenosEsMejor,
} from '../../lib/veredictos';
import type { CalifEstadisticas, CoberturaResumen, MetricasAccion } from './tipos';

// Estados que NO cuentan como "abiertos" para el strip del hero.
// Patrón resiliente: cualquier estado desconocido cuenta como abierto.
const ESTADOS_CERRADOS = new Set(['finalizado', 'rechazado', 'resuelto']);

export const contarAbiertos = (s: DashboardStats | null): number =>
  s
    ? Object.entries(s.por_estado || {}).reduce(
        (acc, [estado, n]) => (ESTADOS_CERRADOS.has(estado) ? acc : acc + (n as number)),
        0,
      )
    : 0;

export const fmtDias = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/** % de variación redondeado; null si no hay base de comparación. */
const pctDelta = (actual: number, prev: number): number | null =>
  prev > 0 ? Math.round(((actual - prev) / prev) * 100) : null;

/** Suma la serie diaria en bloques semanales (de más viejo a más nuevo). */
const seriePorSemana = (diaria: number[]): number[] => {
  const semanas: number[] = [];
  for (let i = diaria.length; i > 0; i -= 7) {
    semanas.unshift(diaria.slice(Math.max(0, i - 7), i).reduce((a, b) => a + b, 0));
  }
  return semanas;
};

export const buildKpisPeriodo = (opts: {
  stats: DashboardStats;
  etiquetaTotal: string;
  /** Icono del total — lo único que cambia entre reclamos y trámites. */
  iconoTotal: LucideIcon;
  /** Serie diaria real de ingresos (ej: tendencia 30 días de reclamos). */
  serieDiaria?: number[];
  color: string;
  colorNeutro: string;
  msgSinCierres: string;
}): KpiCardV2Props[] => {
  const s = opts.stats;
  const t = s.tendencias;
  const diaria = opts.serieDiaria && opts.serieDiaria.length >= 2 ? opts.serieDiaria : null;
  const colorear = (card: KpiCardV2Props): KpiCardV2Props => ({
    ...card,
    serieColor: card.atenuado ? opts.colorNeutro : opts.color,
  });

  const pctMes = t ? pctDelta(t.creados_30d, t.creados_30d_prev) : null;
  const total: KpiCardV2Props = {
    eyebrow: opts.etiquetaTotal,
    icono: opts.iconoTotal,
    valor: s.total,
    atenuado: s.total === 0,
    serie: diaria ?? (t ? [t.creados_30d_prev, t.creados_30d] : undefined),
    delta: pctMes != null && pctMes !== 0
      ? {
          texto: `${Math.abs(pctMes)}%`,
          direccion: pctMes > 0 ? 'sube' : 'baja',
          veredicto: pctMes > 0 ? 'advertencia' : 'bueno',
        }
      : null,
    sub: pctMes != null
      ? (pctMes === 0
          ? 'igual que el mes pasado'
          : pctMes > 0 ? 'más que el mes pasado' : 'menos que el mes pasado')
      : t ? `${t.creados_30d} en los últimos 30 días` : undefined,
  };

  const nuevosHoy: KpiCardV2Props = {
    eyebrow: 'Nuevos hoy',
    icono: Inbox,
    valor: s.hoy,
    atenuado: s.hoy === 0,
    serie: diaria ? diaria.slice(-7) : (t ? [t.ayer, s.hoy] : undefined),
    sub: t ? (t.ayer === 1 ? 'Ayer entró 1' : `Ayer entraron ${t.ayer}`) : undefined,
  };

  const pctSemana = t ? pctDelta(s.semana, t.semana_pasada) : null;
  const estaSemana: KpiCardV2Props = {
    eyebrow: 'Esta semana',
    icono: CalendarDays,
    valor: s.semana,
    atenuado: s.semana === 0,
    serie: diaria ? seriePorSemana(diaria) : (t ? [t.semana_pasada, s.semana] : undefined),
    delta: pctSemana != null && pctSemana !== 0
      ? {
          texto: `${Math.abs(pctSemana)}%`,
          direccion: pctSemana > 0 ? 'sube' : 'baja',
          veredicto: pctSemana > 0 ? 'advertencia' : 'bueno',
        }
      : null,
    sub: pctSemana != null
      ? (pctSemana === 0 ? 'igual que la semana anterior' : 'vs. semana anterior')
      : t ? `Semana pasada: ${t.semana_pasada}` : undefined,
  };

  const t30 = t?.tiempo_resolucion_30d ?? null;
  const t30prev = t?.tiempo_resolucion_30d_prev ?? null;
  const diffDias = t30 != null && t30prev != null ? t30prev - t30 : null; // >0 = más rápido
  // Serie semanal real de tiempo de resolución. Las semanas sin cierres vienen
  // null: se descartan en vez de dibujarlas como 0 (un 0 se leería como
  // "resolvimos todo en el día"). Con menos de 3 puntos no hay tendencia que
  // mostrar y se deja sin serie.
  const serieResolucionCruda = (t?.serie_resolucion_semanal ?? []).filter(
    (v): v is number => typeof v === 'number',
  );
  const serieResolucion = serieResolucionCruda.length >= 3 ? serieResolucionCruda : null;
  const resolucion: KpiCardV2Props = {
    eyebrow: 'Resolución promedio',
    icono: Clock,
    valor: t30 != null ? fmtDias(t30) : '—',
    unidad: t30 != null ? 'días' : undefined,
    atenuado: t30 == null,
    // Serie REAL semana a semana. Antes eran dos puntos (mes actual vs. mes
    // previo): una recta entre dos valores, que parecía un gráfico sin mostrar
    // ninguna tendencia. Si el backend todavía no la manda, se cae al par de
    // siempre; jamás se inventa la serie.
    serie: serieResolucion ?? (t30 != null && t30prev != null ? [t30prev, t30] : undefined),
    delta: diffDias != null && Math.abs(diffDias) >= 0.1
      ? {
          texto: `${fmtDias(Math.abs(diffDias))} d`,
          direccion: diffDias > 0 ? 'baja' : 'sube',
          veredicto: diffDias > 0 ? 'bueno' : 'malo',
        }
      : null,
    sub: t30 == null
      ? opts.msgSinCierres
      : diffDias == null
        ? 'sin base del mes anterior'
        : Math.abs(diffDias) >= 0.1
          ? (diffDias > 0 ? 'más rápido que el mes pasado' : 'más lento que el mes pasado')
          : 'igual que el mes pasado',
  };

  return [total, nuevosHoy, estaSemana, resolucion].map(colorear);
};

/**
 * Frases del hero semántico — solo con datos YA cargados (sin datos, sin
 * frase). Un dominio con su módulo apagado nunca tiene datos, así que su
 * frase no existe: el gating sale solo, sin ifs de módulo acá.
 */
export function construirFrasesHero(opts: {
  stats: DashboardStats | null;
  metricasAccion: MetricasAccion | null;
  coberturaResumen: CoberturaResumen | null;
  califStats: CalifEstadisticas | null;
  tramitesStats: DashboardStats | null;
}): HeroFrase[] {
  const { stats, metricasAccion, coberturaResumen, califStats, tramitesStats } = opts;
  const u = resolverUmbrales();
  const frases: HeroFrase[] = [];

  // (a) El estado del UNIVERSO de reclamos: cuántos son, cuántos resolvimos y
  // qué queda. El día es la coda, no el titular.
  //
  // Antes esta frase abría con "Hoy entraron N reclamos nuevos": un día sin
  // ingresos la dejaba en "Hoy entraron 0 reclamos nuevos" — mal dicho (un
  // cero no se enuncia así) y encima midiendo lo que menos importa. Un
  // tablero de gestión habla de lo que tiene para resolver, no del reloj: el
  // universo está SIEMPRE, el día puede estar vacío sin que eso sea noticia.
  if (stats && metricasAccion) {
    const esperando = metricasAccion.esperando_visto_bueno ?? 0;
    const abiertos = contarAbiertos(stats);
    const enCurso = stats.por_estado?.en_curso ?? 0;
    // "Por atender" = abiertos que todavía nadie empezó. Nunca negativo, por
    // si el backend cuenta algún estado que no está en el mapa.
    const porAtender = Math.max(abiertos - enCurso, 0);
    const cerrados = Math.max(stats.total - abiertos, 0);
    const tasa = stats.total > 0 ? Math.round((cerrados / stats.total) * 100) : 0;
    frases.push({
      segmentos: [
        seg('Tenemos '),
        seg(`${stats.total} ${stats.total === 1 ? 'reclamo' : 'reclamos'}`),
        seg(' y resolvimos el '),
        seg(`${tasa}%`, veredictoTasa(tasa, u.tasaResolucion)),
        seg('. Quedan '),
        seg(`${porAtender} por atender`, veredictoMasEsPeor(porAtender, u.sinAsignar)),
        seg(' y '),
        seg(`${enCurso} en proceso`),
        seg('; '),
        // Cola real del supervisor: cuanto más alta, peor (un 0 sí es bueno).
        seg(
          `${esperando} ${esperando === 1 ? 'espera' : 'esperan'} tu visto bueno`,
          veredictoMasEsPeor(esperando, u.sinAsignar),
        ),
        // El punto pegado al segmento previo y la coda con el espacio
        // adelante: al partir el renglón en mobile, si no, el "." quedaba
        // solo abriendo la línea siguiente.
        seg('. '),
        // El día, dicho como se dice: sin ingresos no se enuncia un cero.
        seg(
          stats.hoy > 0
            ? `Hoy entraron ${stats.hoy} ${stats.hoy === 1 ? 'nuevo' : 'nuevos'}.`
            : 'Hoy todavía no entró ninguno nuevo.',
          stats.hoy > 0 ? 'bueno' : undefined,
        ),
      ],
      acciones: [
        { label: 'Ver reclamos', to: '/gestion/reclamos', primaria: true },
        ...(esperando > 0
          ? [{ label: `Cerrar los ${esperando}`, to: '/gestion/reclamos?estado=pendiente_confirmacion' }]
          : []),
      ],
    });
  }

  // (b) El día en trámites: mismo formato que reclamos, otro módulo.
  if (tramitesStats) {
    const abiertos = contarAbiertos(tramitesStats);
    frases.push({
      segmentos: [
        seg('En trámites entraron '),
        seg(
          `${tramitesStats.hoy} ${tramitesStats.hoy === 1 ? 'gestión' : 'gestiones'} hoy`,
          tramitesStats.hoy > 0 ? 'bueno' : undefined,
        ),
        seg(', con '),
        seg(`${abiertos} en curso`, veredictoMasEsPeor(abiertos, u.sinAsignar)),
        seg(' sobre el mostrador.'),
      ],
      acciones: [{ label: 'Ver trámites', to: '/gestion/tramites', primaria: true }],
    });
  }

  // (b) Salud de la gestión: tasa de resolución global + tiempo promedio
  if (stats && coberturaResumen) {
    frases.push({
      segmentos: [
        seg('Resolvés el '),
        seg(
          `${coberturaResumen.tasa_resolucion_global}%`,
          veredictoTasa(coberturaResumen.tasa_resolucion_global, u.tasaResolucion),
        ),
        seg(' de los reclamos, con un promedio de '),
        seg(
          `${stats.tiempo_promedio_dias} días`,
          veredictoMenosEsMejor(stats.tiempo_promedio_dias, u.tiempoResolucionDias),
        ),
        seg(' por caso.'),
      ],
      acciones: [{ label: 'Ver SLA', to: '/gestion/sla' }],
    });
  }

  // (d) La voz del vecino: calificación promedio. La nota SÍ es un juicio,
  // así que va con veredicto — antes salía en negro como si fuera un dato
  // neutro más.
  if (califStats && califStats.total_calificaciones > 0) {
    const nota = califStats.promedio_general;
    frases.push({
      segmentos: [
        seg('Los vecinos califican la gestión con '),
        seg(`${nota.toFixed(1)} de 5`, veredictoTasa((nota / 5) * 100, u.tasaResolucion)),
        seg(
          ` sobre ${califStats.total_calificaciones} ${califStats.total_calificaciones === 1 ? 'calificación' : 'calificaciones'}.`,
        ),
      ],
      acciones: [{ label: 'Ver la voz del vecino', to: '/gestion/calificaciones', primaria: true }],
    });
  }

  return frases;
}
