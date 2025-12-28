import { X, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../contexts/ThemeContext';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  content: ReactNode;
  isValid?: boolean;
}

interface HeaderBadge {
  icon: ReactNode;
  label: string;
  color: string;
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
  headerBadge?: HeaderBadge;
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
  headerBadge,
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
      }, 300);
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

  const modalContent = (
    <>
      {/* CSS Animations */}
      <style>{`
        .wizard-modal-backdrop {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 9998;
          background-color: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          opacity: ${isVisible ? 1 : 0};
          transition: opacity 0.3s ease;
        }
        .wizard-modal-container {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          margin: 0 !important;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
        }
        .wizard-modal-content {
          width: 100%;
          max-width: ${aiPanel ? '1200px' : '900px'};
          max-height: calc(100vh - 48px);
          margin: 0 !important;
          display: flex;
          flex-direction: column;
          border-radius: 16px;
          overflow: hidden;
          transform: ${isVisible ? 'scale(1)' : 'scale(0.95)'};
          opacity: ${isVisible ? 1 : 0};
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        .wizard-main-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .wizard-content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .wizard-ai-panel {
          width: 320px;
          border-left: 1px solid ${theme.border};
          background-color: ${theme.backgroundSecondary};
          overflow-y: auto;
          display: none;
        }
        @media (min-width: 1024px) {
          .wizard-ai-panel {
            display: block;
          }
        }
        .wizard-slide-right {
          animation: slideRight 0.3s ease-out;
        }
        .wizard-slide-left {
          animation: slideLeft 0.3s ease-out;
        }
        @keyframes slideRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Backdrop */}
      <div className="wizard-modal-backdrop" onClick={onClose} />

      {/* Modal Container */}
      <div className="wizard-modal-container" onClick={onClose}>
        <div
          className="wizard-modal-content"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Compact single line */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${theme.border}`,
              background: `linear-gradient(135deg, ${theme.primary}10 0%, ${theme.card} 100%)`,
              flexShrink: 0,
            }}
          >
            {/* Accent line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryHover})`,
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              {/* Title */}
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: theme.text, margin: 0, whiteSpace: 'nowrap' }}>
                  {title}
                </h2>
                <p style={{ fontSize: '12px', color: theme.textSecondary, margin: 0 }}>
                  Paso {currentStep + 1} de {steps.length}
                </p>
              </div>

              {/* Stepper - centered */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {steps.map((step, index) => {
                  const isCompleted = index < currentStep;
                  const isCurrent = index === currentStep;

                  return (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        onClick={() => handleStepClick(index)}
                        disabled={index > currentStep}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: `2px solid ${isCompleted || isCurrent ? theme.primary : theme.border}`,
                          backgroundColor: isCompleted || isCurrent ? theme.primary : theme.backgroundSecondary,
                          color: isCompleted || isCurrent ? 'white' : theme.textSecondary,
                          cursor: index <= currentStep ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                          boxShadow: isCurrent ? `0 0 0 3px ${theme.primary}30` : 'none',
                        }}
                      >
                        {isCompleted ? <Check style={{ width: '14px', height: '14px' }} /> : step.icon}
                      </button>

                      {index < steps.length - 1 && (
                        <div
                          style={{
                            width: '32px',
                            height: '3px',
                            marginLeft: '4px',
                            marginRight: '4px',
                            borderRadius: '2px',
                            backgroundColor: theme.backgroundSecondary,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: isCompleted ? '100%' : '0%',
                              backgroundColor: theme.primary,
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Close button */}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '6px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.textSecondary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '18px', height: '18px' }} />
                </button>
              </div>
            </div>
          </div>

          {/* Main Layout with Content and AI Panel */}
          <div className="wizard-main-layout">
            {/* Content Area */}
            <div className="wizard-content-area">
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '20px',
                  minHeight: '300px',
                }}
              >
                <div
                  className={direction === 'next' ? 'wizard-slide-right' : 'wizard-slide-left'}
                  key={currentStep}
                >
                  {/* Step title */}
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: `${theme.primary}20`,
                        color: theme.primary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {currentStepData?.icon}
                    </span>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, color: theme.text, margin: 0 }}>
                        {currentStepData?.title}
                      </h3>
                      {currentStepData?.description && (
                        <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '2px 0 0 0' }}>
                          {currentStepData.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Step content */}
                  {currentStepData?.content}
                </div>
              </div>
            </div>

            {/* AI Panel (optional) - solo en desktop */}
            {aiPanel && (
              <div className="wizard-ai-panel" style={{ padding: '20px' }}>
                {aiPanel}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: `1px solid ${theme.border}`,
              backgroundColor: theme.backgroundSecondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.card,
                color: theme.text,
                fontWeight: 500,
                cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                opacity: currentStep === 0 ? 0.5 : 1,
              }}
            >
              <ChevronLeft style={{ width: '18px', height: '18px' }} />
              Anterior
            </button>

            {/* Dots */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {steps.map((_, index) => (
                <div
                  key={index}
                  style={{
                    width: index === currentStep ? '24px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: index <= currentStep ? theme.primary : theme.border,
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>

            <button
              onClick={isLastStep ? onComplete : handleNext}
              disabled={loading || !canProceed}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: theme.primary,
                color: 'white',
                fontWeight: 600,
                cursor: loading || !canProceed ? 'not-allowed' : 'pointer',
                opacity: loading || !canProceed ? 0.5 : 1,
                boxShadow: `0 4px 14px ${theme.primary}40`,
              }}
            >
              {loading ? (
                <>
                  <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                  Guardando...
                </>
              ) : isLastStep ? (
                <>
                  <Check style={{ width: '18px', height: '18px' }} />
                  {completeLabel}
                </>
              ) : (
                <>
                  Siguiente
                  <ChevronRight style={{ width: '18px', height: '18px' }} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // Usar portal para renderizar fuera del DOM normal
  return createPortal(modalContent, document.body);
}

export default WizardModal;
