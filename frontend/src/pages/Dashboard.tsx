import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, TrendingUp, MapPin, Users, ListChecks, FileCheck } from 'lucide-react';
import { dashboardApi, analyticsApi, reclamosApi, dependenciasApi, calificacionesApi, municipiosApi } from '../lib/api';
import { DashboardStats } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth, type Municipio } from '../contexts/AuthContext';
import { ChartSkeleton } from '../components/ui/Skeleton';
import { AdaptiveFilter, type AdaptiveFilterGroup } from '../components/ui/AdaptiveFilter';
import { BarList, type BarListItem, type BarListTono } from '../components/ui/BarList';
import { estadoColor, estadoLabel } from '../lib/enums/reclamo';
import { parseFechaLocal } from '../lib/tesoreria-helpers';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  Line,
} from 'recharts';
import HeatmapWidget from '../components/ui/HeatmapWidget';
import { SemanticHero } from '../components/ui/SemanticHero';
import { BalanceBar } from '../components/ui/BalanceBar';
import { FocosRotativos, type Foco } from '../components/dashboard/FocosRotativos';
import { textoBalance } from '../lib/balance';
import { seg, type HeroFrase } from '../lib/semanticHero';
import {
  resolverUmbrales,
  veredictoMasEsPeor,
  veredictoTasa,
  veredictoMenosEsMejor,
  metaResolucionDias,
} from '../lib/veredictos';
import DashboardLive from '../components/DashboardLive';
import { VozDelVecino } from '../components/dashboard/VozDelVecino';
import { HeroBannerV2, type HeroStripKpi } from '../components/dashboard/HeroBannerV2';
import { SectionTitleV2 } from '../components/dashboard/SectionTitleV2';
import { KpiCardV2, type KpiCardV2Props } from '../components/dashboard/KpiCardV2';
import PresentacionLive from '../components/PresentacionLive';
import { BRAND } from '../brands';
import { PullToRefresh } from '../components/ui/PullToRefresh';

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
  /** La categoría que más pesa en esa esquina, y cuántos de sus reclamos son.
   *  Es lo que deja decir "6 de cada 10 son de Higiene urbana" cuando se está
   *  mirando el mapa sin filtrar por categoría. Opcional: si el backend viejo
   *  todavía no las manda, la fila muestra sólo la dirección. */
  categoria_top?: string | null;
  categoria_top_cantidad?: number;
  /** Centro de la esquina (promedio de sus reclamos), para encuadrar el mapa.
   *  null si esos reclamos no tienen coordenadas: ese foco se saltea. */
  lat?: number | null;
  lng?: number | null;
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
  /** Reclamos ingresados ese día (contrato histórico del endpoint). */
  cantidad: number;
  /**
   * Reclamos cerrados ese día. OPCIONAL a propósito: si el backend todavía no
   * la devuelve, el gráfico dibuja sólo ingresados y oculta la leyenda —
   * jamás se inventa la serie.
   */
  resueltos?: number;
}

type VistaMetrica = 'barrios' | 'tiempos' | 'recurrentes' | 'categorias';

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
  /** Trabajados por la cuadrilla, esperando el cierre del supervisor. */
  esperando_visto_bueno: ReclamoResumen[];
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

// Estados que NO cuentan como "abiertos" para el strip del hero.
// Patrón resiliente: cualquier estado desconocido cuenta como abierto.
const ESTADOS_CERRADOS = new Set(['finalizado', 'rechazado', 'resuelto']);

const contarAbiertos = (s: DashboardStats | null): number =>
  s
    ? Object.entries(s.por_estado || {}).reduce(
        (acc, [estado, n]) => (ESTADOS_CERRADOS.has(estado) ? acc : acc + (n as number)),
        0,
      )
    : 0;

// ====================================================================
// Filas de KPI v2 (Reclamos / Trámites) — TODO sale de datos reales del
// backend (stats + stats.tendencias); los deltas se calculan contra los
// períodos previos y, si falta la base de comparación, se degrada a un
// subtexto informativo. JAMÁS se inventan series ni porcentajes.
// ====================================================================

const fmtDias = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/**
 * 'YYYY-MM-DD' → '1 jul' (día + mes corto en minúscula). Parsea LOCAL:
 * `new Date('2026-07-01')` se lee como UTC y en ARG muestra el día anterior.
 */
const fmtFechaCorta = (iso: string): string => {
  const d = parseFechaLocal(iso);
  if (isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    .replace(/\./g, '')
    .toLowerCase();
};

/** % de variación redondeado; null si no hay base de comparación. */
const pctDelta = (actual: number, prev: number): number | null =>
  prev > 0 ? Math.round(((actual - prev) / prev) * 100) : null;

/** Suma la serie diaria en bloques semanales (de más viejo a más nuevo). */
const seriePorSemana = (diaria: number[]): number[] => {
  const semanas: number[] = [];
  for (let i = diaria.length; i > 0; i -= 7) {
    semanas.unshift(diaria.slice(Math.max(0, i - 7), i).reduce((a, b) => a + b, 0));
  }
  return semanas;
};

const buildKpisPeriodo = (opts: {
  stats: DashboardStats;
  etiquetaTotal: string;
  /** Serie diaria real de ingresos (ej: tendencia 30 días de reclamos). */
  serieDiaria?: number[];
  color: string;
  colorNeutro: string;
  msgSinCierres: string;
}): KpiCardV2Props[] => {
  const s = opts.stats;
  const t = s.tendencias;
  const diaria = opts.serieDiaria && opts.serieDiaria.length >= 2 ? opts.serieDiaria : null;
  const colorear = (card: KpiCardV2Props): KpiCardV2Props => ({
    ...card,
    serieColor: card.atenuado ? opts.colorNeutro : opts.color,
  });

  const pctMes = t ? pctDelta(t.creados_30d, t.creados_30d_prev) : null;
  const total: KpiCardV2Props = {
    eyebrow: opts.etiquetaTotal,
    valor: s.total,
    atenuado: s.total === 0,
    serie: diaria ?? (t ? [t.creados_30d_prev, t.creados_30d] : undefined),
    delta: pctMes != null && pctMes !== 0
      ? {
          texto: `${Math.abs(pctMes)}%`,
          direccion: pctMes > 0 ? 'sube' : 'baja',
          veredicto: pctMes > 0 ? 'advertencia' : 'bueno',
        }
      : null,
    sub: pctMes != null
      ? (pctMes === 0
          ? 'igual que el mes pasado'
          : pctMes > 0 ? 'más que el mes pasado' : 'menos que el mes pasado')
      : t ? `${t.creados_30d} en los últimos 30 días` : undefined,
  };

  const nuevosHoy: KpiCardV2Props = {
    eyebrow: 'Nuevos hoy',
    valor: s.hoy,
    atenuado: s.hoy === 0,
    serie: diaria ? diaria.slice(-7) : (t ? [t.ayer, s.hoy] : undefined),
    sub: t ? (t.ayer === 1 ? 'Ayer entró 1' : `Ayer entraron ${t.ayer}`) : undefined,
  };

  const pctSemana = t ? pctDelta(s.semana, t.semana_pasada) : null;
  const estaSemana: KpiCardV2Props = {
    eyebrow: 'Esta semana',
    valor: s.semana,
    atenuado: s.semana === 0,
    serie: diaria ? seriePorSemana(diaria) : (t ? [t.semana_pasada, s.semana] : undefined),
    delta: pctSemana != null && pctSemana !== 0
      ? {
          texto: `${Math.abs(pctSemana)}%`,
          direccion: pctSemana > 0 ? 'sube' : 'baja',
          veredicto: pctSemana > 0 ? 'advertencia' : 'bueno',
        }
      : null,
    sub: pctSemana != null
      ? (pctSemana === 0 ? 'igual que la semana anterior' : 'vs. semana anterior')
      : t ? `Semana pasada: ${t.semana_pasada}` : undefined,
  };

  const t30 = t?.tiempo_resolucion_30d ?? null;
  const t30prev = t?.tiempo_resolucion_30d_prev ?? null;
  const diffDias = t30 != null && t30prev != null ? t30prev - t30 : null; // >0 = más rápido
  // Serie semanal real de tiempo de resolución. Las semanas sin cierres vienen
  // null: se descartan en vez de dibujarlas como 0 (un 0 se leería como
  // "resolvimos todo en el día"). Con menos de 3 puntos no hay tendencia que
  // mostrar y se deja sin serie.
  const serieResolucionCruda = (t?.serie_resolucion_semanal ?? []).filter(
    (v): v is number => typeof v === 'number',
  );
  const serieResolucion = serieResolucionCruda.length >= 3 ? serieResolucionCruda : null;
  const resolucion: KpiCardV2Props = {
    eyebrow: 'Resolución promedio',
    valor: t30 != null ? fmtDias(t30) : '—',
    unidad: t30 != null ? 'días' : undefined,
    atenuado: t30 == null,
    // Serie REAL semana a semana. Antes eran dos puntos (mes actual vs. mes
    // previo): una recta entre dos valores, que parecía un gráfico sin mostrar
    // ninguna tendencia. Si el backend todavía no la manda, se cae al par de
    // siempre; jamás se inventa la serie.
    serie: serieResolucion ?? (t30 != null && t30prev != null ? [t30prev, t30] : undefined),
    delta: diffDias != null && Math.abs(diffDias) >= 0.1
      ? {
          texto: `${fmtDias(Math.abs(diffDias))} d`,
          direccion: diffDias > 0 ? 'baja' : 'sube',
          veredicto: diffDias > 0 ? 'bueno' : 'malo',
        }
      : null,
    sub: t30 == null
      ? opts.msgSinCierres
      : diffDias == null
        ? 'sin base del mes anterior'
        : Math.abs(diffDias) >= 0.1
          ? (diffDias > 0 ? 'más rápido que el mes pasado' : 'más lento que el mes pasado')
          : 'igual que el mes pasado',
  };

  return [total, nuevosHoy, estaSemana, resolucion].map(colorear);
};

export default function Dashboard() {
  const { theme } = useTheme();
  const { municipioActual, municipios, user } = useAuth();

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
  /** Categoría elegida en la botonera de Concentración; null = todas. */
  const [catConcentracion, setCatConcentracion] = useState<string | null>(null);
  const [vistaActiva, setVistaActiva] = useState<VistaMetrica>('barrios');
  const [recurrentes, setRecurrentes] = useState<ReclamoRecurrente[]>([]);
  const [reclamosSimilares, setReclamosSimilares] = useState<ReclamoSimilarGrupo[]>([]);
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [cobertura, setCobertura] = useState<ZonaCobertura[]>([]);
  const [tiempoResolucion, setTiempoResolucion] = useState<TiempoCategoria[]>([]);
  const [coberturaResumen, setCoberturaResumen] = useState<{ zonas_criticas: number; tasa_resolucion_global: number } | null>(null);
  const [metricasAccion, setMetricasAccion] = useState<{
    urgentes: number;
    sin_asignar: number;
    vencidos: number;
    para_hoy: number;
    /** Ya trabajados por la cuadrilla, esperando que un supervisor los cierre. */
    esperando_visto_bueno?: number;
    resueltos_semana: number;
    /** Entrados en los mismos 7 días: sin esto, "resueltos" no dice si el
     *  municipio va ganando o acumulando. */
    entraron_semana?: number;
    cambio_eficiencia: number;
    empleados_activos: number;
    total_empleados: number;
  } | null>(null);
  const [metricasDetalle, setMetricasDetalle] = useState<MetricasDetalle | null>(null);

  // Calificaciones del vecino (la voz del vecino, lado muni) — GET /calificaciones/estadisticas
  const [califStats, setCalifStats] = useState<CalifEstadisticas | null>(null);

  // Callback para navegar al mapa cuando se hace click en una categoría del heatmap
  const handleCategoryClick = useCallback((categoryKey: string) => {
    navigate(`/gestion/mapa?categoria=${encodeURIComponent(categoryKey)}`);
  }, [navigate]);

  // Estado del modo "Live" — fullscreen TV mode con auto-rotate de slides
  const [liveMode, setLiveMode] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Abrir el dashboard "En Vivo" al llegar con ?live=1 (desde el menú "Más" del
  // admin en mobile, que no puede montar DashboardLive porque necesita los datos
  // del dashboard). Consumimos el param para no reabrirlo al navegar.
  useEffect(() => {
    if (searchParams.get('live') === '1') {
      setLiveMode(true);
      searchParams.delete('live');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
        const items: DependenciaItem[] = (res.data || []).map((d: { id: number; nombre: string; color?: string; icono?: string }) => ({
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

  // ====================================================================
  // Muni del tablero. Para el SUPER ADMIN `municipioActual` queda null en
  // toda la sesión (el switcher solo persiste el id en storage y
  // loadMunicipios hace early-return), y el hero caía SIEMPRE al gradiente
  // aunque el muni tuviera portada. Resolvemos el detalle real: contexto >
  // lista del contexto > fetch por el id guardado. Escucha `municipio-changed`
  // para seguir los cambios del switcher sin recargar.
  // ====================================================================
  const [muniResuelto, setMuniResuelto] = useState<Municipio | null>(null);
  useEffect(() => {
    let cancel = false;
    const resolver = () => {
      if (municipioActual) {
        setMuniResuelto(null);
        return;
      }
      const stored = localStorage.getItem('municipio_actual_id');
      const id = stored ? parseInt(stored, 10) : NaN;
      if (!Number.isFinite(id)) {
        setMuniResuelto(null);
        return;
      }
      const enLista = municipios.find((m) => m.id === id);
      if (enLista) {
        setMuniResuelto(enLista);
        return;
      }
      municipiosApi.getOne(id)
        .then((res) => { if (!cancel) setMuniResuelto(res.data as Municipio); })
        .catch(() => { /* sin detalle el hero cae al gradiente (fallback) */ });
    };
    resolver();
    window.addEventListener('municipio-changed', resolver);
    return () => {
      cancel = true;
      window.removeEventListener('municipio-changed', resolver);
    };
  }, [municipioActual, municipios]);
  const muniTablero = municipioActual ?? muniResuelto;

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
            dashboardApi.getPorCategoria(depId).catch(() => ({ data: [] })),
            dashboardApi.getPorZona(depId).catch(() => ({ data: [] })),
            dashboardApi.getMetricasAccion(depId).catch(() => ({ data: null })),
          ]);
          setPorCategoria(categoriaRes.data || []);
          // Lista COMPLETA de zonas: las cards muestran el top 5 pero necesitan
          // el total real para el "Top 5 de N" y el link "Ver los N barrios".
          setPorZona(zonasRes.data || []);
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
            dashboardApi.getTendencia(30, depId).catch(() => ({ data: [] })),
            dashboardApi.getRecurrentes(90, 2, depId).catch(() => ({ data: [] })),
            muniId ? reclamosApi.getRecurrentes({ limit: 10, dias_atras: 30, min_similares: 2, municipio_id: muniId }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
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
          const heatmapRes = await analyticsApi.getHeatmap(90, undefined, depId).catch(() => ({ data: { puntos: [] } }));
          setHeatmapData(heatmapRes.data.puntos || []);
        } catch (error) {
          console.error('Error cargando heatmap:', error);
        } finally {
          setLoadingHeatmap(false);
        }

        // Nota: getDistancias / getRendimientoEmpleados se dejaron de pedir en la
        // migración v2 — el tablero nunca los renderizaba (estados muertos).

        try {
          const coberturaRes = await analyticsApi.getCobertura(30, depId).catch(() => ({ data: { zonas: [], resumen: null } }));
          setCobertura(coberturaRes.data.zonas || []);
          setCoberturaResumen(coberturaRes.data.resumen || null);
        } catch (error) {
          console.error('Error cargando cobertura:', error);
        }

        try {
          const tiempoRes = await analyticsApi.getTiempoResolucion(90, depId).catch(() => ({ data: { categorias: [] } }));
          setTiempoResolucion(tiempoRes.data.categorias || []);
        } catch (error) {
          console.error('Error cargando tiempo resolución:', error);
        }

        try {
          const metricasDetalleRes = await dashboardApi.getMetricasDetalle(depId).catch(() => ({ data: null }));
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
  // Un solo grupo: dependencias. El AdaptiveFilter decide solo si las muestra
  // como píldoras o colapsa a combo según el ancho disponible.
  const gruposFiltro = useMemo<AdaptiveFilterGroup[]>(() => [{
    id: 'dependencia',
    placeholder: 'Todas las dependencias',
    options: dependencias.map(d => ({ value: String(d.id), label: d.nombre })),
    value: selectedDependenciaId ? String(selectedDependenciaId) : '',
    onChange: handleDependenciaChange,
  }], [dependencias, selectedDependenciaId, handleDependenciaChange]);
  const selectedDepNombre = useMemo(() => {
    if (!selectedDependenciaId) return null;
    return dependencias.find(d => d.id === selectedDependenciaId)?.nombre || null;
  }, [selectedDependenciaId, dependencias]);

  // Frases del hero semántico — solo con datos YA cargados (sin datos, sin frase).
  // Declarado ANTES de los early returns por la misma regla de hooks de arriba.
  const heroFrases = useMemo<HeroFrase[]>(() => {
    const u = resolverUmbrales();
    const frases: HeroFrase[] = [];

    // (a) El día en reclamos: lo que entró, lo que nadie tomó y lo que espera
    // el cierre del supervisor.
    if (stats && metricasAccion) {
      const esperando = metricasAccion.esperando_visto_bueno ?? 0;
      frases.push({
        segmentos: [
          seg('Hoy entraron '),
          // Que entren reclamos POR EL SISTEMA es buena noticia: significa que
          // el canal está vivo. En cero no se pinta nada — un cero no es un
          // logro que festejar en verde.
          seg(
            `${stats.hoy} ${stats.hoy === 1 ? 'reclamo nuevo' : 'reclamos nuevos'}`,
            stats.hoy > 0 ? 'bueno' : undefined,
          ),
          seg(', hay '),
          seg(
            `${metricasAccion.sin_asignar} sin asignar`,
            veredictoMasEsPeor(metricasAccion.sin_asignar, u.sinAsignar),
          ),
          seg(' y '),
          // Antes acá iba "trabajos programados" con el veredicto 'bueno'
          // FIJO: un 0 se pintaba de verde como si fuera un logro. Ahora es
          // una cola real, y cuanto más alta, peor.
          seg(
            `${esperando} ${esperando === 1 ? 'esperando tu visto bueno' : 'esperando tu visto bueno'}`,
            veredictoMasEsPeor(esperando, u.sinAsignar),
          ),
          seg('.'),
        ],
        acciones: [
          { label: 'Ver reclamos', to: '/gestion/reclamos', primaria: true },
          ...(esperando > 0
            ? [{ label: `Cerrar los ${esperando}`, to: '/gestion/reclamos?estado=pendiente_confirmacion' }]
            : []),
        ],
      });
    }

    // (b) El día en trámites: mismo formato que reclamos, otro módulo.
    if (tramitesStats) {
      const abiertos = contarAbiertos(tramitesStats);
      frases.push({
        segmentos: [
          seg('En trámites entraron '),
          seg(
            `${tramitesStats.hoy} ${tramitesStats.hoy === 1 ? 'gestión' : 'gestiones'} hoy`,
            tramitesStats.hoy > 0 ? 'bueno' : undefined,
          ),
          seg(', con '),
          seg(`${abiertos} en curso`, veredictoMasEsPeor(abiertos, u.sinAsignar)),
          seg(' sobre el mostrador.'),
        ],
        acciones: [{ label: 'Ver trámites', to: '/gestion/tramites', primaria: true }],
      });
    }

    // (b) Salud de la gestión: tasa de resolución global + tiempo promedio
    if (stats && coberturaResumen) {
      frases.push({
        segmentos: [
          seg('Resolvés el '),
          seg(
            `${coberturaResumen.tasa_resolucion_global}%`,
            veredictoTasa(coberturaResumen.tasa_resolucion_global, u.tasaResolucion),
          ),
          seg(' de los reclamos, con un promedio de '),
          seg(
            `${stats.tiempo_promedio_dias} días`,
            veredictoMenosEsMejor(stats.tiempo_promedio_dias, u.tiempoResolucionDias),
          ),
          seg(' por caso.'),
        ],
        acciones: [{ label: 'Ver SLA', to: '/gestion/sla' }],
      });
    }

    // (d) La voz del vecino: calificación promedio. La nota SÍ es un juicio,
    // así que va con veredicto — antes salía en negro como si fuera un dato
    // neutro más.
    if (califStats && califStats.total_calificaciones > 0) {
      const nota = califStats.promedio_general;
      frases.push({
        segmentos: [
          seg('Los vecinos califican la gestión con '),
          seg(`${nota.toFixed(1)} de 5`, veredictoTasa((nota / 5) * 100, u.tasaResolucion)),
          seg(
            ` sobre ${califStats.total_calificaciones} ${califStats.total_calificaciones === 1 ? 'calificación' : 'calificaciones'}.`,
          ),
        ],
        acciones: [{ label: 'Ver la voz del vecino', to: '/gestion/calificaciones', primaria: true }],
      });
    }

    return frases;
  }, [stats, metricasAccion, coberturaResumen, califStats, tramitesStats]);

  // ---- Concentración: botonera de categorías DINÁMICA por municipio ----
  // Las cuatro de más volumen de ESTE municipio. En uno pesa la basura y en
  // otro el alumbrado; la botonera se arma sola con lo que cada uno tiene, sin
  // ninguna lista fija en el código.
  const categoriasConcentracion = useMemo(
    () => porCategoria.slice(0, 4).map((c) => c.categoria),
    [porCategoria],
  );

  const gruposConcentracion = useMemo<AdaptiveFilterGroup[]>(
    () => [
      {
        id: 'concentracion-categoria',
        placeholder: 'Todas las categorías',
        options: categoriasConcentracion.map((c) => ({ value: c, label: c })),
        value: catConcentracion ?? '',
        onChange: (v) => setCatConcentracion(v || null),
      },
    ],
    [categoriasConcentracion, catConcentracion],
  );

  // El heatmap trae la categoría en cada punto, así que el filtro es local:
  // no hace falta ir de nuevo al backend para cambiar de categoría.
  const heatmapFiltrado = useMemo(
    () => (catConcentracion ? heatmapData.filter((p) => p.categoria === catConcentracion) : heatmapData),
    [heatmapData, catConcentracion],
  );

  // Los focos que el mapa RECORRE. Cuatro, como las categorías de la botonera:
  // el listado largo hacía crecer la tarjeta y rompía la simetría de la fila.
  const focosConcentracion = useMemo<Foco[]>(() => {
    const base = catConcentracion
      ? recurrentes.filter((r) => r.categorias?.includes(catConcentracion))
      : recurrentes;
    return base.slice(0, 4).map((r) => ({
      direccion: r.direccion,
      zona: r.zona,
      cantidad: r.cantidad,
      lat: r.lat,
      lng: r.lng,
      // Con "todas" seleccionado se aclara qué categoría pesa en esa esquina;
      // con una categoría ya elegida sería repetir lo mismo.
      categoriaTop: catConcentracion ? null : r.categoria_top,
      categoriaTopCantidad: catConcentracion ? undefined : r.categoria_top_cantidad,
    }));
  }, [recurrentes, catConcentracion]);

  // Matices del puente de tokens (--pl-*), leídos del :root: recharts necesita
  // colores concretos, así que los sacamos de los MISMOS tokens que usa el CSS
  // (patrón polimórfico: funciona en los 12 themes, cero hex fijos).
  const semColors = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (token: string, fallback: string) => cs.getPropertyValue(token).trim() || fallback;
    return {
      bueno: read('--pl-green', theme.primary),
      advertencia: read('--pl-amber-strong', theme.primary),
      malo: read('--pl-red', theme.primary),
      azul: read('--pl-blue', theme.primary),
      neutro: read('--pl-border-strong', theme.textSecondary),
      // Última posición de la rampa de datos: serie secundaria (resueltos)
      data5: read('--pl-data-5', theme.textSecondary),
      // Riel de las barras / grilla de los charts
      track: read('--pl-track', theme.textSecondary),
    };
  }, [theme.primary, theme.textSecondary]);

  if (loading) {
    return (
      <div className="dv2-page">
        <div className="dv2-skel dv2-skel-hero" />
        <div className="dv2-grid-cola">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="dv2-skel dv2-skel-card" />
          ))}
        </div>
        <div className="dv2-skel-cargando">
          <span className="dv2-spin" aria-hidden="true" />
          Cargando el tablero…
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Obtener datos del municipio (preferir contexto/detalle resuelto sobre
  // localStorage). Limpiar el nombre si ya incluye "Municipalidad de"
  const rawNombre = muniTablero?.nombre || localStorage.getItem('municipio_nombre') || 'Tu Municipio';
  const municipioNombre = rawNombre.replace(/^Municipalidad de\s*/i, '');

  // ---- Hero banner v2: eyebrow + sub + strip de stats (datos reales) ----
  const reclamosAbiertos = contarAbiertos(stats);
  const tramitesActivos = contarAbiertos(tramitesStats);
  const enRiesgoSla = metricasAccion?.vencidos ?? null;

  const heroKpis: HeroStripKpi[] = [
    // La etiqueta corta es la que se ve en celular, donde los cuatro entran en
    // una sola fila: se abrevia, no se corta con puntos suspensivos.
    { etiqueta: 'Reclamos abiertos', etiquetaCorta: 'Abiertos', valor: reclamosAbiertos },
    { etiqueta: 'Trámites activos', etiquetaCorta: 'Trámites', valor: tramitesActivos },
    { etiqueta: 'Resolución promedio', etiquetaCorta: 'Resolución', valor: `${stats.tiempo_promedio_dias} d` },
    { etiqueta: 'En riesgo de SLA', etiquetaCorta: 'Riesgo SLA', valor: enRiesgoSla ?? '—', amber: (enRiesgoSla ?? 0) > 0 },
  ];

  const heroAcciones = (user?.rol === 'admin' || user?.rol === 'supervisor')
    ? {
        conoceLabel: `Conocé ${BRAND.name}`,
        onConoce: () => setPresentOpen(true),
        onPulso: () => setLiveMode(true),
      }
    : null;

  // ---- Datos derivados para los charts ----
  const estadosData = Object.entries(stats.por_estado).map(([estado, cantidad]) => ({
    name: estadoLabel(estado),
    value: cantidad as number,
    color: estadoColor(estado),
  }));

  const totalCategorias = porCategoria.reduce((acc, curr) => acc + curr.cantidad, 0);
  const maxCategoria = porCategoria.length > 0 ? Math.max(...porCategoria.map(c => c.cantidad)) : 0;
  const maxZona = porZona.length > 0 ? Math.max(...porZona.map(z => z.cantidad)) : 0;

  // ==================================================================
  // Analítica — los umbrales y la meta SIEMPRE salen de lib/veredictos
  // (SSoT configurable), nunca números sueltos acá.
  // ==================================================================
  const umbrales = resolverUmbrales();
  const metaDias = metaResolucionDias(umbrales);

  /** Top 5 de barrios/zonas por volumen (barra relativa al primero). */
  const itemsBarrios: BarListItem[] = porZona.slice(0, 5).map((z) => ({
    id: z.zona,
    label: z.zona,
    pct: maxZona > 0 ? (z.cantidad / maxZona) * 100 : 0,
    valor: z.cantidad,
  }));

  /** Top 5 de categorías por volumen (barra relativa a la primera). */
  const itemsCategorias: BarListItem[] = porCategoria.slice(0, 5).map((c) => ({
    id: c.categoria,
    label: c.categoria,
    pct: maxCategoria > 0 ? (c.cantidad / maxCategoria) * 100 : 0,
    valor: c.cantidad,
  }));

  /** Cobertura por zona: % de resolución con veredicto + fracción resueltos/total. */
  const itemsCobertura: BarListItem[] = cobertura.slice(0, 5).map((z) => ({
    id: z.zona_nombre,
    label: z.zona_nombre,
    pct: z.tasa_resolucion,
    valor: `${z.tasa_resolucion}%`,
    valorSub: `${z.resueltos}/${z.total_reclamos}`,
    tono: (veredictoTasa(z.tasa_resolucion, umbrales.tasaResolucion) ?? 'neutro') as BarListTono,
  }));

  // Tiempo de resolución: las que MÁS tardan primero (el resto queda fuera del top 5)
  const tiempoOrdenado = [...tiempoResolucion].sort((a, b) => b.dias_promedio - a.dias_promedio);
  const maxDias = tiempoOrdenado.length > 0 ? tiempoOrdenado[0].dias_promedio : 0;
  const itemsTiempo: BarListItem[] = tiempoOrdenado.slice(0, 5).map((t) => ({
    id: t.categoria,
    label: t.categoria,
    pct: maxDias > 0 ? (t.dias_promedio / maxDias) * 100 : 0,
    valor: `${fmtDias(t.dias_promedio)} d`,
    tono: (veredictoMenosEsMejor(t.dias_promedio, umbrales.tiempoResolucionDias) ?? 'neutro') as BarListTono,
  }));
  const categoriasSobreMeta = tiempoResolucion.filter((t) => t.dias_promedio > metaDias).length;

  // Tendencia: la serie de resueltos es OPCIONAL (backend viejo no la manda)
  const haySerieResueltos = tendencias.some((t) => t.resueltos != null);
  /** 4 marcas de tiempo (primera, ~1/3, ~2/3, última) — el eje X lo dibujamos nosotros. */
  const marcasTendencia = (() => {
    const n = tendencias.length;
    if (n === 0) return [];
    const idx = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
    return [...new Set(idx)].map((i) => fmtFechaCorta(tendencias[i].fecha));
  })();

  interface TooltipEntry {
    name?: string;
    value?: number | string;
    color?: string;
    payload?: { color?: string };
  }
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string | number;
  }) => {
    if (active && payload && payload.length) {
      // Las series temporales traen el label como 'YYYY-MM-DD': lo mostramos corto.
      const titulo =
        typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label) ? fmtFechaCorta(label) : label;
      return (
        <div className="dv2-tooltip">
          {titulo != null && <p className="dv2-tooltip-titulo">{titulo}</p>}
          {payload.map((entry, index) => (
            // color runtime: viene de la serie del chart
            <p key={index} className="dv2-tooltip-fila" style={{ color: entry.color || entry.payload?.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // ---- Widgets operativos (cola de trabajo) ----
  const cambioEf = metricasAccion?.cambio_eficiencia ?? 0;
  const colaCards: {
    label: string;
    sublabel: string;
    value: number;
    tone: 'red' | 'amber' | 'blue' | 'green';
    detailKey: keyof MetricasDetalle;
    vacio: string;
    footer: string;
    /** Solo la tarjeta de cierres: dibuja "entró vs. salió" en vez de la lista. */
    balance?: { cerrados: number; entrados: number };
  }[] = [
    {
      label: 'Urgentes',
      sublabel: 'Prioridad alta, +3 días abiertos',
      value: metricasAccion?.urgentes ?? 0,
      tone: 'red',
      detailKey: 'urgentes',
      vacio: 'Nada urgente pendiente.',
      footer: 'Ver reclamos',
    },
    {
      label: 'Sin asignar',
      sublabel: 'Esperando asignación +24 h',
      value: metricasAccion?.sin_asignar ?? 0,
      tone: 'amber',
      detailKey: 'sin_asignar',
      vacio: 'Todo tiene responsable.',
      footer: 'Asignar reclamos',
    },
    // Antes acá iba "Para hoy" (programados para la jornada). Dependía de que
    // el municipio cargara la agenda todos los días y en los que no la usan
    // vivía en cero, ocupando un cuarto del espacio más caro del tablero.
    // Esta cola, en cambio, es la única que se destraba desde el escritorio:
    // el trabajo ya está hecho y falta el cierre del supervisor.
    {
      label: 'Esperando tu visto bueno',
      sublabel: 'La cuadrilla ya terminó · falta cerrarlos',
      value: metricasAccion?.esperando_visto_bueno ?? 0,
      tone: 'amber',
      detailKey: 'esperando_visto_bueno',
      vacio: 'No hay nada esperando cierre.',
      footer: 'Revisar y cerrar',
    },
    {
      label: 'Resueltos',
      sublabel: `${cambioEf >= 0 ? '+' : ''}${cambioEf}% vs. semana anterior`,
      value: metricasAccion?.resueltos_semana ?? 0,
      tone: 'green',
      detailKey: 'resueltos',
      vacio: 'Sin cierres esta semana.',
      footer: 'Ver cerrados',
      // Un conteo de resueltos solo no dice nada ("¿6 está bien? ¿contra
      // qué?"). El balance contra lo que entró en los mismos 7 días sí tiene
      // veredicto: al día, empatando, o acumulando.
      balance: {
        cerrados: metricasAccion?.resueltos_semana ?? 0,
        entrados: metricasAccion?.entraron_semana ?? 0,
      },
    },
  ];

  // ---- Filas de KPI v2 — series y deltas SOLO con datos reales cargados ----
  const serieDiariaReclamos = tendencias.map((t) => t.cantidad);
  const kpisReclamos = buildKpisPeriodo({
    stats,
    etiquetaTotal: 'Total reclamos',
    serieDiaria: serieDiariaReclamos,
    color: semColors.bueno,
    colorNeutro: semColors.neutro,
    msgSinCierres: 'Sin cierres en los últimos 30 días',
  });
  // Para trámites no hay serie diaria cargada en la página: cada card usa la
  // evolución real de 2 puntos (período previo → actual) de stats.tendencias.
  const kpisTramites = tramitesStats
    ? buildKpisPeriodo({
        stats: tramitesStats,
        etiquetaTotal: 'Total trámites',
        color: semColors.azul,
        colorNeutro: semColors.neutro,
        msgSinCierres: 'Sin trámites cerrados todavía',
      })
    : null;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="dv2-page">

      {/* ================= HERO BANNER v2 ================= */}
      <HeroBannerV2
        eyebrow={selectedDepNombre ? `Municipalidad · ${selectedDepNombre}` : 'Municipalidad · Vista consolidada'}
        titulo={municipioNombre}
        sub={selectedDepNombre
          ? `Vista de la dependencia ${selectedDepNombre}.`
          : 'Todas las dependencias en un solo tablero.'}
        fotoUrl={muniTablero?.imagen_portada || null}
        fotoOpacity={muniTablero?.tema_config?.portadaOpacity}
        kpis={heroKpis}
        acciones={heroAcciones}
      />

      {/* ================= Hero semántico (carrusel) ================= */}
      <SemanticHero etiqueta={`HOY EN ${municipioNombre.toUpperCase()}`} frases={heroFrases} />

      {/* ================= Filtro por dependencia (AdaptiveFilter del KIT) ================= */}
      {showDepFilter && dependencias.length > 0 && (
        <AdaptiveFilter groups={gruposFiltro} busy={refreshing} />
      )}

      {/* ================= Reclamos — fila de KPIs v2 ================= */}
      <SectionTitleV2
        icon={ClipboardList}
        label="Reclamos"
        action={{ label: 'Ver todos', to: '/gestion/reclamos' }}
      />
      <div className="dv2-grid-kpi">
        {kpisReclamos.map((k) => (
          <KpiCardV2 key={k.eyebrow} {...k} />
        ))}
      </div>

      {/* ================= Trámites — fila de KPIs v2 ================= */}
      {kpisTramites && (
        <>
          <SectionTitleV2
            icon={FileCheck}
            label="Trámites"
            tone="blue"
            action={{ label: 'Ver todos', to: '/gestion/tramites' }}
          />
          <div className="dv2-grid-kpi">
            {kpisTramites.map((k) => (
              <KpiCardV2 key={k.eyebrow} {...k} />
            ))}
          </div>
        </>
      )}

      {/* ================= Cola de trabajo ================= */}
      <SectionTitleV2
        icon={ListChecks}
        label="Cola de trabajo"
        action={{ label: 'Ver reclamos', to: '/gestion/reclamos' }}
      />
      <div className="dv2-grid-cola">
        {colaCards.map((card) => {
          const reclamos = metricasDetalle?.[card.detailKey] || [];
          return (
            <div key={card.label} className={`dv2-card dv2-cola-card dv2-cola-card--${card.tone}`}>
              <div className="dv2-cola-head">
                <span className="dv2-cola-dot" aria-hidden="true" />
                <span className="dv2-cola-label">{card.label}</span>
                <span className={`dv2-cola-num${card.value === 0 ? ' dv2-cola-num--cero' : ''}`}>
                  {card.value}
                </span>
              </div>
              <span className="dv2-cola-sub">
                {card.balance ? textoBalance(card.balance) : card.sublabel}
              </span>
              {card.balance ? (
                <BalanceBar {...card.balance} />
              ) : reclamos.length > 0 ? (
                <div className="dv2-cola-lista">
                  {reclamos.map((r) => (
                    <div
                      key={r.id}
                      className="dv2-cola-item"
                      onClick={() => navigate(`/gestion/reclamos/${r.id}`)}
                    >
                      <div className="dv2-cola-item-titulo">{r.titulo}</div>
                      <div className="dv2-cola-item-meta">
                        {r.categoria}
                        {r.dias_antiguedad > 0 ? ` · ${r.dias_antiguedad} d` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dv2-cola-vacio">{card.vacio}</div>
              )}
              <button
                type="button"
                className="dv2-cola-link"
                onClick={() => navigate('/gestion/reclamos')}
              >
                {card.footer}
              </button>
            </div>
          );
        })}
      </div>

      {/* ============ Estado + concentración + top categorías ============
          (sin título de sección: en la referencia esta grilla sigue directo
          a la cola de trabajo, y el título "Reclamos" ya vive en la fila de
          KPIs de arriba — evitamos duplicarlo) */}
      {loadingCharts ? (
        <div className="dv2-grid-principal">
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
        </div>
      ) : (
        <div className="dv2-grid-principal">
          {/* Por estado — donut + leyenda */}
          <div className="dv2-card">
            <div className="dv2-card-head">
              <h3 className="dv2-card-titulo">Por estado</h3>
            </div>
            <div className="dv2-donut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={estadosData}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {estadosData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="dv2-donut-centro">
                <span>
                  <span className="dv2-donut-total">{stats.total}</span>
                  <span className="dv2-donut-sub">reclamos</span>
                </span>
              </div>
            </div>
            <div className="dv2-leyenda">
              {estadosData.map((item) => (
                <div key={item.name} className="dv2-leyenda-fila">
                  {/* color runtime: viene del SSoT de estados */}
                  <span className="dv2-leyenda-dot" style={{ backgroundColor: item.color }} />
                  <span className="dv2-leyenda-label">{item.name}</span>
                  <span className="dv2-leyenda-valor">{item.value}</span>
                  <span className="dv2-leyenda-pct">
                    {stats.total > 0 ? Math.round((item.value / stats.total) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Concentración — mapa de calor */}
          <div className="dv2-card">
            <div className="dv2-card-head dv2-card-head--icono">
              <MapPin className="dv2-card-head-icono" aria-hidden="true" />
              <h3 className="dv2-card-titulo">Concentración</h3>
              <span className="dv2-card-caption">90 días</span>
              {/* Antes acá iba el conteo de puntos: nadie sabe qué es un
                  "punto" del mapa ni qué hacer con el número. En su lugar, lo
                  que se está mirando, dicho en castellano. */}
              <span className="dv2-card-caption dv2-card-caption--auto">
                {catConcentracion ?? 'Todas las categorías'}
              </span>
            </div>
            {/* Botonera en vez de combo: un combo esconde las opciones y hay
                que abrirlo para saber qué se puede ver. Las cuatro categorías
                salen del VOLUMEN REAL de este municipio, así que cada uno ve
                las suyas. Si no entran, AdaptiveFilter las manda al "+N" solo. */}
            {categoriasConcentracion.length > 0 && (
              <AdaptiveFilter groups={gruposConcentracion} />
            )}
            {/* El mapa RECORRE los cuatro focos como un reproductor: se centra
                en cada esquina y cuenta qué pasa ahí. Antes iba un listado
                debajo, que crecía con los datos y rompía la simetría de la
                fila —las tarjetas de al lado quedaban cortas—. Así el alto es
                fijo y además la pantalla se lee sola en una demo. */}
            <FocosRotativos
              focos={focosConcentracion}
              puntos={heatmapFiltrado}
              loading={loadingHeatmap}
              altura="230px"
              onVerFoco={(f) => navigate(`/gestion/mapa?direccion=${encodeURIComponent(f.direccion)}`)}
            />
          </div>

          {/* Top categorías */}
          <div className="dv2-card">
            <div className="dv2-card-head">
              <h3 className="dv2-card-titulo">Top categorías</h3>
              <span className="dv2-card-caption dv2-card-caption--auto">Por volumen</span>
            </div>
            {porCategoria.length > 0 ? (
              <div className="dv2-barras">
                {porCategoria.slice(0, 5).map((item, index) => {
                  const pct = totalCategorias > 0 ? Math.round((item.cantidad / totalCategorias) * 100) : 0;
                  const ancho = maxCategoria > 0 ? (item.cantidad / maxCategoria) * 100 : 0;
                  // Rampa hasta d4: d5 es el neutro, no un puesto del ranking (igual que BarList)
                  const rampa = Math.min(index + 1, 4);
                  return (
                    <div key={item.categoria} className="dv2-barra-bloque">
                      <div className="dv2-barra-bloque-head">
                        <span className="dv2-barra-bloque-nombre">{item.categoria}</span>
                        <span className="dv2-barra-bloque-pct">{item.cantidad}</span>
                        <span className="dv2-barra-bloque-frac">{pct}%</span>
                      </div>
                      <div className="dv2-barra-track">
                        <span
                          className={`dv2-barra-fill dv2-barra-fill--d${rampa}`}
                          style={{ width: `${ancho}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="dv2-vacio">Sin datos</p>
            )}
            {porCategoria.length > 5 && (
              <div className="dv2-card-foot">
                <span>Otras {porCategoria.length - 5} categorías</span>
                <span className="dv2-card-foot-valor dv2-auto">
                  {totalCategorias - porCategoria.slice(0, 5).reduce((acc, c) => acc + c.cantidad, 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= Analítica: métricas + cobertura + charts ================= */}
      <SectionTitleV2 icon={TrendingUp} label="Analítica" />
      <div className="dv2-grid-2">
        {/* Panel de métricas con segmented control */}
        <div className="dv2-card">
          {/* Segmented control de texto (sin iconos), como la referencia */}
          <div className="dv2-tabs">
            {[
              { id: 'barrios' as VistaMetrica, label: 'Barrios' },
              { id: 'tiempos' as VistaMetrica, label: 'Tiempos' },
              { id: 'recurrentes' as VistaMetrica, label: 'Recurrentes' },
              { id: 'categorias' as VistaMetrica, label: 'Categorías' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                className={`dv2-tab${vistaActiva === btn.id ? ' dv2-tab--activa' : ''}`}
                onClick={() => setVistaActiva(btn.id)}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Vista: Barrios/Zonas */}
          {vistaActiva === 'barrios' && (
            <>
              <div className="dv2-card-head dv2-card-head--bajo-tabs">
                <h3 className="dv2-card-titulo">Reclamos por barrio</h3>
                <span className="dv2-card-caption dv2-card-caption--auto">
                  Top {itemsBarrios.length} de {porZona.length}
                </span>
              </div>
              {itemsBarrios.length > 0 ? (
                <>
                  <BarList items={itemsBarrios} tono="rampa" labelWidth={116} valueWidth={32} />
                  <Link to="/gestion/mapa" className="dv2-card-link">
                    {porZona.length === 1 ? 'Ver el barrio en el mapa' : `Ver los ${porZona.length} barrios`}
                  </Link>
                </>
              ) : (
                <p className="dv2-vacio">Sin datos</p>
              )}
            </>
          )}

          {/* Vista: Tiempos de resolución */}
          {vistaActiva === 'tiempos' && (
            <>
              <div className="dv2-card-head dv2-card-head--bajo-tabs">
                <h3 className="dv2-card-titulo">Tiempo promedio de resolución</h3>
              </div>
              {tiempoResolucion.length > 0 ? (
                <div className="dv2-leyenda">
                  {tiempoResolucion.slice(0, 6).map((item) => {
                    // Mismo veredicto que la card "Tiempo de resolución": SSoT en lib/veredictos
                    const v = veredictoMenosEsMejor(item.dias_promedio, umbrales.tiempoResolucionDias) ?? 'advertencia';
                    return (
                      <div key={item.categoria} className="dv2-leyenda-fila">
                        <span className="dv2-leyenda-label">{item.categoria}</span>
                        <span className="dv2-leyenda-valor">
                          <span className={`dv2-chip-dias dv2-chip-dias--${v}`}>{fmtDias(item.dias_promedio)} d</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="dv2-vacio">Sin datos</p>
              )}
            </>
          )}

          {/* Vista: Reclamos recurrentes */}
          {vistaActiva === 'recurrentes' && (
            <div>
              {reclamosSimilares.length > 0 && (
                <div className="dv2-bloque">
                  <h3 className="dv2-subtitulo">
                    <Users className="dv2-subtitulo-icono" aria-hidden="true" />
                    Reclamos similares en la zona
                  </h3>
                  <div className="dv2-items">
                    {reclamosSimilares.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="dv2-item dv2-item--amber"
                        onClick={() => navigate(`/gestion/reclamos/${item.id}`)}
                      >
                        <div className="dv2-item-head">
                          <span className="dv2-item-titulo">{item.titulo}</span>
                          <span className="dv2-badge dv2-badge--amber">
                            <Users className="dv2-badge-icono" aria-hidden="true" />
                            {item.cantidad_reportes}
                          </span>
                        </div>
                        <div className="dv2-item-meta">
                          <MapPin className="dv2-item-meta-icono" aria-hidden="true" />
                          <span className="dv2-item-meta-trunc">{item.direccion}</span>
                        </div>
                        <div className="dv2-item-meta">
                          <span className="dv2-chip-cat">{item.categoria?.nombre || 'Sin categoría'}</span>
                          {item.zona && <span className="dv2-item-meta-trunc">{item.zona}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="dv2-subtitulo">Direcciones con reclamos recurrentes</h3>
              {recurrentes.length > 0 ? (
                <div className="dv2-items">
                  {recurrentes.slice(0, 5).map((item, index) => (
                    <div key={index} className="dv2-item">
                      <div className="dv2-item-head">
                        <span className="dv2-item-titulo">{item.direccion}</span>
                        <span className="dv2-badge dv2-badge--red">{item.cantidad}x</span>
                      </div>
                      <div className="dv2-item-meta">
                        <span>{item.zona}</span>
                        <span>·</span>
                        <span className="dv2-item-meta-trunc">{item.categorias.join(', ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dv2-vacio">No hay reclamos recurrentes</p>
              )}
            </div>
          )}

          {/* Vista: Categorías — misma estructura que Barrios */}
          {vistaActiva === 'categorias' && (
            <>
              <div className="dv2-card-head dv2-card-head--bajo-tabs">
                <h3 className="dv2-card-titulo">Distribución por categoría</h3>
                <span className="dv2-card-caption dv2-card-caption--auto">
                  Top {itemsCategorias.length} de {porCategoria.length}
                </span>
              </div>
              {itemsCategorias.length > 0 ? (
                <>
                  <BarList items={itemsCategorias} tono="rampa" labelWidth={116} valueWidth={32} />
                  <Link to="/gestion/categorias-reclamo" className="dv2-card-link">
                    {porCategoria.length === 1
                      ? 'Ver la categoría'
                      : `Ver las ${porCategoria.length} categorías`}
                  </Link>
                </>
              ) : (
                <p className="dv2-vacio">Sin datos</p>
              )}
            </>
          )}
        </div>

        {/* Cobertura por zona */}
        <div className="dv2-card">
          <div className="dv2-card-head">
            <h3 className="dv2-card-titulo">Cobertura por zona</h3>
            <span className="dv2-card-caption dv2-card-caption--auto">Resueltos / recibidos</span>
          </div>
          {itemsCobertura.length > 0 ? (
            <BarList items={itemsCobertura} layout="stacked" />
          ) : (
            <p className="dv2-vacio">Sin datos</p>
          )}
          {coberturaResumen && (
            <div className="dv2-card-foot">
              <span>Zonas críticas</span>
              {/* Sin zonas críticas no hay por qué pintar el número de rojo */}
              <span className={`dv2-card-foot-valor${coberturaResumen.zonas_criticas > 0 ? ' dv2-card-foot-valor--malo' : ''}`}>
                {coberturaResumen.zonas_criticas}
              </span>
              <span className="dv2-auto">Resolución global</span>
              <span
                className={`dv2-card-foot-valor dv2-card-foot-valor--${
                  veredictoTasa(coberturaResumen.tasa_resolucion_global, umbrales.tasaResolucion) ?? 'advertencia'
                }`}
              >
                {coberturaResumen.tasa_resolucion_global}%
              </span>
            </div>
          )}
        </div>
      </div>

      {loadingAnalytics ? (
        <div className="dv2-grid-2">
          <ChartSkeleton height={300} />
          <ChartSkeleton height={300} />
        </div>
      ) : (
      <>
      <div className="dv2-grid-2">
        {/* Tendencia: área de ingresados + línea punteada de resueltos.
            La 2da serie se dibuja SOLO si el backend la manda. */}
        <div className="dv2-card">
          <div className="dv2-card-head dv2-card-head--pegado">
            <h3 className="dv2-card-titulo">Tendencia</h3>
            <span className="dv2-card-caption">últimos 30 días</span>
            <span className="dv2-chart-leyenda">
              <span className="dv2-chart-leyenda-marca dv2-chart-leyenda-marca--acento" aria-hidden="true" />
              Ingresados
              {haySerieResueltos && (
                <>
                  <span className="dv2-chart-leyenda-marca dv2-chart-leyenda-marca--neutra" aria-hidden="true" />
                  Resueltos
                </>
              )}
            </span>
          </div>
          <div className="dv2-chart-area dv2-chart-area--flex">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={tendencias} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                {/* Grilla SOLO horizontal, sin ejes visibles (el eje X lo dibujamos abajo) */}
                <CartesianGrid vertical={false} stroke={semColors.track} />
                <XAxis dataKey="fecha" hide />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cantidad"
                  name="Ingresados"
                  stroke={semColors.bueno}
                  strokeWidth={2.5}
                  fill={semColors.bueno}
                  fillOpacity={0.1}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                {haySerieResueltos && (
                  <Line
                    type="monotone"
                    dataKey="resueltos"
                    name="Resueltos"
                    stroke={semColors.data5}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {marcasTendencia.length > 0 && (
            <div className="dv2-chart-fechas">
              {marcasTendencia.map((f, i) => (
                <span key={`${i}-${f}`}>{f}</span>
              ))}
            </div>
          )}
        </div>

        {/* Tiempo de resolución por categoría — las que más tardan primero */}
        <div className="dv2-card">
          <div className="dv2-card-head">
            <h3 className="dv2-card-titulo">Tiempo de resolución</h3>
            <span className="dv2-card-caption dv2-card-caption--auto">Meta {fmtDias(metaDias)} d</span>
          </div>
          {itemsTiempo.length > 0 ? (
            <BarList items={itemsTiempo} labelWidth={130} valueWidth={42} destacarPrimero={false} />
          ) : (
            <p className="dv2-vacio">Sin datos</p>
          )}
          {tiempoResolucion.length > 0 && (
            <div className="dv2-card-foot">
              <span>
                {categoriasSobreMeta} de {tiempoResolucion.length}{' '}
                {tiempoResolucion.length === 1 ? 'categoría' : 'categorías'} sobre la meta
              </span>
              <Link to="/gestion/sla" className="dv2-card-foot-link">
                Ver detalle
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* La voz del vecino — promedio + distribución + últimas reseñas
          (ya es v2). Sin calificaciones NO renderiza. */}
      <VozDelVecino stats={califStats} />
      </>
      )}

      {/* Modo televisor (TV mode) — overlay fullscreen con auto-rotate */}
      <DashboardLive
        open={liveMode}
        onClose={() => setLiveMode(false)}
        municipioNombre={municipioNombre}
        stats={stats}
        porCategoria={porCategoria}
        porZona={porZona.slice(0, 5)}
        tendencias={tendencias}
        heatmapData={heatmapData}
      />
      <PresentacionLive open={presentOpen} onClose={() => setPresentOpen(false)} />
    </div>
    </PullToRefresh>
  );
}
