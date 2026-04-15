import { useEffect, useState, useCallback } from 'react';
import { Activity, AlertCircle, RefreshCw, X, Clock, Filter, Trash2, Loader2 } from 'lucide-react';
import { auditApi, municipiosApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import PageHint from '../../components/ui/PageHint';
import type { AuditFilters, AuditLogItem, AuditLogDetail, AuditStats } from '../../types/audit';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
}

const STATUS_STYLE = (code: number, theme: any) => {
  if (code >= 500) return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' };
  if (code >= 400) return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
  if (code >= 300) return { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' };
  return { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' };
};

const METHOD_STYLE = (method: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    GET: { bg: '#f1f5f9', color: '#334155' },
    POST: { bg: '#dbeafe', color: '#1d4ed8' },
    PUT: { bg: '#fef3c7', color: '#b45309' },
    DELETE: { bg: '#fee2e2', color: '#b91c1c' },
    PATCH: { bg: '#ede9fe', color: '#6d28d9' },
  };
  return map[method] || { bg: '#f1f5f9', color: '#334155' };
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
  const { theme } = useTheme();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<AuditLogDetail | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

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
        <AlertCircle className="h-12 w-12 mx-auto mb-3" style={{ color: '#f59e0b' }} />
        <h2 className="text-xl font-bold" style={{ color: theme.text }}>Acceso restringido</h2>
        <p className="mt-2" style={{ color: theme.textSecondary }}>
          Esta sección es solo para super admin (usuarios sin municipio asignado).
        </p>
      </div>
    );
  }

  const inputStyle = {
    backgroundColor: theme.card,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };
  const cardStyle = {
    backgroundColor: theme.card,
    border: `1px solid ${theme.border}`,
  };

  return (
    <div className="space-y-4">
      <PageHint pageId="audit-logs" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}20` }}
          >
            <Activity className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>Consola de auditoría</h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>Logs cross-municipio en tiempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              ...cardStyle,
              backgroundColor: autoRefresh ? `${theme.primary}15` : theme.card,
              borderColor: autoRefresh ? theme.primary : theme.border,
              color: autoRefresh ? theme.primary : theme.textSecondary,
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => { fetchLogs(); fetchStats(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
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
              style={{
                backgroundColor: debugMode ? '#fde68a' : theme.border,
                color: debugMode ? '#78350f' : theme.textSecondary,
              }}
            >
              {debugMode ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
            {debugMode
              ? 'Capturando GETs + request bodies sanitizados. Volumen ~5× mayor.'
              : 'Solo se capturan POST/PUT/DELETE/PATCH y errores 4xx/5xx.'}
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

      {/* Stats widgets */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Requests (24h)</div>
            <div className="text-2xl font-bold" style={{ color: theme.text }}>{stats.total_requests.toLocaleString()}</div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Errores</div>
            <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>{stats.error_count}</div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>{(stats.error_rate * 100).toFixed(1)}% del total</div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Latencia p50</div>
            <div className="text-2xl font-bold" style={{ color: theme.text }}>
              {stats.p50_ms}<span className="text-sm font-normal" style={{ color: theme.textSecondary }}> ms</span>
            </div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Latencia p95</div>
            <div className="text-2xl font-bold" style={{ color: '#b45309' }}>
              {stats.p95_ms}<span className="text-sm font-normal" style={{ color: theme.textSecondary }}> ms</span>
            </div>
          </div>
          <div className="rounded-xl p-3 border" style={cardStyle}>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Status mix</div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {Object.entries(stats.requests_by_status).map(([k, v]) => v > 0 && (
                <span
                  key={k}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: k === '2xx' ? '#dcfce7' : k === '4xx' ? '#fef3c7' : k === '5xx' ? '#fee2e2' : theme.border,
                    color: k === '2xx' ? '#15803d' : k === '4xx' ? '#b45309' : k === '5xx' ? '#b91c1c' : theme.textSecondary,
                  }}
                >
                  {k}: {v}
                </span>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Municipio</label>
            <select
              value={filters.municipio_id ?? ''}
              onChange={(e) => updateFilter('municipio_id', e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            >
              <option value="">Todos</option>
              {municipios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Path contiene</label>
            <input
              type="text"
              value={filters.path ?? ''}
              onChange={(e) => updateFilter('path', e.target.value || undefined)}
              placeholder="ej: reclamos"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Status</label>
            <div className="flex gap-1">
              <input
                type="number" min={100} max={599}
                value={filters.status_code_min ?? ''}
                onChange={(e) => updateFilter('status_code_min', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="min"
                className="w-full px-2 py-2 rounded-lg text-sm"
                style={inputStyle}
              />
              <input
                type="number" min={100} max={599}
                value={filters.status_code_max ?? ''}
                onChange={(e) => updateFilter('status_code_max', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="max"
                className="w-full px-2 py-2 rounded-lg text-sm"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Latencia ms (min)</label>
            <input
              type="number" min={0}
              value={filters.duracion_min_ms ?? ''}
              onChange={(e) => updateFilter('duracion_min_ms', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="ej: 1000 (slow)"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilters({ ...filters, status_code_min: 400, status_code_max: undefined, page: 1 })}
            className="text-xs px-3 py-1 rounded-full border"
            style={{ backgroundColor: '#fef3c71a', borderColor: '#fde68a', color: '#b45309' }}
          >
            Solo errores (≥400)
          </button>
          <button
            onClick={() => setFilters({ ...filters, duracion_min_ms: 1000, page: 1 })}
            className="text-xs px-3 py-1 rounded-full border"
            style={{ backgroundColor: '#fef2f21a', borderColor: '#fecaca', color: '#dc2626' }}
          >
            Slow queries (&gt;1s)
          </button>
          <button
            onClick={() => setFilters({ page: 1, limit: 50, order_by: 'created_at', order_dir: 'desc' })}
            className="text-xs px-3 py-1 rounded-full border"
            style={{ ...cardStyle, color: theme.textSecondary }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-3 rounded-xl text-sm border"
          style={{ backgroundColor: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c' }}
        >
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden border" style={cardStyle}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: theme.backgroundSecondary, borderBottom: `1px solid ${theme.border}` }}>
              <tr>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Tiempo</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Municipio</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Usuario</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Método</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Path</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Status</th>
                <th className="text-right px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Duración</th>
                <th className="text-left px-3 py-2 font-medium" style={{ color: theme.textSecondary }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: theme.textSecondary }} /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12" style={{ color: theme.textSecondary }}>Sin logs para los filtros aplicados</td></tr>
              ) : logs.map((log) => {
                const statusSt = STATUS_STYLE(log.status_code, theme);
                const methodSt = METHOD_STYLE(log.method);
                return (
                  <tr
                    key={log.id}
                    onClick={() => handleOpenDetail(log.id)}
                    className="cursor-pointer transition-colors"
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
                      {log.usuario_email || <span style={{ color: theme.textSecondary, opacity: 0.6 }}>anon</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: methodSt.bg, color: methodSt.color }}
                      >
                        {log.method}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs truncate max-w-[280px]" style={{ color: theme.text }}>{log.path}</td>
                    <td className="px-3 py-2">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded border"
                        style={{ backgroundColor: statusSt.bg, color: statusSt.color, borderColor: statusSt.border }}
                      >
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
          <span style={{ color: theme.textSecondary }}>
            Mostrando {logs.length} de {total.toLocaleString()} · página {filters.page}
          </span>
          <div className="flex gap-2">
            <button
              disabled={(filters.page ?? 1) === 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ ...cardStyle, color: theme.text }}
            >
              Anterior
            </button>
            <button
              disabled={logs.length < (filters.limit ?? 50)}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ ...cardStyle, color: theme.text }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* Drawer detalle */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedDetail(null)}>
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
          <div
            className="relative w-full max-w-2xl shadow-2xl overflow-y-auto"
            style={{ backgroundColor: theme.card, color: theme.text }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 px-6 py-4 flex items-center justify-between"
              style={{ backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}` }}
            >
              <h3 className="font-bold" style={{ color: theme.text }}>Detalle del log #{selectedDetail.id}</h3>
              <button
                onClick={() => setSelectedDetail(null)}
                style={{ color: theme.textSecondary }}
              >
                <X className="h-5 w-5" />
              </button>
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

              {selectedDetail.query_params != null && (
                <DetailJson label="Query params" data={selectedDetail.query_params} theme={theme} />
              )}
              {selectedDetail.request_body != null && (
                <DetailJson label="Request body" data={selectedDetail.request_body} theme={theme} />
              )}
              {selectedDetail.response_summary != null && (
                <DetailJson label="Response summary" data={selectedDetail.response_summary} theme={theme} />
              )}
              {selectedDetail.error_message && (
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: theme.textSecondary }}>Error</div>
                  <pre
                    className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap border"
                    style={{ backgroundColor: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c' }}
                  >
                    {selectedDetail.error_message}
                  </pre>
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
      <pre
        className="text-xs p-3 rounded-lg overflow-x-auto border"
        style={{
          backgroundColor: theme.backgroundSecondary,
          color: theme.text,
          borderColor: theme.border,
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
