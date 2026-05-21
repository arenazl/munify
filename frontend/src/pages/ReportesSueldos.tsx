import { useEffect, useState } from 'react';
import { BarChart3, Users, Briefcase, Calendar, Repeat, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import { agendaPagosApi } from '../lib/api';

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function ReportesSueldos() {
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
        const res = await agendaPagosApi.reportes();
        setData(res.data);
      } catch { /* ok */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>
  );

  const { masa_salarial_mes = '0', cantidad_empleados = 0, cantidad_pagos_activos = 0,
          top_sueldos = [], proximos_pagos = [], frecuencias = [] } = data || {};
  const totalFrecuencias = frecuencias.reduce((s: number, f: any) => s + parseFloat(f.monto || '0'), 0);

  return (
    <ABMPage
      title="Reportes de Sueldos"
      icon={<BarChart3 className="h-5 w-5" />}
      searchPlaceholder=""
      searchValue=""
      onSearchChange={() => {}}
      loading={false}
      isEmpty={false}
      emptyMessage=""
      kpis={[
        {
          label: 'Masa salarial', value: fmtMoney(masa_salarial_mes),
          icon: Briefcase, color: theme.primary,
          footnote: 'Suma de liquidaciones activas',
          highlighted: true,
        },
        {
          label: 'Empleados activos', value: String(cantidad_empleados),
          icon: Users, color: '#3b82f6', footnote: 'Contactos tipo=empleado',
        },
        {
          label: 'Liquidaciones', value: String(cantidad_pagos_activos),
          icon: Repeat, color: '#10b981', footnote: 'Pagos programados activos',
        },
      ]}
    >
      <div className="col-span-full space-y-4">
        {/* Top sueldos */}
        <Section title="Top sueldos" subtitle="Empleados con mayor sueldo base" icon={<Briefcase className="h-4 w-4" />} accent={theme.primary}>
          {top_sueldos.length === 0 ? (
            <Empty msg="No hay liquidaciones cargadas." />
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {top_sueldos.map((s: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < top_sueldos.length - 1 ? `1px solid ${theme.border}` : undefined }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: theme.text }}>{s.nombre}</p>
                      <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                        {s.concepto} · {s.frecuencia}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(s.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Frecuencias */}
        <Section title="Distribución por frecuencia" subtitle="Cuántas liquidaciones hay de cada tipo" icon={<Repeat className="h-4 w-4" />} accent="#3b82f6">
          {frecuencias.length === 0 ? (
            <Empty msg="Sin liquidaciones activas." />
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {frecuencias.map((f: any, i: number) => {
                const pct = totalFrecuencias > 0 ? (parseFloat(f.monto) / totalFrecuencias) * 100 : 0;
                return (
                  <div key={f.frecuencia} className="px-4 py-3" style={{ borderBottom: i < frecuencias.length - 1 ? `1px solid ${theme.border}` : undefined }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm capitalize" style={{ color: theme.text }}>{f.frecuencia}</span>
                      <div className="text-right">
                        <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(f.monto)}</span>
                        <span className="text-[11px] ml-2" style={{ color: theme.textSecondary }}>
                          {f.cantidad} liq · {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: '#3b82f6' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Próximos pagos */}
        <Section title="Próximos pagos (30 días)" subtitle="Liquidaciones que vencen pronto" icon={<Calendar className="h-4 w-4" />} accent="#f59e0b">
          {proximos_pagos.length === 0 ? (
            <Empty msg="Sin pagos próximos en los próximos 30 días." />
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {proximos_pagos.slice(0, 20).map((p: any, i: number) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < Math.min(proximos_pagos.length, 20) - 1 ? `1px solid ${theme.border}` : undefined }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-12 text-center px-1 py-0.5 rounded-md text-[10px] uppercase font-bold leading-tight flex-shrink-0"
                      style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
                    >
                      <div className="text-base font-bold" style={{ color: theme.text }}>
                        {new Date(p.proximo_pago).getDate().toString().padStart(2, '0')}
                      </div>
                      <div>{new Date(p.proximo_pago).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</div>
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: theme.text }}>{p.contacto_nombre}</p>
                      <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>{p.concepto}</p>
                    </div>
                  </div>
                  <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(p.monto_pesos)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </ABMPage>
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
