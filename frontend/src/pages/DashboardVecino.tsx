import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  MapPin,
  ChevronRight,
  Building2,
  Star,
  BarChart3,
  Trophy,
  Sparkles,
  Map,
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
  pendiente_confirmacion: 'Pendiente',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

export default function DashboardVecino() {
  const { theme } = useTheme();
  const { user, municipioActual } = useAuth();
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
        const nombre = configRes.data.nombre_municipio.replace(/^Municipalidad de\s*/i, '');
        setNombreMunicipio(nombre);
      }

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

  const municipioNombre = municipioActual?.nombre?.replace('Municipalidad de ', '')
    || nombreMunicipio
    || localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '')
    || 'Mi Municipio';

  const municipioLogo = municipioActual?.logo_url || localStorage.getItem('municipio_logo_url');

  return (
    <div className="space-y-5">
      <NotificationPrompt delay={2000} />

      {/* Hero Banner con imagen de fondo */}
      <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: '180px' }}>
        {/* Imagen de fondo */}
        <div className="absolute inset-0">
          <img
            alt={municipioNombre}
            className="w-full h-full object-cover"
            src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070"
          />
          {/* Gradiente oscuro */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.85) 40%, rgba(23, 31, 50, 0.6) 100%)',
            }}
          />
          {/* Gradiente lateral */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/50 via-transparent to-slate-900/30" />
        </div>

        {/* Contenido */}
        <div className="relative z-10 p-5 flex flex-col justify-end" style={{ minHeight: '180px' }}>
          <div className="mt-auto">
            {/* Título del municipio */}
            <h1 className="text-2xl md:text-3xl mb-1 drop-shadow-lg text-white">
              <span className="font-light">Municipalidad de </span>
              <span className="font-bold">{municipioNombre}</span>
            </h1>

            {/* Saludo */}
            <p className="text-sm mb-3" style={{ color: '#94a3b8' }}>
              ¡Hola, {user?.nombre}! Bienvenido a tu panel
            </p>

            {/* Stats rápidas */}
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: '#94a3b8' }}>
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>{misEstadisticas.total} reclamos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{reclamosPendientes} pendientes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>{misEstadisticas.resueltos} resueltos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats compactas - scroll horizontal en móvil */}
      {isComponentVisible('stats') && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4">
          <MiniStatCard
            theme={theme}
            icon={<FileText className="h-4 w-4" />}
            label="Total"
            value={misEstadisticas.total}
            color={theme.primary}
          />
          <MiniStatCard
            theme={theme}
            icon={<Clock className="h-4 w-4" />}
            label="Pendientes"
            value={reclamosPendientes}
            color="#f59e0b"
          />
          <MiniStatCard
            theme={theme}
            icon={<CheckCircle className="h-4 w-4" />}
            label="Resueltos"
            value={misEstadisticas.resueltos}
            color="#10b981"
          />
          <MiniStatCard
            theme={theme}
            icon={<AlertCircle className="h-4 w-4" />}
            label="Rechazados"
            value={misEstadisticas.rechazados}
            color="#ef4444"
          />
        </div>
      )}

      {/* Accesos rápidos - grid 2x2 en móvil */}
      {isComponentVisible('accesos_rapidos') && (
        <div className="grid grid-cols-2 gap-3">
          <QuickAccessCard
            theme={theme}
            icon={<FileText className="h-5 w-5" />}
            title="Mis Reclamos"
            subtitle="Ver historial"
            color={theme.primary}
            onClick={() => navigate('/gestion/mis-reclamos')}
          />
          <QuickAccessCard
            theme={theme}
            icon={<Map className="h-5 w-5" />}
            title="Ver Mapa"
            subtitle="Tu zona"
            color="#10b981"
            onClick={() => navigate('/gestion/mapa')}
          />
          <QuickAccessCard
            theme={theme}
            icon={<Trophy className="h-5 w-5" />}
            title="Mis Logros"
            subtitle="Gamificación"
            color="#f59e0b"
            onClick={() => navigate('/gestion/logros')}
          />
          <QuickAccessCard
            theme={theme}
            icon={<BarChart3 className="h-5 w-5" />}
            title="Estadísticas"
            subtitle="Del municipio"
            color="#8b5cf6"
            onClick={() => {/* scroll to stats */}}
          />
        </div>
      )}

      {/* Reclamos recientes */}
      {isComponentVisible('reclamos_recientes') && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="font-semibold" style={{ color: theme.text }}>
              Reclamos Recientes
            </h2>
            {misReclamos.length > 5 && (
              <button
                onClick={() => navigate('/gestion/mis-reclamos')}
                className="text-sm flex items-center gap-1"
                style={{ color: theme.primary }}
              >
                Ver todos <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {reclamosRecientes.length === 0 ? (
            <div className="text-center py-8 px-4">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
                style={{ backgroundColor: `${theme.primary}15` }}
              >
                <Sparkles className="h-7 w-7" style={{ color: theme.primary }} />
              </div>
              <p className="font-medium text-sm" style={{ color: theme.text }}>
                Aún no tenés reclamos
              </p>
              <p className="text-xs mt-1 mb-3" style={{ color: theme.textSecondary }}>
                Usá el botón + del menú para crear uno
              </p>
            </div>
          ) : (
            <div>
              {reclamosRecientes.map((reclamo, idx) => {
                const estado = estadoColors[reclamo.estado];
                return (
                  <div
                    key={reclamo.id}
                    onClick={() => navigate('/gestion/mis-reclamos')}
                    className="flex items-center gap-3 p-4 cursor-pointer transition-colors active:bg-black/5"
                    style={{
                      borderTop: idx > 0 ? `1px solid ${theme.border}` : undefined,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>
                          #{reclamo.id}
                        </span>
                        <span
                          className="px-2 py-0.5 text-[10px] font-medium rounded-full"
                          style={{ backgroundColor: estado.bg, color: estado.text }}
                        >
                          {estadoLabels[reclamo.estado]}
                        </span>
                      </div>
                      <p className="font-medium text-sm truncate" style={{ color: theme.text }}>
                        {reclamo.titulo}
                      </p>
                      <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: theme.textSecondary }}>
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {reclamo.direccion}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Estadísticas del municipio - compacto */}
      {isComponentVisible('stats_municipio') && estadisticasPublicas && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-5 w-5" style={{ color: theme.primary }} />
            <h2 className="font-semibold" style={{ color: theme.text }}>
              {municipioNombre}
            </h2>
          </div>

          {/* Métricas en fila */}
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" style={{ color: '#10b981' }} />
                <span className="text-lg font-bold" style={{ color: theme.text }}>
                  {estadisticasPublicas.tasa_resolucion}%
                </span>
              </div>
              <p className="text-[10px]" style={{ color: theme.textSecondary }}>Resueltos</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Clock className="h-3.5 w-3.5" style={{ color: '#3b82f6' }} />
                <span className="text-lg font-bold" style={{ color: theme.text }}>
                  {estadisticasPublicas.tiempo_promedio_resolucion_dias}
                </span>
              </div>
              <p className="text-[10px]" style={{ color: theme.textSecondary }}>Días prom.</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Star className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} />
                <span className="text-lg font-bold" style={{ color: theme.text }}>
                  {estadisticasPublicas.calificacion_promedio.toFixed(1)}
                </span>
              </div>
              <p className="text-[10px]" style={{ color: theme.textSecondary }}>Calif.</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" style={{ color: '#8b5cf6' }} />
                <span className="text-lg font-bold" style={{ color: theme.text }}>
                  {estadisticasPublicas.total_reclamos}
                </span>
              </div>
              <p className="text-[10px]" style={{ color: theme.textSecondary }}>Total</p>
            </div>
          </div>

          {/* Top categorías - compacto */}
          {estadisticasPublicas.por_categoria.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>
                Más reportadas
              </p>
              <div className="flex flex-wrap gap-2">
                {estadisticasPublicas.por_categoria.slice(0, 4).map((cat, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-full text-xs"
                    style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
                  >
                    {cat.categoria} <span style={{ color: theme.textSecondary }}>({cat.cantidad})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Stats compactas
function MiniStatCard({
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
      className="flex-shrink-0 w-[100px] lg:w-auto rounded-xl p-3"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <p className="text-xl font-bold" style={{ color: theme.text }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: theme.textSecondary }}>
        {label}
      </p>
    </div>
  );
}

// Accesos rápidos compactos
function QuickAccessCard({
  theme,
  icon,
  title,
  subtitle,
  color,
  onClick,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl p-3 text-left transition-all active:scale-95"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-2"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <p className="font-medium text-sm" style={{ color: theme.text }}>{title}</p>
      <p className="text-xs" style={{ color: theme.textSecondary }}>{subtitle}</p>
    </button>
  );
}
