/**
 * ParaguayLimpioLogo — isotipo SVG inline de la marca "Paraguay Limpio".
 *
 * Versión "Fiel al original" (opción 1 elegida por el dueño, 2026-07-31):
 * sol dorado con rayos + colinas en tres verdes + camino blanco serpenteante,
 * calcada del logo oficial (par-limpio/WhatsApp Image 2026-07-29). Fondo
 * transparente — funciona sobre el sidebar oscuro y sobre claros.
 *
 *  - `color`: monocromatiza las colinas (el sol mantiene su dorado).
 *  - `colorPair`: [colinas, camino] para composiciones especiales.
 *  - sin props: colores oficiales de la marca.
 */
import { useId } from 'react';

export interface ParaguayLimpioLogoProps {
  size?: number;
  color?: string;
  colorPair?: [string, string];
  className?: string;
  title?: string;
}

const SUN = '#F5A81C';
const HILL_1 = '#4CAF50';   // verde claro (banda superior)
const HILL_2 = '#2E7D32';   // verde medio
const HILL_3 = '#1B5E20';   // verde oscuro (base)
const ROAD = '#ffffff';

export function ParaguayLimpioLogo({
  size = 32,
  color,
  colorPair,
  className,
  title = 'Paraguay Limpio',
}: ParaguayLimpioLogoProps) {
  // id único por instancia: el logo puede renderizarse varias veces en la
  // misma página (sidebar + header mobile + login) y los clipPath con id
  // repetido se pisan entre sí.
  const clipId = useId();

  let h1 = HILL_1, h2 = HILL_2, h3 = HILL_3, road = ROAD;
  if (colorPair) {
    [h2, road] = colorPair;
    h1 = h2;
    h3 = h2;
  } else if (color) {
    h1 = color;
    h2 = color;
    h3 = color;
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
      <defs>
        <clipPath id={clipId}>
          <path d="M6,60 Q50,42 94,60 Q97,76 80,87 Q60,97 34,93 Q12,88 6,60 Z" />
        </clipPath>
      </defs>
      {/* Sol + rayos */}
      <circle cx="50" cy="37" r="14.5" fill={SUN} />
      <g fill={SUN}>
        <polygon points="50,11 47.2,22 52.8,22" />
        <polygon points="70.5,17 62.6,25 67,28.2" />
        <polygon points="84,33 73.5,32 75.2,37.5" />
        <polygon points="29.5,17 37.4,25 33,28.2" />
        <polygon points="16,33 26.5,32 24.8,37.5" />
        <polygon points="87,48.5 76.5,45 76.5,50.5" />
        <polygon points="13,48.5 23.5,45 23.5,50.5" />
      </g>
      {/* Colinas en tres verdes + camino blanco */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="40" width="100" height="60" fill={h1} />
        <path d="M0,74 Q34,62 60,72 Q84,81 100,74 L100,100 L0,100 Z" fill={h2} />
        <path d="M0,86 Q40,76 70,86 Q88,92 100,86 L100,100 L0,100 Z" fill={h3} />
        <path
          d="M47,45 C60,53 38,62 51,70 C62,77 42,84 54,93"
          fill="none"
          stroke={road}
          strokeWidth="8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
