import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, TrendingUp, Sparkles, Calendar, AlertTriangle, MapPin, Building2, Route, Shield, AlertCircle, CalendarCheck, CheckCircle2, Repeat, Tags, Users, FileCheck, CalendarDays, Filter, Star } from 'lucide-react';
import { dashboardApi, analyticsApi, reclamosApi, dependenciasApi, calificacionesApi } from '../lib/api';
import { DashboardStats } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ChartSkeleton, DashboardStatSkeleton } from '../components/ui/Skeleton';
import { ModernSelect } from '../components/ui/ModernSelect';
import { estadoColor } from '../lib/enums/reclamo';
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
import PageHint from '../components/ui/PageHint';
import DashboardLive from '../components/DashboardLive';
import PresentacionLive from '../components/PresentacionLive';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import { Radio } from 'lucide-react';

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

// Trend real de una stat-card. null = sin datos suficientes para comparar (no se muestra badge).
interface TrendInfo {
  text: string;
  up: boolean;
}

const trendPct = (actual: number, previo: number): TrendInfo | null =>
  previo > 0
    ? { text: `${actual >= previo ? '+' : ''}${Math.round(((actual - previo) / previo) * 100)}%`, up: actual >= previo }
    : null;

const trendCount = (actual: number, previo: number): TrendInfo | null => {
  if (actual === 0 && previo === 0) return null;
  const delta = actual - previo;
  return { text: `${delta >= 0 ? '+' : ''}${delta}`, up: delta >= 0 };
};

const trendDias = (actual: number | null | undefined, previo: number | null | undefined): TrendInfo | null => {
  if (actual == null || previo == null) return null;
  const delta = Math.round((actual - previo) * 10) / 10;
  return { text: `${delta >= 0 ? '+' : ''}${delta}d`, up: delta >= 0 };
};

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

// Respuesta de GET /calificaciones/estadisticas (schema EstadisticasCalificaciones)
interface CalifEstadisticas {
  total_calificaciones: number;
  promedio_general: number;
  promedio_tiempo_respuesta: number;
  promedio_calidad_trabajo: number;
  promedio_atencion: number;
  distribucion: Record<string, number>;
  tags_frecuentes: { tag: string; count: number }[];
}

export default function Dashboard() {
  console.log('🚀 Dashboard v159 - TRAMITES ALWAYS SHOW');
  const { theme } = useTheme();
  // Detecta tema claro a partir de la luminancia del background del tema activo
  // (mas robusto que mirar nombres de preset/variant).
  const isLightTheme = (() => {
    const hex = (theme.background || '#000000').replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return ((r * 299 + g * 587 + b * 114) / 1000) > 155;
  })();
  const { municipioActual, user } = useAuth();

  // --- Hero header adaptativo -------------------------------------------
  // Si el muni configuro una portada propia la respetamos (foto + overlay
  // oscuro, texto blanco). Si no, en vez de una foto stock generica usamos un
  // "hero de marca" derivado del theme: gradiente con theme.primary + el escudo
  // del muni (o un icono) como watermark. Asi el banner deja de ser una isla
  // oscura en los temas claros y respeta la identidad del municipio.
  // Imagen de fondo del banner: la portada del muni si la cargo; si no, una
  // imagen default. Asi el banner nunca queda sin foto (caso demos / munis nuevos).
  const claroVariant = 7; // variante 8 (elegida 2026-07-03) — fija, botonera de prueba sacada
  const DEFAULT_HERO = 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070';
  const heroBgImage = municipioActual?.imagen_portada || DEFAULT_HERO;
  const tienePortada = true; // siempre hay imagen (portada propia o default)
  // Tema OSCURO -> banner oscuro: velo + tinte del color, la foto manda, texto blanco.
  // Tema CLARO  -> banner claro: overlay que se funde con el fondo de la app
  //                (no queda una isla oscura chocante) y el texto va oscuro.
  const heroFondoOscuro = !isLightTheme;
  // 10 variantes del overlay para TEMA CLARO (distintas: direccion, opacity,
  // con/sin tinte del color). El degrade va concentrado a la izquierda (texto) y
  // se abre hacia la derecha, parecido al modo oscuro. Botonera abajo para elegir.
  const _pc = theme.primary;
  const bannerClaroOverlays = [
    `linear-gradient(105deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.40) 50%, transparent 85%)`,
    `linear-gradient(105deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.15) 100%)`,
    `linear-gradient(105deg, rgba(255,255,255,0.90) 0%, ${_pc}1f 50%, transparent 90%)`,
    `linear-gradient(105deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.50) 50%, rgba(255,255,255,0.34) 100%)`,
    `linear-gradient(105deg, ${_pc}3d 0%, rgba(255,255,255,0.62) 48%, transparent 88%)`,
    `linear-gradient(100deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.32) 35%, transparent 70%)`,
    `linear-gradient(0deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.30) 50%, transparent 85%)`,
    `radial-gradient(125% 135% at 12% 50%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.45) 35%, transparent 64%)`,
    `linear-gradient(105deg, rgba(255,255,255,0.56) 0%, rgba(255,255,255,0.24) 45%, transparent 80%)`,
    `linear-gradient(105deg, rgba(255,255,255,0.90) 0%, ${_pc}24 47%, rgba(255,255,255,0.20) 90%)`,
  ];
  // Opacity extra del overlay en tema claro: suaviza la variante elegida para que
  // no quede tan fuerte (la foto se ve un poco mas). Ajustable por esta variable.
  const claroOverlayOpacity = 0.72;
  const bannerOverlay = isLightTheme
    ? bannerClaroOverlays[claroVariant]
    : `linear-gradient(105deg, rgba(0,0,0,0.58) 0%, ${theme.primary}33 47%, transparent 86%)`;
  const heroBrandBg = isLightTheme
    ? `linear-gradient(135deg, ${theme.primary}26 0%, ${theme.card} 55%, ${theme.primary}14 100%)`
    : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover || theme.primary} 100%)`;
  const heroTextColor = heroFondoOscuro ? '#ffffff' : theme.text;
  const heroTextMuted = heroFondoOscuro ? 'rgba(255,255,255,0.9)' : theme.textSecondary;
  // Tema claro: el overlay radial (variante 8) se abre bastante hacia abajo/derecha,
  // asi que el texto (anclado abajo, justify-end) puede quedar sin proteccion sobre
  // la foto. Un halo blanco sutil en el shadow compensa sin oscurecer el texto.
  const heroShadowStrong = heroFondoOscuro ? '0 2px 8px rgba(0,0,0,0.5)' : '0 1px 12px rgba(255,255,255,0.9), 0 1px 2px rgba(255,255,255,0.9)';
  const heroShadowSoft = heroFondoOscuro ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 10px rgba(255,255,255,0.85), 0 1px 2px rgba(255,255,255,0.85)';
  // ----------------------------------------------------------------------

  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tramitesStats, setTramitesStats] = useState<DashboardStats | null>(null);
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

  // Calificaciones del vecino (la voz del vecino, lado muni) — GET /calificaciones/estadisticas
  const [califStats, setCalifStats] = useState<CalifEstadisticas | null>(null);

  // Callback para navegar al mapa cuando se hace click en una categoría del heatmap
  const handleCategoryClick = useCallback((categoryKey: string, categoryLabel: string) => {
    navigate(`/gestion/mapa?categoria=${encodeURIComponent(categoryKey)}`);
  }, [navigate]);

  // Estado del modo "Live" — fullscreen TV mode con auto-rotate de slides
  const [liveMode, setLiveMode] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);

  // Pull-to-refresh: refreshKey fuerza re-fetch cuando el usuario tira hacia abajo
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(async () => {
    setRefreshKey(k => k + 1);
    await new Promise(r => setTimeout(r, 800));
  }, []);

  // ====================================================================
  // Filtro por dependencia — el dashboard arranca con vista consolidada
  // ("Todas las dependencias"). El admin puede filtrar y la selección se
  // persiste en localStorage por municipio.
  // ====================================================================
  type DependenciaItem = { id: number; nombre: string; color?: string; icono?: string };
  const [dependencias, setDependencias] = useState<DependenciaItem[]>([]);
  const [selectedDependenciaId, setSelectedDependenciaId] = useState<number | null>(null);
  const [dependenciasLoaded, setDependenciasLoaded] = useState(false);

  const lsKey = useMemo(
    () => (municipioActual?.id ? `dashboard_dep_${municipioActual.id}` : null),
    [municipioActual?.id],
  );

  // Cargar dependencias activas del municipio y resolver selección inicial
  useEffect(() => {
    let cancel = false;
    const loadDeps = async () => {
      try {
        const res = await dependenciasApi.getMunicipio({ activo: true });
        if (cancel) return;
        const items: DependenciaItem[] = (res.data || []).map((d: any) => ({
          id: d.id,
          nombre: d.nombre,
          color: d.color,
          icono: d.icono,
        }));
        setDependencias(items);

        // Resolver selección: localStorage > Todas (null)
        // Por defecto el dashboard arranca con vista consolidada de TODAS las
        // dependencias. El admin puede filtrar y la selección se persiste.
        let nextId: number | null = null;
        if (lsKey) {
          const stored = localStorage.getItem(lsKey);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (items.some(i => i.id === parsed)) nextId = parsed;
          }
        }
        setSelectedDependenciaId(nextId);
      } catch (err) {
        console.error('Error cargando dependencias del municipio:', err);
      } finally {
        if (!cancel) setDependenciasLoaded(true);
      }
    };
    loadDeps();
    return () => { cancel = true; };
  }, [lsKey]);

  // Persistir selección
  const handleDependenciaChange = useCallback((value: string) => {
    const id = value ? parseInt(value, 10) : null;
    setSelectedDependenciaId(id);
    if (lsKey) {
      if (id) localStorage.setItem(lsKey, String(id));
      else localStorage.removeItem(lsKey);
    }
  }, [lsKey]);

  // Indicador sutil mientras refrescamos por cambio de dependencia
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // No fetchear nada hasta que sepamos qué dependencia mostrar
    if (!dependenciasLoaded) return;
    const fetchData = async () => {
      try {
        const depId = selectedDependenciaId ?? undefined;

        // Si ya tenemos un primer render, no rompemos el layout con el
        // skeleton: sólo marcamos un refresh sutil y actualizamos en lugar.
        if (stats) setRefreshing(true);

        // Paso 1: Cargar datos básicos primero (más rápido)
        try {
          const [statsRes, tramitesRes] = await Promise.all([
            dashboardApi.getStats(depId),
            dashboardApi.getTramitesStats(depId).catch((err) => {
              console.error('Error cargando tramites stats:', err);
              return { data: null };
            }),
          ]);
          console.log('📊 Stats:', statsRes.data);
          console.log('📋 Tramites Stats:', tramitesRes.data);
          setStats(statsRes.data);
          setTramitesStats(tramitesRes.data);
          setLoading(false);
        } catch (error) {
          console.error('Error cargando stats:', error);
          setLoading(false);
        }

        // Paso 2: Cargar gráficos básicos (independientemente)
        try {
          const [categoriaRes, zonasRes, metricasRes] = await Promise.all([
            dashboardApi.getPorCategoria(depId).catch(e => ({ data: [] })),
            dashboardApi.getPorZona(depId).catch(e => ({ data: [] })),
            dashboardApi.getMetricasAccion(depId).catch(e => ({ data: null })),
          ]);
          setPorCategoria(categoriaRes.data || []);
          setPorZona((zonasRes.data || []).slice(0, 5));
          setMetricasAccion(metricasRes.data || null);
        } catch (error) {
          console.error('Error cargando gráficos básicos:', error);
        }
        setLoadingCharts(false);

        // Paso 3: Cargar datos para la vista de métricas (livianos)
        // Nota: `reclamosApi.getRecurrentes` es público (no autenticado) y no
        // soporta dependencia_id — se mantiene por municipio.
        try {
          const muniId = municipioActual?.id;
          const [tendenciasRes, recurrentesRes, similaresRes] = await Promise.all([
            dashboardApi.getTendencia(30, depId).catch(e => ({ data: [] })),
            dashboardApi.getRecurrentes(90, 2, depId).catch(e => ({ data: [] })),
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
          const heatmapRes = await analyticsApi.getHeatmap(90, undefined, depId).catch(e => ({ data: { puntos: [] } }));
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
          const coberturaRes = await analyticsApi.getCobertura(30, depId).catch(e => ({ data: { zonas: [], resumen: null } }));
          setCobertura(coberturaRes.data.zonas || []);
          setCoberturaResumen(coberturaRes.data.resumen || null);
        } catch (error) {
          console.error('Error cargando cobertura:', error);
        }

        try {
          const tiempoRes = await analyticsApi.getTiempoResolucion(90, depId).catch(e => ({ data: { categorias: [] } }));
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
          const metricasDetalleRes = await dashboardApi.getMetricasDetalle(depId).catch(e => ({ data: null }));
          setMetricasDetalle(metricasDetalleRes.data || null);
        } catch (error) {
          console.error('Error cargando métricas detalle:', error);
        }

        try {
          const califRes = await calificacionesApi.getEstadisticas({ dias: 90 }).catch(() => ({ data: null }));
          setCalifStats(califRes.data || null);
        } catch (error) {
          console.error('Error cargando calificaciones:', error);
        }

        setLoadingAnalytics(false);
        setRefreshing(false);
      } catch (error) {
        console.error('Error general cargando dashboard:', error);
        setLoading(false);
        setLoadingCharts(false);
        setLoadingAnalytics(false);
        setRefreshing(false);
      }
    };
    fetchData();
    // `stats` intencionalmente fuera de deps: solo lo leemos para decidir si
    // marcamos el refresh sutil; agregarlo causaría loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, selectedDependenciaId, dependenciasLoaded, municipioActual?.id]);

  // Opciones del selector de dependencia. Deben declararse ANTES de cualquier
  // early return — si no, el primer render (loading=true) salta estos hooks
  // y el segundo (loading=false) los ejecuta → React #310 (more hooks).
  const showDepFilter = user?.rol === 'admin' || user?.rol === 'supervisor';
  const dependenciaOptions = useMemo(() => [
    { value: '', label: 'Dependencias' },
    ...dependencias.map(d => ({
      value: String(d.id),
      label: d.nombre,
      color: d.color,
    })),
  ], [dependencias]);
  const selectedDepNombre = useMemo(() => {
    if (!selectedDependenciaId) return null;
    return dependencias.find(d => d.id === selectedDependenciaId)?.nombre || null;
  }, [selectedDependenciaId, dependencias]);

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

  // Cards de Reclamos — trends calculados con las comparativas reales del backend
  const tr = stats.tendencias;
  const reclamosCards = [
    {
      title: 'Total Reclamos',
      value: stats.total,
      icon: ClipboardList,
      iconBg: `${theme.primary}30`,
      iconColor: theme.primary,
      trend: tr ? trendPct(tr.creados_30d, tr.creados_30d_prev) : null,
      trendLabel: 'vs mes ant.',
    },
    {
      title: 'Nuevos Hoy',
      value: stats.hoy,
      icon: Calendar,
      iconBg: '#f59e0b30',
      iconColor: '#f59e0b',
      trend: tr ? trendCount(stats.hoy, tr.ayer) : null,
      trendLabel: 'vs ayer',
    },
    {
      title: 'Esta Semana',
      value: stats.semana,
      icon: TrendingUp,
      iconBg: '#22c55e30',
      iconColor: '#22c55e',
      trend: tr ? trendPct(stats.semana, tr.semana_pasada) : null,
      trendLabel: 'vs sem. ant.',
    },
    {
      title: 'Tiempo Promedio',
      value: `${stats.tiempo_promedio_dias}d`,
      icon: Clock,
      iconBg: '#8b5cf630',
      iconColor: '#8b5cf6',
      trend: tr ? trendDias(tr.tiempo_resolucion_30d, tr.tiempo_resolucion_30d_prev) : null,
      trendLabel: 'vs mes ant.',
    },
  ];

  // Cards de Trámites (siempre se muestran, con 0 si no hay datos)
  const tt = tramitesStats?.tendencias;
  const tramitesCards = [
    {
      title: 'Total Trámites',
      value: tramitesStats?.total ?? 0,
      icon: FileCheck,
      iconBg: '#06b6d430',
      iconColor: '#06b6d4',
      trend: tt ? trendPct(tt.creados_30d, tt.creados_30d_prev) : null,
      trendLabel: 'vs mes ant.',
    },
    {
      title: 'Nuevos Hoy',
      value: tramitesStats?.hoy ?? 0,
      icon: CalendarDays,
      iconBg: '#ec489930',
      iconColor: '#ec4899',
      trend: tt ? trendCount(tramitesStats?.hoy ?? 0, tt.ayer) : null,
      trendLabel: 'vs ayer',
    },
    {
      title: 'Esta Semana',
      value: tramitesStats?.semana ?? 0,
      icon: TrendingUp,
      iconBg: '#14b8a630',
      iconColor: '#14b8a6',
      trend: tt ? trendPct(tramitesStats?.semana ?? 0, tt.semana_pasada) : null,
      trendLabel: 'vs sem. ant.',
    },
    {
      title: 'Tiempo Promedio',
      value: `${tramitesStats?.tiempo_promedio_dias ?? 0}d`,
      icon: Clock,
      iconBg: '#a855f730',
      iconColor: '#a855f7',
      trend: tt ? trendDias(tt.tiempo_resolucion_30d, tt.tiempo_resolucion_30d_prev) : null,
      trendLabel: 'vs mes ant.',
    },
  ];

  const estadosData = Object.entries(stats.por_estado).map(([estado, cantidad]) => ({
    name: estado.replace('_', ' '),
    value: cantidad as number,
    color: estadoColor(estado),
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
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="space-y-6">
      <PageHint pageId="dashboard-home" />

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

      {/* Hero Header adaptativo — foto propia del muni o hero de marca del theme. */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ minHeight: '200px' }}
      >
        {/* Fondo del hero: foto propia del muni si la configuro, sino hero de
            marca derivado del theme (sin foto stock generica). */}
        <div className="absolute inset-0">
          {tienePortada ? (
            <>
              <img
                src={heroBgImage}
                alt={municipioActual?.nombre || "Portada"}
                className="w-full h-full object-cover"
                style={{ opacity: municipioActual?.tema_config?.portadaOpacity ?? 1 }}
              />
              {/* Overlay con el COLOR DEL TEMA y alta opacity: el banner toma el
                  tono del muni y la foto queda como textura tenue de fondo. El
                  texto del municipio y los botones (LIVE / Conoce Munify) van por
                  encima (z-10), nitidos y sin overlay. */}
              <div
                className="absolute inset-0"
                style={{ background: bannerOverlay, opacity: isLightTheme ? claroOverlayOpacity : 1 }}
              />
            </>
          ) : (
            <>
              {/* Hero de marca: gradiente del theme + watermark del escudo (o icono). */}
              <div className="absolute inset-0" style={{ background: heroBrandBg }} />
              {municipioActual?.logo_url ? (
                <img
                  src={municipioActual.logo_url}
                  alt=""
                  aria-hidden="true"
                  className="absolute -right-6 -bottom-8 h-52 w-52 object-contain pointer-events-none select-none"
                  style={{ opacity: isLightTheme ? 0.1 : 0.16 }}
                />
              ) : (
                <Building2
                  aria-hidden="true"
                  className="absolute -right-8 -bottom-10 pointer-events-none"
                  style={{
                    width: '13rem',
                    height: '13rem',
                    color: heroFondoOscuro ? '#ffffff' : theme.primary,
                    opacity: isLightTheme ? 0.08 : 0.13,
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Botón LIVE — solo para admin/supervisor (modo televisor) */}
        {(user?.rol === 'admin' || user?.rol === 'supervisor') && (
        <>
        {/* Conoce Munify — extremo IZQUIERDO, mismo estilo/brillo que LIVE (color indigo) */}
        <button
          onClick={() => setPresentOpen(true)}
          className="cm-btn absolute top-4 left-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm backdrop-blur-md group overflow-hidden"
          style={{
            backgroundColor: heroFondoOscuro ? 'rgba(99, 102, 241, 0.28)' : 'rgba(99, 102, 241, 0.92)',
            border: '2px solid rgba(99, 102, 241, 0.7)',
            color: '#ffffff',
          }}
          title="Recorrido guiado del producto"
        >
          <span className="cm-ring absolute inset-0 rounded-full pointer-events-none" />
          <span className="live-shimmer-btn absolute inset-0 rounded-full pointer-events-none" />
          <Sparkles className="h-4 w-4 relative z-10 live-radio" />
          <span className="tracking-wider relative z-10">Conocé Munify</span>
        </button>
        {/* LIVE — extremo DERECHO */}
        <button
          onClick={() => setLiveMode(true)}
          className="live-btn absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm backdrop-blur-md group overflow-hidden"
          style={{
            backgroundColor: heroFondoOscuro ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.92)',
            border: '2px solid rgba(239, 68, 68, 0.7)',
            color: '#ffffff',
          }}
          title="Modo televisor — slides en pantalla completa"
        >
          <span className="live-ring absolute inset-0 rounded-full pointer-events-none" />
          <span className="live-shimmer-btn absolute inset-0 rounded-full pointer-events-none" />
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 live-dot relative z-10" />
          <Radio className="h-4 w-4 relative z-10 live-radio" />
          <span className="tracking-wider relative z-10">LIVE</span>
        </button>
        </>
        )}

        {/* Botonera de prueba de overlays (variante 8 elegida el 2026-07-03) —
            sacada de la UI. El array bannerClaroOverlays queda por si se
            quiere retomar la comparación más adelante. */}


        <style>{`
          .live-btn {
            animation: liveBtnBreathe 2.4s ease-in-out infinite;
            box-shadow: 0 4px 16px rgba(239, 68, 68, 0.5);
          }
          .live-btn:hover {
            animation-play-state: paused;
            transform: scale(1.08);
            box-shadow: 0 8px 24px rgba(239, 68, 68, 0.7);
          }
          .live-btn:active { transform: scale(0.95); }

          @keyframes liveBtnBreathe {
            0%, 100% { box-shadow: 0 4px 16px rgba(239, 68, 68, 0.5); transform: scale(1); }
            50%      { box-shadow: 0 6px 28px rgba(239, 68, 68, 0.85); transform: scale(1.04); }
          }

          /* Anillo pulsante que se expande hacia afuera */
          .live-ring {
            border: 2px solid rgba(239, 68, 68, 0.6);
            animation: liveRingPulse 2s ease-out infinite;
          }
          @keyframes liveRingPulse {
            0%   { transform: scale(1);   opacity: 0.7; }
            100% { transform: scale(1.6); opacity: 0; }
          }

          /* Shimmer diagonal que cruza cada 3s */
          .live-shimmer-btn {
            background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 45%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.35) 55%, transparent 70%);
            background-size: 250% 100%;
            background-position: 200% 0;
            animation: liveShimmerMove 3s ease-in-out infinite;
          }
          @keyframes liveShimmerMove {
            0%, 100% { background-position: 200% 0; }
            50%      { background-position: -50% 0; }
          }

          /* Puntito rojo con pulso más vivo */
          .live-dot {
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.9);
            animation: liveDotPulse 1.2s ease-in-out infinite;
          }
          @keyframes liveDotPulse {
            0%, 100% { transform: scale(1);   opacity: 1;   box-shadow: 0 0 8px rgba(239,68,68,0.9); }
            50%      { transform: scale(1.3); opacity: 0.7; box-shadow: 0 0 14px rgba(239,68,68,1); }
          }

          /* Icono de radio con micro-wobble sutil */
          .live-radio {
            animation: liveRadioWobble 4s ease-in-out infinite;
          }
          @keyframes liveRadioWobble {
            0%, 100% { transform: rotate(0deg); }
            25%      { transform: rotate(-8deg); }
            75%      { transform: rotate(8deg); }
          }

          /* Conoce Munify — mismas animaciones que LIVE, color distinto (indigo) */
          @keyframes cmBtnBreathe {
            0%, 100% { box-shadow: 0 4px 16px rgba(99,102,241,0.5); transform: scale(1); }
            50%      { box-shadow: 0 6px 28px rgba(99,102,241,0.85); transform: scale(1.04); }
          }
          .cm-btn { animation: cmBtnBreathe 2.4s ease-in-out infinite; box-shadow: 0 4px 16px rgba(99,102,241,0.5); }
          .cm-btn:hover { animation-play-state: paused; transform: scale(1.08); box-shadow: 0 8px 24px rgba(99,102,241,0.7); }
          .cm-btn:active { transform: scale(0.95); }
          .cm-ring { border: 2px solid rgba(99,102,241,0.6); animation: liveRingPulse 2s ease-out infinite; }

          @media (prefers-reduced-motion: reduce) {
            .live-btn, .live-ring, .live-shimmer-btn, .live-dot, .live-radio, .cm-btn, .cm-ring {
              animation: none !important;
            }
          }
        `}</style>

        {/* Contenido del header */}
        <div className="relative z-10 p-6 flex flex-col justify-end" style={{ minHeight: '200px' }}>
          {/* Info principal */}
          <div className="mt-auto">
            {/* Texto adaptativo: claro sobre foto/gradiente intenso (tema oscuro),
                oscuro sobre el hero de marca suave (tema claro). Ver heroTextColor. */}
            <h1 className="text-3xl md:text-4xl mb-2" style={{ color: heroTextColor, textShadow: heroShadowStrong }}>
              <span className="font-light">Municipalidad de </span>
              <span className="font-bold">{municipioNombre}</span>
            </h1>
            <p className="text-sm md:text-base mb-4 font-medium" style={{ color: heroTextMuted, textShadow: heroShadowSoft }}>
              {selectedDepNombre
                ? <>Vista de la dependencia <strong>{selectedDepNombre}</strong></>
                : 'Vista consolidada de todas las dependencias'}
            </p>

            {/* Stats rápidos estilo Wok */}
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium" style={{ color: heroTextMuted, textShadow: heroShadowSoft }}>
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

      {/* Filtro por dependencia — gobierna toda la información del tablero.
          A nivel admin no tiene sentido un dashboard "global" sin foco; por
          eso arranca pre-seleccionando la primera dependencia activa. */}
      {showDepFilter && dependencias.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          }}
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}18` }}
          >
            <Filter className="h-5 w-5" style={{ color: theme.primary }} />
          </div>
          <div className="flex-shrink-0 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
              Filtrar tablero
            </p>
            <p className="text-xs" style={{ color: theme.text }}>Dependencia</p>
          </div>
          <div className="flex-1 min-w-0 max-w-md">
            <ModernSelect
              value={selectedDependenciaId ? String(selectedDependenciaId) : ''}
              onChange={handleDependenciaChange}
              options={dependenciaOptions}
              placeholder="Elegir dependencia..."
              searchable
            />
          </div>
          {refreshing && (
            <div className="flex items-center gap-2 text-xs flex-shrink-0" style={{ color: theme.textSecondary }}>
              <div
                className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: `${theme.primary}50`, borderTopColor: 'transparent' }}
              />
              <span className="hidden sm:inline">Actualizando…</span>
            </div>
          )}
        </div>
      )}

      {/* Stats cards - Dos filas: Reclamos y Trámites */}
      <div className="space-y-4">
        {/* Fila Reclamos */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4" style={{ color: theme.primary }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Reclamos</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {reclamosCards.map((card) => {
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
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{ background: `linear-gradient(135deg, ${card.iconColor}10 0%, transparent 50%)` }}
                  />
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
                      {card.trend && (
                        <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-2">
                          <span
                            className="text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: card.trend.up ? '#22c55e20' : '#ef444420',
                              color: card.trend.up ? '#22c55e' : '#ef4444'
                            }}
                          >
                            {card.trend.text}
                          </span>
                          <span className="text-[8px] md:text-[10px] hidden md:inline" style={{ color: theme.textSecondary }}>{card.trendLabel}</span>
                        </div>
                      )}
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
        </div>

        {/* Fila Trámites */}
        <div>
            <div className="flex items-center gap-2 mb-3">
              <FileCheck className="h-4 w-4" style={{ color: '#06b6d4' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textSecondary }}>Trámites</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {tramitesCards.map((card) => {
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
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{ background: `linear-gradient(135deg, ${card.iconColor}10 0%, transparent 50%)` }}
                    />
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
                        {card.trend && (
                          <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-2">
                            <span
                              className="text-[10px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: card.trend.up ? '#22c55e20' : '#ef444420',
                                color: card.trend.up ? '#22c55e' : '#ef4444'
                              }}
                            >
                              {card.trend.text}
                            </span>
                            <span className="text-[8px] md:text-[10px] hidden md:inline" style={{ color: theme.textSecondary }}>{card.trendLabel}</span>
                          </div>
                        )}
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
          </div>
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
          <HeatmapWidget
            data={heatmapData}
            height="256px"
            title="Mapa de Calor - Concentracion de Reclamos"
            loading={loadingHeatmap}
            onCategoryClick={handleCategoryClick}
          />
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
                          onClick={() => navigate(`/gestion/reclamos/${item.id}`)}
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
        {/* Reclamos por Categoría */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Reclamos por Categoría
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porCategoria.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis type="number" stroke={chartColors.text} fontSize={12} />
                <YAxis dataKey="categoria" type="category" stroke={chartColors.text} fontSize={11} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cantidad" name="Reclamos" fill="url(#barGradient)" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 pt-2 border-t flex justify-between text-xs" style={{ borderColor: theme.border }}>
            <span style={{ color: theme.textSecondary }}>
              Total categorías: <strong>{porCategoria.length}</strong>
            </span>
            <span style={{ color: theme.textSecondary }}>
              Total reclamos: <strong>{porCategoria.reduce((acc, curr) => acc + curr.cantidad, 0)}</strong>
            </span>
          </div>
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

        {/* Tendencia de Reclamos */}
        <div
          className="rounded-2xl p-6 backdrop-blur-sm"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
            Tendencia de Reclamos (Últimos 7 días)
          </h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencias}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="fecha" stroke={chartColors.text} fontSize={12} />
                <YAxis stroke={chartColors.text} fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cantidad"
                  name="Reclamos"
                  stroke={theme.primary}
                  strokeWidth={2}
                  dot={{ fill: theme.primary, strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
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
                        onClick={() => navigate(`/gestion/reclamos/${r.id}`)}
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

      {/* Fila 6: La voz del vecino — promedio + distribución de calificaciones */}
      <div
        className="rounded-2xl p-6 backdrop-blur-sm"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Star className="h-5 w-5" style={{ color: theme.primary }} />
          <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
            La voz del vecino
          </h2>
        </div>
        <p className="text-xs mb-5" style={{ color: theme.textSecondary }}>
          Calificaciones de reclamos finalizados (últimos 90 días)
        </p>

        {!califStats || califStats.total_calificaciones === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Star className="h-8 w-8 mb-2" style={{ color: `${theme.textSecondary}60` }} />
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Todavía no hay calificaciones en este período.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Promedio + estrellas */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-5xl font-black" style={{ color: theme.primary }}>
                {califStats.promedio_general.toFixed(1)}
              </p>
              <div className="flex items-center gap-1 mt-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const activa = n <= Math.round(califStats.promedio_general);
                  return (
                    <Star
                      key={n}
                      className="h-5 w-5"
                      style={{ color: activa ? theme.primary : `${theme.textSecondary}50` }}
                      fill={activa ? theme.primary : 'none'}
                    />
                  );
                })}
              </div>
              <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
                {califStats.total_calificaciones} {califStats.total_calificaciones === 1 ? 'calificación' : 'calificaciones'}
              </p>
            </div>

            {/* Distribución 5 → 1 */}
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((estrella) => {
                const cantidad = califStats.distribucion[String(estrella)] || 0;
                const pct = califStats.total_calificaciones > 0
                  ? Math.round((cantidad / califStats.total_calificaciones) * 100)
                  : 0;
                return (
                  <div key={estrella} className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5 w-8 text-xs font-medium" style={{ color: theme.textSecondary }}>
                      {estrella}
                      <Star className="h-3 w-3" style={{ color: theme.primary }} fill={theme.primary} />
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.textSecondary}20` }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: theme.primary }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs" style={{ color: theme.textSecondary }}>
                      {cantidad}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {/* Modo televisor (TV mode) — overlay fullscreen con auto-rotate */}
      <DashboardLive
        open={liveMode}
        onClose={() => setLiveMode(false)}
        municipioNombre={municipioNombre}
        stats={stats}
        porCategoria={porCategoria}
        porZona={porZona}
        tendencias={tendencias}
        heatmapData={heatmapData}
      />
      <PresentacionLive open={presentOpen} onClose={() => setPresentOpen(false)} />
    </div>
    </PullToRefresh>
  );
}
