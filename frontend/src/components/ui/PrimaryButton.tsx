import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

// =====================================================================
// PrimaryButton — boton "accion principal" canonico del sistema.
// Look moderno con gradient diagonal del acento del tema, sombra suave,
// hover ascendente, ripple horizontal al hover. SIN color plano.
//
// Reemplaza el patron disperso:
//   <button style={{ backgroundColor: theme.primary }}>...
//   <button style={{ background: `linear-gradient(135deg, ${theme.primary}...)`}}>...
//
// Uso:
//   <PrimaryButton onClick={...} icon={<Plus className="h-4 w-4" />}>Nuevo</PrimaryButton>
//   <PrimaryButton variant="success">Pagar</PrimaryButton>
//   <PrimaryButton size="sm">Aplicar</PrimaryButton>
// =====================================================================

// Constantes visuales (no del tema — son del lenguaje del boton).
const GRADIENT_ANGLE = '135deg';
const SHADOW_OPACITY = '40'; // hex ~25%
const RIPPLE_OPACITY = '30';

type Variant = 'primary' | 'success' | 'danger' | 'warning';
type Size = 'sm' | 'md' | 'lg';

interface PrimaryButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  icon?: ReactNode;
  /** 'primary' = acento del tema. 'success'/'danger'/'warning' = colores semanticos fijos. */
  variant?: Variant;
  size?: Size;
  /** Si true, ocupa el ancho del padre (block). */
  fullWidth?: boolean;
}

const VARIANT_COLORS: Record<Exclude<Variant, 'primary'>, { base: string; hover: string }> = {
  success: { base: '#10b981', hover: '#059669' },
  danger:  { base: '#ef4444', hover: '#dc2626' },
  warning: { base: '#f59e0b', hover: '#d97706' },
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-[28px] px-2.5 text-[11px] gap-1',
  md: 'h-[34px] px-3 text-[12px] gap-1.5',
  lg: 'h-[40px] px-4 text-[13px] gap-2',
};

/** Resuelve los colores base/hover segun variante + tema. */
export function resolvePrimaryColors(
  variant: Variant,
  themePrimary: string,
  themePrimaryHover: string | undefined,
): { base: string; hover: string } {
  if (variant === 'primary') {
    return { base: themePrimary, hover: themePrimaryHover || themePrimary };
  }
  return VARIANT_COLORS[variant];
}

/** Estilo canonico del boton de accion principal. Reutilizable si una pagina
 *  arma un boton custom y quiere el mismo look sin importar el componente. */
export function primaryButtonStyle(
  variant: Variant,
  themePrimary: string,
  themePrimaryHover: string | undefined,
): CSSProperties {
  const { base, hover } = resolvePrimaryColors(variant, themePrimary, themePrimaryHover);
  return {
    background: `linear-gradient(${GRADIENT_ANGLE}, ${base} 0%, ${hover} 100%)`,
    color: '#ffffff',
    boxShadow: `0 4px 14px ${base}${SHADOW_OPACITY}`,
  };
}

export function PrimaryButton({
  icon,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...rest
}: PrimaryButtonProps) {
  const { theme } = useTheme();
  const { base } = resolvePrimaryColors(variant, theme.primary, theme.primaryHover);
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center rounded-lg font-semibold
        transition-all duration-300 ease-out
        hover:scale-105 hover:-translate-y-0.5 active:scale-95
        disabled:opacity-50 disabled:hover:scale-100 disabled:hover:translate-y-0 disabled:cursor-not-allowed
        group relative overflow-hidden flex-shrink-0
        ${SIZE_CLASSES[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      style={primaryButtonStyle(variant, theme.primary, theme.primaryHover)}
    >
      {/* Ripple horizontal al hover (gloss) */}
      <span
        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${base}${RIPPLE_OPACITY}, transparent)` }}
        aria-hidden
      />
      {icon}
      <span className="relative">{children}</span>
    </button>
  );
}

export default PrimaryButton;
