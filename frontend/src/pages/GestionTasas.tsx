import { useEffect, useState, useMemo } from 'react';
import { Receipt, AlertCircle, CheckCircle2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { tasasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { ABMPage } from '../components/ui/ABMPage';
import { FilterChipRow, FilterChip } from '../components/ui/StickyPageHeader';
import PageHint from '../components/ui/PageHint';
import type { Partida, TipoTasa } from '../types';

/**
 * Gestión de Tasas — vista del admin/supervisor con todas las partidas del
 * municipio. Permite filtrar por tipo de tasa y buscar por identificador,
 * DNI o nombre del titular.
 */
export default function GestionTasas() {
  const { theme } = useTheme();
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [tipos, setTipos] = useState<TipoTasa[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    tasasApi.getTipos().then(r => setTipos(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    tasasApi
      .listarPartidas({
        tipo_tasa_id: tipoFiltro ?? undefined,
        q: searchQuery || undefined,
        limit: 200,
      })
      .then(r => setPartidas(r.data || []))
      .catch(err => {
        console.error(err);
        toast.error('No se pudieron cargar las partidas');
      })
      .finally(() => setLoading(false));
  }, [tipoFiltro, searchQuery]);

  const debounce = (fn: (v: string) => void) => {
    let t: ReturnType<typeof setTimeout>;
    return (v: string) => {
      clearTimeout(t);
      t = setTimeout(() => fn(v), 300);
    };
  };

  const onSearchChange = useMemo(() => debounce((v: string) => setSearchQuery(v)), []);

  const totales = useMemo(() => {
    const totalMonto = partidas.reduce((s, p) => s + Number(p.monto_pendiente || 0), 0);
    const conDeuda = partidas.filter(p => (p.deudas_pendientes || 0) > 0).length;
    return { totalMonto, conDeuda, total: partidas.length };
  }, [partidas]);

  // Chips de tipos de tasa con conteo por tipo
  const filterChips: FilterChip[] = useMemo(() => tipos.map(t => ({
    key: String(t.id),
    label: t.nombre,
    color: t.color,
    icon: <DynamicIcon name={t.icono} className="h-3.5 w-3.5" />,
    count: partidas.filter(p => p.tipo_tasa?.id === t.id).length,
  })), [tipos, partidas]);

  const emptyMsg = searchQuery || tipoFiltro ? 'Sin resultados' : 'No hay partidas cargadas';

  return (
    <>
      <PageHint pageId="gestion-tasas" />
      <ABMPage
        title="Tasas"
        icon={<Wallet className="h-5 w-5" />}
        backLink="/gestion/ajustes"
        searchPlaceholder="Buscar por identificador, DNI o titular..."
        searchValue={searchInput}
        onSearchChange={(v) => { setSearchInput(v); onSearchChange(v); }}
        loading={loading}
        isEmpty={partidas.length === 0}
        emptyMessage={emptyMsg}
        secondaryFilters={
          <FilterChipRow
            chips={filterChips}
            activeKey={tipoFiltro != null ? String(tipoFiltro) : null}
            onChipClick={(key) => setTipoFiltro(key ? Number(key) : null)}
            allLabel="Todas"
            allIcon={<Receipt className="h-4 w-4" />}
          />
        }
      >
        {/* Resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <ResumenCard
            icon={<Receipt className="h-4 w-4" />}
            label="Partidas"
            value={String(totales.total)}
            color={theme.primary}
            theme={theme}
          />
          <ResumenCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="Con deuda"
            value={String(totales.conDeuda)}
            color="#ef4444"
            theme={theme}
          />
          <ResumenCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Monto adeudado"
            value={fmtPlata(totales.totalMonto)}
            color="#10b981"
            theme={theme}
          />
        </div>

        {/* Lista */}
        <div className="space-y-2">
          {partidas.map(p => (
            <PartidaRow key={p.id} partida={p} theme={theme} />
          ))}
        </div>
      </ABMPage>
    </>
  );
}

// ============================================================

function ResumenCard({
  icon, label, value, color, theme,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  theme: { text: string; textSecondary: string; card: string; border: string };
}) {
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: theme.textSecondary }}>
          {label}
        </p>
        <p className="text-base font-bold truncate" style={{ color: theme.text }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function PartidaRow({
  partida, theme,
}: {
  partida: Partida;
  theme: { text: string; textSecondary: string; card: string; border: string; primary: string };
}) {
  const color = partida.tipo_tasa?.color || theme.primary;
  const icono = partida.tipo_tasa?.icono || 'Receipt';
  const tienePendientes = (partida.deudas_pendientes || 0) > 0;
  const objetoResumen = getObjetoResumen(partida);
  const asociado = !!partida.titular_user_id;

  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3 transition-all hover:scale-[1.005]"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${tienePendientes ? color + '40' : theme.border}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`, color: '#fff' }}
      >
        <DynamicIcon name={icono} className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm" style={{ color: theme.text }}>
            {partida.tipo_tasa?.nombre || 'Tasa'}
          </p>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {partida.identificador}
          </span>
          {asociado && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#10b98120', color: '#10b981' }}
            >
              Asociada
            </span>
          )}
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: theme.textSecondary }}>
          {partida.titular_nombre || 'Sin titular'}
          {partida.titular_dni && ` · DNI ${partida.titular_dni}`}
        </p>
        {objetoResumen && (
          <p className="text-xs truncate mt-0.5" style={{ color: theme.textSecondary }}>
            {objetoResumen}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        {tienePendientes ? (
          <>
            <p className="text-sm font-bold" style={{ color: '#ef4444' }}>
              {fmtPlata(partida.monto_pendiente || 0)}
            </p>
            <p className="text-[11px]" style={{ color: theme.textSecondary }}>
              {partida.deudas_pendientes} {partida.deudas_pendientes === 1 ? 'boleta' : 'boletas'}
            </p>
          </>
        ) : (
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full"
            style={{ backgroundColor: '#10b98120', color: '#10b981' }}
          >
            Al día
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function fmtPlata(v: string | number): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v)) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
}

function getObjetoResumen(partida: Partida): string {
  const obj = (partida.objeto || {}) as Record<string, unknown>;
  if (obj.direccion) return String(obj.direccion);
  if (obj.dominio) return `${obj.marca || ''} ${obj.modelo || ''} · ${obj.dominio}`.trim();
  if (obj.infraccion) return String(obj.infraccion);
  if (obj.razon_social) return String(obj.razon_social);
  return '';
}
