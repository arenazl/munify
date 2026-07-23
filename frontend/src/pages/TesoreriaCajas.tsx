import { useEffect, useMemo, useState } from 'react';
import {
  PiggyBank, TrendingUp, TrendingDown, Wallet, Edit2, Plus,
  ArrowUpRight, ArrowDownRight, CreditCard,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ABMPage } from '../components/ui/ABMPage';
import PageHint from '../components/ui/PageHint';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { MunifyTour } from '../components/ui/MunifyTour';
import { TourButton } from '../components/ui/TourButton';
import type { KpiSpec } from '../components/ui/KpiCard';
import { cajasApi } from '../lib/api';
import type { Caja } from '../types';
import { PagarTarjetaModal } from '../components/tesoreria/PagarTarjetaModal';

const TOUR_STEPS = [
  {
    target: '[data-tour="cajas-kpis"]',
    content: 'Resumen total de las cajas del muni: saldo, ingresos y egresos acumulados.',
    title: 'Saldos en vivo',
    placement: 'bottom' as const,
    disableBeacon: true,
  },
  {
    target: '[data-tour="cajas-grid"]',
    content: 'Cada caja muestra su saldo actual con desglose (inicial, ingresos, egresos). Al cargar un gasto, la caja correspondiente se descuenta automáticamente.',
    title: 'Cajas del municipio',
    placement: 'top' as const,
  },
];

function fmtMoney(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v || 0);
  return `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function TesoreriaCajas() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Tarjeta que se está pagando (abre el sheet de pago). null = cerrado.
  const [pagando, setPagando] = useState<Caja | null>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await cajasApi.list({ activo: true, include_saldos: true });
      setCajas(res.data || []);
    } catch { toast.error('Error cargando cajas'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return cajas;
    const s = search.toLowerCase();
    return cajas.filter(c =>
      c.nombre.toLowerCase().includes(s) ||
      (c.codigo || '').toLowerCase().includes(s) ||
      (c.descripcion || '').toLowerCase().includes(s)
    );
  }, [cajas, search]);

  // KPIs: total saldo, total ingresos, total egresos
  const totales = useMemo(() => {
    let saldo = 0, ingresos = 0, egresos = 0;
    cajas.forEach(c => {
      saldo += parseFloat(c.saldo_actual || '0') || 0;
      ingresos += parseFloat(c.total_ingresos || '0') || 0;
      egresos += parseFloat(c.total_egresos || '0') || 0;
    });
    return { saldo, ingresos, egresos };
  }, [cajas]);

  const kpis: KpiSpec[] = [
    {
      label: 'Saldo total', value: fmtMoney(totales.saldo),
      icon: Wallet, color: theme.primary,
      footnote: `${cajas.length} cajas activas`,
      highlighted: true,
    },
    {
      label: 'Total ingresos', value: fmtMoney(totales.ingresos),
      icon: TrendingUp, color: '#10b981',
      footnote: 'Acumulado',
    },
    {
      label: 'Total egresos', value: fmtMoney(totales.egresos),
      icon: TrendingDown, color: '#ef4444',
      footnote: 'Acumulado',
    },
    {
      label: 'Disponible neto', value: fmtMoney(totales.saldo),
      icon: PiggyBank, color: '#3b82f6',
      footnote: 'Saldo inicial + ingresos − egresos',
    },
  ];

  // Guard de rol DESPUES de todos los hooks. Con el return temprano arriba, el
  // orden de hooks cambiaba entre renders y React rompe (error #310).
  if (user && user.rol !== 'admin' && user.rol !== 'supervisor') {
    return <div className="p-6"><p className="text-sm" style={{ color: theme.textSecondary }}>Solo gestores.</p></div>;
  }

  return (
    <>
      <PageHint pageId="tesoreria-cajas" />
    <ABMPage
      title="Cajas y Saldos"
      icon={<PiggyBank className="h-5 w-5" />}
      searchPlaceholder="Buscar por nombre, código o descripción..."
      searchValue={search}
      onSearchChange={setSearch}
      kpis={kpis}
      tourAnchors={{ kpis: 'cajas-kpis' }}
      loading={loading}
      isEmpty={filtered.length === 0}
      emptyMessage="No hay cajas. Creá una desde Configuración → Tesorería → Cajas."
      headerActions={
        <div className="inline-flex items-center gap-2">
          <TourButton tourKey="tesoreria-cajas" title="Ver tutorial de Cajas" />
          <Link
            to="/gestion/configuracion/tesoreria?tab=cajas"
            className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-lg text-[12px] font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary, border: `1px solid ${theme.primary}40` }}
            title="Crear o editar cajas en Configuración"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva caja
          </Link>
        </div>
      }
    >
      <div className="col-span-full" data-tour="cajas-grid" />
      {filtered.map(c => {
        const saldo = parseFloat(c.saldo_actual || '0') || 0;
        const ingresos = parseFloat(c.total_ingresos || '0') || 0;
        const egresos = parseFloat(c.total_egresos || '0') || 0;
        const saldoIni = parseFloat(c.saldo_inicial || '0') || 0;
        const color = c.color || theme.primary;
        // Tarjeta de crédito: el "saldo inicial" es el LÍMITE y el saldo actual
        // es el crédito DISPONIBLE (la deuda la calcula el backend).
        const esTarjeta = !!c.es_tarjeta;
        const deuda = parseFloat(c.deuda_actual || '0') || 0;
        return (
          <div
            key={c.id}
            className="rounded-2xl p-5 transition-all hover:scale-[1.005]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {/* Header: icono + nombre + codigo + editar */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {c.icono ? <DynamicIcon name={c.icono} className="h-6 w-6" /> : <PiggyBank className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold truncate" style={{ color: theme.text }}>{c.nombre}</h3>
                    {c.codigo && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {c.codigo}
                      </span>
                    )}
                  </div>
                  {c.descripcion && (
                    <p className="text-[11px] truncate" style={{ color: theme.textSecondary }}>{c.descripcion}</p>
                  )}
                </div>
              </div>
              <Link
                to={`/gestion/configuracion/tesoreria?tab=cajas`}
                className="p-1.5 rounded-md hover:opacity-70"
                style={{ color: theme.textSecondary }}
                title="Editar"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Saldo actual destacado */}
            <div
              className="rounded-xl p-3 mb-3"
              style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)`, border: `1px solid ${color}30` }}
            >
              <p className="text-[10px] uppercase font-bold" style={{ color: theme.textSecondary }}>
                {esTarjeta ? 'Crédito disponible' : 'Saldo actual'}
              </p>
              <p className="text-3xl font-bold tabular-nums" style={{ color }}>
                {fmtMoney(saldo)}
              </p>
              {esTarjeta && (
                <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                  Límite {fmtMoney(saldoIni)} · Deuda{' '}
                  <span className="font-semibold" style={{ color: deuda > 0 ? '#ef4444' : theme.textSecondary }}>
                    {fmtMoney(deuda)}
                  </span>
                </p>
              )}
            </div>

            {/* Desglose: inicial + ingresos − egresos */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span style={{ color: theme.textSecondary }}>{esTarjeta ? 'Límite' : 'Saldo inicial'}</span>
                <span className="tabular-nums" style={{ color: theme.text }}>{fmtMoney(saldoIni)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1" style={{ color: '#10b981' }}>
                  <ArrowUpRight className="h-3 w-3" /> {esTarjeta ? 'Pagos hechos' : 'Ingresos'}
                </span>
                <span className="tabular-nums font-semibold" style={{ color: '#10b981' }}>+ {fmtMoney(ingresos)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1" style={{ color: '#ef4444' }}>
                  <ArrowDownRight className="h-3 w-3" /> {esTarjeta ? 'Consumos' : 'Egresos'}
                </span>
                <span className="tabular-nums font-semibold" style={{ color: '#ef4444' }}>− {fmtMoney(egresos)}</span>
              </div>
            </div>

            {/* Pago de la tarjeta: cancela deuda y libera crédito. */}
            {esTarjeta && (
              <button
                type="button"
                onClick={() => setPagando(c)}
                className="w-full mt-3 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.01] active:scale-95"
                style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}40` }}
                title="Registrar un pago de esta tarjeta"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Pagar tarjeta
              </button>
            )}
          </div>
        );
      })}
    </ABMPage>
    <PagarTarjetaModal
      tarjeta={pagando}
      cajas={cajas}
      onClose={() => setPagando(null)}
      onDone={fetch}
    />
    <MunifyTour tourKey="tesoreria-cajas" steps={TOUR_STEPS} />
    </>
  );
}
