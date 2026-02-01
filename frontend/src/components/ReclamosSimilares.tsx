import { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Calendar, Eye, X } from 'lucide-react';
import { reclamosApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';

interface ReclamoSimilar {
  id: number;
  titulo: string;
  descripcion: string;
  direccion: string;
  estado: string;
  categoria: string;
  zona: string;
  created_at: string;
  creador: {
    nombre: string;
    apellido: string;
  };
  distancia_metros: number | null;
}

interface ReclamosSimilaresProps {
  categoriaId: number | null;
  latitud: number | null;
  longitud: number | null;
  onClose: () => void;
  onContinueAnyway: () => void;
  onViewSimilar: (id: number) => void;
}

const estadoConfig: Record<string, { label: string; color: string; bg: string }> = {
  nuevo: { label: 'Nuevo', color: '#6b7280', bg: '#f3f4f6' },
  asignado: { label: 'Asignado', color: '#2563eb', bg: '#dbeafe' },
  en_curso: { label: 'En Proceso', color: '#d97706', bg: '#fef3c7' },
  resuelto: { label: 'Resuelto', color: '#059669', bg: '#d1fae5' },
  rechazado: { label: 'Rechazado', color: '#dc2626', bg: '#fee2e2' },
};

export function ReclamosSimilares({
  categoriaId,
  latitud,
  longitud,
  onClose,
  onContinueAnyway,
  onViewSimilar,
}: ReclamosSimilaresProps) {
  const { theme } = useTheme();
  const [similares, setSimilares] = useState<ReclamoSimilar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!categoriaId) {
      setLoading(false);
      return;
    }

    const fetchSimilares = async () => {
      try {
        setLoading(true);
        const response = await reclamosApi.getSimilares({
          categoria_id: categoriaId,
          latitud: latitud || undefined,
          longitud: longitud || undefined,
          radio_metros: 100,
          dias_atras: 30,
          limit: 5,
        });
        setSimilares(response.data);
      } catch (err) {
        console.error('Error buscando reclamos similares:', err);
        toast.error('Error al buscar reclamos similares');
      } finally {
        setLoading(false);
      }
    };

    fetchSimilares();
  }, [categoriaId, latitud, longitud]);

  const formatFecha = (fecha: string) => {
    const date = new Date(fecha);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return null; // No mostrar nada mientras carga
  }

  if (similares.length === 0) {
    return null; // No hay similares, no mostrar alerta
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="w-full max-w-2xl rounded-lg shadow-xl max-h-[80vh] overflow-y-auto"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 p-6 border-b flex items-start justify-between"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.card,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-full"
              style={{ backgroundColor: '#fef3c7' }}
            >
              <AlertTriangle className="h-6 w-6" style={{ color: '#d97706' }} />
            </div>
            <div>
              <h2
                className="text-xl font-bold"
                style={{ color: theme.text }}
              >
                Encontramos reclamos similares
              </h2>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                Ya hay {similares.length} {similares.length === 1 ? 'reclamo similar' : 'reclamos similares'} reportados en la zona
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-opacity-80 transition-colors"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <X className="h-5 w-5" style={{ color: theme.text }} />
          </button>
        </div>

        {/* Lista de similares */}
        <div className="p-6 space-y-4">
          {similares.map((reclamo) => {
            const estadoInfo = estadoConfig[reclamo.estado] || estadoConfig.nuevo;

            return (
              <div
                key={reclamo.id}
                className="p-4 rounded-lg border cursor-pointer hover:shadow-md transition-all"
                style={{
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                }}
                onClick={() => onViewSimilar(reclamo.id)}
              >
                {/* Título y estado */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3
                    className="font-semibold text-base flex-1"
                    style={{ color: theme.text }}
                  >
                    {reclamo.titulo}
                  </h3>
                  <span
                    className="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: estadoInfo.bg,
                      color: estadoInfo.color,
                    }}
                  >
                    {estadoInfo.label}
                  </span>
                </div>

                {/* Información */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                    <MapPin className="h-4 w-4" />
                    <span>{reclamo.direccion}</span>
                    {reclamo.distancia_metros && (
                      <span className="text-xs">
                        ({reclamo.distancia_metros}m de distancia)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm" style={{ color: theme.textSecondary }}>
                    <Calendar className="h-4 w-4" />
                    <span>Reportado {formatFecha(reclamo.created_at)}</span>
                    {reclamo.creador && (
                      <span>
                        por {reclamo.creador.nombre} {reclamo.creador.apellido}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botón ver detalles */}
                <div className="mt-3 flex items-center gap-2 text-sm font-medium" style={{ color: theme.primary }}>
                  <Eye className="h-4 w-4" />
                  <span>Ver detalles</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer con acciones */}
        <div
          className="sticky bottom-0 p-6 border-t flex gap-3"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.card,
          }}
        >
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onContinueAnyway}
            className="flex-1 px-4 py-3 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: theme.primary,
              color: '#ffffff',
            }}
          >
            Crear de todos modos
          </button>
        </div>
      </div>
    </div>
  );
}
