import { useEffect, useState } from 'react';
import { IdCard, Loader2, ShieldAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet } from '../ui/Sheet';
import { useTheme } from '../../contexts/ThemeContext';
import { operadorApi } from '../../lib/api';

export interface VecinoCreado {
  user_id: number;
  dni: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  nivel_verificacion: number;
  kyc_modo: string | null;
  verificado_at: string | null;
}

/**
 * Alta manual de vecino desde el Mostrador (sin biometria).
 *
 * Regla de negocio: el alta simple alcanza para RECLAMOS (y turnos).
 * Para TRAMITES el vecino tiene que validar identidad con RENAPER
 * (opcion "Por celular") — el backend rechaza con 403 kyc_insuficiente.
 */
export function AltaManualVecinoSheet({ open, dniInicial, onClose, onCreado }: {
  open: boolean;
  dniInicial?: string;
  onClose: () => void;
  onCreado: (v: VecinoCreado) => void;
}) {
  const { theme } = useTheme();
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setDni((dniInicial || '').replace(/\D/g, '').slice(0, 9));
      setNombre('');
      setApellido('');
      setTelefono('');
      setEmail('');
    }
  }, [open, dniInicial]);

  const valido = dni.trim().length >= 6 && nombre.trim().length > 0 && apellido.trim().length > 0;

  const guardar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      const r = await operadorApi.altaManualVecino({
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
      });
      toast.success(`Vecino ${r.data.nombre} ${r.data.apellido} listo`);
      onCreado(r.data);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo crear el vecino');
    } finally {
      setGuardando(false);
    }
  };

  const inputStyle = {
    backgroundColor: theme.backgroundSecondary,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cargar vecino a mano"
      description="Alta simple sin validación biométrica"
      stickyFooter={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!valido || guardando}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
            style={{ backgroundColor: theme.primary }}
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Crear vecino
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
          style={{ backgroundColor: '#f59e0b10', border: '1px solid #f59e0b40', color: theme.textSecondary }}
        >
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} />
          <p>
            El alta a mano <b style={{ color: theme.text }}>sirve para reclamos y turnos</b>.
            Para iniciar un <b style={{ color: theme.text }}>trámite</b>, el vecino tiene que
            validar su identidad con RENAPER (opción "Por celular").
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
            DNI <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={inputStyle}>
            <IdCard className="w-4 h-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
            <input
              type="text"
              inputMode="numeric"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="Sin puntos"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono tabular-nums"
              style={{ color: theme.text }}
              maxLength={9}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
              Nombre <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
              Apellido <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
              Teléfono
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: theme.text }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        <p className="text-[11px]" style={{ color: theme.textSecondary }}>
          Si ya existe un vecino con ese DNI en el padrón, se reutiliza su ficha
          (no se duplica).
        </p>
      </div>
    </Sheet>
  );
}
