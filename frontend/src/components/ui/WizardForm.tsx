import { ReactNode, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export interface WizardStep {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
  isValid?: boolean; // Para habilitar/deshabilitar navegación
}

interface WizardFormProps {
  steps: WizardStep[];
  onComplete: () => void;
  onCancel: () => void;
  saving?: boolean;
  // Panel de IA
  aiSuggestion?: {
    loading?: boolean;
    title?: string;
    message?: string;
    actions?: Array<{
      label: string;
      onClick: () => void;
      variant?: 'primary' | 'secondary';
    }>;
  };
  // Título del wizard
  title?: string;
  subtitle?: string;
  completeLabel?: string;
  // Control externo del paso (opcional)
  currentStep?: number;
  onStepChange?: (step: number) => void;
}

export function WizardForm({
  steps,
  onComplete,
  onCancel,
  saving = false,
  aiSuggestion,
  title,
  subtitle,
  completeLabel = 'Guardar',
  currentStep: externalStep,
  onStepChange: externalOnStepChange,
}: WizardFormProps) {
  const { theme } = useTheme();
  const [internalStep, setInternalStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([0]));
  const [direction, setDirection] = useState<'left' | 'right'>('right');

  // Usar estado externo si se provee, sino interno
  const currentStep = externalStep !== undefined ? externalStep : internalStep;
  const setCurrentStep = externalOnStepChange || setInternalStep;

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const currentStepData = steps[currentStep];

  // Marcar step como visitado
  useEffect(() => {
    setVisitedSteps(prev => new Set([...prev, currentStep]));
  }, [currentStep]);

  const goToStep = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    // Solo permitir ir a steps visitados o al siguiente
    if (visitedSteps.has(index) || index === currentStep + 1) {
      setDirection(index > currentStep ? 'right' : 'left');
      setCurrentStep(index);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      setDirection('right');
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setDirection('left');
      setCurrentStep(currentStep - 1);
    }
  };

  const getStepStatus = (index: number): 'completed' | 'current' | 'upcoming' | 'visited' => {
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'current';
    if (visitedSteps.has(index)) return 'visited';
    return 'upcoming';
  };

  return (
    <div
      className="rounded-2xl overflow-hidden animate-fade-in flex flex-col"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        minHeight: 'calc(100vh - 120px)', // Ocupa toda la altura visible menos header/padding
      }}
    >
      {/* Header con título y botón volver */}
      {title && (
        <div
          className="px-6 py-4 flex items-center gap-4"
          style={{ borderBottom: `1px solid ${theme.border}` }}
        >
          <button
            onClick={onCancel}
            className="group p-2.5 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 flex-shrink-0 relative overflow-hidden"
            style={{
              color: theme.text,
              backgroundColor: theme.backgroundSecondary,
              border: `1px solid ${theme.border}`,
            }}
            title="Volver al listado"
          >
            {/* Hover effect background */}
            <span
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ backgroundColor: `${theme.primary}15` }}
            />
            {/* Arrow with animation */}
            <ArrowLeft className="h-5 w-5 relative z-10 transition-transform duration-300 group-hover:-translate-x-0.5" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="text-sm font-medium" style={{ color: theme.textSecondary }}>
            Paso {currentStep + 1} de {steps.length}
          </div>
        </div>
      )}

      {/* Tabs de navegación */}
      <div
        className="px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-hide"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isClickable = visitedSteps.has(index) || index === currentStep + 1;

          return (
            <button
              key={step.id}
              onClick={() => isClickable && goToStep(index)}
              disabled={!isClickable}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-xl
                transition-all duration-300 whitespace-nowrap
                ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                ${status === 'current' ? 'scale-105' : 'hover:scale-102'}
              `}
              style={{
                backgroundColor: status === 'current'
                  ? theme.primary
                  : status === 'completed'
                    ? `${theme.primary}20`
                    : 'transparent',
                color: status === 'current'
                  ? '#ffffff'
                  : status === 'completed'
                    ? theme.primary
                    : theme.textSecondary,
                border: `1px solid ${status === 'current' ? theme.primary : theme.border}`,
              }}
            >
              {/* Número o check */}
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{
                  backgroundColor: status === 'current'
                    ? 'rgba(255,255,255,0.2)'
                    : status === 'completed'
                      ? theme.primary
                      : theme.backgroundSecondary,
                  color: status === 'completed' ? '#ffffff' : 'inherit',
                }}
              >
                {status === 'completed' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  index + 1
                )}
              </span>

              {/* Icono del step */}
              <span className="flex-shrink-0">{step.icon}</span>

              {/* Label */}
              <span className="font-medium text-sm">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Barra de progreso */}
      <div className="h-1 w-full" style={{ backgroundColor: theme.backgroundSecondary }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${((currentStep + 1) / steps.length) * 100}%`,
            background: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
          }}
        />
      </div>

      {/* Contenido del step actual - flex-1 para ocupar todo el espacio disponible */}
      <div className="p-6 flex-1 overflow-y-auto">
        <div
          key={currentStep}
          className={`animate-slide-${direction}`}
          style={{
            animation: `slide-${direction} 0.3s ease-out`,
          }}
        >
          {currentStepData.content}
        </div>
      </div>

      {/* Panel de sugerencia IA */}
      {aiSuggestion && (aiSuggestion.loading || aiSuggestion.message) && (
        <div
          className="mx-6 mb-4 p-4 rounded-xl"
          style={{
            backgroundColor: `${theme.primary}10`,
            border: `1px solid ${theme.primary}30`,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              {aiSuggestion.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.primary }} />
              ) : (
                <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium mb-1" style={{ color: theme.primary }}>
                {aiSuggestion.title || 'Sugerencia IA'}
              </p>
              {aiSuggestion.loading ? (
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  Analizando...
                </p>
              ) : (
                <>
                  <p className="text-sm" style={{ color: theme.text }}>
                    {aiSuggestion.message}
                  </p>
                  {aiSuggestion.actions && aiSuggestion.actions.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {aiSuggestion.actions.map((action, i) => (
                        <button
                          key={i}
                          onClick={action.onClick}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                          style={{
                            backgroundColor: action.variant === 'primary'
                              ? theme.primary
                              : theme.backgroundSecondary,
                            color: action.variant === 'primary'
                              ? '#ffffff'
                              : theme.text,
                            border: action.variant !== 'primary'
                              ? `1px solid ${theme.border}`
                              : 'none',
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer con navegación */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{
          borderTop: `1px solid ${theme.border}`,
          backgroundColor: theme.backgroundSecondary,
        }}
      >
        {/* Lado izquierdo: Cancelar */}
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
          style={{
            color: theme.textSecondary,
            border: `1px solid ${theme.border}`,
          }}
        >
          Cancelar
        </button>

        {/* Lado derecho: Anterior / Siguiente */}
        <div className="flex items-center gap-3">
          {!isFirstStep && (
            <button
              onClick={handlePrev}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
              style={{
                color: theme.text,
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={saving || (currentStepData.isValid === false)}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden group"
            style={{
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
              color: '#ffffff',
              boxShadow: `0 4px 14px ${theme.primary}40`,
            }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : isLastStep ? (
              <>
                <Check className="h-4 w-4" />
                {completeLabel}
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Estilos de animación */}
      <style>{`
        @keyframes slide-right {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slide-left {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-slide-right {
          animation: slide-right 0.3s ease-out;
        }

        .animate-slide-left {
          animation: slide-left 0.3s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.4s ease-out;
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transfrm: translateY(0); }
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

// Componente auxiliar para contenido de step
interface WizardStepContentProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function WizardStepContent({ children, title, description }: WizardStepContentProps) {
  const { theme } = useTheme();

  return (
    <div className="space-y-4">
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
