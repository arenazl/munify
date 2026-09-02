/**
 * Glifo — dibuja el icono de una entidad venga como venga.
 *
 * En la app conviven DOS formas de guardar un icono y las dos son legítimas:
 *
 *  - **nombre Lucide** (`"Building2"`, `"Waves"`, `"hard-hat"`) — es lo que la
 *    base guarda en `categorias.icono` y lo que manda la regla del repo.
 *  - **path SVG de 24×24** (`"M4 21V8l8-5 8 5v13"`) — es como los declara el
 *    canvas en `canvasAbmSpec`, donde el diseño dibujó el glifo a mano.
 *
 * Mezclarlas es un bug real y silencioso: pintar `<path d="Building2" />` no
 * rompe nada visible, sólo deja el hueco vacío y ensucia la consola con
 * `Expected moveto path command`. Pasó en el panel de Asignación con
 * Building2, Cable y Waves.
 *
 * Por eso la decisión vive en UN lugar: un `d` de SVG siempre arranca con un
 * comando de movimiento (`M`/`m`) seguido de un número; cualquier otra cosa es
 * un nombre de icono.
 */
import { DynamicIcon } from '../ui/DynamicIcon';

/** `M`/`m` + número ⇒ es un path. `"Map"` o `"Minus"` no lo son. */
const ES_PATH = /^[Mm]\s*-?[\d.]/;

export function esPathSvg(glifo: string | undefined): boolean {
  return !!glifo && ES_PATH.test(glifo.trim());
}

export interface GlifoProps {
  /** Path SVG de 24×24 o nombre de icono Lucide. */
  glifo?: string;
  size?: number;
  /** Color del trazo. Por defecto hereda (`currentColor`). */
  color?: string;
  strokeWidth?: number;
  className?: string;
  /** Nombre Lucide a usar si `glifo` viene vacío o no resuelve. */
  fallback?: string;
}

export function Glifo({
  glifo,
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.9,
  className,
  fallback = 'Tag',
}: GlifoProps) {
  if (esPathSvg(glifo)) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d={glifo} />
      </svg>
    );
  }

  return (
    <DynamicIcon
      name={glifo || fallback}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      fallback={<DynamicIcon name={fallback} size={size} color={color} strokeWidth={strokeWidth} />}
      aria-hidden
    />
  );
}

export default Glifo;
