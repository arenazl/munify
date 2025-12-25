import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, MapPin, User, Users, Tag, Calendar,
  CheckCircle, XCircle, AlertCircle, PlayCircle, FileText,
  MessageSquare, Sparkles, Image as ImageIcon, MessageCircle,
  RefreshCw, Send
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, whatsappApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import type { Reclamo, HistorialReclamo, EstadoReclamo } from '../types';

interface WhatsAppLog {
  id: number;
  telefono: string;
  tipo_mensaje: string;
  mensaje: string | null;
  enviado: boolean;
  error: string | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  type: 'historial' | 'whatsapp';
  created_at: string;
  data: HistorialReclamo | WhatsAppLog;
}

const tipoMensajeLabels: Record<string, string> = {
  reclamo_recibido: 'Notificación de reclamo recibido',
  cambio_estado: 'Notificación de cambio de estado',
  reclamo_resuelto: 'Notificación de reclamo resuelto',
  reclamo_asignado: 'Notificación de asignación',
  manual: 'Mensaje manual',
  test: 'Mensaje de prueba',
};

// Convertir errores técnicos a mensajes amigables
const getFriendlyError = (error: string): string => {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('invalid phone') || errorLower.includes('phone number') || errorLower.includes('número de teléfono')) {
    return 'Número de teléfono inválido o no registrado en WhatsApp';
  }
  if (errorLower.includes('not registered') || errorLower.includes('no registrado')) {
    return 'El número no está registrado en WhatsApp';
  }
  if (errorLower.includes('rate limit') || errorLower.includes('too many')) {
    return 'Límite de mensajes alcanzado, intente más tarde';
  }
  if (errorLower.includes('template') || errorLower.includes('plantilla')) {
    return 'Error en la plantilla del mensaje';
  }
  if (errorLower.includes('authentication') || errorLower.includes('token') || errorLower.includes('credentials')) {
    return 'Error de autenticación con WhatsApp';
  }
  if (errorLower.includes('timeout') || errorLower.includes('connection')) {
    return 'Error de conexión con el servidor de WhatsApp';
  }
  if (errorLower.includes('blocked') || errorLower.includes('bloqueado')) {
    return 'El usuario ha bloqueado los mensajes';
  }
  if (errorLower.includes('sin teléfono') || errorLower.includes('no phone') || errorLower.includes('telefono')) {
    return 'El usuario no tiene un número de teléfono registrado';
  }
  if (errorLower.includes('whatsapp no configurado') || errorLower.includes('not configured')) {
    return 'WhatsApp no está configurado para este municipio';
  }
  if (errorLower.includes('no habilitado') || errorLower.includes('disabled')) {
    return 'Las notificaciones de WhatsApp están deshabilitadas';
  }

  // Si el error es muy largo o técnico, mostrar un mensaje genérico
  if (error.length > 100) {
    return 'Error al enviar el mensaje';
  }

  return error;
};

const estadoConfig: Record<EstadoReclamo, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  nuevo: { label: 'Nuevo', color: '#6b7280', bg: '#f3f4f6', icon: AlertCircle },
  asignado: { label: 'Asignado', color: '#2563eb', bg: '#dbeafe', icon: Users },
  en_proceso: { label: 'En Proceso', color: '#d97706', bg: '#fef3c7', icon: PlayCircle },
  resuelto: { label: 'Resuelto', color: '#059669', bg: '#d1fae5', icon: CheckCircle },
  rechazado: { label: 'Rechazado', color: '#dc2626', bg: '#fee2e2', icon: XCircle },
};

const accionIcons: Record<string, typeof CheckCircle> = {
  creado: FileText,
  asignado: Users,
  'cambio de estado': AlertCircle,
  'inicio trabajo': PlayCircle,
  resuelto: CheckCircle,
  rechazado: XCircle,
  comentario: MessageSquare,
};

export default function ReclamoDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [reclamo, setReclamo] = useState<Reclamo | null>(null);
  const [historial, setHistorial] = useState<HistorialReclamo[]>([]);
  const [whatsappLogs, setWhatsappLogs] = useState<WhatsAppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  // Función para agregar comentario
  const handleAgregarComentario = async () => {
    if (!reclamo || !nuevoComentario.trim()) return;

    setEnviandoComentario(true);
    try {
      await reclamosApi.agregarComentario(reclamo.id, nuevoComentario.trim());
      toast.success('Comentario agregado');
      setNuevoComentario('');

      // Recargar historial
      const historialRes = await reclamosApi.getHistorial(reclamo.id);
      setHistorial(historialRes.data);
    } catch (err) {
      console.error('Error agregando comentario:', err);
      toast.error('Error al agregar el comentario');
    } finally {
      setEnviandoComentario(false);
    }
  };

  // Función para reenviar mensaje de WhatsApp
  const handleResendWhatsApp = async (log: WhatsAppLog) => {
    if (!reclamo) return;

    setResendingId(log.id);
    try {
      await whatsappApi.resend(reclamo.id, log.tipo_mensaje);
      toast.success('Mensaje reenviado correctamente');

      // Recargar logs de WhatsApp
      const logsRes = await whatsappApi.getLogsByReclamo(reclamo.id);
      setWhatsappLogs(logsRes.data);
    } catch (err) {
      console.error('Error reenviando WhatsApp:', err);
      toast.error('Error al reenviar el mensaje');
    } finally {
      setResendingId(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reclamoRes, historialRes] = await Promise.all([
          reclamosApi.getOne(Number(id)),
          reclamosApi.getHistorial(Number(id)),
        ]);
        setReclamo(reclamoRes.data);
        setHistorial(historialRes.data);

        // Cargar logs de WhatsApp (puede fallar si no hay permisos, ignorar)
        try {
          const logsRes = await whatsappApi.getLogsByReclamo(Number(id));
          setWhatsappLogs(logsRes.data);
        } catch {
          // Ignorar errores de logs de WhatsApp
        }
      } catch (err: unknown) {
        console.error('Error cargando reclamo:', err);
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosError = err as { response?: { status?: number } };
          if (axiosError.response?.status === 403) {
            setError('No tienes permiso para ver este reclamo');
          } else if (axiosError.response?.status === 404) {
            setError('Reclamo no encontrado');
          } else {
            setError('Error al cargar el reclamo');
          }
        } else {
          setError('Error al cargar el reclamo');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Combinar historial y logs de WhatsApp en un timeline unificado
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Agregar eventos del historial
    historial.forEach(h => {
      events.push({
        id: `historial-${h.id}`,
        type: 'historial',
        created_at: h.created_at,
        data: h,
      });
    });

    // Agregar logs de WhatsApp
    whatsappLogs.forEach(log => {
      events.push({
        id: `whatsapp-${log.id}`,
        type: 'whatsapp',
        created_at: log.created_at,
        data: log,
      });
    });

    // Ordenar por fecha (más reciente primero)
    return events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [historial, whatsappLogs]);

  const handleBack = () => {
    // Navegar a la lista correcta según el rol
    if (user?.rol === 'vecino') {
      navigate('/mis-reclamos');
    } else {
      navigate('/reclamos');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
            style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
          />
          <Sparkles
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse"
            style={{ color: theme.primary }}
          />
        </div>
        <p className="text-sm animate-pulse" style={{ color: theme.textSecondary }}>Cargando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:opacity-80"
          style={{ color: theme.textSecondary }}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <div
          className="text-center py-12 rounded-xl"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <XCircle className="h-12 w-12 mx-auto mb-4" style={{ color: '#ef4444' }} />
          <p className="text-lg font-medium" style={{ color: theme.text }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!reclamo) return null;

  const estadoActual = estadoConfig[reclamo.estado];
  const EstadoIcon = estadoActual.icon;

  return (
    <div className="space-y-6">
      {/* Header con botón volver */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:scale-105"
          style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <span className="text-sm" style={{ color: theme.textSecondary }}>
          Reclamo #{reclamo.id}
        </span>
      </div>

      {/* Card principal */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        {/* Header del reclamo */}
        <div
          className="p-6 border-b"
          style={{ borderColor: theme.border, background: `linear-gradient(135deg, ${estadoActual.bg}50 0%, transparent 100%)` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full"
                  style={{ backgroundColor: estadoActual.bg, color: estadoActual.color }}
                >
                  <EstadoIcon className="h-4 w-4" />
                  {estadoActual.label}
                </span>
                {reclamo.categoria && (
                  <span
                    className="px-3 py-1 text-sm rounded-full"
                    style={{
                      backgroundColor: reclamo.categoria.color ? `${reclamo.categoria.color}20` : theme.backgroundSecondary,
                      color: reclamo.categoria.color || theme.text
                    }}
                  >
                    {reclamo.categoria.nombre}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold" style={{ color: theme.text }}>
                {reclamo.titulo}
              </h1>
            </div>
            <div className="text-right">
              <p className="text-sm" style={{ color: theme.textSecondary }}>Creado el</p>
              <p className="font-medium" style={{ color: theme.text }}>
                {new Date(reclamo.created_at).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: Información del reclamo */}
          <div className="lg:col-span-2 space-y-6">
            {/* Descripción */}
            <div>
              <h3 className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Descripción
              </h3>
              <p style={{ color: theme.text }}>{reclamo.descripcion}</p>
            </div>

            {/* Ubicación */}
            <div
              className="p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                <div>
                  <p className="font-medium" style={{ color: theme.text }}>{reclamo.direccion}</p>
                  {reclamo.referencia && (
                    <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                      Referencia: {reclamo.referencia}
                    </p>
                  )}
                  {reclamo.zona && (
                    <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                      Zona: {reclamo.zona.nombre}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Info del creador */}
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium"
                style={{ backgroundColor: theme.primary }}
              >
                {reclamo.creador.nombre[0]}{reclamo.creador.apellido[0]}
              </div>
              <div>
                <p className="font-medium" style={{ color: theme.text }}>
                  {reclamo.creador.nombre} {reclamo.creador.apellido}
                </p>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  {reclamo.creador.email}
                </p>
              </div>
            </div>

            {/* Empleado asignado */}
            {reclamo.empleado_asignado && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5" style={{ color: theme.primary }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>Empleado Asignado</p>
                    <p className="font-medium" style={{ color: theme.text }}>
                      {reclamo.empleado_asignado.nombre}
                    </p>
                    {reclamo.empleado_asignado.especialidad && (
                      <p className="text-sm" style={{ color: theme.primary }}>
                        {reclamo.empleado_asignado.especialidad}
                      </p>
                    )}
                  </div>
                </div>
                {reclamo.fecha_programada && (
                  <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                    <Calendar className="h-4 w-4" />
                    Programado: {new Date(reclamo.fecha_programada).toLocaleDateString('es-AR')}
                    {reclamo.hora_inicio && reclamo.hora_fin && (
                      <span> de {reclamo.hora_inicio} a {reclamo.hora_fin}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Resolución */}
            {reclamo.resolucion && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid #059669` }}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 mt-0.5" style={{ color: '#059669' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#059669' }}>Resolución</p>
                    <p className="mt-1" style={{ color: theme.text }}>{reclamo.resolucion}</p>
                    {reclamo.fecha_resolucion && (
                      <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>
                        Resuelto el {new Date(reclamo.fecha_resolucion).toLocaleString('es-AR')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Motivo de rechazo */}
            {reclamo.motivo_rechazo && (
              <div
                className="p-4 rounded-xl"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid #dc2626` }}
              >
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 mt-0.5" style={{ color: '#dc2626' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#dc2626' }}>Motivo de Rechazo</p>
                    <p className="mt-1 capitalize" style={{ color: theme.text }}>
                      {reclamo.motivo_rechazo.replace(/_/g, ' ')}
                    </p>
                    {reclamo.descripcion_rechazo && (
                      <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                        {reclamo.descripcion_rechazo}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Documentos/Imágenes */}
            {reclamo.documentos && reclamo.documentos.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: theme.textSecondary }}>
                  <ImageIcon className="h-4 w-4" />
                  Imágenes adjuntas ({reclamo.documentos.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {reclamo.documentos.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                      style={{ border: `1px solid ${theme.border}` }}
                    >
                      <img
                        src={doc.url}
                        alt={doc.nombre_original}
                        className="w-full h-24 object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Formulario para agregar comentario */}
            {reclamo.estado !== 'resuelto' && reclamo.estado !== 'rechazado' && (
              <div
                className="p-4 rounded-xl mt-6"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                  <MessageSquare className="h-4 w-4" style={{ color: theme.primary }} />
                  Agregar comentario
                </h3>
                <div className="flex gap-2">
                  <textarea
                    value={nuevoComentario}
                    onChange={(e) => setNuevoComentario(e.target.value)}
                    placeholder="Escribe información adicional o una pregunta..."
                    rows={2}
                    className="flex-1 px-3 py-2 rounded-lg text-sm resize-none focus:ring-2 focus:outline-none"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                    disabled={enviandoComentario}
                  />
                  <button
                    onClick={handleAgregarComentario}
                    disabled={enviandoComentario || !nuevoComentario.trim()}
                    className="self-end px-4 py-2 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    style={{
                      backgroundColor: theme.primary,
                      color: '#ffffff',
                    }}
                  >
                    <Send className="h-4 w-4" />
                    {enviandoComentario ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
                <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
                  Tu comentario será visible para los empleados municipales
                </p>
              </div>
            )}
          </div>

          {/* Columna derecha: Timeline */}
          <div className="lg:col-span-1">
            <div
              className="sticky top-24 p-4 rounded-xl"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <h3 className="font-medium mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                <Clock className="h-4 w-4" style={{ color: theme.primary }} />
                Historial de Eventos
              </h3>

              {timelineEvents.length > 0 ? (
                <div className="relative">
                  {/* Línea vertical del timeline */}
                  <div
                    className="absolute left-3 top-2 bottom-2 w-0.5"
                    style={{ backgroundColor: theme.border }}
                  />

                  <div className="space-y-4">
                    {timelineEvents.map((event, index) => {
                      const isFirst = index === 0;

                      if (event.type === 'whatsapp') {
                        // Renderizar evento de WhatsApp
                        const log = event.data as WhatsAppLog;
                        return (
                          <div key={event.id} className="relative flex gap-3">
                            {/* Punto del timeline - verde para WhatsApp */}
                            <div
                              className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                              style={{
                                backgroundColor: log.enviado ? '#22c55e' : '#ef4444',
                                border: 'none'
                              }}
                            >
                              <MessageCircle className="h-3 w-3" style={{ color: '#ffffff' }} />
                            </div>

                            {/* Contenido del evento WhatsApp */}
                            <div className="flex-1 pb-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className="font-medium text-sm"
                                  style={{ color: log.enviado ? '#22c55e' : '#ef4444' }}
                                >
                                  WhatsApp {log.enviado ? 'enviado' : 'fallido'}
                                </span>
                                <span
                                  className="px-1.5 py-0.5 text-xs rounded"
                                  style={{
                                    backgroundColor: '#22c55e20',
                                    color: '#16a34a'
                                  }}
                                >
                                  {tipoMensajeLabels[log.tipo_mensaje] || log.tipo_mensaje}
                                </span>
                              </div>

                              {log.mensaje && (
                                <p className="text-sm mt-1 italic" style={{ color: theme.textSecondary }}>
                                  "{log.mensaje.substring(0, 100)}{log.mensaje.length > 100 ? '...' : ''}"
                                </p>
                              )}

                              {log.error && (
                                <div className="mt-1 flex items-center gap-2">
                                  <p className="text-sm" style={{ color: '#ef4444' }}>
                                    {getFriendlyError(log.error)}
                                  </p>
                                  {/* Botón de reenviar para admin/supervisor */}
                                  {user && ['admin', 'supervisor'].includes(user.rol) && (
                                    <button
                                      onClick={() => handleResendWhatsApp(log)}
                                      disabled={resendingId === log.id}
                                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                      style={{
                                        backgroundColor: theme.primary,
                                        color: '#ffffff'
                                      }}
                                      title="Reintentar envío"
                                    >
                                      <RefreshCw className={`h-3 w-3 ${resendingId === log.id ? 'animate-spin' : ''}`} />
                                      {resendingId === log.id ? 'Enviando...' : 'Reenviar'}
                                    </button>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: theme.textSecondary }}>
                                <span>Tel: {log.telefono}</span>
                                <span>•</span>
                                <span>
                                  {new Date(log.created_at).toLocaleDateString('es-AR', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // Renderizar evento del historial normal
                      const item = event.data as HistorialReclamo;
                      const ActionIcon = accionIcons[item.accion.toLowerCase()] || AlertCircle;

                      return (
                        <div key={event.id} className="relative flex gap-3">
                          {/* Punto del timeline */}
                          <div
                            className="relative z-10 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: isFirst ? theme.primary : theme.card,
                              border: isFirst ? 'none' : `2px solid ${theme.border}`
                            }}
                          >
                            <ActionIcon
                              className="h-3 w-3"
                              style={{ color: isFirst ? '#ffffff' : theme.textSecondary }}
                            />
                          </div>

                          {/* Contenido del evento */}
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="font-medium text-sm capitalize"
                                style={{ color: isFirst ? theme.primary : theme.text }}
                              >
                                {item.accion}
                              </span>
                              {item.estado_nuevo && (
                                <span
                                  className="px-1.5 py-0.5 text-xs rounded"
                                  style={{
                                    backgroundColor: estadoConfig[item.estado_nuevo]?.bg || theme.backgroundSecondary,
                                    color: estadoConfig[item.estado_nuevo]?.color || theme.text
                                  }}
                                >
                                  {estadoConfig[item.estado_nuevo]?.label || item.estado_nuevo}
                                </span>
                              )}
                            </div>

                            {item.comentario && (
                              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                                {item.comentario}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: theme.textSecondary }}>
                              <span>{item.usuario.nombre} {item.usuario.apellido}</span>
                              <span>•</span>
                              <span>
                                {new Date(item.created_at).toLocaleDateString('es-AR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>
                  Sin historial de eventos
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
