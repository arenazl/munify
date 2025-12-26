// Utilidades para Web Push Notifications
import api from './api';

// Cache de la VAPID key
let cachedVapidKey: string | null = null;

// Obtener VAPID key del backend
async function getVapidPublicKey(): Promise<string | null> {
  if (cachedVapidKey) return cachedVapidKey;

  try {
    const response = await api.get('/push/vapid-key');
    cachedVapidKey = response.data.publicKey;
    return cachedVapidKey;
  } catch (error) {
    console.error('Error obteniendo VAPID key:', error);
    return null;
  }
}

// Convertir base64 a Uint8Array (requerido por la API de Push)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Verificar si el navegador soporta notificaciones push
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Obtener el estado actual del permiso
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

// Pedir permiso para notificaciones
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('Este navegador no soporta notificaciones');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
}

// Registrar el Service Worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker no soportado');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registrado:', registration);
    return registration;
  } catch (error) {
    console.error('Error registrando Service Worker:', error);
    return null;
  }
}

// Suscribirse a push notifications
export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    // Verificar soporte
    if (!isPushSupported()) {
      console.log('Push notifications no soportadas');
      return null;
    }

    // Pedir permiso
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.log('Permiso de notificaciones denegado');
      return null;
    }

    // Registrar service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      return null;
    }

    // Esperar a que el service worker esté activo
    await navigator.serviceWorker.ready;

    // Verificar si ya hay una suscripción
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Obtener VAPID key del backend
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        console.error('No se pudo obtener VAPID key del servidor');
        return null;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
      });
    }

    // Enviar suscripción al backend
    await sendSubscriptionToServer(subscription);

    console.log('Suscripción push creada:', subscription);
    return subscription;
  } catch (error) {
    console.error('Error suscribiéndose a push:', error);
    return null;
  }
}

// Cancelar suscripción
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Notificar al backend
      await removeSubscriptionFromServer(subscription);
      // Cancelar suscripción local
      await subscription.unsubscribe();
      console.log('Suscripción cancelada');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error cancelando suscripción:', error);
    return false;
  }
}

// Enviar suscripción al backend
async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  try {
    const json = subscription.toJSON();
    await api.post('/push/subscribe', {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
      user_agent: navigator.userAgent
    });
    console.log('Suscripción enviada al servidor');
  } catch (error) {
    console.error('Error enviando suscripción al servidor:', error);
    throw error;
  }
}

// Eliminar suscripción del backend
async function removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
  try {
    const json = subscription.toJSON();
    await api.post('/push/unsubscribe', {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || ''
    });
    console.log('Suscripción eliminada del servidor');
  } catch (error) {
    console.error('Error eliminando suscripción del servidor:', error);
  }
}

// Verificar si el usuario está suscrito
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

// Mostrar notificación local (cuando la app está en primer plano)
export function showLocalNotification(title: string, options?: NotificationOptions): void {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      ...options
    });
  }
}
