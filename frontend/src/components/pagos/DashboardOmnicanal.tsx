import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Smartphone, UserCog, TrendingUp, Trophy } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { pagosContaduriaApi } from '../../lib/api';
import { DateRangePicker, DateRange, currentMonthRange } from '../ui/DateRangePicker';

interface Data {
  por_canal: Array<{ canal: string; cantidad: number; monto: string }>;
  serie_temporal: Array<{
    fecha: string;
    app: number;
    ventanilla_asistida: number;
    otros: number;
    monto_app: string;
    monto_ventanilla: string;
  }>;
  ranking_operadores: Array<{
    operador_id: number;
    operador_nombre: string;
    tramites: number;
    monto: string;
  }>;
  total_aprobado_monto: string;
  total_aprobado_cantidad: number;
  ticket_promedio: string;
}

const CANAL_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  app: { label: 'App', color: '#3b82f6', icon: <Smartphone className="w-4 h-4" /> },
  ventanilla_asistida: { label: 'Ventanilla asistida', color: '#8b5cf6', icon: <UserCog className="w-4 h-4" /> },
  whatsapp: { label: 'WhatsApp', color: '#25d366', icon: <Smartphone className="w-4 h-4" /> },
};

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '$0';
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

export default function DashboardOmnicanal() {
  const { theme } = useTheme();
  const [range, setRange] = useState<DateRange>(currentMonthRange());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await pagosContaduriaApi.metricasCanal({
          fecha_desde: range.desde,
          fecha_hasta: range.hasta,
        });
        setData(r.data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [range.desde, range.hasta]);

  const totalCanal = useMemo(() => {
    if (!data) return 0;
    return data.por_canal.reduce((acc, c) => acc + c.cantidad, 0);
  }, [data]);

  const serieMaxMonto = useMemo(() => {
    if (!data) return 1;
    const maxs = data.serie_temporal.map((d) => Number(d.monto_app || 0) + Number(d.monto_ventanilla || 0));
    return Math.max(...maxs, 1);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
          Dashboard omnicanal · App vs Ventanilla
        </h3>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64" style={{ color: theme.textSecondary }}>
          Cargando…
        </div>
      ) : !data || data.total_aprobado_cantidad === 0 ? (
        <div className="flex items-center justify-center h-64" style={{ color: theme.textSecondary }}>
          No hay pagos aprobados en el rango seleccionado
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              color={theme.primary}
              icon={<TrendingUp className="w-4 h-4" />}
              label="Total aprobado"
              value={fmtMoney(data.total_aprobado_monto)}
              subtitle={`${data.total_aprobado_cantidad} pagos`}
            />
            <StatCard
              color="#22c55e"
              icon={<BarChart3 className="w-4 h-4" />}
              label="Ticket promedio"
              value={fmtMoney(data.ticket_promedio)}
            />
            <StatCard
              color="#8b5cf6"
              icon={<UserCog className="w-4 h-4" />}
              label="Operadores activos"
              value={String(data.ranking_operadores.length)}
              subtitle="con pagos en el rango"
            />
          </div>

          {/* Donut por canal (barras visuales) */}
          <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
            <h4 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: theme.textSecondary }}>
              Canales de cobro
            </h4>
            <div className="space-y-2">
              {data.por_canal.map((c) => {
                const meta = CANAL_META[c.canal] || { label: c.canal, color: '#6b7280', icon: null };
                const pct = totalCanal > 0 ? (c.cantidad / totalCanal) * 100 : 0;
                return (
                  <div key={c.canal} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-40 flex-shrink-0">
                      <span style={{ color: meta.color }}>{meta.icon}</span>
                      <span className="text-xs font-semibold">{meta.label}</span>
                    </div>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
                      <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${meta.color}, ${meta.color}aa)` }}
                      />
                    </div>
                    <div className="w-32 flex-shrink-0 text-right">
                      <span className="text-xs font-semibold tabular-nums">{fmtMoney(c.monto)}</span>
                      <span className="text-[10px] ml-1.5" style={{ color: theme.textSecondary }}>
                        {c.cantidad} · {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Serie temporal apilada App vs Ventanilla */}
          <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
            <h4 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: theme.textSecondary }}>
              Recaudación diaria
            </h4>
            <div className="flex items-end gap-1.5 h-40">
              {data.serie_temporal.map((d) => {
                const mApp = Number(d.monto_app || 0);
                const mVen = Number(d.monto_ventanilla || 0);
                const total = mApp + mVen;
                const hTotal = serieMaxMonto > 0 ? (total / serieMaxMonto) * 100 : 0;
                const pctApp = total > 0 ? (mApp / total) * 100 : 0;
                return (
                  <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.fecha}: ${fmtMoney(total)}`}>
                    <div className="w-full rounded-t transition-all" style={{ height: `${hTotal}%`, minHeight: total > 0 ? 4 : 0 }}>
                      <div style={{ height: `${pctApp}%`, backgroundColor: '#3b82f6' }} className="rounded-t-sm" />
                      <div style={{ height: `${100 - pctApp}%`, backgroundColor: '#8b5cf6' }} />
                    </div>
                    <span className="text-[9px] tabular-nums truncate max-w-[40px]" style={{ color: theme.textSecondary }}>
                      {d.fecha.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#3b82f6' }} />
                App
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#8b5cf6' }} />
                Ventanilla asistida
              </span>
            </div>
          </div>

          {/* Ranking operadores */}
          {data.ranking_operadores.length > 0 && (
            <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4" style={{ color: '#f59e0b' }} />
                <h4 className="text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
                  Top operadores de ventanilla
                </h4>
              </div>
              <div className="space-y-1.5">
                {data.ranking_operadores.map((op, idx) => (
                  <div
                    key={op.operador_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : theme.border,
                        color: idx < 3 ? 'white' : theme.textSecondary,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm font-semibold truncate">{op.operador_nombre}</span>
                    <span className="text-xs" style={{ color: theme.textSecondary }}>
                      {op.tramites} pagos
                    </span>
                    <span className="text-xs font-bold tabular-nums w-28 text-right">{fmtMoney(op.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  color,
  icon,
  label,
  value,
  subtitle,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  const { theme } = useTheme();
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>
          {label}
        </span>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>
          {icon}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {subtitle && (
        <p className="text-[11px]" style={{ color: theme.textSecondary }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
