import { useState, useEffect } from 'react';
import { Bell, BellOff, X, Check, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed
} from '../lib/pushNotifications';

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationSettings({ isOpen, onClose }: NotificationSettingsProps) {
  const { theme } = useTheme();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  const checkStatus = async () => {
    setSupported(isPushSupported());
    setPermission(getNotificationPermission());
    const sub = await isSubscribed();
    setSubscribed(sub);
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const subscription = await subscribeToPush();
      if (subscription) {
        setSubscribed(true);
        setPermission('granted');
      } else {
        setError('No se pudo activar las notificaciones. Verifica los permisos del navegador.');
      }
    } catch (err) {
      setError('Error al activar notificaciones');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (err) {
      setError('Error al desactivar notificaciones');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl"
        style={{ backgroundColor: theme.card }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <X className="h-4 w-4" style={{ color: theme.textSecondary }} />
        </button>

        <div className="text-center mb-6">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}15` }}
          >
            <Bell className="h-8 w-8" style={{ color: theme.primary }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: theme.text }}>
            Notificaciones Push
          </h2>
          <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>
            Recibe alertas cuando haya novedades en tus reclamos
          </p>
        </div>

        {!supported ? (
          <div
            className="p-4 rounded-xl flex items-center gap-3"
            style={{ backgroundColor: '#fef3c7' }}
          >
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              Tu navegador no soporta notificaciones push. Prueba con Chrome o Firefox.
            </p>
          </div>
        ) : permission === 'denied' ? (
          <div
            className="p-4 rounded-xl flex items-center gap-3"
            style={{ backgroundColor: '#fee2e2' }}
          >
            <BellOff className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-800 font-medium">
                Notificaciones bloqueadas
              </p>
              <p className="text-xs text-red-700 mt-1">
                Debes habilitar las notificaciones desde la configuración de tu navegador.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div
                className="p-3 rounded-xl text-sm"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
              >
                {error}
              </div>
            )}

            <div
              className="p-4 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div className="flex items-center gap-3">
                {subscribed ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <Bell className="h-5 w-5" style={{ color: theme.textSecondary }} />
                )}
                <span style={{ color: theme.text }}>
                  {subscribed ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
                </span>
              </div>
              <button
                onClick={subscribed ? handleUnsubscribe : handleSubscribe}
                disabled={loading}
                className="w-12 h-7 rounded-full p-1 transition-all"
                style={{
                  backgroundColor: subscribed ? theme.primary : theme.border,
                  opacity: loading ? 0.5 : 1
                }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white transition-transform"
                  style={{
                    transform: subscribed ? 'translateX(20px)' : 'translateX(0)',
                  }}
                />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                Recibirás notificaciones cuando:
              </p>
              <ul className="text-xs space-y-1" style={{ color: theme.textSecondary }}>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Tu reclamo sea asignado a un empleado
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Cambie el estado de tu reclamo
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Haya comentarios nuevos
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Tu reclamo sea resuelto
                </li>
              </ul>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-xl font-medium"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
