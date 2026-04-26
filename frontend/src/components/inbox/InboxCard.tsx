import { ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ChevronRight, Clock, User as UserIcon, AlertCircle, Calendar } from 'lucide-react';

export type InboxCardDensity = 'large' | 'compact' | 'row';

interface InboxCardProps {
  /** Identificador visible: "#0061" o "SOL-2026-7800058". */
  numero: string;
  /** Título principal: tipo de trámite o categoría de reclamo. */
  titulo: string;
  /** Subtítulo opcional: asunto / descripción corta. */
  subtitulo?: string;
  /** Nombre del solicitante / vecino. */
  solicitante?: string | null;
  /** Texto de tiempo: "hace 2 horas", "Vence en 1 día", etc. */
  tiempoLabel?: string;
  /** Texto de antigüedad: "Creado hace 5d", solo se muestra en `large`. */
  creadoLabel?: string;
  /** Color de acento (categoría, dependencia, estado). */
  color: string;
  /** Ícono representativo (de la categoría / tipo). */
  icono?: ReactNode;
  /** Badges adicionales arriba a la derecha (urgencia, pago, etc). */
  badges?: Array<{ label: string; color: string }>;
  /** Texto del CTA principal. Default: "Abrir". */
  ctaLabel?: string;
  /** Acción principal (click en la card o en el botón). */
  onClick: () => void;
  /** Si urgente, le da borde y sombra rojizos. */
  urgente?: boolean;
  /** Densidad visual: large=card vertical (default), compact=card chica sin subtítulo, row=fila horizontal tipo tabla. */
  density?: InboxCardDensity;
}

/**
 * Card individual del Inbox. Diseño claro, alto contraste, accionable.
 * Click en cualquier parte abre el detalle (mismo handler que el CTA).
 *
 * Soporta 3 densidades para adaptarse a la cantidad de items en la sección.
 */
export function InboxCard({
  numero,
  titulo,
  subtitulo,
  solicitante,
  tiempoLabel,
  creadoLabel,
  color,
  icono,
  badges,
  ctaLabel = 'Abrir',
  onClick,
  urgente,
  density = 'large',
}: InboxCardProps) {
  // Si subtítulo == título es info duplicada, no la mostramos.
  const subtituloEfectivo = subtitulo && subtitulo.trim().toLowerCase() !== titulo.trim().toLowerCase()
    ? subtitulo
    : undefined;
  const { theme } = useTheme();

  const borderColor = urgente ? '#ef4444' : color + '40';
  const borderWidth = urgente ? '2px' : '1px';
  const shadow = urgente ? '0 6px 20px rgba(239, 68, 68, 0.15)' : 'none';

  // ============================================================
  // Density: ROW — fila horizontal tipo tabla (sub-tabla densa)
  // ============================================================
  if (density === 'row') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-lg px-3 py-2 flex items-center gap-3 transition-all hover:scale-[1.005] active:scale-[0.995] hover:shadow-md group"
        style={{
          backgroundColor: theme.card,
          border: `${borderWidth} solid ${borderColor}`,
          boxShadow: shadow,
        }}
      >
        {icono && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {icono}
          </div>
        )}
        <p
          className="text-[10px] font-mono font-bold tracking-wider uppercase flex-shrink-0 hidden md:block"
          style={{ color: theme.textSecondary }}
        >
          {numero}
        </p>
        <p
          className="text-sm font-semibold leading-tight truncate flex-1 min-w-0"
          style={{ color: theme.text }}
        >
          {titulo}
        </p>
        {solicitante && (
          <span
            className="hidden lg:inline-flex items-center gap-1 text-[11px] flex-shrink-0 max-w-[160px]"
            style={{ color: theme.textSecondary }}
          >
            <UserIcon className="w-3 h-3" />
            <span className="truncate">{solicitante}</span>
          </span>
        )}
        {badges && badges.length > 0 && (
          <span
            className="hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: `${badges[0].color}20`, color: badges[0].color }}
          >
            {badges[0].label}
          </span>
        )}
        {tiempoLabel && (
          <span
            className="inline-flex items-center gap-1 text-[11px] flex-shrink-0"
            style={{ color: urgente ? '#ef4444' : theme.textSecondary, fontWeight: urgente ? 600 : 400 }}
          >
            <Clock className="w-3 h-3" />
            {tiempoLabel}
          </span>
        )}
        {urgente && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
          >
            <AlertCircle className="w-3 h-3" />
            URG
          </span>
        )}
        <div
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white flex-shrink-0 transition-all group-hover:brightness-110"
          style={{ backgroundColor: color }}
        >
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>
    );
  }

  // ============================================================
  // Density: COMPACT — card chica sin subtítulo, footer en una línea
  // ============================================================
  if (density === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-xl p-3 flex flex-col gap-2 transition-all hover:scale-[1.015] active:scale-[0.99] hover:shadow-md group"
        style={{
          backgroundColor: theme.card,
          border: `${borderWidth} solid ${borderColor}`,
          boxShadow: shadow,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icono && (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {icono}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p
              className="text-[9px] font-mono font-bold tracking-wider uppercase truncate"
              style={{ color: theme.textSecondary }}
            >
              {numero}
            </p>
            <p
              className="text-xs font-bold leading-tight truncate"
              style={{ color: theme.text }}
            >
              {titulo}
            </p>
          </div>
          {urgente && (
            <span
              className="inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0"
              style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
            >
              <AlertCircle className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          {solicitante && (
            <span
              className="inline-flex items-center gap-0.5 truncate max-w-[110px]"
              style={{ color: theme.textSecondary }}
            >
              <UserIcon className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{solicitante}</span>
            </span>
          )}
          {tiempoLabel && (
            <span
              className="inline-flex items-center gap-0.5 ml-auto"
              style={{ color: urgente ? '#ef4444' : theme.textSecondary, fontWeight: urgente ? 600 : 400 }}
            >
              <Clock className="w-2.5 h-2.5" />
              {tiempoLabel}
            </span>
          )}
        </div>

        {badges && badges.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {badges.map((b, i) => (
              <span
                key={i}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${b.color}20`, color: b.color }}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        <div
          className="inline-flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white transition-all group-hover:brightness-110 mt-auto"
          style={{ backgroundColor: color }}
        >
          <span>{ctaLabel}</span>
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>
    );
  }

  // ============================================================
  // Density: LARGE (default) — card vertical compacta con info rica
  // ============================================================
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl p-3 flex flex-col gap-2 transition-all hover:scale-[1.015] active:scale-[0.99] hover:shadow-md group"
      style={{
        backgroundColor: theme.card,
        border: `${borderWidth} solid ${borderColor}`,
        boxShadow: shadow,
      }}
    >
      {/* Header: icono + número/título + URGENTE */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icono && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {icono}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p
              className="text-[9px] font-mono font-bold tracking-wider uppercase truncate"
              style={{ color: theme.textSecondary }}
            >
              {numero}
            </p>
            <p
              className="text-sm font-bold leading-tight truncate"
              style={{ color: theme.text }}
            >
              {titulo}
            </p>
          </div>
        </div>
        {urgente && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
          >
            <AlertCircle className="w-3 h-3" />
            URGENTE
          </span>
        )}
      </div>

      {/* Subtítulo (asunto / descripción) — solo si aporta info distinta del título */}
      {subtituloEfectivo && (
        <p
          className="text-[11px] leading-snug line-clamp-2"
          style={{ color: theme.textSecondary }}
        >
          {subtituloEfectivo}
        </p>
      )}

      {/* Meta-info: vecino + vencimiento + creación + badges */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]" style={{ color: theme.textSecondary }}>
        {solicitante && (
          <span className="inline-flex items-center gap-1 min-w-0">
            <UserIcon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{solicitante}</span>
          </span>
        )}
        {tiempoLabel && (
          <span
            className="inline-flex items-center gap-1"
            style={{ color: urgente ? '#ef4444' : theme.textSecondary, fontWeight: urgente ? 600 : 400 }}
          >
            <Clock className="w-3 h-3" />
            {tiempoLabel}
          </span>
        )}
        {creadoLabel && (
          <span className="inline-flex items-center gap-1 opacity-70">
            <Calendar className="w-3 h-3" />
            {creadoLabel}
          </span>
        )}
        {badges && badges.length > 0 && badges.map((b, i) => (
          <span
            key={i}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${b.color}20`, color: b.color }}
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* CTA — más bajo, mismo color de acento */}
      <div
        className="inline-flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all group-hover:brightness-110 mt-1"
        style={{ backgroundColor: color }}
      >
        <span>{ctaLabel}</span>
        <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
