import { useState, useEffect } from 'react';
import { Bell, X, BellOff, CheckCircle2, Info } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
} from '../lib/pushNotifications';

interface NotificationPromptProps {
  /** Mostrar solo si el usuario esta logueado */
  requireAuth?: boolean;
  /** Delay en ms antes de mostrar el prompt */
  delay?: number;
}

/**
 * Componente que guia al usuario para activar notificaciones push.
 * Se muestra automaticamente si:
 * - El navegador soporta push
 * - El usuario no ha dado permiso todavia (o lo denego)
 * - No lo ha descartado recientemente
 */
export default function NotificationPrompt({ delay = 2000 }: NotificationPromptProps) {
  const { theme } = useTheme();
  const [show, setShow] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    // Verificar si debemos mostrar el prompt
    const checkAndShow = () => {
      // Si no soporta push, no mostrar
      if (!isPushSupported()) return;

      // Obtener permiso actual
      const currentPermission = getNotificationPermission();
      setPermission(currentPermission);

      // Si ya tiene permiso granted, no mostrar
      if (currentPermission === 'granted') return;

      // Verificar si el usuario ya descarto el prompt recientemente (24 horas)
      const dismissed = localStorage.getItem('notification_prompt_dismissed');
      if (dismissed) {
        const dismissedTime = parseInt(dismissed, 10);
        const now = Date.now();
        // Si fue hace menos de 24 horas, no mostrar
        if (now - dismissedTime < 24 * 60 * 60 * 1000) return;
      }

      // Mostrar el prompt
      setShow(true);
    };

    // Delay antes de mostrar
    const timer = setTimeout(checkAndShow, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const handleDismiss = () => {
    localStorage.setItem('notification_prompt_dismissed', Date.now().toString());
    setShow(false);
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      await subscribeToPush();
      const newPermission = getNotificationPermission();
      setPermission(newPermission);

      if (newPermission === 'granted') {
        setJustEnabled(true);
        // Cerrar despues de 2 segundos mostrando exito
        setTimeout(() => {
          setShow(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Error activando notificaciones:', error);
      // Actualizar estado de permiso por si fue denegado
      setPermission(getNotificationPermission());
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  // Estado: Permiso denegado - mensaje educado y no intrusivo
  if (permission === 'denied') {
    // Detectar si es iOS/Safari o Android/Chrome para instrucciones específicas
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 animate-in slide-in-from-bottom duration-300">
        <div
          className="rounded-2xl p-4 shadow-2xl border"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#6366f120' }}
            >
              <BellOff className="h-5 w-5" style={{ color: '#6366f1' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm mb-1" style={{ color: theme.text }}>
                No vas a recibir notificaciones
              </h4>
              <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
                Para enterarte cuando tu reclamo avance, necesitas habilitar las notificaciones manualmente:
              </p>

              {/* Instrucciones paso a paso */}
              <div
                className="rounded-xl p-3 mb-2 text-xs space-y-2"
                style={{ backgroundColor: theme.background }}
              >
                {isIOS ? (
                  // Instrucciones para iOS Safari
                  <>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>1.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Toca el icono <strong>Aa</strong> en la barra de direcciones
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>2.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Selecciona <strong>"Configuración del sitio web"</strong>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>3.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Activa <strong>"Permitir notificaciones"</strong>
                      </span>
                    </div>
                  </>
                ) : isAndroid ? (
                  // Instrucciones para Android Chrome
                  <>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>1.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Toca el icono <strong>candado</strong> en la barra de direcciones
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>2.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Toca <strong>"Permisos"</strong> o <strong>"Configuración del sitio"</strong>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>3.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Activa <strong>"Notificaciones"</strong>
                      </span>
                    </div>
                  </>
                ) : (
                  // Instrucciones para Desktop
                  <>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>1.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Hace clic en el <strong>candado</strong> en la barra de direcciones
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>2.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Busca <strong>"Notificaciones"</strong> en los permisos
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold" style={{ color: theme.primary }}>3.</span>
                      <span style={{ color: theme.textSecondary }}>
                        Cambialo a <strong>"Permitir"</strong>
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs" style={{ color: theme.textSecondary }}>
                <Info className="h-3 w-3" />
                <span>Despues de hacerlo, recarga la pagina</span>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg transition-colors hover:bg-white/10"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" style={{ color: theme.textSecondary }} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Estado: Exito - recien habilitado
  if (justEnabled) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom duration-300">
        <div
          className="rounded-2xl p-4 shadow-2xl border"
          style={{ backgroundColor: theme.card, borderColor: '#10b98150' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#10b98120' }}
            >
              <CheckCircle2 className="h-5 w-5" style={{ color: '#10b981' }} />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm" style={{ color: '#10b981' }}>
                Notificaciones activadas
              </h4>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Recibiras alertas cuando haya novedades en tus reclamos
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estado: Pedir permiso
  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom duration-300">
      <div
        className="rounded-2xl p-4 shadow-2xl border"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#f59e0b20' }}
          >
            <Bell className="h-5 w-5" style={{ color: '#f59e0b' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1" style={{ color: theme.text }}>
              Activa las notificaciones
            </h4>
            <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
              Recibe alertas cuando tu reclamo cambie de estado o tengas novedades importantes.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnable}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: '#f59e0b' }}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    Activar
                  </>
                )}
              </button>
              <button
                onClick={handleDismiss}
                className="py-2 px-3 rounded-xl text-xs font-medium transition-colors"
                style={{ color: theme.textSecondary }}
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
