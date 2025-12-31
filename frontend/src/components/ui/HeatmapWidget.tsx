import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { X, Maximize2, ZoomIn, ZoomOut, Home } from 'lucide-react';

// Declarar el tipo para leaflet.heat
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

interface HeatmapPoint {
  lat: number;
  lng: number;
  intensidad: number;
  estado?: string;
  categoria?: string;
}

interface HeatmapWidgetProps {
  data: HeatmapPoint[];
  height?: string;
  center?: [number, number];
  zoom?: number;
  showMarkers?: boolean;
  showLegend?: boolean;
  expandable?: boolean;
  title?: string;
  loading?: boolean;
}

// Colores por categoría (usando paleta distinguible)
const CATEGORY_COLORS: Record<string, string> = {
  'Alumbrado Publico': '#f59e0b',
  'Alumbrado Público': '#f59e0b',
  'Baches y Calles': '#ef4444',
  'Desagues Pluviales': '#3b82f6',
  'Desagües Pluviales': '#3b82f6',
  'Espacios Verdes': '#22c55e',
  'Senalizacion Vial': '#8b5cf6',
  'Señalización Vial': '#8b5cf6',
  'Basura y Limpieza': '#06b6d4',
  'Agua y Cloacas': '#0ea5e9',
  'Transito': '#f97316',
  'Tránsito': '#f97316',
  'Otros': '#6b7280',
};

const DEFAULT_COLOR = '#ec4899'; // Rosa para categorías no mapeadas

function getCategoryColor(categoria: string): string {
  // Buscar coincidencia exacta o parcial
  if (CATEGORY_COLORS[categoria]) {
    return CATEGORY_COLORS[categoria];
  }
  // Buscar coincidencia parcial
  const key = Object.keys(CATEGORY_COLORS).find((k) =>
    categoria.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(categoria.toLowerCase())
  );
  return key ? CATEGORY_COLORS[key] : DEFAULT_COLOR;
}

// Coordenadas de Merlo, Buenos Aires (centro del partido)
const MERLO_CENTER: [number, number] = [-34.6637, -58.7276];
const MERLO_BOUNDS = {
  minLat: -34.80,  // Sur de Merlo
  maxLat: -34.55,  // Norte de Merlo
  minLng: -58.85,  // Oeste de Merlo
  maxLng: -58.60,  // Este de Merlo
};

// Componente para ajustar el zoom a los datos
function FitBoundsToData({ data, onReady }: { data: HeatmapPoint[]; onReady?: () => void }) {
  const map = useMap();

  useEffect(() => {
    if (data.length === 0) {
      onReady?.();
      return;
    }

    // Timeout para asegurar que el mapa esté listo
    const timer = setTimeout(() => {
      map.invalidateSize();

      if (data.length > 0) {
        // Calcular el centroide de los datos
        const avgLat = data.reduce((sum, p) => sum + p.lat, 0) / data.length;
        const avgLng = data.reduce((sum, p) => sum + p.lng, 0) / data.length;

        // Calcular desviación estándar para determinar dispersión
        const latVariance = data.reduce((sum, p) => sum + Math.pow(p.lat - avgLat, 2), 0) / data.length;
        const lngVariance = data.reduce((sum, p) => sum + Math.pow(p.lng - avgLng, 2), 0) / data.length;
        const latStdDev = Math.sqrt(latVariance);
        const lngStdDev = Math.sqrt(lngVariance);

        // Si los datos están muy concentrados (baja desviación), usar zoom fijo en el centroide
        if (latStdDev < 0.02 && lngStdDev < 0.02) {
          // Datos concentrados - centrar en el promedio con zoom 13
          map.setView([avgLat, avgLng], 13, { animate: false });
        } else {
          // Datos dispersos - crear bounds basados en percentiles para ignorar outliers
          const sortedLats = [...data].map(p => p.lat).sort((a, b) => a - b);
          const sortedLngs = [...data].map(p => p.lng).sort((a, b) => a - b);

          // Usar percentiles 5 y 95 para ignorar outliers
          const p5 = Math.floor(data.length * 0.05);
          const p95 = Math.floor(data.length * 0.95);

          const bounds = L.latLngBounds(
            [sortedLats[p5], sortedLngs[p5]],
            [sortedLats[p95], sortedLngs[p95]]
          );

          // fitBounds con maxZoom para no acercarse demasiado
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
        }
      } else {
        // Fallback: centro de Merlo
        map.setView(MERLO_CENTER, 13, { animate: false });
      }

      // Notificar que el mapa está listo después de un pequeño delay adicional
      setTimeout(() => onReady?.(), 150);
    }, 100);

    return () => clearTimeout(timer);
  }, [data, map, onReady]);

  return null;
}

// Componente interno que maneja la capa de calor
function HeatLayer({ data }: { data: HeatmapPoint[] }) {
  const map = useMap();
  const heatLayerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Esperar a que el mapa tenga tamaño válido
    const mapSize = map.getSize();
    if (!mapSize || mapSize.x === 0 || mapSize.y === 0) {
      // Reintentar después de un pequeño delay
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }

    // Remover capa anterior si existe
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    // Filtrar puntos válidos (coordenadas en Argentina aproximadamente)
    const validData = data.filter(
      (p) => p.lat < -30 && p.lat > -56 && p.lng < -53 && p.lng > -74
    );

    if (validData.length === 0) {
      console.warn('No hay puntos válidos en Argentina');
      return;
    }

    // Convertir datos al formato de leaflet.heat: [lat, lng, intensidad]
    const heatData: [number, number, number][] = validData.map((point) => [
      point.lat,
      point.lng,
      point.intensidad || 1,
    ]);

    // Crear capa de calor con gradiente personalizado (muy transparente para ver etiquetas)
    try {
      const heat = L.heatLayer(heatData, {
        radius: 8,
        blur: 0,
        maxZoom: 17,
        max: 3,
        minOpacity: 0.15,
        gradient: {
          0.0: '#3b82f6',
          0.25: '#22d3ee',
          0.5: '#22c55e',
          0.75: '#f59e0b',
          1.0: '#ef4444',
        },
      });

      heat.addTo(map);
      heatLayerRef.current = heat;
    } catch (error) {
      console.warn('Error creando capa de calor:', error);
    }

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
      }
    };
  }, [data, map]);

  return null;
}

// Componente para mostrar marcadores por categoría
function CategoryMarkers({ data }: { data: HeatmapPoint[] }) {
  // Filtrar puntos válidos y limitar a 200 marcadores para performance
  const limitedData = useMemo(() => {
    // Filtrar solo puntos en Argentina
    const validData = data.filter(
      (p) => p.lat < -30 && p.lat > -56 && p.lng < -53 && p.lng > -74
    );
    if (validData.length <= 200) return validData;
    // Tomar muestra distribuida
    const step = Math.ceil(validData.length / 200);
    return validData.filter((_, i) => i % step === 0);
  }, [data]);

  return (
    <>
      {limitedData.map((point, index) => (
        <CircleMarker
          key={`marker-${index}`}
          center={[point.lat, point.lng]}
          radius={6}
          pathOptions={{
            fillColor: getCategoryColor(point.categoria || 'Otros'),
            color: '#ffffff',
            weight: 1,
            opacity: 0.9,
            fillOpacity: 0.7,
          }}
        >
          <Tooltip direction="top" offset={[0, -5]}>
            <div className="text-xs">
              <p className="font-medium">{point.categoria || 'Sin categoría'}</p>
              <p className="text-gray-500 capitalize">{point.estado?.replace('_', ' ') || 'nuevo'}</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

// Componente de controles de zoom personalizados (botonera completa)
function ZoomControls({ onReset }: { onReset?: () => void }) {
  const map = useMap();

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else {
      map.setZoom(13);
    }
  };

  return (
    <div className="absolute bottom-6 right-4 z-[1000] flex flex-col gap-2">
      <button
        onClick={() => map.zoomIn()}
        className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center text-white transition-colors shadow-lg border border-slate-600"
        aria-label="Acercar"
      >
        <ZoomIn className="h-5 w-5" />
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center text-white transition-colors shadow-lg border border-slate-600"
        aria-label="Alejar"
      >
        <ZoomOut className="h-5 w-5" />
      </button>
      <button
        onClick={handleReset}
        className="w-12 h-12 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center text-white transition-colors shadow-lg border border-slate-600"
        aria-label="Restablecer vista"
      >
        <Home className="h-5 w-5" />
      </button>
    </div>
  );
}

// Categorías únicas para los filtros (sin duplicados con/sin tildes)
const UNIQUE_CATEGORIES = [
  { key: 'alumbrado', label: 'Alumbrado', color: '#f59e0b' },
  { key: 'baches', label: 'Baches y Calles', color: '#ef4444' },
  { key: 'desagues', label: 'Desagües', color: '#3b82f6' },
  { key: 'espacios', label: 'Espacios Verdes', color: '#22c55e' },
  { key: 'senalizacion', label: 'Señalización', color: '#8b5cf6' },
  { key: 'basura', label: 'Basura', color: '#06b6d4' },
  { key: 'agua', label: 'Agua y Cloacas', color: '#0ea5e9' },
  { key: 'transito', label: 'Tránsito', color: '#f97316' },
  { key: 'otros', label: 'Otros', color: '#6b7280' },
];

// Mapear categoría real a key de filtro
function getCategoryKey(categoria: string): string {
  const cat = categoria.toLowerCase();
  if (cat.includes('alumbrado')) return 'alumbrado';
  if (cat.includes('bache') || cat.includes('calle')) return 'baches';
  if (cat.includes('desag') || cat.includes('pluvial')) return 'desagues';
  if (cat.includes('espacio') || cat.includes('verde')) return 'espacios';
  if (cat.includes('señal') || cat.includes('senal') || cat.includes('vial')) return 'senalizacion';
  if (cat.includes('basura') || cat.includes('limpieza')) return 'basura';
  if (cat.includes('agua') || cat.includes('cloaca')) return 'agua';
  if (cat.includes('transit')) return 'transito';
  return 'otros';
}

export default function HeatmapWidget({
  data,
  height = '280px',
  center,
  zoom = 13,
  showMarkers = true,
  showLegend = true,
  expandable = true,
  title = 'Mapa de Calor',
  loading = false,
}: HeatmapWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Estado de filtros - todas las categorías activas por defecto
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(UNIQUE_CATEGORIES.map(c => c.key))
  );
  // Contador para forzar recreación del mapa
  const [mapVersion, setMapVersion] = useState(0);
  // Estado de loading cuando se cambia filtro (guarda el key de la categoría cargando, o 'all' para todas)
  const [filterLoading, setFilterLoading] = useState<string | null>(null);
  // Estado para detectar si el mapa está renderizando
  const [mapRendering, setMapRendering] = useState(false);

  // Seleccionar solo UNA categoría (filtro exclusivo)
  const selectFilter = useCallback((key: string) => {
    setActiveFilters(prev => {
      // Si ya está seleccionada solo esta, no hacer nada
      if (prev.size === 1 && prev.has(key)) return prev;
      // Seleccionar solo esta categoría
      return new Set([key]);
    });
    // Mostrar loading mientras el mapa se re-renderiza
    setFilterLoading(key);
    setMapRendering(true);
    // Incrementar versión para forzar recreación del mapa
    setMapVersion(v => v + 1);
  }, []);

  // Mostrar todas las categorías
  const showAll = useCallback(() => {
    setActiveFilters(new Set(UNIQUE_CATEGORIES.map(c => c.key)));
    // Mostrar loading mientras el mapa se re-renderiza
    setFilterLoading('all');
    setMapRendering(true);
    // Incrementar versión para forzar recreación del mapa
    setMapVersion(v => v + 1);
  }, []);

  // Callback cuando el mapa termina de renderizar
  const handleMapReady = useCallback(() => {
    setMapRendering(false);
    setFilterLoading(null);
  }, []);

  // Cerrar con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener('keydown', handleKeyDown);
      // Bloquear scroll del body
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  // Filtrar puntos válidos de Argentina
  const validData = useMemo(() => {
    return data.filter(
      (p) => p.lat < -30 && p.lat > -56 && p.lng < -53 && p.lng > -74
    );
  }, [data]);

  // Filtrar por categorías activas
  const filteredData = useMemo(() => {
    return validData.filter(p => {
      const key = getCategoryKey(p.categoria || 'Otros');
      return activeFilters.has(key);
    });
  }, [validData, activeFilters]);

  // Calcular centro basado en los datos válidos
  const mapCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    if (validData.length === 0) return MERLO_CENTER; // Merlo por defecto

    const avgLat = validData.reduce((sum, p) => sum + p.lat, 0) / validData.length;
    const avgLng = validData.reduce((sum, p) => sum + p.lng, 0) / validData.length;
    return [avgLat, avgLng];
  }, [validData, center]);

  // Calcular estadísticas por categoría usando las keys únicas
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    validData.forEach((point) => {
      const key = getCategoryKey(point.categoria || 'Otros');
      stats[key] = (stats[key] || 0) + 1;
    });
    // Retornar solo categorías que tienen datos
    return UNIQUE_CATEGORIES
      .filter(c => stats[c.key] > 0)
      .map(c => ({ ...c, count: stats[c.key] || 0 }));
  }, [validData]);

  // Calcular bounds para ajustar el zoom al contenido (debe estar antes del return condicional)
  const bounds = useMemo(() => {
    if (validData.length === 0) return null;
    return L.latLngBounds(validData.map((p) => [p.lat, p.lng]));
  }, [validData]);

  // Key que cambia cuando cambian los filtros (fuerza recrear el mapa completo)
  const filterKey = useMemo(() => Array.from(activeFilters).sort().join('-'), [activeFilters]);

  // Key del mapa incluye filtros para forzar recreación cuando cambian
  const mapKey = `map-${mapCenter[0].toFixed(4)}-${mapCenter[1].toFixed(4)}-${filterKey}`;

  // Skeleton mientras carga
  if (loading) {
    return (
      <div
        className="rounded-lg overflow-hidden animate-pulse"
        style={{ height }}
      >
        <div className="w-full h-full bg-slate-800/50 relative">
          {/* Simular mapa con elementos skeleton */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-slate-600/50 animate-ping" style={{ animationDuration: '2s' }} />
              </div>
              <div className="h-3 w-32 bg-slate-700/50 rounded" />
              <div className="h-2 w-24 bg-slate-700/30 rounded" />
            </div>
          </div>
          {/* Líneas simulando calles */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/4 left-0 right-0 h-0.5 bg-slate-600" />
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-600" />
            <div className="absolute top-3/4 left-0 right-0 h-0.5 bg-slate-600" />
            <div className="absolute left-1/4 top-0 bottom-0 w-0.5 bg-slate-600" />
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600" />
            <div className="absolute left-3/4 top-0 bottom-0 w-0.5 bg-slate-600" />
          </div>
          {/* Puntos de calor simulados */}
          <div className="absolute top-1/3 left-1/4 w-16 h-16 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/10 blur-xl" />
          <div className="absolute top-1/2 left-1/2 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500/15 to-orange-500/10 blur-xl" />
          <div className="absolute bottom-1/3 right-1/4 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/10 blur-xl" />
        </div>
        {/* Skeleton de filtros */}
        {showLegend && (
          <div className="flex gap-2 mt-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 w-16 bg-slate-700/30 rounded-lg" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!data || data.length === 0 || validData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-slate-800/50"
        style={{ height }}
      >
        <p className="text-slate-400 text-sm">Sin datos de ubicacion disponibles</p>
      </div>
    );
  }

  // Renderizar mapa - la key con mapVersion fuerza unmount/remount completo
  const renderMap = (isFullscreen: boolean) => (
    <div
      key={`map-${mapVersion}-${isFullscreen ? 'full' : 'widget'}`}
      style={{ height: '100%', width: '100%' }}
    >
      <MapContainer
        center={mapCenter}
        zoom={isFullscreen ? 14 : 13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OSM &copy; CARTO'
        />
        <FitBoundsToData data={filteredData} onReady={handleMapReady} />
        <HeatLayer data={filteredData} />
        {showMarkers && <CategoryMarkers data={filteredData} />}
        {isFullscreen && <ZoomControls />}
      </MapContainer>
    </div>
  );

  // Botonera de filtros por categoría (selección exclusiva)
  const CategoryFilters = ({ className = '', compact = false }: { className?: string; compact?: boolean }) => {
    const allSelected = activeFilters.size === UNIQUE_CATEGORIES.length;
    // Loading en "Todos": cuando se selecciona all, o cuando loading inicial + all seleccionado
    const isLoadingAll = filterLoading === 'all' || (loading && allSelected);

    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {/* Estilos para la animación de loading */}
        <style>{`
          @keyframes loading-slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          .animate-loading-slide {
            animation: loading-slide 0.6s ease-in-out infinite;
          }
          @keyframes pulse-fade {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .animate-pulse-fade {
            animation: pulse-fade 0.8s ease-in-out infinite;
          }
        `}</style>
        {/* Botón "Todos" */}
        <button
          onClick={(e) => { e.stopPropagation(); showAll(); }}
          className={`relative px-2 py-1 rounded-lg text-[10px] font-medium transition-all border overflow-hidden ${
            allSelected
              ? 'bg-white/20 border-white/30 text-white'
              : 'bg-slate-800/50 border-slate-600/50 text-slate-400 hover:bg-slate-700/50'
          }`}
        >
          <span className={isLoadingAll ? 'animate-pulse-fade' : ''}>Todos</span>
        </button>
        {categoryStats.map((cat) => {
          // Está seleccionada si es la única activa
          const isSelected = activeFilters.size === 1 && activeFilters.has(cat.key);
          // Loading: cuando se selecciona esta categoría, o cuando loading inicial + esta seleccionada
          const isLoading = filterLoading === cat.key || (loading && isSelected);
          return (
            <button
              key={cat.key}
              onClick={(e) => { e.stopPropagation(); selectFilter(cat.key); }}
              className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all border overflow-hidden ${
                isSelected
                  ? 'border-white/30 ring-1 ring-white/20'
                  : 'border-transparent hover:border-white/10'
              }`}
              style={{
                backgroundColor: isSelected ? `${cat.color}40` : `${cat.color}15`,
                borderColor: isSelected ? cat.color : undefined,
              }}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${isLoading ? 'animate-pulse-fade' : ''}`}
                style={{ backgroundColor: cat.color }}
              />
              {!compact && (
                <span
                  className={isLoading ? 'animate-pulse-fade' : ''}
                  style={{ color: isSelected ? '#fff' : cat.color }}
                >
                  {cat.label}
                </span>
              )}
              <span className={`${isSelected ? 'text-white' : 'text-slate-400'} ${isLoading ? 'animate-pulse-fade' : ''}`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Vista normal (widget) */}
      <div>
        <div
          className={`rounded-lg overflow-hidden relative ${expandable ? 'cursor-pointer' : ''}`}
          style={{ height }}
          onClick={expandable ? () => setIsExpanded(true) : undefined}
          role={expandable ? 'button' : undefined}
          tabIndex={expandable ? 0 : undefined}
          onKeyDown={expandable ? (e) => e.key === 'Enter' && setIsExpanded(true) : undefined}
          aria-label={expandable ? 'Expandir mapa' : undefined}
        >
          {renderMap(false)}
          {/* Overlay con icono de expandir */}
          {expandable && (
            <div className="absolute inset-0 bg-transparent hover:bg-black/10 transition-colors flex items-center justify-center group pointer-events-none">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 rounded-xl px-3 py-2 flex items-center gap-2 pointer-events-none">
                <Maximize2 className="h-4 w-4 text-white" />
                <span className="text-white text-xs font-medium">Click para expandir</span>
              </div>
            </div>
          )}
        </div>

        {/* Botonera de filtros por categoría */}
        {showLegend && categoryStats.length > 0 && (
          <CategoryFilters className="mt-3" />
        )}
      </div>

      {/* Modal fullscreen - usando portal para renderizar fuera del contenedor */}
      {isExpanded && createPortal(
        <div
          className="fixed inset-0 flex flex-col"
          style={{
            zIndex: 99999,
            backgroundColor: '#0f172a',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0"
            style={{ backgroundColor: '#0f172a' }}
          >
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mapa fullscreen */}
          <div className="flex-1 relative min-h-0">
            {renderMap(true)}
          </div>

          {/* Footer con filtros */}
          {showLegend && categoryStats.length > 0 && (
            <div
              className="p-4 border-t border-slate-700 flex-shrink-0"
              style={{ backgroundColor: '#0f172a' }}
            >
              <CategoryFilters />
              <p className="text-xs text-slate-500 mt-2">
                {filteredData.length} de {validData.length} puntos · Presiona ESC para cerrar
              </p>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
