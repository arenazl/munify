import { MunifyLogo, type MunifyLogoVariant } from '../components/ui/MunifyLogo';
import { MunifyMark } from '../components/ui/MunifyMark';
import { BRAND } from './index';

interface BrandMarkProps {
  size?: number;
  variant?: MunifyLogoVariant;
  className?: string;
  title?: string;
  /** En superficies oscuras (ej. el recorrido del producto sobre navy) el
   *  fallback de Munify usa el mark sólido blanco + azure en vez del logo del
   *  shell (que es theme-aware y puede perder contraste sobre fondo oscuro). Sin
   *  efecto si el brand tiene logo propio: ahí manda el logo de la marca. */
  onDark?: boolean;
}

/**
 * Marca de la app. Si el brand activo tiene logo propio lo renderiza (imagen o
 * componente SVG); si no, cae en el logo de Munify. Reemplaza los usos directos
 * del logo en el shell para que cada pantalla respete la marca activa.
 */
export function BrandMark({ size = 32, variant, className, title, onDark }: BrandMarkProps) {
  if (BRAND.Logo) {
    const Logo = BRAND.Logo;
    return <Logo size={size} className={className} title={title || BRAND.name} />;
  }
  if (BRAND.logoSrc) {
    return (
      <img
        src={BRAND.logoSrc}
        alt={title || BRAND.name}
        height={size}
        className={className}
        style={{ height: size, width: 'auto', maxWidth: size * 2.8, objectFit: 'contain' }}
      />
    );
  }
  // Fallback Munify: sobre fondo oscuro, el mark sólido (blanco + azure); en el
  // shell, el logo theme-aware que contrasta con el sidebar/contenido.
  if (onDark) {
    return <MunifyMark size={size} />;
  }
  return <MunifyLogo size={size} variant={variant} className={className} title={title || BRAND.name} />;
}
