import { MunifyLogo, type MunifyLogoVariant } from '../components/ui/MunifyLogo';
import { BRAND } from './index';

interface BrandMarkProps {
  size?: number;
  variant?: MunifyLogoVariant;
  className?: string;
  title?: string;
}

/**
 * Marca de la app. Si el brand activo tiene logo propio (white-label) lo
 * renderiza como imagen; si no, cae en el MunifyLogo SVG (comportamiento Munify).
 * Reemplaza los usos directos de MunifyLogo en el shell para que respeten la marca.
 */
export function BrandMark({ size = 32, variant, className, title }: BrandMarkProps) {
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
  return <MunifyLogo size={size} variant={variant} className={className} title={title || BRAND.name} />;
}
