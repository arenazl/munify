import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Sub-header estandar para pantallas mobile con contexto.
 *
 * Se usa DEBAJO de la topbar principal del Layout (nunca la reemplaza) para
 * dar contexto de la pantalla actual — titulo, subtitulo, back button y
 * acciones opcionales.
 *
 * Patron:
 *   [topbar principal: muni + bell + hamburger]  (del Layout)
 *   [MobilePageHeader: ← back · Titulo · Sub · acciones]  (este)
 *   [contenido]
 *   [bottom nav]
 *
 * Uso dentro de un <Sheet>: se monta arriba del contenido, el ← cierra
 * el sheet en vez de navegar.
 *
 * Uso en una pagina standalone: el ← hace navigate(-1).
 */
interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: ReactNode;
  /** Color de acento (ej: color de la categoria del tramite). Default: primary. */
  accentColor?: string;
}

export function MobilePageHeader({ title, subtitle, onBack, actions, accentColor }: Props) {
  const { theme } = useTheme();
  const accent = accentColor || theme.primary;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
      style={{
        borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.card,
      }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver"
        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 hover:scale-105 flex-shrink-0"
        style={{
          backgroundColor: `${accent}15`,
          color: accent,
          border: `1px solid ${accent}30`,
        }}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-bold truncate" style={{ color: theme.text }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs truncate" style={{ color: theme.textSecondary }}>
            {subtitle}
          </p>
        )}
      </div>

      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
