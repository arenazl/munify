import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity, AlertCircle, RefreshCw, X, Clock, Filter, Trash2, Loader2,
  ChevronDown, ChevronUp, ArrowUpDown, Layers, List as ListIcon,
  Flame, XCircle, Sparkles, Lock,
} from 'lucide-react';
import { auditApi, municipiosApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import PageHint from '../../components/ui/PageHint';
import type {
  AuditFilters, AuditLogItem, AuditLogDetail, AuditStats,
  AuditGroupedRow,
} from '../../types/audit';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
}

const STATUS_STYLE = (code: number) => {
  if (code >= 500) return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' };
  if (code >= 400) return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
  if (code >= 300) return { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' };
  return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
};

const METHOD_STYLE: Record<string, { bg: string; color: string }> = {
  GET: { bg: '#f1f5f9', color: '#334155' },
  POST: { bg: '#dbeafe', color: '#1d4ed8' },
  PUT: { bg: '#fef3c7', color: '#b45309' },
  DELETE: { bg: '#fee2e2', color: '#b91c1c' },
  PATCH: { bg: '#ede9fe', color: '#6d28d9' },
};

function formatTime(iso: string): string {
  // Backend a veces serializa UTC sin tz-suffix. Forzamos UTC si no hay 'Z' ni offset.
  const needsUtc = iso && !/(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(needsUtc ? iso + 'Z' : iso);
  const now = Date.now();
  const diff = Math.max(0, (now - d.getTime()) / 1000);
  if (diff < 60) return `hace ${Math.floor(diff)}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Presets rápidos para la barra superior
const PRESETS = [
  { id: 'slow', label: 'Más lentas hoy', icon: Flame, filters: { duracion_min_ms: undefined, order_by: 'duracion_ms', order_dir: 'desc', status_code_min: undefined } as AuditFilters, description: 'Ordena por duración descendente' },
  { id: 'errors', label: 'Errores recientes', icon: XCircle, filters: { status_code_min: 400, order_by: 'created_at', order_dir: 'desc' } as AuditFilters, description: 'Status ≥ 400 en los últimos registros' },
  { id: 'demos', label: 'Creaciones de demo', icon: Sparkles, filters: { action: ['demo.creado'], order_by: 'created_at', order_dir: 'desc' } as AuditFilters, description: 'action = demo.creado' },
  { id: 'logins', label: 'Logins', icon: Lock, filters: { action: ['auth.login'], order_by: 'created_at', order_dir: 'desc' } as AuditFilters, description: 'action = auth.login' },
];

// Rango de latencia: presets
const LAT_PRESETS = [
  { id: 'all', label: 'Todas', min: undefined, max: undefined },
  { id: 'fast', label: '< 200ms', min: undefined, max: 200 },
  { id: 'normal', label: '200ms - 1s', min: 200, max: 1000 },
  { id: 'slow', label: '> 1s', min: 1000, max: undefined },
  { id: 'very-slow', label: '> 5s', min: 5000, max: undefined },
];

// Rango de fechas
const PERIOD_PRESETS = [
  { id: '1h', label: 'Última hora', hours: 1 },
  { id: '24h', label: 'Últimas 24h', hours: 24 },
  { id: '7d', label: '7 días', hours: 24 * 7 },
  { id: 'all', label: 'Todo', hours: null as number | null },
];

type ViewMode = 'list' | 'grouped';
type StatusBucket = '2xx' | '3xx' | '4xx' | '5xx';

export default function AuditLogs() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [view, setView] = useState<ViewMode>('list');
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [grouped, setGrouped] = useState<AuditGroupedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<AuditLogDetail | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // Buckets de status (quick toggle)
  const [statusBuckets, setStatusBuckets] = useState<Set<StatusBucket>>(new Set());

  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    limit: 50,
    order_by: 'created_at',
    order_dir: 'desc',
  });

  const isSuperAdmin = user?.is_super_admin || (user?.rol === 'admin' && !user?.municipio_id);

  // Computar filtros efectivos a partir de buckets de status
  const effectiveFilters = useMemo<AuditFilters>(() => {
    const f = { ...filters };
    if (statusBuckets.size > 0) {
      const ranges = Array.from(statusBuckets).map((b) => ({
        min: parseInt(b[0]) * 100,
        max: parseInt(b[0]) * 100 + 99,
      }));
      f.status_code_min = Math.min(...ranges.map((r) => r.min));
      f.status_code_max = Math.max(...ranges.map((r) => r.max));
    }
    return f;
  }, [filters, statusBuckets]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'grouped') {
        const res = await auditApi.grouped({
          municipio_id: effectiveFilters.municipio_id,
          desde: effectiveFilters.desde,
          hasta: effectiveFilters.hasta,
          method: effectiveFilters.method,
          order_by: (effectiveFilters.order_by as any) === 'duracion_ms' ? 'p95_ms' : 'p95_ms',
          order_dir: effectiveFilters.order_dir,
          limit: 100,
        });
        setGrouped(res.data.items);
        setTotal(res.data.total);
      } else {
        const res = await auditApi.list(effectiveFilters);
        setLogs(res.data.items);
        setTotal(res.data.total);
      }
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error cargando logs');
    } finally {
      setLoading(false);
    }
  }, [effectiveFilters, view]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await auditApi.stats({
        municipio_id: effectiveFilters.municipio_id,
        desde: effectiveFilters.desde,
        hasta: effectiveFilters.hasta,
      });
      setStats(res.data);
    } catch (e) {
      console.error('Error stats:', e);
    }
  }, [effectiveFilters.municipio_id, effectiveFilters.desde, effectiveFilters.hasta]);

  const fetchActions = useCallback(async () => {
    try {
      const res = await auditApi.distinct('action');
      setAvailableActions(res.data.values.filter((v) => v));
    } catch {
      setAvailableActions([]);
    }
  }, []);

  const fetchMunicipios = useCallback(async () => {
    try {
      const res = await municipiosApi.getPublic();
      setMunicipios(res.data);
    } catch {
      // ignore
    }
  }, []);

  const fetchDebugMode = useCallback(async () => {
    try {
      const res = await auditApi.getDebugMode();
      setDebugMode(res.data.enabled);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchMunicipios();
    fetchDebugMode();
    fetchActions();
  }, [isSuperAdmin, fetchMunicipios, fetchDebugMode, fetchActions]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchLogs();
    fetchStats();
  }, [isSuperAdmin, fetchLogs, fetchStats]);

  useEffect(() => {
    if (!autoRefresh || !isSuperAdmin) return;
    const id = setInterval(() => { fetchLogs(); fetchStats(); }, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, isSuperAdmin, fetchLogs, fetchStats]);

  const handleToggleDebug = async () => {
    const newValue = !debugMode;
    if (newValue && !confirm('Activar modo debug captura todos los GETs y request bodies. ¿Continuar?')) return;
    try {
      await auditApi.setDebugMode(newValue);
      setDebugMode(newValue);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error cambiando debug mode');
    }
  };

  const handleOpenDetail = async (id: number) => {
    try {
      const res = await auditApi.detail(id);
      setSelectedDetail(res.data);
    } catch {
      // ignore
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Borrar logs de más de 30 días. ¿Continuar?')) return;
    try {
      const res = await auditApi.cleanup(30);
      alert(`Borrados: ${res.data.deleted} logs`);
      fetchLogs();
      fetchStats();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error en cleanup');
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setFilters({
      page: 1,
      limit: 50,
      order_by: 'created_at',
      order_dir: 'desc',
      ...preset.filters,
    });
    setStatusBuckets(new Set());
  };

  const toggleStatusBucket = (b: StatusBucket) => {
    setStatusBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next;
    });
  };

  const setPeriod = (hours: number | null) => {
    if (hours == null) {
      setFilters((f) => ({ ...f, desde: undefined, hasta: undefined, page: 1 }));
    } else {
      const d = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      setFilters((f) => ({ ...f, desde: d, hasta: undefined, page: 1 }));
    }
  };

  const setLatPreset = (min?: number, max?: number) => {
    setFilters((f) => ({ ...f, duracion_min_ms: min, duracion_max_ms: max, page: 1 }));
  };

  const clearAllFilters = () => {
    setFilters({ page: 1, limit: 50, order_by: 'created_at', order_dir: 'desc' });
    setStatusBuckets(new Set());
  };

  const toggleSort = (col: AuditFilters['order_by']) => {
    setFilters((f) => ({
      ...f,
      order_by: col,
      order_dir: f.order_by === col && f.order_dir === 'desc' ? 'asc' : 'desc',
      page: 1,
    }));
  };

  const updateFilter = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  };

  // Chips de filtros activos
  const activeChips = useMemo(() => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    if (filters.municipio_id) {
      const m = municipios.find((x) => x.id === filters.municipio_id);
      chips.push({ label: `Muni: ${m?.nombre || filters.municipio_id}`, onRemove: () => updateFilter('municipio_id', undefined) });
    }
    if (filters.path) chips.push({ label: `Path: ${filters.path}`, onRemove: () => updateFilter('path', undefined) });
    if (filters.action?.length) chips.push({ label: `Acción: ${filters.action.join(', ')}`, onRemove: () => updateFilter('action', undefined) });
    if (filters.method?.length) chips.push({ label: `Método: ${filters.method.join(', ')}`, onRemove: () => updateFilter('method', undefined) });
    if (statusBuckets.size) chips.push({ label: `Status: ${Array.from(statusBuckets).join(', ')}`, onRemove: () => setStatusBuckets(new Set()) });
    if (filters.duracion_min_ms || filters.duracion_max_ms) {
      const r = `${filters.duracion_min_ms ?? 0}${filters.duracion_max_ms ? '-' + filters.duracion_max_ms : '+'} ms`;
      chips.push({ label: `Latencia: ${r}`, onRemove: () => setFilters((f) => ({ ...f, duracion_min_ms: undefined, duracion_max_ms: undefined, page: 1 })) });
    }
    if (filters.desde) chips.push({ label: `Desde: ${new Date(filters.desde).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, onRemove: () => updateFilter('desde', undefined) });
    return chips;
  }, [filters, statusBuckets, municipios]);

  if (!isSuperAdmin) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-3" style={{ color: '#f59e0b' }} />
        <h2 className="text-xl font-bold" style={{ color: theme.text }}>Acceso restringido</h2>
        <p className="mt-2" style={{ color: theme.textSecondary }}>
          Esta sección es solo para super admin.
        </p>
      </div>
    );
  }

  const cardStyle = { backgroundColor: theme.card, border: `1px solid ${theme.border}` };
  const inputStyle = { backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}` };

  const SortHeader = ({ col, label, numeric }: { col: NonNullable<AuditFilters['order_by']>; label: string; numeric?: boolean }) => {
    const active = filters.order_by === col;
    const Icon = active ? (filters.order_dir === 'desc' ? ChevronDown : ChevronUp) : ArrowUpDown;
    return (
      <th
        className={`px-3 py-2 font-medium cursor-pointer select-none hover:bg-black/5 transition-colors ${numeric ? 'text-right' : 'text-left'}`}
        style={{ color: active ? theme.primary : theme.textSecondary }}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <Icon className="h-3 w-3" />
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <PageHint pageId="audit-logs" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
            <Activity className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>Consola de auditoría</h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>Logs cross-municipio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Vista toggle */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ backgroundColor: view === 'list' ? theme.primary : theme.card, color: view === 'list' ? '#fff' : theme.text }}
            >
              <ListIcon className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              onClick={() => setView('grouped')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ backgroundColor: view === 'grouped' ? theme.primary : theme.card, color: view === 'grouped' ? '#fff' : theme.text }}
            >
              <Layers className="h-3.5 w-3.5" />
              Agrupado
            </button>
          </div>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={{
              backgroundColor: autoRefresh ? `${theme.primary}15` : theme.card,
              borderColor: autoRefresh ? theme.primary : theme.border,
              color: autoRefresh ? theme.primary : theme.textSecondary,
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </button>
          <button
            onClick={() => { fetchLogs(); fetchStats(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={{ ...cardStyle, color: theme.textSecondary }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recargar
          </button>
          <button
            onClick={handleCleanup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={{ backgroundColor: theme.card, borderColor: '#fecaca', color: '#dc2626' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpiar &gt;30d
          </button>
        </div>
      </div>

      {/* Presets grandes */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              title={p.description}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:shadow-md"
              style={{ ...cardStyle, color: theme.text }}
            >
              <Icon className="h-4 w-4" style={{ color: theme.primary }} />
              {p.label}
            </button>
          );
        })}
        <button
          onClick={clearAllFilters}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:bg-black/5"
          style={{ ...cardStyle, color: theme.textSecondary }}
        >
          Todas
        </button>
      </div>

      {/* Toggle debug mode */}
      <div
        className="flex items-center justify-between gap-4 p-4 rounded-xl border"
        style={{
          backgroundColor: debugMode ? '#fef3c71a' : theme.card,
          borderColor: debugMode ? '#fde68a' : theme.border,
        }}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: theme.text }}>Modo debug</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: debugMode ? '#fde68a' : theme.border, color: debugMode ? '#78350f' : theme.textSecondary }}
            >
              {debugMode ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
            {debugMode ? 'Capturando GETs + request bodies.' : 'Solo POST/PUT/DELETE/PATCH y errores.'}
          </p>
        </div>
        <button
          onClick={handleToggleDebug}
          className="relative w-14 h-8 rounded-full transition-colors"
          style={{ backgroundColor: debugMode ? '#f59e0b' : theme.border }}
        >
          <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${debugMode ? 'left-7' : 'left-1'}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Requests</div>
            <div className="text-2xl font-bold" style={{ color: theme.text }}>{stats.total_requests.toLocaleString()}</div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Errores</div>
            <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>{stats.error_count}</div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Latencia p50</div>
            <div className="text-2xl font-bold" style={{ color: theme.text }}>{stats.p50_ms} <span className="text-sm font-normal" style={{ color: theme.textSecondary }}>ms</span></div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Latencia p95</div>
            <div className="text-2xl font-bold" style={{ color: '#b45309' }}>{stats.p95_ms} <span className="text-sm font-normal" style={{ color: theme.textSecondary }}>ms</span></div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Status</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(stats.requests_by_status).map(([k, v]) => v > 0 && (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded" style={{
                  backgroundColor: k === '2xx' ? '#dcfce7' : k === '4xx' ? '#fef3c7' : k === '5xx' ? '#fee2e2' : theme.border,
                  color: k === '2xx' ? '#15803d' : k === '4xx' ? '#b45309' : k === '5xx' ? '#b91c1c' : theme.textSecondary,
                }}>{k}: {v}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl p-4 border space-y-3" style={cardStyle}>
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: theme.text }}>
          <Filter className="h-4 w-4" />
          Filtros
        </div>

        {/* Row 1: muni, path, acción */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Municipio</label>
            <select
              value={filters.municipio_id ?? ''}
              onChange={(e) => updateFilter('municipio_id', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            >
              <option value="">Todos los municipios</option>
              {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Endpoint (contiene)</label>
            <input
              type="text"
              value={filters.path ?? ''}
              onChange={(e) => updateFilter('path', e.target.value || undefined)}
              placeholder="ej: /reclamos o /crear-demo"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Acción semántica</label>
            <select
              value={filters.action?.[0] ?? ''}
              onChange={(e) => updateFilter('action', e.target.value ? [e.target.value] : undefined)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            >
              <option value="">Todas las acciones</option>
              {availableActions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: métodos, status buckets */}
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Método HTTP</label>
            <div className="flex flex-wrap gap-1.5">
              {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => {
                const selected = filters.method?.includes(m);
                const st = METHOD_STYLE[m];
                return (
                  <button
                    key={m}
                    onClick={() => {
                      const cur = filters.method || [];
                      const next = selected ? cur.filter((x) => x !== m) : [...cur, m];
                      updateFilter('method', next.length ? next : undefined);
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: selected ? st.bg : 'transparent',
                      color: selected ? st.color : theme.textSecondary,
                      borderColor: selected ? st.color : theme.border,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Status</label>
            <div className="flex flex-wrap gap-1.5">
              {(['2xx', '3xx', '4xx', '5xx'] as StatusBucket[]).map((b) => {
                const selected = statusBuckets.has(b);
                const code = parseInt(b[0]) * 100;
                const st = STATUS_STYLE(code);
                const labels: Record<StatusBucket, string> = { '2xx': 'Éxitos', '3xx': 'Redirect', '4xx': 'Error cliente', '5xx': 'Error servidor' };
                return (
                  <button
                    key={b}
                    onClick={() => toggleStatusBucket(b)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: selected ? st.bg : 'transparent',
                      color: selected ? st.color : theme.textSecondary,
                      borderColor: selected ? st.color : theme.border,
                    }}
                  >
                    {b} · {labels[b]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 3: latencia + periodo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Latencia</label>
            <div className="flex flex-wrap gap-1.5">
              {LAT_PRESETS.map((p) => {
                const selected = filters.duracion_min_ms === p.min && filters.duracion_max_ms === p.max;
                return (
                  <button
                    key={p.id}
                    onClick={() => setLatPreset(p.min, p.max)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: selected ? `${theme.primary}15` : 'transparent',
                      color: selected ? theme.primary : theme.textSecondary,
                      borderColor: selected ? theme.primary : theme.border,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Período</label>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_PRESETS.map((p) => {
                const active = p.hours == null
                  ? !filters.desde
                  : filters.desde && (Date.now() - new Date(filters.desde).getTime()) / 3600000 >= (p.hours - 0.5);
                return (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.hours)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                    style={{
                      backgroundColor: active ? `${theme.primary}15` : 'transparent',
                      color: active ? theme.primary : theme.textSecondary,
                      borderColor: active ? theme.primary : theme.border,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Chips de filtros activos */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: theme.textSecondary }}>Filtros activos:</span>
          {activeChips.map((chip, i) => (
            <button
              key={i}
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border"
              style={{ backgroundColor: `${theme.primary}10`, borderColor: theme.primary, color: theme.primary }}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-xs underline"
            style={{ color: theme.textSecondary }}
          >
            Limpiar todos
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm border" style={{ backgroundColor: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* Tabla */}
      {view === 'list' ? (
        <div className="rounded-xl overflow-hidden border" style={cardStyle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: theme.backgroundSecondary, borderBottom: `1px solid ${theme.border}` }}>
                <tr>
                  <SortHeader col="created_at" label="Tiempo" />
                  <SortHeader col="municipio_id" label="Municipio" />
                  <SortHeader col="usuario_email" label="Usuario" />
                  <SortHeader col="method" label="Método" />
                  <SortHeader col="path" label="Path" />
                  <SortHeader col="status_code" label="Status" />
                  <SortHeader col="duracion_ms" label="Duración" numeric />
                  <SortHeader col="action" label="Acción" />
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: theme.textSecondary }} /></td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12" style={{ color: theme.textSecondary }}>Sin logs para los filtros aplicados</td></tr>
                ) : logs.map((log) => {
                  const statusSt = STATUS_STYLE(log.status_code);
                  const methodSt = METHOD_STYLE[log.method] || { bg: theme.border, color: theme.text };
                  return (
                    <tr
                      key={log.id}
                      onClick={() => handleOpenDetail(log.id)}
                      className="cursor-pointer"
                      style={{ borderBottom: `1px solid ${theme.border}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.backgroundSecondary)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textSecondary }}>
                        <Clock className="h-3 w-3 inline mr-1" />{formatTime(log.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
                          {log.municipio_nombre || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: theme.textSecondary }}>
                        {log.usuario_email || <span style={{ opacity: 0.6 }}>anon</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: methodSt.bg, color: methodSt.color }}>
                          {log.method}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-[280px]" style={{ color: theme.text }}>{log.path}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded border" style={{ backgroundColor: statusSt.bg, color: statusSt.color, borderColor: statusSt.border }}>
                          {log.status_code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span style={{
                          color: log.duracion_ms > 1000 ? '#dc2626' : log.duracion_ms > 500 ? '#b45309' : theme.textSecondary,
                          fontWeight: log.duracion_ms > 1000 ? 600 : 400,
                        }}>
                          {log.duracion_ms} ms
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono" style={{ color: theme.primary }}>{log.action || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm" style={{ backgroundColor: theme.backgroundSecondary, borderTop: `1px solid ${theme.border}` }}>
            <span style={{ color: theme.textSecondary }}>Mostrando {logs.length} de {total.toLocaleString()} · página {filters.page}</span>
            <div className="flex gap-2">
              <button disabled={(filters.page ?? 1) === 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))} className="px-3 py-1 rounded-lg border disabled:opacity-40" style={{ ...cardStyle, color: theme.text }}>Anterior</button>
              <button disabled={logs.length < (filters.limit ?? 50)} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))} className="px-3 py-1 rounded-lg border disabled:opacity-40" style={{ ...cardStyle, color: theme.text }}>Siguiente</button>
            </div>
          </div>
        </div>
      ) : (
        /* Vista AGRUPADA por endpoint */
        <div className="rounded-xl overflow-hidden border" style={cardStyle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: theme.backgroundSecondary, borderBottom: `1px solid ${theme.border}` }}>
                <tr>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Endpoint</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Requests</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>p50</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>p95</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Max</th>
                  <th className="text-right px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Errores</th>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Última vez</th>
                </tr>
              </thead>
              <tbody>
                {loading && grouped.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: theme.textSecondary }} /></td></tr>
                ) : grouped.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12" style={{ color: theme.textSecondary }}>Sin datos</td></tr>
                ) : grouped.map((g, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: theme.text }}>{g.path}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: theme.textSecondary }}>{g.count.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: theme.text }}>{g.p50_ms} ms</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: g.p95_ms > 1000 ? '#b45309' : theme.text, fontWeight: g.p95_ms > 1000 ? 600 : 400 }}>{g.p95_ms} ms</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: g.max_ms > 2000 ? '#dc2626' : theme.textSecondary }}>{g.max_ms} ms</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: g.errors > 0 ? '#dc2626' : theme.textSecondary, fontWeight: g.errors > 0 ? 600 : 400 }}>{g.errors}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: theme.textSecondary }}>{formatTime(g.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer detalle */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedDetail(null)}>
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
          <div className="relative w-full max-w-2xl shadow-2xl overflow-y-auto" style={{ backgroundColor: theme.card, color: theme.text }} onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}` }}>
              <h3 className="font-bold" style={{ color: theme.text }}>Detalle del log #{selectedDetail.id}</h3>
              <button onClick={() => setSelectedDetail(null)} style={{ color: theme.textSecondary }}><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <DetailRow label="Timestamp" value={new Date(selectedDetail.created_at).toLocaleString('es-AR')} theme={theme} />
              <DetailRow label="Usuario" value={`${selectedDetail.usuario_email || 'anon'} (${selectedDetail.usuario_rol || '-'})`} theme={theme} />
              <DetailRow label="Municipio" value={selectedDetail.municipio_nombre || '—'} theme={theme} />
              <DetailRow label="Endpoint" value={`${selectedDetail.method} ${selectedDetail.path}`} mono theme={theme} />
              <DetailRow label="Status" value={String(selectedDetail.status_code)} theme={theme} />
              <DetailRow label="Duración" value={`${selectedDetail.duracion_ms} ms`} theme={theme} />
              <DetailRow label="Acción" value={selectedDetail.action || '—'} theme={theme} />
              <DetailRow label="IP" value={selectedDetail.ip_address || '—'} theme={theme} />
              <DetailRow label="User Agent" value={selectedDetail.user_agent || '—'} mono theme={theme} />
              {selectedDetail.query_params != null && <DetailJson label="Query params" data={selectedDetail.query_params} theme={theme} />}
              {selectedDetail.request_body != null && <DetailJson label="Request body" data={selectedDetail.request_body} theme={theme} />}
              {selectedDetail.response_summary != null && <DetailJson label="Response summary" data={selectedDetail.response_summary} theme={theme} />}
              {selectedDetail.error_message && (
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Error</div>
                  <pre className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap border" style={{ backgroundColor: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c' }}>{selectedDetail.error_message}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, theme }: { label: string; value: string; mono?: boolean; theme: any }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs font-semibold" style={{ color: theme.textSecondary }}>{label}</div>
      <div className={`col-span-2 ${mono ? 'font-mono text-xs' : ''}`} style={{ color: theme.text }}>{value}</div>
    </div>
  );
}

function DetailJson({ label, data, theme }: { label: string; data: unknown; theme: any }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>{label}</div>
      <pre className="text-xs p-3 rounded-lg overflow-x-auto border" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
