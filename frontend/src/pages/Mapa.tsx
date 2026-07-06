import { useEffect, useState, useMemo, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
  Polygon,
  Rectangle,
  Circle,
  CircleMarker,
} from 'react-leaflet';
import {
  X,
  MapPin,
  MapPinned,
  Calendar,
  User,
  Tag,
  Clock,
  Navigation,
  Map as MapIcon,
  Square,
  FileDown,
  FileText,
  Inbox,
  PlayCircle,
  CheckCircle,
  Flame,
  Pencil,
  Trash2,
  Loader2,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { estadoColor, estadoLabel, estadoColors, estadoLabels } from '../lib/enums/reclamo';
import { reclamosApi, poiApi, modulosApi } from '../lib/api';
import { StickyPageHeader, PageTitleIcon, PageTitle, HeaderSeparator } from '../components/ui/StickyPageHeader';
import { KpiRow, type KpiSpec } from '../components/ui/KpiCard';
import PageHint from '../components/ui/PageHint';
import { Sheet } from '../components/ui/Sheet';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Slider } from '../components/ui/Slider';
import { ModernSelect } from '../components/ui/ModernSelect';
import MapaPuntosPanel from '../components/mapa/MapaPuntosPanel';
import {
  Reclamo,
  type PuntoInteres,
  type PoiTipo,
  type PoiReclamosEnZonaResponse,
  type PoiConsolidarResponse,
  type PoiRecalcularResponse,
} from '../types';
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

// =====================================================================
// Marker de POI (modo Puntos): círculo relleno con el color del tipo.
// Se diferencia del pin de reclamo (gota) para no confundir capas.
// =====================================================================
const createPoiIcon = (color: string, selected = false, sizeOverride?: number) => {
  const size = sizeOverride ?? (selected ? 30 : 24);
  const border = size <= 16 ? 2 : 3;
  return L.divIcon({
    className: 'custom-poi-marker',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${border}px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Estados: color/label canónicos vienen del SSoT `lib/enums/reclamo.ts`.
// Para los combos/leyendas hijos (MapaFiltrosPanel, MapaStats) se pasa el mapa
// de colores SIN la key 'default' (que no es un estado real, solo el fallback).
const ESTADO_COLORS_LISTA: Record<string, string> = Object.fromEntries(
  Object.entries(estadoColors).filter(([k]) => k !== 'default'),
);

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
              <p className="font-bold text-red-600 flex items-center gap-1"><Flame size={12} /> Hotspot recurrente</p>
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

// Click en el mapa (modo Puntos) -> crear POI en esas coords.
function PoiClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      // Ignorar el click que precede a un doble-click (zoom): sin esto, hacer
      // doble-click para acercar abriría el Sheet de "nuevo punto".
      if ((e.originalEvent?.detail ?? 1) > 1) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Fit-bounds genérico sobre una lista de coords (modo Puntos). Mismo patrón que
// FitBoundsToMarkers pero desacoplado del tipo Reclamo.
function FitBoundsToLatLngs({ points, signal }: { points: Array<[number, number]>; signal: number }) {
  const map = useMap();
  const lastSignal = useRef(-1);
  useEffect(() => {
    if (signal === lastSignal.current) return;
    lastSignal.current = signal;
    if (points.length === 0) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) {
        map.setView(points[0], 15);
      } else {
        const latlngs = points.map((p) => L.latLng(p[0], p[1]));
        map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 15 });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [points, map, signal]);
  return null;
}

// =====================================================================
// Componente principal
// =====================================================================
// ViewMode y TimePreset se importan desde MapaFiltrosPanel

// v2: se agregó `mapMode` (Reclamos | Puntos). Versionar la key resetea los
// filtros viejos (aceptable) y evita parsear un shape sin mapMode.
const FILTROS_STORAGE_KEY = 'mapa_filtros_v2';

type MapMode = 'reclamos' | 'puntos';

interface FiltrosPersistidos {
  filtroEstado: string | null;
  filtroDependencia: number | null;
  timePreset: TimePreset;
  viewMode: ViewMode;
  showHotspots: boolean;
  showCoverage: boolean;
  showPois: boolean;
  mapMode: MapMode;
}

const DEFAULT_FILTROS: FiltrosPersistidos = {
  filtroEstado: null,
  filtroDependencia: null,
  timePreset: 'all',
  viewMode: 'pins',
  showHotspots: true,
  showCoverage: true,
  showPois: false,
  mapMode: 'reclamos',
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
      showPois:
        typeof parsed.showPois === 'boolean'
          ? parsed.showPois
          : DEFAULT_FILTROS.showPois,
      mapMode: ['reclamos', 'puntos'].includes(parsed.mapMode)
        ? (parsed.mapMode as MapMode)
        : DEFAULT_FILTROS.mapMode,
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

// Estado del form de POI (Sheet crear/editar). lat/long se editan por drag/click
// en el mapa, no a mano — acá se guardan para el payload y para mostrarlas.
interface PoiFormState {
  nombre: string;
  tipo_id: number | null;
  direccion: string;
  radio_metros: number;
  activo: boolean;
  notas: string;
  latitud: number;
  longitud: number;
}

const POI_RADIO_DEFAULT = 2000;

const POI_FORM_VACIO: PoiFormState = {
  nombre: '',
  tipo_id: null,
  direccion: '',
  radio_metros: POI_RADIO_DEFAULT,
  activo: true,
  notas: '',
  latitud: 0,
  longitud: 0,
};

export default function Mapa() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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

  // Capa opcional de Puntos de Interés sobre el mapa de RECLAMOS (no confundir
  // con el modo Puntos, que es una superficie propia). Persistida en la misma key.
  const [showPois, setShowPois] = useState(initialFiltros.showPois);

  // Modo del mapa: Reclamos (default) | Puntos (POI). Persistido en la misma key.
  const [mapMode, setMapMode] = useState<MapMode>(initialFiltros.mapMode);

  // Persistir filtros cuando cambian
  useEffect(() => {
    saveFiltrosToStorage({
      filtroEstado,
      filtroDependencia,
      timePreset,
      viewMode,
      showHotspots,
      showCoverage,
      showPois,
      mapMode,
    });
  }, [filtroEstado, filtroDependencia, timePreset, viewMode, showHotspots, showCoverage, showPois, mapMode]);

  // =================================================================
  // MODO PUNTOS (POI) — gate por módulo activo + rol admin/supervisor
  // =================================================================
  const [poiEnabled, setPoiEnabled] = useState(false);
  useEffect(() => {
    if (!user) {
      setPoiEnabled(false);
      return;
    }
    modulosApi
      .list()
      .then((r) => {
        const rows = (r.data || []) as Array<{ modulo: string; activo: boolean }>;
        setPoiEnabled(rows.some((m) => m.modulo === 'poi' && m.activo));
      })
      .catch(() => setPoiEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.municipio_id]);

  const canUsePoi = poiEnabled && (user?.rol === 'admin' || user?.rol === 'supervisor');
  const isPuntos = canUsePoi && mapMode === 'puntos';

  // Estado del modo Puntos
  const [pois, setPois] = useState<PuntoInteres[]>([]);
  const [tipos, setTipos] = useState<PoiTipo[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiSearch, setPoiSearch] = useState('');
  const [poiCounts, setPoiCounts] = useState<Record<number, number>>({});
  const [poiCountsLoading, setPoiCountsLoading] = useState(false);
  const [poiFitSignal, setPoiFitSignal] = useState(0);
  // Bump para remontar los markers (snap-back tras cancelar un drag).
  const [poiRevision, setPoiRevision] = useState(0);
  const [recalculando, setRecalculando] = useState(false);
  const [consolidatingId, setConsolidatingId] = useState<number | null>(null);
  const [poiSelectedId, setPoiSelectedId] = useState<number | null>(null);

  // Sheet de POI (crear/editar)
  const [poiSheetOpen, setPoiSheetOpen] = useState(false);
  const [poiEditing, setPoiEditing] = useState<PuntoInteres | null>(null);
  const [poiSaving, setPoiSaving] = useState(false);
  const [poiForm, setPoiForm] = useState<PoiFormState>(POI_FORM_VACIO);
  const [poiToDelete, setPoiToDelete] = useState<PuntoInteres | null>(null);
  const [poiDragPending, setPoiDragPending] = useState<{ poi: PuntoInteres; lat: number; lng: number } | null>(null);

  // Cargar counts de reclamos-en-zona por POI (una request por punto).
  const loadPoiCounts = useCallback(async (list: PuntoInteres[]) => {
    if (list.length === 0) {
      setPoiCounts({});
      return;
    }
    setPoiCountsLoading(true);
    try {
      const results = await Promise.all(
        list.map((p) =>
          poiApi
            .reclamosEnZona(p.id)
            .then((r) => [p.id, (r.data as PoiReclamosEnZonaResponse).total] as const)
            .catch(() => [p.id, 0] as const),
        ),
      );
      const map: Record<number, number> = {};
      for (const [id, c] of results) map[id] = c;
      setPoiCounts(map);
    } finally {
      setPoiCountsLoading(false);
    }
  }, []);

  const cargarPois = useCallback(async () => {
    setPoiLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        poiApi.listTipos({ activo: true }),
        poiApi.listPuntos(),
      ]);
      setTipos((tRes.data || []) as PoiTipo[]);
      const list = (pRes.data || []) as PuntoInteres[];
      setPois(list);
      setPoiRevision((r) => r + 1);
      setPoiFitSignal((s) => s + 1);
      loadPoiCounts(list);
    } catch {
      toast.error('Error cargando los puntos de interés');
    } finally {
      setPoiLoading(false);
    }
  }, [loadPoiCounts]);

  // Cargar POIs al habilitarse el modo (una vez que el gate resuelve).
  useEffect(() => {
    if (canUsePoi) cargarPois();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUsePoi]);

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
    return reclamos.filter(r => String(r.categoria?.id ?? 'otros') === filtroCategoria);
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

  // Categorías reales del muni (id + color de la DB), con conteo. Cada categoría
  // tiene su propio filtro/leyenda — no se colapsan en un "Otros" indistinguible.
  const categoriasDisponibles = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; count: number }>();
    for (const r of reclamos) {
      const c = r.categoria;
      const key = c?.id != null ? String(c.id) : 'otros';
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else
        map.set(key, {
          key,
          label: c?.nombre || 'Sin categoría',
          color: c?.color || theme.textSecondary,
          count: 1,
        });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [reclamos, theme.textSecondary]);

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
    setShowPois(false);
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
  // Handlers del modo Puntos
  // =================================================================
  const poiPoints = useMemo<Array<[number, number]>>(
    () => pois.map((p) => [p.latitud, p.longitud]),
    [pois],
  );

  const getPoiCenter = (): [number, number] => {
    if (pois.length === 0) return getMapCenter();
    const lat = pois.reduce((s, p) => s + p.latitud, 0) / pois.length;
    const lng = pois.reduce((s, p) => s + p.longitud, 0) / pois.length;
    return [lat, lng];
  };

  const abrirNuevoPoi = (lat: number, lng: number) => {
    const defTipo = tipos[0];
    setPoiEditing(null);
    setPoiSelectedId(null);
    setPoiForm({
      nombre: '',
      tipo_id: defTipo ? defTipo.id : null,
      direccion: '',
      radio_metros: defTipo?.radio_default_metros ?? POI_RADIO_DEFAULT,
      activo: true,
      notas: '',
      latitud: lat,
      longitud: lng,
    });
    setPoiSheetOpen(true);
  };

  const abrirEditPoi = (poi: PuntoInteres) => {
    setPoiEditing(poi);
    setPoiSelectedId(poi.id);
    setPoiForm({
      nombre: poi.nombre,
      tipo_id: poi.tipo_id,
      direccion: poi.direccion || '',
      radio_metros: poi.radio_metros,
      activo: poi.activo,
      notas: poi.notas || '',
      latitud: poi.latitud,
      longitud: poi.longitud,
    });
    setPoiSheetOpen(true);
  };

  // Click en una fila del panel: recentra el mapa y abre el Sheet en edición.
  const seleccionarPoi = (poi: PuntoInteres) => {
    setMapTarget({ lat: poi.latitud, lng: poi.longitud, zoom: 15 });
    abrirEditPoi(poi);
  };

  // Al elegir un tipo en el Sheet: si estamos CREANDO, autocompletar el radio
  // con el default del tipo (en edición se respeta el radio ya guardado).
  const handlePoiTipoChange = (tipoIdStr: string) => {
    const tipoId = tipoIdStr === '' ? null : Number(tipoIdStr);
    setPoiForm((f) => {
      const t = tipos.find((x) => x.id === tipoId);
      const radio = !poiEditing && t?.radio_default_metros ? t.radio_default_metros : f.radio_metros;
      return { ...f, tipo_id: tipoId, radio_metros: radio };
    });
  };

  const guardarPoi = async () => {
    if (!poiForm.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (poiForm.tipo_id == null) {
      toast.error('Elegí un tipo de punto');
      return;
    }
    setPoiSaving(true);
    try {
      const payload = {
        tipo_id: poiForm.tipo_id,
        nombre: poiForm.nombre.trim(),
        direccion: poiForm.direccion.trim() || null,
        latitud: poiForm.latitud,
        longitud: poiForm.longitud,
        radio_metros: poiForm.radio_metros,
        activo: poiForm.activo,
        notas: poiForm.notas.trim() || null,
      };
      if (poiEditing) {
        await poiApi.updatePunto(poiEditing.id, payload);
        toast.success('Punto actualizado');
      } else {
        await poiApi.createPunto(payload);
        toast.success('Punto creado');
      }
      setPoiSheetOpen(false);
      await cargarPois();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error guardando el punto');
    } finally {
      setPoiSaving(false);
    }
  };

  const eliminarPoi = async () => {
    if (!poiToDelete) return;
    const id = poiToDelete.id;
    try {
      await poiApi.deletePunto(id);
      toast.success('Punto eliminado');
      setPoiToDelete(null);
      if (poiEditing?.id === id) {
        setPoiSheetOpen(false);
        setPoiEditing(null);
      }
      await cargarPois();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error eliminando el punto');
      setPoiToDelete(null);
    }
  };

  // Drag del marker -> confirmar y persistir la nueva ubicación.
  const confirmarMovimiento = async () => {
    if (!poiDragPending) return;
    const { poi, lat, lng } = poiDragPending;
    setPoiDragPending(null);
    try {
      await poiApi.updatePunto(poi.id, {
        tipo_id: poi.tipo_id,
        nombre: poi.nombre,
        direccion: poi.direccion ?? null,
        latitud: lat,
        longitud: lng,
        radio_metros: poi.radio_metros,
        activo: poi.activo,
        notas: poi.notas ?? null,
      });
      toast.success('Punto reubicado');
      await cargarPois();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error moviendo el punto');
      setPoiRevision((r) => r + 1); // snap-back al lugar original
    }
  };

  const cancelarMovimiento = () => {
    setPoiDragPending(null);
    setPoiRevision((r) => r + 1); // remonta el marker en su posición guardada
  };

  const recalcularZonas = async () => {
    setRecalculando(true);
    try {
      const r = await poiApi.recalcular();
      const n = (r.data as PoiRecalcularResponse)?.reclamos_en_zona ?? 0;
      toast.success(`Zonas recalculadas: ${n} reclamos en zona`);
      await loadPoiCounts(pois);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error recalculando las zonas');
    } finally {
      setRecalculando(false);
    }
  };

  const consolidarPoi = async (poi: PuntoInteres) => {
    setConsolidatingId(poi.id);
    try {
      const r = await poiApi.consolidar(poi.id);
      const data = r.data as PoiConsolidarResponse;
      toast.success(
        data.creada
          ? `OT ${data.numero} creada con ${data.reclamos_count} reclamos`
          : `OT ${data.numero} actualizada (${data.reclamos_count} reclamos)`,
      );
      await loadPoiCounts(pois);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Error consolidando en OT');
    } finally {
      setConsolidatingId(null);
    }
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
      const linea = `${idx + 1}. #${r.id} — ${r.titulo} [${estadoLabel(r.estado)}] ${r.direccion || ''}`;
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

  // Cuando cambian los filtros principales, refit del mapa (no en cada cambio de viewMode)
  useEffect(() => {
    setFitSignal(s => s + 1);
  }, [filtroCategoria, filtroDependencia, filtroEstado, timePreset]);

  // En modo Puntos no bloqueamos por la carga de reclamos (el panel de POIs
  // tiene su propio loading). El spinner global es solo para el modo Reclamos.
  if (loading && !isPuntos) {
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

  const reclamosFilterPanel = (
    <MapaFiltrosPanel
      categoriasDisponibles={categoriasDisponibles}
      dependenciasDisponibles={dependenciasDisponibles}
      statusColors={ESTADO_COLORS_LISTA}
      statusLabels={estadoLabels}
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
      showPois={showPois}
      poiLayerEnabled={canUsePoi}
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
      onTogglePois={() => setShowPois((s) => !s)}
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

  // En modo Puntos el header no lleva el panel de filtros de reclamos: la
  // búsqueda/acciones de POIs viven en el panel lateral (MapaPuntosPanel).
  const filterPanel = isPuntos ? undefined : reclamosFilterPanel;

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
        <PageTitle>Mapa</PageTitle>

        {/* Toggle de modo — solo con módulo POI activo + rol admin/supervisor */}
        {canUsePoi && (
          <>
            <HeaderSeparator />
            <div
              className="inline-flex items-center gap-0.5 p-0.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: `${theme.textSecondary}10`, border: `1px solid ${theme.border}` }}
            >
              {([
                { key: 'reclamos' as MapMode, label: 'Reclamos', icon: <FileText className="h-3.5 w-3.5" /> },
                { key: 'puntos' as MapMode, label: 'Puntos', icon: <MapPinned className="h-3.5 w-3.5" /> },
              ]).map((opt) => {
                const active = mapMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setMapMode(opt.key)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all active:scale-95"
                    style={{
                      backgroundColor: active ? theme.primary : 'transparent',
                      color: active ? '#fff' : theme.textSecondary,
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {loadingMore && !isPuntos && (
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

      <PageHint pageId={isPuntos ? 'mapa-puntos' : 'mapa-reclamos'} />

      {/* ============================ MODO RECLAMOS ============================ */}
      {!isPuntos && (
        <>
      {/* KPIs canónicos arriba (mismo patrón que Reclamos/Trámites/Tesorería) */}
      {(() => {
        const c = conteosPorEstado;
        const recibidos = (c['recibido'] || 0) + (c['nuevo'] || 0) + (c['asignado'] || 0);
        const enCurso = (c['en_curso'] || 0) + (c['en_proceso'] || 0) + (c['pendiente_confirmacion'] || 0);
        const finalizados = (c['finalizado'] || 0) + (c['resuelto'] || 0);
        const total = reclamosFiltrados.length;
        const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
        const kpisSpec: KpiSpec[] = [
          {
            label: 'En mapa',
            value: total.toLocaleString('es-AR'),
            icon: FileText,
            color: theme.primary,
            footnote: `${reclamos.length} totales`,
            highlighted: true,
          },
          {
            label: 'Recibidos',
            value: recibidos.toLocaleString('es-AR'),
            icon: Inbox,
            color: estadoColor('recibido'),
            footnote: `${pct(recibidos).toFixed(1)}% del filtro`,
            pct: pct(recibidos),
          },
          {
            label: 'En Curso',
            value: enCurso.toLocaleString('es-AR'),
            icon: PlayCircle,
            color: estadoColor('en_curso'),
            footnote: `${pct(enCurso).toFixed(1)}% del filtro`,
            pct: pct(enCurso),
          },
          {
            label: 'Finalizados',
            value: finalizados.toLocaleString('es-AR'),
            icon: CheckCircle,
            color: estadoColor('finalizado'),
            footnote: `${pct(finalizados).toFixed(1)}% del filtro`,
            pct: pct(finalizados),
          },
        ];
        return <KpiRow kpis={kpisSpec} />;
      })()}

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

            {/* Capa opcional de Puntos de Interés (tenue) sobre el mapa de
                reclamos. Reutiliza pois ya cargados por cargarPois(); se dibuja
                antes que los pins para que los reclamos queden por encima. */}
            {canUsePoi && showPois &&
              pois.map((poi) => {
                const color = poi.tipo_color || theme.primary;
                return (
                  <Fragment key={`poi-layer-${poi.id}`}>
                    <Circle
                      center={[poi.latitud, poi.longitud]}
                      radius={poi.radio_metros}
                      interactive={false}
                      pathOptions={{
                        color,
                        weight: 1,
                        opacity: 0.35,
                        fillColor: color,
                        fillOpacity: poi.activo ? 0.06 : 0.03,
                        dashArray: poi.activo ? undefined : '6 4',
                      }}
                    />
                    <Marker
                      position={[poi.latitud, poi.longitud]}
                      icon={createPoiIcon(color, false, 14)}
                    >
                      <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                        <div className="font-medium text-sm">{poi.nombre}</div>
                        <div className="text-xs text-gray-500">
                          {poi.tipo_nombre || 'Sin tipo'} · {poi.radio_metros} m
                        </div>
                      </Tooltip>
                    </Marker>
                  </Fragment>
                );
              })}

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
                  icon={createPinIcon(estadoColor(r.estado))}
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
                className="p-1 rounded transition-colors"
                style={{ color: theme.textSecondary }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.backgroundSecondary; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
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
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] px-4 py-2 rounded-full text-xs font-medium shadow-lg pointer-events-none flex items-center gap-1.5"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            <Pencil size={12} /> Click + arrastrar para definir el área
          </div>
        )}
      </div>

      {/* === Sección de métricas debajo del mapa === */}
      <MapaStats
        reclamos={reclamosFiltrados}
        totalUniverso={reclamos.length}
        statusColors={ESTADO_COLORS_LISTA}
        statusLabels={estadoLabels}
        onZonaClick={c => focusOnZona(c.centerLat, c.centerLng)}
      />
        </>
      )}

      {/* ============================= MODO PUNTOS ============================= */}
      {isPuntos && (
        <div className="flex flex-col lg:flex-row gap-4">
          <div
            className="relative rounded-lg shadow overflow-hidden flex-1 min-w-0"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div style={{ height: '600px' }}>
              <MapContainer
                center={getPoiCenter()}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer attribution="&copy; OSM &copy; CARTO" url={tileUrl} />

                <FitBoundsToLatLngs points={poiPoints} signal={poiFitSignal} />
                <MapController target={mapTarget} />
                <PoiClickHandler onPick={abrirNuevoPoi} />

                {pois.map((poi) => {
                  const color = poi.tipo_color || theme.primary;
                  return (
                    <Fragment key={`poi-${poi.id}-${poiRevision}`}>
                      <Circle
                        center={[poi.latitud, poi.longitud]}
                        radius={poi.radio_metros}
                        interactive={false}
                        pathOptions={{
                          color,
                          weight: 2,
                          opacity: 0.7,
                          fillColor: color,
                          fillOpacity: poi.activo ? 0.12 : 0.05,
                          dashArray: poi.activo ? undefined : '6 4',
                        }}
                      />
                      <Marker
                        position={[poi.latitud, poi.longitud]}
                        draggable
                        icon={createPoiIcon(color, poiSelectedId === poi.id)}
                        eventHandlers={{
                          click: () => abrirEditPoi(poi),
                          dragend: (e) => {
                            const ll = (e.target as L.Marker).getLatLng();
                            setPoiDragPending({ poi, lat: ll.lat, lng: ll.lng });
                          },
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -14]} permanent={false}>
                          <div className="font-medium text-sm">{poi.nombre}</div>
                          <div className="text-xs text-gray-500">
                            {poi.tipo_nombre || 'Sin tipo'} · {poi.radio_metros} m
                          </div>
                        </Tooltip>
                      </Marker>
                    </Fragment>
                  );
                })}
              </MapContainer>
            </div>

            {/* Hint flotante para crear */}
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] px-4 py-2 rounded-full text-xs font-medium shadow-lg pointer-events-none flex items-center gap-1.5"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
            >
              <MapPin size={12} /> Click en el mapa para crear un punto · arrastrá para mover
            </div>
          </div>

          <MapaPuntosPanel
            pois={pois}
            loading={poiLoading}
            search={poiSearch}
            onSearchChange={setPoiSearch}
            counts={poiCounts}
            countsLoading={poiCountsLoading}
            selectedId={poiSelectedId}
            onSelect={seleccionarPoi}
            onConsolidar={consolidarPoi}
            consolidatingId={consolidatingId}
            onDelete={(poi) => setPoiToDelete(poi)}
            onRecalcular={recalcularZonas}
            recalculando={recalculando}
          />
        </div>
      )}

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
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: theme.textSecondary }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.backgroundSecondary; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-3 py-1 text-sm font-medium rounded-full text-white"
                      style={{ backgroundColor: estadoColor(selected.estado) }}
                    >
                      {estadoLabel(selected.estado)}
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

                  <button
                    onClick={() => {
                      const id = selected.id;
                      closeSidebar();
                      navigate(`/gestion/reclamos?abrir=${id}`);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Settings className="h-5 w-5" />
                    Gestionar reclamo
                  </button>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}

      {/* Sheet de POI (crear / editar) */}
      <Sheet
        open={poiSheetOpen}
        onClose={() => setPoiSheetOpen(false)}
        title={poiEditing ? 'Editar punto de interés' : 'Nuevo punto de interés'}
        description={
          poiEditing
            ? poiEditing.tipo_nombre || undefined
            : 'Definí su zona de influencia (radio)'
        }
        stickyFooter={
          <div className="flex items-center justify-between gap-2">
            {poiEditing ? (
              <button
                onClick={() => {
                  const target = poiEditing;
                  setPoiSheetOpen(false);
                  setPoiToDelete(target);
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-1.5"
                style={{ backgroundColor: '#ef444415', color: '#ef4444' }}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setPoiSheetOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarPoi}
                disabled={poiSaving}
                className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {poiSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={poiForm.nombre}
              onChange={(e) => setPoiForm({ ...poiForm, nombre: e.target.value })}
              placeholder="Ej: Hospital Central, Escuela N°3, Plaza San Martín..."
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Tipo <span className="text-red-500">*</span>
            </label>
            <ModernSelect
              value={poiForm.tipo_id == null ? '' : String(poiForm.tipo_id)}
              onChange={handlePoiTipoChange}
              placeholder="Elegí un tipo"
              searchable={tipos.length > 6}
              options={tipos.map((t) => ({
                value: String(t.id),
                label: t.nombre,
                color: t.color || undefined,
              }))}
            />
            {tipos.length === 0 && (
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                No hay tipos de punto. Creálos en Configuración → Tipos de Punto.
              </p>
            )}
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Dirección <span style={{ color: theme.textSecondary }}>(opcional)</span>
            </label>
            <input
              type="text"
              value={poiForm.direccion}
              onChange={(e) => setPoiForm({ ...poiForm, direccion: e.target.value })}
              placeholder="Ej: Av. Siempre Viva 742"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>

          {/* Radio */}
          <div>
            <Slider
              label="Radio de zona (m)"
              value={poiForm.radio_metros}
              onChange={(v) => setPoiForm({ ...poiForm, radio_metros: v })}
              min={100}
              max={10000}
              step={100}
            />
          </div>

          {/* Coordenadas (read-only; se mueven por drag) */}
          <div
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <Navigation className="h-5 w-5 flex-shrink-0" style={{ color: theme.primary }} />
            <div className="min-w-0">
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Coordenadas {poiEditing ? '(arrastrá el marker en el mapa para mover)' : ''}
              </p>
              <p className="text-sm font-mono" style={{ color: theme.text }}>
                {poiForm.latitud.toFixed(6)}, {poiForm.longitud.toFixed(6)}
              </p>
            </div>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: theme.text }}>
              Activo
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={poiForm.activo}
              onClick={() => setPoiForm({ ...poiForm, activo: !poiForm.activo })}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ backgroundColor: poiForm.activo ? theme.primary : theme.border }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: poiForm.activo ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
              Notas <span style={{ color: theme.textSecondary }}>(opcional)</span>
            </label>
            <textarea
              rows={3}
              value={poiForm.notas}
              onChange={(e) => setPoiForm({ ...poiForm, notas: e.target.value })}
              placeholder="Contexto de la zona, referencias, etc."
              className="w-full px-3 py-2 rounded-xl text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}`, color: theme.text }}
            />
          </div>
        </div>
      </Sheet>

      {/* Confirmar borrado de POI */}
      <ConfirmModal
        isOpen={!!poiToDelete}
        onClose={() => setPoiToDelete(null)}
        onConfirm={eliminarPoi}
        title="Eliminar punto de interés"
        message={`¿Eliminar "${poiToDelete?.nombre}"? Los reclamos dejarán de asociarse a esta zona.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />

      {/* Confirmar movimiento (drag del marker) */}
      <ConfirmModal
        isOpen={!!poiDragPending}
        onClose={cancelarMovimiento}
        onConfirm={confirmarMovimiento}
        title="Mover punto"
        message={
          poiDragPending
            ? `¿Reubicar "${poiDragPending.poi.nombre}" a las nuevas coordenadas?`
            : ''
        }
        confirmText="Mover"
        cancelText="Cancelar"
        variant="warning"
      />
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
          <p className="text-xl font-bold" style={{ color: estadoColor('finalizado') }}>{resueltos}</p>
          <p className="text-[10px]" style={{ color: theme.textSecondary }}>Resueltos</p>
        </div>
        <div className="text-center p-2 rounded-lg" style={{ backgroundColor: theme.background }}>
          <p className="text-xl font-bold" style={{ color: estadoColor('recibido') }}>{abiertos}</p>
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
