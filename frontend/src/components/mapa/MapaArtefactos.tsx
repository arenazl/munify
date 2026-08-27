/**
 * MapaArtefactos — los TRES artefactos de la lente, abajo del mapa.
 *
 * Reemplazan a la fila vieja (ranking + donut + sparkline sin eje) por
 * decisión del dueño (2026-08-27): cards SEMÁNTICAS de dos caras —
 * pregunta con veredicto ↔ listado rankeado — que auto-rotan cada 10 s
 * ("Ver más" pasa a manual y frena esa card).
 *
 *   1. La pregunta de la LENTE: se alimenta del mismo `ranking` por pregunta
 *      que armaba la fila vieja (dinámico: cambia con el chip de arriba).
 *   2. Qué categoría pesa en el RECORTE (sigue a los filtros del mapa).
 *   3. La tendencia del recorte: semanas agregadas CON eje y fechas — nada
 *      de serrucho diario ni "+50%" sin base.
 *
 * Sin material no hay gráfico vacío: la card se da vuelta y da la BUENA
 * NOTICIA ("nada vencido con este filtro"), o el aviso neutro si el vacío
 * no es una buena noticia (todavía no se cerró ninguno).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Reclamo } from '../../types';
import type { RankedListItem } from '../ui/RankedList';
import { useCountUp } from '../../hooks/useCountUp';
import '../../styles/mapa-artefactos.css';

/** Número que cuenta desde 0 (pieza del kit). Sólo para valores numéricos. */
function NumAnimado({ v }: { v: number }) {
  return <>{useCountUp(v)}</>;
}

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
  /** El paquete por lente que ya arma la página (mismo de la fila vieja). */
  ranking: RankingLente;
  /** El recorte actual del mapa (ya filtrado). */
  reclamos: Reclamo[];
}

const PREGUNTA_LENTE: Record<string, string> = {
  repiten: '¿Dónde más se repite?',
  atrasado: '¿Quiénes esperan más?',
  resolvimos: '¿Qué resolvimos más rápido?',
  sinllegar: '¿Dónde no llegamos?',
};

const CHIP_POR_TONO = {
  malo: { tono: 'grave', label: 'atención acá' },
  advertencia: { tono: 'warn', label: 'mirar' },
  bueno: { tono: 'ok', label: 'buena señal' },
} as const;

interface CasoLista { pos: number; titulo: string; sub?: string; valor: string | number; unidad?: string }

interface CaraPregunta { num: ReactNode; det: ReactNode; chip: { tono: string; label: string } }

interface TarjetaDatos {
  preg: string;
  /** null => sin material: se muestra `vacio`. */
  cara: CaraPregunta | null;
  vacio: { texto: string; buena: boolean };
  listaTitulo: string;
  casos: CasoLista[];
  /** Contenido extra de la cara A (la tendencia mete sus barras acá). */
  extraA?: ReactNode;
}

/** Card de dos caras. Auto-rota cada 10 s si hay listado; "Ver más" frena. */
function Tarjeta({ datos }: { datos: TarjetaDatos }) {
  const [abierta, setAbierta] = useState(false);
  const [manual, setManual] = useState(false);
  const rota = datos.cara !== null && datos.casos.length > 0 && !manual;

  useEffect(() => {
    if (!rota) return;
    const t = setInterval(() => setAbierta((a) => !a), 10_000);
    return () => clearInterval(t);
  }, [rota]);

  const voltear = (cara: boolean) => { setAbierta(cara); setManual(true); };

  if (datos.cara === null) {
    return (
      <div className={`tj tj-vacia${datos.vacio.buena ? ' buena' : ''}`}>
        {datos.vacio.buena && <div className="tj-tilde" aria-hidden="true">&check;</div>}
        <span className="tj-preg">{datos.preg}</span>
        <p>{datos.vacio.texto}</p>
      </div>
    );
  }

  return (
    <div className="tj">
      {!abierta ? (
        <>
          <span className="tj-preg">{datos.preg}</span>
          <p className="tj-num">{datos.cara.num}</p>
          <p className="tj-det">{datos.cara.det}</p>
          {datos.extraA}
          <div className="chips tj-pie">
            <span className={`chip ${datos.cara.chip.tono}`}>{datos.cara.chip.label}</span>
            {datos.casos.length > 0 && (
              <button className="tj-vermas" onClick={() => voltear(true)}>Ver más</button>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="tj-preg">{datos.listaTitulo}</span>
          <ol className="tj-lista">
            {datos.casos.map((c) => (
              <li key={c.pos}>
                <span className="pos">{c.pos}</span>
                <span className="cuerpo">
                  <strong>{c.titulo}</strong>
                  {c.sub && <small>{c.sub}</small>}
                </span>
                <span className="cant">{c.valor}{c.unidad && <small>{c.unidad}</small>}</span>
              </li>
            ))}
          </ol>
          <div className="chips tj-pie">
            <button className="tj-vermas" onClick={() => voltear(false)}>Volver a la pregunta</button>
          </div>
        </>
      )}
    </div>
  );
}

const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANAS = 12;

const fmtCorta = (d: Date) =>
  d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');

export default function MapaArtefactos({ pregunta, ranking, reclamos }: Props) {
  // ---------- 1. La pregunta de la lente (del ranking por pregunta) ----------
  const cardLente = useMemo<TarjetaDatos>(() => {
    const preg = PREGUNTA_LENTE[pregunta] ?? ranking.titulo;
    const [top, segundo] = ranking.items;
    return {
      preg,
      cara: top
        ? {
            num: top.titulo,
            det: (
              <>
                {top.detalle ? <>{top.detalle} — </> : null}
                <strong>
                  {typeof top.valor === 'number' ? <NumAnimado v={top.valor} /> : top.valor}
                  {top.valorSub ? ` ${top.valorSub}` : ''}
                </strong>
                {segundo && (
                  <>. Le sigue <strong>{segundo.titulo}</strong> con {segundo.valor}
                  {segundo.valorSub ? ` ${segundo.valorSub}` : ''}.</>
                )}
              </>
            ),
            chip: CHIP_POR_TONO[ranking.tono],
          }
        : null,
      // Que no haya atrasados/focos/barrios sin atención ES una buena
      // noticia; que no haya resueltos todavía, no.
      vacio: { texto: ranking.vacio, buena: ranking.tono !== 'bueno' },
      listaTitulo: `${ranking.titulo} · ${ranking.caption}`,
      casos: ranking.items.slice(0, 5).map((it, i) => ({
        pos: i + 1,
        titulo: it.titulo,
        sub: it.detalle,
        valor: it.valor,
        unidad: it.valorSub,
      })),
    };
  }, [pregunta, ranking]);

  // ---------- 2. Qué categoría pesa en el recorte ----------
  const cardCategorias = useMemo<TarjetaDatos>(() => {
    const cuentas = new Map<string, number>();
    reclamos.forEach((r) => {
      const nombre = r.categoria?.nombre || 'Sin categoría';
      cuentas.set(nombre, (cuentas.get(nombre) ?? 0) + 1);
    });
    const orden = [...cuentas.entries()].sort((a, b) => b[1] - a[1]);
    const total = reclamos.length;
    const [top, segundo] = orden;
    const parte = top ? Math.round((top[1] / total) * 100) : 0;
    return {
      preg: '¿Qué categoría pesa más?',
      cara: top
        ? {
            num: top[0],
            det: (
              <>
                <strong><NumAnimado v={top[1]} /> de {total}</strong> reclamos del recorte ({parte}%)
                {segundo && <>. Le sigue <strong>{segundo[0]}</strong> con {segundo[1]}.</>}
              </>
            ),
            chip: parte >= 40
              ? { tono: 'warn', label: 'concentrado' }
              : { tono: 'ok', label: 'repartido' },
          }
        : null,
      vacio: { texto: 'Sin reclamos en este recorte: nada que clasificar.', buena: true },
      listaTitulo: 'Categorías del recorte · de mayor a menor',
      casos: orden.slice(0, 5).map(([nombre, n], i) => ({
        pos: i + 1,
        titulo: nombre,
        valor: n,
        unidad: n === 1 ? 'reclamo' : 'reclamos',
      })),
    };
  }, [reclamos]);

  // ---------- 3. La tendencia del recorte, en semanas y con eje ----------
  const tendencia = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const cuentas = new Array<number>(SEMANAS).fill(0);
    reclamos.forEach((r) => {
      const dias = Math.floor((hoy.getTime() - new Date(r.created_at).getTime()) / DIA_MS);
      const semana = SEMANAS - 1 - Math.floor(dias / 7);
      if (semana >= 0 && semana < SEMANAS) cuentas[semana] += 1;
    });
    const inicioDe = (i: number) => new Date(hoy.getTime() - (SEMANAS - i) * 7 * DIA_MS + DIA_MS);
    return { cuentas, inicioDe, max: Math.max(...cuentas, 1) };
  }, [reclamos]);

  const cardTendencia = useMemo<TarjetaDatos>(() => {
    const { cuentas, inicioDe, max } = tendencia;
    const actual = cuentas[SEMANAS - 1];
    const previa = cuentas[SEMANAS - 2];
    const totalVentana = cuentas.reduce((s, n) => s + n, 0);
    const chip = actual > previa
      ? { tono: 'warn', label: 'subiendo' }
      : actual < previa
        ? { tono: 'ok', label: 'bajando' }
        : { tono: 'info', label: 'estable' };
    return {
      preg: '¿Cómo viene la entrada?',
      cara: totalVentana > 0
        ? {
            num: <><NumAnimado v={actual} /> <small>esta semana</small></>,
            det: (
              <>Venía de <strong>{previa}</strong> la semana anterior;{' '}
              <strong>{totalVentana}</strong> en las últimas {SEMANAS} semanas.</>
            ),
            chip,
          }
        : null,
      vacio: { texto: `Sin entradas en las últimas ${SEMANAS} semanas para este recorte.`, buena: true },
      listaTitulo: `Entradas por semana · últimas ${SEMANAS}`,
      casos: cuentas
        .map((n, i) => ({ n, i }))
        .slice(-5)
        .reverse()
        .map(({ n, i }, pos) => ({
          pos: pos + 1,
          titulo: i === SEMANAS - 1 ? 'Esta semana' : `Semana del ${fmtCorta(inicioDe(i))}`,
          valor: n,
          unidad: n === 1 ? 'reclamo' : 'reclamos',
        })),
      extraA: (
        <div aria-hidden="true">
          <div className="barras">
            {cuentas.map((n, i) => (
              <div
                key={i}
                className={`b${i === SEMANAS - 1 ? ' hoy' : ''}`}
                data-v={n}
                style={{
                  height: `${Math.max((n / max) * 100, 4)}%`,
                  animationDelay: `${i * 35}ms`,
                }}
              />
            ))}
          </div>
          <div className="ejex">
            {cuentas.map((_, i) => (
              <span key={i}>
                {i === SEMANAS - 1 ? 'hoy' : i % 4 === 0 ? fmtCorta(inicioDe(i)) : ''}
              </span>
            ))}
          </div>
        </div>
      ),
    };
  }, [tendencia]);

  return (
    /* key por lente: al cambiar el chip las cards REMONTAN — la entrada
       escalonada y los counters vuelven a correr, como en el modo TV. */
    <div className="map-art" key={pregunta}>
      <Tarjeta datos={cardLente} />
      <Tarjeta datos={cardCategorias} />
      <Tarjeta datos={cardTendencia} />
    </div>
  );
}
