import { X, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  content: ReactNode;
  isValid?: boolean;
}

interface WizardModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
  loading?: boolean;
  completeLabel?: string;
  aiPanel?: ReactNode;
}

export function WizardModal({
  open,
  onClose,
  title,
  steps,
  currentStep,
  onStepChange,
  onComplete,
  loading = false,
  completeLabel = 'Finalizar',
  aiPanel,
}: WizardModalProps) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setDirection('next');
      onStepChange(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setDirection('prev');
      onStepChange(currentStep - 1);
    }
  };

  const handleStepClick = (index: number) => {
    if (index < currentStep) {
      setDirection('prev');
      onStepChange(index);
    }
  };

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const canProceed = currentStepData?.isValid !== false;

  if (!shouldRender) return null;

  return (
    <>
      {/* Inyectar estilos de animación */}
      <style>{`
        @keyframes wizard-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--wizard-primary-rgb), 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(var(--wizard-primary-rgb), 0); }
        }
        @keyframes wizard-slide-in-right {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes wizard-slide-in-left {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes wizard-fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes wizard-check-bounce {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes wizard-icon-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes wizard-progress-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes wizard-glow {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.2); }
        }
        .wizard-step-content-enter {
          animation: ${direction === 'next' ? 'wizard-slide-in-right' : 'wizard-slide-in-left'} 0.3s ease-out;
        }
        .wizard-check-animate {
          animation: wizard-check-bounce 0.4s ease-out;
        }
        .wizard-icon-active {
          animation: wizard-icon-float 2s ease-in-out infinite;
        }
        .wizard-glow {
          animation: wizard-glow 2s ease-in-out infinite;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: isVisible ? 'blur(8px)' : 'blur(0px)',
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className="fixed inset-x-0 top-0 bottom-0 z-50 flex items-start justify-center pt-4 pb-4 px-4 overflow-y-auto"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          className="w-full max-w-5xl flex flex-col rounded-2xl overflow-hidden"
          style={{
            minHeight: '500px',
            maxHeight: 'calc(100vh - 32px)',
            transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-20px)',
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            backgroundColor: theme.card,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px ${theme.border}, 0 0 60px ${theme.primary}20`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="relative px-6 py-4"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}15 0%, ${theme.card} 100%)`,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            {/* Decorative accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{
                background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryHover})`,
                transform: isVisible ? 'scaleX(1)' : 'scaleX(0)',
                transformOrigin: 'left',
                transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />

            <div className="flex items-center justify-between">
              <div
                style={{
                  transform: isVisible ? 'translateX(0)' : 'translateX(-20px)',
                  opacity: isVisible ? 1 : 0,
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  transitionDelay: '100ms',
                }}
              >
                <h2 className="text-xl font-bold" style={{ color: theme.text }}>
                  {title}
                </h2>
                <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                  Paso {currentStep + 1} de {steps.length}
                </p>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl transition-all duration-200 hover:scale-110 hover:rotate-90 active:scale-95 relative overflow-hidden group"
                style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}
              >
                <span className="absolute inset-0 bg-red-500/20 scale-0 group-hover:scale-100 transition-transform duration-200 rounded-xl" />
                <X className="h-5 w-5 relative z-10 group-hover:text-red-500 transition-colors duration-200" />
              </button>
            </div>

            {/* Stepper */}
            <div
              className="mt-4 flex items-center justify-center"
              style={{
                transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDelay: '150ms',
              }}
            >
              {steps.map((step, index) => {
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                const isPending = index > currentStep;

                return (
                  <div key={step.id} className="flex items-center">
                    {/* Step circle */}
                    <button
                      onClick={() => handleStepClick(index)}
                      disabled={isPending}
                      className={`
                        relative flex items-center justify-center w-10 h-10 rounded-full
                        transition-all duration-300
                        ${isCompleted ? 'cursor-pointer hover:scale-110' : ''}
                        ${isCurrent ? 'wizard-glow' : ''}
                      `}
                      style={{
                        backgroundColor: isCompleted
                          ? theme.primary
                          : isCurrent
                          ? theme.primary
                          : theme.backgroundSecondary,
                        border: `2px solid ${
                          isCompleted || isCurrent ? theme.primary : theme.border
                        }`,
                        boxShadow: isCurrent
                          ? `0 0 15px ${theme.primary}50, 0 0 30px ${theme.primary}25`
                          : 'none',
                        transform: isCurrent ? 'scale(1.05)' : 'scale(1)',
                      }}
                    >
                      {isCompleted ? (
                        <Check
                          className="h-5 w-5 wizard-check-animate"
                          style={{ color: 'white' }}
                        />
                      ) : (
                        <div
                          className={isCurrent ? 'wizard-icon-active' : ''}
                          style={{
                            color: isCurrent ? 'white' : theme.textSecondary,
                          }}
                        >
                          {step.icon}
                        </div>
                      )}

                      {/* Pulse effect for current step */}
                      {isCurrent && (
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{
                            animation: 'wizard-pulse 2s infinite',
                            '--wizard-primary-rgb': theme.primary
                              .replace('#', '')
                              .match(/.{2}/g)
                              ?.map((x) => parseInt(x, 16))
                              .join(', '),
                          } as React.CSSProperties}
                        />
                      )}
                    </button>

                    {/* Connector line */}
                    {index < steps.length - 1 && (
                      <div
                        className="w-16 sm:w-24 h-1 mx-1 sm:mx-2 rounded-full overflow-hidden"
                        style={{ backgroundColor: theme.backgroundSecondary }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            backgroundColor: theme.primary,
                            width: isCompleted ? '100%' : '0%',
                            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden flex min-h-0">
            {/* Main content */}
            <div
              className="flex-1 overflow-y-auto p-4"
              style={{
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDelay: '200ms',
              }}
            >
              {/* Step title and description */}
              <div className="mb-4 wizard-step-content-enter" key={currentStep}>
                <h3
                  className="text-base font-semibold flex items-center gap-2"
                  style={{ color: theme.text }}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: `${theme.primary}20`,
                      color: theme.primary,
                    }}
                  >
                    {currentStepData?.icon}
                  </span>
                  {currentStepData?.title}
                </h3>
                {currentStepData?.description && (
                  <p
                    className="text-sm mt-1 ml-9"
                    style={{ color: theme.textSecondary }}
                  >
                    {currentStepData.description}
                  </p>
                )}
              </div>

              {/* Step content */}
              <div className="wizard-step-content-enter" key={`content-${currentStep}`}>
                {currentStepData?.content}
              </div>
            </div>

            {/* AI Panel (optional) */}
            {aiPanel && (
              <div
                className="w-72 border-l p-4 hidden lg:block"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundSecondary,
                  transform: isVisible ? 'translateX(0)' : 'translateX(20px)',
                  opacity: isVisible ? 1 : 0,
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  transitionDelay: '250ms',
                }}
              >
                {aiPanel}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{
              borderTop: `1px solid ${theme.border}`,
              backgroundColor: theme.backgroundSecondary,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              opacity: isVisible ? 1 : 0,
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDelay: '250ms',
            }}
          >
            {/* Previous button */}
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                backgroundColor: theme.card,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            {/* Step indicators */}
            <div className="flex items-center gap-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className="w-2 h-2 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor:
                      index === currentStep
                        ? theme.primary
                        : index < currentStep
                        ? theme.primary
                        : theme.border,
                    transform: index === currentStep ? 'scale(1.5)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            {/* Next/Complete button */}
            <button
              onClick={isLastStep ? onComplete : handleNext}
              disabled={loading || !canProceed}
              className="flex items-center gap-2 px-5 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                backgroundColor: theme.primary,
                color: 'white',
                boxShadow: canProceed ? `0 4px 14px ${theme.primary}40` : 'none',
              }}
            >
              {loading ? (
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
      </div>
    </>
  );
}

export default WizardModal;
