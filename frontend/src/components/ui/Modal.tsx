import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  footer?: ReactNode;
}

const sizeClasses = {
  sm: '24rem',    // max-w-sm
  md: '28rem',    // max-w-md
  lg: '32rem',    // max-w-lg
  xl: '36rem',    // max-w-xl
  full: '64rem',  // max-w-5xl
};

/**
 * Modal component - Renders a centered modal dialog fixed to viewport
 * Uses createPortal to render outside DOM hierarchy, avoiding positioning issues
 */
export function Modal({
  open,
  onClose,
  children,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  closeOnBackdrop = true,
  footer,
}: ModalProps) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

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

  if (!shouldRender) return null;

  const handleBackdropClick = () => {
    if (closeOnBackdrop) {
      onClose();
    }
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: isVisible ? 'blur(4px)' : 'blur(0px)',
          opacity: isVisible ? 1 : 0,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={handleBackdropClick}
      />

      {/* Modal Container - centered */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          pointerEvents: 'none',
        }}
      >
        {/* Modal Content */}
        <div
          style={{
            width: '100%',
            maxWidth: sizeClasses[size],
            maxHeight: 'calc(100vh - 2rem)',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: theme.card,
            borderRadius: '1rem',
            border: `1px solid ${theme.border}`,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-10px)',
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'auto',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                borderBottom: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <div>
                {title && (
                  <h2
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: theme.text,
                      margin: 0,
                    }}
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: theme.textSecondary,
                      marginTop: '0.25rem',
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.textSecondary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ef444420';
                    e.currentTarget.style.color = '#ef4444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.backgroundSecondary;
                    e.currentTarget.style.color = theme.textSecondary;
                  }}
                >
                  <X style={{ width: '1.25rem', height: '1.25rem' }} />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.5rem',
              minHeight: 0,
              color: theme.text,
            }}
          >
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: `1px solid ${theme.border}`,
                backgroundColor: theme.backgroundSecondary,
                flexShrink: 0,
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
}

export default Modal;
