import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Tag, Clock, Eye, Plus, ExternalLink, Star, MessageSquare, Send, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, calificacionesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import type { Reclamo, EstadoReclamo, HistorialReclamo } from '../types';

const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  nuevo: { bg: '#e5e7eb', text: '#374151' },
  asignado: { bg: '#dbeafe', text: '#1e40af' },
  en_proceso: { bg: '#fef3c7', text: '#92400e' },
  pendiente_confirmacion: { bg: '#ede9fe', text: '#5b21b6' },
  resuelto: { bg: '#d1fae5', text: '#065f46' },
  rechazado: { bg: '#fee2e2', text: '#991b1b' },
};

const estadoLabels: Record<EstadoReclamo, string> = {
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pendiente Confirmación',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

type SheetMode = 'closed' | 'view' | 'calificar';

interface CalificacionExistente {
  puntuacion: number;
  comentario?: string;
  created_at: string;
}

export default function MisReclamos() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Sheet states
  const [sheetMode, setSheetMode] = useState<SheetMode>('closed');
  const [selectedReclamo, setSelectedReclamo] = useState<Reclamo | null>(null);
  const [historial, setHistorial] = useState<HistorialReclamo[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Calificación states
  const [puntuacion, setPuntuacion] = useState(0);
  const [hoverPuntuacion, setHoverPuntuacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviandoCalificacion, setEnviandoCalificacion] = useState(false);
  const [calificacionExistente, setCalificacionExistente] = useState<CalificacionExistente | null>(null);
  const [loadingCalificacion, setLoadingCalificacion] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const reclamosRes = await reclamosApi.getMisReclamos();
      setReclamos(reclamosRes.data);
    } catch (error) {
      toast.error('Error al cargar datos');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToNuevoReclamo = () => {
    navigate('/nuevo-reclamo');
  };

  const openViewSheet = async (reclamo: Reclamo) => {
    setSelectedReclamo(reclamo);
    setSheetMode('view');
    setCalificacionExistente(null);

    setLoadingHistorial(true);
    try {
      const res = await reclamosApi.getHistorial(reclamo.id);
      setHistorial(res.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoadingHistorial(false);
    }

    // Si está resuelto, verificar si ya tiene calificación
    if (reclamo.estado === 'resuelto') {
      setLoadingCalificacion(true);
      try {
        const res = await calificacionesApi.getReclamo(reclamo.id);
        setCalificacionExistente(res.data);
      } catch {
        // No tiene calificación, está ok
        setCalificacionExistente(null);
      } finally {
        setLoadingCalificacion(false);
      }
    }
  };

  const openCalificarSheet = () => {
    setPuntuacion(0);
    setHoverPuntuacion(0);
    setComentario('');
    setSheetMode('calificar');
  };

  const handleEnviarCalificacion = async () => {
    if (!selectedReclamo || puntuacion === 0) {
      toast.error('Por favor selecciona una calificación');
      return;
    }

    setEnviandoCalificacion(true);
    try {
      await calificacionesApi.crear({
        reclamo_id: selectedReclamo.id,
        puntuacion,
        comentario: comentario.trim() || undefined
      });

      toast.success('¡Gracias por tu calificación!');
      setCalificacionExistente({
        puntuacion,
        comentario: comentario.trim() || undefined,
        created_at: new Date().toISOString()
      });
      setSheetMode('view');
    } catch (error: unknown) {
      console.error('Error enviando calificación:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { detail?: string } } };
        toast.error(axiosError.response?.data?.detail || 'Error al enviar la calificación');
      } else {
        toast.error('Error al enviar la calificación');
      }
    } finally {
      setEnviandoCalificacion(false);
    }
  };

  const closeSheet = () => {
    setSheetMode('closed');
    setSelectedReclamo(null);
    setHistorial([]);
    setCalificacionExistente(null);
    setPuntuacion(0);
    setComentario('');
  };

  const renderStars = (rating: number, interactive = false) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && setPuntuacion(star)}
            onMouseEnter={() => interactive && setHoverPuntuacion(star)}
            onMouseLeave={() => interactive && setHoverPuntuacion(0)}
            className={`transition-transform ${interactive ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'}`}
          >
            <Star
              className={`h-8 w-8 transition-colors ${
                star <= (interactive ? (hoverPuntuacion || puntuacion) : rating)
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  const filteredReclamos = reclamos.filter(r =>
    r.titulo.toLowerCase().includes(search.toLowerCase()) ||
    r.descripcion.toLowerCase().includes(search.toLowerCase()) ||
    r.direccion.toLowerCase().includes(search.toLowerCase())
  );

  // Renderizar contenido del Sheet de ver
  const renderViewContent = () => {
    if (!selectedReclamo) return null;
    const estado = estadoColors[selectedReclamo.estado];

    return (
      <div className="space-y-6">
        {/* Estado actual */}
        <div className="flex items-center justify-between">
          <span
            className="px-3 py-1 text-sm font-medium rounded-full"
            style={{ backgroundColor: estado.bg, color: estado.text }}
          >
            {estadoLabels[selectedReclamo.estado]}
          </span>
          <span className="text-sm" style={{ color: theme.textSecondary }}>
            {new Date(selectedReclamo.created_at).toLocaleString()}
          </span>
        </div>

        {/* Información del reclamo */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Categoría</label>
            <p className="mt-1">{selectedReclamo.categoria.nombre}</p>
          </div>

          <div>
            <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Descripción</label>
            <p className="mt-1">{selectedReclamo.descripcion}</p>
          </div>

          <div>
            <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Dirección</label>
            <p className="mt-1">{selectedReclamo.direccion}</p>
            {selectedReclamo.referencia && (
              <p className="text-sm" style={{ color: theme.textSecondary }}>Ref: {selectedReclamo.referencia}</p>
            )}
          </div>

          {selectedReclamo.zona && (
            <div>
              <label className="block text-sm font-medium" style={{ color: theme.textSecondary }}>Zona</label>
              <p className="mt-1">{selectedReclamo.zona.nombre}</p>
            </div>
          )}

          {selectedReclamo.empleado_asignado && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#dbeafe' }}>
              <label className="block text-sm font-medium" style={{ color: '#1e40af' }}>Empleado Asignado</label>
              <p className="mt-1" style={{ color: '#1e3a8a' }}>{selectedReclamo.empleado_asignado.nombre}</p>
              {selectedReclamo.empleado_asignado.especialidad && (
                <p className="text-sm" style={{ color: '#3b82f6' }}>{selectedReclamo.empleado_asignado.especialidad}</p>
              )}
            </div>
          )}

          {selectedReclamo.resolucion && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#d1fae5' }}>
              <label className="block text-sm font-medium" style={{ color: '#065f46' }}>Resolución</label>
              <p className="mt-1" style={{ color: '#064e3b' }}>{selectedReclamo.resolucion}</p>
              {selectedReclamo.fecha_resolucion && (
                <p className="text-sm" style={{ color: '#10b981' }}>
                  Resuelto: {new Date(selectedReclamo.fecha_resolucion).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {selectedReclamo.motivo_rechazo && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: '#fee2e2' }}>
              <label className="block text-sm font-medium" style={{ color: '#991b1b' }}>Motivo de Rechazo</label>
              <p className="mt-1" style={{ color: '#7f1d1d' }}>{selectedReclamo.motivo_rechazo}</p>
              {selectedReclamo.descripcion_rechazo && (
                <p className="text-sm mt-1" style={{ color: '#ef4444' }}>{selectedReclamo.descripcion_rechazo}</p>
              )}
            </div>
          )}
        </div>

        {/* Calificación (solo para reclamos resueltos) */}
        {selectedReclamo.estado === 'resuelto' && (
          <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <h4 className="font-medium flex items-center mb-3">
              <Star className="h-4 w-4 mr-2" />
              Tu Calificación
            </h4>
            {loadingCalificacion ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: theme.primary }} />
              </div>
            ) : calificacionExistente ? (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  {renderStars(calificacionExistente.puntuacion)}
                  <span className="text-sm font-medium" style={{ color: theme.text }}>
                    {calificacionExistente.puntuacion}/5
                  </span>
                </div>
                {calificacionExistente.comentario && (
                  <p className="text-sm italic" style={{ color: theme.textSecondary }}>
                    "{calificacionExistente.comentario}"
                  </p>
                )}
                <div className="flex items-center gap-1 mt-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-xs" style={{ color: theme.textSecondary }}>
                    Calificado el {new Date(calificacionExistente.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={openCalificarSheet}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)',
                  color: '#ffffff'
                }}
              >
                <Star className="h-5 w-5" />
                Calificar este reclamo
              </button>
            )}
          </div>
        )}

        {/* Historial */}
        <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
          <h4 className="font-medium flex items-center mb-3">
            <Clock className="h-4 w-4 mr-2" />
            Historial
          </h4>
          {loadingHistorial ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto" style={{ borderColor: theme.primary }}></div>
            </div>
          ) : historial.length > 0 ? (
            <div className="space-y-3">
              {historial.map((h) => (
                <div key={h.id} className="flex items-start space-x-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: theme.primary }}></div>
                  <div className="flex-1">
                    <p>
                      <span className="font-medium">{h.usuario.nombre} {h.usuario.apellido}</span>
                      {' '}{h.accion}
                    </p>
                    {h.comentario && (
                      <p className="mt-0.5" style={{ color: theme.textSecondary }}>{h.comentario}</p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                      {new Date(h.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: theme.textSecondary }}>Sin historial</p>
          )}
        </div>
      </div>
    );
  };

  // Renderizar contenido del Sheet de calificación
  const renderCalificarContent = () => {
    if (!selectedReclamo) return null;

    return (
      <div className="space-y-6">
        {/* Info del reclamo */}
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <p className="font-medium" style={{ color: theme.text }}>{selectedReclamo.titulo}</p>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            {selectedReclamo.categoria.nombre}
          </p>
          {selectedReclamo.resolucion && (
            <p className="text-sm mt-2 italic" style={{ color: '#10b981' }}>
              "{selectedReclamo.resolucion}"
            </p>
          )}
        </div>

        {/* Estrellas */}
        <div className="text-center">
          <p className="text-sm font-medium mb-4" style={{ color: theme.text }}>
            ¿Cómo calificarías la atención recibida?
          </p>
          <div className="flex justify-center">
            {renderStars(puntuacion, true)}
          </div>
          {puntuacion > 0 && (
            <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>
              {puntuacion === 1 && 'Muy malo'}
              {puntuacion === 2 && 'Malo'}
              {puntuacion === 3 && 'Regular'}
              {puntuacion === 4 && 'Bueno'}
              {puntuacion === 5 && 'Excelente'}
            </p>
          )}
        </div>

        {/* Comentario */}
        <div>
          <label
            className="flex items-center gap-2 text-sm font-medium mb-2"
            style={{ color: theme.text }}
          >
            <MessageSquare className="h-4 w-4" />
            Comentario (opcional)
          </label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Cuéntanos más sobre tu experiencia..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl resize-none transition-shadow focus:ring-2"
            style={{
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          />
        </div>

        {/* Botón enviar */}
        <button
          onClick={handleEnviarCalificacion}
          disabled={enviandoCalificacion || puntuacion === 0}
          className="w-full py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            color: 'white',
          }}
        >
          {enviandoCalificacion ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              Enviar Calificación
            </>
          )}
        </button>
      </div>
    );
  };

  // Empty state personalizado
  const renderEmptyState = () => (
    <div
      className="rounded-lg p-6 sm:p-12 text-center"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div
        className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        <MapPin className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: theme.textSecondary }} />
      </div>
      <p className="mb-4 text-sm sm:text-base" style={{ color: theme.textSecondary }}>No tienes reclamos registrados</p>
      <button
        onClick={goToNuevoReclamo}
        className="inline-flex items-center px-4 py-3 sm:py-2 rounded-lg transition-colors hover:opacity-90 active:scale-95 touch-manipulation"
        style={{ backgroundColor: theme.primary, color: '#ffffff' }}
      >
        <Plus className="h-4 w-4 mr-2" />
        Crear mi primer reclamo
      </button>
    </div>
  );

  return (
    <>
      <ABMPage
        title="Mis Reclamos"
        buttonLabel="Nuevo Reclamo"
        onAdd={goToNuevoReclamo}
        searchPlaceholder="Buscar en mis reclamos..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        isEmpty={filteredReclamos.length === 0 && !search}
        emptyMessage=""
      >
        {filteredReclamos.length === 0 && !search ? (
          renderEmptyState()
        ) : filteredReclamos.length === 0 && search ? (
          <div className="col-span-full text-center py-12" style={{ color: theme.textSecondary }}>
            No se encontraron reclamos
          </div>
        ) : (
          filteredReclamos.map((r) => {
            const estado = estadoColors[r.estado];
            return (
              <ABMCard key={r.id} onClick={() => openViewSheet(r)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: theme.textSecondary }}>#{r.id}</span>
                      <span
                        className="px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{ backgroundColor: estado.bg, color: estado.text }}
                      >
                        {estadoLabels[r.estado]}
                      </span>
                    </div>
                    <p className="font-medium mt-1 line-clamp-1">{r.titulo}</p>
                    <p className="text-sm flex items-center mt-1" style={{ color: theme.textSecondary }}>
                      <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="line-clamp-1">{r.direccion}</span>
                    </p>
                  </div>
                </div>

                <p className="text-sm mt-3 line-clamp-2" style={{ color: theme.textSecondary }}>
                  {r.descripcion}
                </p>

                <div
                  className="flex items-center justify-between mt-4 pt-4 text-xs"
                  style={{ borderTop: `1px solid ${theme.border}`, color: theme.textSecondary }}
                >
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center">
                      <Tag className="h-3 w-3 mr-1" />
                      {r.categoria.nombre}
                    </span>
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                </div>
              </ABMCard>
            );
          })
        )}
      </ABMPage>

      {/* Sheet separado para ver detalle */}
      <Sheet
        open={sheetMode === 'view'}
        onClose={closeSheet}
        title={`Reclamo #${selectedReclamo?.id || ''}`}
        description={selectedReclamo?.titulo}
        stickyFooter={
          selectedReclamo && (
            <button
              onClick={() => {
                closeSheet();
                navigate(`/reclamos/${selectedReclamo.id}`);
              }}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primary, color: '#ffffff' }}
            >
              <ExternalLink className="h-4 w-4" />
              Ver Historial Completo
            </button>
          )
        }
      >
        {renderViewContent()}
      </Sheet>

      {/* Sheet de calificación */}
      <Sheet
        open={sheetMode === 'calificar'}
        onClose={() => setSheetMode('view')}
        title="Calificar Reclamo"
        description={`#${selectedReclamo?.id} - ${selectedReclamo?.titulo}`}
      >
        {renderCalificarContent()}
      </Sheet>
    </>
  );
}
