/**
 * Dónde colgar un portal para que se vea TAMBIÉN en pantalla completa.
 *
 * En pantalla completa el navegador dibuja únicamente el subárbol del elemento
 * maximizado: todo lo demás del documento deja de mostrarse, aunque siga en el
 * DOM y aunque tenga `z-index: 9999`. Un dropdown montado en `document.body`
 * queda fuera de ese subárbol, así que el combo se abre —el estado cambia, el
 * teclado funciona— pero no se ve nada. En el mapa a pantalla completa era
 * exactamente lo que pasaba con los filtros.
 *
 * La solución es colgar el portal DENTRO del elemento que está en pantalla
 * completa cuando hay uno, y en `document.body` cuando no.
 */
import { useEffect, useState } from 'react';

/** El nodo donde montar un portal ahora mismo. */
export function portalHost(): HTMLElement {
  if (typeof document === 'undefined') return null as unknown as HTMLElement;
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}

/**
 * Igual que `portalHost()` pero reactivo: si se entra o se sale de pantalla
 * completa con el panel abierto, el portal se muda solo. Sin esto el dropdown
 * quedaría colgado del nodo viejo y desaparecería a mitad de camino.
 */
export function usePortalHost(): HTMLElement {
  const [host, setHost] = useState<HTMLElement>(portalHost);
  useEffect(() => {
    const alCambiar = () => setHost(portalHost());
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);
  return host;
}
