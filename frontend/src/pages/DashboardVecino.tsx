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
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, publicoApi, configuracionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationPrompt from '../components/NotificationPrompt';
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
        setNombreMunicipio(configRes.data.nombre_municipio);
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
    .slice(0, 3);

  const reclamosPendientes = misReclamos.filter(
    r => r.estado !== 'resuelto' && r.estado !== 'rechazado'
  ).length;

  // Helper para verificar si un componente es visible
  const isComponentVisible = (componentId: string): boolean => {
    if (!dashboardConfig?.componentes) return true; // Por defecto mostrar todo
    const comp = dashboardConfig.componentes.find(c => c.id === componentId);
    return comp ? comp.visible : true;
  };

  // Ordenar componentes según configuración
  const getComponentOrder = (componentId: string): number => {
    if (!dashboardConfig?.componentes) return 999;
    const comp = dashboardConfig.componentes.find(c => c.id === componentId);
    return comp ? comp.orden : 999;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  // Definir los componentes del dashboard con su orden
  const dashboardSections = [
    { id: 'stats', order: getComponentOrder('stats'), visible: isComponentVisible('stats') },
    { id: 'reclamos_recientes', order: getComponentOrder('reclamos_recientes'), visible: isComponentVisible('reclamos_recientes') },
    { id: 'stats_municipio', order: getComponentOrder('stats_municipio'), visible: isComponentVisible('stats_municipio') },
    { id: 'accesos_rapidos', order: getComponentOrder('accesos_rapidos'), visible: isComponentVisible('accesos_rapidos') },
  ].sort((a, b) => a.order - b.order);

  // Renderizar componente por ID
  const renderComponent = (id: string) => {
    switch (id) {
      case 'stats':
        return (
          <div key="stats">
            <h2 className="text-base sm:text-lg font-semibold mb-3" style={{ color: theme.text }}>
              Mis Reclamos
            </h2>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
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
        );

      case 'reclamos_recientes':
        return (
          <div key="reclamos_recientes">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-semibold" style={{ color: theme.text }}>
                Reclamos Recientes
              </h2>
              {misReclamos.length > 3 && (
                <button
                  onClick={() => navigate('/mis-reclamos')}
                  className="text-sm flex items-center gap-1 transition-colors"
                  style={{ color: theme.primary }}
                >
                  Ver todos <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>

            {reclamosRecientes.length === 0 ? (
              <div
                className="rounded-xl p-6 text-center"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
              >
                <MapPin className="h-10 w-10 mx-auto mb-3" style={{ color: theme.textSecondary }} />
                <p className="mb-3" style={{ color: theme.textSecondary }}>
                  Aún no tenés reclamos registrados
                </p>
                <button
                  onClick={() => navigate('/nuevo-reclamo')}
                  className="text-sm font-medium"
                  style={{ color: theme.primary }}
                >
                  Crear mi primer reclamo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {reclamosRecientes.map(reclamo => {
                  const estado = estadoColors[reclamo.estado];
                  return (
                    <div
                      key={reclamo.id}
                      onClick={() => navigate('/mis-reclamos')}
                      className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
                      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs" style={{ color: theme.textSecondary }}>#{reclamo.id}</span>
                            <span
                              className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{ backgroundColor: estado.bg, color: estado.text }}
                            >
                              {estadoLabels[reclamo.estado]}
                            </span>
                          </div>
                          <p className="font-medium truncate" style={{ color: theme.text }}>
                            {reclamo.titulo}
                          </p>
                          <p className="text-sm truncate mt-1" style={{ color: theme.textSecondary }}>
                            <MapPin className="h-3 w-3 inline mr-1" />
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
        );

      case 'stats_municipio':
        if (!estadisticasPublicas) return null;
        return (
          <div key="stats_municipio">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
              <h2 className="text-base sm:text-lg font-semibold" style={{ color: theme.text }}>
                {nombreMunicipio || 'Tu Municipio'}
              </h2>
            </div>

            <div
              className="rounded-xl p-4 sm:p-5"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="h-4 w-4" style={{ color: '#10b981' }} />
                    <span className="text-lg sm:text-xl font-bold" style={{ color: theme.text }}>
                      {estadisticasPublicas.tasa_resolucion}%
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Tasa de resolución</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="h-4 w-4" style={{ color: '#3b82f6' }} />
                    <span className="text-lg sm:text-xl font-bold" style={{ color: theme.text }}>
                      {estadisticasPublicas.tiempo_promedio_resolucion_dias}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Días promedio</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Star className="h-4 w-4" style={{ color: '#f59e0b' }} />
                    <span className="text-lg sm:text-xl font-bold" style={{ color: theme.text }}>
                      {estadisticasPublicas.calificacion_promedio.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Calificación</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <BarChart3 className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                    <span className="text-lg sm:text-xl font-bold" style={{ color: theme.text }}>
                      {estadisticasPublicas.total_reclamos}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>Total atendidos</p>
                </div>
              </div>

              {/* Top categorías */}
              {estadisticasPublicas.por_categoria.length > 0 && (
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                  <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>
                    Categorías más reportadas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {estadisticasPublicas.por_categoria.slice(0, 4).map((cat, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded-full text-xs"
                        style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
                      >
                        {cat.categoria} ({cat.cantidad})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'accesos_rapidos':
        return (
          <div key="accesos_rapidos" className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/mis-reclamos')}
              className="rounded-xl p-4 text-left transition-all hover:shadow-md active:scale-[0.98]"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <FileText className="h-6 w-6 mb-2" style={{ color: theme.primary }} />
              <p className="font-medium text-sm" style={{ color: theme.text }}>Mis Reclamos</p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>Ver historial completo</p>
            </button>

            <button
              onClick={() => navigate('/mapa')}
              className="rounded-xl p-4 text-left transition-all hover:shadow-md active:scale-[0.98]"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <MapPin className="h-6 w-6 mb-2" style={{ color: '#10b981' }} />
              <p className="font-medium text-sm" style={{ color: theme.text }}>Ver Mapa</p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>Reclamos en tu zona</p>
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Prompt para activar notificaciones */}
      <NotificationPrompt delay={2000} />

      {/* Header de bienvenida - siempre visible */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: theme.text }}>
          ¡Hola, {user?.nombre}!
        </h1>
        <p className="text-sm sm:text-base mt-1" style={{ color: theme.textSecondary }}>
          Bienvenido a tu panel de reclamos
        </p>
      </div>

      {/* Botones de acción - 2 en una línea */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/gestion/crear-reclamo')}
          className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-medium transition-all active:scale-95 touch-manipulation"
          style={{ backgroundColor: theme.primary, color: 'white' }}
        >
          <PlusCircle className="h-5 w-5" />
          <span className="text-sm">Nuevo Reclamo</span>
        </button>
        <button
          onClick={() => navigate('/gestion/crear-tramite')}
          className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-medium transition-all active:scale-95 touch-manipulation"
          style={{ backgroundColor: '#8b5cf6', color: 'white' }}
        >
          <FileText className="h-5 w-5" />
          <span className="text-sm">Nuevo Trámite</span>
        </button>
      </div>

      {/* Componentes dinámicos según configuración */}
      {dashboardSections
        .filter(section => section.visible)
        .map(section => renderComponent(section.id))}
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
      className="rounded-xl p-2 sm:p-4"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-1 sm:mb-2"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <p className="text-lg sm:text-2xl font-bold" style={{ color: theme.text }}>
        {value}
      </p>
      <p className="text-[10px] sm:text-xs" style={{ color: theme.textSecondary }}>
        {label}
      </p>
    </div>
  );
}
