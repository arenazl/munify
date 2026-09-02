import { useEffect } from 'react';

/**
 * Registra el Service Worker (push notifications) y lo mantiene al día EN
 * SILENCIO.
 *
 * Este SW no cachea nada (sin fetch handler, ver public/sw.js): existe para
 * las push y nada más. Por eso actualizarlo NO requiere recargar la página —
 * el bundle nuevo lo trae `setupAutoUpdate()` (version.json), que es el ÚNICO
 * dueño del reload de la app.
 *
 * Historia (2026-09-02): acá había un toast de "Nueva versión" + reload en
 * `controllerchange`, pero el sw.js se auto-activa al instalarse (skipWaiting
 * en el install + claim), así que el toast nunca llegaba a verse y cada deploy
 * provocaba DOS recargas al entrar: la del controllerchange y la de autoUpdate
 * por version.json — el "flickering y recarga" que reportó el dueño. Regla que
 * queda: UN solo mecanismo recarga la app; el SW se renueva sin tocarla.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // En dev (vite) no hay SW real — evitá registrar basura en localhost.
    if (import.meta.env.DEV) return;

    let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
    const cleanups: Array<() => void> = [];

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Chequear seguido para que el SW nuevo (handlers de push al día)
        // entre pronto; se activa solo (skipWaiting+claim) y sin recargar.
        updateCheckInterval = setInterval(() => {
          reg.update().catch(() => { /* fallo de red, reintenta */ });
        }, 60 * 1000);

        // Y apenas el user vuelve a la pestaña (típico: pusheo y vuelve a
        // mirar), así el SW fresco queda instalado casi al instante.
        const onVisible = () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', onVisible);
        cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
      })
      .catch((err) => {
        console.error('[SW Updater] Error registrando service worker:', err);
      });

    return () => {
      if (updateCheckInterval) clearInterval(updateCheckInterval);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
