import { useMemo } from 'react';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip as RTooltip,
  YAxis,
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';
import { Reclamo } from '../../types';
import { dailyTimeline, distribucionEstados } from '../../lib/mapaUtils';
import { RankedList, type RankedListItem } from '../ui/RankedList';

// Los 4 KPIs que vivían acá arriba se movieron al strip del SemanticHero de
// Mapa.tsx. Este componente queda con las TRES TARJETAS de abajo del mapa que
// pide el canvas (mapa-canvas.dc.html): el ranking de zonas calientes, la
// distribución por estado y el pulso de ingresos.
//
// Las tres comparten el marco del kit (`av2-panel`: superficie, borde, radio y
// cabecera con título + caption sobre tokens --pl-*). Antes las dos últimas se
// dibujaban con estilos inline del theme y se leían como piezas de otra
// pantalla, pegadas al lado de la primera.
//
// El ranking NO se calcula acá: la página manda los items ya armados Y su
// encabezado, con el criterio real (radio y ventana) en el caption.
interface Props {
  reclamos: Reclamo[];          // ya filtrados por la consulta de arriba
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  /** Items del ranking, YA ORDENADOS (los arma la página). */
  ranking: RankedListItem[];
  /** id del ancla de la sección (para el deep-link del hero). */
  rankingId: string;
  /** Encabezado del panel: cambia con la pregunta. */
  rankingTitulo: string;
  /** Con qué criterio se armó (radios, ventanas, denominadores reales). */
  rankingCaption: string;
  /** Icono del encabezado (lo elige la pregunta). */
  rankingIcono: LucideIcon;
  /** Matiz del icono, según qué está mostrando el ranking. */
  rankingTono?: 'malo' | 'bueno' | 'advertencia';
  /** Qué decir cuando no hay nada que rankear. */
  rankingVacio: string;
}

export default function MapaStats({
  reclamos,
  statusColors,
  statusLabels,
  ranking,
  rankingId,
  rankingTitulo,
  rankingCaption,
  rankingIcono: RankingIcono,
  rankingTono = 'malo',
  rankingVacio,
}: Props) {
  const { theme } = useTheme();

  const timeline = useMemo(() => dailyTimeline(reclamos, 30), [reclamos]);
  const dist = useMemo(() => distribucionEstados(reclamos), [reclamos]);

  // Recharts y los iconos necesitan colores CONCRETOS: se leen de los mismos
  // tokens --pl-* que usa el CSS (patrón polimórfico del Dashboard v2), así
  // los paneles siguen al theme en vez de quedar clavados en un hex.
  const sem = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const leer = (t: string, f: string) => cs.getPropertyValue(t).trim() || f;
    return {
      malo: leer('--pl-red', theme.primary),
      bueno: leer('--pl-green', theme.primary),
      advertencia: leer('--pl-amber-strong', theme.primary),
      neutro: leer('--pl-text-3', theme.textSecondary),
    };
  }, [theme.primary, theme.textSecondary]);

  // Delta últimos 7d vs 7d previos (sobre la timeline)
  const ultimos7 = timeline.slice(-7).reduce((s, p) => s + p.count, 0);
  const previos7 = timeline.slice(-14, -7).reduce((s, p) => s + p.count, 0);
  const delta = ultimos7 - previos7;
  const deltaPct = previos7 > 0 ? (delta / previos7) * 100 : 0;

  /** Cuántos reclamos hay dibujados: es el denominador de la distribución. */
  const totalDist = dist.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-4">
      {/* === Paneles analíticos === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
        {/* El ranking de la pregunta activa, con el criterio a la vista. */}
        <section id={rankingId} className="av2-panel">
          <div className="av2-panel-head">
            <RankingIcono size={16} strokeWidth={2} style={{ color: sem[rankingTono] }} aria-hidden />
            <h2 className="av2-panel-titulo">{rankingTitulo}</h2>
            <span className="av2-panel-caption">{rankingCaption}</span>
          </div>
          {ranking.length === 0 ? (
            <p className="av2-panel-vacio">{rankingVacio}</p>
          ) : (
            <RankedList items={ranking} ariaLabel={rankingTitulo} />
          )}
        </section>

        {/* Por estado: el donut usa los colores del SSoT de estados (los MISMOS
            de los pines del mapa), así la tarjeta y el lienzo hablan igual. */}
        <section className="av2-panel">
          <div className="av2-panel-head">
            <h2 className="av2-panel-titulo">Por estado</h2>
            <span className="av2-panel-caption">
              {totalDist} {totalDist === 1 ? 'reclamo en el mapa' : 'en el mapa'}
            </span>
          </div>
          {dist.length === 0 ? (
            <p className="av2-panel-vacio">Sin reclamos que distribuir con este filtro.</p>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-32 h-32 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={2}
                      dataKey="count"
                      stroke="none"
                    >
                      {dist.map((d) => (
                        <Cell key={d.estado} fill={statusColors[d.estado] || sem.neutro} />
                      ))}
                    </Pie>
                    <RTooltip
                      contentStyle={{
                        backgroundColor: theme.card,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        fontSize: 12,
                        color: theme.text,
                      }}
                      formatter={(v: number, _n, item) => {
                        const total = dist.reduce((s, x) => s + x.count, 0);
                        const pct = total > 0 ? ((v / total) * 100).toFixed(0) : '0';
                        return [`${v} (${pct}%)`, statusLabels[(item.payload as { estado: string }).estado] || (item.payload as { estado: string }).estado];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {dist.map((d) => {
                  const pct = totalDist > 0 ? (d.count / totalDist) * 100 : 0;
                  return (
                    <div key={d.estado} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: statusColors[d.estado] || sem.neutro }}
                      />
                      <span className="truncate" style={{ color: theme.text }}>
                        {statusLabels[d.estado] || d.estado}
                      </span>
                      <span className="ml-auto font-bold" style={{ color: theme.text }}>
                        {d.count}
                      </span>
                      <span style={{ color: theme.textSecondary }}>({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Ingresos en el mapa: cuántos entraron en la última semana contra la
            anterior. Que entren MENOS es la buena noticia — por eso la flecha
            hacia arriba va con el matiz de alerta. */}
        <section className="av2-panel">
          <div className="av2-panel-head">
            <h2 className="av2-panel-titulo">Ingresos en el mapa</h2>
            <span className="av2-panel-caption">últimos 7 días contra los 7 previos</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold" style={{ color: theme.text }}>
              {ultimos7}
            </span>
            <span className="inline-flex items-center gap-1 self-center">
              {delta >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" style={{ color: sem.malo }} />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" style={{ color: sem.bueno }} />
              )}
              <span
                className="text-xs font-bold"
                style={{ color: delta >= 0 ? sem.malo : sem.bueno }}
              >
                {delta >= 0 ? '+' : ''}
                {deltaPct.toFixed(0)}%
              </span>
            </span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              nuevos · {previos7} en el período previo
            </span>
          </div>
          <div className="h-20 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.primary} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={theme.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={theme.primary}
                  strokeWidth={2}
                  fill="url(#sparkGrad)"
                />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <RTooltip
                  contentStyle={{
                    backgroundColor: theme.card,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: theme.text,
                  }}
                  labelFormatter={(d) => {
                    const date = new Date(d);
                    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
                  }}
                  formatter={(v: number) => [v, 'reclamos']}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
