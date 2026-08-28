/* Service worker del directorio /calls.
 *
 * Propio y con scope /calls/ — el SW de la app (raiz) no cachea ni escucha
 * push, y mezclar los dos ciclos de vida es pedir problemas.
 *
 * NO CACHEA NADA a proposito (mismo criterio que el SW de la app): sin
 * `cache.put` no hay copia vieja que servir, y el _headers ya manda no-store
 * en el HTML. Existe SOLO para poder recibir push con la PWA cerrada, que en
 * iOS es la unica via.
 */
const VERSION = 'calls-sw-1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* payload no-JSON */ }
  const titulo = d.title || 'Llamados';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || '',
    icon: d.icon || '/calls/icono-192.png',
    badge: d.badge || '/calls/icono-192.png',
    data: { url: d.url || '/calls/' },
    // Un tag fijo: el recordatorio nuevo REEMPLAZA al anterior en lugar de
    // apilar tres avisos del mismo dia en la pantalla de bloqueo.
    tag: 'calls-recordatorio',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/calls/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((lista) => {
      // Si ya hay una ventana de /calls abierta, se enfoca esa (no se abre otra).
      for (const c of lista) {
        if (c.url.includes('/calls') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(destino);
    }));
});
