import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { useTheme } from '../../contexts/ThemeContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Proveedores de tiles disponibles. Toggle visible en la UI para probar
// y comparar cuál se ve mejor en esta app. Los dos son gratis y sin API key.
// - osm: maximo detalle (calles, comercios, POIs), colores fuertes.
// - stadia: equilibrio detalle + estetica limpia (tier free con rate limit).
type TileProviderId = 'osm' | 'stadia';

const TILE_PROVIDERS: Record<TileProviderId, {
  label: string;
  url: string;
  attribution: string;
}> = {
  osm: {
    label: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  stadia: {
    label: 'Stadia',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Stadia Maps &copy; OpenStreetMap',
  },
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

/**
 * Mapa interactivo (Leaflet + tiles Voyager de CartoCDN) para que el user
 * elija una ubicacion clickeando, o para mostrar una coordenada de solo
 * lectura. Click en el mapa dispara `onChange({lat, lng})`; el marker
 * se centra automaticamente cuando cambia `value` desde afuera (util
 * cuando el usuario eligio una direccion en `DireccionAutocomplete` y
 * queremos sincronizar el mapa).
 *
 * Para inputs de direccion donde el primer paso es texto y el segundo
 * es ajustar en el mapa, combinar con `DireccionAutocomplete`: ese
 * resuelve el geocoding y este permite el fine-tuning visual.
 */
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

// Toggle visual entre OSM y Stadia. Renderizado absolute top-left dentro del
// contenedor del mapa, encima de los tiles (z-index alto).
function TileProviderToggle({
  active,
  onChange,
}: {
  active: TileProviderId;
  onChange: (id: TileProviderId) => void;
}) {
  const { theme } = useTheme();
  return (
    <div
      className="absolute top-3 left-3 z-[1000] flex rounded-lg overflow-hidden shadow-lg"
      style={{ border: `1px solid ${theme.border}` }}
    >
      {(Object.keys(TILE_PROVIDERS) as TileProviderId[]).map((id) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: isActive ? theme.primary : theme.card,
              color: isActive ? theme.card : theme.text,
            }}
            title={`Cambiar a ${TILE_PROVIDERS[id].label}`}
          >
            {TILE_PROVIDERS[id].label}
          </button>
        );
      })}
    </div>
  );
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
  const { theme } = useTheme();
  const [tileProvider, setTileProvider] = useState<TileProviderId>('osm');
  const provider = TILE_PROVIDERS[tileProvider];

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
          key={tileProvider}
          attribution={provider.attribution}
          url={provider.url}
        />
        <MapResizeHandler />
        <MapCenterUpdater coords={value || null} />
        {!readOnly && <MapClickHandler onLocationSelect={handleLocationSelect} />}
        {position && <Marker position={[position.lat, position.lng]} />}
      </MapContainer>

      {/* Toggle de proveedor de tiles (experimento: OSM vs Stadia) */}
      <TileProviderToggle active={tileProvider} onChange={setTileProvider} />

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
  const { theme } = useTheme();
  const [tileProvider, setTileProvider] = useState<TileProviderId>('osm');
  const provider = TILE_PROVIDERS[tileProvider];

  // Calcular centro basado en marcadores si existen
  const mapCenter = markers.length > 0
    ? {
        lat: markers.reduce((sum, m) => sum + m.lat, 0) / markers.length,
        lng: markers.reduce((sum, m) => sum + m.lng, 0) / markers.length,
      }
    : center;

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height, border: `1px solid ${theme.border}` }}>
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={tileProvider}
          attribution={provider.attribution}
          url={provider.url}
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

      {/* Toggle de proveedor de tiles (experimento: OSM vs Stadia) */}
      <TileProviderToggle active={tileProvider} onChange={setTileProvider} />
    </div>
  );
}
