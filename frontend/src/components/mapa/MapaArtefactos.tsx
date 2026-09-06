/**
 * MapaArtefactos — las lecturas del mapa, en el MISMO componente que el resto
 * de la app.
 *
 * Antes esto tenía su propia `Tarjeta`: una card de dos caras hecha a mano, con
 * su CSS propio, su chip y su "Ver más". Una copia peor de algo que ya existía.
 * El dueño lo cortó (2026-09-05): *"todo debería ser componentizable, debería
 * usar ese componente y no crear uno parecido y mal copiado"*. Tenía razón:
 * `KpiSemantico` es LA card de pregunta en prosa del kit — la que usan el
 * tablero de trámites, el de finanzas y el de reclamos. Mismo ícono en su
 * cuadrito, mismas fuentes, mismos tamaños, misma distribución.
 *
 * Este archivo queda como lo que debió ser siempre: un ARMADOR. Calcula las
 * preguntas del mapa y su gramática; el dibujo lo pone el kit. Es el mismo
 * reparto que ya usa el tablero (`armadoresTramites.ts` + `KpiSemantico`).
 *
 * Las cinco preguntas, en orden de lo que primero hay que saber:
 *
 *   1. La de la LENTE — cambia con el chip de arriba. Es el RESUMEN, y por eso
 *      va primera.
 *   2. POR QUÉ NO AVANZA — el motivo que traba, con sus días. La única
 *      accionable: si son materiales la acción es compras, si es personal es
 *      dotación.
 *   3. QUIÉN NO ESTÁ RESPONDIENDO — la cola vieja de cada área contra SU PROPIO
 *      promedio de cierre.
 *   4. Qué es lo que más preocupa (la categoría que pesa).
 *   5. Cómo viene la entrada, por semana.
 *
 * Sin material, la pregunta NO se dibuja. Una card que dice "no hay datos"
 * ocupa el lugar de una que sí tiene algo para decir.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { Flame, PauseCircle, Clock, Tags, TrendingUp, type LucideIcon } from 'lucide-react';
import { KpiSemantico, type TonoKpi } from '../ui/KpiSemantico';
import type { Reclamo } from '../../types';
import type { RankedListItem } from '../ui/RankedList';

interface RankingLente {
  titulo: string;
  caption: string;
  tono: 'malo' | 'bueno' | 'advertencia';
  vacio: string;
  items: RankedListItem[];
}

interface Props {
  /** La lente activa ('repiten' | 'atrasado' | 'resolvimos' | 'sinllegar'). */
  pregunta: string;
  /** El paquete por lente que ya arma la página. */
  ranking: RankingLente;
  /** El recorte actual del mapa (ya filtrado). */
  reclamos: Reclamo[];
}

/** Lo que necesita `KpiSemantico`. Su API tal cual: acá no se agrega un campo. */
interface Pregunta {
  id: string;
  pregunta: string;
  icono: LucideIcon;
  tono: TonoKpi;
  valor: string;
  unidad?: string;
  detalle: ReactNode;
  pie?: string;
}

const PREGUNTA_LENTE: Record<string, string> = {
  repiten: '¿Dónde más se repite?',
  atrasado: '¿Quiénes esperan más?',
  resolvimos: '¿Qué resolvimos más rápido?',
  sinllegar: '¿Dónde no llegamos?',
};

const ICONO_LENTE: Record<string, LucideIcon> = {
  repiten: Flame,
  atrasado: Clock,
  resolvimos: Clock,
  sinllegar: Tags,
};

/** Cómo se dice cada motivo de pausa. El enum viaja en código y eso no se le
 *  muestra a nadie: la frase corta encabeza, la larga arma la prosa. */
const MOTIVO_LABEL: Record<string, string> = {
  materiales: 'Materiales',
  presupuesto: 'Presupuesto',
  personal: 'Personal',
  tercero: 'Un tercero',
  otra_obra: 'Otra obra',
  clima: 'Clima',
  sin_acceso: 'Sin acceso',
  otro: 'Otro motivo',
};
const MOTIVO_FRASE: Record<string, string> = {
  materiales: 'es falta de materiales',
  presupuesto: 'espera una licitación',
  personal: 'es falta de cuadrilla',
  tercero: 'depende de un tercero',
  otra_obra: 'espera otra obra',
  clima: 'es el clima',
  sin_acceso: 'es no poder entrar',
  otro: 'son otros motivos',
};

/** Estados que siguen abiertos. Lo mismo que considera el resto de la app. */
const ABIERTOS = new Set([
  'nuevo', 'recibido', 'asignado', 'en_proceso', 'en_curso',
  'pendiente_confirmacion', 'pospuesto',
]);

const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANAS = 12;

const diasDesde = (iso?: string | null): number =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DIA_MS) : 0;

const plural = (n: number, uno: string, muchos: string) => (n === 1 ? uno : muchos);

export default function MapaArtefactos({ pregunta, ranking, reclamos }: Props) {
  // ---------- 1. LA LENTE: el resumen de lo que se está mirando ----------
  const qLente = useMemo<Pregunta | null>(() => {
    const [top, segundo] = ranking.items;
    if (!top) return null;
    return {
      id: 'lente',
      pregunta: PREGUNTA_LENTE[pregunta] ?? ranking.titulo,
      icono: ICONO_LENTE[pregunta] ?? Flame,
      tono: ranking.tono,
      valor: String(top.valor),
      unidad: top.valorSub,
      detalle: (
        <>
          <strong>{top.titulo}</strong>
          {top.detalle ? <> · {top.detalle}</> : null}
          {segundo && (
            <>. Le sigue <strong>{segundo.titulo}</strong> con {segundo.valor}
              {segundo.valorSub ? ` ${segundo.valorSub}` : ''}</>
          )}.
        </>
      ),
      pie: ranking.caption,
    };
  }, [pregunta, ranking]);

  // ---------- 2. POR QUÉ NO AVANZA ----------
  // La única lectura ACCIONABLE de la pantalla. Sale de `motivo_pausa`, que se
  // tipificó justamente para poder contestar esto sin leer el comentario de
  // cada reclamo uno por uno.
  const qFrenados = useMemo<Pregunta | null>(() => {
    const porMotivo = new Map<string, { n: number; dias: number[] }>();
    for (const r of reclamos) {
      if (!r.motivo_pausa) continue;
      const acc = porMotivo.get(r.motivo_pausa) ?? { n: 0, dias: [] };
      acc.n += 1;
      if (r.pausado_desde) acc.dias.push(diasDesde(r.pausado_desde));
      porMotivo.set(r.motivo_pausa, acc);
    }
    const filas = Array.from(porMotivo, ([motivo, a]) => ({
      motivo,
      n: a.n,
      dias: a.dias.length ? Math.round(a.dias.reduce((x, y) => x + y, 0) / a.dias.length) : null,
    })).sort((a, b) => b.n - a.n);

    const [top, segundo] = filas;
    if (!top) return null;
    const total = filas.reduce((a, f) => a + f.n, 0);
    const pct = Math.round((top.n / total) * 100);

    return {
      id: 'frenados',
      pregunta: '¿Por qué no avanza?',
      icono: PauseCircle,
      // Frenado hace más de dos meses ya no es "a mirar".
      tono: (top.dias ?? 0) > 60 ? 'malo' : 'advertencia',
      valor: `${pct}%`,
      unidad: MOTIVO_FRASE[top.motivo] ?? 'es ese motivo',
      detalle: (
        <>
          <strong>{top.n} de {total}</strong>{' '}
          {plural(total, 'trabajo frenado espera', 'trabajos frenados esperan')}{' '}
          <strong>{(MOTIVO_LABEL[top.motivo] ?? top.motivo).toLowerCase()}</strong>
          {top.dias != null && <>, hace <strong>{top.dias} días</strong> en promedio</>}
          {segundo && (
            <>. Le sigue <strong>{MOTIVO_LABEL[segundo.motivo] ?? segundo.motivo}</strong> con {segundo.n}</>
          )}.
        </>
      ),
      pie: `${total} ${plural(total, 'frenado', 'frenados')} de ${reclamos.length} reclamos`,
    };
  }, [reclamos]);

  // ---------- 3. QUIÉN NO ESTÁ RESPONDIENDO ----------
  // La cola vieja de cada área contra SU PROPIO promedio de cierre. Es el
  // hallazgo más fuerte de los datos: ninguna área es lenta —todas cierran en
  // 10 a 15 días— pero cada una arrastra casos de 70 a 130 que nadie volvió a
  // mirar. Contra un umbral fijo eso se esconde; contra su propia vara, salta.
  const qAreas = useMemo<Pregunta | null>(() => {
    const porArea = new Map<string, { cierra: number[]; cola: number[] }>();
    for (const r of reclamos) {
      const nombre = r.dependencia_asignada?.nombre;
      if (!nombre) continue;
      const acc = porArea.get(nombre) ?? { cierra: [], cola: [] };
      if (r.fecha_resolucion) {
        acc.cierra.push(Math.max(0, Math.floor(
          (new Date(r.fecha_resolucion).getTime() - new Date(r.created_at).getTime()) / DIA_MS,
        )));
      } else if (ABIERTOS.has(r.estado)) {
        acc.cola.push(diasDesde(r.created_at));
      }
      porArea.set(nombre, acc);
    }
    const prom = (xs: number[]) =>
      (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

    const filas = Array.from(porArea, ([area, a]) => ({
      area,
      cierraEn: prom(a.cierra),
      colaN: a.cola.length,
      colaDias: prom(a.cola) ?? 0,
    }))
      // Hablar de un área al día no es noticia: sólo entran las que arrastran.
      .filter((f) => f.colaN > 0 && f.colaDias > 0)
      .sort((a, b) => b.colaDias - a.colaDias);

    const top = filas[0];
    if (!top) return null;

    return {
      id: 'areas',
      pregunta: '¿Quién no está respondiendo?',
      icono: Clock,
      tono: top.colaDias > 60 ? 'malo' : 'advertencia',
      valor: String(top.colaDias),
      unidad: `días lleva la cola de ${top.area}`,
      detalle: top.cierraEn != null ? (
        <>
          <strong>{top.area}</strong> cierra en <strong>{top.cierraEn} días</strong> promedio,
          pero tiene <strong>{top.colaN}</strong> esperando hace {top.colaDias}.
          {' '}No es lenta: es una cola que nadie volvió a mirar.
        </>
      ) : (
        <>
          <strong>{top.area}</strong> tiene <strong>{top.colaN}</strong>{' '}
          {plural(top.colaN, 'reclamo', 'reclamos')} esperando hace {top.colaDias} días
          y todavía no cerró ninguno.
        </>
      ),
      pie: `${filas.length} ${plural(filas.length, 'área arrastra cola', 'áreas arrastran cola')}`,
    };
  }, [reclamos]);

  // ---------- 4. QUÉ ES LO QUE MÁS PREOCUPA ----------
  const qCategorias = useMemo<Pregunta | null>(() => {
    const cuentas = new Map<string, number>();
    for (const r of reclamos) {
      const nombre = r.categoria?.nombre || 'Sin categoría';
      cuentas.set(nombre, (cuentas.get(nombre) ?? 0) + 1);
    }
    const orden = [...cuentas.entries()].sort((a, b) => b[1] - a[1]);
    const [top, segundo] = orden;
    if (!top) return null;
    const total = reclamos.length;
    const pct = Math.round((top[1] / total) * 100);

    return {
      id: 'categorias',
      pregunta: '¿Qué es lo que más preocupa?',
      icono: Tags,
      tono: pct >= 40 ? 'advertencia' : 'neutro',
      valor: `${pct}%`,
      unidad: `es ${top[0].toLowerCase()}`,
      detalle: (
        <>
          <strong>{top[1]} de {total}</strong> reclamos son de <strong>{top[0]}</strong>
          {segundo && <>. <strong>{segundo[0]}</strong> suma otros {segundo[1]}</>}.
        </>
      ),
      pie: `${orden.length} ${plural(orden.length, 'categoría', 'categorías')} en el recorte`,
    };
  }, [reclamos]);

  // ---------- 5. CÓMO VIENE LA ENTRADA ----------
  const qTendencia = useMemo<Pregunta | null>(() => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const cuentas = new Array<number>(SEMANAS).fill(0);
    for (const r of reclamos) {
      const dias = Math.floor((hoy.getTime() - new Date(r.created_at).getTime()) / DIA_MS);
      const semana = SEMANAS - 1 - Math.floor(dias / 7);
      if (semana >= 0 && semana < SEMANAS) cuentas[semana] += 1;
    }
    const total = cuentas.reduce((s, n) => s + n, 0);
    if (total === 0) return null;
    const actual = cuentas[SEMANAS - 1];
    const previa = cuentas[SEMANAS - 2];

    return {
      id: 'tendencia',
      pregunta: '¿Cómo viene la entrada?',
      icono: TrendingUp,
      // Que entren MÁS reclamos no es malo en sí: puede ser que la gente
      // empezó a usar el canal. Por eso es aviso, no alarma.
      tono: actual > previa ? 'advertencia' : actual < previa ? 'bueno' : 'neutro',
      valor: String(actual),
      unidad: 'esta semana',
      detalle: (
        <>
          Venía de <strong>{previa}</strong> la semana anterior;{' '}
          <strong>{total}</strong> en las últimas {SEMANAS} semanas.
        </>
      ),
      pie: `últimas ${SEMANAS} semanas`,
    };
  }, [reclamos]);

  // El orden importa: primero el RESUMEN de la lente, después lo accionable.
  const preguntas = useMemo(
    () => [qLente, qFrenados, qAreas, qCategorias, qTendencia].filter(Boolean) as Pregunta[],
    [qLente, qFrenados, qAreas, qCategorias, qTendencia],
  );

  if (preguntas.length === 0) return null;

  return (
    /* key por lente: al cambiar el chip las cards REMONTAN, así los contadores
       vuelven a correr y se nota que la respuesta cambió. */
    <div className="map-art" key={pregunta}>
      {preguntas.map((p) => (
        <KpiSemantico
          key={p.id}
          pregunta={p.pregunta}
          icono={p.icono}
          tono={p.tono}
          valor={p.valor}
          unidad={p.unidad}
          detalle={<Fragment>{p.detalle}</Fragment>}
          pie={p.pie}
        />
      ))}
    </div>
  );
}
