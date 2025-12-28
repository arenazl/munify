import { X } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../contexts/ThemeContext';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  stickyFooter?: ReactNode; // Footer que siempre está fijo abajo
  stickyHeader?: ReactNode; // Header adicional que queda sticky debajo del título
}

export function Sheet({ open, onClose, title, description, children, footer, stickyFooter, stickyHeader }: SheetProps) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      // Pequeño delay para que el DOM se renderice antes de animar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
      // Esperar a que termine la animación antes de desmontar
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!shouldRender) return null;

  // Usar portal para renderizar fuera del DOM normal y evitar problemas de contexto de posicionamiento
  const sheetContent = (
    <>
      {/* Backdrop con fade y blur */}
      <div
        className="sheet-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: isVisible ? 'blur(4px)' : 'blur(0px)',
          opacity: isVisible ? 1 : 0,
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={onClose}
      />

      {/* Side Panel - dockeado al lado derecho, 100% del viewport */}
      <div
        className="sheet-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          width: '100%',
          maxWidth: '32rem', // max-w-lg
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.card,
          transform: isVisible
            ? 'translateX(0) scale(1)'
            : 'translateX(100%) scale(0.95)',
          opacity: isVisible ? 1 : 0,
          boxShadow: isVisible
            ? `-20px 0 60px rgba(0, 0, 0, 0.3), -5px 0 20px ${theme.primary}20`
            : 'none',
          transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Línea de acento animada */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '4px',
            background: `linear-gradient(180deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
            transform: isVisible ? 'scaleY(1)' : 'scaleY(0)',
            transformOrigin: 'top',
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />

        {/* Header con animación de entrada */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            borderBottom: `1px solid ${theme.border}`,
            backgroundColor: `${theme.background}cc`,
            transform: isVisible ? 'translateX(0)' : 'translateX(20px)',
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: isVisible ? '100ms' : '0ms',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              {title}
            </h2>
            {description && (
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110 hover:rotate-90 active:scale-95 relative overflow-hidden group"
            style={{ color: theme.textSecondary, backgroundColor: theme.backgroundSecondary }}
          >
            <span className="absolute inset-0 bg-red-500/20 scale-0 group-hover:scale-100 transition-transform duration-200 rounded-lg" />
            <X className="h-5 w-5 relative z-10 group-hover:text-red-500 transition-colors duration-200" />
          </button>
        </div>

        {/* Sticky Header adicional (ej: estado y categoría) */}
        {stickyHeader && (
          <div
            className="px-6 py-3"
            style={{
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: theme.backgroundSecondary,
              transform: isVisible ? 'translateX(0)' : 'translateX(25px)',
              opacity: isVisible ? 1 : 0,
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDelay: isVisible ? '120ms' : '0ms',
              flexShrink: 0,
            }}
          >
            {stickyHeader}
          </div>
        )}

        {/* Content con scroll interno */}
        <div
          className="px-6 py-4"
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            color: theme.text,
            transform: isVisible ? 'translateX(0)' : 'translateX(30px)',
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: isVisible ? '150ms' : '0ms',
          }}
        >
          {children}
        </div>

        {/* Footer - pegado al fondo del panel */}
        {(footer || stickyFooter) && (
          <div
            className="px-6 py-4"
            style={{
              borderTop: `1px solid ${theme.border}`,
              backgroundColor: `${theme.background}cc`,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              opacity: isVisible ? 1 : 0,
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDelay: isVisible ? '200ms' : '0ms',
              boxShadow: `0 -4px 20px rgba(0, 0, 0, 0.1)`,
              flexShrink: 0,
            }}
          >
            {footer || stickyFooter}
          </div>
        )}
      </div>
    </>
  );

  return createPortal(sheetContent, document.body);
}
