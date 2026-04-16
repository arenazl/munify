import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  XCircle,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { tramitesApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import type { ChecklistDocumentoItem } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  solicitudId: number;
  items: ChecklistDocumentoItem[];
  /** Callback despues de aprobar/rechazar — el caller recarga data. */
  onChange?: () => void;
  /** Indice inicial (default 0). */
  startIndex?: number;
}

/**
 * Modal full-screen para que el supervisor revise los documentos del tramite:
 * - Navegacion ← → entre N documentos.
 * - Viewer con zoom (imagenes) o iframe (PDF).
 * - Footer con Aprobar / Rechazar (con motivo).
 *
 * Aprobar = llama verificarDocumento, el doc queda verificado.
 * Rechazar = abre textarea con motivo, llama rechazarDocumento. El vecino
 * vera el motivo en su checklist y puede resubir el documento.
 */
export function DocumentReviewModal({ open, onClose, solicitudId, items, onChange, startIndex = 0 }: Props) {
  const { theme } = useTheme();
  const [idx, setIdx] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [rechazoModo, setRechazoModo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Solo mostrar items con documento cargado (los "sin cargar" no se revisan).
  const docs = items.filter(it => !!it.documento_id && !!it.documento_url);
  const current = docs[idx];

  useEffect(() => {
    if (open) {
      setIdx(Math.min(startIndex, Math.max(0, docs.length - 1)));
      setZoom(1);
      setRechazoModo(false);
      setMotivo('');
    }
  }, [open, startIndex, docs.length]);

  useEffect(() => {
    setZoom(1);
    setRechazoModo(false);
    setMotivo('');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [idx]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx(i => Math.min(docs.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, docs.length, onClose]);

  if (!open) return null;
  if (docs.length === 0) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          className="rounded-xl p-6 max-w-sm text-center"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.text }}
          onClick={e => e.stopPropagation()}
        >
          <AlertTriangle className="h-8 w-8 mx-auto mb-3" style={{ color: '#f59e0b' }} />
          <p className="text-sm">Todavía no hay documentos cargados para revisar.</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            Cerrar
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const isPdf = (current?.documento_url || '').toLowerCase().includes('.pdf') ||
                 current?.documento_tipo === 'documento';
  const isVisual = current?.documento_tipo === 'verificacion_manual';

  const goPrev = () => setIdx(i => Math.max(0, i - 1));
  const goNext = () => setIdx(i => Math.min(docs.length - 1, i + 1));

  const aprobar = async () => {
    if (!current?.documento_id) return;
    setSubmitting(true);
    try {
      await tramitesApi.verificarDocumento(solicitudId, current.documento_id);
      toast.success(`"${current.nombre}" aprobado`);
      onChange?.();
      if (idx < docs.length - 1) goNext();
      else onClose();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Error aprobando documento');
    } finally {
      setSubmitting(false);
    }
  };

  const rechazar = async () => {
    if (!current?.documento_id) return;
    if (motivo.trim().length < 5) {
      toast.error('Escribí un motivo claro (mínimo 5 caracteres)');
      return;
    }
    setSubmitting(true);
    try {
      await tramitesApi.rechazarDocumento(solicitudId, current.documento_id, motivo.trim());
      toast.success(`"${current.nombre}" rechazado. El vecino va a ver tu comentario.`);
      onChange?.();
      if (idx < docs.length - 1) {
        setIdx(i => i + 1);
      } else {
        onClose();
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || 'Error rechazando documento');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: '#000000ee' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: theme.card, borderBottom: `1px solid ${theme.border}` }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Documento {idx + 1} de {docs.length}
          </p>
          <h3 className="text-sm font-semibold truncate" style={{ color: theme.text }}>
            {current?.nombre}
            {current?.obligatorio && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
                Obligatorio
              </span>
            )}
          </h3>
        </div>
        {/* Zoom (solo imagenes) */}
        {!isPdf && !isVisual && (
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs px-2" style={{ color: theme.textSecondary }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        )}
        {current?.documento_url && !isVisual && (
          <a
            href={current.documento_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            title="Abrir en otra pestaña"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
      </div>

      {/* Descripcion del requerido */}
      {current?.descripcion && (
        <div className="px-4 py-2 text-xs flex-shrink-0" style={{ color: theme.textSecondary, backgroundColor: theme.card }}>
          {current.descripcion}
        </div>
      )}

      {/* Estado actual si ya fue aprobado/rechazado */}
      {current?.verificado && (
        <div className="px-4 py-2 text-xs flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: '#10b98115', color: '#10b981', borderTop: `1px solid #10b98130` }}>
          <Check className="h-4 w-4" />
          Ya aprobado {current.verificado_por_nombre ? `por ${current.verificado_por_nombre}` : ''}
        </div>
      )}
      {current?.rechazado && (
        <div className="px-4 py-2 text-xs flex-shrink-0" style={{ backgroundColor: '#ef444415', color: '#ef4444', borderTop: `1px solid #ef444430` }}>
          <div className="flex items-center gap-2 font-semibold">
            <XCircle className="h-4 w-4" />
            Rechazado {current.rechazado_por_nombre ? `por ${current.rechazado_por_nombre}` : ''}
          </div>
          <div className="mt-0.5 pl-6">Motivo: {current.motivo_rechazo}</div>
        </div>
      )}

      {/* Viewer */}
      <div className="flex-1 min-h-0 relative" ref={scrollRef} style={{ overflow: 'auto' }}>
        {/* Navegacion lateral */}
        {idx > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center z-10 transition-all active:scale-90"
            style={{ backgroundColor: theme.card, color: theme.text, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {idx < docs.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center z-10 transition-all active:scale-90"
            style={{ backgroundColor: theme.card, color: theme.text, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
            aria-label="Siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Contenido del doc */}
        {isVisual ? (
          <div className="flex items-center justify-center h-full p-6 text-center" style={{ color: '#fff' }}>
            <div>
              <div className="text-6xl mb-3">👁️</div>
              <p className="text-lg font-semibold">Verificado visualmente en ventanilla</p>
              <p className="text-sm opacity-70 mt-1">No hay archivo digital — el empleado vio el documento físico.</p>
            </div>
          </div>
        ) : isPdf ? (
          <iframe
            src={current.documento_url}
            title={current.nombre}
            className="w-full h-full border-0"
            style={{ backgroundColor: '#fff' }}
          />
        ) : (
          <div className="flex items-center justify-center min-h-full p-4">
            <img
              src={current?.documento_url}
              alt={current?.nombre}
              draggable={false}
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center',
                transition: 'transform 0.15s ease',
                maxWidth: zoom === 1 ? '100%' : 'none',
                maxHeight: zoom === 1 ? 'calc(100vh - 220px)' : 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* Footer acciones */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{ backgroundColor: theme.card, borderTop: `1px solid ${theme.border}`, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        {rechazoModo ? (
          <div className="space-y-3">
            <label className="block text-xs font-medium" style={{ color: theme.text }}>
              Motivo del rechazo (lo va a ver el vecino)
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: La foto está borrosa, no se lee el DNI. Resubí una más nítida."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setRechazoModo(false); setMotivo(''); }}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              >
                Cancelar
              </button>
              <button
                onClick={rechazar}
                disabled={submitting || motivo.trim().length < 5}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff' }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirmar rechazo
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setRechazoModo(true)}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444440' }}
            >
              <XCircle className="h-5 w-5" />
              Rechazar
            </button>
            <button
              onClick={aprobar}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px #10b98140' }}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              Aprobar
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
