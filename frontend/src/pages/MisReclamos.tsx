import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Clock, Eye, Plus, ExternalLink, Star, MessageSquare, Send, Loader2, CheckCircle, ArrowUpDown, ThumbsUp, ThumbsDown, AlertCircle } from 'lucide-react';
import { DynamicIcon } from '../components/ui/DynamicIcon';
import { toast } from 'sonner';
import { reclamosApi, calificacionesApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { ABMPage, ABMCard, ABMTable, type ABMTableColumn } from '../components/ui/ABMPage';
import { Sheet } from '../components/ui/Sheet';
import type { Reclamo, EstadoReclamo, HistorialReclamo } from '../types';

const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  recibido: { bg: '#cffafe', text: '#0e7490' },
  en_curso: { bg: '#fef3c7', text: '#92400e' },
  finalizado: { bg: '#d1fae5', text: '#065f46' },
  pospuesto: { bg: '#ffedd5', text: '#c2410c' },
  rechazado: { bg: '#fee2e2', text: '#991b1b' },
  // Legacy
  nuevo: { bg: '#e5e7eb', text: '#374151' },
  asignado: { bg: '#dbeafe', text: '#1e40af' },
  en_proceso: { bg: '#fef3c7', text: '#92400e' },
  pendiente_confirmacion: { bg: '#ede9fe', text: '#5b21b6' },
  resuelto: { bg: '#d1fae5', text: '#065f46' },
};

const estadoLabels: Record<EstadoReclamo, string> = {
  recibido: 'Recibido',
  en_curso: 'En Curso',
  finalizado: 'Finalizado',
  pospuesto: 'Pospuesto',
  rechazado: 'Rechazado',
  // Legacy
  nuevo: 'Nuevo',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pendiente',
  resuelto: 'Resuelto',
};

// Formatea el nombre del empleado en formato "L. Lopez"
const formatEmpleadoNombre = (nombreCompleto: string): string => {
  const partes = nombreCompleto.trim().split(' ');
  if (partes.length === 0) return nombreCompleto;

  // Tomar la primera letra del primer nombre
  const inicial = partes[0][0].toUpperCase();

  // Tomar el/los apellido(s) - todo excepto el primer nombre
  const apellidos = partes.slice(1).join(' ');

  return apellidos ? `${inicial}. ${apellidos}` : nombreCompleto;
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

  // Ordenamiento y filtros
  const [ordenarPor, setOrdenarPor] = useState<'fecha' | 'vencimiento'>('fecha');
  const [filtroEstado, setFiltroEstado] = useState<EstadoReclamo | 'todos'>('todos');

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

  // Confirmación del vecino states
  const [comentarioConfirmacion, setComentarioConfirmacion] = useState('');
  const [enviandoConfirmacion, setEnviandoConfirmacion] = useState(false);

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
    navigate('/gestion/crear-reclamo');
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

  // Confirmación del vecino (solucionado / sigue el problema)
  const handleConfirmarVecino = async (solucionado: boolean) => {
    if (!selectedReclamo) return;

    setEnviandoConfirmacion(true);
    try {
      await reclamosApi.confirmarVecino(selectedReclamo.id, {
        solucionado,
        comentario: comentarioConfirmacion.trim() || undefined
      });

      // Actualizar el reclamo localmente
      const updatedReclamo = {
        ...selectedReclamo,
        confirmado_vecino: solucionado,
        fecha_confirmacion_vecino: new Date().toISOString(),
        comentario_confirmacion_vecino: comentarioConfirmacion.trim() || undefined
      };
      setSelectedReclamo(updatedReclamo);
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? updatedReclamo : r));

      toast.success(solucionado
        ? '¡Gracias por confirmar! Nos alegra que el problema se haya solucionado.'
        : 'Lamentamos que el problema persista. Tu feedback fue registrado.'
      );
      setComentarioConfirmacion('');
    } catch (error: unknown) {
      console.error('Error enviando confirmación:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { detail?: string } } };
        toast.error(axiosError.response?.data?.detail || 'Error al enviar confirmación');
      } else {
        toast.error('Error al enviar confirmación');
      }
    } finally {
      setEnviandoConfirmacion(false);
    }
  };

  const closeSheet = () => {
    setSheetMode('closed');
    setSelectedReclamo(null);
    setHistorial([]);
    setCalificacionExistente(null);
    setPuntuacion(0);
    setComentario('');
    setComentarioConfirmacion('');
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

  const filteredReclamos = reclamos
    .filter(r => {
      const matchSearch = r.titulo.toLowerCase().includes(search.toLowerCase()) ||
        r.descripcion.toLowerCase().includes(search.toLowerCase()) ||
        r.direccion.toLowerCase().includes(search.toLowerCase());
      const matchEstado = filtroEstado === 'todos' || r.estado === filtroEstado;
      return matchSearch && matchEstado;
    })
    .sort((a, b) => {
      if (ordenarPor === 'fecha') {
        // Más recientes primero
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else {
        // Por vencer: ordenar por fecha_programada (los que vencen primero arriba)
        // Los que no tienen fecha van al final
        const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Infinity;
        const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Infinity;
        return fechaA - fechaB;
      }
    });

  // Estados únicos para el filtro
  const estadosUnicos = [...new Set(reclamos.map(r => r.estado))];

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

          {selectedReclamo.dependencia_asignada?.nombre && (
            <div
              className="p-3 rounded-lg flex items-center gap-3"
              style={{ backgroundColor: `${selectedReclamo.dependencia_asignada.color || theme.primary}15` }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: selectedReclamo.dependencia_asignada.color || theme.primary }}
              >
                <DynamicIcon
                  name={selectedReclamo.dependencia_asignada.icono || 'Building2'}
                  className="h-5 w-5 text-white"
                />
              </div>
              <div>
                <label className="block text-xs" style={{ color: theme.textSecondary }}>Asignado a</label>
                <p className="font-medium" style={{ color: theme.text }}>{selectedReclamo.dependencia_asignada.nombre}</p>
              </div>
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

        {/* Confirmación del vecino (solo para reclamos finalizados/resueltos sin confirmar) */}
        {(selectedReclamo.estado === 'resuelto' || selectedReclamo.estado === 'finalizado') && (
          <div className="pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <h4 className="font-medium flex items-center mb-3">
              <AlertCircle className="h-4 w-4 mr-2" />
              ¿Se solucionó el problema?
            </h4>

            {selectedReclamo.confirmado_vecino !== null && selectedReclamo.confirmado_vecino !== undefined ? (
              // Ya confirmado - mostrar resultado
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: selectedReclamo.confirmado_vecino ? '#d1fae5' : '#fee2e2',
                  border: `1px solid ${selectedReclamo.confirmado_vecino ? '#10b981' : '#ef4444'}30`
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  {selectedReclamo.confirmado_vecino ? (
                    <ThumbsUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <ThumbsDown className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-medium" style={{ color: selectedReclamo.confirmado_vecino ? '#065f46' : '#991b1b' }}>
                    {selectedReclamo.confirmado_vecino ? 'Confirmaste que se solucionó' : 'Indicaste que sigue el problema'}
                  </span>
                </div>
                {selectedReclamo.comentario_confirmacion_vecino && (
                  <p className="text-sm italic mt-1" style={{ color: selectedReclamo.confirmado_vecino ? '#047857' : '#b91c1c' }}>
                    "{selectedReclamo.comentario_confirmacion_vecino}"
                  </p>
                )}
                {selectedReclamo.fecha_confirmacion_vecino && (
                  <p className="text-xs mt-2" style={{ color: selectedReclamo.confirmado_vecino ? '#059669' : '#dc2626' }}>
                    Confirmado el {new Date(selectedReclamo.fecha_confirmacion_vecino).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              // Pendiente de confirmar
              <div className="space-y-3">
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Tu opinión nos ayuda a mejorar el servicio
                </p>

                {/* Campo de comentario opcional */}
                <textarea
                  value={comentarioConfirmacion}
                  onChange={(e) => setComentarioConfirmacion(e.target.value)}
                  placeholder="Comentario opcional..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    border: `1px solid ${theme.border}`,
                    color: theme.text
                  }}
                />

                {/* Botones de confirmación */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleConfirmarVecino(true)}
                    disabled={enviandoConfirmacion}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: '#10b981', color: '#ffffff' }}
                  >
                    {enviandoConfirmacion ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <ThumbsUp className="h-5 w-5" />
                        Solucionado
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleConfirmarVecino(false)}
                    disabled={enviandoConfirmacion}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
                  >
                    {enviandoConfirmacion ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <ThumbsDown className="h-5 w-5" />
                        Sigue el problema
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Calificación (solo para reclamos resueltos) */}
        {(selectedReclamo.estado === 'resuelto' || selectedReclamo.estado === 'finalizado') && (
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


  // Filtros secundarios: ordenamiento + estados
  const renderSecondaryFilters = () => (
    <div className="flex items-center gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {/* Ordenamiento */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setOrdenarPor('fecha')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          style={{
            backgroundColor: ordenarPor === 'fecha' ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `1px solid ${ordenarPor === 'fecha' ? theme.primary : theme.border}`,
            color: ordenarPor === 'fecha' ? theme.primary : theme.textSecondary,
          }}
        >
          <ArrowUpDown className="h-3 w-3" />
          Más recientes
        </button>
        <button
          onClick={() => setOrdenarPor('vencimiento')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          style={{
            backgroundColor: ordenarPor === 'vencimiento' ? `${theme.primary}15` : theme.backgroundSecondary,
            border: `1px solid ${ordenarPor === 'vencimiento' ? theme.primary : theme.border}`,
            color: ordenarPor === 'vencimiento' ? theme.primary : theme.textSecondary,
          }}
        >
          <Calendar className="h-3 w-3" />
          Por vencer
        </button>
      </div>

      {/* Separador */}
      <div className="h-6 w-px flex-shrink-0" style={{ backgroundColor: theme.border }} />

      {/* Filtros de estado */}
      <div className="flex items-center gap-1.5">
        {/* Chip "Todos" */}
        <button
          onClick={() => setFiltroEstado('todos')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          style={{
            backgroundColor: filtroEstado === 'todos' ? theme.primary : theme.backgroundSecondary,
            color: filtroEstado === 'todos' ? '#ffffff' : theme.textSecondary,
            border: `1px solid ${filtroEstado === 'todos' ? theme.primary : theme.border}`,
          }}
        >
          Todos
        </button>
        {/* Chips de estados disponibles */}
        {estadosUnicos.map(estado => {
          const estadoColor = estadoColors[estado];
          const isSelected = filtroEstado === estado;
          return (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: isSelected ? estadoColor.bg : theme.backgroundSecondary,
                color: isSelected ? estadoColor.text : theme.textSecondary,
                border: `1px solid ${isSelected ? estadoColor.text : theme.border}`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: estadoColor.text }}
              />
              {estadoLabels[estado]}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Columnas para la vista de tabla
  const tableColumns: ABMTableColumn<Reclamo>[] = [
    {
      key: 'id',
      header: '#',
      render: (r) => (
        <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>
          #{r.id}
        </span>
      ),
    },
    {
      key: 'titulo',
      header: 'Título',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${r.categoria?.color || theme.primary}15` }}
          >
            <MapPin className="h-4 w-4" style={{ color: r.categoria?.color || theme.primary }} />
          </div>
          <span className="font-medium truncate" style={{ color: theme.text }}>
            {r.titulo}
          </span>
        </div>
      ),
    },
    {
      key: 'categoria',
      header: 'Categoría',
      sortable: true,
      render: (r) => (
        <span
          className="px-2 py-1 text-xs rounded-full"
          style={{
            backgroundColor: `${r.categoria?.color || theme.primary}15`,
            color: r.categoria?.color || theme.primary,
          }}
        >
          {r.categoria?.nombre || 'Sin categoría'}
        </span>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      render: (r) => {
        const estado = estadoColors[r.estado];
        return (
          <span
            className="px-2 py-1 text-xs font-medium rounded-full"
            style={{ backgroundColor: estado.bg, color: estado.text }}
          >
            {estadoLabels[r.estado]}
          </span>
        );
      },
    },
    {
      key: 'fecha',
      header: 'Fecha',
      sortable: true,
      render: (r) => (
        <span className="text-sm" style={{ color: theme.textSecondary }}>
          {new Date(r.created_at).toLocaleDateString('es-AR')}
        </span>
      ),
    },
    {
      key: 'dependencia',
      header: 'Dependencia',
      render: (r) => r.dependencia_asignada ? (
        <div className="flex items-center gap-1.5">
          <DynamicIcon
            name={r.dependencia_asignada.icono || 'Building2'}
            className="h-3.5 w-3.5"
            style={{ color: r.dependencia_asignada.color || theme.primary }}
          />
          <span className="text-xs truncate max-w-[150px]" style={{ color: r.dependencia_asignada.color || theme.textSecondary }}>
            {r.dependencia_asignada.nombre}
          </span>
        </div>
      ) : (
        <span className="text-xs" style={{ color: theme.textSecondary }}>Sin asignar</span>
      ),
    },
    {
      key: 'acciones',
      header: '',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); openViewSheet(r); }}
          className="p-1.5 rounded-lg transition-all hover:scale-110"
          style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

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
        isEmpty={filteredReclamos.length === 0 && !search && filtroEstado === 'todos'}
        emptyMessage=""
        defaultViewMode="cards"
        stickyHeader={true}
        secondaryFilters={renderSecondaryFilters()}
        tableView={
          <ABMTable
            data={filteredReclamos}
            columns={tableColumns}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => openViewSheet(r)}
          />
        }
      >
        {filteredReclamos.length === 0 && !search && filtroEstado === 'todos' ? (
          renderEmptyState()
        ) : filteredReclamos.length === 0 ? (
          <div className="col-span-full text-center py-12" style={{ color: theme.textSecondary }}>
            No se encontraron reclamos
            {(search || filtroEstado !== 'todos') && (
              <button
                onClick={() => { setSearch(''); setFiltroEstado('todos'); }}
                className="block mx-auto mt-2 text-sm"
                style={{ color: theme.primary }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          filteredReclamos.map((r) => {
            const estado = estadoColors[r.estado];
            const tieneImagen = r.documentos && r.documentos.length > 0;
            return (
              <ABMCard key={r.id} onClick={() => openViewSheet(r)}>
                <div className="flex gap-4">
                  {/* Imagen miniatura o placeholder */}
                  <div
                    className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: tieneImagen ? 'transparent' : `${r.categoria?.color || theme.primary}15` }}
                  >
                    {tieneImagen ? (
                      <img
                        src={r.documentos[0].url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <MapPin
                        className="h-8 w-8"
                        style={{ color: r.categoria?.color || theme.primary }}
                      />
                    )}
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    {/* Línea 1: Título + Estado */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold line-clamp-1" style={{ color: theme.text }}>
                        {r.titulo}
                      </p>
                      <span
                        className="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0"
                        style={{ backgroundColor: estado.bg, color: estado.text }}
                      >
                        {estadoLabels[r.estado]}
                      </span>
                    </div>

                    {/* Línea 2: Categoría + Fecha + Empleado */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: `${r.categoria?.color || theme.primary}15`, color: r.categoria?.color || theme.primary }}
                      >
                        {r.categoria.nombre}
                      </span>
                      <span className="text-xs flex items-center" style={{ color: theme.textSecondary }}>
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      {r.dependencia_asignada?.nombre && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-md flex items-center gap-1"
                          style={{
                            backgroundColor: `${r.dependencia_asignada.color || theme.primary}20`,
                            color: r.dependencia_asignada.color || theme.primary
                          }}
                        >
                          <DynamicIcon name={r.dependencia_asignada.icono || 'Building2'} className="h-3 w-3" />
                          {r.dependencia_asignada.nombre}
                        </span>
                      )}
                    </div>

                    {/* Línea 3: Descripción */}
                    <p className="text-sm mt-2 line-clamp-2" style={{ color: theme.textSecondary }}>
                      {r.descripcion}
                    </p>
                  </div>
                </div>

                {/* Footer con dirección y fechas */}
                <div
                  className="flex items-center justify-between mt-3 pt-3 text-xs"
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <span className="flex items-center truncate" style={{ color: theme.textSecondary }}>
                    <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                    <span className="truncate">{r.direccion}</span>
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    {/* Última actualización */}
                    {r.updated_at && (
                      <span className="flex items-center gap-1" style={{ color: theme.textSecondary }}>
                        <Clock className="h-3 w-3" />
                        {new Date(r.updated_at).toLocaleDateString()}
                      </span>
                    )}
                    {/* Por vencer - basado en fecha_programada */}
                    {r.fecha_programada && !['resuelto', 'rechazado'].includes(r.estado) && (() => {
                      const hoy = new Date();
                      hoy.setHours(0, 0, 0, 0);
                      const fechaVenc = new Date(r.fecha_programada);
                      fechaVenc.setHours(0, 0, 0, 0);
                      const diffMs = fechaVenc.getTime() - hoy.getTime();
                      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                      const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));

                      let texto = '';
                      let color = theme.textSecondary;

                      if (diffDias < 0) {
                        const diasVencidos = Math.abs(diffDias);
                        if (diasVencidos >= 7) {
                          texto = `Vencido (${Math.floor(diasVencidos / 7)}sem)`;
                        } else {
                          texto = `Vencido (${diasVencidos}d)`;
                        }
                        color = '#ef4444';
                      } else if (diffDias === 0) {
                        texto = 'Hoy';
                        color = '#f59e0b';
                      } else if (diffHoras <= 24) {
                        texto = `${diffHoras}h`;
                        color = '#f59e0b';
                      } else if (diffDias === 1) {
                        texto = 'Mañana';
                        color = '#eab308';
                      } else if (diffDias <= 7) {
                        texto = `${diffDias}d`;
                        color = diffDias <= 2 ? '#eab308' : theme.textSecondary;
                      } else {
                        texto = `${Math.floor(diffDias / 7)}sem`;
                      }

                      return (
                        <span className="font-medium" style={{ color }}>
                          {texto}
                        </span>
                      );
                    })()}
                    <Eye className="h-4 w-4" style={{ color: theme.primary }} />
                  </div>
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
                navigate(`/gestion/reclamos/${selectedReclamo.id}`);
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
