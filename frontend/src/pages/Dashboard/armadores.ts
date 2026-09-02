/**
 * Armadores del Dashboard — la inteligencia de copy y de derivados vive acá,
 * no en el JSX de las secciones (las piezas del kit son BOBAS: el padre
 * declara qué decir y con qué veredicto).
 *
 *  - `buildCintaTramos`: la cinta de conteos (un tramo por dominio activo).
 *  - `construirFrasesHero`: las frases del SemanticHero.
 *
 * TODO sale de datos reales del backend. JAMÁS se inventan series ni
 * porcentajes.
 *
 * REGLA DEL CERO (principio 3 del diseño, no negociable): un cero no se
 * enuncia NUNCA. O el copy pivotea a lo que sí hubo ("Hoy todavía no entró
 * ninguno nuevo") o el segmento —o la frase entera, si se quedó sin datos—
 * se OMITE. Toda rama nueva de este archivo se escribe ya con las tres
 * variantes gramaticales resueltas: cero, uno y muchos.
 */
import type { DashboardStats } from '../../types';
import { seg, type HeroFrase, type HeroSegmento } from '../../lib/semanticHero';
import {
  resolverUmbrales,
  veredictoMasEsPeor,
  veredictoTasa,
  veredictoMenosEsMejor,
} from '../../lib/veredictos';
import type { CalifEstadisticas, CoberturaResumen, DominioDatos, MetricasAccion } from './tipos';

/** Una frase del carrusel con el dominio del que habla. El orquestador las
 *  ordena por actividad: la frase del dominio más movido abre el carrusel. */
export interface FraseDominio {
  dominio: DominioDatos;
  frase: HeroFrase;
}

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

/**
 * ¿Hay al menos un cierre con DURACIÓN MEDIDA?
 *
 * `tiempo_promedio_dias` viene de un AVG(DATEDIFF(...)) que el backend
 * degrada a 0 cuando no hay filas, así que un 0 puede significar dos cosas
 * opuestas: "cerró todo el mismo día" o "no cerró nada / los cierres no
 * tienen fecha de resolución". Contar estados cerrados NO alcanza — San
 * Pedro Norte tiene solicitudes en 'finalizado' con `fecha_resolucion` en
 * NULL, o sea cerradas pero sin duración.
 *
 * El único testigo confiable es `tiempo_resolucion_30d`, que el backend
 * devuelve null (no 0) cuando no pudo promediar nada. Con eso, decir
 * "resolvés en el día" deja de ser una suposición.
 */
const hayResolucionMedida = (s: DashboardStats): boolean =>
  s.tiempo_promedio_dias > 0 || (s.tendencias?.tiempo_resolucion_30d ?? null) !== null;

// ------------------------------------------------------- cinta de conteos

/** Un conteo de la cinta: prosa + número. El número va aparte porque se pinta
 *  distinto (texto fuerte, cifras de ancho fijo). Sin `valor` el segmento es
 *  pura prosa ("resolvés en el día"). */
export interface CintaSegmento {
  id: string;
  /** Texto ANTES del número (ej. "resolvés en"). */
  pre?: string;
  /** El número, ya formateado en es-AR. */
  valor?: string;
  /** Texto DESPUÉS del número (ej. "en total", "días"). */
  post?: string;
}

/** Un tramo = un dominio de la cinta (reclamos, trámites, …). */
export interface CintaTramo {
  id: string;
  /** Lo que dice el chip del dominio. */
  etiqueta: string;
  tono: 'accent' | 'blue';
  segmentos: CintaSegmento[];
  accion: { label: string; to: string };
}

/**
 * Los conteos crudos de UN dominio, con la regla del cero aplicada segmento
 * por segmento: lo que vale 0 no se dibuja.
 *
 * Devuelve null cuando el dominio no tiene datos (módulo apagado → `stats`
 * null; nunca cargó nada → total 0). Un dominio en cero no tiene tramo: el
 * chip solo, seguido de nada, no informa — molesta.
 */
const tramoDeConteos = (opts: {
  id: string;
  etiqueta: string;
  tono: 'accent' | 'blue';
  stats: DashboardStats | null;
  to: string;
}): CintaTramo | null => {
  const s = opts.stats;
  if (!s || s.total <= 0) return null;

  const segmentos: CintaSegmento[] = [
    { id: 'total', valor: s.total.toLocaleString('es-AR'), post: 'en total' },
  ];
  if (s.hoy > 0) segmentos.push({ id: 'hoy', valor: s.hoy.toLocaleString('es-AR'), post: 'hoy' });
  if (s.semana > 0) {
    segmentos.push({ id: 'semana', valor: s.semana.toLocaleString('es-AR'), post: 'esta semana' });
  }

  // Resolución promedio. Sin cierres medidos el segmento no existe: nada de
  // "resolvés en 0 días" ni de suponer el día cuando el 0 sólo significa que
  // no hay dato.
  if (hayResolucionMedida(s)) {
    const dias = s.tiempo_promedio_dias;
    segmentos.push(
      dias < 1
        ? { id: 'resolucion', post: 'resolvés en el día' }
        : {
            id: 'resolucion',
            pre: 'resolvés en',
            valor: fmtDias(dias),
            post: dias === 1 ? 'día' : 'días',
          },
    );
  }

  return {
    id: opts.id,
    etiqueta: opts.etiqueta,
    tono: opts.tono,
    segmentos,
    accion: { label: 'Ver todos', to: opts.to },
  };
};

/** La cinta completa: un tramo por dominio con datos, en orden canónico. */
export function buildCintaTramos(opts: {
  reclamos: DashboardStats | null;
  tramites: DashboardStats | null;
}): CintaTramo[] {
  return [
    tramoDeConteos({
      id: 'reclamos',
      etiqueta: 'Reclamos',
      tono: 'accent',
      stats: opts.reclamos,
      to: '/gestion/reclamos',
    }),
    tramoDeConteos({
      id: 'tramites',
      etiqueta: 'Trámites',
      tono: 'blue',
      stats: opts.tramites,
      to: '/gestion/tramites',
    }),
  ].filter((t): t is CintaTramo => t !== null);
}

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
}): FraseDominio[] {
  const { stats, metricasAccion, coberturaResumen, califStats, tramitesStats } = opts;
  const u = resolverUmbrales();
  const frases: FraseDominio[] = [];

  // (a) El estado del UNIVERSO de reclamos: cuántos son, cuántos resolvimos y
  // qué queda. El día es la coda, no el titular.
  //
  // Antes esta frase abría con "Hoy entraron N reclamos nuevos": un día sin
  // ingresos la dejaba en "Hoy entraron 0 reclamos nuevos" — mal dicho (un
  // cero no se enuncia así) y encima midiendo lo que menos importa. Un
  // tablero de gestión habla de lo que tiene para resolver, no del reloj: el
  // universo está SIEMPRE, el día puede estar vacío sin que eso sea noticia.
  //
  // La puntuación va PEGADA al principio del segmento siguiente (". Quedan ",
  // "; ") y nunca sola: los segmentos con veredicto son fichas inline-block y,
  // al partir el renglón en mobile, un "." suelto abría la línea siguiente.
  if (stats && metricasAccion && stats.total > 0) {
    const esperando = metricasAccion.esperando_visto_bueno ?? 0;
    const abiertos = contarAbiertos(stats);
    const enCurso = stats.por_estado?.en_curso ?? 0;
    // "Por atender" = abiertos que todavía nadie empezó. Nunca negativo, por
    // si el backend cuenta algún estado que no está en el mapa.
    const porAtender = Math.max(abiertos - enCurso, 0);
    const cerrados = Math.max(stats.total - abiertos, 0);
    const tasa = Math.round((cerrados / stats.total) * 100);

    const segmentos: HeroSegmento[] = [
      seg('Tenemos '),
      seg(`${stats.total} ${stats.total === 1 ? 'reclamo' : 'reclamos'}`),
    ];
    // Sin un solo cierre, "resolvimos el 0%" es el cero enunciado de manual:
    // se dice lo que pasó, no el número que no hubo.
    if (cerrados > 0) {
      segmentos.push(seg(' y resolvimos el '), seg(`${tasa}%`, veredictoTasa(tasa, u.tasaResolucion)));
    } else {
      segmentos.push(seg(' y todavía no cerramos ninguno'));
    }

    // Lo que queda abierto. Cada mitad se enuncia sólo si existe, y si no
    // existe ninguna la cláusula entera se va (no hay "Quedan 0 por atender
    // y 0 en proceso").
    const hayAbiertos = porAtender > 0 || enCurso > 0;
    if (porAtender > 0 && enCurso > 0) {
      segmentos.push(
        seg('. Quedan '),
        seg(`${porAtender} por atender`, veredictoMasEsPeor(porAtender, u.sinAsignar)),
        seg(' y '),
        seg(`${enCurso} en proceso`),
      );
    } else if (porAtender > 0) {
      segmentos.push(
        seg(porAtender === 1 ? '. Queda ' : '. Quedan '),
        seg(`${porAtender} por atender`, veredictoMasEsPeor(porAtender, u.sinAsignar)),
      );
    } else if (enCurso > 0) {
      segmentos.push(seg('. Hay '), seg(`${enCurso} en proceso`));
    }

    // Cola real del supervisor: cuanto más alta, peor. En 0 el segmento NO se
    // dice — que la cola esté vacía es buena noticia, pero se cuenta callándola
    // ("0 esperan tu visto bueno" era el cero enunciado que reportó el dueño).
    // Se engancha con punto y coma si hubo cláusula previa; si no, abre oración.
    if (esperando > 0) {
      segmentos.push(
        seg(hayAbiertos ? '; ' : '. '),
        seg(
          `${esperando} ${esperando === 1 ? 'espera' : 'esperan'} tu visto bueno`,
          veredictoMasEsPeor(esperando, u.sinAsignar),
        ),
      );
    }

    // El día, dicho como se dice: sin ingresos no se enuncia un cero.
    segmentos.push(
      seg('. '),
      seg(
        stats.hoy === 0
          ? 'Hoy todavía no entró ninguno nuevo.'
          : stats.hoy === 1
            ? 'Hoy entró 1 nuevo.'
            : `Hoy entraron ${stats.hoy} nuevos.`,
        stats.hoy > 0 ? 'bueno' : undefined,
      ),
    );

    frases.push({
      dominio: 'reclamos',
      frase: {
        segmentos,
        acciones: [
          { label: 'Ver reclamos', to: '/gestion/reclamos', primaria: true },
          ...(esperando > 0
            ? [{ label: `Cerrar los ${esperando}`, to: '/gestion/reclamos?estado=pendiente_confirmacion' }]
            : []),
        ],
      },
    });
  }

  // (b) El día en trámites: mismo formato que reclamos, otro módulo.
  // Sin ingresos hoy Y sin nada en curso no hay frase: antes decía "En
  // trámites entraron 0 gestiones hoy, con 0 en curso sobre el mostrador",
  // que es la regla del cero rota dos veces en el mismo renglón.
  if (tramitesStats) {
    const abiertos = contarAbiertos(tramitesStats);
    const hoy = tramitesStats.hoy;
    if (hoy > 0 || abiertos > 0) {
      const segmentos: HeroSegmento[] = [];
      if (hoy > 0) {
        segmentos.push(
          seg(hoy === 1 ? 'En trámites entró ' : 'En trámites entraron '),
          seg(`${hoy} ${hoy === 1 ? 'gestión' : 'gestiones'} hoy`, 'bueno'),
        );
        if (abiertos > 0) {
          segmentos.push(
            seg(', con '),
            seg(`${abiertos} en curso`, veredictoMasEsPeor(abiertos, u.sinAsignar)),
            seg(' sobre el mostrador.'),
          );
        } else {
          segmentos.push(seg('.'));
        }
      } else {
        segmentos.push(
          seg('En trámites no entró ninguna gestión hoy; hay '),
          seg(`${abiertos} en curso`, veredictoMasEsPeor(abiertos, u.sinAsignar)),
          seg(' sobre el mostrador.'),
        );
      }
      frases.push({
        dominio: 'tramites',
        frase: {
          segmentos,
          acciones: [{ label: 'Ver trámites', to: '/gestion/tramites', primaria: true }],
        },
      });
    }
  }

  // (c) Salud de la gestión: tasa de resolución global + tiempo promedio.
  // Con tasa 0 (nada cerrado todavía) no hay salud que describir: la frase no
  // existe en vez de anunciar "Resolvés el 0% de los reclamos".
  if (stats && coberturaResumen && coberturaResumen.tasa_resolucion_global > 0) {
    const dias = stats.tiempo_promedio_dias;
    frases.push({
      dominio: 'reclamos',
      frase: {
      segmentos: [
        seg('Resolvés el '),
        seg(
          `${coberturaResumen.tasa_resolucion_global}%`,
          veredictoTasa(coberturaResumen.tasa_resolucion_global, u.tasaResolucion),
        ),
        // El promedio se dice sólo si está MEDIDO. Venía como "0 días" (el
        // backend promedia DATEDIFF, que en el mismo día da 0) y sin cierres
        // fechados ese 0 ni siquiera es un promedio: ahí la frase se corta
        // en el porcentaje, que es dato duro.
        ...(!hayResolucionMedida(stats)
          ? [seg(' de los reclamos.')]
          : dias >= 1
            ? [
                seg(' de los reclamos, con un promedio de '),
                seg(
                  `${fmtDias(dias)} ${dias === 1 ? 'día' : 'días'}`,
                  veredictoMenosEsMejor(dias, u.tiempoResolucionDias),
                ),
                seg(' por caso.'),
              ]
            : [
                // "menos de un día" y no "casi todo se cierra en el día": el
                // promedio no dice cómo se reparten los casos, y no vamos a
                // inferir una distribución de una media.
                seg(' de los reclamos, con un promedio de '),
                seg('menos de un día', 'bueno'),
                seg(' por caso.'),
              ]),
      ],
      acciones: [{ label: 'Ver SLA', to: '/gestion/sla' }],
      },
    });
  }

  // (d) La voz del vecino: calificación promedio. La nota SÍ es un juicio,
  // así que va con veredicto — antes salía en negro como si fuera un dato
  // neutro más.
  if (califStats && califStats.total_calificaciones > 0) {
    const nota = califStats.promedio_general;
    frases.push({
      dominio: 'reclamos',
      frase: {
      segmentos: [
        seg('Los vecinos califican la gestión con '),
        seg(`${nota.toFixed(1)} de 5`, veredictoTasa((nota / 5) * 100, u.tasaResolucion)),
        seg(
          ` sobre ${califStats.total_calificaciones} ${califStats.total_calificaciones === 1 ? 'calificación' : 'calificaciones'}.`,
        ),
      ],
      acciones: [{ label: 'Ver la voz del vecino', to: '/gestion/calificaciones', primaria: true }],
      },
    });
  }

  return frases;
}
