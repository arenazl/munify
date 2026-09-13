/**
 * CurvaInversion — la curva S de toda obra, pieza del kit v3.
 *
 * Tres curvas en el mismo eje (porcentaje del presupuesto / del total):
 *   - PREVISTA: la recta entre el inicio y el fin previsto, lo que tendría que estar pagado.
 *   - PLATA: lo pagado acumulado semana a semana; punteado después de hoy = programado.
 *   - HECHO: el avance físico, un punto por etapa terminada y uno hoy.
 * Y la PROYECCIÓN: de hoy al fin proyectado, al costo proyectado. Si sube por encima
 * del 100% la obra va a costar más; si cae a la derecha del fin previsto, va a terminar tarde.
 *
 * Gramática de la galería (docs/design-sync/Mapa de calor y reclamos/galeria-graficos.html):
 * tarjeta con título, lectura en prosa, SVG con grilla fina, leyenda y tip. Tonta.
 */
import type { PuntoCurva, PuntoFisico, ProyeccionObra } from '../../lib/obras-tipos';

export interface CurvaInversionProps {
  puntos: PuntoCurva[];
  fisico: PuntoFisico[];
  presupuesto: number | null;
  proyeccion: ProyeccionObra;
  hoy: string;
  fmtMoney: (n: number | string) => string;
}

const W = 480, H = 210, L = 40, R = 16, T = 14, B = 28;
const C = {
  prevista: 'var(--pl-text-muted)',
  plata: 'var(--pl-green)',
  hecho: 'var(--pl-blue, #3b82f6)',
  proy: 'var(--pl-amber-strong)',
  mal: 'var(--pl-red)',
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const t = (iso: string) => new Date(iso + 'T00:00:00').getTime();

export function CurvaInversion({ puntos, fisico, presupuesto, proyeccion, hoy, fmtMoney }: CurvaInversionProps) {
  if (puntos.length === 0) {
    return (
      <article className="gr-card">
        <h3>Cómo se va gastando</h3>
        <p className="gr-q">Todavía no hay gastos ni fechas para dibujar la curva.</p>
      </article>
    );
  }
  const enPct = !!presupuesto && presupuesto > 0;
  const base = enPct ? presupuesto! : Math.max(1, ...puntos.map((p) => Number(p.real)));
  const y100 = (v: number) => (v / base) * 100;

  const fechas = [...puntos.map((p) => p.fecha), ...fisico.map((f) => f.fecha), proyeccion.fin_proyectado, proyeccion.fin_previsto, hoy].filter((x): x is string => !!x);
  const x0 = Math.min(...fechas.map(t));
  const x1 = Math.max(...fechas.map(t), x0 + 30 * 86400000);
  const costoProy = proyeccion.costo_proyectado ? y100(Number(proyeccion.costo_proyectado)) : null;
  const tope = Math.max(100, costoProy ?? 0, ...puntos.map((p) => y100(Number(p.real)))) * 1.06;

  const x = (iso: string) => L + ((t(iso) - x0) / (x1 - x0)) * (W - L - R);
  const y = (pct: number) => T + (H - T - B) * (1 - pct / tope);

  const reales = puntos.filter((p) => !p.programado);
  const programados = puntos.filter((p) => p.programado);
  const path = (ps: Array<{ fecha: string; v: number }>) => ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.fecha).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const serieReal = reales.map((p) => ({ fecha: p.fecha, v: y100(Number(p.real)) }));
  const ultimoReal = serieReal[serieReal.length - 1];
  const serieProg = ultimoReal ? [ultimoReal, ...programados.map((p) => ({ fecha: p.fecha, v: y100(Number(p.real)) }))] : [];
  const seriePrev = enPct ? puntos.filter((p) => p.prevista != null).map((p) => ({ fecha: p.fecha, v: y100(Number(p.prevista)) })) : [];
  const serieHecho = enPct ? fisico.map((f) => ({ fecha: f.fecha, v: f.pct })) : [];

  // Los meses del eje: uno por mes que cruza el rango.
  const meses: Array<{ iso: string; label: string }> = [];
  {
    const cur = new Date(x0); cur.setDate(1); cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= x1) {
      const iso = cur.toISOString().slice(0, 10);
      meses.push({ iso, label: MESES[cur.getMonth()] });
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  const gid = 'cv-area';
  const desvioPlata = proyeccion.desvio_plata ? Number(proyeccion.desvio_plata) : 0;
  const desvioDias = proyeccion.desvio_dias ?? 0;
  const proyMal = desvioPlata > 0 || desvioDias > 0;

  const lectura = enPct
    ? <>La recta gris es lo que <b>tendría que estar pagado</b> si la obra fuera pareja; la verde es lo <b>pagado</b>; la azul, lo <b>hecho</b>. La punteada ámbar es a dónde llega si sigue así.</>
    : <>Sin presupuesto cargado la curva es sólo la plata pagada. Cargalo y aparecen la recta prevista, lo hecho y la proyección.</>;

  return (
    <article className="gr-card cv">
      <h3>La curva de la obra</h3>
      <p className="gr-q">{lectura}</p>
      <svg viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--pl-green)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--pl-green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].filter((k) => k <= tope).map((k) => (
          <g key={k}>
            <line className="gr-gl" x1={L} y1={y(k)} x2={W - R} y2={y(k)} strokeDasharray={k === 100 ? '4 3' : undefined} />
            <text className="gr-axv" x={L - 6} y={y(k) + 4} textAnchor="end">{enPct ? `${k}%` : fmtMoney((k / 100) * base)}</text>
          </g>
        ))}
        {meses.map((m) => (
          <g key={m.iso}>
            <line className="gr-gl" x1={x(m.iso)} y1={T} x2={x(m.iso)} y2={H - B} />
            <text className="gr-ax" x={x(m.iso)} y={H - 10} textAnchor="middle">{m.label}</text>
          </g>
        ))}
        {seriePrev.length > 1 && <path d={path(seriePrev)} fill="none" stroke={C.prevista} strokeWidth={1.5} strokeDasharray="5 4" />}
        {serieReal.length > 0 && (
          <>
            <path d={`${path(serieReal)} L${x(ultimoReal.fecha)} ${y(0)} L${x(serieReal[0].fecha)} ${y(0)} Z`} fill={`url(#${gid})`} />
            <path d={path(serieReal)} fill="none" stroke={C.plata} strokeWidth={2.5} strokeLinejoin="round" />
          </>
        )}
        {serieProg.length > 1 && <path d={path(serieProg)} fill="none" stroke={C.plata} strokeWidth={2} strokeDasharray="3 3" opacity={0.7} />}
        {serieHecho.length > 0 && (
          <>
            <path d={path(serieHecho)} fill="none" stroke={C.hecho} strokeWidth={2} strokeLinejoin="round" />
            {serieHecho.map((p, i) => <rect key={i} x={x(p.fecha) - 3.5} y={y(p.v) - 3.5} width={7} height={7} transform={`rotate(45 ${x(p.fecha)} ${y(p.v)})`} fill={C.hecho} />)}
          </>
        )}
        {ultimoReal && proyeccion.fin_proyectado && costoProy != null && (
          <>
            <path d={`M${x(hoy)} ${y(ultimoReal.v)} L${x(proyeccion.fin_proyectado)} ${y(costoProy)}`} fill="none" stroke={proyMal ? C.mal : C.proy} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
            <circle cx={x(proyeccion.fin_proyectado)} cy={y(costoProy)} r={4} fill={proyMal ? C.mal : C.proy} />
          </>
        )}
        {proyeccion.fin_previsto && (
          <>
            <line x1={x(proyeccion.fin_previsto)} y1={T} x2={x(proyeccion.fin_previsto)} y2={H - B} stroke={C.prevista} strokeWidth={1} strokeDasharray="2 2" />
            <text className="gr-ax" x={x(proyeccion.fin_previsto)} y={T - 3} textAnchor="middle">fin previsto</text>
          </>
        )}
        <line x1={x(hoy)} y1={T} x2={x(hoy)} y2={H - B} stroke={C.proy} strokeWidth={1.5} />
        <text className="gr-ax" x={x(hoy) + 4} y={T + 9} fill={C.proy} style={{ fontWeight: 700 }}>HOY</text>
      </svg>
      <div className="gr-key">
        {enPct && <b><i style={{ background: C.prevista }} />Previsto</b>}
        <b><i style={{ background: C.plata }} />Pagado</b>
        {enPct && <b><i style={{ background: C.hecho }} />Hecho</b>}
        {costoProy != null && <b><i style={{ background: proyMal ? C.mal : C.proy }} />Si sigue así</b>}
      </div>
      {proyeccion.fin_proyectado && (
        <p className="gr-tip">
          {proyeccion.base.startsWith('terminada')
            ? <>Terminó el <b>{new Date(proyeccion.fin_proyectado + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</b>{proyeccion.costo_proyectado ? <> y costó <b>{fmtMoney(proyeccion.costo_proyectado)}</b></> : null}.</>
            : <>Si sigue al ritmo de hasta hoy termina el <b>{new Date(proyeccion.fin_proyectado + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}</b>{desvioDias ? <> ({Math.abs(desvioDias)} días {desvioDias > 0 ? 'tarde' : 'antes'})</> : null}{proyeccion.costo_proyectado ? <> y cuesta <b>{fmtMoney(proyeccion.costo_proyectado)}</b>{desvioPlata ? <>, {fmtMoney(Math.abs(desvioPlata))} {desvioPlata > 0 ? 'más' : 'menos'} que el presupuesto</> : null}</> : null}.</>}
        </p>
      )}
    </article>
  );
}

export default CurvaInversion;
