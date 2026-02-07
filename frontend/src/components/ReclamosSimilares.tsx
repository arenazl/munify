import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, MapPin, Calendar, Eye, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export interface ReclamoSimilar {
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
  similares: ReclamoSimilar[];
  onClose: () => void;
  onContinueAnyway: () => void;
  onViewSimilar: (id: number) => void;
  onSumarse?: (id: number) => Promise<void>;
}

const estadoConfig: Record<string, { label: string; color: string; bg: string }> = {
  nuevo: { label: 'Nuevo', color: '#6b7280', bg: '#f3f4f6' },
  asignado: { label: 'Asignado', color: '#2563eb', bg: '#dbeafe' },
  en_curso: { label: 'En Proceso', color: '#d97706', bg: '#fef3c7' },
  resuelto: { label: 'Resuelto', color: '#059669', bg: '#d1fae5' },
  rechazado: { label: 'Rechazado', color: '#dc2626', bg: '#fee2e2' },
};

export function ReclamosSimilares({
  similares,
  onClose,
  onContinueAnyway,
  onViewSimilar,
  onSumarse,
}: ReclamosSimilaresProps) {
  const { theme } = useTheme();
  const [submitting, setSubmitting] = useState<number | null>(null);

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

  // Si no hay similares, no mostrar nada
  if (similares.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 10000 }}
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

                {/* Botones de acción */}
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => onViewSimilar(reclamo.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                    style={{
                      backgroundColor: theme.primary,
                      color: '#ffffff',
                    }}
                  >
                    <Eye className="h-4 w-4" />
                    <span>Ver detalles</span>
                  </button>
                  {onSumarse && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubmitting(reclamo.id);
                        onSumarse(reclamo.id)
                          .catch(() => {
                            // Error already handled by parent
                          })
                          .finally(() => {
                            setSubmitting(null);
                          });
                      }}
                      disabled={submitting === reclamo.id}
                      className="flex-1 flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                      style={{
                        backgroundColor: submitting === reclamo.id ? theme.textSecondary : '#10b981',
                        color: '#ffffff',
                        opacity: submitting === reclamo.id ? 0.6 : 1,
                        cursor: submitting === reclamo.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {submitting === reclamo.id ? 'Sumándote...' : 'Sumarme'}
                    </button>
                  )}
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
