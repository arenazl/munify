import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { X, MapPin, Calendar, User, Tag, Clock, Navigation, Map as MapIcon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// URLs de tiles para tema claro y oscuro
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
import { reclamosApi } from '../lib/api';
import { StickyPageHeader, PageTitleIcon, PageTitle, HeaderSeparator } from '../components/ui/StickyPageHeader';
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

// Colores consistentes con Reclamos.tsx
const STATUS_COLORS: Record<string, string> = {
  nuevo: '#6366f1',
  asignado: '#3b82f6',
  en_curso: '#f59e0b',
  pendiente_confirmacion: '#8b5cf6',
  resuelto: '#10b981',
  rechazado: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_curso: 'En Proceso',
  pendiente_confirmacion: 'Pend. Confirm.',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

// Categorías con colores (sincronizado con HeatmapWidget)
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

// Mapear categoría real a key de filtro
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

// Componente para ajustar el mapa a los bounds de los markers
function FitBoundsToMarkers({ reclamos }: { reclamos: Reclamo[] }) {
  const map = useMap();

  useEffect(() => {
    if (reclamos.length === 0) return;

    // Pequeño delay para asegurar que el mapa esté listo
    const timer = setTimeout(() => {
      const validReclamos = reclamos.filter(r => r.latitud && r.longitud);

      if (validReclamos.length === 0) return;

      map.invalidateSize();

      if (validReclamos.length === 1) {
        // Si hay solo un marker, centrar en él
        map.setView([validReclamos[0].latitud!, validReclamos[0].longitud!], 15);
      } else {
        // Si hay múltiples markers, ajustar bounds para verlos todos
        const latlngs = validReclamos.map(r => L.latLng(r.latitud!, r.longitud!));
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [reclamos, map]);

  return null;
}

export default function Mapa() {
  const { theme, currentPresetId } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  // Detectar si el tema es claro (solo sand y arctic son claros)
  const isDarkTheme = currentPresetId !== 'sand' && currentPresetId !== 'arctic';
  const tileUrl = isDarkTheme ? TILE_URLS.dark : TILE_URLS.light;

  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Reclamo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Filtros de estado - null = todos, string = solo ese estado
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  // Filtro de categoría desde URL
  const filtroCategoria = searchParams.get('categoria');

  useEffect(() => {
    const fetchReclamosEnLotes = async () => {
      try {
        const BATCH_SIZE = 100;
        let allReclamos: Reclamo[] = [];
        let skip = 0;
        let hasMore = true;
        let isFirstBatch = true;

        // Cargar en lotes hasta que no haya más
        while (hasMore) {
          if (!isFirstBatch) {
            setLoadingMore(true);
          }

          const response = await reclamosApi.getAll({ skip, limit: BATCH_SIZE });
          const batch = response.data || [];

          // Filtrar solo los que tienen ubicación
          const conUbicacion = batch.filter((r: Reclamo) => r.latitud && r.longitud);
          allReclamos = [...allReclamos, ...conUbicacion];

          // Eliminar duplicados por ID (puede haber en la base de datos)
          const idsVistos = new Set<number>();
          const sinDuplicados = allReclamos.filter(r => {
            if (idsVistos.has(r.id)) return false;
            idsVistos.add(r.id);
            return true;
          });

          // Actualizar estado parcialmente para mostrar progreso
          setReclamos(sinDuplicados);

          // Después del primer lote, quitar loading principal para mostrar el mapa
          if (isFirstBatch) {
            setLoading(false);
            isFirstBatch = false;
          }

          // Si trajo menos del límite, ya no hay más
          if (batch.length < BATCH_SIZE) {
            hasMore = false;
          } else {
            skip += BATCH_SIZE;
          }
        }

        // Obtener cantidad final sin duplicados
        const idsFinales = new Set<number>();
        const totalSinDuplicados = allReclamos.filter(r => {
          if (idsFinales.has(r.id)) return false;
          idsFinales.add(r.id);
          return true;
        }).length;
        console.log(`[Mapa] Cargados ${totalSinDuplicados} reclamos con ubicación (sin duplicados)`);
      } catch (error) {
        console.error('Error cargando reclamos:', error);
        setLoading(false);
      } finally {
        setLoadingMore(false);
      }
    };
    fetchReclamosEnLotes();
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

  // Primero filtrar por categoría si viene de la URL
  const reclamosPorCategoria = useMemo(() => {
    if (!filtroCategoria) return reclamos;
    return reclamos.filter(r => {
      const catKey = getCategoryKey(r.categoria?.nombre || 'Otros');
      return catKey === filtroCategoria;
    });
  }, [reclamos, filtroCategoria]);

  // Contar reclamos por estado (sobre los ya filtrados por categoría)
  const conteosPorEstado = reclamosPorCategoria.reduce((acc, r) => {
    acc[r.estado] = (acc[r.estado] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Filtrar reclamos según el estado seleccionado (después de filtrar por categoría)
  const reclamosFiltrados = useMemo(() => {
    if (filtroEstado) {
      return reclamosPorCategoria.filter(r => r.estado === filtroEstado);
    }
    return reclamosPorCategoria;
  }, [reclamosPorCategoria, filtroEstado]);

  // Limpiar filtro de categoría
  const clearCategoriaFilter = () => {
    setSearchParams({});
  };

  // Toggle filtro: si ya está seleccionado, deseleccionar (mostrar todos)
  const toggleFiltro = (estado: string) => {
    setFiltroEstado(prev => prev === estado ? null : estado);
  };

  // Panel de filtros por estado
  const categoryConfig = filtroCategoria ? CATEGORY_CONFIG[filtroCategoria] : null;

  const filterPanel = (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Badge de categoría activa (si hay filtro desde URL) */}
      {filtroCategoria && categoryConfig && (
        <button
          onClick={clearCategoriaFilter}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all group"
          style={{
            backgroundColor: `${categoryConfig.color}20`,
            color: categoryConfig.color,
            border: `1px solid ${categoryConfig.color}`,
          }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: categoryConfig.color }}
          />
          <span className="text-xs font-medium">{categoryConfig.label}</span>
          <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
        </button>
      )}
      {/* Separador si hay filtro de categoría */}
      {filtroCategoria && (
        <div className="h-4 w-px" style={{ backgroundColor: theme.border }} />
      )}
      {/* Botón "Todos" */}
      <button
        onClick={() => setFiltroEstado(null)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
        style={{
          backgroundColor: filtroEstado === null ? theme.primary : `${theme.textSecondary}15`,
          color: filtroEstado === null ? '#ffffff' : theme.textSecondary,
          border: `1px solid ${filtroEstado === null ? theme.primary : theme.border}`,
        }}
      >
        <span className="text-xs font-medium">Todos</span>
        <span className="text-xs font-bold">({reclamosPorCategoria.length})</span>
      </button>
      {/* Botones por estado */}
      {Object.entries(STATUS_COLORS).map(([estado, color]) => {
        const count = conteosPorEstado[estado] || 0;
        if (count === 0) return null;
        const isActive = filtroEstado === estado;
        return (
          <button
            key={estado}
            onClick={() => toggleFiltro(estado)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
            style={{
              backgroundColor: isActive ? color : `${color}15`,
              color: isActive ? '#ffffff' : color,
              border: `1px solid ${isActive ? color : `${color}40`}`,
            }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: isActive ? '#ffffff' : color }}
            />
            <span className="text-xs font-medium">{STATUS_LABELS[estado]}</span>
            <span className="text-xs font-bold">({count})</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header Sticky con componente reutilizable */}
      <StickyPageHeader filterPanel={filterPanel}>
        <PageTitleIcon icon={<MapIcon className="h-4 w-4" />} />
        <PageTitle>Mapa de Reclamos</PageTitle>
        {loadingMore && (
          <>
            <HeaderSeparator />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>Cargando más...</span>
            </div>
          </>
        )}
      </StickyPageHeader>

      <div className="relative rounded-lg shadow overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        {/* Mapa */}
        <div style={{ height: '600px' }}>
          <MapContainer
            center={getMapCenter()}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; OSM &copy; CARTO'
              url={tileUrl}
            />
            <FitBoundsToMarkers reclamos={reclamosFiltrados} />
            {reclamosFiltrados.map((reclamo) => (
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

            </div>
          )}
        </div>
      </div>

      {/* Lista de reclamos con ubicación */}
      <div className="rounded-lg shadow p-6" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
          {filtroCategoria && categoryConfig
            ? `${categoryConfig.label}${filtroEstado ? ` - ${STATUS_LABELS[filtroEstado]}` : ''} (${reclamosFiltrados.length})`
            : filtroEstado
              ? `${STATUS_LABELS[filtroEstado]} (${reclamosFiltrados.length})`
              : `Reclamos con ubicación (${reclamos.length})`}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reclamosFiltrados.slice(0, 9).map((reclamo) => (
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
