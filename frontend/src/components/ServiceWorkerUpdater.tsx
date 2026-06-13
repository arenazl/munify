import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Registra el Service Worker y avisa al usuario cuando hay una versión nueva
 * de la app en producción. Sin este componente, los usuarios quedan con JS
 * viejo cacheado hasta que hagan hard-refresh manualmente.
 *
 * Flujo:
 *  1. Registra `/sw.js` al montar.
 *  2. Cada 5 minutos llama a `registration.update()` para chequear si el
 *     servidor tiene una versión nueva del SW.
 *  3. Cuando detecta un SW nuevo instalado (evento `updatefound` → estado
 *     `installed`), muestra un toast NO cerrable con botón "Actualizar".
 *  4. Al clickear, le manda `SKIP_WAITING` al nuevo SW y recarga la página
 *     con `location.reload()` — el usuario ya ve la versión nueva sin F12.
 *
 * Importante: si el navegador NO tiene un SW previo controlando la página
 * (primera visita), NO mostramos el prompt — eso sería molesto en el primer
 * ingreso. El prompt solo aparece cuando ya había un SW viejo y se detectó
 * uno nuevo.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // En dev (vite) no hay SW real — evitá registrar basura en localhost.
    if (import.meta.env.DEV) return;

    let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;
    const cleanups: Array<() => void> = [];

    const showUpdatePrompt = (worker: ServiceWorker) => {
      toast('Nueva versión disponible', {
        description: 'Hay una actualización lista. Recargá para verla.',
        duration: Infinity,
        action: {
          label: 'Actualizar',
          onClick: () => {
            // Le decimos al nuevo SW que tome el control YA.
            worker.postMessage({ type: 'SKIP_WAITING' });
            // El `controllerchange` handler de abajo hace el reload.
          },
        },
      });
    };

    // Rutas de marketing/herramientas (sin datos de usuario que perder):
    // ahí auto-aplicamos la actualización sin pedir click. En el resto de la
    // app mostramos el toast para no arrancarle la página a un user a mitad de
    // un formulario.
    const isMarketing = () => /^\/(reels|demos)\b/.test(window.location.pathname);

    const onUpdateFound = () => {
      if (!registration) return;
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // `installed` + hay un controller previo = es una actualización
        // (si no hubiera controller previo sería la primera instalación).
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (isMarketing()) {
            // Activar ya → el SW (skipWaiting+claim) dispara `controllerchange`
            // y recarga. Fallback por si no dispara.
            newWorker.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(() => {
              if (!reloading) { reloading = true; window.location.reload(); }
            }, 2000);
          } else {
            showUpdatePrompt(newWorker);
          }
        }
      });
    };

    // Cuando el nuevo SW toma el control, recargar la página para que
    // sirva el HTML/JS nuevo.
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg;
        reg.addEventListener('updatefound', onUpdateFound);

        // Chequear actualizaciones cada 60s (antes 5 min) para que el deploy
        // nuevo se detecte rápido.
        updateCheckInterval = setInterval(() => {
          reg.update().catch(() => { /* fallo de red, reintenta */ });
        }, 60 * 1000);

        // Y chequear apenas el user vuelve a la pestaña (típico: pusheo y el
        // user vuelve a mirar) → la actualización aparece casi al instante.
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
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
