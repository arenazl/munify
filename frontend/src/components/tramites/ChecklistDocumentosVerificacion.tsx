import { useEffect, useState } from 'react';
import { Check, Loader2, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import type { ChecklistDocumentos, ChecklistDocumentoItem } from '../../types';

interface Props {
  solicitudId: number;
  /** Si el supervisor puede tildar (admin/supervisor) o solo lectura (vecino) */
  readOnly?: boolean;
  /** Callback al cambiar verificación, para que el caller refresque la solicitud */
  onChange?: () => void;
}

/**
 * Checklist de verificación de documentos requeridos por una solicitud.
 *
 * El supervisor ve cada documento requerido del trámite, si fue subido o no,
 * y puede tildarlo como verificado. Mientras falte alguno obligatorio sin
 * verificar, el backend bloquea la transición de `recibido` → `en_curso`.
 */
export function ChecklistDocumentosVerificacion({ solicitudId, readOnly = false, onChange }: Props) {
  const { theme } = useTheme();
  const [data, setData] = useState<ChecklistDocumentos | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificandoId, setVerificandoId] = useState<number | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await tramitesApi.getChecklistDocumentos(solicitudId);
      setData(res.data);
    } catch (err) {
      console.error('Error cargando checklist', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudId]);

  const toggleVerificacion = async (item: ChecklistDocumentoItem) => {
    if (!item.documento_id) {
      toast.error('Este documento aún no fue subido');
      return;
    }
    setVerificandoId(item.documento_id);
    try {
      if (item.verificado) {
        await tramitesApi.desverificarDocumento(solicitudId, item.documento_id);
      } else {
        await tramitesApi.verificarDocumento(solicitudId, item.documento_id);
      }
      await cargar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error verificando documento');
    } finally {
      setVerificandoId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="text-sm italic text-center py-4" style={{ color: theme.textSecondary }}>
        Este trámite no tiene documentos requeridos definidos.
      </div>
    );
  }

  const obligatoriosFaltantes = data.total_obligatorios - data.total_obligatorios_verificados;

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div
        className="p-3 rounded-xl flex items-center gap-3"
        style={{
          backgroundColor: data.todos_verificados ? '#10b98115' : '#f59e0b15',
          border: `1px solid ${data.todos_verificados ? '#10b98140' : '#f59e0b40'}`,
        }}
      >
        {data.todos_verificados ? (
          <Check className="h-5 w-5 flex-shrink-0" style={{ color: '#10b981' }} />
        ) : (
          <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: '#f59e0b' }} />
        )}
        <div className="flex-1 text-sm" style={{ color: theme.text }}>
          {data.todos_verificados ? (
            <span>Todos los documentos obligatorios están verificados.</span>
          ) : (
            <span>
              Faltan <strong>{obligatoriosFaltantes}</strong> documento{obligatoriosFaltantes !== 1 ? 's' : ''} obligatorio{obligatoriosFaltantes !== 1 ? 's' : ''} sin verificar.
              No se puede pasar a "En curso" hasta completarlos.
            </span>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {data.items.map((item, idx) => {
          const subido = !!item.documento_id;
          const isLoading = verificandoId === item.documento_id;
          return (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${item.verificado ? '#10b98140' : theme.border}`,
              }}
            >
              {/* Checkbox */}
              <button
                type="button"
                disabled={readOnly || !subido || isLoading}
                onClick={() => toggleVerificacion(item)}
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: item.verificado ? '#10b981' : theme.card,
                  border: `2px solid ${item.verificado ? '#10b981' : theme.border}`,
                }}
                title={
                  !subido
                    ? 'El vecino aún no subió este documento'
                    : item.verificado
                    ? 'Click para desmarcar'
                    : 'Click para marcar como verificado'
                }
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                ) : item.verificado ? (
                  <Check className="h-4 w-4 text-white" />
                ) : null}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  <span className="text-sm font-medium" style={{ color: theme.text }}>
                    {item.nombre}
                  </span>
                  {item.obligatorio && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                      Obligatorio
                    </span>
                  )}
                </div>
                {item.descripcion && (
                  <p className="text-xs mt-1 ml-6" style={{ color: theme.textSecondary }}>
                    {item.descripcion}
                  </p>
                )}
                <div className="mt-2 ml-6 flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
                  {subido ? (
                    <>
                      <a
                        href={item.documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline"
                        style={{ color: theme.primary }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {item.documento_nombre}
                      </a>
                      {item.verificado && item.verificado_por_nombre && (
                        <span>
                          ✓ Verificado por <strong>{item.verificado_por_nombre}</strong>
                          {item.fecha_verificacion && (
                            <> el {new Date(item.fecha_verificacion).toLocaleDateString('es-AR')}</>
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="italic">Pendiente de carga del vecino</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
