import { X } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { MobilePageHeader } from './MobilePageHeader';

// Altura de la topbar mobile del Layout principal (px). El Sheet en mobile
// arranca debajo para que la topbar del muni siempre quede visible.
const TOPBAR_MOBILE_HEIGHT = 56;
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
};

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
  const isMobile = useIsMobile();
  const topOffset = isMobile ? TOPBAR_MOBILE_HEIGHT : 0;
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
      {/* Compact sizing: todo el contenido del Sheet escala al 85% vs resto de la app */}
      <style>{`
        .sheet-compact .text-xs     { font-size: 0.638rem; line-height: 0.85rem; }
        .sheet-compact .text-sm     { font-size: 0.744rem; line-height: 1.063rem; }
        .sheet-compact .text-base   { font-size: 0.85rem;  line-height: 1.275rem; }
        .sheet-compact .text-lg     { font-size: 0.956rem; line-height: 1.488rem; }
        .sheet-compact .text-xl     { font-size: 1.063rem; line-height: 1.488rem; }
        .sheet-compact .text-2xl    { font-size: 1.275rem; line-height: 1.700rem; }
        .sheet-compact .text-3xl    { font-size: 1.594rem; line-height: 1.913rem; }
        .sheet-compact .text-\\[10px\\]   { font-size: 8.5px; }
        .sheet-compact .text-\\[11px\\]   { font-size: 9.35px; }
        .sheet-compact .text-\\[13px\\]   { font-size: 11.05px; }
        .sheet-compact h1, .sheet-compact h2, .sheet-compact h3 { font-size: 0.9em; }
      `}</style>

      {/* Backdrop con fade y blur — en mobile respeta la topbar del Layout */}
      <div
        className="sheet-backdrop"
        style={{
          position: 'fixed',
          top: topOffset,
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

      {/* Side Panel — en mobile arranca debajo de la topbar (56px) */}
      <div
        className="sheet-panel sheet-compact"
        style={{
          position: 'fixed',
          top: topOffset,
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

        {/* Header estandar: en mobile usa MobilePageHeader (← volver + titulo),
           en desktop mantiene el X a la derecha. */}
        <div
          style={{
            transform: isVisible ? 'translateX(0)' : 'translateX(20px)',
            opacity: isVisible ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: isVisible ? '100ms' : '0ms',
            flexShrink: 0,
          }}
        >
          {isMobile ? (
            <MobilePageHeader title={title} subtitle={description} onBack={onClose} />
          ) : (
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{
                borderBottom: `1px solid ${theme.border}`,
                backgroundColor: `${theme.background}cc`,
              }}
            >
              <div>
                <h2 className="text-lg font-semibold leading-tight" style={{ color: theme.text }}>
                  {title}
                </h2>
                {description && (
                  <p className="text-sm mt-0.5" style={{ color: theme.textSecondary }}>
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
          )}
        </div>

        {/* Sticky Header adicional (ej: estado y categoría) */}
        {stickyHeader && (
          <div
            className="px-5 py-2"
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
          className="px-5 py-3"
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
            className="px-5 py-3"
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
