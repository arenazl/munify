import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  useMap,
  Polygon,
  Rectangle,
  CircleMarker,
} from 'react-leaflet';
import {
  X,
  MapPin,
  Calendar,
  User,
  Tag,
  Clock,
  Navigation,
  Map as MapIcon,
  Square,
  FileDown,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { reclamosApi } from '../lib/api';
import { StickyPageHeader, PageTitleIcon, PageTitle, HeaderSeparator } from '../components/ui/StickyPageHeader';
import PageHint from '../components/ui/PageHint';
import { Reclamo } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import jsPDF from 'jspdf';

import {
  recurrentHotspots,
  convexHull,
  reclamosInBBox,
  isResuelto,
  computeKPIs,
  topZonas,
  Hotspot,
  BBox,
} from '../lib/mapaUtils';
import MapaStats from '../components/mapa/MapaStats';
import MapaFiltrosPanel, { ViewMode, TimePreset } from '../components/mapa/MapaFiltrosPanel';

// Fix para el icono de Leaflet en Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Tipo para leaflet.heat (no exporta tipos)
declare module 'leaflet' {
  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: { [key: number]: string };
    }
  ): L.Layer;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

// =====================================================================
// Pin con color por estado
// =====================================================================
const createPinIcon = (color: string) =>
  L.divIcon({
    className: 'custom-pin-marker',
    html: `
      <div style="position: relative; width: 30px; height: 42px;">
        <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.716 0 0 6.716 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.716 23.284 0 15 0z" fill="${color}"/>
          <circle cx="15" cy="15" r="7" fill="white"/>
        </svg>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
  });

const STATUS_COLORS: Record<string, string> = {
  nuevo: '#6366f1',
  recibido: '#6366f1',
  asignado: '#3b82f6',
  en_curso: '#f59e0b',
  en_proceso: '#f59e0b',
  pospuesto: '#a855f7',
  pendiente_confirmacion: '#8b5cf6',
  finalizado: '#10b981',
  resuelto: '#10b981',
  rechazado: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  recibido: 'Recibido',
  asignado: 'Asignado',
  en_curso: 'En Curso',
  en_proceso: 'En Proceso',
  pospuesto: 'Pospuesto',
  pendiente_confirmacion: 'Pend. Confirm.',
  finalizado: 'Finalizado',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  baches: { label: 'Baches', color: '#ef4444' },
  iluminacion: { label: 'Iluminación', color: '#f59e0b' },
  recoleccion: { label: 'Recolección', color: '#10b981' },
  espacios: { label: 'Espacios Verdes', color: '#22c55e' },
  agua: { label: 'Agua y Cloacas', color: '#3b82f6' },
  semaforos: { label: 'Señalización', color: '#f97316' },
  zoonosis: { label: 'Zoonosis', color: '#8b5cf6' },
  veredas: { label: 'Veredas', color: '#78716c' },
  ruidos: { label: 'Ruidos', color: '#ec4899' },
  limpieza: { label: 'Limpieza', color: '#14b8a6' },
  seguridad: { label: 'Seguridad', color: '#dc2626' },
  obras: { label: 'Obras', color: '#eab308' },
  salud: { label: 'Salud', color: '#be185d' },
  transporte: { label: 'Transporte', color: '#0ea5e9' },
  otros: { label: 'Otros', color: '#64748b' },
};

function getCategoryKey(categoria: string): string {
  const cat = categoria.toLowerCase();
  if (cat.includes('bache') || cat.includes('calzada')) return 'baches';
  if (cat.includes('iluminacion') || cat.includes('iluminación')) return 'iluminacion';
  if (cat.includes('recoleccion') || cat.includes('recolección') || cat.includes('residuo')) return 'recoleccion';
  if (cat.includes('espacio') || cat.includes('verde')) return 'espacios';
  if (cat.includes('agua') || cat.includes('cloaca')) return 'agua';
  if (cat.includes('semaforo') || cat.includes('semáforo') || cat.includes('señal') || cat.includes('senal')) return 'semaforos';
  if (cat.includes('zoonosis') || cat.includes('animal')) return 'zoonosis';
  if (cat.includes('vereda') || cat.includes('baldio') || cat.includes('baldío')) return 'veredas';
  if (cat.includes('ruido')) return 'ruidos';
  if (cat.includes('limpieza')) return 'limpieza';
  if (cat.includes('seguridad')) return 'seguridad';
  if (cat.includes('obra')) return 'obras';
  if (cat.includes('salud')) return 'salud';
  if (cat.includes('transporte') || cat.includes('parada')) return 'transporte';
  return 'otros';
}

// =====================================================================
// Componentes auxiliares dentro del mapa
// =====================================================================
function FitBoundsToMarkers({ reclamos, signal }: { reclamos: Reclamo[]; signal: number }) {
  const map = useMap();
  const lastSignal = useRef(-1);

  useEffect(() => {
    if (signal === lastSignal.current) return;
    lastSignal.current = signal;
    if (reclamos.length === 0) return;
    const timer = setTimeout(() => {
      const valid = reclamos.filter(r => r.latitud != null && r.longitud != null);
      if (valid.length === 0) return;
      map.invalidateSize();
      if (valid.length === 1) {
        map.setView([valid[0].latitud!, valid[0].longitud!], 15);
      } else {
        const latlngs = valid.map(r => L.latLng(r.latitud!, r.longitud!));
        map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 15 });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [reclamos, map, signal]);

  return null;
}

function HeatLayer({ reclamos }: { reclamos: Reclamo[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    const points = reclamos
      .filter(r => r.latitud != null && r.longitud != null)
      .map(r => [r.latitud!, r.longitud!, 1] as [number, number, number]);
    if (points.length === 0) return;
    const heat = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      max: 3,
      minOpacity: 0.45,
      gradient: {
        0.0: '#1e3a8a',
        0.2: '#3b82f6',
        0.4: '#22c55e',
        0.6: '#eab308',
        0.8: '#f97316',
        1.0: '#ef4444',
      },
    });
    heat.addTo(map);
    layerRef.current = heat;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [reclamos, map]);

  return null;
}

function HotspotLayer({ hotspots }: { hotspots: Hotspot[] }) {
  return (
    <>
      {hotspots.map((h, idx) => (
        <CircleMarker
          key={`hotspot-${idx}-${h.centerLat}`}
          center={[h.centerLat, h.centerLng]}
          radius={Math.min(8 + h.recientes * 2, 22)}
          pathOptions={{
            color: '#ef4444',
            weight: 2,
            fillColor: '#ef4444',
            fillOpacity: 0.25,
            className: 'hotspot-pulse',
          }}
        >
          <Tooltip direction="top" permanent={false}>
            <div className="text-xs">
              <p className="font-bold text-red-600">🔥 Hotspot recurrente</p>
              <p>{h.recientes} reclamos en 90 días</p>
              {h.topDireccion && <p className="text-gray-600">{h.topDireccion}</p>}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

function CoveragePolygon({ points, color }: { points: Array<[number, number]>; color: string }) {
  const hull = useMemo(() => convexHull(points), [points]);
  if (hull.length < 3) return null;
  return (
    <Polygon
      positions={hull}
      pathOptions={{
        color,
        weight: 2,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.12,
        dashArray: '6 4',
      }}
    />
  );
}

interface DrawHandlerProps {
  active: boolean;
  onComplete: (bbox: BBox) => void;
  onCancel: () => void;
}

function DrawHandler({ active, onComplete, onCancel }: DrawHandlerProps) {
  const map = useMap();
  const startRef = useRef<L.LatLng | null>(null);
  const previewRef = useRef<L.Rectangle | null>(null);

  useEffect(() => {
    if (!active) {
      // Restaurar mapa
      map.dragging.enable();
      map.boxZoom.disable();
      map.getContainer().style.cursor = '';
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
      startRef.current = null;
      return;
    }
    map.dragging.disable();
    map.getContainer().style.cursor = 'crosshair';

    const onDown = (e: L.LeafletMouseEvent) => {
      startRef.current = e.latlng;
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (!startRef.current) return;
      const bounds = L.latLngBounds(startRef.current, e.latlng);
      if (previewRef.current) {
        previewRef.current.setBounds(bounds);
      } else {
        previewRef.current = L.rectangle(bounds, {
          color: '#3b82f6',
          weight: 2,
          fillOpacity: 0.1,
          dashArray: '4 4',
        }).addTo(map);
      }
    };
    const onUp = (e: L.LeafletMouseEvent) => {
      if (!startRef.current) return;
      const bounds = L.latLngBounds(startRef.current, e.latlng);
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      if (Math.abs(sw.lat - ne.lat) < 0.0005 || Math.abs(sw.lng - ne.lng) < 0.0005) {
        // Click sin drag — cancelar
        if (previewRef.current) {
          map.removeLayer(previewRef.current);
          previewRef.current = null;
        }
        startRef.current = null;
        onCancel();
        return;
      }
      onComplete({
        minLat: sw.lat,
        maxLat: ne.lat,
        minLng: sw.lng,
        maxLng: ne.lng,
      });
      startRef.current = null;
    };

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);

    return () => {
      map.off('mousedown', onDown);
      map.off('mousemove', onMove);
      map.off('mouseup', onUp);
    };
  }, [active, map, onComplete, onCancel]);

  return null;
}

// Recentrar el mapa programáticamente
function MapController({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 16, { duration: 0.6 });
  }, [target, map]);
  return null;
}

// =====================================================================
// Componente principal
// =====================================================================
// ViewMode y TimePreset se importan desde MapaFiltrosPanel

const FILTROS_STORAGE_KEY = 'mapa_filtros_v1';

interface FiltrosPersistidos {
  filtroEstado: string | null;
  filtroDependencia: number | null;
  timePreset: TimePreset;
  viewMode: ViewMode;
  showHotspots: boolean;
  showCoverage: boolean;
}

const DEFAULT_FILTROS: FiltrosPersistidos = {
  filtroEstado: null,
  filtroDependencia: null,
  timePreset: 'all',
  viewMode: 'pins',
  showHotspots: true,
  showCoverage: true,
};

function loadFiltrosFromStorage(): FiltrosPersistidos {
  try {
    const raw = localStorage.getItem(FILTROS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTROS;
    const parsed = JSON.parse(raw);
    return {
      filtroEstado:
        typeof parsed.filtroEstado === 'string' || parsed.filtroEstado === null
          ? parsed.filtroEstado
          : DEFAULT_FILTROS.filtroEstado,
      filtroDependencia:
        typeof parsed.filtroDependencia === 'number' ||
        parsed.filtroDependencia === null
          ? parsed.filtroDependencia
          : DEFAULT_FILTROS.filtroDependencia,
      timePreset: ['7', '30', '90', '365', 'all'].includes(parsed.timePreset)
        ? (parsed.timePreset as TimePreset)
        : DEFAULT_FILTROS.timePreset,
      viewMode: ['pins', 'heat', 'both'].includes(parsed.viewMode)
        ? (parsed.viewMode as ViewMode)
        : DEFAULT_FILTROS.viewMode,
      showHotspots:
        typeof parsed.showHotspots === 'boolean'
          ? parsed.showHotspots
          : DEFAULT_FILTROS.showHotspots,
      showCoverage:
        typeof parsed.showCoverage === 'boolean'
          ? parsed.showCoverage
          : DEFAULT_FILTROS.showCoverage,
    };
  } catch {
    return DEFAULT_FILTROS;
  }
}

function saveFiltrosToStorage(f: FiltrosPersistidos) {
  try {
    localStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* noop */
  }
}

export default function Mapa() {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const isDarkTheme = (() => {
    const hex = theme.background?.replace('#', '') || '';
    if (hex.length !== 6) return true;
    const n = parseInt(hex, 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff)) / 255;
    return lum < 0.5;
  })();
  const tileUrl = isDarkTheme ? TILE_URLS.dark : TILE_URLS.light;

  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Reclamo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filtros (con persistencia en localStorage)
  const initialFiltros = useMemo(() => loadFiltrosFromStorage(), []);
  const [filtroEstado, setFiltroEstado] = useState<string | null>(initialFiltros.filtroEstado);
  const filtroCategoria = searchParams.get('categoria');
  const [filtroDependencia, setFiltroDependencia] = useState<number | null>(initialFiltros.filtroDependencia);
  const [timePreset, setTimePreset] = useState<TimePreset>(initialFiltros.timePreset);

  // Vistas
  const [viewMode, setViewMode] = useState<ViewMode>(initialFiltros.viewMode);
  const [showHotspots, setShowHotspots] = useState(initialFiltros.showHotspots);
  const [showCoverage, setShowCoverage] = useState(initialFiltros.showCoverage);

  // Persistir filtros cuando cambian
  useEffect(() => {
    saveFiltrosToStorage({
      filtroEstado,
      filtroDependencia,
      timePreset,
      viewMode,
      showHotspots,
      showCoverage,
    });
  }, [filtroEstado, filtroDependencia, timePreset, viewMode, showHotspots, showCoverage]);

  // Time-lapse
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationDay, setAnimationDay] = useState<number>(0); // offset desde la fecha más vieja
  const animationRef = useRef<number | null>(null);

  // Dibujo
  const [drawMode, setDrawMode] = useState(false);
  const [drawnBBox, setDrawnBBox] = useState<BBox | null>(null);

  // Recentrado programático
  const [mapTarget, setMapTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  // =================================================================
  // Carga de datos en lotes
  // =================================================================
  useEffect(() => {
    const fetchReclamosEnLotes = async () => {
      try {
        const BATCH_SIZE = 100;
        let allReclamos: Reclamo[] = [];
        let skip = 0;
        let hasMore = true;
        let isFirstBatch = true;

        while (hasMore) {
          if (!isFirstBatch) setLoadingMore(true);
          const response = await reclamosApi.getAll({ skip, limit: BATCH_SIZE });
          const batch = response.data || [];
          const conUbicacion = batch.filter((r: Reclamo) => r.latitud && r.longitud);
          allReclamos = [...allReclamos, ...conUbicacion];

          const idsVistos = new Set<number>();
          const sinDuplicados = allReclamos.filter(r => {
            if (idsVistos.has(r.id)) return false;
            idsVistos.add(r.id);
            return true;
          });
          setReclamos(sinDuplicados);

          if (isFirstBatch) {
            setLoading(false);
            isFirstBatch = false;
          }
          if (batch.length < BATCH_SIZE) hasMore = false;
          else skip += BATCH_SIZE;
        }
      } catch (error) {
        console.error('Error cargando reclamos:', error);
        setLoading(false);
      } finally {
        setLoadingMore(false);
      }
    };
    fetchReclamosEnLotes();
  }, []);

  // =================================================================
  // Universos derivados
  // =================================================================
  // Lista de dependencias presentes en los datos
  const dependenciasDisponibles = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string; color: string; count: number }>();
    for (const r of reclamos) {
      const d = r.dependencia_asignada;
      if (!d) continue;
      const id = d.id;
      const existing = map.get(id);
      if (existing) existing.count += 1;
      else
        map.set(id, {
          id,
          nombre: d.nombre || `Dependencia #${id}`,
          color: d.color || '#6366f1',
          count: 1,
        });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [reclamos]);

  // Rango temporal del dataset
  const dateRange = useMemo(() => {
    if (reclamos.length === 0) return null;
    const ts = reclamos.map(r => new Date(r.created_at).getTime());
    return { min: Math.min(...ts), max: Math.max(...ts) };
  }, [reclamos]);

  // =================================================================
  // Pipeline de filtros
  // =================================================================
  // 1) Categoría
  const reclamosPorCategoria = useMemo(() => {
    if (!filtroCategoria) return reclamos;
    return reclamos.filter(r => getCategoryKey(r.categoria?.nombre || 'Otros') === filtroCategoria);
  }, [reclamos, filtroCategoria]);

  // 2) Dependencia
  const reclamosPorDependencia = useMemo(() => {
    if (filtroDependencia == null) return reclamosPorCategoria;
    return reclamosPorCategoria.filter(r => r.dependencia_asignada?.id === filtroDependencia);
  }, [reclamosPorCategoria, filtroDependencia]);

  // 3) Tiempo (preset o animación)
  const reclamosPorTiempo = useMemo(() => {
    if (isPlaying && dateRange) {
      // Ventana móvil de 30 días desde animationDay
      const winStart = dateRange.min + animationDay * 24 * 60 * 60 * 1000;
      const winEnd = winStart + 30 * 24 * 60 * 60 * 1000;
      return reclamosPorDependencia.filter(r => {
        const t = new Date(r.created_at).getTime();
        return t >= winStart && t <= winEnd;
      });
    }
    if (timePreset === 'all') return reclamosPorDependencia;
    const days = parseInt(timePreset, 10);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return reclamosPorDependencia.filter(r => new Date(r.created_at).getTime() >= cutoff);
  }, [reclamosPorDependencia, timePreset, isPlaying, animationDay, dateRange]);

  // 4) Estado
  const reclamosPostEstado = useMemo(() => {
    if (!filtroEstado) return reclamosPorTiempo;
    return reclamosPorTiempo.filter(r => r.estado === filtroEstado);
  }, [reclamosPorTiempo, filtroEstado]);

  // 5) BBox dibujada (solo afecta lo que se muestra en stats popup, no en mapa)
  const reclamosFiltrados = reclamosPostEstado;
  const reclamosEnBBox = useMemo(
    () => (drawnBBox ? reclamosInBBox(reclamosFiltrados, drawnBBox) : []),
    [drawnBBox, reclamosFiltrados],
  );

  // Counts
  const conteosPorCategoria = useMemo(() => {
    return reclamos.reduce((acc, r) => {
      const key = getCategoryKey(r.categoria?.nombre || 'Otros');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [reclamos]);

  const conteosPorEstado = useMemo(() => {
    return reclamosPorTiempo.reduce((acc, r) => {
      acc[r.estado] = (acc[r.estado] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [reclamosPorTiempo]);

  // Hotspots (sobre los reclamos filtrados)
  const hotspots = useMemo(() => {
    if (!showHotspots) return [];
    return recurrentHotspots(reclamosFiltrados, { radiusMeters: 80, minPoints: 3, daysBack: 90 });
  }, [reclamosFiltrados, showHotspots]);

  // Puntos para coverage por dependencia (sobre todos los reclamos de esa dependencia, sin filtro de tiempo)
  const coveragePoints = useMemo(() => {
    if (filtroDependencia == null || !showCoverage) return [];
    return reclamos
      .filter(r => r.dependencia_asignada?.id === filtroDependencia)
      .filter(r => r.latitud != null && r.longitud != null)
      .map(r => [r.latitud!, r.longitud!] as [number, number]);
  }, [reclamos, filtroDependencia, showCoverage]);

  const coverageColor = useMemo(() => {
    if (filtroDependencia == null) return '#6366f1';
    return dependenciasDisponibles.find(d => d.id === filtroDependencia)?.color || '#6366f1';
  }, [filtroDependencia, dependenciasDisponibles]);

  // =================================================================
  // Time-lapse animation loop
  // =================================================================
  useEffect(() => {
    if (!isPlaying || !dateRange) return;
    const totalDays = Math.ceil((dateRange.max - dateRange.min) / (24 * 60 * 60 * 1000));
    const STEP_DAYS = 7;
    const INTERVAL_MS = 800;

    const tick = () => {
      setAnimationDay(prev => {
        const next = prev + STEP_DAYS;
        if (next > totalDays) {
          setIsPlaying(false);
          return totalDays;
        }
        return next;
      });
    };
    animationRef.current = window.setInterval(tick, INTERVAL_MS);
    return () => {
      if (animationRef.current) window.clearInterval(animationRef.current);
    };
  }, [isPlaying, dateRange]);

  const animationDate = useMemo(() => {
    if (!dateRange) return null;
    return new Date(dateRange.min + animationDay * 24 * 60 * 60 * 1000);
  }, [dateRange, animationDay]);

  // =================================================================
  // Handlers
  // =================================================================
  const handleMarkerClick = (r: Reclamo) => {
    setSelected(r);
    setSidebarOpen(true);
  };
  const closeSidebar = () => {
    setSidebarOpen(false);
    setSelected(null);
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const startPlay = () => {
    if (!dateRange) return;
    setAnimationDay(0);
    setIsPlaying(true);
  };
  const pausePlay = () => setIsPlaying(false);
  const resetPlay = () => {
    setIsPlaying(false);
    setAnimationDay(0);
  };

  const handleDrawComplete = useCallback((bbox: BBox) => {
    setDrawnBBox(bbox);
    setDrawMode(false);
  }, []);
  const handleDrawCancel = useCallback(() => setDrawMode(false), []);
  const clearDrawnBBox = () => setDrawnBBox(null);

  const handleClearAllFiltros = () => {
    setSearchParams({});
    setFiltroEstado(null);
    setFiltroDependencia(null);
    setTimePreset('all');
    setViewMode('pins');
    setShowHotspots(true);
    setShowCoverage(true);
  };

  const handleCategoriaChange = (key: string | null) => {
    if (key == null) setSearchParams({});
    else setSearchParams({ categoria: key });
    setFiltroEstado(null);
  };

  const handleToggleDraw = () => {
    setDrawnBBox(null);
    setDrawMode((d) => !d);
  };

  const focusOnZona = (lat: number, lng: number) => {
    setMapTarget({ lat, lng, zoom: 17 });
  };

  // =================================================================
  // Export PDF de zona dibujada
  // =================================================================
  const exportZonaPdf = () => {
    if (!drawnBBox || reclamosEnBBox.length === 0) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const kpis = computeKPIs(reclamosEnBBox);
    const zonas = topZonas(reclamosEnBBox, 5, 150);

    const W = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Reporte de Zona — Mapa de Reclamos', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, margin, y);
    y += 6;
    doc.text(
      `Coordenadas: ${drawnBBox.minLat.toFixed(5)}, ${drawnBBox.minLng.toFixed(5)} → ${drawnBBox.maxLat.toFixed(5)}, ${drawnBBox.maxLng.toFixed(5)}`,
      margin,
      y,
    );
    y += 10;
    doc.setTextColor(0);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Indicadores principales', margin, y);
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`• Total reclamos en la zona: ${kpis.total}`, margin, y); y += 6;
    doc.text(`• Resueltos: ${kpis.resueltos} (${kpis.pctResueltos.toFixed(0)}%)`, margin, y); y += 6;
    doc.text(
      `• Tiempo medio de resolución: ${kpis.tiempoMedioDias != null ? kpis.tiempoMedioDias.toFixed(1) + ' días' : 's/d'}`,
      margin,
      y,
    ); y += 6;
    doc.text(`• Abiertos > 30 días: ${kpis.abiertos30dPlus}`, margin, y); y += 10;

    if (zonas.length > 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Top zonas dentro del área', margin, y);
      y += 7;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      zonas.forEach((z, idx) => {
        const dir = z.topDireccion || `${z.centerLat.toFixed(4)}, ${z.centerLng.toFixed(4)}`;
        doc.text(`${idx + 1}. ${dir} — ${z.reclamos.length} reclamos`, margin, y);
        y += 6;
      });
      y += 4;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Listado de reclamos', margin, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    reclamosEnBBox.slice(0, 40).forEach((r, idx) => {
      if (y > 280) {
        doc.addPage();
        y = margin;
      }
      const linea = `${idx + 1}. #${r.id} — ${r.titulo} [${STATUS_LABELS[r.estado] || r.estado}] ${r.direccion || ''}`;
      const split = doc.splitTextToSize(linea, W - margin * 2);
      doc.text(split, margin, y);
      y += split.length * 4 + 2;
    });
    if (reclamosEnBBox.length > 40) {
      y += 3;
      doc.setTextColor(150);
      doc.text(`...y ${reclamosEnBBox.length - 40} reclamos más.`, margin, y);
    }

    doc.save(`reporte-zona-${Date.now()}.pdf`);
  };

  // =================================================================
  // Universos para pills/centros
  // =================================================================
  const getMapCenter = (): [number, number] => {
    if (reclamos.length === 0) return [-34.6037, -58.3816];
    const lat = reclamos.reduce((s, r) => s + (r.latitud || 0), 0) / reclamos.length;
    const lng = reclamos.reduce((s, r) => s + (r.longitud || 0), 0) / reclamos.length;
    return [lat, lng];
  };

  const categoriasDisponibles = Object.entries(CATEGORY_CONFIG)
    .map(([key, cfg]) => ({ key, ...cfg, count: conteosPorCategoria[key] || 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Cuando cambian los filtros principales, refit del mapa (no en cada cambio de viewMode)
  useEffect(() => {
    setFitSignal(s => s + 1);
  }, [filtroCategoria, filtroDependencia, filtroEstado, timePreset]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: theme.primary }}
        ></div>
      </div>
    );
  }

  // =================================================================
  // Filter Panel — colapsable, persistente, mobile/desktop friendly
  // =================================================================
  const totalAnimationDays = dateRange
    ? Math.ceil((dateRange.max - dateRange.min) / 86400000)
    : 0;

  const filterPanel = (
    <MapaFiltrosPanel
      categoriasDisponibles={categoriasDisponibles}
      dependenciasDisponibles={dependenciasDisponibles}
      statusColors={STATUS_COLORS}
      statusLabels={STATUS_LABELS}
      conteosPorEstado={conteosPorEstado}
      totalReclamos={reclamos.length}
      totalEnRangoTiempo={reclamosPorTiempo.length}
      hotspotsCount={hotspots.length}
      filtroCategoria={filtroCategoria}
      filtroEstado={filtroEstado}
      filtroDependencia={filtroDependencia}
      timePreset={timePreset}
      viewMode={viewMode}
      showHotspots={showHotspots}
      showCoverage={showCoverage}
      onCategoriaChange={handleCategoriaChange}
      onEstadoChange={setFiltroEstado}
      onDependenciaChange={setFiltroDependencia}
      onTimePresetChange={(p) => {
        setIsPlaying(false);
        setTimePreset(p);
      }}
      onViewModeChange={setViewMode}
      onToggleHotspots={() => setShowHotspots((s) => !s)}
      onToggleCoverage={() => setShowCoverage((s) => !s)}
      onClearAll={handleClearAllFiltros}
      isPlaying={isPlaying}
      hasDateRange={dateRange != null}
      onPlay={startPlay}
      onPause={pausePlay}
      onReset={resetPlay}
      drawMode={drawMode}
      onToggleDraw={handleToggleDraw}
      animationDate={animationDate}
      animationDay={animationDay}
      totalAnimationDays={totalAnimationDays}
      reclamosFiltradosCount={reclamosFiltrados.length}
    />
  );

  return (
    <div className="space-y-6">
      {/* CSS para animación de hotspots */}
      <style>{`
        @keyframes hotspot-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.15); }
        }
        .leaflet-interactive.hotspot-pulse {
          animation: hotspot-pulse 1.6s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>

      <StickyPageHeader filterPanel={filterPanel}>
        <PageTitleIcon icon={<MapIcon className="h-4 w-4" />} />
        <PageTitle>Mapa de Reclamos</PageTitle>
        {loadingMore && (
          <>
            <HeaderSeparator />
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-full text-sm"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Cargando más...</span>
            </div>
          </>
        )}
      </StickyPageHeader>

      <PageHint pageId="mapa-reclamos" />

      <div
        className="relative rounded-lg shadow overflow-hidden"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div style={{ height: '600px' }}>
          <MapContainer
            center={getMapCenter()}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer attribution="&copy; OSM &copy; CARTO" url={tileUrl} />

            <FitBoundsToMarkers reclamos={reclamosFiltrados} signal={fitSignal} />
            <MapController target={mapTarget} />

            {/* Coverage por dependencia */}
            {filtroDependencia != null && showCoverage && coveragePoints.length >= 3 && (
              <CoveragePolygon points={coveragePoints} color={coverageColor} />
            )}

            {/* Heat layer */}
            {(viewMode === 'heat' || viewMode === 'both') && (
              <HeatLayer reclamos={reclamosFiltrados} />
            )}

            {/* Pins */}
            {(viewMode === 'pins' || viewMode === 'both') &&
              reclamosFiltrados.map(r => (
                <Marker
                  key={r.id}
                  position={[r.latitud!, r.longitud!]}
                  icon={createPinIcon(STATUS_COLORS[r.estado] || '#6b7280')}
                  eventHandlers={{ click: () => handleMarkerClick(r) }}
                >
                  <Tooltip direction="top" offset={[0, -42]} permanent={false}>
                    <div className="font-medium text-sm">{r.titulo}</div>
                    <div className="text-xs text-gray-500">{r.direccion}</div>
                  </Tooltip>
                </Marker>
              ))}

            {/* Hotspots */}
            {showHotspots && <HotspotLayer hotspots={hotspots} />}

            {/* Drawn rectangle */}
            {drawnBBox && (
              <Rectangle
                bounds={[
                  [drawnBBox.minLat, drawnBBox.minLng],
                  [drawnBBox.maxLat, drawnBBox.maxLng],
                ]}
                pathOptions={{
                  color: theme.primary,
                  weight: 2,
                  fillOpacity: 0.05,
                  dashArray: '4 4',
                }}
              />
            )}

            {/* Draw handler */}
            <DrawHandler
              active={drawMode}
              onComplete={handleDrawComplete}
              onCancel={handleDrawCancel}
            />
          </MapContainer>
        </div>

        {/* Overlay popup para zona dibujada */}
        {drawnBBox && (
          <div
            className="absolute top-4 right-4 z-[500] rounded-xl shadow-2xl p-4 w-80"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2" style={{ color: theme.text }}>
                <Square className="h-4 w-4" style={{ color: theme.primary }} />
                Zona seleccionada
              </h3>
              <button
                onClick={clearDrawnBBox}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                style={{ color: theme.textSecondary }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ZonaSnapshot reclamos={reclamosEnBBox} theme={theme} />
            <div className="flex gap-2 mt-3">
              <button
                onClick={exportZonaPdf}
                disabled={reclamosEnBBox.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`,
                  color: '#fff',
                }}
              >
                <FileDown className="h-3.5 w-3.5" />
                Exportar PDF
              </button>
              <button
                onClick={clearDrawnBBox}
                className="px-3 py-2 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: `${theme.textSecondary}15`,
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Hint mientras dibujás */}
        {drawMode && !drawnBBox && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] px-4 py-2 rounded-full text-xs font-medium shadow-lg pointer-events-none"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            ✏ Click + arrastrar para definir el área
          </div>
        )}
      </div>

      {/* === Sección de métricas debajo del mapa === */}
      <MapaStats
        reclamos={reclamosFiltrados}
        totalUniverso={reclamos.length}
        statusColors={STATUS_COLORS}
        statusLabels={STATUS_LABELS}
        onZonaClick={c => focusOnZona(c.centerLat, c.centerLng)}
      />

      {/* Side Drawer */}
      {createPortal(
        <>
          <div
            onClick={closeSidebar}
            className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 z-[9998] ${
              sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />
          <div
            className={`fixed top-0 right-0 h-screen w-full sm:w-[420px] transform transition-transform duration-300 ease-in-out z-[9999] ${
              sidebarOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{
              backgroundColor: theme.card,
              borderLeft: `1px solid ${theme.border}`,
              boxShadow: sidebarOpen ? '-8px 0 32px rgba(0,0,0,0.25)' : 'none',
            }}
          >
            {selected && (
              <div className="h-full flex flex-col">
                <div
                  className="p-4 flex items-center justify-between"
                  style={{ borderBottom: `1px solid ${theme.border}` }}
                >
                  <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                    Detalle del Reclamo
                  </h3>
                  <button
                    onClick={closeSidebar}
                    className="p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    style={{ color: theme.textSecondary }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-3 py-1 text-sm font-medium rounded-full text-white"
                      style={{ backgroundColor: STATUS_COLORS[selected.estado] || '#6b7280' }}
                    >
                      {STATUS_LABELS[selected.estado] || selected.estado}
                    </span>
                    <span className="text-xs" style={{ color: theme.textSecondary }}>
                      #{selected.id}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xl font-bold" style={{ color: theme.text }}>
                      {selected.titulo}
                    </h4>
                  </div>

                  {selected.descripcion && (
                    <div>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        {selected.descripcion}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Tag className="h-5 w-5" style={{ color: selected.categoria?.color || theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Categoría</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {selected.categoria?.nombre || 'Sin categoría'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <MapPin className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Dirección</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {selected.direccion || 'Sin dirección'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Navigation className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Coordenadas</p>
                        <p className="font-medium font-mono text-sm" style={{ color: theme.text }}>
                          {selected.latitud?.toFixed(6)}, {selected.longitud?.toFixed(6)}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Calendar className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Fecha de creación</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {formatDate(selected.created_at)}
                        </p>
                      </div>
                    </div>

                    {selected.creador && (
                      <div
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{ backgroundColor: theme.backgroundSecondary }}
                      >
                        <User className="h-5 w-5" style={{ color: theme.primary }} />
                        <div>
                          <p className="text-xs" style={{ color: theme.textSecondary }}>Reportado por</p>
                          <p className="font-medium" style={{ color: theme.text }}>
                            {selected.creador.nombre} {selected.creador.apellido}
                          </p>
                        </div>
                      </div>
                    )}

                    <div
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: theme.backgroundSecondary }}
                    >
                      <Clock className="h-5 w-5" style={{ color: theme.primary }} />
                      <div>
                        <p className="text-xs" style={{ color: theme.textSecondary }}>Tiempo transcurrido</p>
                        <p className="font-medium" style={{ color: theme.text }}>
                          {Math.floor(
                            (Date.now() - new Date(selected.created_at).getTime()) /
                              (1000 * 60 * 60 * 24),
                          )}{' '}
                          días
                        </p>
                      </div>
                    </div>
                  </div>

                  {selected.documentos &&
                    selected.documentos.filter(d => d.tipo?.startsWith('image')).length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                          Imágenes (
                          {selected.documentos.filter(d => d.tipo?.startsWith('image')).length})
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {selected.documentos
                            .filter(d => d.tipo?.startsWith('image'))
                            .map((doc, idx) => (
                              <img
                                key={idx}
                                src={doc.url}
                                alt={`Imagen ${idx + 1}`}
                                className="rounded-lg object-cover h-24 w-full"
                              />
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// =====================================================================
// Mini-snapshot para popup de zona dibujada
// =====================================================================
function ZonaSnapshot({
  reclamos,
  theme,
}: {
  reclamos: Reclamo[];
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  if (reclamos.length === 0) {
    return (
      <p className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>
        No hay reclamos en el área seleccionada.
      </p>
    );
  }
  const resueltos = reclamos.filter(r => isResuelto(r.estado)).length;
  const abiertos = reclamos.length - resueltos;
  // Top categoría
  const catCounts: Record<string, number> = {};
  for (const r of reclamos) {
    const k = r.categoria?.nombre || 'Sin categoría';
    catCounts[k] = (catCounts[k] || 0) + 1;
  }
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: theme.text }}>{reclamos.length}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Total</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: '#10b981' }}>{resueltos}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Resueltos</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>{abiertos}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Abiertos</p>
        </div>
      </div>
      {topCat && (
        <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: theme.background, color: theme.text }}>
          <span style={{ color: theme.textSecondary }}>Top categoría: </span>
          <span className="font-bold">{topCat[0]}</span> ({topCat[1]})
        </div>
      )}
    </div>
  );
}
