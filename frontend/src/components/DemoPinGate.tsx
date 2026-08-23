import { useState } from 'react';
import { Lock, Loader2, X } from 'lucide-react';
import { BRAND } from '../brands';

/**
 * DemoPinGate — modal de clave numérica para demos PROTEGIDAS.
 *
 * La botonera de perfiles se muestra igual para cualquiera, pero al tocar un
 * perfil este modal pide el PIN del municipio. El PIN no se valida acá: ES la
 * password real de los usuarios demo, así que el gate verdadero lo hace
 * /auth/login contra el hash. Este componente solo lo recolecta.
 *
 * Dumb component: el padre decide cuándo abrir, qué hacer con el PIN y qué
 * error mostrar. Estilado sobre fondo oscuro (Login/DemoReady son pantallas
 * pre-theme, slate fijo) con el acento de la marca.
 */
interface DemoPinGateProps {
  abierto: boolean;
  nombreMunicipio: string;
  cargando?: boolean;
  error?: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

export function DemoPinGate({ abierto, ...resto }: DemoPinGateProps) {
  // El diálogo interno se monta recién al abrir: cada apertura arranca con
  // el estado limpio por montaje (sin resetear en un efecto) y el autoFocus
  // del input funciona solo.
  if (!abierto) return null;
  return <PinDialog {...resto} />;
}

function PinDialog({ nombreMunicipio, cargando, error, onSubmit, onClose }: Omit<DemoPinGateProps, 'abierto'>) {
  const [pin, setPin] = useState('');

  const valido = /^\d{4,8}$/.test(pin);
  const enviar = () => {
    if (valido && !cargando) onSubmit(pin);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-slate-800 border border-slate-700 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${BRAND.primary}26` }}
          >
            <Lock className="w-5 h-5" style={{ color: BRAND.primary }} />
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h2 className="text-white font-semibold text-lg mb-1">Demo protegida</h2>
        <p className="text-slate-400 text-sm mb-4">
          Ingresá el PIN de acceso de {nombreMunicipio} para entrar con este perfil.
        </p>

        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
          placeholder="PIN numérico"
          className="w-full rounded-xl bg-slate-900 border border-slate-600 px-4 py-3 text-white text-base tracking-[0.4em] text-center placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:border-slate-400"
        />

        {error && (
          <p className="text-red-400 text-sm mt-3">{error}</p>
        )}

        <button
          onClick={enviar}
          disabled={!valido || cargando}
          className="w-full mt-4 rounded-xl py-3 font-medium text-white transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ backgroundColor: BRAND.primary }}
        >
          {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
          Entrar
        </button>
      </div>
    </div>
  );
}

export default DemoPinGate;
