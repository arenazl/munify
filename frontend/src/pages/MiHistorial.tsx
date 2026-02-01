import { useEffect, useState, useRef, useCallback } from 'react';
import { History, Star, Clock, MapPin, Calendar, ChevronRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { reclamosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet } from '../components/ui/Sheet';
import { ModernSelect } from '../components/ui/ModernSelect';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';

interface TrabajoHistorial {
  id: number;
  titulo: string;
  descripcion: string;
  estado: string;
  categoria: string | null;
  zona: string | null;
  direccion: string;
  prioridad: number;
  fecha_creacion: string | null;
  fecha_resolucion: string | null;
  tiempo_resolucion_dias: number | null;
  creador: string;
  calificacion: {
    puntuacion: number;
    comentario: string | null;
    fecha: string | null;
  } | null;
}

const estadoColors: Record<string, { bg: string; text: string }> = {
  nuevo: { bg: '#6366f1', text: '#ffffff' },
  recibido: { bg: '#0891b2', text: '#ffffff' },
  asignado: { bg: '#3b82f6', text: '#ffffff' },
  en_curso: { bg: '#f59e0b', text: '#ffffff' },
  pendiente_confirmacion: { bg: '#8b5cf6', text: '#ffffff' },
  resuelto: { bg: '#10b981', text: '#ffffff' },
  finalizado: { bg: '#10b981', text: '#ffffff' },
  pospuesto: { bg: '#f97316', text: '#ffffff' },
  rechazado: { bg: '#ef4444', text: '#ffffff' },
};

const estadoLabels: Record<string, string> = {
  nuevo: 'Nuevo',
  recibido: 'Recibido',
  asignado: 'Asignado',
  en_curso: 'En Curso',
  pendiente_confirmacion: 'Pendiente',
  resuelto: 'Resuelto',
  finalizado: 'Finalizado',
  pospuesto: 'Pospuesto',
  rechazado: 'Rechazado',
};

const LIMIT = 20;

export default function MiHistorial() {
  const { theme } = useTheme();
  const [historial, setHistorial] = useState<TrabajoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [selectedTrabajo, setSelectedTrabajo] = useState<TrabajoHistorial | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadHistorial = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setSkip(0);
      }

      const params: Record<string, unknown> = {
        skip: reset ? 0 : skip,
        limit: LIMIT,
      };
      if (filtroEstado) params.estado = filtroEstado;

      const response = await reclamosApi.getMiHistorial(params as { skip?: number; limit?: number; estado?: string });
      const data = response.data;

      if (reset) {
        setHistorial(data.data);
      } else {
        setHistorial(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newItems = data.data.filter((t: TrabajoHistorial) => !existingIds.has(t.id));
          return [...prev, ...newItems];
        });
      }

      setTotal(data.total);
      setHasMore(data.data.length >= LIMIT);
      if (!reset) setSkip(prev => prev + LIMIT);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadHistorial(true);
  }, [filtroEstado]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadHistorial(false);
  }, [loadingMore, hasMore, skip, filtroEstado]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [loadMore, hasMore, loadingMore, loading]);

  const filteredHistorial = historial.filter(t =>
    t.titulo.toLowerCase().includes(search.toLowerCase()) ||
    t.direccion.toLowerCase().includes(search.toLowerCase()) ||
    (t.categoria?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleVerDetalle = (trabajo: TrabajoHistorial) => {
    setSelectedTrabajo(trabajo);
    setSheetOpen(true);
  };

  const renderStars = (puntuacion: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= puntuacion ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <StickyPageHeader
        icon={<History className="h-5 w-5" />}
        title="Mi Historial"
        searchPlaceholder="Buscar en historial..."
        searchValue={search}
        onSearchChange={setSearch}
        actions={
          <ModernSelect
            value={filtroEstado}
            onChange={(val) => setFiltroEstado(val)}
            options={[
              { value: '', label: 'Todos los estados' },
              { value: 'resuelto', label: 'Resueltos' },
              { value: 'en_curso', label: 'En Proceso' },
              { value: 'asignado', label: 'Asignados' },
            ]}
            placeholder="Estado"
          />
        }
      />

      {/* Lista de trabajos */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }} />
        </div>
      ) : filteredHistorial.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <History className="h-12 w-12 mx-auto mb-3 opacity-50" style={{ color: theme.textSecondary }} />
          <p style={{ color: theme.textSecondary }}>
            No hay trabajos en tu historial
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistorial.map((trabajo) => (
            <div
              key={trabajo.id}
              onClick={() => handleVerDetalle(trabajo)}
              className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
              style={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-start gap-4">
                {/* Indicador de estado */}
                <div
                  className="w-1 h-full min-h-[60px] rounded-full flex-shrink-0"
                  style={{ backgroundColor: estadoColors[trabajo.estado]?.bg || theme.primary }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>
                          #{trabajo.id}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: estadoColors[trabajo.estado]?.bg || theme.primary,
                            color: estadoColors[trabajo.estado]?.text || '#fff',
                          }}
                        >
                          {estadoLabels[trabajo.estado] || trabajo.estado}
                        </span>
                        {trabajo.calificacion && (
                          <div className="flex items-center gap-1">
                            {renderStars(trabajo.calificacion.puntuacion)}
                          </div>
                        )}
                      </div>
                      <h3 className="font-medium truncate" style={{ color: theme.text }}>
                        {trabajo.titulo}
                      </h3>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: theme.textSecondary }}>
                    {trabajo.categoria && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.primary }} />
                        {trabajo.categoria}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {trabajo.direccion.substring(0, 30)}...
                    </span>
                    {trabajo.fecha_creacion && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {trabajo.fecha_creacion.split(' ')[0]}
                      </span>
                    )}
                    {trabajo.tiempo_resolucion_dias !== null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {trabajo.tiempo_resolucion_dias} días
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
            {loadingMore && (
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
            )}
          </div>
        </div>
      )}

      {/* Sheet de detalle */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Trabajo #${selectedTrabajo?.id}`}
        description={selectedTrabajo?.categoria || ''}
      >
        {selectedTrabajo && (
          <div className="space-y-6">
            {/* Estado */}
            <div className="flex items-center gap-3">
              <span
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: estadoColors[selectedTrabajo.estado]?.bg || theme.primary,
                  color: estadoColors[selectedTrabajo.estado]?.text || '#fff',
                }}
              >
                {estadoLabels[selectedTrabajo.estado] || selectedTrabajo.estado}
              </span>
              {selectedTrabajo.estado === 'resuelto' && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
            </div>

            {/* Título y descripción */}
            <div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
                {selectedTrabajo.titulo}
              </h3>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                {selectedTrabajo.descripcion}
              </p>
            </div>

            {/* Detalles */}
            <div className="grid grid-cols-2 gap-4">
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>Ubicación</p>
                <p className="text-sm font-medium flex items-center gap-1" style={{ color: theme.text }}>
                  <MapPin className="h-4 w-4" />
                  {selectedTrabajo.direccion}
                </p>
              </div>

              {selectedTrabajo.zona && (
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>Zona</p>
                  <p className="text-sm font-medium" style={{ color: theme.text }}>
                    {selectedTrabajo.zona}
                  </p>
                </div>
              )}

              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>Fecha creación</p>
                <p className="text-sm font-medium flex items-center gap-1" style={{ color: theme.text }}>
                  <Calendar className="h-4 w-4" />
                  {selectedTrabajo.fecha_creacion}
                </p>
              </div>

              {selectedTrabajo.fecha_resolucion && (
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>Fecha resolución</p>
                  <p className="text-sm font-medium flex items-center gap-1" style={{ color: theme.text }}>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    {selectedTrabajo.fecha_resolucion}
                  </p>
                </div>
              )}

              {selectedTrabajo.tiempo_resolucion_dias !== null && (
                <div
                  className="rounded-lg p-3"
                  style={{ backgroundColor: theme.backgroundSecondary }}
                >
                  <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>Tiempo resolución</p>
                  <p className="text-sm font-medium flex items-center gap-1" style={{ color: theme.text }}>
                    <Clock className="h-4 w-4" />
                    {selectedTrabajo.tiempo_resolucion_dias} días
                  </p>
                </div>
              )}

              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <p className="text-xs mb-1" style={{ color: theme.textSecondary }}>Vecino</p>
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  {selectedTrabajo.creador}
                </p>
              </div>
            </div>

            {/* Calificación */}
            {selectedTrabajo.calificacion ? (
              <div
                className="rounded-xl p-4"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                  <span className="font-medium" style={{ color: theme.text }}>
                    Calificación del vecino
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {renderStars(selectedTrabajo.calificacion.puntuacion)}
                  <span className="text-sm font-medium" style={{ color: theme.text }}>
                    {selectedTrabajo.calificacion.puntuacion}/5
                  </span>
                </div>
                {selectedTrabajo.calificacion.comentario && (
                  <p className="text-sm italic" style={{ color: theme.textSecondary }}>
                    "{selectedTrabajo.calificacion.comentario}"
                  </p>
                )}
                {selectedTrabajo.calificacion.fecha && (
                  <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
                    {selectedTrabajo.calificacion.fecha}
                  </p>
                )}
              </div>
            ) : selectedTrabajo.estado === 'resuelto' ? (
              <div
                className="rounded-xl p-4 flex items-center gap-3"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <AlertCircle className="h-5 w-5" style={{ color: theme.textSecondary }} />
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  El vecino aún no calificó este trabajo
                </p>
              </div>
            ) : null}
          </div>
        )}
      </Sheet>
    </div>
  );
}
