import { ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ChevronRight, Clock, User as UserIcon, AlertCircle } from 'lucide-react';

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
}

/**
 * Card individual del Inbox. Diseño claro, alto contraste, accionable.
 * Click en cualquier parte abre el detalle (mismo handler que el CTA).
 */
export function InboxCard({
  numero,
  titulo,
  subtitulo,
  solicitante,
  tiempoLabel,
  color,
  icono,
  badges,
  ctaLabel = 'Abrir',
  onClick,
  urgente,
}: InboxCardProps) {
  const { theme } = useTheme();

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 flex flex-col gap-3 transition-all hover:scale-[1.015] active:scale-[0.99] hover:shadow-lg group"
      style={{
        backgroundColor: theme.card,
        border: `${urgente ? '2px' : '1px'} solid ${urgente ? '#ef4444' : color + '40'}`,
        boxShadow: urgente ? '0 6px 20px rgba(239, 68, 68, 0.15)' : 'none',
      }}
    >
      {/* Header: número + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icono && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {icono}
            </div>
          )}
          <div className="min-w-0">
            <p
              className="text-[10px] font-mono font-bold tracking-wider uppercase"
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

      {/* Subtítulo (asunto / descripción) */}
      {subtitulo && (
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: theme.textSecondary }}
        >
          {subtitulo}
        </p>
      )}

      {/* Footer: vecino + tiempo + CTA */}
      <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
        {solicitante && (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: theme.textSecondary }}
          >
            <UserIcon className="w-3 h-3" />
            <span className="truncate max-w-[140px]">{solicitante}</span>
          </span>
        )}
        {tiempoLabel && (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: urgente ? '#ef4444' : theme.textSecondary, fontWeight: urgente ? 600 : 400 }}
          >
            <Clock className="w-3 h-3" />
            {tiempoLabel}
          </span>
        )}
      </div>

      {/* Badges extra (estado de pago, etc) */}
      {badges && badges.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {badges.map((b, i) => (
            <span
              key={i}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${b.color}20`, color: b.color }}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <div
        className="inline-flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-all group-hover:brightness-110"
        style={{ backgroundColor: color }}
      >
        <span>{ctaLabel}</span>
        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
