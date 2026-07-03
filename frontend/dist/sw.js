// Service Worker para Push Notifications + auto-update
// VERSION: 2.5.0 - Sin fetch handler (era net-negativo: nunca cacheaba y rompia
//                  la carga de chunks lazy con "Failed to convert value to Response").
// VERSION: 2.4.0 - Soporte de SKIP_WAITING via postMessage
// BUILD_ID se reemplaza en cada build por scripts/stamp-sw.mjs.
// Esto garantiza que el browser detecte un sw.js byte-diferente en cada
// deploy y dispare el flujo de "Nueva version disponible" del ServiceWorkerUpdater.
const SW_VERSION = '2.5.0';
const SW_BUILD = '1783050588288-ourd';
const CACHE_NAME = `app-cache-v${SW_VERSION}-${SW_BUILD}`;

// Handler de mensajes desde la app. Permite que el componente
// ServiceWorkerUpdater le diga al SW que active la versión nueva
// inmediatamente cuando el usuario clickea "Actualizar" en el toast.
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', function(event) {
  console.log('[SW] Push event recibido:', event);

  let title = 'Sistema de Reclamos';
  const options = {
    body: 'Tienes una nueva notificación',
    icon: '/icon-notification.png',
    badge: '/icon-notification.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      url: '/'
    },
    actions: [
      { action: 'open', title: 'Ver' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[SW] Datos parseados:', data);

      title = data.title || title;
      options.body = data.body || options.body;
      options.data.url = data.url || '/';
      options.icon = data.icon || options.icon;
    } catch (e) {
      console.error('[SW] Error parseando JSON:', e);
      const textData = event.data.text();
      console.log('[SW] Datos como texto:', textData);
      options.body = textData;
    }
  }

  console.log('[SW] Mostrando notificación:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Click en la notificación
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Si no, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Instalación del Service Worker - skipWaiting para activar inmediatamente
self.addEventListener('install', function(event) {
  console.log(`Service Worker v${SW_VERSION} instalando...`);
  // Forzar activación inmediata sin esperar
  self.skipWaiting();
});

// Activación - limpiar caches antiguos y tomar control
self.addEventListener('activate', function(event) {
  console.log(`Service Worker v${SW_VERSION} activado`);
  event.waitUntil(
    Promise.all([
      // Limpiar todos los caches antiguos
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName !== CACHE_NAME) {
              console.log('Eliminando cache antiguo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Tomar control de todos los clientes inmediatamente
      clients.claim()
    ])
  );
});

// Sin handler de 'fetch' a proposito.
//
// El SW no cachea nada (no hay ningun cache.put), asi que un fetch handler
// "network-first" no aportaba offline real: solo agregaba un proxy fragil.
// El bug: en el catch devolvia caches.match() === undefined, y
// respondWith(undefined) lanza "TypeError: Failed to convert value to
// 'Response'". Eso rompia la carga de chunks lazy (paginas de Reportes, etc.),
// sobre todo tras un deploy con hashes nuevos. Sin handler, el navegador
// resuelve todos los requests directamente (igual que ya hacia con /api).
