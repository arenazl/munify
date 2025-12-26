import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Star, CheckCircle, XCircle, AlertCircle, Loader2, MessageSquare, Send } from 'lucide-react';
import { calificacionesApi } from '../lib/api';
import { toast } from 'sonner';

interface ReclamoInfo {
  id: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  fecha_resolucion: string | null;
  resolucion: string | null;
  ya_calificado: boolean;
  creador_nombre: string;
}

export default function CalificarReclamo() {
  const { id } = useParams<{ id: string }>();
  const [reclamo, setReclamo] = useState<ReclamoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puntuacion, setPuntuacion] = useState(0);
  const [hoverPuntuacion, setHoverPuntuacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    const fetchReclamo = async () => {
      try {
        const response = await calificacionesApi.getInfoPublica(Number(id));
        setReclamo(response.data);

        if (response.data.ya_calificado) {
          setEnviado(true);
        }
      } catch (err: unknown) {
        console.error('Error cargando reclamo:', err);
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosError = err as { response?: { data?: { detail?: string } } };
          setError(axiosError.response?.data?.detail || 'Error al cargar el reclamo');
        } else {
          setError('Error al cargar el reclamo');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReclamo();
  }, [id]);

  const handleEnviar = async () => {
    if (puntuacion === 0) {
      toast.error('Por favor selecciona una calificación');
      return;
    }

    setEnviando(true);
    try {
      await calificacionesApi.calificarPublica(Number(id), {
        puntuacion,
        comentario: comentario.trim() || undefined
      });

      setEnviado(true);
      toast.success('¡Gracias por tu calificación!');
    } catch (err: unknown) {
      console.error('Error enviando calificación:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        toast.error(axiosError.response?.data?.detail || 'Error al enviar la calificación');
      } else {
        toast.error('Error al enviar la calificación');
      }
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!reclamo) return null;

  // Pantalla de agradecimiento
  if (enviado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">¡Gracias!</h1>
          <p className="text-gray-600 mb-4">
            Tu opinión nos ayuda a mejorar el servicio municipal.
          </p>
          {puntuacion > 0 && (
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-8 w-8 ${star <= puntuacion ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                />
              ))}
            </div>
          )}
          <p className="text-sm text-gray-500">
            Reclamo #{reclamo.id} - {reclamo.titulo}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Califica tu Reclamo
          </h1>
          <p className="text-gray-600 text-sm">
            Tu opinión nos ayuda a mejorar
          </p>
        </div>

        {/* Info del reclamo */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-800">{reclamo.titulo}</p>
              <p className="text-sm text-gray-500 mt-1">
                {reclamo.categoria}
              </p>
              {reclamo.resolucion && (
                <p className="text-sm text-green-600 mt-2 italic">
                  "{reclamo.resolucion}"
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Estrellas */}
        <div className="text-center mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">
            ¿Cómo calificarías la atención recibida?
          </p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setPuntuacion(star)}
                onMouseEnter={() => setHoverPuntuacion(star)}
                onMouseLeave={() => setHoverPuntuacion(0)}
                className="p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-10 w-10 transition-colors ${
                    star <= (hoverPuntuacion || puntuacion)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          {puntuacion > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {puntuacion === 1 && 'Muy malo'}
              {puntuacion === 2 && 'Malo'}
              {puntuacion === 3 && 'Regular'}
              {puntuacion === 4 && 'Bueno'}
              {puntuacion === 5 && 'Excelente'}
            </p>
          )}
        </div>

        {/* Comentario opcional */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <MessageSquare className="h-4 w-4" />
            Comentario (opcional)
          </label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Cuéntanos más sobre tu experiencia..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-shadow"
          />
        </div>

        {/* Botón enviar */}
        <button
          onClick={handleEnviar}
          disabled={enviando || puntuacion === 0}
          className="w-full py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            color: 'white',
          }}
        >
          {enviando ? (
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

        {/* Footer */}
        <p className="text-xs text-gray-400 text-center mt-4">
          Reclamo #{reclamo.id} • {reclamo.creador_nombre}
        </p>
      </div>
    </div>
  );
}
