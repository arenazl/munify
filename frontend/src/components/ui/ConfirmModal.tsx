import { useEffect, useCallback, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { AlertTriangle, CheckCircle2, Info, X, RefreshCw, XCircle } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (inputValue?: string) => void;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  /** Si se pasa, muestra un textarea obligatorio y devuelve el valor al confirmar */
  promptLabel?: string;
  promptPlaceholder?: string;
  /** Loading state del botón confirmar */
  loading?: boolean;
  /** Icono custom (por default viene según variant) */
  icon?: ReactNode;
}

/**
 * ConfirmModal moderno con estilos consistentes de la app.
 * Reemplaza a window.confirm() y window.prompt() nativos.
 *
 * Uso simple:
 *   <ConfirmModal isOpen={x} onClose={...} onConfirm={...}
 *     title="..." message="..." variant="danger" />
 *
 * Con input (prompt):
 *   <ConfirmModal ... promptLabel="Motivo" promptPlaceholder="..." />
 *   → onConfirm recibe el texto ingresado
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  promptLabel,
  promptPlaceholder,
  loading = false,
  icon,
}: ConfirmModalProps) {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState('');
  const needsInput = !!promptLabel;

  // Reset input al abrir
  useEffect(() => {
    if (isOpen) setInputValue('');
  }, [isOpen]);

  const canConfirm = !needsInput || inputValue.trim().length > 0;

  const handleConfirm = useCallback(() => {
    if (!canConfirm || loading) return;
    onConfirm(needsInput ? inputValue.trim() : undefined);
  }, [canConfirm, loading, onConfirm, needsInput, inputValue]);

  // Keyboard: Enter = confirm (si no hay input), Escape = close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && !needsInput) {
      e.preventDefault();
      handleConfirm();
    }
  }, [onClose, handleConfirm, needsInput]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Paleta por variant — usa las variables del theme cuando aplica
  const variantConfig = {
    danger: {
      accent: '#ef4444',
      iconBg: '#ef444418',
      DefaultIcon: XCircle,
      buttonGradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      buttonShadow: '0 6px 20px #ef444455',
    },
    warning: {
      accent: '#f59e0b',
      iconBg: '#f59e0b18',
      DefaultIcon: AlertTriangle,
      buttonGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      buttonShadow: '0 6px 20px #f59e0b55',
    },
    info: {
      accent: theme.primary,
      iconBg: `${theme.primary}18`,
      DefaultIcon: Info,
      buttonGradient: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover || theme.primary} 100%)`,
      buttonShadow: `0 6px 20px ${theme.primary}55`,
    },
    success: {
      accent: '#10b981',
      iconBg: '#10b98118',
      DefaultIcon: CheckCircle2,
      buttonGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      buttonShadow: '0 6px 20px #10b98155',
    },
  };

  const cfg = variantConfig[variant];
  const IconComp = icon ? null : cfg.DefaultIcon;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
          animation: 'confirmModalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de acento arriba con el color del variant */}
        <div
          className="h-1"
          style={{ background: cfg.buttonGradient }}
        />

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 hover:rotate-90"
            style={{
              color: theme.textSecondary,
              backgroundColor: theme.backgroundSecondary,
            }}
            title="Cerrar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Icon con halo */}
          <div className="flex justify-center mb-4">
            <div
              className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: cfg.iconBg }}
            >
              {/* Halo pulsante sutil */}
              <span
                className="absolute inset-0 rounded-2xl animate-pulse"
                style={{
                  backgroundColor: cfg.accent,
                  opacity: 0.12,
                }}
              />
              {icon ? (
                <span style={{ color: cfg.accent }}>{icon}</span>
              ) : (
                IconComp && <IconComp className="h-8 w-8 relative z-10" style={{ color: cfg.accent }} strokeWidth={2} />
              )}
            </div>
          </div>

          {/* Title */}
          <h3
            className="text-lg font-bold text-center mb-2"
            style={{ color: theme.text }}
          >
            {title}
          </h3>

          {/* Message */}
          <div
            className="text-sm text-center leading-relaxed mb-5"
            style={{ color: theme.textSecondary }}
          >
            {message}
          </div>

          {/* Prompt input (opcional) */}
          {needsInput && (
            <div className="mb-5">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: theme.textSecondary }}>
                {promptLabel}
              </label>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={promptPlaceholder}
                rows={3}
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 transition-all"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  border: `1.5px solid ${inputValue.trim() ? cfg.accent : theme.border}`,
                  color: theme.text,
                }}
              />
            </div>
          )}

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="py-2.5 px-4 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
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
              disabled={!canConfirm || loading}
              className="py-2.5 px-4 rounded-xl font-semibold text-sm text-white transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              style={{
                background: cfg.buttonGradient,
                boxShadow: cfg.buttonShadow,
              }}
            >
              {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
              {loading ? 'Procesando…' : confirmText}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes confirmModalIn {
          from { opacity: 0; transform: scale(0.92) translateY(-12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
}
