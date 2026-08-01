/**
 * KpiCardV2 — card de indicador del rediseño v2 (Claude Design):
 * eyebrow en caps + número display grande + sparkline (mini area chart
 * recharts con la serie REAL de evolución) + pie con delta veredictado
 * (verde bueno / ámbar advertencia / rojo malo) y subtexto.
 *
 * Sin serie (o con menos de 2 puntos) el sparkline degrada a una línea
 * punteada neutra — JAMÁS se inventan datos.
 *
 * Polimórfico: estilos en styles/dashboard-v2.css sobre tokens --pl-*.
 * Inline SOLO valores runtime (color de la serie, que la página lee de
 * los tokens computados — mismo patrón que los charts del Dashboard).
 */
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

export type KpiVeredicto = 'bueno' | 'advertencia' | 'malo';

export interface KpiDelta {
  /** Texto corto del delta (ej: "33%", "2,4 d"). */
  texto: string;
  /** Dirección de la flecha (no implica bueno/malo: eso lo da el veredicto). */
  direccion: 'sube' | 'baja';
  veredicto: KpiVeredicto;
}

export interface KpiCardV2Props {
  /** Etiqueta del KPI (ej: "Total reclamos") — las caps las pone el CSS. */
  eyebrow: string;
  valor: string | number;
  /** Unidad chica debajo del número (ej: "días"). */
  unidad?: string;
  /** Número en color deshabilitado (cero / sin dato). */
  atenuado?: boolean;
  /** Serie REAL de evolución; con menos de 2 puntos se muestra la línea plana. */
  serie?: number[];
  /** Color runtime de la serie (la página lo lee de los tokens --pl-*). */
  serieColor?: string;
  delta?: KpiDelta | null;
  sub?: string;
}

export function KpiCardV2({ eyebrow, valor, unidad, atenuado, serie, serieColor, delta, sub }: KpiCardV2Props) {
  const puntos = serie && serie.length >= 2 ? serie.map((v, i) => ({ i, v })) : null;
  const ultimo = puntos ? puntos.length - 1 : -1;

  // Punto lleno sobre el último valor de la serie (como la referencia).
  const dotUltimo = (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index } = props;
    if (index !== ultimo || cx == null || cy == null) return <g key={`p-${index}`} />;
    return <circle key={`p-${index}`} cx={cx} cy={cy} r={2.6} fill={serieColor} stroke="none" />;
  };

  const numero = (
    <span className={`dv2-kpi-valor${atenuado ? ' dv2-kpi-valor--atenuado' : ''}`}>{valor}</span>
  );

  return (
    <div className="dv2-card dv2-kpi-card">
      <span className="dv2-kpi-eyebrow">{eyebrow}</span>

      <div className="dv2-kpi-fila">
        {unidad ? (
          <span className="dv2-kpi-valor-bloque">
            {numero}
            <span className="dv2-kpi-unidad">{unidad}</span>
          </span>
        ) : (
          numero
        )}

        {puntos ? (
          <div className="dv2-kpi-spark" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={puntos} margin={{ top: 3, right: 4, bottom: 3, left: 4 }}>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Area
                  type="monotone"
                  dataKey="v"
                  baseValue="dataMin"
                  stroke={serieColor}
                  strokeWidth={2}
                  fill={serieColor}
                  fillOpacity={0.12}
                  dot={dotUltimo}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="dv2-kpi-spark dv2-kpi-spark--plana" aria-hidden="true" />
        )}
      </div>

      {(delta || sub) && (
        <div className="dv2-kpi-pie">
          {delta && (
            <span className={`dv2-kpi-delta dv2-kpi-delta--${delta.veredicto}`}>
              {delta.direccion === 'sube'
                ? <ArrowUp className="dv2-kpi-delta-icono" aria-hidden="true" />
                : <ArrowDown className="dv2-kpi-delta-icono" aria-hidden="true" />}
              {delta.texto}
            </span>
          )}
          {sub && <span className="dv2-kpi-sub">{sub}</span>}
        </div>
      )}
    </div>
  );
}
