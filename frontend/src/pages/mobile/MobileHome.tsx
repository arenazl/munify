import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  MapPin,
  Loader2
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { reclamosApi } from '../../lib/api';
import type { Reclamo, EstadoReclamo } from '../../types';

const estadoConfig: Record<EstadoReclamo, { icon: typeof Clock; color: string; label: string }> = {
  nuevo: { icon: Clock, color: '#6b7280', label: 'Nuevo' },
  asignado: { icon: AlertCircle, color: '#3b82f6', label: 'Asignado' },
  en_proceso: { icon: Clock, color: '#f59e0b', label: 'En Proceso' },
  resuelto: { icon: CheckCircle2, color: '#10b981', label: 'Resuelto' },
  rechazado: { icon: AlertCircle, color: '#ef4444', label: 'Rechazado' },
};

export default function MobileHome() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendientes: 0, resueltos: 0 });

  useEffect(() => {
    if (user) {
      loadReclamos();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadReclamos = async () => {
    try {
      const res = await reclamosApi.getMisReclamos();
      const data = res.data;
      setReclamos(data.slice(0, 3));
      setStats({
        total: data.length,
        pendientes: data.filter((r: Reclamo) => ['nuevo', 'asignado', 'en_proceso'].includes(r.estado)).length,
        resueltos: data.filter((r: Reclamo) => r.estado === 'resuelto').length,
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4 space-y-6">
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}dd)`,
          }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
            <ClipboardList className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Bienvenido a {localStorage.getItem('municipio_nombre') || 'tu Municipio'}
          </h2>
          <p className="text-white/80 text-sm mb-6">
            Registrate para hacer seguimiento de tus reclamos
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/app/login')}
              className="w-full py-3 px-4 bg-white text-slate-900 font-semibold rounded-xl"
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => navigate('/app/register')}
              className="w-full py-3 px-4 bg-white/20 text-white font-semibold rounded-xl"
            >
              Crear Cuenta
            </button>
          </div>
        </div>

        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-semibold mb-3" style={{ color: theme.text }}>
            ¿Tenés un problema para reportar?
          </h3>
          <button
            onClick={() => navigate('/app/nuevo')}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          >
            <Plus className="h-5 w-5" />
            Crear Reclamo
          </button>
          <p className="text-xs text-center mt-2" style={{ color: theme.textSecondary }}>
            Podés crear un reclamo sin cuenta, pero no podrás ver el seguimiento
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div
          className="rounded-xl p-3 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <p className="text-2xl font-bold" style={{ color: theme.primary }}>
            {loading ? '-' : stats.total}
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>Total</p>
        </div>
        <div
          className="rounded-xl p-3 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
            {loading ? '-' : stats.pendientes}
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>Pendientes</p>
        </div>
        <div
          className="rounded-xl p-3 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <p className="text-2xl font-bold" style={{ color: '#10b981' }}>
            {loading ? '-' : stats.resueltos}
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>Resueltos</p>
        </div>
      </div>

      <button
        onClick={() => navigate('/app/nuevo')}
        className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white shadow-lg transition-all active:scale-[0.98]"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}dd)`,
          boxShadow: `0 4px 20px ${theme.primary}40`,
        }}
      >
        <Plus className="h-6 w-6" />
        Crear Nuevo Reclamo
      </button>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold" style={{ color: theme.text }}>
            Últimos Reclamos
          </h3>
          {reclamos.length > 0 && (
            <button
              onClick={() => navigate('/app/mis-reclamos')}
              className="text-sm flex items-center gap-1"
              style={{ color: theme.primary }}
            >
              Ver todos
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : reclamos.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <ClipboardList className="h-6 w-6" style={{ color: theme.textSecondary }} />
            </div>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Aún no tenés reclamos
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reclamos.map((reclamo) => {
              const config = estadoConfig[reclamo.estado];
              const Icon = config.icon;
              return (
                <button
                  key={reclamo.id}
                  onClick={() => navigate(`/app/mis-reclamos?id=${reclamo.id}`)}
                  className="w-full text-left rounded-xl p-4 transition-all active:scale-[0.98]"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${config.color}15` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate" style={{ color: theme.text }}>
                          {reclamo.titulo}
                        </p>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: `${config.color}15`, color: config.color }}
                        >
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm mt-1 flex items-center gap-1 truncate" style={{ color: theme.textSecondary }}>
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {reclamo.direccion}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
