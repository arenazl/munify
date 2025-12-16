import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configurar cómo se muestran las notificaciones cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationData {
  type: string;
  reclamo_id?: number;
  message?: string;
}

class NotificationService {
  private pushToken: string | null = null;

  async initialize(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    // Verificar permisos existentes
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Solicitar permisos si no los tenemos
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    // Obtener el token
    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // Reemplazar con tu project ID de Expo
      });
      this.pushToken = token.data;

      // Guardar el token localmente
      await AsyncStorage.setItem('pushToken', this.pushToken);

      // Configuración específica de Android
      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4f46e5',
        });

        // Canal para reclamos
        Notifications.setNotificationChannelAsync('reclamos', {
          name: 'Reclamos',
          description: 'Notificaciones sobre tus reclamos',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4f46e5',
        });
      }

      return this.pushToken;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  getToken(): string | null {
    return this.pushToken;
  }

  // Listener para notificaciones recibidas (app en primer plano)
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  // Listener para cuando el usuario toca una notificación
  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  // Enviar notificación local (para testing)
  async sendLocalNotification(
    title: string,
    body: string,
    data?: NotificationData
  ): Promise<string> {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data as any,
        sound: true,
      },
      trigger: null, // Inmediato
    });
    return id;
  }

  // Programar notificación para el futuro
  async scheduleNotification(
    title: string,
    body: string,
    triggerDate: Date,
    data?: NotificationData
  ): Promise<string> {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data as any,
        sound: true,
      },
      trigger: {
        date: triggerDate,
      },
    });
    return id;
  }

  // Cancelar una notificación programada
  async cancelNotification(id: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  // Cancelar todas las notificaciones
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  // Obtener el badge count
  async getBadgeCount(): Promise<number> {
    return await Notifications.getBadgeCountAsync();
  }

  // Establecer el badge count
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  // Limpiar el badge
  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }
}

export const notificationService = new NotificationService();
