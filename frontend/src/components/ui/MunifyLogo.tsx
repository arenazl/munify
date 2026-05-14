import { useTheme } from '../../contexts/ThemeContext';

/**
 * MunifyLogo — SVG inline con color dinamico segun el contexto.
 *
 * El logo es una composicion en azul (Munify.svg original) que puede
 * lastimarse cuando el fondo es del mismo tono. Este componente toma
 * el SVG inline y permite repintarlo en funcion del contexto:
 *
 *  - `variant="auto"` (default): detecta el background segun el lugar:
 *     - Si esta sobre el sidebar -> usa color contraste al sidebar.
 *     - Si esta sobre el bg principal -> usa el primary del tema.
 *  - `variant="sidebar"`: fuerza color contraste al sidebar.
 *  - `variant="content"`: usa primary del tema (sobre bg de contenido).
 *  - `variant="brand"`: usa los colores originales del SVG (azul brand).
 *  - `color`: override manual (string hex).
 *
 * Implementacion: 2 paths del SVG son re-coloreados como `colorDark`
 * y `colorLight`. Cuando elegimos un color unico, lo aplicamos a
 * ambos. Cuando elegimos "brand" o pasamos colorPair, mantenemos la
 * composicion bicolor.
 */

export type MunifyLogoVariant = 'auto' | 'sidebar' | 'content' | 'brand';

export interface MunifyLogoProps {
  /** Tamano en px (cuadrado). Default 32. */
  size?: number;
  /** Modo de coloreado */
  variant?: MunifyLogoVariant;
  /** Override de color unico (aplica a ambos paths) */
  color?: string;
  /** Override de par de colores (mantiene composicion bicolor) */
  colorPair?: [string, string];
  className?: string;
  title?: string;
}

// Calcula si un color es claro (luminance > 0.5) para decidir contraste
function isLightColor(hex: string): boolean {
  if (!hex) return false;
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5;
}

// Brand original
const BRAND_DARK = '#112a6c';
const BRAND_LIGHT = '#3f6ac8';

export function MunifyLogo({
  size = 32,
  variant = 'auto',
  color,
  colorPair,
  className,
  title = 'Munify',
}: MunifyLogoProps) {
  const { theme } = useTheme();

  // Esquema de marca:
  //  - body (M) cambia segun el fondo: azul oscuro sobre claro, celeste claro
  //    sobre oscuro.
  //  - check siempre VERDE.
  const BODY_DARK = '#112a6c';   // azul brand oscuro, va sobre sidebar/bg claro
  const BODY_LIGHT = '#aebee0';  // celeste claro, va sobre sidebar/bg oscuro
  const CHECK_GREEN = '#18a24d'; // verde tilde, constante

  let bodyColor = BODY_DARK;
  let checkColor = CHECK_GREEN;

  if (colorPair) {
    [bodyColor, checkColor] = colorPair;
  } else if (color) {
    bodyColor = color;
    checkColor = color;
  } else if (variant === 'brand') {
    // Mantener azul + azul-claro original (sin verde)
    bodyColor = BRAND_DARK;
    checkColor = BRAND_LIGHT;
  } else if (variant === 'sidebar' || (variant === 'auto' && theme.sidebar)) {
    const sidebarIsLight = isLightColor(theme.sidebar);
    bodyColor = sidebarIsLight ? BODY_DARK : BODY_LIGHT;
    checkColor = CHECK_GREEN;
  } else if (variant === 'content') {
    const bgIsLight = isLightColor(theme.background);
    bodyColor = bgIsLight ? BODY_DARK : BODY_LIGHT;
    checkColor = CHECK_GREEN;
  }

  const c1 = bodyColor;
  const c2 = checkColor;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1446.79 1426"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Path 1 (sombra principal) */}
      <polygon
        fill={c1}
        points="1271.65 371.24 1271.65 1069.5 635.82 1426 0 1069.5 0 356.5 635.82 0 1128.59 276.29 1000.48 381.26 636.9 177.4 160.18 444.69 160.18 979.27 636.9 1246.56 1113.62 979.27 1113.62 544.87 1271.65 371.24"
      />
      {/* Path 2 (check / acento) */}
      <polygon
        fill={c2}
        points="1446.79 79.97 1225.77 330.78 1113.62 458.05 644.86 989.99 448.06 781.76 448.06 568.98 637.63 759.38 1052.94 410.67 1179.19 304.66 1446.79 79.97"
      />
      {/* Path 3 (linea izquierda) */}
      <polygon
        fill={c1}
        points="404.64 517.83 404.64 1037.89 253.8 953.49 253.8 500.38 332.09 454.86 404.64 517.83"
      />
      {/* Path 4 (linea derecha) */}
      <polygon
        fill={c1}
        points="1020.14 650.78 1020.14 954.08 867.22 1039.31 868.09 818.95 1020.14 650.78"
      />
    </svg>
  );
}
