import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  MapPin,
  PlusCircle,
  ChevronRight,
  Building2,
  Star,
  BarChart3,
  Trophy,
  Sparkles,
  Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, publicoApi, configuracionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationPrompt from '../components/NotificationPrompt';
import { subscribeToPush, isSubscribed } from '../lib/pushNotifications';
import type { Reclamo, EstadoReclamo } from '../types';

interface EstadisticasPublicas {
  total_reclamos: number;
  resueltos: number;
  en_proceso: number;
  nuevos: number;
  tasa_resolucion: number;
  tiempo_promedio_resolucion_dias: number;
  calificacion_promedio: number;
  por_categoria: Array<{ categoria: string; cantidad: number }>;
}

interface MisEstadisticas {
  total: number;
  nuevos: number;
  asignados: number;
  en_proceso: number;
  resueltos: number;
  rechazados: number;
}

interface DashboardComponente {
  id: string;
  nombre: string;
  visible: boolean;
  orden: number;
}

interface DashboardConfig {
  componentes: DashboardComponente[];
}

const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  nuevo: { bg: '#e5e7eb', text: '#374151' },
  asignado: { bg: '#dbeafe', text: '#1e40af' },
  en_proceso: { bg: '#fef3c7', text: '#92400e' },
  pendiente_confirmacion: { bg: '#ede9fe', text: '#5b21b6' },
  resuelto: { bg: '#d1fae5', text: '#065f46' },
  rechazado: { bg: '#fee2e2', text: '#991b1b' },
};

const estadoLabels: Record<EstadoReclamo, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pendiente Confirmación',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

export default function DashboardVecino() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [misReclamos, setMisReclamos] = useState<Reclamo[]>([]);
  const [misEstadisticas, setMisEstadisticas] = useState<MisEstadisticas>({
    total: 0,
    nuevos: 0,
    asignados: 0,
    en_proceso: 0,
    resueltos: 0,
    rechazados: 0,
  });
  const [estadisticasPublicas, setEstadisticasPublicas] = useState<EstadisticasPublicas | null>(null);
  const [nombreMunicipio, setNombreMunicipio] = useState('');
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reclamosRes, publicasRes, configRes, dashConfigRes] = await Promise.all([
        reclamosApi.getMisReclamos(),
        publicoApi.getEstadisticas(),
        configuracionApi.getPublica('municipio').catch(() => ({ data: {} })),
        configuracionApi.getDashboardConfig('vecino').catch(() => ({ data: { config: null } })),
      ]);

      const reclamos = reclamosRes.data as Reclamo[];
      setMisReclamos(reclamos);

      // Calcular mis estadísticas
      const stats: MisEstadisticas = {
        total: reclamos.length,
        nuevos: reclamos.filter(r => r.estado === 'nuevo').length,
        asignados: reclamos.filter(r => r.estado === 'asignado').length,
        en_proceso: reclamos.filter(r => r.estado === 'en_proceso').length,
        resueltos: reclamos.filter(r => r.estado === 'resuelto').length,
        rechazados: reclamos.filter(r => r.estado === 'rechazado').length,
      };
      setMisEstadisticas(stats);

      setEstadisticasPublicas(publicasRes.data);

      if (configRes.data?.nombre_municipio) {
        // Limpiar "Municipalidad de" si ya está incluido
        const nombre = configRes.data.nombre_municipio.replace(/^Municipalidad de\s*/i, '');
        setNombreMunicipio(nombre);
      }

      // Cargar configuración del dashboard
      if (dashConfigRes.data?.config) {
        setDashboardConfig(dashConfigRes.data.config);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const reclamosRecientes = misReclamos
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const reclamosPendientes = misReclamos.filter(
    r => r.estado !== 'resuelto' && r.estado !== 'rechazado'
  ).length;

  // Helper para verificar si un componente es visible
  const isComponentVisible = (componentId: string): boolean => {
    if (!dashboardConfig?.componentes) return true;
    const comp = dashboardConfig.componentes.find(c => c.id === componentId);
    return comp ? comp.visible : true;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Prompt para activar notificaciones */}
      <NotificationPrompt delay={2000} />

      {/* Header con saludo y acciones */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: theme.text }}>
            ¡Hola, {user?.nombre}!
          </h1>
          <p className="text-sm lg:text-base mt-1" style={{ color: theme.textSecondary }}>
            Bienvenido a tu panel de reclamos
          </p>
        </div>

        {/* Botones de acción principales */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/gestion/crear-reclamo')}
            className="flex items-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: theme.primary, color: theme.primaryText }}
          >
            <PlusCircle className="h-5 w-5" />
            <span>Nuevo Reclamo</span>
          </button>
          <button
            onClick={() => navigate('/gestion/crear-tramite')}
            className="flex items-center gap-2 px-4 lg:px-6 py-3 rounded-xl font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          >
            <FileText className="h-5 w-5" />
            <span>Nuevo Trámite</span>
          </button>
        </div>
      </div>

      {/* Grid principal - 2 columnas en desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda - Mis estadísticas y reclamos */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cards de estadísticas */}
          {isComponentVisible('stats') && (
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
                Mis Reclamos
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  theme={theme}
                  icon={<FileText className="h-5 w-5" />}
                  label="Total"
                  value={misEstadisticas.total}
                  color={theme.primary}
                />
                <StatCard
                  theme={theme}
                  icon={<Clock className="h-5 w-5" />}
                  label="Pendientes"
                  value={reclamosPendientes}
                  color="#f59e0b"
                />
                <StatCard
                  theme={theme}
                  icon={<CheckCircle className="h-5 w-5" />}
                  label="Resueltos"
                  value={misEstadisticas.resueltos}
                  color="#10b981"
                />
                <StatCard
                  theme={theme}
                  icon={<AlertCircle className="h-5 w-5" />}
                  label="Rechazados"
                  value={misEstadisticas.rechazados}
                  color="#ef4444"
                />
              </div>
            </div>
          )}

          {/* Lista de reclamos recientes */}
          {isComponentVisible('reclamos_recientes') && (
            <div
              className="rounded-2xl p-5 lg:p-6"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
                  Reclamos Recientes
                </h2>
                {misReclamos.length > 5 && (
                  <button
                    onClick={() => navigate('/gestion/mis-reclamos')}
                    className="text-sm flex items-center gap-1 transition-colors hover:opacity-80"
                    style={{ color: theme.primary }}
                  >
                    Ver todos <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>

              {reclamosRecientes.length === 0 ? (
                <div className="text-center py-8">
                  <div
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: `${theme.primary}15` }}
                  >
                    <Sparkles className="h-8 w-8" style={{ color: theme.primary }} />
                  </div>
                  <p className="font-medium mb-2" style={{ color: theme.text }}>
                    Aún no tenés reclamos
                  </p>
                  <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
                    Creá tu primer reclamo para empezar a colaborar con tu municipio
                  </p>
                  <button
                    onClick={() => navigate('/gestion/crear-reclamo')}
                    className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                  >
                    Crear mi primer reclamo
                  </button>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: theme.border }}>
                  {reclamosRecientes.map(reclamo => {
                    const estado = estadoColors[reclamo.estado];
                    return (
                      <div
                        key={reclamo.id}
                        onClick={() => navigate('/gestion/mis-reclamos')}
                        className="py-4 first:pt-0 last:pb-0 cursor-pointer transition-all hover:bg-black/5 dark:hover:bg-white/5 -mx-2 px-2 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>
                                #{reclamo.id}
                              </span>
                              <span
                                className="px-2.5 py-0.5 text-xs font-medium rounded-full"
                                style={{ backgroundColor: estado.bg, color: estado.text }}
                              >
                                {estadoLabels[reclamo.estado]}
                              </span>
                            </div>
                            <p className="font-medium truncate" style={{ color: theme.text }}>
                              {reclamo.titulo}
                            </p>
                            <p className="text-sm truncate mt-0.5 flex items-center gap-1" style={{ color: theme.textSecondary }}>
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              {reclamo.direccion}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha - Estadísticas del municipio y accesos rápidos */}
        <div className="space-y-6">
          {/* Estadísticas del municipio */}
          {isComponentVisible('stats_municipio') && estadisticasPublicas && (
            <div
              className="rounded-2xl p-5 lg:p-6"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
                <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
                  {nombreMunicipio || 'Tu Municipio'}
                </h2>
              </div>

              <div className="space-y-4">
                {/* Tasa de resolución - destacado */}
                <div
                  className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: `${theme.primary}10` }}
                >
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <TrendingUp className="h-5 w-5" style={{ color: '#10b981' }} />
                    <span className="text-3xl font-bold" style={{ color: theme.text }}>
                      {estadisticasPublicas.tasa_resolucion}%
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                    Tasa de resolución
                  </p>
                </div>

                {/* Otras métricas */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="h-4 w-4" style={{ color: '#3b82f6' }} />
                      <span className="text-xl font-bold" style={{ color: theme.text }}>
                        {estadisticasPublicas.tiempo_promedio_resolucion_dias}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Días prom.</p>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Star className="h-4 w-4" style={{ color: '#f59e0b' }} />
                      <span className="text-xl font-bold" style={{ color: theme.text }}>
                        {estadisticasPublicas.calificacion_promedio.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Calificación</p>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <BarChart3 className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                      <span className="text-xl font-bold" style={{ color: theme.text }}>
                        {estadisticasPublicas.total_reclamos}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Atendidos</p>
                  </div>
                </div>

                {/* Top categorías */}
                {estadisticasPublicas.por_categoria.length > 0 && (
                  <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                    <p className="text-xs font-medium mb-3" style={{ color: theme.textSecondary }}>
                      Categorías más reportadas
                    </p>
                    <div className="space-y-2">
                      {estadisticasPublicas.por_categoria.slice(0, 4).map((cat, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm"
                        >
                          <span style={{ color: theme.text }}>{cat.categoria}</span>
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                          >
                            {cat.cantidad}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Accesos rápidos */}
          {isComponentVisible('accesos_rapidos') && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium" style={{ color: theme.textSecondary }}>
                Accesos rápidos
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                <button
                  onClick={() => navigate('/gestion/mis-reclamos')}
                  className="rounded-xl p-4 text-left transition-all hover:shadow-md group"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${theme.primary}15` }}
                    >
                      <FileText className="h-5 w-5" style={{ color: theme.primary }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm" style={{ color: theme.text }}>Mis Reclamos</p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>Ver historial</p>
                    </div>
                    <ChevronRight
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: theme.textSecondary }}
                    />
                  </div>
                </button>

                <button
                  onClick={() => navigate('/gestion/mapa')}
                  className="rounded-xl p-4 text-left transition-all hover:shadow-md group"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: '#10b98115' }}
                    >
                      <MapPin className="h-5 w-5" style={{ color: '#10b981' }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm" style={{ color: theme.text }}>Ver Mapa</p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>Reclamos en tu zona</p>
                    </div>
                    <ChevronRight
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: theme.textSecondary }}
                    />
                  </div>
                </button>

                <button
                  onClick={() => navigate('/gestion/logros')}
                  className="rounded-xl p-4 text-left transition-all hover:shadow-md group"
                  style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: '#f59e0b15' }}
                    >
                      <Trophy className="h-5 w-5" style={{ color: '#f59e0b' }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm" style={{ color: theme.text }}>Mis Logros</p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>Gamificación</p>
                    </div>
                    <ChevronRight
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: theme.textSecondary }}
                    />
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente auxiliar para las tarjetas de estadísticas
function StatCard({
  theme,
  icon,
  label,
  value,
  color,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 lg:p-5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <p className="text-2xl lg:text-3xl font-bold" style={{ color: theme.text }}>
        {value}
      </p>
      <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
        {label}
      </p>
    </div>
  );
}
