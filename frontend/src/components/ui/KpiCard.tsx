import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

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
  // Gradiente con DOS tintas: acento del tema (theme.primary) arriba-izq +
  // color propio del KPI abajo-der. Asi todas las cards comparten lenguaje
  // visual (acento del tema), pero cada una mantiene su identidad por el
  // color del icon-tile/border. Highlighted usa tintas mas fuertes.
  const tintAccent = highlighted ? '2E' : '1A'; // ~18% / 10%
  const tintColor  = highlighted ? '33' : '1F'; // ~20% / 12%
  const gradient = `linear-gradient(135deg, ${theme.primary}${tintAccent} 0%, ${theme.card} 45%, ${color}${tintColor} 100%)`;
  return (
    <div
      className={`rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${className}`}
      style={{
        background: gradient,
        backgroundColor: theme.card,
        border: `${highlighted ? 2 : 1}px solid ${color}`,
      }}
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
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}>
      {items.map((k, i) => (
        <KpiCard key={k.label + i} {...k} />
      ))}
      {trailing}
    </div>
  );
}

export default KpiCard;
