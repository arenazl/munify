import { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QrCode, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

/**
 * QR FIJO de cartelería del municipio.
 *
 * Es el segundo QR del sistema (el primero es el dinámico del mostrador para
 * la validación biométrica asistida). Este es ESTÁTICO: se imprime y se pega
 * en la cartelería del municipio. El vecino lo escanea con su celular y cae
 * directo en el acceso de SU municipio (`/{codigo}` → login/registro del
 * muni), donde puede dejar un reclamo anónimo, registrarse con biometría
 * para un trámite, o sacar turno.
 */
export function QRCarteleria() {
  const { theme } = useTheme();
  const { municipioActual } = useAuth();
  const canvasVisibleRef = useRef<HTMLDivElement>(null);
  const canvasDescargaRef = useRef<HTMLDivElement>(null);

  if (!municipioActual?.codigo) return null;

  // En prod: https://app.munify.com.ar/{codigo}. Usar el origin real hace que
  // funcione igual en previews/local sin hardcodear el dominio.
  const url = `${window.location.origin}/${municipioActual.codigo}`;

  const descargar = () => {
    const canvas = canvasDescargaRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('No se pudo generar el QR');
      return;
    }
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-${municipioActual.codigo}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('QR descargado — listo para imprimir');
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${theme.primary}20` }}
        >
          <QrCode className="h-5 w-5" style={{ color: theme.primary }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: theme.text }}>
            QR de cartelería
          </h2>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Para imprimir y pegar en el municipio: lleva al acceso de {municipioActual.nombre}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div
          ref={canvasVisibleRef}
          className="p-3 rounded-xl"
          style={{ backgroundColor: '#ffffff', border: `1px solid ${theme.border}` }}
        >
          <QRCodeCanvas value={url} size={160} level="M" />
        </div>
        <div className="flex-1 space-y-3 text-center sm:text-left">
          <p className="text-sm font-mono px-3 py-2 rounded-lg inline-block"
             style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
            {url}
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            El vecino escanea y entra directo al acceso de su municipio: reclamo
            anónimo, registro con validación biométrica, trámites y turnos.
          </p>
          <button
            onClick={descargar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white"
            style={{ backgroundColor: theme.primary }}
          >
            <Download className="h-4 w-4" />
            Descargar PNG (alta resolución)
          </button>
        </div>
      </div>

      {/* Canvas oculto en alta resolución, solo para la descarga imprimible */}
      <div ref={canvasDescargaRef} className="hidden">
        <QRCodeCanvas value={url} size={1024} level="H" includeMargin />
      </div>
    </div>
  );
}
