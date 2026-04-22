import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, CheckCircle2, Clock, XCircle, TrendingUp, Download,
  CreditCard, QrCode, Receipt, ArrowRightLeft, Repeat2, Building2, FileText,
  History, ClipboardCheck, BarChart3,
} from 'lucide-react';
import { ABMPage, ABMTable, ABMTableColumn } from '../components/ui/ABMPage';
import { DateRangePicker, DateRange, currentMonthRange } from '../components/ui/DateRangePicker';
import { ModernSelect } from '../components/ui/ModernSelect';
import { useTheme } from '../contexts/ThemeContext';
import { pagosContaduriaApi } from '../lib/api';
import { dependenciasApi } from '../lib/api';
import ColaImputacion from '../components/pagos/ColaImputacion';
import DashboardOmnicanal from '../components/pagos/DashboardOmnicanal';
import PageHint from '../components/ui/PageHint';

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------
interface PagoItem {
  session_id: string;
  fecha: string | null;
  concepto: string;
  origen: 'tramite' | 'tasa' | 'otro';
  monto: string;
  medio_pago: string | null;
  estado: string;
  provider: string;
  external_id: string | null;
  dependencia_id: number | null;
  dependencia_nombre: string | null;
  vecino_id: number | null;
  vecino_nombre: string | null;
  vecino_email: string | null;
}

interface ResumenMedio {
  medio_pago: string;
  monto: string;
  cantidad: number;
}

interface Resumen {
  totales: {
    monto_aprobado: string;
    monto_pendiente: string;
    monto_rechazado: string;
    cantidad_aprobados: number;
    cantidad_pendientes: number;
    cantidad_rechazados: number;
    ticket_promedio: string;
  };
  por_medio: ResumenMedio[];
}

interface DependenciaOption {
  id: number;
  nombre: string;
}

// ------------------------------------------------------------
// Constantes y helpers
// ------------------------------------------------------------
const ESTADOS_OPCIONES = [
  { value: 'approved', label: 'Aprobados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'in_checkout', label: 'En checkout' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'expired', label: 'Expirados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const MEDIOS_OPCIONES = [
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'qr', label: 'QR', icon: QrCode },
  { value: 'efectivo_cupon', label: 'Efectivo / Cupón', icon: Receipt },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowRightLeft },
  { value: 'debito_automatico', label: 'Débito automático', icon: Repeat2 },
];

const ORIGEN_OPCIONES = [
  { value: 'all', label: 'Todos' },
  { value: 'tramite', label: 'Trámites' },
  { value: 'tasa', label: 'Tasas' },
];

const estadoLabels: Record<string, string> = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  in_checkout: 'En checkout',
  rejected: 'Rechazado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

const estadoColors: Record<string, string> = {
  approved: '#22c55e',
  pending: '#f59e0b',
  in_checkout: '#3b82f6',
  rejected: '#ef4444',
  expired: '#6b7280',
  cancelled: '#6b7280',
};

const medioLabels: Record<string, string> = {
  tarjeta: 'Tarjeta',
  qr: 'QR',
  efectivo_cupon: 'Efectivo',
  transferencia: 'Transferencia',
  debito_automatico: 'Débito auto.',
};

function formatMoney(raw: string | number): string {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) return '$0';
  return n.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ------------------------------------------------------------
// Componente
// ------------------------------------------------------------
type TabKey = 'historial' | 'imputacion' | 'dashboard';

export default function GestionPagos() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<TabKey>('historial');

  // Filtros
  const [range, setRange] = useState<DateRange>(currentMonthRange());
  const [estados, setEstados] = useState<string[]>(['approved']);
  const [medios, setMedios] = useState<string[]>([]);
  const [origen, setOrigen] = useState<'all' | 'tramite' | 'tasa'>('all');
  const [dependenciaId, setDependenciaId] = useState<number | ''>('');
  const [search, setSearch] = useState('');

  // Datos
  const [items, setItems] = useState<PagoItem[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [dependencias, setDependencias] = useState<DependenciaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Cargar dependencias habilitadas (una sola vez)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await dependenciasApi.getMunicipio({ activo: true });
        const raw = Array.isArray(res.data) ? res.data : [];
        const opts: DependenciaOption[] = raw
          .map((d: unknown) => {
            const x = d as { id?: number; nombre?: string; dependencia?: { nombre?: string } };
            return {
              id: Number(x.id),
              nombre: x.dependencia?.nombre || x.nombre || `#${x.id}`,
            };
          })
          .filter((d: DependenciaOption) => Number.isFinite(d.id));
        setDependencias(opts);
      } catch {
        setDependencias([]);
      }
    };
    load();
  }, []);

  const buildParams = useMemo(() => {
    return () => {
      const p: Record<string, unknown> = {};
      // Solo incluir fechas si tienen valor — mandar string vacío rompe
      // el parseo de Optional[date] en Pydantic con 422.
      if (range.desde) p.fecha_desde = range.desde;
      if (range.hasta) p.fecha_hasta = range.hasta;
      if (estados.length) p.estado = estados;
      if (medios.length) p.medio_pago = medios;
      if (origen !== 'all') p.origen = origen;
      if (dependenciaId) p.dependencia_id = dependenciaId;
      if (search.trim()) p.search = search.trim();
      return p;
    };
  }, [range, estados, medios, origen, dependenciaId, search]);

  // Cargar datos cuando cambian filtros (solo en tab historial)
  useEffect(() => {
    if (tab !== 'historial') return;
    const fetch = async () => {
      setLoading(true);
      try {
        const params = buildParams();
        const [listarRes, resumenRes] = await Promise.all([
          pagosContaduriaApi.listar({ ...params, page: 1, page_size: 100 }),
          pagosContaduriaApi.resumen(params),
        ]);
        setItems((listarRes.data as { items: PagoItem[] }).items || []);
        setResumen(resumenRes.data as Resumen);
      } catch {
        setItems([]);
        setResumen(null);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [buildParams, tab]);

  const handleExportar = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      const res = await pagosContaduriaApi.exportar(params);
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagos_${range.desde}_${range.hasta}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const toggleArr = (arr: string[], v: string, setter: (x: string[]) => void) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  // Cards de totales
  const cards = resumen ? [
    {
      title: 'Total aprobado',
      value: formatMoney(resumen.totales.monto_aprobado),
      subtitle: `${resumen.totales.cantidad_aprobados} pagos`,
      icon: CheckCircle2,
      color: '#22c55e',
    },
    {
      title: 'Pendientes',
      value: formatMoney(resumen.totales.monto_pendiente),
      subtitle: `${resumen.totales.cantidad_pendientes} intentos`,
      icon: Clock,
      color: '#f59e0b',
    },
    {
      title: 'Rechazados',
      value: formatMoney(resumen.totales.monto_rechazado),
      subtitle: `${resumen.totales.cantidad_rechazados} fallidos`,
      icon: XCircle,
      color: '#ef4444',
    },
    {
      title: 'Ticket promedio',
      value: formatMoney(resumen.totales.ticket_promedio),
      subtitle: 'Por pago aprobado',
      icon: TrendingUp,
      color: theme.primary,
    },
  ] : [];

  // Columnas tabla
  const columns: ABMTableColumn<PagoItem>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      render: (it) => <span className="text-xs whitespace-nowrap">{formatDate(it.fecha)}</span>,
      sortValue: (it) => it.fecha || '',
    },
    {
      key: 'concepto',
      header: 'Concepto',
      render: (it) => (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
            style={{ backgroundColor: `${theme.primary}15` }}
            title={it.origen === 'tramite' ? 'Trámite' : it.origen === 'tasa' ? 'Tasa' : 'Otro'}
          >
            {it.origen === 'tramite' ? (
              <FileText className="w-3.5 h-3.5" style={{ color: theme.primary }} />
            ) : (
              <Receipt className="w-3.5 h-3.5" style={{ color: theme.primary }} />
            )}
          </span>
          <span className="truncate" title={it.concepto}>{it.concepto}</span>
        </div>
      ),
      sortValue: (it) => it.concepto,
    },
    {
      key: 'monto',
      header: 'Monto',
      className: 'text-right',
      render: (it) => (
        <span className="font-semibold tabular-nums" style={{ color: theme.text }}>
          {formatMoney(it.monto)}
        </span>
      ),
      sortValue: (it) => Number(it.monto) || 0,
    },
    {
      key: 'medio_pago',
      header: 'Medio',
      render: (it) => (
        <span className="text-xs">{it.medio_pago ? medioLabels[it.medio_pago] || it.medio_pago : '—'}</span>
      ),
      sortValue: (it) => it.medio_pago || '',
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (it) => {
        const color = estadoColors[it.estado] || '#6b7280';
        const label = estadoLabels[it.estado] || it.estado;
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{ backgroundColor: `${color}20`, color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        );
      },
      sortValue: (it) => it.estado,
    },
    {
      key: 'dependencia',
      header: 'Dependencia',
      render: (it) => (
        <span className="text-xs truncate" title={it.dependencia_nombre || ''}>
          {it.dependencia_nombre || '—'}
        </span>
      ),
      sortValue: (it) => it.dependencia_nombre || '',
    },
    {
      key: 'vecino',
      header: 'Vecino',
      render: (it) => (
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium truncate">{it.vecino_nombre || '—'}</span>
          {it.vecino_email && (
            <span className="text-[10px] truncate" style={{ color: theme.textSecondary }}>
              {it.vecino_email}
            </span>
          )}
        </div>
      ),
      sortValue: (it) => it.vecino_nombre || '',
    },
    {
      key: 'external_id',
      header: 'N° Op.',
      render: (it) => (
        <span className="text-[11px] font-mono" style={{ color: theme.textSecondary }}>
          {it.external_id || '—'}
        </span>
      ),
      sortable: false,
    },
  ];

  // Secondary filters: chips de estado + medio + origen + dependencia
  const secondaryFilters = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />

        <div className="min-w-[140px]">
          <ModernSelect
            value={origen}
            onChange={(v) => setOrigen((v || 'all') as 'all' | 'tramite' | 'tasa')}
            options={ORIGEN_OPCIONES.map((o) => ({ value: o.value, label: o.label }))}
            placeholder="Origen"
          />
        </div>

        <div className="min-w-[220px]">
          <ModernSelect
            value={dependenciaId === '' ? '' : String(dependenciaId)}
            onChange={(v) => setDependenciaId(v ? Number(v) : '')}
            options={[
              { value: '', label: 'Todas las dependencias' },
              ...dependencias.map((d) => ({ value: String(d.id), label: d.nombre })),
            ]}
            placeholder="Todas las dependencias"
            searchable={dependencias.length > 8}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: theme.textSecondary }}>
          Estados:
        </span>
        {ESTADOS_OPCIONES.map((o) => {
          const active = estados.includes(o.value);
          return (
            <button
              key={o.value}
              onClick={() => toggleArr(estados, o.value, setEstados)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: active ? `${estadoColors[o.value]}25` : theme.backgroundSecondary,
                color: active ? estadoColors[o.value] : theme.textSecondary,
                border: `1px solid ${active ? estadoColors[o.value] : theme.border}`,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider mr-1" style={{ color: theme.textSecondary }}>
          Medios:
        </span>
        {MEDIOS_OPCIONES.map((o) => {
          const active = medios.includes(o.value);
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              onClick={() => toggleArr(medios, o.value, setMedios)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: active ? `${theme.primary}20` : theme.backgroundSecondary,
                color: active ? theme.primary : theme.textSecondary,
                border: `1px solid ${active ? theme.primary : theme.border}`,
              }}
            >
              <Icon className="w-3 h-3" />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Stat cards
  const statCards = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.title}
            className="rounded-xl p-4 relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              className="absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8 opacity-10"
              style={{ backgroundColor: c.color }}
            />
            <div className="flex items-start justify-between relative z-10">
              <div className="min-w-0">
                <p className="text-xs font-medium mb-1 truncate" style={{ color: theme.textSecondary }}>
                  {c.title}
                </p>
                <p className="text-2xl font-bold tabular-nums truncate" style={{ color: theme.text }} title={c.value}>
                  {c.value}
                </p>
                <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                  {c.subtitle}
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${c.color}20` }}
              >
                <Icon className="w-5 h-5" style={{ color: c.color }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Breakdown por medio (barra horizontal simple)
  const porMedio = resumen?.por_medio || [];
  const totalMix = porMedio.reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const mixBreakdown = porMedio.length > 0 && (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
          Mix de cobros por medio
        </span>
        <span className="text-[11px]" style={{ color: theme.textSecondary }}>
          Total aprobado: {formatMoney(totalMix)}
        </span>
      </div>
      <div className="space-y-2">
        {porMedio.map((m) => {
          const pct = totalMix > 0 ? (Number(m.monto) / totalMix) * 100 : 0;
          const opt = MEDIOS_OPCIONES.find((o) => o.value === m.medio_pago);
          const Icon = opt?.icon || CreditCard;
          return (
            <div key={m.medio_pago} className="flex items-center gap-3">
              <div className="flex items-center gap-2 w-36 flex-shrink-0">
                <Icon className="w-3.5 h-3.5" style={{ color: theme.primary }} />
                <span className="text-xs font-medium truncate">{medioLabels[m.medio_pago] || m.medio_pago}</span>
              </div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryHover})` }}
                />
              </div>
              <div className="w-28 flex-shrink-0 text-right">
                <span className="text-xs font-semibold tabular-nums">{formatMoney(m.monto)}</span>
                <span className="text-[10px] ml-1.5" style={{ color: theme.textSecondary }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="w-10 flex-shrink-0 text-right">
                <span className="text-[11px]" style={{ color: theme.textSecondary }}>{m.cantidad}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const headerActions = tab === 'historial' ? (
    <button
      onClick={handleExportar}
      disabled={exporting || items.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
      style={{
        backgroundColor: theme.backgroundSecondary,
        color: theme.text,
        border: `1px solid ${theme.border}`,
      }}
      title="Exportar resultado actual a CSV"
    >
      <Download className="w-4 h-4" />
      {exporting ? 'Exportando…' : 'Exportar CSV'}
    </button>
  ) : null;

  const tabsSwitcher = (
    <div className="space-y-3 w-full">
      <PageHint pageId="gestion-pagos" />
      <div
        className="inline-flex items-center rounded-lg p-1 gap-1"
        style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
      >
      {([
        { key: 'historial', label: 'Historial', icon: History },
        { key: 'imputacion', label: 'Cola de imputación', icon: ClipboardCheck },
        { key: 'dashboard', label: 'Dashboard omnicanal', icon: BarChart3 },
      ] as const).map((t) => {
        const active = tab === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200"
            style={{
              backgroundColor: active ? theme.card : 'transparent',
              color: active ? theme.primary : theme.textSecondary,
              boxShadow: active ? `0 1px 2px ${theme.border}` : 'none',
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        );
      })}
      </div>
    </div>
  );

  if (tab === 'imputacion') {
    return (
      <ABMPage
        title="Gestión de Pagos"
        icon={<Wallet className="w-5 h-5" />}
        searchPlaceholder=""
        searchValue=""
        onSearchChange={() => {}}
        secondaryFilters={tabsSwitcher}
        headerActions={null}
        loading={false}
        isEmpty={false}
        emptyMessage=""
        tableView={<ColaImputacion />}
      >
        <ColaImputacion />
      </ABMPage>
    );
  }

  if (tab === 'dashboard') {
    return (
      <ABMPage
        title="Gestión de Pagos"
        icon={<Wallet className="w-5 h-5" />}
        searchPlaceholder=""
        searchValue=""
        onSearchChange={() => {}}
        secondaryFilters={tabsSwitcher}
        headerActions={null}
        loading={false}
        isEmpty={false}
        emptyMessage=""
        tableView={<DashboardOmnicanal />}
      >
        <DashboardOmnicanal />
      </ABMPage>
    );
  }

  return (
    <ABMPage
      title="Gestión de Pagos"
      icon={<Wallet className="w-5 h-5" />}
      searchPlaceholder="Buscar por concepto o N° de operación…"
      searchValue={search}
      onSearchChange={setSearch}
      secondaryFilters={
        <div className="flex flex-col gap-3">
          {tabsSwitcher}
          {secondaryFilters}
        </div>
      }
      headerActions={headerActions}
      loading={loading && !resumen}
      isEmpty={!loading && items.length === 0}
      emptyMessage="No hay pagos para el rango y filtros seleccionados"
      tableView={(
        <div className="space-y-4">
          {statCards}
          {mixBreakdown}
          <ABMTable
            data={items}
            columns={columns}
            keyExtractor={(it) => it.session_id}
            defaultSortKey="fecha"
            defaultSortDirection="desc"
            renderMobileCard={(it) => (
              <div
                className="rounded-xl p-3"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{it.concepto}</p>
                    <p className="text-[11px]" style={{ color: theme.textSecondary }}>{formatDate(it.fecha)}</p>
                  </div>
                  <span className="text-base font-bold tabular-nums">{formatMoney(it.monto)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${estadoColors[it.estado] || '#6b7280'}20`,
                      color: estadoColors[it.estado] || '#6b7280',
                    }}
                  >
                    {estadoLabels[it.estado] || it.estado}
                  </span>
                  <span style={{ color: theme.textSecondary }}>
                    {it.medio_pago ? medioLabels[it.medio_pago] || it.medio_pago : '—'}
                  </span>
                </div>
                {(it.dependencia_nombre || it.vecino_nombre) && (
                  <div className="mt-2 pt-2 flex items-center justify-between text-[11px]" style={{ borderTop: `1px solid ${theme.border}` }}>
                    <div className="flex items-center gap-1 min-w-0">
                      <Building2 className="w-3 h-3 flex-shrink-0" style={{ color: theme.textSecondary }} />
                      <span className="truncate" style={{ color: theme.textSecondary }}>
                        {it.dependencia_nombre || '—'}
                      </span>
                    </div>
                    <span className="truncate ml-2" style={{ color: theme.textSecondary }}>
                      {it.vecino_nombre || ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          />
        </div>
      )}
    >
      {/* Vista cards (fallback cuando el usuario toggleea) */}
      {statCards}
    </ABMPage>
  );
}
