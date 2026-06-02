import { useEffect, useState } from 'react';
import { BarChart3, PiggyBank, Tag, Building2, TrendingUp, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import PageHint from '../components/ui/PageHint';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';

const TOUR_STEPS = [
  {
    target: '[data-tour="rep-tes"]',
    content: 'Cuatro vistas del gasto del muni: egresos por caja (barras de %), top conceptos del mes, top dependencias y evolución mensual.',
    title: 'Reportes de Tesorería',
    placement: 'top' as const,
    disableBeacon: true,
  },
];
import { gastosApi } from '../lib/api';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function ReportesTesoreria() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await gastosApi.reportes();
        setData(res.data);
      } catch { /* ok */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>
  );

  const { por_caja = [], top_conceptos = [], top_dependencias = [], mensuales = [] } = data || {};
  const totalMes = por_caja.reduce((s: number, c: any) => s + parseFloat(c.monto || '0'), 0);
  const maxMonto = Math.max(...mensuales.map((m: any) => parseFloat(m.monto || '0')), 1);

  return (
    <>
      <PageHint pageId="tesoreria-reportes" />
    <ABMPage
      title="Reportes de Tesorería"
      icon={<BarChart3 className="h-5 w-5" />}
      searchPlaceholder=""
      searchValue=""
      onSearchChange={() => {}}
      headerActions={<TourButton tourKey="tesoreria-reportes" title="Ver tutorial de Reportes" />}
      loading={false}
      isEmpty={false}
      emptyMessage=""
    >
      <div className="col-span-full space-y-4" data-tour="rep-tes">
        {/* Egresos por caja */}
        <Section
          title="Egresos por caja (mes actual)"
          subtitle={`Total mes: ${fmtMoney(totalMes)}`}
          icon={<PiggyBank className="h-4 w-4" />}
          accent={theme.primary}
        >
          {por_caja.length === 0 ? (
            <Empty msg="Sin egresos cargados este mes." />
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {por_caja.map((c: any, i: number) => {
                const pct = totalMes > 0 ? (parseFloat(c.monto) / totalMes) * 100 : 0;
                const color = c.color || theme.primary;
                return (
                  <div key={c.id} className="px-4 py-3" style={{ borderBottom: i < por_caja.length - 1 ? `1px solid ${theme.border}` : undefined }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm" style={{ color: theme.text }}>{c.nombre}</span>
                      <div className="text-right">
                        <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(c.monto)}</span>
                        <span className="text-[11px] ml-2" style={{ color: theme.textSecondary }}>
                          {c.cantidad} mov · {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Top conceptos */}
        <Section
          title="Top conceptos del mes"
          subtitle="Qué se gastó más este mes"
          icon={<Tag className="h-4 w-4" />}
          accent="#10b981"
        >
          {top_conceptos.length === 0 ? (
            <Empty msg="Sin gastos cargados este mes." />
          ) : (
            <RankingList items={top_conceptos.map((c: any) => ({
              label: c.concepto, sub: `${c.cantidad} gasto${c.cantidad === 1 ? '' : 's'}`, monto: c.monto,
            }))} accent="#10b981" />
          )}
        </Section>

        {/* Top dependencias */}
        <Section
          title="Top dependencias del mes"
          subtitle="Qué secretarías recibieron más gasto asignado"
          icon={<Building2 className="h-4 w-4" />}
          accent="#3b82f6"
        >
          {top_dependencias.length === 0 ? (
            <Empty msg="Sin gastos a dependencias este mes." />
          ) : (
            <RankingList items={top_dependencias.map((d: any) => ({
              label: d.nombre, sub: `${d.cantidad} gasto${d.cantidad === 1 ? '' : 's'}`, monto: d.monto,
            }))} accent="#3b82f6" />
          )}
        </Section>

        {/* Mensuales */}
        <Section
          title="Evolución mensual"
          subtitle="Últimos 6 meses de gasto total"
          icon={<TrendingUp className="h-4 w-4" />}
          accent={theme.primary}
        >
          {mensuales.length === 0 ? (
            <Empty msg="Sin datos históricos." />
          ) : (
            <div className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {mensuales.map((m: any) => {
                const pct = (parseFloat(m.monto) / maxMonto) * 100;
                return (
                  <div key={`${m.anio}-${m.mes}`} className="flex items-center gap-3 py-2">
                    <span className="text-xs font-semibold w-16 flex-shrink-0" style={{ color: theme.textSecondary }}>
                      {MESES[m.mes - 1]} {String(m.anio).slice(2)}
                    </span>
                    <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
                      <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: theme.primary }} />
                    </div>
                    <span className="text-xs font-bold tabular-nums w-32 text-right flex-shrink-0" style={{ color: theme.text }}>
                      {fmtMoney(m.monto)}
                    </span>
                    <span className="text-[10px] w-16 text-right" style={{ color: theme.textSecondary }}>
                      {m.cantidad} mov
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </ABMPage>
    <MunifyTour tourKey="tesoreria-reportes" steps={TOUR_STEPS} />
    </>
  );
}

function Section({ title, subtitle, icon, accent, children }: any) {
  const { theme } = useTheme();
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}20`, color: accent }}>
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-sm" style={{ color: theme.text }}>{title}</h3>
          <p className="text-[11px]" style={{ color: theme.textSecondary }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  const { theme } = useTheme();
  return (
    <div className="rounded-xl p-4 text-center text-xs" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
      {msg}
    </div>
  );
}

function RankingList({ items, accent }: { items: { label: string; sub: string; monto: string }[]; accent: string }) {
  const { theme } = useTheme();
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      {items.map((it, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: i < items.length - 1 ? `1px solid ${theme.border}` : undefined }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: `${accent}20`, color: accent }}
            >
              {i + 1}
            </span>
            <span className="font-medium text-sm truncate" style={{ color: theme.text }}>{it.label}</span>
            <span className="text-[11px]" style={{ color: theme.textSecondary }}>{it.sub}</span>
          </div>
          <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(it.monto)}</span>
        </div>
      ))}
    </div>
  );
}
