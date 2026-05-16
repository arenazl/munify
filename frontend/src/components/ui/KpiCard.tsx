import { ReactNode, CSSProperties } from 'react';
import { LucideIcon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

// =====================================================================
// Constantes del lenguaje visual del KpiCard (estaticas, NO del tema):
// ajustar aca si se quiere cambiar el look del gradient/border. Lo unico
// que viene del tema son los COLORES (--color-primary y --bg-card via CSS
// vars + color-mix), porque eso si cambia con dark/light/preset.
// =====================================================================
const GRADIENT_ANGLE = '135deg';
const GRADIENT_STOP_MID = '45%';
const TINT_ACCENT     = '10%';
const TINT_COLOR      = '12%';
const TINT_ACCENT_HI  = '18%';
const TINT_COLOR_HI   = '20%';
const BORDER_W    = '1px';
const BORDER_W_HI = '2px';

// KpiCard — card de metrica unificada para ABM pages.
// Look outlined: bg theme.card + border 1px del color del KPI + icon-tile
// pastel del mismo color a la izquierda + numero grande + label + footnote.
//
// El KPI principal (highlighted=true) usa el mismo estilo outlined pero con
// border mas grueso (2px) y border-color del color del KPI. NO usa fill
// (regla del proyecto: outlined siempre).
//
// Uso:
//   <KpiCard
//     label="Gastado este mes"
//     value="$15.412.500"
//     icon={Wallet}
//     color="#22c55e"
//     footnote="50 movimientos"
//   />

export interface KpiSpec {
  /** Label corto en mayuscula (ej: 'PERSONAL'). */
  label: string;
  /** Valor principal ya formateado (ej: '$13.969k'). */
  value: string;
  /** Icono lucide. */
  icon: LucideIcon;
  /** Color hex del KPI. Tinta border, dot, icono e icon-tile. */
  color: string;
  /** Texto chico debajo del valor (ej: '90.6% · 3 mov.'). */
  footnote?: string;
  /** Si true, border 2px (KPI destacado). Default false. */
  highlighted?: boolean;
  /** Porcentaje 0-100 para la barrita de proporcion. Si null/undefined no se muestra. */
  pct?: number | null;
}

interface KpiCardProps extends KpiSpec {
  className?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  footnote,
  highlighted = false,
  pct,
  className = '',
}: KpiCardProps) {
  const { theme } = useTheme();
  // Colores vienen del tema (via CSS vars + color-mix nativo). Tintas/angulo/
  // paradas son constantes del componente (no dependen del tema).
  const tintAccent = highlighted ? TINT_ACCENT_HI : TINT_ACCENT;
  const tintColor  = highlighted ? TINT_COLOR_HI  : TINT_COLOR;
  const borderW    = highlighted ? BORDER_W_HI    : BORDER_W;
  const cardStyle: CSSProperties = {
    background:
      `linear-gradient(${GRADIENT_ANGLE},` +
      ` color-mix(in srgb, var(--color-primary) ${tintAccent}, transparent) 0%,` +
      ` var(--bg-card) ${GRADIENT_STOP_MID},` +
      ` color-mix(in srgb, ${color} ${tintColor}, transparent) 100%)`,
    backgroundColor: theme.card,
    border: `${borderW} solid ${color}`,
  };
  return (
    <div
      className={`rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${className}`}
      style={cardStyle}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div
          className="text-[10px] uppercase font-bold tracking-wider truncate flex-1"
          style={{ color: theme.textSecondary }}
        >
          {label}
        </div>
      </div>
      <div
        className="text-[28px] leading-none font-bold tabular-nums"
        style={{ color: theme.text }}
      >
        {value}
      </div>
      {(footnote || pct != null) && (
        <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: theme.textSecondary }}>
          {footnote && <span className="truncate">{footnote}</span>}
          {pct != null && (
            <div
              className="ml-auto w-12 h-1 rounded-full overflow-hidden flex-shrink-0"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// KpiRow — fila de 4 KPIs (grid responsive). Lleva el grid + props para
// que las paginas no tengan que repetir el layout.
interface KpiRowProps {
  kpis: KpiSpec[];
  /** Slot opcional al final (ej: boton 'Ver mas'). */
  trailing?: ReactNode;
  className?: string;
}

export function KpiRow({ kpis, trailing, className = '' }: KpiRowProps) {
  // Hard-limit a 4 KPIs (regla del proyecto).
  const items = kpis.slice(0, 4);
  // Grid se adapta a la cantidad real para que no queden cards huerfanas
  // en la ultima fila (ej. 3 kpis en grilla de 4 dejaba 1 solo abajo).
  const gridCols = items.length === 1
    ? 'grid-cols-1'
    : items.length === 2
      ? 'grid-cols-2'
      : items.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4';
  return (
    <div className={`grid ${gridCols} gap-3 ${className}`}>
      {items.map((k, i) => (
        <KpiCard key={k.label + i} {...k} />
      ))}
      {trailing}
    </div>
  );
}

export default KpiCard;
