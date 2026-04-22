import { useEffect, useState, useRef, useCallback } from 'react';
import { FileText, Upload, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { cenatApi } from '../../lib/api';

/**
 * Visor/uploader del comprobante CENAT (Agencia Nacional de Seguridad Vial).
 *
 * El pago del CENAT es externo a Munify — el vecino lo paga en el sitio
 * oficial de ANSV y sube el comprobante acá como documento. Este componente:
 *   - Muestra el estado (requiere / no requiere / adjunto / verificado).
 *   - Permite subir un nuevo comprobante (si requiere y no hay / si hubo rechazo).
 *   - Muestra preview del adjunto cuando ya está.
 */
export function CenatAdjunto({ solicitudId }: { solicitudId: number }) {
  const { theme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<{
    requiere_cenat: boolean;
    monto_cenat_referencia: number | null;
    tiene_adjunto: boolean;
    verificado: boolean;
    adjunto_url: string | null;
    adjunto_nombre: string | null;
    adjunto_subido_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const r = await cenatApi.status(solicitudId);
      setStatus(r.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [solicitudId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await cenatApi.subir(solicitudId, file);
      toast.success('Comprobante CENAT subido');
      await refetch();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo subir el comprobante');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando CENAT…
      </div>
    );
  }

  if (!status || !status.requiere_cenat) return null;

  const color = status.verificado
    ? '#22c55e'
    : status.tiene_adjunto
      ? '#3b82f6'
      : '#f59e0b';

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: theme.card, border: `1.5px solid ${color}60` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}20` }}
          >
            {status.verificado ? (
              <CheckCircle2 className="w-5 h-5" style={{ color }} />
            ) : status.tiene_adjunto ? (
              <FileText className="w-5 h-5" style={{ color }} />
            ) : (
              <AlertTriangle className="w-5 h-5" style={{ color }} />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: theme.text }}>
              CENAT — Certificado Nacional Antecedentes de Tránsito
            </p>
            <p className="text-xs" style={{ color: theme.textSecondary }}>
              {status.verificado
                ? 'Comprobante verificado por el municipio'
                : status.tiene_adjunto
                  ? 'Comprobante subido — pendiente de verificación'
                  : 'Se paga en la Agencia Nacional de Seguridad Vial (externo a Munify). Subí el comprobante acá.'}
            </p>
            {status.monto_cenat_referencia != null && !status.tiene_adjunto && (
              <p className="text-[11px] mt-1" style={{ color: theme.textSecondary }}>
                Monto aproximado: ${status.monto_cenat_referencia.toLocaleString('es-AR')}
              </p>
            )}
          </div>
        </div>
      </div>

      {status.tiene_adjunto && status.adjunto_url && (
        <a
          href={status.adjunto_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
          style={{ color: theme.primary }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver {status.adjunto_nombre || 'comprobante'}
        </a>
      )}

      {(!status.verificado || !status.tiene_adjunto) && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: `${color}20`,
              color,
              border: `1px solid ${color}60`,
            }}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {status.tiene_adjunto ? 'Subir otro comprobante' : 'Adjuntar comprobante CENAT'}
          </button>
        </div>
      )}
    </div>
  );
}
