import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { useTheme } from '../../contexts/ThemeContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// URLs de tiles para tema claro y oscuro
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

// Fix para el icono de Leaflet en Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapPickerProps {
  value?: { lat: number; lng: number } | null;
  onChange?: (coords: { lat: number; lng: number }) => void;
  height?: string;
  readOnly?: boolean;
  zoom?: number;
  center?: { lat: number; lng: number };
}

// Componente interno para manejar clicks en el mapa
function MapClickHandler({ onLocationSelect }: { onLocationSelect: (coords: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Componente para centrar el mapa cuando cambian las coordenadas
function MapCenterUpdater({ coords }: { coords: { lat: number; lng: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (coords) {
      map.setView([coords.lat, coords.lng], 15);
    }
  }, [coords, map]);

  return null;
}

// Componente para forzar resize cuando el mapa se hace visible
function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    // Forzar invalidateSize después de un breve delay para asegurar que el contenedor está visible
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    // También escuchar resize de la ventana
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

export function MapPicker({
  value,
  onChange,
  height = '300px',
  readOnly = false,
  zoom = 13,
  center = { lat: -34.6037, lng: -58.3816 }, // Buenos Aires por defecto
}: MapPickerProps) {
  const { theme, currentPresetId } = useTheme();
  // Detectar si el tema es claro (solo sand y arctic son claros)
  const isDarkTheme = currentPresetId !== 'sand' && currentPresetId !== 'arctic';
  const tileUrl = isDarkTheme ? TILE_URLS.dark : TILE_URLS.light;

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(value || null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (value) {
      setPosition(value);
    }
  }, [value]);

  const handleLocationSelect = (coords: { lat: number; lng: number }) => {
    if (readOnly) return;
    setPosition(coords);
    onChange?.(coords);
  };

  // Obtener ubicación del usuario
  const handleGetCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(coords);
          onChange?.(coords);
          mapRef.current?.setView([coords.lat, coords.lng], 15);
        },
        (err) => {
          console.error('Error obteniendo ubicación:', err);
        }
      );
    }
  };

  const mapCenter = position || center;

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, border: `1px solid ${theme.border}` }}>
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; OSM &copy; CARTO'
          url={tileUrl}
        />
        <MapResizeHandler />
        <MapCenterUpdater coords={value || null} />
        {!readOnly && <MapClickHandler onLocationSelect={handleLocationSelect} />}
        {position && <Marker position={[position.lat, position.lng]} />}
      </MapContainer>

      {/* Botón de ubicación actual */}
      {!readOnly && (
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          className="absolute bottom-3 right-3 z-[1000] p-2 rounded-lg shadow-lg transition-all hover:scale-105"
          style={{ backgroundColor: theme.card, color: theme.text }}
          title="Usar mi ubicación"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}

      {/* Coordenadas seleccionadas */}
      {position && (
        <div
          className="absolute bottom-3 left-3 z-[1000] px-2 py-1 rounded text-xs"
          style={{ backgroundColor: `${theme.card}ee`, color: theme.textSecondary }}
        >
          {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
        </div>
      )}
    </div>
  );
}

// Componente para mostrar múltiples marcadores (ej: mapa de reclamos)
interface MapViewProps {
  markers?: Array<{
    id: number;
    lat: number;
    lng: number;
    title?: string;
    color?: string;
  }>;
  height?: string;
  zoom?: number;
  center?: { lat: number; lng: number };
  onMarkerClick?: (id: number) => void;
}

export function MapView({
  markers = [],
  height = '400px',
  zoom = 12,
  center = { lat: -34.6037, lng: -58.3816 },
  onMarkerClick,
}: MapViewProps) {
  const { theme, currentPresetId } = useTheme();
  // Detectar si el tema es claro (solo sand y arctic son claros)
  const isDarkTheme = currentPresetId !== 'sand' && currentPresetId !== 'arctic';
  const tileUrl = isDarkTheme ? TILE_URLS.dark : TILE_URLS.light;

  // Calcular centro basado en marcadores si existen
  const mapCenter = markers.length > 0
    ? {
        lat: markers.reduce((sum, m) => sum + m.lat, 0) / markers.length,
        lng: markers.reduce((sum, m) => sum + m.lng, 0) / markers.length,
      }
    : center;

  return (
    <div className="rounded-lg overflow-hidden" style={{ height, border: `1px solid ${theme.border}` }}>
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OSM &copy; CARTO'
          url={tileUrl}
        />
        <MapResizeHandler />
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            eventHandlers={{
              click: () => onMarkerClick?.(marker.id),
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
