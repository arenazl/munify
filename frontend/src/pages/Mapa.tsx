import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import { X, MapPin, Calendar, User, Tag, Clock, Navigation, ExternalLink } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { reclamosApi } from '../lib/api';
import { Reclamo } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

// Crear iconos de pin con color por estado
const createPinIcon = (color: string) => {
  return L.divIcon({
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
};

const STATUS_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',
  asignado: '#3b82f6',
  en_progreso: '#8b5cf6',
  resuelto: '#10b981',
  rechazado: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_progreso: 'En Progreso',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

export default function Mapa() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reclamo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchReclamos = async () => {
      try {
        const response = await reclamosApi.getAll();
        setReclamos(response.data.filter((r: Reclamo) => r.latitud && r.longitud));
      } catch (error) {
        console.error('Error cargando reclamos:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchReclamos();
  }, []);

  // Calcular centro del mapa basado en reclamos
  const getMapCenter = (): [number, number] => {
    if (reclamos.length === 0) return [-34.6037, -58.3816]; // Buenos Aires default
    const lat = reclamos.reduce((sum, r) => sum + (r.latitud || 0), 0) / reclamos.length;
    const lng = reclamos.reduce((sum, r) => sum + (r.longitud || 0), 0) / reclamos.length;
    return [lat, lng];
  };

  const handleMarkerClick = (reclamo: Reclamo) => {
    setSelected(reclamo);
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    setSelected(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Mapa de Reclamos</h1>
        <div className="flex items-center gap-4 text-sm" style={{ color: theme.textSecondary }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS.pendiente }}></div>
            <span>Pendiente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS.en_progreso }}></div>
            <span>En progreso</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS.resuelto }}></div>
            <span>Resuelto</span>
          </div>
        </div>
      </div>

      <div className="relative rounded-lg shadow overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        {/* Mapa */}
        <div style={{ height: '600px' }}>
          <MapContainer
            center={getMapCenter()}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {reclamos.map((reclamo) => (
              <Marker
                key={reclamo.id}
                position={[reclamo.latitud!, reclamo.longitud!]}
                icon={createPinIcon(STATUS_COLORS[reclamo.estado] || '#6b7280')}
                eventHandlers={{
                  click: () => handleMarkerClick(reclamo),
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -42]}
                  permanent={false}
                  className="custom-tooltip"
                >
                  <div className="font-medium text-sm">{reclamo.titulo}</div>
                  <div className="text-xs text-gray-500">{reclamo.direccion}</div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Side Modal para detalle del reclamo */}
        <div
          className={`absolute top-0 right-0 h-full w-96 transform transition-transform duration-300 ease-in-out z-[1000] ${
            sidebarOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{
            backgroundColor: theme.card,
            borderLeft: `1px solid ${theme.border}`,
            boxShadow: sidebarOpen ? '-4px 0 15px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          {selected && (
            <div className="h-full flex flex-col">
              {/* Header del sidebar */}
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

              {/* Contenido del sidebar */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Estado */}
                <div className="flex items-center justify-between">
                  <span
                    className="px-3 py-1 text-sm font-medium rounded-full text-white"
                    style={{ backgroundColor: STATUS_COLORS[selected.estado] }}
                  >
                    {STATUS_LABELS[selected.estado] || selected.estado}
                  </span>
                  <span className="text-xs" style={{ color: theme.textSecondary }}>
                    #{selected.id}
                  </span>
                </div>

                {/* Título */}
                <div>
                  <h4 className="text-xl font-bold" style={{ color: theme.text }}>
                    {selected.titulo}
                  </h4>
                </div>

                {/* Descripción */}
                {selected.descripcion && (
                  <div>
                    <p className="text-sm" style={{ color: theme.textSecondary }}>
                      {selected.descripcion}
                    </p>
                  </div>
                )}

                {/* Información en cards */}
                <div className="space-y-3">
                  {/* Categoría */}
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

                  {/* Ubicación */}
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

                  {/* Coordenadas */}
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

                  {/* Fecha de creación */}
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

                  {/* Creador */}
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

                  {/* Tiempo transcurrido */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <Clock className="h-5 w-5" style={{ color: theme.primary }} />
                    <div>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>Tiempo transcurrido</p>
                      <p className="font-medium" style={{ color: theme.text }}>
                        {Math.floor((Date.now() - new Date(selected.created_at).getTime()) / (1000 * 60 * 60 * 24))} días
                      </p>
                    </div>
                  </div>
                </div>

                {/* Imágenes si existen */}
                {selected.documentos && selected.documentos.filter(d => d.tipo?.startsWith('image')).length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                      Imágenes ({selected.documentos.filter(d => d.tipo?.startsWith('image')).length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.documentos.filter(d => d.tipo?.startsWith('image')).map((doc, idx) => (
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

              {/* Footer con acciones */}
              <div
                className="p-4"
                style={{ borderTop: `1px solid ${theme.border}` }}
              >
                <button
                  onClick={() => navigate(`/reclamos/${selected.id}`)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg transition-colors text-white font-medium hover:opacity-90"
                  style={{ backgroundColor: theme.primary }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Ver detalle completo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lista de reclamos con ubicación */}
      <div className="rounded-lg shadow p-6" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
          Reclamos con ubicación ({reclamos.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reclamos.slice(0, 9).map((reclamo) => (
            <div
              key={reclamo.id}
              className="p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.02]"
              style={{
                backgroundColor: selected?.id === reclamo.id ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${selected?.id === reclamo.id ? theme.primary : theme.border}`,
              }}
              onClick={() => handleMarkerClick(reclamo)}
            >
              <p className="font-medium" style={{ color: theme.text }}>{reclamo.titulo}</p>
              <p className="text-sm" style={{ color: theme.textSecondary }}>{reclamo.direccion}</p>
              <div className="flex items-center mt-2">
                <span
                  className="text-xs px-2 py-1 rounded text-white"
                  style={{ backgroundColor: reclamo.categoria?.color || '#6b7280' }}
                >
                  {reclamo.categoria?.nombre}
                </span>
                <span
                  className="ml-auto text-xs font-medium"
                  style={{ color: STATUS_COLORS[reclamo.estado] }}
                >
                  {STATUS_LABELS[reclamo.estado] || reclamo.estado}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
