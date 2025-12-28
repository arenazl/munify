import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

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

// Componente para ajustar el zoom a los datos
function FitBoundsToData({ data }: { data: HeatmapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (data.length === 0) return;

    // Timeout para asegurar que el mapa esté listo
    const timer = setTimeout(() => {
      // Filtrar solo puntos de Merlo (dentro de un rango razonable)
      const merloData = data.filter(
        (p) => p.lat > -34.75 && p.lat < -34.60 && p.lng > -58.80 && p.lng < -58.65
      );

      console.log('Puntos en Merlo:', merloData.length, 'de', data.length);

      map.invalidateSize();

      if (merloData.length > 0) {
        // Si hay puntos en Merlo, centrar ahí
        const latlngs = merloData.map((p) => L.latLng(p.lat, p.lng));
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13 });
      } else {
        // Fallback: centro de Merlo
        map.setView([-34.6637, -58.7276], 13, { animate: false });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [data, map]);

  return null;
}

// Componente interno que maneja la capa de calor
function HeatLayer({ data }: { data: HeatmapPoint[] }) {
  const map = useMap();
  const heatLayerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!data || data.length === 0) return;

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

    // Crear capa de calor con gradiente personalizado (sin blur)
    const heat = L.heatLayer(heatData, {
      radius: 15,
      blur: 0,
      maxZoom: 17,
      max: 2,
      minOpacity: 0.5,
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

export default function HeatmapWidget({
  data,
  height = '280px',
  center,
  zoom = 13,
  showMarkers = true,
  showLegend = true,
}: HeatmapWidgetProps) {
  // Filtrar puntos válidos de Argentina
  const validData = useMemo(() => {
    return data.filter(
      (p) => p.lat < -30 && p.lat > -56 && p.lng < -53 && p.lng > -74
    );
  }, [data]);

  // Calcular centro basado en los datos válidos
  const mapCenter = useMemo<[number, number]>(() => {
    if (center) return center;
    if (validData.length === 0) return [-34.6637, -58.7276]; // Merlo por defecto

    const avgLat = validData.reduce((sum, p) => sum + p.lat, 0) / validData.length;
    const avgLng = validData.reduce((sum, p) => sum + p.lng, 0) / validData.length;
    return [avgLat, avgLng];
  }, [validData, center]);

  // Calcular estadísticas por categoría (solo puntos válidos)
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    validData.forEach((point) => {
      const cat = point.categoria || 'Otros';
      stats[cat] = (stats[cat] || 0) + 1;
    });
    // Ordenar por cantidad descendente
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6); // Top 6 categorías
  }, [validData]);

  // Calcular bounds para ajustar el zoom al contenido (debe estar antes del return condicional)
  const bounds = useMemo(() => {
    if (validData.length === 0) return null;
    return L.latLngBounds(validData.map((p) => [p.lat, p.lng]));
  }, [validData]);

  // Key para forzar re-render del mapa cuando cambian los datos
  const mapKey = `map-${validData.length}-${mapCenter[0].toFixed(4)}-${mapCenter[1].toFixed(4)}`;

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

  return (
    <div>
      <div className="rounded-lg overflow-hidden" style={{ height }}>
        <MapContainer
          key={mapKey}
          center={mapCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          {/* Usar tiles oscuros para mejor contraste */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OSM &copy; CARTO'
          />
          <FitBoundsToData data={validData} />
          <HeatLayer data={validData} />
          {showMarkers && <CategoryMarkers data={validData} />}
        </MapContainer>
      </div>

      {/* Leyenda de categorías */}
      {showLegend && categoryStats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {categoryStats.map(([categoria, cantidad]) => (
            <div key={categoria} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getCategoryColor(categoria) }}
              />
              <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={categoria}>
                {categoria}
              </span>
              <span className="text-[10px] font-medium text-slate-300">
                ({cantidad})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
