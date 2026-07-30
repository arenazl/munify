/**
 * ParaguayLimpioLogo — logo SVG inline de la marca "Paraguay Limpio".
 *
 * Placeholder de identidad hasta que Design entregue el definitivo. Es un SVG
 * (no un PNG): fondo transparente, sin el "cuadrado blanco", y los dos tonos
 * de verde son coloreables por props (mismo patrón que MunifyLogo). Una hoja
 * como símbolo de ciudad limpia / verde.
 *
 *  - `color`: pinta hoja y nervadura del mismo tono.
 *  - `colorPair`: [hoja, nervadura] para mantener la composición bicolor.
 *  - sin props: usa los verdes de la marca.
 */
export interface ParaguayLimpioLogoProps {
  size?: number;
  color?: string;
  colorPair?: [string, string];
  className?: string;
  title?: string;
}

const LEAF = '#1b7a3d';   // verde oscuro (cuerpo)
const VEIN = '#8fd694';   // verde claro (nervaduras)

export function ParaguayLimpioLogo({
  size = 32,
  color,
  colorPair,
  className,
  title = 'Paraguay Limpio',
}: ParaguayLimpioLogoProps) {
  let leaf = LEAF;
  let vein = VEIN;
  if (colorPair) {
    [leaf, vein] = colorPair;
  } else if (color) {
    leaf = color;
    vein = color;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Cuerpo de la hoja */}
      <path
        fill={leaf}
        d="M80 16C86 44 72 76 42 85 29 89 18 83 15 70 10 43 40 20 80 16Z"
      />
      {/* Nervadura central + venas (acento coloreable) */}
      <path
        fill="none"
        stroke={vein}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M73 24C55 41 37 60 26 78"
      />
      <path
        fill="none"
        stroke={vein}
        strokeWidth="4.5"
        strokeLinecap="round"
        d="M53 43 66 36M42 59 55 53"
      />
    </svg>
  );
}
