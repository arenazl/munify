/**
 * useCarruselAuto — la lógica de "esto rota solo" del kit, en un solo lugar.
 *
 * La usan el hero semántico y el reproductor de focos del mapa. Cuando un
 * patrón aparece dos veces se extrae: si mañana cambia el intervalo o la regla
 * de pausa, se toca acá y vale para todos.
 *
 * Qué resuelve, además de avanzar un índice:
 *
 *  - PAUSA al hover/foco. Nadie pierde el renglón que estaba leyendo ni el
 *    botón que iba a apretar porque la vista se movió sola.
 *  - Reinicia la cuenta en cada avance MANUAL: si alguien elige una vista,
 *    tiene el intervalo completo para mirarla y no el resto del anterior.
 *  - Respeta `prefers-reduced-motion`: con esa preferencia no rota solo. El
 *    movimiento automático es de las cosas que más molestan a quien lo pidió.
 *  - Devuelve el SENTIDO del último salto, para que la animación entre por el
 *    lado correcto.
 *
 * AGNÓSTICO: no sabe qué se está rotando. Recibe cuántos elementos hay.
 */
import { useCallback, useEffect, useState } from 'react';

export type SentidoCarrusel = 'adelante' | 'atras';

/** ¿El visitante pidió menos movimiento? */
function usaMenosMovimiento(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface OpcionesCarrusel {
  /** Cuántos elementos rotan. Con 0 o 1 no rota nada. */
  total: number;
  /** Cada cuánto avanza, en ms. */
  intervaloMs?: number;
  /** Cortar la rotación automática (los controles manuales siguen). */
  desactivado?: boolean;
}

export function useCarruselAuto({ total, intervaloMs = 10_000, desactivado }: OpcionesCarrusel) {
  const [indice, setIndice] = useState(0);
  const [sentido, setSentido] = useState<SentidoCarrusel>('adelante');
  const [detenido, setDetenido] = useState(false);
  // Pausa que se pide a mano con el botón, distinta de la del hover: esta
  // sobrevive a que el mouse se vaya. Quien la apretó quiere que se quede
  // quieto, no que arranque de nuevo al salir de la tarjeta.
  const [pausado, setPausado] = useState(false);
  // Inicializador perezoso, no useRef: leer `.current` durante el render está
  // prohibido y la preferencia se necesita una sola vez.
  const [menosMovimiento] = useState(usaMenosMovimiento);

  const seguro = total > 0 ? Math.min(indice, total - 1) : 0;

  const ir = useCallback(
    (destino: number) => {
      if (total <= 0) return;
      const siguiente = ((destino % total) + total) % total;
      setIndice((actual) => {
        setSentido(siguiente >= actual ? 'adelante' : 'atras');
        return siguiente;
      });
    },
    [total],
  );

  const siguiente = useCallback(() => ir(seguro + 1), [ir, seguro]);
  const anterior = useCallback(() => ir(seguro - 1), [ir, seguro]);

  // Depende de `indice` a propósito: cada avance reinicia la cuenta.
  useEffect(() => {
    if (total <= 1 || detenido || pausado || desactivado || menosMovimiento) return;
    const t = window.setTimeout(() => {
      setSentido('adelante');
      setIndice((i) => (i + 1) % total);
    }, intervaloMs);
    return () => window.clearTimeout(t);
  }, [indice, total, detenido, pausado, desactivado, menosMovimiento, intervaloMs]);

  const alternarPausa = useCallback(() => setPausado((p) => !p), []);

  /** Props para el contenedor: pausan mientras se lo mira o se lo usa. */
  const propsPausa = {
    onMouseEnter: () => setDetenido(true),
    onMouseLeave: () => setDetenido(false),
    onFocusCapture: () => setDetenido(true),
    onBlurCapture: () => setDetenido(false),
  };

  return {
    indice: seguro,
    sentido,
    ir,
    siguiente,
    anterior,
    propsPausa,
    menosMovimiento,
    /** ¿Está detenido a mano? (no cuenta la pausa por hover) */
    pausado,
    alternarPausa,
  };
}
