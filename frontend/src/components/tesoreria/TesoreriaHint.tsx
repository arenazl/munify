import { Lightbulb, X } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { getHintScopeKey } from '../../utils/hintScope';

interface Props {
  /** Titulo del banner */
  titulo: string;
  /** Contenido del consejo (string o ReactNode) */
  children: ReactNode;
  /** Key para recordar si el usuario ya lo cerro (localStorage). Si null, no es cerrable. */
  storageKey?: string;
}

/**
 * Banner guia para las pantallas de Tesoreria.
 *
 * El intendente (usuario primario del modulo) es una persona grande, asi
 * que cada pantalla del modulo arranca con un banner que explica en 2-3
 * lineas que hace la pantalla y como usarla. Reglas:
 *   - Texto grande, contraste alto.
 *   - Idioma simple, sin jerga.
 *   - Cerrable solo si paso `storageKey` (asi vuelve a aparecer si limpia
 *     localStorage).
 */
export function TesoreriaHint({ titulo, children, storageKey }: Props) {
  const { theme } = useTheme();
  // Key del dismiss scopeada por usuario + municipio: si ese perfil lo cierra en
  // ese muni, no le vuelve a aparecer ahi; otro usuario (o el super-admin en otro
  // muni) lo ve de nuevo. scope es estado para reaccionar al cambio de muni.
  const [scope, setScope] = useState(getHintScopeKey);
  const dismissKey = storageKey ? `tesoreria_hint_${storageKey}_${scope}` : null;
  const [hidden, setHidden] = useState(() => {
    if (!dismissKey) return false;
    try {
      return localStorage.getItem(dismissKey) === '1';
    } catch {
      return false;
    }
  });

  // El super-admin cambia de municipio con el switcher → recalcular scope.
  useEffect(() => {
    const onMuniChanged = () => setScope(getHintScopeKey());
    window.addEventListener('municipio-changed', onMuniChanged);
    return () => window.removeEventListener('municipio-changed', onMuniChanged);
  }, []);

  // Al cambiar el scope (otro muni/usuario), re-evaluar si esta cerrado.
  useEffect(() => {
    if (!dismissKey) { setHidden(false); return; }
    try { setHidden(localStorage.getItem(dismissKey) === '1'); } catch { setHidden(false); }
  }, [dismissKey]);

  if (hidden) return null;

  const dismiss = () => {
    if (dismissKey) {
      try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
    }
    setHidden(true);
  };

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-xl shadow-sm"
      style={{
        background: `linear-gradient(135deg, ${theme.primary}12 0%, ${theme.primary}06 60%, ${theme.card} 100%)`,
        border: `1px solid ${theme.primary}30`,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: theme.primary }} />
      <div className="p-4 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ backgroundColor: `${theme.primary}25`, color: theme.primary }}
        >
          <Lightbulb className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base mb-1" style={{ color: theme.text }}>
            {titulo}
          </h3>
          <div className="text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
            {children}
          </div>
        </div>
        {storageKey && (
          <button
            type="button"
            onClick={dismiss}
            className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
            style={{ color: theme.textSecondary }}
            aria-label="Cerrar consejo"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
