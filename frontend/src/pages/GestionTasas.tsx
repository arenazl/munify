import { useEffect, useState, useMemo } from 'react';
import { Loader2, Receipt, AlertCircle, CheckCircle2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { tasasApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
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

  return (
    <div className="space-y-4">
      <StickyPageHeader
        backLink="/gestion/ajustes"
        icon={<Wallet className="h-5 w-5" />}
        title="Tasas"
        searchPlaceholder="Buscar por identificador, DNI o titular..."
        searchValue={searchInput}
        onSearchChange={(v) => { setSearchInput(v); onSearchChange(v); }}
        filterPanel={
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setTipoFiltro(null)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 transition-all hover:scale-[1.03]"
              style={{
                backgroundColor: tipoFiltro === null ? `${theme.primary}20` : 'transparent',
                color: tipoFiltro === null ? theme.primary : theme.textSecondary,
                border: `1.5px solid ${tipoFiltro === null ? theme.primary : theme.border}`,
              }}
            >
              Todas
              <span className="text-[10px] font-bold opacity-80">{partidas.length}</span>
            </button>
            {tipos.map(t => {
              const isActive = tipoFiltro === t.id;
              const cnt = partidas.filter(p => p.tipo_tasa?.id === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={() => setTipoFiltro(t.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 transition-all hover:scale-[1.03]"
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, ${t.color}, ${t.color}dd)`
                      : `${t.color}12`,
                    border: `1px solid ${isActive ? t.color : `${t.color}40`}`,
                    color: isActive ? '#ffffff' : theme.text,
                  }}
                >
                  <DynamicIcon name={t.icono} className="h-3 w-3" style={{ color: isActive ? '#ffffff' : t.color }} />
                  <span className="whitespace-nowrap">{t.nombre}</span>
                  {cnt > 0 && (
                    <span
                      className="text-[10px] font-bold px-1 rounded-full"
                      style={{
                        backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${t.color}25`,
                        color: isActive ? '#ffffff' : t.color,
                      }}
                    >
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
      />

      <div className="px-3 sm:px-6 space-y-4 max-w-5xl mx-auto">
        {/* Resumen */}
        {!loading && partidas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ResumenCard
              icon={<Receipt className="h-5 w-5" />}
              label="Partidas"
              value={String(totales.total)}
              color={theme.primary}
              theme={theme}
            />
            <ResumenCard
              icon={<AlertCircle className="h-5 w-5" />}
              label="Con deuda"
              value={String(totales.conDeuda)}
              color="#ef4444"
              theme={theme}
            />
            <ResumenCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Monto adeudado"
              value={fmtPlata(totales.totalMonto)}
              color="#10b981"
              theme={theme}
            />
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : partidas.length === 0 ? (
          <EmptyState theme={theme} hasFilter={!!(tipoFiltro || searchQuery)} />
        ) : (
          <div className="space-y-2">
            {partidas.map(p => (
              <PartidaRow key={p.id} partida={p} theme={theme} />
            ))}
          </div>
        )}
      </div>
    </div>
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
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{
        background: `linear-gradient(135deg, ${color}15 0%, ${theme.card} 60%)`,
        border: `1px solid ${color}40`,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider font-medium" style={{ color: theme.textSecondary }}>
          {label}
        </p>
        <p className="text-xl font-bold truncate" style={{ color: theme.text }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, color, theme, children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  theme: { text: string; textSecondary: string; card: string; border: string };
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-[1.02] active:scale-95"
      style={{
        backgroundColor: active ? `${color}25` : theme.card,
        color: active ? color : theme.textSecondary,
        border: `1px solid ${active ? color : theme.border}`,
      }}
    >
      {children}
    </button>
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
      className="rounded-2xl p-4 flex items-center gap-3 transition-all hover:scale-[1.005]"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${tienePendientes ? color + '40' : theme.border}`,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
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

function EmptyState({
  theme, hasFilter,
}: {
  theme: { text: string; textSecondary: string; backgroundSecondary: string };
  hasFilter: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ backgroundColor: theme.backgroundSecondary }}
    >
      <Receipt className="h-12 w-12 mx-auto mb-3" style={{ color: theme.textSecondary }} />
      <h3 className="font-semibold" style={{ color: theme.text }}>
        {hasFilter ? 'Sin resultados' : 'No hay partidas cargadas'}
      </h3>
      <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
        {hasFilter
          ? 'Probá ajustando los filtros o la búsqueda.'
          : 'Importá el padrón desde Ajustes para empezar.'}
      </p>
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
