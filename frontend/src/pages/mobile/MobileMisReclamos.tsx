import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Tag,
  ClipboardList
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { reclamosApi } from '../../lib/api';
import type { Reclamo, EstadoReclamo, HistorialReclamo } from '../../types';

const estadoConfig: Record<EstadoReclamo, { icon: typeof Clock; color: string; bgColor: string; label: string }> = {
  nuevo: { icon: Clock, color: '#6b7280', bgColor: '#f3f4f6', label: 'Nuevo' },
  asignado: { icon: AlertCircle, color: '#3b82f6', bgColor: '#dbeafe', label: 'Asignado' },
  en_proceso: { icon: Clock, color: '#f59e0b', bgColor: '#fef3c7', label: 'En Proceso' },
  pendiente_confirmacion: { icon: Clock, color: '#8b5cf6', bgColor: '#ede9fe', label: 'Pendiente Confirmación' },
  resuelto: { icon: CheckCircle2, color: '#10b981', bgColor: '#d1fae5', label: 'Resuelto' },
  rechazado: { icon: AlertCircle, color: '#ef4444', bgColor: '#fee2e2', label: 'Rechazado' },
};

// Formatea el nombre del empleado en formato "L. Lopez"
const formatEmpleadoNombre = (nombreCompleto: string): string => {
  const partes = nombreCompleto.trim().split(' ');
  if (partes.length === 0) return nombreCompleto;

  // Tomar la primera letra del primer nombre
  const inicial = partes[0][0].toUpperCase();

  // Tomar el/los apellido(s) - todo excepto el primer nombre
  const apellidos = partes.slice(1).join(' ');

  return apellidos ? `${inicial}. ${apellidos}` : nombreCompleto;
};

export default function MobileMisReclamos() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReclamo, setSelectedReclamo] = useState<Reclamo | null>(null);
  const [historial, setHistorial] = useState<HistorialReclamo[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [filter, setFilter] = useState<'todos' | 'pendientes' | 'resueltos'>('todos');

  useEffect(() => {
    if (user) {
      loadReclamos();
    } else {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const reclamoId = searchParams.get('id');
    if (reclamoId && reclamos.length > 0) {
      const reclamo = reclamos.find(r => r.id === parseInt(reclamoId));
      if (reclamo) {
        openDetail(reclamo);
      }
    }
  }, [searchParams, reclamos]);

  const loadReclamos = async () => {
    try {
      const res = await reclamosApi.getMisReclamos();
      setReclamos(res.data);
    } catch (error) {
      toast.error('Error al cargar reclamos');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (reclamo: Reclamo) => {
    setSelectedReclamo(reclamo);
    setSearchParams({ id: reclamo.id.toString() });
    setLoadingHistorial(true);
    try {
      const res = await reclamosApi.getHistorial(reclamo.id);
      setHistorial(res.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoadingHistorial(false);
    }
  };

  const closeDetail = () => {
    setSelectedReclamo(null);
    setHistorial([]);
    setSearchParams({});
  };

  const filteredReclamos = reclamos.filter(r => {
    if (filter === 'pendientes') return ['nuevo', 'asignado', 'en_proceso'].includes(r.estado);
    if (filter === 'resueltos') return r.estado === 'resuelto';
    return true;
  });

  // Si no está logueado, mostrar pantalla de invitación
  if (!user) {
    return (
      <div className="p-4">
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
            Seguí tus reclamos
          </h2>
          <p className="text-white/80 text-sm mb-6">
            Creá una cuenta para ver el estado de todos tus reclamos y recibir notificaciones
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/app/register')}
              className="w-full py-3 px-4 bg-white text-slate-900 font-semibold rounded-xl"
            >
              Crear Cuenta Gratis
            </button>
            <button
              onClick={() => navigate('/app/login')}
              className="w-full py-3 px-4 bg-white/20 text-white font-semibold rounded-xl"
            >
              Ya tengo cuenta
            </button>
          </div>
        </div>

        <div
          className="mt-4 rounded-xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-medium mb-2" style={{ color: theme.text }}>
            ¿Todavía no creaste un reclamo?
          </h3>
          <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
            Podés crear reclamos sin cuenta, pero no podrás ver su seguimiento.
          </p>
          <button
            onClick={() => navigate('/app/nuevo')}
            className="w-full py-2.5 rounded-xl font-medium"
            style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
          >
            Crear Reclamo
          </button>
        </div>
      </div>
    );
  }

  if (selectedReclamo) {
    const config = estadoConfig[selectedReclamo.estado];
    const Icon = config.icon;

    return (
      <div className="min-h-full" style={{ backgroundColor: theme.background }}>
        <div
          className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}` }}
        >
          <button onClick={closeDetail} className="p-2 -ml-2 rounded-lg" style={{ color: theme.text }}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold" style={{ color: theme.text }}>
              Reclamo #{selectedReclamo.id}
            </h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ backgroundColor: config.bgColor }}
          >
            <Icon className="h-6 w-6" style={{ color: config.color }} />
            <div>
              <p className="font-semibold" style={{ color: config.color }}>
                {config.label}
              </p>
              <p className="text-xs" style={{ color: config.color }}>
                Actualizado: {new Date(selectedReclamo.updated_at || selectedReclamo.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div
            className="rounded-xl p-4 space-y-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div>
              <h2 className="font-semibold text-lg" style={{ color: theme.text }}>
                {selectedReclamo.titulo}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Tag className="h-3 w-3" style={{ color: theme.textSecondary }} />
                <span className="text-sm" style={{ color: theme.textSecondary }}>
                  {selectedReclamo.categoria.nombre}
                </span>
              </div>
            </div>

            <p className="text-sm" style={{ color: theme.text }}>
              {selectedReclamo.descripcion}
            </p>

            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: theme.textSecondary }} />
              <div>
                <p className="text-sm" style={{ color: theme.text }}>{selectedReclamo.direccion}</p>
                {selectedReclamo.referencia && (
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    Ref: {selectedReclamo.referencia}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs" style={{ color: theme.textSecondary }}>
              <Calendar className="h-3 w-3" />
              Creado: {new Date(selectedReclamo.created_at).toLocaleString()}
            </div>
          </div>

          {selectedReclamo.dependencia_asignada && (
            <div className="rounded-xl p-4" style={{ backgroundColor: '#dbeafe' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#1e40af' }}>
                Dependencia Asignada
              </p>
              <p className="font-semibold" style={{ color: '#1e3a8a' }}>
                {selectedReclamo.dependencia_asignada.nombre}
              </p>
            </div>
          )}

          {selectedReclamo.resolucion && (
            <div className="rounded-xl p-4" style={{ backgroundColor: '#d1fae5' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#065f46' }}>
                Resolución
              </p>
              <p className="text-sm" style={{ color: '#064e3b' }}>
                {selectedReclamo.resolucion}
              </p>
            </div>
          )}

          {selectedReclamo.motivo_rechazo && (
            <div className="rounded-xl p-4" style={{ backgroundColor: '#fee2e2' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#991b1b' }}>
                Motivo de Rechazo
              </p>
              <p className="text-sm" style={{ color: '#7f1d1d' }}>
                {selectedReclamo.motivo_rechazo}
              </p>
            </div>
          )}

          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <h3 className="font-semibold flex items-center gap-2 mb-4" style={{ color: theme.text }}>
              <Clock className="h-4 w-4" />
              Historial
            </h3>

            {loadingHistorial ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
              </div>
            ) : historial.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>
                Sin historial
              </p>
            ) : (
              <div className="space-y-4">
                {historial.map((h, index) => (
                  <div key={h.id} className="relative pl-6">
                    {index !== historial.length - 1 && (
                      <div
                        className="absolute left-[7px] top-4 bottom-0 w-0.5"
                        style={{ backgroundColor: theme.border }}
                      />
                    )}
                    <div
                      className="absolute left-0 top-1 w-4 h-4 rounded-full border-2"
                      style={{ backgroundColor: theme.card, borderColor: theme.primary }}
                    />
                    <div>
                      <p className="text-sm" style={{ color: theme.text }}>
                        <span className="font-medium">{formatEmpleadoNombre(`${h.usuario.nombre} ${h.usuario.apellido}`)}</span>
                        {' '}{h.accion}
                      </p>
                      {h.comentario && (
                        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                          {h.comentario}
                        </p>
                      )}
                      <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                        {new Date(h.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {[
          { key: 'todos', label: 'Todos' },
          { key: 'pendientes', label: 'Pendientes' },
          { key: 'resueltos', label: 'Resueltos' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as typeof filter)}
            className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all"
            style={{
              backgroundColor: filter === f.key ? theme.primary : theme.card,
              color: filter === f.key ? '#fff' : theme.text,
              border: filter === f.key ? 'none' : `1px solid ${theme.border}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : filteredReclamos.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <AlertCircle className="h-8 w-8" style={{ color: theme.textSecondary }} />
          </div>
          <p style={{ color: theme.textSecondary }}>
            {filter === 'todos' ? 'No tenés reclamos' : `No hay reclamos ${filter}`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReclamos.map((reclamo) => {
            const config = estadoConfig[reclamo.estado];
            const Icon = config.icon;
            return (
              <button
                key={reclamo.id}
                onClick={() => openDetail(reclamo)}
                className="w-full text-left rounded-xl p-4 transition-all active:scale-[0.98]"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs" style={{ color: theme.textSecondary }}>
                        #{reclamo.id}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ backgroundColor: config.bgColor, color: config.color }}
                      >
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>
                    <p className="font-medium truncate" style={{ color: theme.text }}>
                      {reclamo.titulo}
                    </p>
                    <p className="text-sm mt-1 flex items-center gap-1" style={{ color: theme.textSecondary }}>
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{reclamo.direccion}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                </div>

                <div className="flex items-center gap-3 mt-3 pt-3 text-xs" style={{ borderTop: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                  <span className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {reclamo.categoria.nombre}
                  </span>
                  {reclamo.dependencia_asignada && (
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      🏢 {reclamo.dependencia_asignada.nombre}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(reclamo.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
