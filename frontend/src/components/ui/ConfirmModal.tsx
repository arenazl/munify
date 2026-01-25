import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger'
}: ConfirmModalProps) {
  const { theme } = useTheme();

  // Keyboard handler: Enter = confirm, Escape = close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onConfirm, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const variantColors = {
    danger: { bg: '#ef444420', border: '#ef4444', icon: '#ef4444', button: '#ef4444' },
    warning: { bg: '#f59e0b20', border: '#f59e0b', icon: '#f59e0b', button: '#f59e0b' },
    info: { bg: `${theme.primary}20`, border: theme.primary, icon: theme.primary, button: theme.primary },
  };

  const colors = variantColors[variant];

  const handleConfirm = () => {
    onConfirm();
  };

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          animation: 'modalFadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
          style={{
            color: theme.textSecondary,
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.textSecondary}20`}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: colors.bg }}
        >
          <AlertTriangle className="h-7 w-7" style={{ color: colors.icon }} />
        </div>

        {/* Title */}
        <h3
          className="text-lg font-bold text-center mb-2"
          style={{ color: theme.text }}
        >
          {title}
        </h3>

        {/* Message */}
        <p
          className="text-sm text-center mb-6 leading-relaxed"
          style={{ color: theme.textSecondary }}
        >
          {message}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.text,
              border: `1px solid ${theme.border}`,
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:opacity-90"
            style={{
              backgroundColor: colors.button,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>

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
    </div>
  );

  // Usar Portal para renderizar fuera del DOM tree normal
  return createPortal(modalContent, document.body);
}
