import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Clock,
  Flame,
} from 'lucide-react';
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
import {
  computeKPIs,
  topZonas,
  dailyTimeline,
  distribucionEstados,
  Cluster,
} from '../../lib/mapaUtils';

interface Props {
  reclamos: Reclamo[];          // ya filtrados por categoría/estado/dependencia/timeline
  totalUniverso: number;        // total real (sin filtro) para el ratio de cobertura
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  onZonaClick?: (cluster: Cluster) => void;
}

export default function MapaStats({
  reclamos,
  totalUniverso,
  statusColors,
  statusLabels,
  onZonaClick,
}: Props) {
  const { theme } = useTheme();

  const kpis = useMemo(() => computeKPIs(reclamos), [reclamos]);
  const zonas = useMemo(() => topZonas(reclamos, 5, 200), [reclamos]);
  const timeline = useMemo(() => dailyTimeline(reclamos, 30), [reclamos]);
  const dist = useMemo(() => distribucionEstados(reclamos), [reclamos]);

  // Delta últimos 7d vs 7d previos (sobre la timeline)
  const ultimos7 = timeline.slice(-7).reduce((s, p) => s + p.count, 0);
  const previos7 = timeline.slice(-14, -7).reduce((s, p) => s + p.count, 0);
  const delta = ultimos7 - previos7;
  const deltaPct = previos7 > 0 ? (delta / previos7) * 100 : 0;

  // Card base style
  const cardStyle: React.CSSProperties = {
    backgroundColor: theme.card,
    border: `1px solid ${theme.border}`,
  };

  return (
    <div className="space-y-4">
      {/* === FILA 1: KPIs grandes === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1: Cobertura geo */}
        <KpiTile
          icon={<MapPin className="h-5 w-5" />}
          color="#3b82f6"
          label="Georreferenciados"
          value={`${kpis.conUbicacion}`}
          sub={`de ${totalUniverso} total · ${kpis.pctGeo.toFixed(0)}%`}
          theme={theme}
        />

        {/* KPI 2: % Resueltos con tendencia */}
        <KpiTile
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="#10b981"
          label="% Resueltos"
          value={`${kpis.pctResueltos.toFixed(0)}%`}
          sub={
            kpis.tendenciaResueltosPp != null ? (
              <span className="flex items-center gap-1">
                {kpis.tendenciaResueltosPp >= 0 ? (
                  <TrendingUp className="h-3 w-3" style={{ color: '#10b981' }} />
                ) : (
                  <TrendingDown className="h-3 w-3" style={{ color: '#ef4444' }} />
                )}
                <span style={{ color: kpis.tendenciaResueltosPp >= 0 ? '#10b981' : '#ef4444' }}>
                  {kpis.tendenciaResueltosPp >= 0 ? '+' : ''}
                  {kpis.tendenciaResueltosPp.toFixed(1)}pp
                </span>
                <span style={{ color: theme.textSecondary }}>vs. previo</span>
              </span>
            ) : (
              `${kpis.resueltos} de ${kpis.total}`
            )
          }
          theme={theme}
        />

        {/* KPI 3: Tiempo medio resolución */}
        <KpiTile
          icon={<Clock className="h-5 w-5" />}
          color="#f59e0b"
          label="Tiempo medio resolución"
          value={kpis.tiempoMedioDias != null ? `${kpis.tiempoMedioDias.toFixed(1)}d` : 's/d'}
          sub={
            kpis.tiempoMedioDias != null
              ? `promedio sobre ${kpis.resueltos} resueltos`
              : 'sin reclamos resueltos en el período'
          }
          theme={theme}
        />

        {/* KPI 4: Abiertos > 30d */}
        <KpiTile
          icon={<AlertTriangle className="h-5 w-5" />}
          color={kpis.abiertos30dPlus > 0 ? '#ef4444' : '#10b981'}
          label="Abiertos > 30 días"
          value={`${kpis.abiertos30dPlus}`}
          sub={kpis.abiertos30dPlus > 0 ? 'requieren revisión urgente' : 'todo dentro del SLA'}
          theme={theme}
        />
      </div>

      {/* === FILA 2: Paneles analíticos === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Zonas Calientes */}
        <div className="rounded-xl p-4" style={cardStyle}>
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4" style={{ color: '#ef4444' }} />
            <h3 className="text-sm font-bold" style={{ color: theme.text }}>
              Top zonas calientes
            </h3>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              (radio 200m)
            </span>
          </div>
          {zonas.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: theme.textSecondary }}>
              No hay clusters con más de un reclamo en este filtro.
            </p>
          ) : (
            <div className="space-y-2">
              {zonas.map((z, idx) => {
                const intensity = idx === 0 ? 1 : 1 - idx * 0.15;
                return (
                  <button
                    key={`${z.centerLat}-${z.centerLng}`}
                    onClick={() => onZonaClick?.(z)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg transition-all hover:scale-[1.01] active:scale-95 text-left"
                    style={{
                      backgroundColor: theme.background,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        backgroundColor: `rgba(239, 68, 68, ${0.15 + intensity * 0.5})`,
                        color: '#ef4444',
                      }}
                    >
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                        {z.topDireccion || `Zona ${z.centerLat.toFixed(4)}, ${z.centerLng.toFixed(4)}`}
                      </p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        {z.reclamos.length} reclamos
                      </p>
                    </div>
                    <span
                      className="text-lg font-bold flex-shrink-0"
                      style={{ color: '#ef4444' }}
                    >
                      {z.reclamos.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Distribución por Estado (Donut) */}
        <div className="rounded-xl p-4" style={cardStyle}>
          <h3 className="text-sm font-bold mb-3" style={{ color: theme.text }}>
            Distribución por estado
          </h3>
          {dist.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: theme.textSecondary }}>
              Sin datos.
            </p>
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
                        <Cell key={d.estado} fill={statusColors[d.estado] || '#6b7280'} />
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
                  const total = dist.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? (d.count / total) * 100 : 0;
                  return (
                    <div key={d.estado} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: statusColors[d.estado] || '#6b7280' }}
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
        </div>

        {/* Tendencia temporal (sparkline 30d) */}
        <div className="rounded-xl p-4" style={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{ color: theme.text }}>
              Últimos 30 días
            </h3>
            <div className="flex items-center gap-1">
              {delta >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" style={{ color: '#10b981' }} />
              )}
              <span
                className="text-xs font-bold"
                style={{ color: delta >= 0 ? '#ef4444' : '#10b981' }}
              >
                {delta >= 0 ? '+' : ''}
                {deltaPct.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold" style={{ color: theme.text }}>
              {ultimos7}
            </span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              últimos 7d · {previos7} previos
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
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// KPI Tile
// =====================================================================
interface KpiTileProps {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  sub: React.ReactNode;
  theme: ReturnType<typeof useTheme>['theme'];
}

function KpiTile({ icon, color, label, value, sub, theme }: KpiTileProps) {
  return (
    <div
      className="rounded-xl p-4 transition-all hover:scale-[1.01]"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
        <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold mb-1" style={{ color: theme.text }}>
        {value}
      </p>
      <div className="text-xs" style={{ color: theme.textSecondary }}>
        {sub}
      </div>
    </div>
  );
}
