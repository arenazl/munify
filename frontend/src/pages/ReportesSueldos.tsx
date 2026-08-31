import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Calendar, Repeat, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader } from '../components/abmv2/PageHeader';
import { SemanticHero } from '../components/ui/SemanticHero';
import type { HeroFrase } from '../lib/semanticHero';
import { seg } from '../lib/semanticHero';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import { agendaPagosApi } from '../lib/api';

const TOUR_STEPS = [
  {
    target: '[data-tour="rep-sue-kpis"]',
    content: 'KPIs del muni: masa salarial total, empleados activos y cantidad de liquidaciones programadas.',
    title: 'KPIs de Sueldos',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
  {
    target: '[data-tour="rep-sue"]',
    content: 'Tres bloques: ranking de sueldos más altos, distribución por frecuencia (mensual/quincenal/etc.) y próximos pagos en 30 días.',
    title: 'Análisis de Sueldos',
    placement: 'top' as const,
    disableBeacon: true,
  },
];

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function ReportesSueldos() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);


  useEffect(() => {
    (async () => {
      try {
        const res = await agendaPagosApi.reportes();
        setData(res.data);
      } catch { /* ok */ }
      finally { setLoading(false); }
    })();
  }, []);

  /* Los hooks del hero van ANTES de cualquier return: abajo se llamaban
     condicionalmente y eso es el React #310 en runtime (regla 16). */
  const heroFrases = useMemo<HeroFrase[]>(() => {
    const emp = Number(data?.cantidad_empleados ?? 0);
    const liq = Number(data?.cantidad_pagos_activos ?? 0);
    if (!emp) {
      return [{ segmentos: [
        seg('Todavía no hay empleados con liquidación:'),
        seg('la masa salarial del mes está en cero.', 'advertencia'),
      ] }];
    }
    return [{ segmentos: [
      seg(`${fmtMoney(data?.masa_salarial_mes ?? '0')} de masa salarial este mes`, 'bueno'),
      seg(`entre ${emp} ${emp === 1 ? 'empleado' : 'empleados'} y ${liq} ${liq === 1 ? 'liquidación activa' : 'liquidaciones activas'}.`),
    ] }];
  }, [data]);

  const heroKpis = useMemo(() => ([
    { etiqueta: 'Masa salarial', valor: fmtMoney(data?.masa_salarial_mes ?? '0') },
    { etiqueta: 'Empleados', valor: String(data?.cantidad_empleados ?? 0) },
    { etiqueta: 'Liquidaciones', valor: String(data?.cantidad_pagos_activos ?? 0) },
  ]), [data]);

  /* El guard de rol va DESPUES de los hooks: arriba cortaba el render antes
     de llamarlos y React tira el #310 (regla 16, lo atrapa eslint y no tsc). */
  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>
  );


  // Los tres numeros del hero salen de `data`; aca quedan los del cuerpo.
  const { top_sueldos = [], proximos_pagos = [], frecuencias = [] } = data || {};
  const totalFrecuencias = frecuencias.reduce((s: number, f: any) => s + parseFloat(f.monto || '0'), 0);

  return (
    <>
    <div className="av2-page" data-module="sueldos">
      <PageHeader
        eyebrow="Sueldos"
        title="Reportes de Sueldos"
        description="La masa salarial del mes, quiénes cobran más y qué liquidaciones están activas."
      />
      <div className="av2-hero-wrap">
        <SemanticHero
          etiqueta="SUELDOS · MES ACTUAL"
          frases={heroFrases}
          kpis={heroKpis}
          className="av2-hero"
        />
      </div>
      <div className="av2-page-acciones">
        <TourButton tourKey="sueldos-reportes" title="Ver tutorial de Reportes" />
      </div>
      <div className="col-span-full space-y-4" data-tour="rep-sue">
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
    </div>
    <MunifyTour tourKey="sueldos-reportes" steps={TOUR_STEPS} />
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
