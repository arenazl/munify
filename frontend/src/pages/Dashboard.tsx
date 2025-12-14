import { useEffect, useState } from 'react';
import { ClipboardList, Clock, TrendingUp, Sparkles, Calendar, AlertTriangle, MapPin, Building2, Route, Shield, AlertCircle, CalendarCheck, CheckCircle2, Repeat, Tags } from 'lucide-react';
import { dashboardApi, analyticsApi } from '../lib/api';
import { DashboardStats } from '../types';
import { useTheme } from '../contexts/ThemeContext';
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
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';

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

interface TendenciaData {
  fecha: string;
  cantidad: number;
}

type VistaMetrica = 'barrios' | 'tiempos' | 'recurrentes' | 'tendencias' | 'categorias';

interface CuadrillaDistancia {
  cuadrilla_nombre: string;
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

export default function Dashboard() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [porCategoria, setPorCategoria] = useState<{ categoria: string; cantidad: number }[]>([]);
  const [porZona, setPorZona] = useState<{ zona: string; cantidad: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Analytics avanzados
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [vistaActiva, setVistaActiva] = useState<VistaMetrica>('barrios');
  const [recurrentes, setRecurrentes] = useState<ReclamoRecurrente[]>([]);
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [distancias, setDistancias] = useState<CuadrillaDistancia[]>([]);
  const [cobertura, setCobertura] = useState<ZonaCobertura[]>([]);
  const [tiempoResolucion, setTiempoResolucion] = useState<TiempoCategoria[]>([]);
  const [rendimientoCuadrillas, setRendimientoCuadrillas] = useState<{ semana: string; [key: string]: string | number }[]>([]);
  const [cuadrillasNames, setCuadrillasNames] = useState<string[]>([]);
  const [distanciasResumen, setDistanciasResumen] = useState<{ distancia_total_km: number; reclamos_total: number; distancia_promedio_por_reclamo_km: number } | null>(null);
  const [coberturaResumen, setCoberturaResumen] = useState<{ zonas_criticas: number; tasa_resolucion_global: number } | null>(null);
  const [metricasAccion, setMetricasAccion] = useState<{
    urgentes: number;
    sin_asignar: number;
    vencidos: number;
    para_hoy: number;
    resueltos_semana: number;
    cambio_eficiencia: number;
    cuadrillas_activas: number;
    total_cuadrillas: number;
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Datos básicos
        const [statsRes, categoriaRes, zonasRes] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.getPorCategoria(),
          dashboardApi.getPorZona(),
        ]);
        setStats(statsRes.data);
        setPorCategoria(categoriaRes.data);
        setPorZona(zonasRes.data.slice(0, 5));

        // Analytics avanzados
        const [heatmapRes, distanciasRes, coberturaRes, tiempoRes, rendimientoRes, metricasRes, tendenciasRes, recurrentesRes] = await Promise.all([
          analyticsApi.getHeatmap(30),
          analyticsApi.getDistancias(30),
          analyticsApi.getCobertura(30),
          analyticsApi.getTiempoResolucion(90),
          analyticsApi.getRendimientoCuadrillas(4),
          dashboardApi.getMetricasAccion(),
          dashboardApi.getTendencia(30),
          dashboardApi.getRecurrentes(90, 2),
        ]);

        setHeatmapData(heatmapRes.data.puntos || []);
        setDistancias(distanciasRes.data.cuadrillas || []);
        setDistanciasResumen(distanciasRes.data.resumen || null);
        setCobertura(coberturaRes.data.zonas || []);
        setCoberturaResumen(coberturaRes.data.resumen || null);
        setTiempoResolucion(tiempoRes.data.categorias || []);
        setRendimientoCuadrillas(rendimientoRes.data.semanas || []);
        setCuadrillasNames(rendimientoRes.data.cuadrillas || []);
        setMetricasAccion(metricasRes.data || null);
        setTendencias(tendenciasRes.data || []);
        setRecurrentes(recurrentesRes.data || []);
      } catch (error) {
        console.error('Error cargando dashboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
            style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
          />
          <Sparkles
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse"
            style={{ color: theme.primary }}
          />
        </div>
        <p className="text-sm animate-pulse" style={{ color: theme.textSecondary }}>Cargando analytics...</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Dashboard Analytics</h1>
        <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Datos en tiempo real
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold mt-1" style={{ color: theme.text }}>{card.value}</p>
                  <p
                    className="text-xs mt-1 font-medium"
                    style={{ color: card.trendUp ? '#22c55e' : '#ef4444' }}
                  >
                    {card.trend} vs mes anterior
                  </p>
                </div>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: card.iconBg }}
                >
                  <Icon className="h-6 w-6" style={{ color: card.iconColor }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fila 1: Estado y Mapa de Calor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estado de reclamos - Donut Chart */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
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

        {/* Mapa de Calor - Scatter simulando densidad */}
        <div
          className="lg:col-span-2 rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5" style={{ color: theme.primary }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Mapa de Calor - Concentracion de Reclamos
            </h2>
          </div>
          <div className="h-64">
            {heatmapData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis type="number" dataKey="lng" name="Longitud" domain={['auto', 'auto']} hide />
                  <YAxis type="number" dataKey="lat" name="Latitud" domain={['auto', 'auto']} hide />
                  <ZAxis type="number" dataKey="intensidad" range={[50, 400]} name="Intensidad" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg p-2 shadow-lg text-xs" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
                            <p style={{ color: theme.text }}>{data.categoria}</p>
                            <p style={{ color: theme.textSecondary }}>Estado: {data.estado}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter
                    data={heatmapData}
                    fill={theme.primary}
                    fillOpacity={0.6}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center" style={{ color: theme.textSecondary }}>
                <p>Sin datos de ubicacion disponibles</p>
              </div>
            )}
          </div>
          <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
            {heatmapData.length} puntos en los ultimos 30 dias
          </p>
        </div>
      </div>

      {/* Fila 2: Métricas con botonera y Cobertura */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel de métricas con botonera */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          {/* Botonera de vistas */}
          <div className="flex flex-wrap gap-2 mb-4">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: isActive ? theme.primary : `${theme.textSecondary}15`,
                    color: isActive ? 'white' : theme.textSecondary,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {btn.label}
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
              <div className="space-y-3">
                <h3 className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Direcciones con Reclamos Recurrentes
                </h3>
                {recurrentes.length > 0 ? recurrentes.slice(0, 5).map((item, index) => (
                  <div key={index} className="p-2 rounded-lg" style={{ backgroundColor: `${theme.primary}10` }}>
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
                      <Line type="monotone" dataKey="cantidad" name="Reclamos" stroke={theme.primary} strokeWidth={2} dot={false} />
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
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
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

      {/* Fila 3: Distancias y Zonas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distancias de Cuadrillas */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Route className="h-5 w-5" style={{ color: '#8b5cf6' }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Distancia Recorrida por Cuadrilla
            </h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distancias} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis type="number" stroke={chartColors.text} fontSize={12} unit=" km" />
                <YAxis dataKey="cuadrilla_nombre" type="category" stroke={chartColors.text} fontSize={11} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="distancia_total_km" name="Distancia (km)" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />
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
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
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
                <Bar dataKey="cantidad" name="Reclamos" fill={theme.primary} radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fila 4: Tiempo Resolucion y Rendimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tiempo de Resolución por Categoría */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
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

        {/* Rendimiento de Cuadrillas */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Rendimiento de Cuadrillas (Ultimas 4 semanas)
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rendimientoCuadrillas}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="semana" stroke={chartColors.text} fontSize={12} />
                <YAxis stroke={chartColors.text} fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {cuadrillasNames.map((nombre, index) => (
                  <Line
                    key={nombre}
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

      {/* Fila 5: Top Categorías y Resumen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top categorías */}
        <div
          className="rounded-xl p-6"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Top Categorias
            </h2>
            <AlertTriangle className="h-5 w-5" style={{ color: '#f59e0b' }} />
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

        {/* Resumen rápido - Métricas Accionables */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Urgentes',
              sublabel: 'Prioridad alta +3 días',
              value: metricasAccion?.urgentes ?? 0,
              color: '#ef4444',
              icon: AlertCircle,
              alert: (metricasAccion?.urgentes ?? 0) > 0
            },
            {
              label: 'Sin Asignar',
              sublabel: 'Esperando +24h',
              value: metricasAccion?.sin_asignar ?? 0,
              color: '#f59e0b',
              icon: Clock,
              alert: (metricasAccion?.sin_asignar ?? 0) > 3
            },
            {
              label: 'Para Hoy',
              sublabel: 'Programados',
              value: metricasAccion?.para_hoy ?? 0,
              color: theme.primary,
              icon: CalendarCheck,
              alert: false
            },
            {
              label: 'Resueltos',
              sublabel: `${metricasAccion?.cambio_eficiencia ?? 0 >= 0 ? '+' : ''}${metricasAccion?.cambio_eficiencia ?? 0}% vs sem. ant.`,
              value: metricasAccion?.resueltos_semana ?? 0,
              color: '#22c55e',
              icon: CheckCircle2,
              alert: false
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`rounded-xl p-4 text-center transition-all duration-300 hover:scale-105 ${item.alert ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: `${item.color}15`,
                  border: `1px solid ${item.color}${item.alert ? '80' : '30'}`,
                }}
              >
                <Icon className="h-6 w-6 mx-auto mb-2" style={{ color: item.color }} />
                <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs font-medium mt-1" style={{ color: theme.text }}>{item.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: theme.textSecondary }}>{item.sublabel}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
