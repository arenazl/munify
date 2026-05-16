import { useMemo, useState } from 'react';
import { Building2, Calendar, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { ABMPage } from '../../components/ui/ABMPage';
import { PillsOrSelect } from '../../components/ui/PillsOrSelect';

// Suscripciones — vista superadmin (read-only) con el listado de
// municipios suscriptos, su plan, estado y proxima fecha de facturacion.
//
// DEMO DATA: los 6 municipios de abajo son placeholders (alias falsos)
// pensados para vender la demo. Cuando exista la tabla `suscripciones`
// en backend, reemplazar SUSCRIPCIONES_DEMO por un fetch a un endpoint
// real tipo /api/admin/suscripciones.

type EstadoSusc = 'activo' | 'trial' | 'vencido';

interface SuscripcionRow {
  id: number;
  alias: string;          // nombre comercial (demo)
  codigo: string;         // slug interno
  plan: 'Estandar' | 'Express' | 'Premium';
  estado: EstadoSusc;
  altaIso: string;        // fecha alta
  proximaFacturaIso: string; // proxima factura
  montoMensual: number;
}

// PLACEHOLDER: 6 municipios falsos para demo de venta. No representan
// clientes reales — son alias inventados con datos de ejemplo.
const SUSCRIPCIONES_DEMO: SuscripcionRow[] = [
  { id: 1, alias: 'San Pedro Norte',  codigo: 'sanpedro-n', plan: 'Express',  estado: 'activo',  altaIso: '2025-08-12', proximaFacturaIso: '2026-06-12', montoMensual: 1000000 },
  { id: 2, alias: 'Villa del Lago',   codigo: 'villalago',  plan: 'Premium',  estado: 'activo',  altaIso: '2025-06-03', proximaFacturaIso: '2026-06-03', montoMensual: 2500000 },
  { id: 3, alias: 'Los Algarrobos',   codigo: 'algarrobos', plan: 'Estandar', estado: 'trial',   altaIso: '2026-04-22', proximaFacturaIso: '2026-07-22', montoMensual: 0 },
  { id: 4, alias: 'Costa Brava',      codigo: 'costabrava', plan: 'Express',  estado: 'activo',  altaIso: '2025-11-09', proximaFacturaIso: '2026-06-09', montoMensual: 1000000 },
  { id: 5, alias: 'Sierra Chica',     codigo: 'sierra-c',   plan: 'Estandar', estado: 'activo',  altaIso: '2025-10-01', proximaFacturaIso: '2026-06-01', montoMensual: 1000000 },
  { id: 6, alias: 'Puerto Esperanza', codigo: 'pto-esp',    plan: 'Premium',  estado: 'vencido', altaIso: '2025-03-15', proximaFacturaIso: '2026-05-15', montoMensual: 2500000 },
];

const ESTADO_META: Record<EstadoSusc, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  activo:  { label: 'Activo',  color: '#22c55e', icon: CheckCircle2 },
  trial:   { label: 'Trial',   color: '#3b82f6', icon: Clock },
  vencido: { label: 'Vencido', color: '#ef4444', icon: AlertCircle },
};

const PLAN_COLOR: Record<SuscripcionRow['plan'], string> = {
  Estandar: '#64748b',
  Express:  '#3b82f6',
  Premium:  '#a855f7',
};

function formatFecha(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasHasta(iso: string) {
  const d = new Date(iso + 'T12:00:00').getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

export default function Suscripciones() {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoSusc | ''>('');

  const filtered = useMemo(() => {
    return SUSCRIPCIONES_DEMO.filter(s => {
      if (estadoFiltro && s.estado !== estadoFiltro) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.alias.toLowerCase().includes(q) && !s.codigo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, estadoFiltro]);

  const totales = useMemo(() => {
    const activos = SUSCRIPCIONES_DEMO.filter(s => s.estado === 'activo').length;
    const mrr = SUSCRIPCIONES_DEMO
      .filter(s => s.estado === 'activo')
      .reduce((acc, s) => acc + s.montoMensual, 0);
    return { activos, mrr, total: SUSCRIPCIONES_DEMO.length };
  }, []);

  const estadoOptions = [
    { value: '',        label: 'Todos' },
    { value: 'activo',  label: 'Activo',  color: ESTADO_META.activo.color },
    { value: 'trial',   label: 'Trial',   color: ESTADO_META.trial.color },
    { value: 'vencido', label: 'Vencido', color: ESTADO_META.vencido.color },
  ];

  const extraFilters = (
    <PillsOrSelect
      value={estadoFiltro}
      onChange={(v) => setEstadoFiltro(v as EstadoSusc | '')}
      options={estadoOptions}
      placeholder="Estado"
      size="sm"
    />
  );

  return (
    <>
      <ABMPage
        title="Suscripciones"
        icon={<Building2 className="h-5 w-5" />}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar municipio..."
        headerActions={extraFilters}
        isEmpty={filtered.length === 0}
        emptyMessage="No hay municipios que coincidan con el filtro."
        paginationSummary={(
          <div
            className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold" style={{ color: theme.textSecondary }}>
                Activos
              </span>
              <span className="text-lg font-bold tabular-nums" style={{ color: theme.primary }}>
                {totales.activos} <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>de {totales.total}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold" style={{ color: theme.textSecondary }}>
                MRR estimado
              </span>
              <span className="text-lg font-bold tabular-nums" style={{ color: theme.text }}>
                ${totales.mrr.toLocaleString('es-AR')}
              </span>
            </div>
            <div className="ml-auto text-[11px]" style={{ color: theme.textSecondary }}>
              Datos demo · placeholders
            </div>
          </div>
        )}
      >
        {filtered.map(s => {
          const meta = ESTADO_META[s.estado];
          const Icon = meta.icon;
          const dias = diasHasta(s.proximaFacturaIso);
          const planColor = PLAN_COLOR[s.plan];
          return (
            <div
              key={s.id}
              className="rounded-xl p-4 transition-all hover:shadow-md"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="font-bold text-base truncate" style={{ color: theme.text }}>
                    {s.alias}
                  </div>
                  <div className="text-[11px] font-mono" style={{ color: theme.textSecondary }}>
                    {s.codigo}
                  </div>
                </div>
                <span
                  className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 flex-shrink-0"
                  style={{ backgroundColor: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}40` }}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 mb-3">
                <span
                  className="text-xs font-bold px-2 py-1 rounded-md"
                  style={{ backgroundColor: `${planColor}15`, color: planColor, border: `1px solid ${planColor}40` }}
                >
                  Plan {s.plan}
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>
                  {s.montoMensual > 0 ? `$${s.montoMensual.toLocaleString('es-AR')}/mes` : 'Sin cargo'}
                </span>
              </div>

              <div
                className="text-xs flex items-center gap-1.5 pt-3"
                style={{ color: theme.textSecondary, borderTop: `1px solid ${theme.border}` }}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Próxima factura: <strong style={{ color: theme.text }}>{formatFecha(s.proximaFacturaIso)}</strong></span>
                {dias > 0 && dias <= 15 && (
                  <span className="ml-auto text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
                    en {dias}d
                  </span>
                )}
                {dias < 0 && (
                  <span className="ml-auto text-[10px] font-semibold" style={{ color: ESTADO_META.vencido.color }}>
                    hace {Math.abs(dias)}d
                  </span>
                )}
              </div>

              <div className="text-[11px] mt-2" style={{ color: theme.textSecondary }}>
                Alta: {formatFecha(s.altaIso)}
              </div>
            </div>
          );
        })}
      </ABMPage>
    </>
  );
}
