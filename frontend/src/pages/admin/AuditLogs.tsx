import { useEffect, useState, useCallback } from 'react';
import { Activity, AlertCircle, RefreshCw, X, Clock, Filter, Trash2, Loader2 } from 'lucide-react';
import { auditApi, municipiosApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import PageHint from '../../components/ui/PageHint';
import type { AuditFilters, AuditLogItem, AuditLogDetail, AuditStats } from '../../types/audit';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
}

const STATUS_COLOR = (code: number) => {
  if (code >= 500) return 'bg-red-100 text-red-700 border-red-200';
  if (code >= 400) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (code >= 300) return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
};

const METHOD_COLOR: Record<string, string> = {
  GET: 'bg-slate-100 text-slate-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  PATCH: 'bg-violet-100 text-violet-700',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return `hace ${Math.floor(diff)}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<AuditLogDetail | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filtros
  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    limit: 50,
    order_by: 'created_at',
    order_dir: 'desc',
  });

  const isSuperAdmin = user?.is_super_admin || (user?.rol === 'admin' && !user?.municipio_id);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditApi.list(filters);
      setLogs(res.data.items);
      setTotal(res.data.total);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error cargando logs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await auditApi.stats({
        municipio_id: filters.municipio_id,
        desde: filters.desde,
        hasta: filters.hasta,
      });
      setStats(res.data);
    } catch (e) {
      console.error('Error stats:', e);
    }
  }, [filters.municipio_id, filters.desde, filters.hasta]);

  const fetchMunicipios = useCallback(async () => {
    try {
      const res = await municipiosApi.getPublic();
      setMunicipios(res.data);
    } catch (e) {
      console.error('Error municipios:', e);
    }
  }, []);

  const fetchDebugMode = useCallback(async () => {
    try {
      const res = await auditApi.getDebugMode();
      setDebugMode(res.data.enabled);
    } catch (e) {
      console.error('Error debug mode:', e);
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchMunicipios();
    fetchDebugMode();
  }, [isSuperAdmin, fetchMunicipios, fetchDebugMode]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchLogs();
    fetchStats();
  }, [isSuperAdmin, fetchLogs, fetchStats]);

  useEffect(() => {
    if (!autoRefresh || !isSuperAdmin) return;
    const interval = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, isSuperAdmin, fetchLogs, fetchStats]);

  const handleToggleDebug = async () => {
    const newValue = !debugMode;
    if (newValue && !confirm('Activar modo debug captura todos los GETs y request bodies. Aumenta el volumen de logs ~5×. ¿Continuar?')) {
      return;
    }
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
    } catch (e) {
      console.error('Error detail:', e);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Borrar todos los logs de más de 30 días. ¿Continuar?')) return;
    try {
      const res = await auditApi.cleanup(30);
      alert(`Borrados: ${res.data.deleted} logs`);
      fetchLogs();
      fetchStats();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Error en cleanup');
    }
  };

  const updateFilter = <K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-800">Acceso restringido</h2>
        <p className="text-slate-500 mt-2">Esta sección es solo para super admin (usuarios sin municipio asignado).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHint pageId="audit-logs" />

      {/* Header con título + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Activity className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Auditoría</h1>
            <p className="text-sm text-slate-500">Logs cross-municipio en tiempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoRefresh ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => { fetchLogs(); fetchStats(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recargar
          </button>
          <button
            onClick={handleCleanup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpiar &gt;30d
          </button>
        </div>
      </div>

      {/* Toggle debug mode */}
      <div className={`flex items-center justify-between gap-4 p-4 rounded-xl border ${debugMode ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">Modo debug</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${debugMode ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-600'}`}>
              {debugMode ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            {debugMode
              ? 'Capturando GETs + request bodies sanitizados. Volumen ~5× mayor.'
              : 'Solo se capturan POST/PUT/DELETE/PATCH y errores 4xx/5xx.'}
          </p>
        </div>
        <button
          onClick={handleToggleDebug}
          className={`relative w-14 h-8 rounded-full transition-colors ${debugMode ? 'bg-amber-500' : 'bg-slate-300'}`}
        >
          <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${debugMode ? 'left-7' : 'left-1'}`} />
        </button>
      </div>

      {/* Stats widgets */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-xs text-slate-500">Requests (24h)</div>
            <div className="text-2xl font-bold text-slate-800">{stats.total_requests.toLocaleString()}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-xs text-slate-500">Errores</div>
            <div className="text-2xl font-bold text-red-600">{stats.error_count}</div>
            <div className="text-xs text-slate-500">{(stats.error_rate * 100).toFixed(1)}% del total</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-xs text-slate-500">Latencia p50</div>
            <div className="text-2xl font-bold text-slate-800">{stats.p50_ms}<span className="text-sm font-normal text-slate-500"> ms</span></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-xs text-slate-500">Latencia p95</div>
            <div className="text-2xl font-bold text-amber-700">{stats.p95_ms}<span className="text-sm font-normal text-slate-500"> ms</span></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="text-xs text-slate-500">Status mix</div>
            <div className="flex items-center gap-1 mt-1">
              {Object.entries(stats.requests_by_status).map(([k, v]) => v > 0 && (
                <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${
                  k === '2xx' ? 'bg-emerald-100 text-emerald-700' :
                  k === '4xx' ? 'bg-amber-100 text-amber-700' :
                  k === '5xx' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{k}: {v}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Municipio</label>
            <select
              value={filters.municipio_id ?? ''}
              onChange={(e) => updateFilter('municipio_id', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              <option value="">Todos</option>
              {municipios.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Path contiene</label>
            <input
              type="text"
              value={filters.path ?? ''}
              onChange={(e) => updateFilter('path', e.target.value || undefined)}
              placeholder="ej: reclamos"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Status</label>
            <div className="flex gap-1">
              <input
                type="number" min={100} max={599}
                value={filters.status_code_min ?? ''}
                onChange={(e) => updateFilter('status_code_min', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="min"
                className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm"
              />
              <input
                type="number" min={100} max={599}
                value={filters.status_code_max ?? ''}
                onChange={(e) => updateFilter('status_code_max', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="max"
                className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Latencia ms (min)</label>
            <input
              type="number" min={0}
              value={filters.duracion_min_ms ?? ''}
              onChange={(e) => updateFilter('duracion_min_ms', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="ej: 1000 (slow)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setFilters({ ...filters, status_code_min: 400, status_code_max: undefined, page: 1 }); }}
            className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
          >
            Solo errores (≥400)
          </button>
          <button
            onClick={() => { setFilters({ ...filters, duracion_min_ms: 1000, page: 1 }); }}
            className="text-xs px-3 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
          >
            Slow queries (&gt;1s)
          </button>
          <button
            onClick={() => setFilters({ page: 1, limit: 50, order_by: 'created_at', order_dir: 'desc' })}
            className="text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Tiempo</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Municipio</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Usuario</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Método</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Path</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                <th className="text-right px-3 py-2 font-medium text-slate-600">Duración</th>
                <th className="text-left px-3 py-2 font-medium text-slate-600">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Sin logs para los filtros aplicados</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} onClick={() => handleOpenDetail(log.id)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap"><Clock className="h-3 w-3 inline mr-1" />{formatTime(log.created_at)}</td>
                  <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">{log.municipio_nombre || '—'}</span></td>
                  <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">{log.usuario_email || <span className="text-slate-400">anon</span>}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${METHOD_COLOR[log.method] || 'bg-slate-100 text-slate-600'}`}>{log.method}</span></td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700 truncate max-w-[280px]">{log.path}</td>
                  <td className="px-3 py-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_COLOR(log.status_code)}`}>{log.status_code}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={log.duracion_ms > 1000 ? 'text-red-600 font-semibold' : log.duracion_ms > 500 ? 'text-amber-600' : 'text-slate-600'}>
                      {log.duracion_ms} ms
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-violet-700 font-mono">{log.action || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-sm">
          <span className="text-slate-600">
            Mostrando {logs.length} de {total.toLocaleString()} · página {filters.page}
          </span>
          <div className="flex gap-2">
            <button
              disabled={(filters.page ?? 1) === 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              disabled={logs.length < (filters.limit ?? 50)}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Drawer detalle */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedDetail(null)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="relative w-full max-w-2xl bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Detalle del log #{selectedDetail.id}</h3>
              <button onClick={() => setSelectedDetail(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <DetailRow label="Timestamp" value={new Date(selectedDetail.created_at).toLocaleString('es-AR')} />
              <DetailRow label="Usuario" value={`${selectedDetail.usuario_email || 'anon'} (${selectedDetail.usuario_rol || '-'})`} />
              <DetailRow label="Municipio" value={selectedDetail.municipio_nombre || '—'} />
              <DetailRow label="Endpoint" value={`${selectedDetail.method} ${selectedDetail.path}`} mono />
              <DetailRow label="Status" value={String(selectedDetail.status_code)} />
              <DetailRow label="Duración" value={`${selectedDetail.duracion_ms} ms`} />
              <DetailRow label="Acción" value={selectedDetail.action || '—'} />
              <DetailRow label="IP" value={selectedDetail.ip_address || '—'} />
              <DetailRow label="User Agent" value={selectedDetail.user_agent || '—'} mono />

              {selectedDetail.query_params != null && (
                <DetailJson label="Query params" data={selectedDetail.query_params} />
              )}
              {selectedDetail.request_body != null && (
                <DetailJson label="Request body" data={selectedDetail.request_body} />
              )}
              {selectedDetail.response_summary != null && (
                <DetailJson label="Response summary" data={selectedDetail.response_summary} />
              )}
              {selectedDetail.error_message && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">Error</div>
                  <pre className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{selectedDetail.error_message}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className={`col-span-2 text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}

function DetailJson({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-600 mb-1">{label}</div>
      <pre className="bg-slate-50 border border-slate-200 text-slate-700 text-xs p-3 rounded-lg overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
