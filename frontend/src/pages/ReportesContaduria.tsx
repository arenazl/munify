import { useEffect, useState } from 'react';
import { BarChart3, AlertTriangle, Calendar, TrendingUp, Loader2, Download, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import PageHint from '../components/ui/PageHint';

const TOUR_STEPS = [
  {
    target: '[data-tour="rep-cont"]',
    content: 'Cuatro listados clave: OPs vencidas (rojo), próximas a vencer en 7 días (amarillo), top beneficiarios del mes y evolución mensual con gráfico de barras.',
    title: 'Reportes de Contaduría',
    placement: 'top' as const,
    disableBeacon: true,
  },
];
import { StatusPill } from '../components/ui/StatusPill';
import { ordenesPagoApi } from '../lib/api';

async function descargarTransparencia(formato: 'json' | 'csv') {
  try {
    const res = await ordenesPagoApi.exportTransparencia({ formato, solo_pagadas: true });
    const blob = new Blob([res.data], {
      type: formato === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fechaHoy = new Date().toISOString().slice(0, 10);
    a.download = `transparencia_ejecucion_gasto_${fechaHoy}.${formato}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportado ${formato.toUpperCase()}`);
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || 'Error exportando');
  }
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fmtMoney(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function ReportesContaduria() {
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
        const res = await ordenesPagoApi.reportes();
        setData(res.data);
      } catch { /* ok */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} /></div>
  );

  const { vencidas = [], proximas = [], top_beneficiarios = [], mensuales = [] } = data || {};
  const maxMonto = Math.max(...mensuales.map((m: any) => parseFloat(m.monto || '0')), 1);

  return (
    <>
    <PageHint pageId="contaduria-reportes" />
    <ABMPage
      title="Reportes de Contaduría"
      icon={<BarChart3 className="h-5 w-5" />}
      searchPlaceholder=""
      searchValue=""
      onSearchChange={() => {}}
      headerActions={<TourButton tourKey="contaduria-reportes" title="Ver tutorial de Reportes" />}
      loading={false}
      isEmpty={false}
      emptyMessage=""
    >
      <div className="col-span-full space-y-4" data-tour="rep-cont">
        {/* Portal de Transparencia: export JSON/CSV */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}10 0%, ${theme.card} 60%, ${theme.card} 100%)`,
            border: `1px solid ${theme.primary}30`,
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
          >
            <Globe className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm" style={{ color: theme.text }}>
              Portal de Transparencia
            </h3>
            <p className="text-[11px] leading-relaxed" style={{ color: theme.textSecondary }}>
              Descargá la ejecución del gasto (solo OPs pagadas) en formato abierto para publicar en la web del muni.
              Incluye beneficiario, concepto, monto bruto/neto, retenciones, fecha de pago e imputación contable.
              Sin IDs internos, sin datos sensibles.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <button
              onClick={() => descargarTransparencia('json')}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </button>
            <button
              onClick={() => descargarTransparencia('csv')}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
        </div>

        {/* Vencidas */}
        <Section
          title="OPs vencidas"
          subtitle={`${vencidas.length} órdenes con vencimiento pasado sin pagar`}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="#ef4444"
        >
          {vencidas.length === 0 ? (
            <Empty msg="Ninguna OP vencida. Excelente." />
          ) : (
            <OPList items={vencidas} dateField="fecha_vencimiento" theme={theme} />
          )}
        </Section>

        {/* Próximas */}
        <Section
          title="Próximas a vencer (7 días)"
          subtitle={`${proximas.length} OPs por vencer pronto`}
          icon={<Calendar className="h-4 w-4" />}
          accent="#f59e0b"
        >
          {proximas.length === 0 ? (
            <Empty msg="Sin OPs por vencer en los próximos 7 días." />
          ) : (
            <OPList items={proximas} dateField="fecha_vencimiento" theme={theme} />
          )}
        </Section>

        {/* Top beneficiarios */}
        <Section
          title="Top beneficiarios del mes"
          subtitle="Quiénes recibieron más plata este mes"
          icon={<TrendingUp className="h-4 w-4" />}
          accent={theme.primary}
        >
          {top_beneficiarios.length === 0 ? (
            <Empty msg="Sin OPs autorizadas o pagadas este mes." />
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
              {top_beneficiarios.map((b: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < top_beneficiarios.length - 1 ? `1px solid ${theme.border}` : undefined }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                    >
                      {i + 1}
                    </span>
                    <span className="font-medium text-sm truncate" style={{ color: theme.text }}>{b.nombre}</span>
                    <span className="text-[11px]" style={{ color: theme.textSecondary }}>
                      {b.cantidad} OP{b.cantidad === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(b.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Mensuales */}
        <Section
          title="Evolución mensual"
          subtitle="OPs autorizadas/pagadas en los últimos 6 meses"
          icon={<BarChart3 className="h-4 w-4" />}
          accent={theme.primary}
        >
          {mensuales.length === 0 ? (
            <Empty msg="Sin datos históricos suficientes." />
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
                      {m.cantidad} OPs
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </ABMPage>
    <MunifyTour tourKey="contaduria-reportes" steps={TOUR_STEPS} />
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

function OPList({ items, dateField, theme }: any) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      {items.map((op: any, i: number) => (
        <div
          key={op.id}
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: i < items.length - 1 ? `1px solid ${theme.border}` : undefined }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-[11px] font-semibold" style={{ color: theme.primary }}>{op.numero}</span>
            <span className="font-medium text-sm truncate" style={{ color: theme.text }}>
              {op.contacto_nombre || op.dependencia_nombre || '—'}
            </span>
            <StatusPill label={op.estado} color={op.estado === 'pendiente' ? '#f59e0b' : '#3b82f6'} size="xs" />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-[11px]" style={{ color: theme.textSecondary }}>
              {dateField === 'fecha_vencimiento' && op.fecha_vencimiento
                ? `Vence: ${new Date(op.fecha_vencimiento).toLocaleDateString('es-AR')}`
                : ''}
            </span>
            <span className="font-bold tabular-nums" style={{ color: theme.text }}>{fmtMoney(op.monto_pesos)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
