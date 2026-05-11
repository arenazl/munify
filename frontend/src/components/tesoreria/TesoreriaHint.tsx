import { Lightbulb, X } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

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
  const [hidden, setHidden] = useState(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(`tesoreria_hint_${storageKey}`) === '1';
    } catch {
      return false;
    }
  });

  if (hidden) return null;

  const dismiss = () => {
    if (storageKey) {
      try { localStorage.setItem(`tesoreria_hint_${storageKey}`, '1'); } catch { /* ignore */ }
    }
    setHidden(true);
  };

  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3 mb-4"
      style={{
        backgroundColor: `${theme.primary}10`,
        border: `1px solid ${theme.primary}30`,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
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
  );
}
