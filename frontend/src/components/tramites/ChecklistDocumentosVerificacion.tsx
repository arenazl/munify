import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  FileText,
  ExternalLink,
  AlertCircle,
  Upload,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import type { ChecklistDocumentos, ChecklistDocumentoItem } from '../../types';

interface Props {
  solicitudId: number;
  /** Si es true, no muestra ningún botón de acción (vista estática). */
  readOnly?: boolean;
  /**
   * Vista del vecino: oculta botones de verificación/verificar-visual
   * (son del supervisor) pero permite subir sus propios documentos.
   */
  asVecino?: boolean;
  /** Callback al cambiar verificación/upload, para que el caller refresque la solicitud */
  onChange?: () => void;
}

/**
 * Checklist de verificación de documentos requeridos por una solicitud.
 *
 * Flujo flexible: para cada documento requerido del trámite, el supervisor puede:
 *
 *   1. **Subir archivo**: abre file picker, sube a Cloudinary y lo vincula al
 *      tramite_documento_requerido_id. El archivo queda sin verificar — hay que
 *      tildarlo después con el checkbox (puede hacerlo el mismo o otro humano).
 *
 *   2. **Verificar visualmente sin archivo**: si el empleado vio el documento
 *      físicamente en ventanilla, tilda "OK" sin digitalizar nada. El backend
 *      crea un placeholder con tipo='verificacion_manual' y verificado=true.
 *
 *   3. **Tildar/destildar verificación**: si ya hay documento (archivo o visual),
 *      el checkbox lo marca/desmarca como verificado.
 *
 * Mientras quede algún documento obligatorio sin verificar, el backend bloquea
 * la transición `recibido → en_curso` con un 400.
 */
export function ChecklistDocumentosVerificacion({ solicitudId, readOnly = false, asVecino = false, onChange }: Props) {
  const { theme } = useTheme();
  const [data, setData] = useState<ChecklistDocumentos | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // `cargar` tiene un flag para decidir si muestra el spinner grande. Solo el
  // load inicial lo usa. Los refreshes después de acciones (upload, verificar,
  // desverificar) pasan `false` para hacer un update silencioso — así no se
  // "blanquea" todo el modal en cada click. El feedback per-fila ya lo da el
  // spinner chico del `actionLoading`.
  const cargar = async (mostrarSplash = false) => {
    if (mostrarSplash) setLoading(true);
    try {
      const res = await tramitesApi.getChecklistDocumentos(solicitudId);
      setData(res.data);
    } catch (err) {
      console.error('Error cargando checklist', err);
    } finally {
      if (mostrarSplash) setLoading(false);
    }
  };

  useEffect(() => {
    cargar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudId]);

  const toggleVerificacion = async (item: ChecklistDocumentoItem) => {
    if (!item.documento_id) {
      toast.error('Este documento aún no fue subido ni verificado visualmente');
      return;
    }
    const key = `toggle-${item.documento_id}`;
    setActionLoading(key);
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
      setActionLoading(null);
    }
  };

  const handleUpload = async (item: ChecklistDocumentoItem, file: File) => {
    if (!item.requerido_id) return;
    const key = `upload-${item.requerido_id}`;
    setActionLoading(key);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await tramitesApi.uploadDocumento(solicitudId, formData, {
        tramite_documento_requerido_id: item.requerido_id,
      });
      toast.success(`"${file.name}" subido correctamente. Falta tildar la verificación.`);
      await cargar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error subiendo archivo');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerificarVisual = async (item: ChecklistDocumentoItem) => {
    if (!item.requerido_id) return;
    const key = `visual-${item.requerido_id}`;
    setActionLoading(key);
    try {
      await tramitesApi.verificarSinArchivo(solicitudId, item.requerido_id);
      toast.success(`"${item.nombre}" marcado como verificado visualmente.`);
      await cargar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error marcando verificación visual');
    } finally {
      setActionLoading(null);
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
          const hasDocumento = !!item.documento_id;
          const esVerificacionVisual = item.documento_tipo === 'verificacion_manual';
          const toggleKey = `toggle-${item.documento_id}`;
          const uploadKey = `upload-${item.requerido_id}`;
          const visualKey = `visual-${item.requerido_id}`;
          const isTogglingThis = actionLoading === toggleKey;
          const isUploadingThis = actionLoading === uploadKey;
          const isVisualThis = actionLoading === visualKey;

          return (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `1px solid ${item.verificado ? '#10b98140' : theme.border}`,
              }}
            >
              {/* Checkbox (oculto para vecino — solo supervisor marca verificado) */}
              {asVecino ? (
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    backgroundColor: item.verificado ? '#10b981' : theme.card,
                    border: `2px solid ${item.verificado ? '#10b981' : theme.border}`,
                  }}
                  title={item.verificado ? 'Verificado por el municipio' : 'Pendiente de verificación'}
                >
                  {item.verificado ? <Check className="h-4 w-4 text-white" /> : null}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={readOnly || !hasDocumento || isTogglingThis}
                  onClick={() => toggleVerificacion(item)}
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-0.5"
                  style={{
                    backgroundColor: item.verificado ? '#10b981' : theme.card,
                    border: `2px solid ${item.verificado ? '#10b981' : theme.border}`,
                  }}
                  title={
                    !hasDocumento
                      ? 'Subí un archivo o marcá como verificado visualmente primero'
                      : item.verificado
                      ? 'Click para desmarcar'
                      : 'Click para marcar como verificado'
                  }
                >
                  {isTogglingThis ? (
                    <Loader2 className="h-3 w-3 animate-spin text-white" />
                  ) : item.verificado ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : null}
                </button>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
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

                {/* Estado actual del documento */}
                <div className="mt-2 ml-6 flex items-center gap-3 text-xs flex-wrap" style={{ color: theme.textSecondary }}>
                  {!hasDocumento && (
                    <span className="italic">Sin cargar</span>
                  )}
                  {hasDocumento && esVerificacionVisual && (
                    <span className="flex items-center gap-1" style={{ color: '#10b981' }}>
                      <Eye className="h-3 w-3" />
                      Verificado visualmente en ventanilla
                    </span>
                  )}
                  {hasDocumento && !esVerificacionVisual && item.documento_url && (
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
                  )}
                  {item.verificado && item.verificado_por_nombre && (
                    <span>
                      ✓ por <strong>{item.verificado_por_nombre}</strong>
                      {item.fecha_verificacion && (
                        <> el {new Date(item.fecha_verificacion).toLocaleDateString('es-AR')}</>
                      )}
                    </span>
                  )}
                </div>

                {/* Acciones: upload para vecino y supervisor; "verificar visual" solo supervisor */}
                {!readOnly && !hasDocumento && (
                  <div className="mt-2 ml-6 flex items-center gap-2 flex-wrap">
                    <input
                      ref={el => { if (item.requerido_id) fileInputRefs.current[item.requerido_id] = el; }}
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/jpg,image/webp,image/gif,application/pdf"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(item, file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={isUploadingThis || isVisualThis}
                      onClick={() => item.requerido_id && fileInputRefs.current[item.requerido_id]?.click()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      style={{
                        backgroundColor: `${theme.primary}15`,
                        color: theme.primary,
                        border: `1px solid ${theme.primary}40`,
                      }}
                    >
                      {isUploadingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Subir archivo
                    </button>
                    {!asVecino && (
                      <button
                        type="button"
                        disabled={isUploadingThis || isVisualThis}
                        onClick={() => handleVerificarVisual(item)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                        style={{
                          backgroundColor: '#10b98115',
                          color: '#10b981',
                          border: '1px solid #10b98140',
                        }}
                      >
                        {isVisualThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                        Verificado sin archivo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
