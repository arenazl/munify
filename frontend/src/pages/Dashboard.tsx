import { useEffect, useState } from 'react';
import { ClipboardList, Clock, TrendingUp, Sparkles, Calendar, AlertTriangle, MapPin, Building2, Route, Shield, AlertCircle, CalendarCheck, CheckCircle2, Repeat, Tags, Users } from 'lucide-react';
import { dashboardApi, analyticsApi, reclamosApi } from '../lib/api';
import { DashboardStats } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ChartSkeleton, DashboardStatSkeleton } from '../components/ui/Skeleton';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import HeatmapWidget from '../components/ui/HeatmapWidget';

// Tipos para analytics
interface HeatmapPoint {
  lat: number;
  lng: number;
  intensidad: number;
  estado: string;
  categoria: string;
}

interface ReclamoRecurrente {
  direccion: string;
  zona: string;
  cantidad: number;
  categorias: string[];
}

interface ReclamoSimilarGrupo {
  id: number;
  titulo: string;
  direccion: string;
  categoria: { id: number; nombre: string } | null;
  zona: string | null;
  cantidad_reportes: number;
  created_at: string;
}

interface TendenciaData {
  fecha: string;
  cantidad: number;
}

type VistaMetrica = 'barrios' | 'tiempos' | 'recurrentes' | 'tendencias' | 'categorias';

interface EmpleadoDistancia {
  empleado_nombre: string;
  reclamos_resueltos: number;
  distancia_total_km: number;
  distancia_promedio_km: number;
}

interface ZonaCobertura {
  zona_nombre: string;
  total_reclamos: number;
  resueltos: number;
  pendientes: number;
  tasa_resolucion: number;
  indice_atencion: number;
}

interface TiempoCategoria {
  categoria: string;
  color: string;
  dias_promedio: number;
}

interface ReclamoResumen {
  id: number;
  titulo: string;
  direccion: string | null;
  categoria: string;
  zona: string | null;
  dias_antiguedad: number;
  prioridad: number;
}

interface MetricasDetalle {
  urgentes: ReclamoResumen[];
  sin_asignar: ReclamoResumen[];
  para_hoy: ReclamoResumen[];
  resueltos: ReclamoResumen[];
}

export default function Dashboard() {
  console.log('🚀 Dashboard v156 - BUILD OK');
  const { theme } = useTheme();
  const { municipioActual } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [porCategoria, setPorCategoria] = useState<{ categoria: string; cantidad: number }[]>([]);
  const [porZona, setPorZona] = useState<{ zona: string; cantidad: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingHeatmap, setLoadingHeatmap] = useState(true);

  // Analytics avanzados
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [vistaActiva, setVistaActiva] = useState<VistaMetrica>('barrios');
  const [recurrentes, setRecurrentes] = useState<ReclamoRecurrente[]>([]);
  const [reclamosSimilares, setReclamosSimilares] = useState<ReclamoSimilarGrupo[]>([]);
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [distancias, setDistancias] = useState<EmpleadoDistancia[]>([]);
  const [cobertura, setCobertura] = useState<ZonaCobertura[]>([]);
  const [tiempoResolucion, setTiempoResolucion] = useState<TiempoCategoria[]>([]);
  const [rendimientoEmpleados, setRendimientoEmpleados] = useState<{ semana: string; [key: string]: string | number }[]>([]);
  const [empleadosNames, setEmpleadosNames] = useState<string[]>([]);
  const [distanciasResumen, setDistanciasResumen] = useState<{ distancia_total_km: number; reclamos_total: number; distancia_promedio_por_reclamo_km: number } | null>(null);
  const [coberturaResumen, setCoberturaResumen] = useState<{ zonas_criticas: number; tasa_resolucion_global: number } | null>(null);
  const [metricasAccion, setMetricasAccion] = useState<{
    urgentes: number;
    sin_asignar: number;
    vencidos: number;
    para_hoy: number;
    resueltos_semana: number;
    cambio_eficiencia: number;
    empleados_activos: number;
    total_empleados: number;
  } | null>(null);
  const [metricasDetalle, setMetricasDetalle] = useState<MetricasDetalle | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Paso 1: Cargar datos básicos primero (más rápido)
        try {
          const statsRes = await dashboardApi.getStats();
          setStats(statsRes.data);
          setLoading(false);
        } catch (error) {
          console.error('Error cargando stats:', error);
          setLoading(false);
        }

        // Paso 2: Cargar gráficos básicos (independientemente)
        try {
          const [categoriaRes, zonasRes, metricasRes] = await Promise.all([
            dashboardApi.getPorCategoria().catch(e => ({ data: [] })),
            dashboardApi.getPorZona().catch(e => ({ data: [] })),
            dashboardApi.getMetricasAccion().catch(e => ({ data: null })),
          ]);
          setPorCategoria(categoriaRes.data || []);
          setPorZona((zonasRes.data || []).slice(0, 5));
          setMetricasAccion(metricasRes.data || null);
        } catch (error) {
          console.error('Error cargando gráficos básicos:', error);
        }
        setLoadingCharts(false);

        // Paso 3: Cargar datos para la vista de métricas (livianos)
        try {
          const muniId = municipioActual?.id;
          const [tendenciasRes, recurrentesRes, similaresRes] = await Promise.all([
            dashboardApi.getTendencia(30).catch(e => ({ data: [] })),
            dashboardApi.getRecurrentes(90, 2).catch(e => ({ data: [] })),
            muniId ? reclamosApi.getRecurrentes({ limit: 10, dias_atras: 30, min_similares: 2, municipio_id: muniId }).catch(e => ({ data: [] })) : Promise.resolve({ data: [] }),
          ]);
          setTendencias(tendenciasRes.data || []);
          setRecurrentes(recurrentesRes.data || []);
          setReclamosSimilares(similaresRes.data || []);
        } catch (error) {
          console.error('Error cargando tendencias y recurrentes:', error);
        }

        // Paso 4: Cargar analytics avanzados (más pesados) de a uno
        try {
          // Traer 90 días para el mapa de calor (más representativo)
          const heatmapRes = await analyticsApi.getHeatmap(90).catch(e => ({ data: { puntos: [] } }));
          setHeatmapData(heatmapRes.data.puntos || []);
        } catch (error) {
          console.error('Error cargando heatmap:', error);
        } finally {
          setLoadingHeatmap(false);
        }

        try {
          const distanciasRes = await analyticsApi.getDistancias(30).catch(e => ({ data: { empleados: [], resumen: null } }));
          setDistancias(distanciasRes.data.empleados || []);
          setDistanciasResumen(distanciasRes.data.resumen || null);
        } catch (error) {
          console.error('Error cargando distancias:', error);
        }

        try {
          const coberturaRes = await analyticsApi.getCobertura(30).catch(e => ({ data: { zonas: [], resumen: null } }));
          setCobertura(coberturaRes.data.zonas || []);
          setCoberturaResumen(coberturaRes.data.resumen || null);
        } catch (error) {
          console.error('Error cargando cobertura:', error);
        }

        try {
          const tiempoRes = await analyticsApi.getTiempoResolucion(90).catch(e => ({ data: { categorias: [] } }));
          setTiempoResolucion(tiempoRes.data.categorias || []);
        } catch (error) {
          console.error('Error cargando tiempo resolución:', error);
        }

        try {
          const rendimientoRes = await analyticsApi.getRendimientoEmpleados(4).catch(e => ({ data: { semanas: [], empleados: [] } }));
          setRendimientoEmpleados(rendimientoRes.data.semanas || []);
          setEmpleadosNames(rendimientoRes.data.empleados || []);
        } catch (error) {
          console.error('Error cargando rendimiento empleados:', error);
        }

        try {
          const metricasDetalleRes = await dashboardApi.getMetricasDetalle().catch(e => ({ data: null }));
          setMetricasDetalle(metricasDetalleRes.data || null);
        } catch (error) {
          console.error('Error cargando métricas detalle:', error);
        }

        setLoadingAnalytics(false);
      } catch (error) {
        console.error('Error general cargando dashboard:', error);
        setLoading(false);
        setLoadingCharts(false);
        setLoadingAnalytics(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton header */}
        <div className="rounded-2xl p-6 animate-pulse" style={{ backgroundColor: theme.card }}>
          <div className="h-8 w-48 rounded-lg" style={{ backgroundColor: `${theme.textSecondary}20` }} />
          <div className="h-4 w-72 mt-2 rounded-lg" style={{ backgroundColor: `${theme.textSecondary}10` }} />
        </div>
        {/* Skeleton cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ backgroundColor: theme.card }}>
              <div className="flex justify-between">
                <div className="space-y-3">
                  <div className="h-3 w-20 rounded" style={{ backgroundColor: `${theme.textSecondary}20` }} />
                  <div className="h-8 w-16 rounded" style={{ backgroundColor: `${theme.textSecondary}30` }} />
                  <div className="h-3 w-24 rounded" style={{ backgroundColor: `${theme.textSecondary}15` }} />
                </div>
                <div className="w-14 h-14 rounded-2xl" style={{ backgroundColor: `${theme.textSecondary}20` }} />
              </div>
            </div>
          ))}
        </div>
        {/* Loading indicator */}
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="relative">
            <div
              className="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent"
              style={{ borderColor: `${theme.primary}30`, borderTopColor: theme.primary }}
            />
            <Sparkles
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 animate-pulse"
              style={{ color: theme.primary }}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>Cargando analytics...</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      title: 'Total Reclamos',
      value: stats.total,
      icon: ClipboardList,
      iconBg: `${theme.primary}30`,
      iconColor: theme.primary,
      trend: '+12%',
      trendUp: true,
    },
    {
      title: 'Nuevos Hoy',
      value: stats.hoy,
      icon: Calendar,
      iconBg: '#f59e0b30',
      iconColor: '#f59e0b',
      trend: '+5',
      trendUp: true,
    },
    {
      title: 'Esta Semana',
      value: stats.semana,
      icon: TrendingUp,
      iconBg: '#22c55e30',
      iconColor: '#22c55e',
      trend: '-8%',
      trendUp: false,
    },
    {
      title: 'Tiempo Promedio',
      value: `${stats.tiempo_promedio_dias}d`,
      icon: Clock,
      iconBg: '#8b5cf630',
      iconColor: '#8b5cf6',
      trend: '-0.5d',
      trendUp: false,
    },
  ];

  const estadoColors: Record<string, string> = {
    nuevo: '#6b7280',
    asignado: '#3b82f6',
    en_proceso: '#f59e0b',
    resuelto: '#22c55e',
    rechazado: '#ef4444',
  };

  const estadosData = Object.entries(stats.por_estado).map(([estado, cantidad]) => ({
    name: estado.replace('_', ' '),
    value: cantidad as number,
    color: estadoColors[estado],
  }));

  const chartColors = {
    primary: theme.primary,
    secondary: '#8b5cf6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    grid: `${theme.textSecondary}20`,
    text: theme.textSecondary,
  };

  const lineColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="rounded-lg p-3 shadow-lg"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <p className="font-medium mb-1" style={{ color: theme.text }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Obtener datos del municipio (preferir contexto sobre localStorage)
  const municipioColor = municipioActual?.color_primario || localStorage.getItem('municipio_color') || theme.primary;
  // Limpiar el nombre si ya incluye "Municipalidad de"
  const rawNombre = municipioActual?.nombre || localStorage.getItem('municipio_nombre') || 'Tu Municipio';
  const municipioNombre = rawNombre.replace(/^Municipalidad de\s*/i, '');

  return (
    <div className="space-y-6">
      {/* Definiciones de gradientes SVG para los gráficos */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.primary} stopOpacity={0.8} />
            <stop offset="100%" stopColor={theme.primaryHover} stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={theme.primary} stopOpacity={1} />
            <stop offset="100%" stopColor={theme.primaryHover} stopOpacity={0.8} />
          </linearGradient>
        </defs>
      </svg>

      {/* Hero Header - Estilo Wok Express */}
      <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: '200px' }}>
        {/* Imagen de fondo - usa imagen_portada si existe, sino logo_url, sino placeholder */}
        <div className="absolute inset-0">
          <img
            src={municipioActual?.imagen_portada || municipioActual?.logo_url || "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070"}
            alt={municipioActual?.nombre || "Ciudad"}
            className="w-full h-full object-cover"
            style={{ opacity: municipioActual?.tema_config?.portadaOpacity ?? 1 }}
          />
          {/* Gradiente oscuro que baja al color del tema - solo si NO está sin filtro */}
          {!municipioActual?.tema_config?.portadaSinFiltro && (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg,
                    rgba(15, 23, 42, 0.7) 0%,
                    rgba(15, 23, 42, 0.85) 40%,
                    ${municipioColor}90 100%
                  )`,
                }}
              />
              {/* Overlay adicional para mejor legibilidad */}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900/50 via-transparent to-slate-900/30" />
            </>
          )}
          {/* Cuando está sin filtro, solo un gradiente sutil para legibilidad del texto */}
          {municipioActual?.tema_config?.portadaSinFiltro && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          )}
        </div>

        {/* Contenido del header */}
        <div className="relative z-10 p-6 flex flex-col justify-end" style={{ minHeight: '200px' }}>
          {/* Info principal */}
          <div className="mt-auto">
            <h1 className="text-3xl md:text-4xl mb-2 drop-shadow-lg" style={{ color: theme.sidebarText }}>
              <span className="font-light">Municipalidad de </span>
              <span className="font-bold">{municipioNombre}</span>
            </h1>
            <p className="text-sm md:text-base mb-4" style={{ color: theme.sidebarTextSecondary }}>
              Monitoreo en tiempo real de gestión municipal
            </p>

            {/* Stats rápidos estilo Wok */}
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: theme.sidebarTextSecondary }}>
              <div className="flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4" />
                <span>{stats?.total || 0} reclamos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{stats?.tiempo_promedio_dias || 0}d promedio</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                <span>{municipioNombre}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats cards - Glassmorphism */}
      {/* Grid dinámico que se adapta a la cantidad de cards */}
      <div className={`grid gap-3 md:gap-4 ${
        cards.length === 1 ? 'grid-cols-1' :
        cards.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
        cards.length === 3 ? 'grid-cols-2 lg:grid-cols-3' :
        cards.length === 4 ? 'grid-cols-2 lg:grid-cols-4' :
        cards.length === 5 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
        'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
      }`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="group relative rounded-2xl p-3 md:p-5 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl cursor-pointer overflow-hidden"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              {/* Gradient overlay on hover */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(135deg, ${card.iconColor}10 0%, transparent 50%)` }}
              />
              {/* Glow effect */}
              <div
                className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"
                style={{ backgroundColor: card.iconColor }}
              />
              <div className="relative flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] md:text-xs uppercase tracking-wider font-medium" style={{ color: theme.textSecondary }}>
                    {card.title}
                  </p>
                  <p className="text-xl md:text-3xl font-black mt-1 md:mt-2 tracking-tight" style={{ color: theme.text }}>{card.value}</p>
                  <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-2">
                    <span
                      className="text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: card.trendUp ? '#22c55e20' : '#ef444420',
                        color: card.trendUp ? '#22c55e' : '#ef4444'
                      }}
                    >
                      {card.trend}
                    </span>
                    <span className="text-[8px] md:text-[10px] hidden md:inline" style={{ color: theme.textSecondary }}>vs mes ant.</span>
                  </div>
                </div>
                <div
                  className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                  style={{
                    backgroundColor: card.iconBg,
                    boxShadow: `0 8px 32px ${card.iconColor}30`
                  }}
                >
                  <Icon className="h-5 w-5 md:h-7 md:w-7" style={{ color: card.iconColor }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fila 1: Estado, Mapa de Calor y Top Categorías */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {loadingCharts ? (
          <>
            <ChartSkeleton height={300} />
            <div className="lg:col-span-2"><ChartSkeleton height={300} /></div>
            <ChartSkeleton height={300} />
          </>
        ) : (
          <>
        {/* Estado de reclamos - Donut Chart */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Por Estado
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={estadosData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {estadosData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {estadosData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs capitalize" style={{ color: theme.textSecondary }}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mapa de Calor - Leaflet con capa de calor real */}
        <div
          className="lg:col-span-2 rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5" style={{ color: theme.primary }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Mapa de Calor - Concentracion de Reclamos
            </h2>
          </div>
          <HeatmapWidget data={heatmapData} height="256px" title="Mapa de Calor - Concentracion de Reclamos" loading={loadingHeatmap} />
          <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
            {heatmapData.length} puntos en los ultimos 90 dias
          </p>
        </div>

        {/* Top categorías */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Top Categorias
            </h2>
            <div className="p-2 rounded-xl" style={{ backgroundColor: '#f59e0b20' }}>
              <AlertTriangle className="h-5 w-5" style={{ color: '#f59e0b' }} />
            </div>
          </div>
          <div className="space-y-4">
            {(porCategoria.length > 0 ? porCategoria : []).slice(0, 5).map((item, index) => {
              const total = porCategoria.reduce((acc, curr) => acc + curr.cantidad, 0);
              const percent = total > 0 ? Math.round((item.cantidad / total) * 100) : 0;
              const colors = [theme.primary, '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444'];
              return (
                <div key={item.categoria}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: theme.text }}>{item.categoria}</span>
                    <span className="text-sm font-medium" style={{ color: theme.textSecondary }}>
                      {item.cantidad} ({percent}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.textSecondary}20` }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%`, backgroundColor: colors[index % colors.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
          </>
        )}
      </div>

      {/* Fila 2: Métricas con botonera y Cobertura */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel de métricas con botonera */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          {/* Botonera de vistas - Modern pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-5 p-1 rounded-2xl" style={{ backgroundColor: `${theme.textSecondary}10` }}>
            {[
              { id: 'barrios' as VistaMetrica, label: 'Barrios', icon: Building2 },
              { id: 'tiempos' as VistaMetrica, label: 'Tiempos', icon: Clock },
              { id: 'recurrentes' as VistaMetrica, label: 'Recurrentes', icon: Repeat },
              { id: 'tendencias' as VistaMetrica, label: 'Tendencias', icon: TrendingUp },
              { id: 'categorias' as VistaMetrica, label: 'Categorías', icon: Tags },
            ].map((btn) => {
              const Icon = btn.icon;
              const isActive = vistaActiva === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => setVistaActiva(btn.id)}
                  className={`relative flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                    isActive ? 'shadow-lg' : 'hover:bg-white/5'
                  }`}
                  style={{
                    background: isActive ? `linear-gradient(135deg, ${theme.primary} 0%, #8b5cf6 100%)` : 'transparent',
                    color: isActive ? 'white' : theme.textSecondary,
                    boxShadow: isActive ? `0 4px 20px ${theme.primary}40` : 'none',
                  }}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
                  <span className="truncate">{btn.label}</span>
                </button>
              );
            })}
          </div>

          {/* Contenido según vista activa */}
          <div className="min-h-[200px]">
            {/* Vista: Barrios/Zonas */}
            {vistaActiva === 'barrios' && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Reclamos por Barrio/Zona
                </h3>
                {porZona.length > 0 ? porZona.slice(0, 6).map((item, index) => {
                  const maxVal = Math.max(...porZona.map(z => z.cantidad));
                  const percent = maxVal > 0 ? (item.cantidad / maxVal) * 100 : 0;
                  return (
                    <div key={item.zona} className="flex items-center gap-3">
                      <span className="text-xs w-20 truncate" style={{ color: theme.textSecondary }}>{item.zona}</span>
                      <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.textSecondary}15` }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: lineColors[index % lineColors.length] }}
                        />
                      </div>
                      <span className="text-xs font-bold w-8 text-right" style={{ color: theme.text }}>{item.cantidad}</span>
                    </div>
                  );
                }) : (
                  <p className="text-sm" style={{ color: theme.textSecondary }}>Sin datos</p>
                )}
              </div>
            )}

            {/* Vista: Tiempos de resolución */}
            {vistaActiva === 'tiempos' && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Tiempo Promedio de Resolución
                </h3>
                {tiempoResolucion.length > 0 ? tiempoResolucion.slice(0, 6).map((item) => {
                  const color = item.dias_promedio <= 2 ? '#22c55e' : item.dias_promedio <= 5 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={item.categoria} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: `${color}10` }}>
                      <span className="text-xs truncate flex-1" style={{ color: theme.text }}>{item.categoria}</span>
                      <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: color, color: 'white' }}>
                        {item.dias_promedio}d
                      </span>
                    </div>
                  );
                }) : (
                  <p className="text-sm" style={{ color: theme.textSecondary }}>Sin datos</p>
                )}
              </div>
            )}

            {/* Vista: Reclamos recurrentes */}
            {vistaActiva === 'recurrentes' && (
              <div className="space-y-4">
                {/* Reclamos similares por ubicacion */}
                {reclamosSimilares.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                      <Users className="h-4 w-4" style={{ color: '#f59e0b' }} />
                      Reclamos Similares en la Zona
                    </h3>
                    <div className="space-y-2">
                      {reclamosSimilares.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-lg cursor-pointer hover:scale-[1.01] transition-all"
                          style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b30' }}
                          onClick={() => window.location.href = `/gestion/reclamos/${item.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-xs font-medium line-clamp-1" style={{ color: theme.text }}>{item.titulo}</span>
                            <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: '#f59e0b', color: 'white' }}>
                              <Users className="h-3 w-3" />
                              {item.cantidad_reportes}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]" style={{ color: theme.textSecondary }}>
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{item.direccion}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>{item.categoria?.nombre || 'Sin categoría'}</span>
                            {item.zona && <span className="text-[10px]" style={{ color: theme.textSecondary }}>{item.zona}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direcciones recurrentes */}
                <div>
                  <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                    Direcciones con Reclamos Recurrentes
                  </h3>
                  {recurrentes.length > 0 ? recurrentes.slice(0, 5).map((item, index) => (
                    <div key={index} className="p-2 rounded-lg mb-2" style={{ backgroundColor: `${theme.primary}10` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate flex-1" style={{ color: theme.text }}>{item.direccion}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded ml-2" style={{ backgroundColor: '#ef4444', color: 'white' }}>
                          {item.cantidad}x
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: theme.textSecondary }}>{item.zona}</span>
                        <span className="text-[10px]" style={{ color: theme.textSecondary }}>•</span>
                        <span className="text-[10px] truncate" style={{ color: theme.textSecondary }}>{item.categorias.join(', ')}</span>
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm" style={{ color: theme.textSecondary }}>No hay reclamos recurrentes</p>
                  )}
                </div>
              </div>
            )}

            {/* Vista: Tendencias */}
            {vistaActiva === 'tendencias' && (
              <div>
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Tendencia de Reclamos (30 días)
                </h3>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tendencias}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="fecha" stroke={chartColors.text} fontSize={9} tickFormatter={(val) => val.slice(5)} />
                      <YAxis stroke={chartColors.text} fontSize={10} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="cantidad" name="Reclamos" stroke={theme.primary} strokeWidth={3} dot={false} fill="url(#colorGradient)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Vista: Categorías */}
            {vistaActiva === 'categorias' && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Distribución por Categoría
                </h3>
                {porCategoria.length > 0 ? porCategoria.slice(0, 6).map((item, index) => {
                  const total = porCategoria.reduce((acc, curr) => acc + curr.cantidad, 0);
                  const percent = total > 0 ? Math.round((item.cantidad / total) * 100) : 0;
                  return (
                    <div key={item.categoria}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs" style={{ color: theme.text }}>{item.categoria}</span>
                        <span className="text-xs" style={{ color: theme.textSecondary }}>{item.cantidad} ({percent}%)</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.textSecondary}15` }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percent}%`, backgroundColor: lineColors[index % lineColors.length] }}
                        />
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm" style={{ color: theme.textSecondary }}>Sin datos</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cobertura por Zona */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5" style={{ color: '#22c55e' }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Cobertura por Zona
            </h2>
          </div>
          <div className="space-y-3">
            {cobertura.slice(0, 5).map((zona) => {
              const color = zona.indice_atencion >= 70 ? '#22c55e' : zona.indice_atencion >= 40 ? '#f59e0b' : '#ef4444';
              return (
                <div key={zona.zona_nombre}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: theme.text }}>{zona.zona_nombre}</span>
                    <span className="text-xs" style={{ color }}>
                      {zona.tasa_resolucion}% resueltos
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.textSecondary}20` }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${zona.indice_atencion}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-xs w-8" style={{ color: theme.textSecondary }}>
                      {zona.total_reclamos}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {coberturaResumen && (
            <div className="mt-4 pt-4 border-t flex justify-between text-xs" style={{ borderColor: theme.border }}>
              <span style={{ color: theme.textSecondary }}>
                Zonas criticas: <strong style={{ color: '#ef4444' }}>{coberturaResumen.zonas_criticas}</strong>
              </span>
              <span style={{ color: theme.textSecondary }}>
                Resolucion global: <strong style={{ color: '#22c55e' }}>{coberturaResumen.tasa_resolucion_global}%</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Fila 3, 4, 5: Analytics Avanzados */}
      {loadingAnalytics ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton height={300} />
            <ChartSkeleton height={300} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton height={300} />
            <ChartSkeleton height={300} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <DashboardStatSkeleton />
            <DashboardStatSkeleton />
            <DashboardStatSkeleton />
            <DashboardStatSkeleton />
          </div>
        </>
      ) : (
      <>
      {/* Fila 3: Distancias y Zonas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distancias de Empleados */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Route className="h-5 w-5" style={{ color: '#8b5cf6' }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Distancia Recorrida por Empleado
            </h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distancias} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis type="number" stroke={chartColors.text} fontSize={12} unit=" km" />
                <YAxis dataKey="empleado_nombre" type="category" stroke={chartColors.text} fontSize={11} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="distancia_total_km" name="Distancia (km)" fill="url(#barGradient)" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {distanciasResumen && (
            <div className="mt-2 pt-2 border-t flex justify-between text-xs" style={{ borderColor: theme.border }}>
              <span style={{ color: theme.textSecondary }}>
                Total: <strong>{distanciasResumen.distancia_total_km} km</strong>
              </span>
              <span style={{ color: theme.textSecondary }}>
                Promedio/reclamo: <strong>{distanciasResumen.distancia_promedio_por_reclamo_km} km</strong>
              </span>
            </div>
          )}
        </div>

        {/* Reclamos por Zona */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Reclamos por Zona
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porZona} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis type="number" stroke={chartColors.text} fontSize={12} />
                <YAxis dataKey="zona" type="category" stroke={chartColors.text} fontSize={12} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cantidad" name="Reclamos" fill="url(#barGradient)" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fila 4: Tiempo Resolucion y Rendimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tiempo de Resolución por Categoría */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Tiempo Promedio de Resolucion
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tiempoResolucion}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="categoria" stroke={chartColors.text} fontSize={10} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke={chartColors.text} fontSize={12} unit="d" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="dias_promedio" name="Dias" radius={[4, 4, 0, 0]} barSize={30}>
                  {tiempoResolucion.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.dias_promedio <= 2 ? '#22c55e' : entry.dias_promedio <= 5 ? '#f59e0b' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rendimiento de Empleados */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Rendimiento de Empleados (Ultimas 4 semanas)
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rendimientoEmpleados}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="semana" stroke={chartColors.text} fontSize={12} />
                <YAxis stroke={chartColors.text} fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {empleadosNames.map((nombre, index) => (
                  <Line
                    key={`empleado-${index}-${nombre}`}
                    type="monotone"
                    dataKey={nombre}
                    name={nombre}
                    stroke={lineColors[index % lineColors.length]}
                    strokeWidth={2}
                    dot={{ fill: lineColors[index % lineColors.length], strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fila 5: Métricas Accionables */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
            {
              label: 'Urgentes',
              sublabel: 'Prioridad alta +3 días',
              value: metricasAccion?.urgentes ?? 0,
              color: '#ef4444',
              icon: AlertCircle,
              alert: (metricasAccion?.urgentes ?? 0) > 0,
              detailKey: 'urgentes' as keyof MetricasDetalle
            },
            {
              label: 'Sin Asignar',
              sublabel: 'Esperando +24h',
              value: metricasAccion?.sin_asignar ?? 0,
              color: '#f59e0b',
              icon: Clock,
              alert: (metricasAccion?.sin_asignar ?? 0) > 3,
              detailKey: 'sin_asignar' as keyof MetricasDetalle
            },
            {
              label: 'Para Hoy',
              sublabel: 'Programados',
              value: metricasAccion?.para_hoy ?? 0,
              color: theme.primary,
              icon: CalendarCheck,
              alert: false,
              detailKey: 'para_hoy' as keyof MetricasDetalle
            },
            {
              label: 'Resueltos',
              sublabel: `${(metricasAccion?.cambio_eficiencia ?? 0) >= 0 ? '+' : ''}${metricasAccion?.cambio_eficiencia ?? 0}% vs sem. ant.`,
              value: metricasAccion?.resueltos_semana ?? 0,
              color: '#22c55e',
              icon: CheckCircle2,
              alert: false,
              detailKey: 'resueltos' as keyof MetricasDetalle
            },
          ].map((item) => {
            const Icon = item.icon;
            const reclamos = metricasDetalle?.[item.detailKey] || [];
            return (
              <div
                key={item.label}
                className={`group relative rounded-2xl p-4 flex flex-col transition-all duration-500 hover:-translate-y-1 overflow-hidden ${item.alert ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: `${item.color}15`,
                  border: `1px solid ${item.color}40`,
                  boxShadow: `0 4px 20px ${item.color}20`,
                }}
              >
                {/* Glow effect on hover */}
                <div
                  className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-500"
                  style={{ backgroundColor: item.color }}
                />
                {/* Header */}
                <div className="relative flex items-center justify-between mb-2">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: `${item.color}25` }}>
                    <Icon className="h-4 w-4" style={{ color: item.color }} />
                  </div>
                  <p className="text-3xl font-black" style={{ color: item.color }}>{item.value}</p>
                </div>
                <p className="text-xs font-semibold" style={{ color: theme.text }}>{item.label}</p>
                <p className="text-[10px] mb-2" style={{ color: theme.textSecondary }}>{item.sublabel}</p>

                {/* Lista con scroll iOS */}
                <div
                  className="mt-2 pt-2 border-t overflow-y-auto scroll-smooth max-h-[120px]"
                  style={{
                    borderColor: `${item.color}40`,
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  <style>{`
                    .ios-scroll::-webkit-scrollbar { display: none; }
                  `}</style>
                  <div className="space-y-1.5 ios-scroll">
                    {reclamos.length > 0 ? reclamos.map((r) => (
                      <div
                        key={r.id}
                        className="p-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: `${item.color}15` }}
                        onClick={() => window.location.href = `/reclamos/${r.id}`}
                      >
                        <p className="text-[10px] font-medium truncate" style={{ color: theme.text }}>
                          {r.titulo}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] px-1 rounded" style={{ backgroundColor: `${item.color}25`, color: item.color }}>
                            {r.categoria}
                          </span>
                          {r.dias_antiguedad > 0 && (
                            <span className="text-[9px]" style={{ color: theme.textSecondary }}>
                              {r.dias_antiguedad}d
                            </span>
                          )}
                        </div>
                      </div>
                    )) : (
                      <p className="text-[10px] text-center py-4" style={{ color: theme.textSecondary }}>
                        Sin reclamos
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      </>
      )}
    </div>
  );
}
