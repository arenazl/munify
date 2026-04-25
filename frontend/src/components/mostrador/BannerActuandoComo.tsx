/**
 * Banner que se muestra arriba de NuevoReclamoPage / NuevoTramitePage / MisTasas
 * cuando vienen con `?actuando_como=<user_id>` desde el Mostrador.
 *
 * Sirve para que el operador vea claramente: "estás cargando esto a nombre
 * de Lucas Arenaz, no de vos mismo".
 *
 * El hook useMostradorContext() lee el query param + sessionStorage para
 * armar el contexto. Los wizards lo usan para:
 *   1. Renderizar este banner.
 *   2. Mandar `actuando_como_user_id` al backend (canal=ventanilla_asistida).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, UserCheck, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export interface MostradorContext {
  user_id: number;
  dni: string | null;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  kyc_session_id: string | null;
  operador_id: number;
  operador_nombre: string;
}

/**
 * Lee el contexto del mostrador desde query params + sessionStorage.
 * Retorna null si no hay `actuando_como` en la URL (uso normal del wizard).
 */
export function useMostradorContext(): MostradorContext | null {
  const [params] = useSearchParams();
  const actuandoComo = params.get('actuando_como');

  return useMemo(() => {
    if (!actuandoComo) return null;
    const userId = parseInt(actuandoComo, 10);
    if (!Number.isFinite(userId)) return null;

    try {
      const raw = sessionStorage.getItem('mostrador_ctx');
      if (!raw) return null;
      const ctx = JSON.parse(raw) as MostradorContext;
      // Defensa: solo válido si el user_id del contexto coincide
      if (ctx.user_id !== userId) return null;
      return ctx;
    } catch {
      return null;
    }
  }, [actuandoComo]);
}

interface BannerProps {
  ctx: MostradorContext;
  onSalir?: () => void;
}

export function BannerActuandoComo({ ctx, onSalir }: BannerProps) {
  const { theme } = useTheme();
  return (
    <div
      className="rounded-lg p-3 mb-3 flex items-center gap-3"
      style={{
        background: 'linear-gradient(90deg, #f59e0b15 0%, #f59e0b08 100%)',
        border: '1px solid #f59e0b50',
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#f59e0b25', color: '#d97706' }}
      >
        <UserCheck className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#d97706' }}>
            Modo ventanilla
          </span>
          {ctx.kyc_session_id && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
              <ShieldCheck className="w-3 h-3" /> RENAPER
            </span>
          )}
        </div>
        <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
          Actuando como {ctx.nombre || '—'} {ctx.apellido || ''}
          {ctx.dni && <span className="font-mono text-xs ml-2" style={{ color: theme.textSecondary }}>DNI {ctx.dni}</span>}
        </p>
        <p className="text-[11px]" style={{ color: theme.textSecondary }}>
          Operador: {ctx.operador_nombre} · Lo que cargues queda registrado a nombre del vecino, con tu firma como operador.
        </p>
      </div>
      {onSalir && (
        <button
          onClick={onSalir}
          className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors hover:bg-black/5"
          style={{ color: theme.textSecondary, border: `1px solid ${theme.border}` }}
          title="Volver al Mostrador"
        >
          <X className="w-3 h-3" />
          Salir
        </button>
      )}
    </div>
  );
}
