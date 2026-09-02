/**
 * DemoDniCard — herramienta del demostrador en Configuración.
 *
 * Cada demo real (QR + foto del DNI) deja un vecino verificado con ese DNI y
 * la próxima demo lo rechaza como "ya registrado". Este control libera el DNI
 * en TODOS los municipios demo de una: anonimiza esas cuentas viejas (el
 * guard de es_demo vive en el backend — un tenant productivo jamás entra).
 *
 * Sólo se muestra si el municipio actual es demo; el DNI queda recordado en
 * localStorage para no tipearlo en cada demo.
 */
import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { municipiosApi } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { ConfirmModal } from '../ui/ConfirmModal';

const CLAVE_LS = 'demo_dni';
const DNI_DEFAULT = '30217134';

export function DemoDniCard() {
  const { user } = useAuth();
  const [esDemo, setEsDemo] = useState(false);
  const [dni, setDni] = useState(() => localStorage.getItem(CLAVE_LS) || DNI_DEFAULT);
  const [confirmando, setConfirmando] = useState(false);
  const [liberando, setLiberando] = useState(false);

  useEffect(() => {
    if (!user?.municipio_id) return;
    municipiosApi
      .getOne(user.municipio_id)
      .then((r) => setEsDemo(!!r.data?.es_demo))
      .catch(() => setEsDemo(false));
  }, [user?.municipio_id]);

  if (!esDemo) return null;

  const liberar = async () => {
    setLiberando(true);
    try {
      const r = await municipiosApi.liberarDniDemo(dni);
      localStorage.setItem(CLAVE_LS, dni);
      const n = r.data.liberados;
      toast.success(
        n === 0
          ? `El DNI ${r.data.dni} ya estaba libre: podés registrarte con el QR.`
          : `DNI ${r.data.dni} liberado en ${r.data.municipios.length} municipio${r.data.municipios.length === 1 ? '' : 's'} demo (${n} cuenta${n === 1 ? '' : 's'}). Ya podés registrarte con el QR.`,
      );
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === 'string' ? msg : 'No se pudo liberar el DNI');
    } finally {
      setLiberando(false);
      setConfirmando(false);
    }
  };

  return (
    <div
      className="entrar-panel"
      style={{
        marginTop: '12px',
        background: 'var(--pl-surface)',
        border: '1px dashed var(--pl-border-strong)',
        borderRadius: '12px',
        padding: '16px 20px',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldCheck size={14} color="var(--pl-text-muted)" aria-hidden />
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em', color: 'var(--pl-text-faint)' }}>
          HERRAMIENTAS DE DEMO
        </span>
      </span>
      <p style={{ margin: '8px 0 0', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--pl-text-2)', maxWidth: '64ch', textWrap: 'pretty' }}>
        Para volver a registrarte con el QR y la foto de tu DNI real: esto libera el
        DNI en todos los municipios demo (las cuentas viejas quedan anónimas, con su
        historial). Los municipios productivos no se tocan nunca.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <input
          type="text"
          inputMode="numeric"
          value={dni}
          onChange={(e) => setDni(e.target.value.replace(/[^\d.]/g, '').slice(0, 10))}
          aria-label="DNI a liberar"
          className="av2-tnum"
          style={{
            height: '36px',
            padding: '0 12px',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            background: 'var(--pl-surface)',
            color: 'var(--pl-text)',
            border: '1px solid var(--pl-border-strong)',
            borderRadius: '10px',
            width: '140px',
          }}
        />
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={liberando || dni.replace(/\D/g, '').length < 6}
          className="av2-btn-secundario"
        >
          {liberando ? <Loader2 size={14} className="animate-spin" /> : <Eraser size={14} />}
          Liberar DNI demo
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmando}
        title="Liberar DNI en las demos"
        message={`Las cuentas de vecino con DNI ${dni} en municipios DEMO quedan anónimas y el DNI vuelve a estar libre para registrarse con el QR. Los municipios productivos no se tocan.`}
        onConfirm={liberar}
        onClose={() => setConfirmando(false)}
      />
    </div>
  );
}

export default DemoDniCard;
