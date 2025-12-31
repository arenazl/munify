import { useState, useEffect } from 'react';
import {
  X,
  Share,
  PlusSquare,
  Download,
  Smartphone,
  Check,
  ChevronRight,
  ChevronLeft,
  Bell,
  Sparkles,
  Home,
  MoreVertical,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAOnboardingProps {
  onClose: () => void;
  municipioNombre: string;
  municipioColor: string;
}

export default function PWAOnboarding({ onClose, municipioNombre, municipioColor }: PWAOnboardingProps) {
  const { theme } = useTheme();
  const { isInstallable, promptInstall, isIOS, isInstalled } = usePWAInstall();
  const [currentStep, setCurrentStep] = useState(0);
  const [installing, setInstalling] = useState(false);

  // Detectar si es Android
  const isAndroid = /android/i.test(navigator.userAgent);
  const isSamsung = /samsung/i.test(navigator.userAgent);

  // Si ya esta instalado, cerrar automaticamente
  useEffect(() => {
    if (isInstalled) {
      onClose();
    }
  }, [isInstalled, onClose]);

  // Pasos para iOS
  const iosSteps = [
    {
      title: 'Bienvenido a la App',
      description: `Instala ${municipioNombre} en tu iPhone para acceder rapidamente sin abrir Safari.`,
      icon: Sparkles,
      content: (
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: municipioColor }}
          >
            <Home className="h-10 w-10 text-white" />
          </div>
          <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
            Solo toma 10 segundos
          </p>
        </div>
      ),
    },
    {
      title: 'Paso 1: Toca Compartir',
      description: 'Busca el icono de compartir en la barra inferior de Safari',
      icon: Share,
      content: (
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {/* Simulacion de barra de Safari */}
            <div
              className="w-64 h-14 rounded-xl flex items-center justify-around px-4"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <ChevronLeft className="h-5 w-5" style={{ color: theme.textSecondary }} />
              <ChevronRight className="h-5 w-5" style={{ color: theme.textSecondary }} />
              <div
                className="relative animate-pulse"
              >
                <Share className="h-6 w-6" style={{ color: theme.primary }} />
                <div
                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping"
                  style={{ backgroundColor: municipioColor }}
                />
              </div>
              <div className="w-5 h-5 rounded" style={{ backgroundColor: theme.border }} />
            </div>
          </div>
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ backgroundColor: `${municipioColor}20` }}
          >
            <Share className="h-4 w-4" style={{ color: municipioColor }} />
            <span className="text-sm font-medium" style={{ color: municipioColor }}>
              Toca este icono
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Paso 2: Agregar a Inicio',
      description: 'Desliza hacia abajo y selecciona "Agregar a pantalla de inicio"',
      icon: PlusSquare,
      content: (
        <div className="flex flex-col items-center gap-3">
          {/* Simulacion del menu de compartir */}
          <div
            className="w-64 rounded-xl overflow-hidden"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <div className="p-3 border-b" style={{ borderColor: theme.border }}>
              <p className="text-xs text-center" style={{ color: theme.textSecondary }}>Desliza hacia abajo...</p>
            </div>
            <div className="p-2">
              <div
                className="flex items-center gap-3 p-3 rounded-lg animate-pulse"
                style={{ backgroundColor: `${municipioColor}15` }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: theme.card }}
                >
                  <PlusSquare className="h-5 w-5" style={{ color: municipioColor }} />
                </div>
                <span className="font-medium text-sm" style={{ color: theme.text }}>
                  Agregar a pantalla de inicio
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Paso 3: Confirmar',
      description: 'Toca "Agregar" en la esquina superior derecha',
      icon: Check,
      content: (
        <div className="flex flex-col items-center gap-4">
          {/* Simulacion de pantalla de confirmacion */}
          <div
            className="w-64 rounded-xl overflow-hidden"
            style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: theme.border }}>
              <span className="text-sm" style={{ color: theme.textSecondary }}>Cancelar</span>
              <span className="text-sm font-bold" style={{ color: theme.text }}>Agregar a inicio</span>
              <span
                className="text-sm font-bold animate-pulse"
                style={{ color: municipioColor }}
              >
                Agregar
              </span>
            </div>
            <div className="p-4 flex flex-col items-center gap-2">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: municipioColor }}
              >
                <Home className="h-7 w-7 text-white" />
              </div>
              <span className="text-sm font-medium" style={{ color: theme.text }}>
                {municipioNombre.replace('Municipalidad de ', '')}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Listo!',
      description: 'La app aparecera en tu pantalla de inicio',
      icon: Sparkles,
      content: (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: municipioColor }}
            >
              <Home className="h-8 w-8 text-white" />
            </div>
          </div>
          <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
            Ahora podes acceder rapidamente desde tu pantalla de inicio
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: municipioColor }}
          >
            Entendido
          </button>
        </div>
      ),
    },
  ];

  // Pasos para Android
  const androidSteps = [
    {
      title: 'Bienvenido a la App',
      description: `Instala ${municipioNombre} en tu celular para acceder rapidamente.`,
      icon: Sparkles,
      content: (
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: municipioColor }}
          >
            <Home className="h-10 w-10 text-white" />
          </div>
          <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
            Solo un toque y listo
          </p>
        </div>
      ),
    },
    {
      title: 'Instalar App',
      description: isInstallable
        ? 'Toca el boton para agregar la app a tu pantalla de inicio'
        : 'Toca el menu del navegador y selecciona "Instalar app" o "Agregar a inicio"',
      icon: Download,
      content: (
        <div className="flex flex-col items-center gap-4">
          {isInstallable ? (
            <>
              <button
                onClick={async () => {
                  setInstalling(true);
                  try {
                    await promptInstall();
                  } finally {
                    setInstalling(false);
                  }
                }}
                disabled={installing}
                className="flex items-center gap-3 px-6 py-4 rounded-xl font-semibold text-white transition-transform active:scale-95"
                style={{ backgroundColor: municipioColor }}
              >
                {installing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Instalando...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    <span>Instalar App</span>
                  </>
                )}
              </button>
              <p className="text-xs text-center" style={{ color: theme.textSecondary }}>
                La app se agregara a tu pantalla de inicio
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* Menu de Chrome/Samsung */}
              <div
                className="w-64 rounded-xl overflow-hidden"
                style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: theme.border }}>
                  <span className="text-sm" style={{ color: theme.text }}>Menu del navegador</span>
                  <MoreVertical className="h-5 w-5 animate-pulse" style={{ color: municipioColor }} />
                </div>
                <div className="p-2">
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: `${municipioColor}15` }}
                  >
                    <Download className="h-5 w-5" style={{ color: municipioColor }} />
                    <span className="text-sm" style={{ color: theme.text }}>
                      {isSamsung ? 'Agregar pagina a' : 'Instalar app'}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-center px-4" style={{ color: theme.textSecondary }}>
                Busca los 3 puntos en la esquina superior derecha
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Listo!',
      description: 'La app aparecera en tu pantalla de inicio',
      icon: Sparkles,
      content: (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: municipioColor }}
            >
              <Home className="h-8 w-8 text-white" />
            </div>
          </div>
          <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
            Ahora podes acceder rapidamente desde tu pantalla de inicio
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: municipioColor }}
          >
            Entendido
          </button>
        </div>
      ),
    },
  ];

  const steps = isIOS ? iosSteps : androidSteps;
  const step = steps[currentStep];
  const StepIcon = step.icon;

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full md:w-[400px] md:max-h-[90vh] rounded-t-3xl md:rounded-3xl overflow-hidden animate-slide-up"
        style={{ backgroundColor: theme.card }}
      >
        {/* Header */}
        <div className="relative p-4 pb-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
          </button>

          {/* Progress */}
          <div className="flex gap-1 mb-4 pr-12">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className="h-1 flex-1 rounded-full transition-all"
                style={{
                  backgroundColor: idx <= currentStep ? municipioColor : theme.border,
                }}
              />
            ))}
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${municipioColor}20` }}
            >
              <StepIcon className="h-5 w-5" style={{ color: municipioColor }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                Paso {currentStep + 1} de {steps.length}
              </p>
              <h3 className="font-bold" style={{ color: theme.text }}>
                {step.title}
              </h3>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 pt-2">
          <p className="text-sm mb-6 text-center" style={{ color: theme.textSecondary }}>
            {step.description}
          </p>

          <div className="min-h-[200px] flex items-center justify-center">
            {step.content}
          </div>
        </div>

        {/* Navigation */}
        <div className="p-4 pt-0 flex gap-3">
          {currentStep > 0 && currentStep < steps.length - 1 && (
            <button
              onClick={prevStep}
              className="flex-1 py-3 rounded-xl font-medium"
              style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            >
              Atras
            </button>
          )}
          {currentStep < steps.length - 1 && (
            <button
              onClick={nextStep}
              className="flex-1 py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: municipioColor }}
            >
              {currentStep === 0 ? 'Comenzar' : 'Siguiente'}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Skip option */}
        {currentStep < steps.length - 1 && (
          <div className="px-4 pb-6 pt-0">
            <button
              onClick={onClose}
              className="w-full text-center text-sm py-2"
              style={{ color: theme.textSecondary }}
            >
              Omitir por ahora
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
