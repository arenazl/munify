/**
 * usePantallaCompleta — [v3.3] pantalla completa de un BLOQUE de la página
 * (controles + cuerpo), no de un lienzo suelto: un mapa grande sin sus
 * filtros no se puede manejar (dueño, Mapa 2026-08-31 y Territorio
 * 2026-09-03: "los filtros y el mapa se pongan en pantalla completa").
 *
 * Nació en pages/Mapa.tsx y se sacó al kit para que lo use el orquestador
 * (`SemanticAbmPage.pantallaCompleta`) y cualquier pantalla que lo necesite.
 *
 * CÓMO SE MAXIMIZA: por defecto con la clase `av2-mapa-full--expandido`
 * (position: fixed sobre el viewport, ver abmv2.css), NO con la Fullscreen
 * API del navegador. Motivo concreto: los combos del kit (`ModernSelect`) y
 * el `SideModal` se dibujan con un portal en `document.body`, y un elemento
 * en fullscreen nativo TAPA todo lo que no sea descendiente suyo — los
 * combos se abrían detrás y los filtros quedaban inutilizables justo en el
 * modo que existe para usarlos. Con `nativa: true` se intenta primero la API
 * (esconde la barra del navegador) y se cae al modo CSS si el navegador la
 * rechaza (Safari de iPhone sólo la acepta sobre <video>).
 *
 * Salida: Escape (en modo CSS lo damos nosotros; en nativo lo da el
 * navegador), el mismo botón, o el gesto del navegador — el estado se
 * sincroniza con lo que dice el documento.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface PantallaCompleta<T extends HTMLElement> {
  /** Va en el elemento que se maximiza (el bloque controles + cuerpo). */
  ref: React.RefObject<T | null>;
  activa: boolean;
  alternar: () => void;
  /** Clases del bloque: siempre `av2-mapa-full`; `--expandido` en modo CSS. */
  clase: string;
}

export function usePantallaCompleta<T extends HTMLElement = HTMLDivElement>(
  opciones: { nativa?: boolean } = {},
): PantallaCompleta<T> {
  const { nativa = false } = opciones;
  const ref = useRef<T | null>(null);
  const [enNativa, setEnNativa] = useState(false);
  const [expandidoCss, setExpandidoCss] = useState(false);

  const alternar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (expandidoCss) {
      setExpandidoCss(false);
      return;
    }
    if (nativa && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setExpandidoCss(true));
      return;
    }
    setExpandidoCss(true);
  }, [expandidoCss, nativa]);

  // La salida puede venir por Escape o por el botón del navegador, no sólo
  // por el nuestro: el estado se sincroniza con lo que dice el documento.
  useEffect(() => {
    const alCambiar = () => setEnNativa(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  // En modo expandido por CSS no hay Escape del navegador: se lo damos.
  useEffect(() => {
    if (!expandidoCss) return;
    const alaTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandidoCss(false);
    };
    document.addEventListener('keydown', alaTecla);
    return () => document.removeEventListener('keydown', alaTecla);
  }, [expandidoCss]);

  return {
    ref,
    activa: enNativa || expandidoCss,
    alternar,
    clase: `av2-mapa-full${expandidoCss ? ' av2-mapa-full--expandido' : ''}`,
  };
}

export default usePantallaCompleta;
