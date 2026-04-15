import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, ClipboardList, FileText, Activity, AlertCircle,
  TrendingUp, Clock, ArrowRight, Zap,
} from 'lucide-react';
import { auditApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { ConsolaResumen } from '../../types/audit';

const STATUS_COLOR = (code: number) => {
  if (code >= 500) return { bg: '#fee2e2', color: '#b91c1c' };
  if (code >= 400) return { bg: '#fef3c7', color: '#b45309' };
  return { bg: '#dcfce7', color: '#15803d' };
};

export default function ConsolaGlobal() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState<ConsolaResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSuperAdmin = user?.is_super_admin || (user?.rol === 'admin' && !user?.municipio_id);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const res = await auditApi.consolaResumen();
        setData(res.data);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Error cargando resumen');
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto mb-3" style={{ color: '#f59e0b' }} />
        <h2 className="text-xl font-bold" style={{ color: theme.text }}>Acceso restringido</h2>
        <p className="mt-2" style={{ color: theme.textSecondary }}>
          Esta consola es solo para super admin.
        </p>
      </div>
    );
  }

  const cardStyle = { backgroundColor: theme.card, border: `1px solid ${theme.border}` };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 border"
        style={{
          ...cardStyle,
          background: `linear-gradient(135deg, ${theme.primary}15 0%, ${theme.primary}05 100%)`,
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}25` }}
          >
            <Zap className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Consola Global</h1>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Vista cross-tenant de todos los municipios
            </p>
          </div>
        </div>
        <p className="text-sm mt-3" style={{ color: theme.textSecondary }}>
          Seleccioná un municipio desde el selector de arriba para entrar en su contexto,
          o mirá las métricas globales de abajo para tener el pulso del sistema.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: theme.textSecondary }}>Cargando...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
      ) : data ? (
        <>
          {/* Totales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Building2 />} label="Municipios" value={data.total_municipios} theme={theme} />
            <StatCard icon={<Users />} label="Usuarios" value={data.total_usuarios} theme={theme} />
            <StatCard icon={<ClipboardList />} label="Reclamos" value={data.total_reclamos} theme={theme} />
            <StatCard icon={<FileText />} label="Solicitudes" value={data.total_solicitudes} theme={theme} />
          </div>

          {/* Actividad 24h */}
          <div className="rounded-xl p-5 border" style={cardStyle}>
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
              <Activity className="h-4 w-4" style={{ color: theme.primary }} />
              Actividad · últimas 24h
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniStat label="Requests" value={data.requests_24h.toLocaleString()} theme={theme} />
              <MiniStat label="Errores" value={data.errors_24h.toString()} valueColor="#dc2626" theme={theme} />
              <MiniStat label="Error rate" value={`${(data.error_rate_24h * 100).toFixed(1)}%`} theme={theme} />
              <MiniStat label="Latencia p50" value={`${data.p50_ms_24h} ms`} theme={theme} />
              <MiniStat label="Latencia p95" value={`${data.p95_ms_24h} ms`} valueColor="#b45309" theme={theme} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top municipios */}
            <div className="rounded-xl p-5 border" style={cardStyle}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                <TrendingUp className="h-4 w-4" style={{ color: theme.primary }} />
                Municipios más activos (24h)
              </h2>
              {data.top_municipios.length === 0 ? (
                <p className="text-sm" style={{ color: theme.textSecondary }}>Sin actividad registrada</p>
              ) : (
                <ul className="space-y-2">
                  {data.top_municipios.map((m, i) => (
                    <li key={m.municipio_id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2" style={{ color: theme.text }}>
                        <span
                          className="text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold"
                          style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                        >
                          {i + 1}
                        </span>
                        {m.municipio_nombre || `#${m.municipio_id}`}
                      </span>
                      <span className="font-mono text-xs tabular-nums" style={{ color: theme.textSecondary }}>
                        {m.count.toLocaleString()} req
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Slowest endpoints */}
            <div className="rounded-xl p-5 border" style={cardStyle}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                <Clock className="h-4 w-4" style={{ color: '#b45309' }} />
                Endpoints más lentos (24h)
              </h2>
              {data.slowest_endpoints.length === 0 ? (
                <p className="text-sm" style={{ color: theme.textSecondary }}>Sin datos</p>
              ) : (
                <ul className="space-y-2">
                  {data.slowest_endpoints.map((e, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono truncate flex-1" style={{ color: theme.text }}>{e.path}</span>
                      <span
                        className="font-mono tabular-nums px-2 py-0.5 rounded"
                        style={{ backgroundColor: '#fef3c7', color: '#b45309' }}
                      >
                        {e.p95_ms} ms
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Recent errors */}
          <div className="rounded-xl p-5 border" style={cardStyle}>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
              <AlertCircle className="h-4 w-4" style={{ color: '#dc2626' }} />
              Errores recientes
            </h2>
            {data.recent_errors.length === 0 ? (
              <p className="text-sm" style={{ color: theme.textSecondary }}>🎉 Sin errores recientes</p>
            ) : (
              <ul className="space-y-2">
                {data.recent_errors.map((e, i) => {
                  const statusSt = STATUS_COLOR(e.status_code);
                  return (
                    <li key={i} className="flex items-center gap-3 text-xs">
                      <span
                        className="font-mono font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: statusSt.bg, color: statusSt.color }}
                      >
                        {e.status_code}
                      </span>
                      <span className="font-semibold" style={{ color: theme.textSecondary }}>{e.method}</span>
                      <span className="font-mono truncate flex-1" style={{ color: theme.text }}>{e.path}</span>
                      <span style={{ color: theme.textSecondary }}>{e.municipio_nombre || '—'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Links rápidos */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/gestion/admin/audit-logs')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold text-sm shadow hover:shadow-lg transition-all"
              style={{ background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 100%)` }}
            >
              <Activity className="h-4 w-4" />
              Ir a Auditoría
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('/gestion/municipios')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm border transition-all"
              style={{ ...cardStyle, color: theme.text }}
            >
              <Building2 className="h-4 w-4" />
              Gestionar municipios
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value, theme }: { icon: React.ReactNode; label: string; value: number; theme: any }) {
  return (
    <div
      className="rounded-xl p-4 border flex items-center gap-3"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
      >
        {icon}
      </div>
      <div>
        <div className="text-xs" style={{ color: theme.textSecondary }}>{label}</div>
        <div className="text-2xl font-bold tabular-nums" style={{ color: theme.text }}>{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, valueColor, theme }: { label: string; value: string; valueColor?: string; theme: any }) {
  return (
    <div>
      <div className="text-xs" style={{ color: theme.textSecondary }}>{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: valueColor || theme.text }}>{value}</div>
    </div>
  );
}
