/**
 * Bandera de país como SVG.
 *
 * Va en SVG y no en emoji por regla del proyecto (cero emojis Unicode en la
 * UI), y además porque el emoji de bandera no se dibuja en Windows: se ve el
 * código de dos letras. Son formas simplificadas —franjas y poco más—, del
 * tamaño de un icono: a 20px el escudo de Paraguay, el sol de Argentina o el
 * cóndor de Bolivia no se distinguirían igual, y sí ensuciarían el trazo.
 *
 * Los países que están acá son los que tienen catálogo de municipios cargado
 * (`PAISES` en `pages/Demo.tsx`). Agregar uno nuevo es agregar su franja acá.
 */
export type CodigoPais = 'AR' | 'PY' | 'UY' | 'CL' | 'PE' | 'BO';

interface Props {
  pais: CodigoPais;
  /** Alto en px. El ancho sale de la proporción 3:2. */
  size?: number;
  className?: string;
}

export function BanderaPais({ pais, size = 14, className }: Props) {
  const w = Math.round((size * 3) / 2);
  const comun = {
    width: w, height: size, viewBox: '0 0 30 20', className,
    role: 'img' as const, 'aria-hidden': true,
  };

  if (pais === 'AR') {
    return (
      <svg {...comun}>
        <rect width="30" height="20" fill="#fff" />
        <rect width="30" height="6.67" fill="#74acdf" />
        <rect y="13.33" width="30" height="6.67" fill="#74acdf" />
        <circle cx="15" cy="10" r="2.1" fill="#f6b40e" />
      </svg>
    );
  }

  if (pais === 'PY') {
    return (
      <svg {...comun}>
        <rect width="30" height="6.67" fill="#d52b1e" />
        <rect y="6.67" width="30" height="6.67" fill="#fff" />
        <rect y="13.33" width="30" height="6.67" fill="#0038a8" />
        <circle cx="15" cy="10" r="2.1" fill="#fff" stroke="#0038a8" strokeWidth="0.5" />
      </svg>
    );
  }

  if (pais === 'CL') {
    // Cantón cuadrado de un tercio del ancho y media altura, como la real.
    return (
      <svg {...comun}>
        <rect width="30" height="10" fill="#fff" />
        <rect y="10" width="30" height="10" fill="#d52b1e" />
        <rect width="10" height="10" fill="#0039a6" />
        <circle cx="5" cy="5" r="2.2" fill="#fff" />
      </svg>
    );
  }

  if (pais === 'PE') {
    return (
      <svg {...comun}>
        <rect width="30" height="20" fill="#fff" />
        <rect width="10" height="20" fill="#d91023" />
        <rect x="20" width="10" height="20" fill="#d91023" />
      </svg>
    );
  }

  if (pais === 'BO') {
    return (
      <svg {...comun}>
        <rect width="30" height="6.67" fill="#d52b1e" />
        <rect y="6.67" width="30" height="6.67" fill="#f9e300" />
        <rect y="13.33" width="30" height="6.67" fill="#007934" />
      </svg>
    );
  }

  // UY
  return (
    <svg {...comun}>
      <rect width="30" height="20" fill="#fff" />
      <rect y="2.2" width="30" height="2.2" fill="#0038a8" />
      <rect y="6.6" width="30" height="2.2" fill="#0038a8" />
      <rect y="11" width="30" height="2.2" fill="#0038a8" />
      <rect y="15.4" width="30" height="2.2" fill="#0038a8" />
      <rect width="13" height="11" fill="#fff" />
      <circle cx="6.5" cy="5.5" r="2.4" fill="#f6b40e" />
    </svg>
  );
}

export default BanderaPais;
