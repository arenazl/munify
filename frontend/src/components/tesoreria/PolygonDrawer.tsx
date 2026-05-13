/**
 * Editor de poligonos sobre Leaflet (simple, sin dependencias extra).
 *
 * Click en el mapa = agrega vertice. Click en un vertice existente = lo
 * elimina. El poligono se cierra visualmente solo. Botones para limpiar
 * todo y para mover el centro (drag) del mapa.
 */
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, useMapEvents, useMap } from 'react-leaflet';
import { Trash2, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  value: number[][] | null | undefined;  // [[lat, lon], ...]
  onChange: (coords: number[][]) => void;
  color?: string;
  centro?: [number, number];  // [lat, lon] default
  zoom?: number;
  height?: number;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapResize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

export function PolygonDrawer({
  value,
  onChange,
  color = '#3b82f6',
  centro = [-30.265, -64.124],  // San Pedro Norte por default
  zoom = 13,
  height = 380,
}: Props) {
  const [vertices, setVertices] = useState<number[][]>(value || []);

  useEffect(() => {
    setVertices(value || []);
  }, [value]);

  const handleMapClick = (lat: number, lon: number) => {
    const nuevo = [...vertices, [lat, lon]];
    setVertices(nuevo);
    onChange(nuevo);
  };

  const handleVertexClick = (i: number) => {
    const nuevo = vertices.filter((_, idx) => idx !== i);
    setVertices(nuevo);
    onChange(nuevo);
  };

  const limpiar = () => {
    setVertices([]);
    onChange([]);
  };

  const polygonCoords: L.LatLngTuple[] = vertices.map(v => [v[0], v[1]]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: 'inherit', opacity: 0.7 }}>
          {vertices.length === 0 ? (
            <>Click en el mapa para agregar vértices. Mínimo 3.</>
          ) : vertices.length < 3 ? (
            <><b>{vertices.length}</b> de 3 vértices mínimos para formar polígono</>
          ) : (
            <><b>{vertices.length}</b> vértices · click en un punto rojo para eliminarlo</>
          )}
        </span>
        <button
          type="button"
          onClick={limpiar}
          disabled={vertices.length === 0}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-40"
          style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444440' }}
        >
          <Trash2 className="h-3 w-3" /> Limpiar
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ height, border: '1px solid currentColor' }}>
        <MapContainer
          center={centro}
          zoom={zoom}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResize />
          <ClickHandler onClick={handleMapClick} />

          {/* Polygon visible solo con >= 3 vertices */}
          {polygonCoords.length >= 3 && (
            <Polygon positions={polygonCoords} pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 2 }} />
          )}

          {/* Lineas guia cuando hay 2 vertices */}
          {polygonCoords.length === 2 && (
            <Polygon positions={polygonCoords} pathOptions={{ color, fillOpacity: 0, weight: 2, dashArray: '4 4' }} />
          )}

          {/* Vertices clickeables */}
          {vertices.map((v, i) => (
            <CircleMarker
              key={i}
              center={[v[0], v[1]]}
              radius={6}
              pathOptions={{ color: '#ffffff', fillColor: color, fillOpacity: 1, weight: 2 }}
              eventHandlers={{ click: () => handleVertexClick(i) }}
            >
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {vertices.length > 0 && vertices.length < 3 && (
        <div className="text-[11px] flex items-center gap-1" style={{ color: '#f59e0b' }}>
          <MapPin className="h-3 w-3" /> Necesitás al menos 3 vértices para formar un polígono cerrado.
        </div>
      )}
    </div>
  );
}
