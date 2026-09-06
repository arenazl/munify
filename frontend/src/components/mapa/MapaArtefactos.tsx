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
import { Flame, Clock, Tags, type LucideIcon } from 'lucide-react';
import { KpiSemantico, type TonoKpi } from '../ui/KpiSemantico';
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

/* Lo que vivia aca —MOTIVO_LABEL, MOTIVO_FRASE, ABIERTOS, SEMANAS, diasDesde,
   plural— alimentaba a las cuatro cards de prosa que se fueron. Los motivos de
   pausa siguen leyendose, pero ahora DIBUJADOS: el lollipop "Lo que mas frena"
   de `GraficosMapa`, que es donde se ve de un vistazo cual es cronico y cual
   puntual. Un dato no se pierde por dejar de escribirlo en una frase. */

export default function MapaArtefactos({ pregunta, ranking }: Props) {
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


  /**
   * UNA sola card, no cinco.
   *
   * Eran cinco cards de prosa una debajo de la otra y el dueño lo cortó
   * (2026-09-06): *"no podemos tener un panel al costado en donde yo tenga que
   * hacer cuatro veces scroll"*, y despues, viendo las cards: *"eso son
   * graficos?"*. No lo eran. El panel es un KPI semantico y DOS graficos.
   *
   * Queda la de la LENTE, que es el resumen de la pregunta elegida. Lo que
   * decian las otras cuatro no se perdio: se dibuja, que es como se lee.
   * Las cuatro siguen calculadas porque `qFrenados` alimenta al lollipop
   * "Lo que mas frena" y las demas son la base de los graficos por lente.
   */
  const preguntas = useMemo(
    () => [qLente].filter(Boolean) as Pregunta[],
    [qLente],
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
