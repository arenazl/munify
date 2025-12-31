import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Smartphone,
  Bell,
  ArrowRight,
  X,
  Share,
  PlusSquare,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  isPushSupported,
  subscribeToPush,
  getNotificationPermission,
} from '../lib/pushNotifications';

type OnboardingStep = 'welcome' | 'pwa' | 'notifications' | 'complete';

export default function Onboarding() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [loading, setLoading] = useState(false);

  const { isInstallable, isInstalled, promptInstall, showIOSInstructions, isIOS } = usePWAInstall();

  const municipioNombre = localStorage.getItem('municipio_nombre') || 'tu Municipio';

  const handleSkip = () => {
    localStorage.setItem('onboarding_completed', 'true');
    navigate('/gestion/mi-panel');
  };

  const handleNext = () => {
    if (currentStep === 'welcome') {
      setCurrentStep('pwa');
    } else if (currentStep === 'pwa') {
      setCurrentStep('notifications');
    } else if (currentStep === 'notifications') {
      setCurrentStep('complete');
    } else {
      handleSkip();
    }
  };

  const handleInstallPWA = async () => {
    setLoading(true);
    try {
      const installed = await promptInstall();
      if (installed) {
        // Esperar un poco para que el usuario vea el resultado
        setTimeout(() => handleNext(), 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    setLoading(true);
    try {
      const subscription = await subscribeToPush();
      if (subscription) {
        setTimeout(() => handleNext(), 1000);
      } else {
        // Si no se pudo, igual avanzar
        handleNext();
      }
    } catch (error) {
      console.error('Error activando notificaciones:', error);
      handleNext();
    } finally {
      setLoading(false);
    }
  };

  const notificationPermission = getNotificationPermission();
  const pushSupported = isPushSupported();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: theme.background }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 border"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        {/* Header con skip */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {['welcome', 'pwa', 'notifications'].map((step, idx) => (
              <div
                key={step}
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  backgroundColor:
                    currentStep === step ||
                    (currentStep === 'complete' && idx < 3) ||
                    (['pwa', 'notifications', 'complete'].includes(currentStep) && idx === 0) ||
                    (['notifications', 'complete'].includes(currentStep) && idx === 1)
                      ? theme.primary
                      : theme.border,
                }}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="p-2 rounded-lg transition-all hover:bg-white/10"
          >
            <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
          </button>
        </div>

        {/* Step: Welcome */}
        {currentStep === 'welcome' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <CheckCircle2 className="h-10 w-10" style={{ color: theme.primary }} />
            </div>

            <h1 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>
              ¡Bienvenido{user?.nombre ? `, ${user.nombre}` : ''}!
            </h1>

            <p className="mb-2" style={{ color: theme.textSecondary }}>
              Tu cuenta en <strong>{municipioNombre}</strong> fue creada correctamente.
            </p>

            <p className="text-sm mb-8" style={{ color: theme.textSecondary }}>
              Vamos a configurar un par de cosas para que tengas la mejor experiencia.
            </p>

            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all"
              style={{ backgroundColor: theme.primary }}
            >
              Continuar
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Step: PWA Install */}
        {currentStep === 'pwa' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#8B5CF620' }}
            >
              <Smartphone className="h-10 w-10" style={{ color: '#8B5CF6' }} />
            </div>

            <h1 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>
              Acceso rapido
            </h1>

            <p className="mb-6" style={{ color: theme.textSecondary }}>
              Agrega la app a tu pantalla de inicio para acceder mas rapido, sin buscar en el navegador.
            </p>

            {isInstalled ? (
              <div
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl mb-4"
                style={{ backgroundColor: '#10b98120' }}
              >
                <CheckCircle2 className="h-5 w-5" style={{ color: '#10b981' }} />
                <span style={{ color: '#10b981' }}>App ya instalada</span>
              </div>
            ) : showIOSInstructions ? (
              <div
                className="text-left p-4 rounded-xl mb-4"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                  Para instalar en iPhone/iPad:
                </p>
                <div className="space-y-2 text-sm" style={{ color: theme.textSecondary }}>
                  <div className="flex items-center gap-2">
                    <Share className="h-4 w-4" />
                    <span>1. Toca el boton Compartir</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PlusSquare className="h-4 w-4" />
                    <span>2. Selecciona "Agregar a inicio"</span>
                  </div>
                </div>
              </div>
            ) : isInstallable ? (
              <button
                onClick={handleInstallPWA}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all disabled:opacity-50 mb-4"
                style={{ backgroundColor: '#8B5CF6' }}
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Smartphone className="h-5 w-5" />
                    Agregar al inicio
                  </>
                )}
              </button>
            ) : (
              <div
                className="py-3 px-4 rounded-xl mb-4 text-sm"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
              >
                La instalacion no esta disponible en este navegador.
              </div>
            )}

            <button
              onClick={handleNext}
              className="w-full py-3 px-4 rounded-xl font-medium transition-all"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              {isInstalled ? 'Continuar' : 'Ahora no'}
            </button>
          </div>
        )}

        {/* Step: Notifications */}
        {currentStep === 'notifications' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#f59e0b20' }}
            >
              <Bell className="h-10 w-10" style={{ color: '#f59e0b' }} />
            </div>

            <h1 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>
              Mantente informado
            </h1>

            <p className="mb-4" style={{ color: theme.textSecondary }}>
              Activa las notificaciones para saber cuando tu reclamo cambie de estado o sea resuelto.
            </p>

            <div
              className="text-left p-4 rounded-xl mb-6"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: theme.textSecondary }}>
                Te notificaremos cuando:
              </p>
              <ul className="text-xs space-y-1" style={{ color: theme.textSecondary }}>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Tu reclamo sea asignado
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Cambie el estado
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.primary }} />
                  Sea resuelto
                </li>
              </ul>
            </div>

            {!pushSupported ? (
              <div
                className="py-3 px-4 rounded-xl mb-4 text-sm"
                style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
              >
                Tu navegador no soporta notificaciones push.
              </div>
            ) : notificationPermission === 'denied' ? (
              <div
                className="py-3 px-4 rounded-xl mb-4 text-sm"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
              >
                Las notificaciones estan bloqueadas. Activalas desde la configuracion del navegador.
              </div>
            ) : notificationPermission === 'granted' ? (
              <div
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl mb-4"
                style={{ backgroundColor: '#10b98120' }}
              >
                <CheckCircle2 className="h-5 w-5" style={{ color: '#10b981' }} />
                <span style={{ color: '#10b981' }}>Notificaciones activadas</span>
              </div>
            ) : (
              <button
                onClick={handleEnableNotifications}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all disabled:opacity-50 mb-4"
                style={{ backgroundColor: '#f59e0b' }}
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Bell className="h-5 w-5" />
                    Activar notificaciones
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleNext}
              className="w-full py-3 px-4 rounded-xl font-medium transition-all"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              {notificationPermission === 'granted' ? 'Continuar' : 'Ahora no'}
            </button>
          </div>
        )}

        {/* Step: Complete */}
        {currentStep === 'complete' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <CheckCircle2 className="h-10 w-10" style={{ color: '#10b981' }} />
            </div>

            <h1 className="text-2xl font-bold mb-2" style={{ color: theme.text }}>
              ¡Todo listo!
            </h1>

            <p className="mb-8" style={{ color: theme.textSecondary }}>
              Ya podes empezar a usar el sistema de reclamos de {municipioNombre}.
            </p>

            <button
              onClick={handleSkip}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white transition-all"
              style={{ backgroundColor: theme.primary }}
            >
              Ir a mi panel
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
