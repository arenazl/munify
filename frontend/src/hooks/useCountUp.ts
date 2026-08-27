/**
 * useCountUp — el número que cuenta de 0 al valor con ease-out.
 *
 * Vivía enjaulado dentro de DashboardLive (modo TV) y el resto de los KPIs
 * de la app no animaban (pedido del dueño, 2026-08-28): ahora es pieza del
 * kit. Respeta prefers-reduced-motion: ahí devuelve el valor final directo.
 */
import { useEffect, useState } from 'react';

export function useCountUp(target: number, durationMs = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}
