/**
 * useEsAngosto — ¿la pantalla es de teléfono?
 *
 * Para cambios que NO son sólo de estilo. Cuando lo único que cambia es cómo
 * se ve algo, la media query de CSS alcanza y es mejor (no re-renderiza). Este
 * hook es para cuando cambia QUÉ se renderiza: en un teléfono una lista se
 * dibuja como filas y en un escritorio como tarjetas en grilla, y eso son dos
 * árboles distintos, no dos hojas de estilo.
 *
 * Escucha el cambio de tamaño en vivo: girar el aparato o partir la pantalla
 * en dos actualiza el valor sin recargar.
 */
import { useEffect, useState } from 'react';

/** Mismo corte que usa el CSS del kit para el salto a pantalla ancha. */
const ANCHO_TELEFONO = 768;

export function useEsAngosto(maxAncho: number = ANCHO_TELEFONO): boolean {
  const [angosto, setAngosto] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(`(max-width: ${maxAncho - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${maxAncho - 1}px)`);
    const alCambiar = (e: MediaQueryListEvent) => setAngosto(e.matches);
    setAngosto(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [maxAncho]);

  return angosto;
}
