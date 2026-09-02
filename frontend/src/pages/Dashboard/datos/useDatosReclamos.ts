/**
 * useDatosReclamos — TODOS los datos del dominio reclamos del dashboard.
 *
 * Un hook por DOMINIO, no un fetch por sección: `stats` lo usan cuatro
 * bloques y `porCategoria` dos, así que fetchear por sección duplicaría
 * llamadas. Las cuatro etapas y sus try/catch salieron tal cual del monolito
 * `pages/Dashboard.tsx` (:450-568): mismos endpoints, mismo orden, mismos
 * fallbacks.
 *
 * `enabled` es el interruptor de módulo: el hook se llama SIEMPRE (cero riesgo
 * de React #310) y con `enabled=false` no dispara NI UN request — un muni con
 * reclamos apagado (San Pedro Norte) no toca la red.
 */
import { useEffect, useRef, useState } from 'react';
import { analyticsApi, calificacionesApi, dashboardApi, reclamosApi } from '../../../lib/api';
import type { DashboardStats } from '../../../types';
import type {
  CalifEstadisticas,
  CoberturaResumen,
  ConteoCategoria,
  ConteoZona,
  DatosReclamos,
  HeatmapPoint,
  MetricasAccion,
  MetricasDetalle,
  ReclamoRecurrente,
  ReclamoSimilarGrupo,
  TendenciaData,
  TiempoCategoria,
  ZonaCobertura,
} from '../tipos';

export interface OpcionesDatosReclamos {
  /** Módulo reclamos activo Y página lista (módulos + dependencias resueltos). */
  enabled: boolean;
  /** Dependencia filtrada; undefined = consolidado. */
  depId?: number;
  /** Muni del contexto — sólo para el endpoint público de recurrentes. */
  municipioId?: number;
  refreshKey: number;
}

export function useDatosReclamos(opts: OpcionesDatosReclamos): DatosReclamos {
  const { enabled, depId, municipioId, refreshKey } = opts;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [porCategoria, setPorCategoria] = useState<ConteoCategoria[]>([]);
  const [porZona, setPorZona] = useState<ConteoZona[]>([]);
  const [metricasAccion, setMetricasAccion] = useState<MetricasAccion | null>(null);
  const [metricasDetalle, setMetricasDetalle] = useState<MetricasDetalle | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaData[]>([]);
  const [recurrentes, setRecurrentes] = useState<ReclamoRecurrente[]>([]);
  // La lista en si no se muestra: se conserva el fetch tal como estaba en el
  // monolito para no cambiar el tráfico en esta extracción. Candidato claro a
  // borrarse (su resultado no alimenta ninguna sección).
  const [, setReclamosSimilares] = useState<ReclamoSimilarGrupo[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPoint[]>([]);
  const [cobertura, setCobertura] = useState<ZonaCobertura[]>([]);
  const [coberturaResumen, setCoberturaResumen] = useState<CoberturaResumen | null>(null);
  const [tiempoResolucion, setTiempoResolucion] = useState<TiempoCategoria[]>([]);
  const [califStats, setCalifStats] = useState<CalifEstadisticas | null>(null);

  const [cargando, setCargando] = useState(true);
  const [cargandoAnalytics, setCargandoAnalytics] = useState(true);
  const [cargandoHeatmap, setCargandoHeatmap] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  // Sustituye al `if (stats) setRefreshing(true)` del monolito, que leía un
  // estado fuera de deps con un eslint-disable. El ref dice lo mismo sin
  // mentirle al linter.
  const hayDatos = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;

    const fetchData = async () => {
      try {
        // Si ya tenemos un primer render, no rompemos el layout con el
        // skeleton: sólo marcamos un refresh sutil y actualizamos en lugar.
        if (hayDatos.current) setRefrescando(true);

        // Paso 1: Cargar datos básicos primero (más rápido)
        try {
          const statsRes = await dashboardApi.getStats(depId);
          if (cancel) return;
          setStats(statsRes.data);
          hayDatos.current = true;
          setCargando(false);
        } catch (error) {
          console.error('Error cargando stats:', error);
          if (cancel) return;
          setCargando(false);
        }

        // Paso 2: Cargar gráficos básicos (independientemente)
        try {
          const [categoriaRes, zonasRes, metricasRes] = await Promise.all([
            dashboardApi.getPorCategoria(depId).catch(() => ({ data: [] })),
            dashboardApi.getPorZona(depId).catch(() => ({ data: [] })),
            dashboardApi.getMetricasAccion(depId).catch(() => ({ data: null })),
          ]);
          if (cancel) return;
          setPorCategoria(categoriaRes.data || []);
          // Lista COMPLETA de zonas: las cards muestran el top 5 pero necesitan
          // el total real para el "Top 5 de N" y el link "Ver los N barrios".
          setPorZona(zonasRes.data || []);
          setMetricasAccion(metricasRes.data || null);
        } catch (error) {
          console.error('Error cargando gráficos básicos:', error);
        }

        // Paso 3: Cargar datos para la vista de métricas (livianos)
        // Nota: `reclamosApi.getRecurrentes` es público (no autenticado) y no
        // soporta dependencia_id — se mantiene por municipio.
        try {
          const [tendenciasRes, recurrentesRes, similaresRes] = await Promise.all([
            // 90 dias: el bloque de tendencia compara MESES, no dias sueltos.
            dashboardApi.getTendencia(90, depId).catch(() => ({ data: [] })),
            dashboardApi.getRecurrentes(90, 2, depId).catch(() => ({ data: [] })),
            municipioId
              ? reclamosApi.getRecurrentes({ limit: 10, dias_atras: 30, min_similares: 2, municipio_id: municipioId }).catch(() => ({ data: [] }))
              : Promise.resolve({ data: [] }),
          ]);
          if (cancel) return;
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
          if (!cancel) setHeatmap(heatmapRes.data.puntos || []);
        } catch (error) {
          console.error('Error cargando heatmap:', error);
        } finally {
          if (!cancel) setCargandoHeatmap(false);
        }
        if (cancel) return;

        // Nota: getDistancias / getRendimientoEmpleados se dejaron de pedir en la
        // migración v2 — el tablero nunca los renderizaba (estados muertos).

        try {
          const coberturaRes = await analyticsApi.getCobertura(30, depId).catch(() => ({ data: { zonas: [], resumen: null } }));
          if (cancel) return;
          setCobertura(coberturaRes.data.zonas || []);
          setCoberturaResumen(coberturaRes.data.resumen || null);
        } catch (error) {
          console.error('Error cargando cobertura:', error);
        }

        try {
          const tiempoRes = await analyticsApi.getTiempoResolucion(90, depId).catch(() => ({ data: { categorias: [] } }));
          if (cancel) return;
          setTiempoResolucion(tiempoRes.data.categorias || []);
        } catch (error) {
          console.error('Error cargando tiempo resolución:', error);
        }

        try {
          const metricasDetalleRes = await dashboardApi.getMetricasDetalle(depId).catch(() => ({ data: null }));
          if (cancel) return;
          setMetricasDetalle(metricasDetalleRes.data || null);
        } catch (error) {
          console.error('Error cargando métricas detalle:', error);
        }

        try {
          const califRes = await calificacionesApi.getEstadisticas({ dias: 90 }).catch(() => ({ data: null }));
          if (cancel) return;
          setCalifStats(califRes.data || null);
        } catch (error) {
          console.error('Error cargando calificaciones:', error);
        }

        if (cancel) return;
        setCargandoAnalytics(false);
        setRefrescando(false);
      } catch (error) {
        console.error('Error general cargando dashboard:', error);
        if (cancel) return;
        setCargando(false);
        setCargandoAnalytics(false);
        setRefrescando(false);
      }
    };

    fetchData();
    return () => { cancel = true; };
  }, [enabled, refreshKey, depId, municipioId]);

  return {
    stats,
    porCategoria,
    porZona,
    metricasAccion,
    metricasDetalle,
    tendencias,
    recurrentes,
    heatmap,
    cobertura,
    coberturaResumen,
    tiempoResolucion,
    califStats,
    // Con el módulo apagado nadie espera nada: los flags internos quedan en su
    // valor inicial (true) para que, si el módulo se prende, la primera carga
    // vuelva a mostrar el skeleton en vez de un tablero vacío por un frame.
    cargando: enabled ? cargando : false,
    cargandoAnalytics: enabled ? cargandoAnalytics : false,
    cargandoHeatmap: enabled ? cargandoHeatmap : false,
    refrescando: enabled ? refrescando : false,
  };
}
