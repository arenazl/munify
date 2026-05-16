import { useTheme } from '../../contexts/ThemeContext';

// StatusPill — pill de estado unificada para tablas y listados.
// Look estandar: pastel claro del color de fondo (15-18% de opacidad),
// border sutil del mismo color (40%), dot solido del color a la izquierda,
// label del mismo color del dot. Texto en mayuscula+bold size XS.
//
// Uso:
//   <StatusPill label="Finalizado" color="#22c55e" />
//   <StatusPill label="En Curso"  color="#f59e0b" />
//   <StatusPill label="Nuevo"     color={theme.primary} />
//
// Tomado del estilo de las pills en la tabla de Reclamos del screenshot.
// Reemplaza el patron repetido de inline-flex + estilos ad-hoc.

interface StatusPillProps {
  label: string;
  color: string;
  /** Tamano. 'sm' (default) = h-6 text-[11px], 'xs' = h-5 text-[10px]. */
  size?: 'sm' | 'xs';
  /** Si false, oculta el dot a la izquierda. Default true. */
  showDot?: boolean;
  className?: string;
}

export function StatusPill({
  label,
  color,
  size = 'sm',
  showDot = true,
  className = '',
}: StatusPillProps) {
  useTheme(); // hook para reactividad al theme aunque no usemos vars aca
  const sizeClasses = size === 'xs'
    ? 'px-2 h-5 text-[10px] gap-1'
    : 'px-2.5 h-6 text-[11px] gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold whitespace-nowrap ${sizeClasses} ${className}`}
      style={{
        backgroundColor: `${color}18`,
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {showDot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  );
}

export default StatusPill;
