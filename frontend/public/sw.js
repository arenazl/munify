// Service Worker para Push Notifications
// VERSION: 2.2.0 - Actualizar icono de notificaciones
const SW_VERSION = '2.2.0';
const CACHE_NAME = `app-cache-v${SW_VERSION}`;

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

// Fetch - No cachear nada, siempre ir al network
self.addEventListener('fetch', function(event) {
  // Para la app, siempre usar network-first
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
