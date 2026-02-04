import { ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface PullToRefreshProps {
  /** Contenido de la página */
  children: ReactNode;
  /** Callback que se ejecuta al hacer pull-to-refresh. Debe retornar una Promise. */
  onRefresh: () => Promise<void>;
  /** Distancia mínima de pull para activar el refresh (default: 80) */
  threshold?: number;
  /** Desactivar el pull-to-refresh */
  disabled?: boolean;
}

/**
 * Componente wrapper que agrega pull-to-refresh a cualquier contenido.
 * Solo funciona en dispositivos touch (mobile).
 *
 * Uso:
 * <PullToRefresh onRefresh={async () => { await loadData(); }}>
 *   <MiContenido />
 * </PullToRefresh>
 */
export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  disabled = false,
}: PullToRefreshProps) {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || refreshing) return;

    // Solo activar si estamos en el top del scroll
    const scrollTop = containerRef.current?.scrollTop ?? window.scrollY;
    if (scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [disabled, refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || disabled || refreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY.current;
    const scrollTop = containerRef.current?.scrollTop ?? window.scrollY;

    if (distance > 0 && scrollTop === 0) {
      // Aplicar resistencia al pull (disminuye conforme se aleja)
      const resistance = Math.min(distance * 0.5, threshold + 30);
      setPullDistance(resistance);

      // Prevenir scroll normal cuando estamos pulling
      if (distance > 10) {
        e.preventDefault();
      }
    } else {
      // Si scrolleamos hacia abajo, cancelar el pull
      if (isPulling.current && distance < -5) {
        isPulling.current = false;
        setPullDistance(0);
      }
    }
  }, [disabled, refreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled) return;
    isPulling.current = false;

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold); // Mantener en posición de loading

      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Animar el retorno a 0
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh, threshold, disabled]);

  useEffect(() => {
    if (disabled) return;

    const container = containerRef.current;
    const target = container || document;

    target.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    target.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
    target.addEventListener('touchend', handleTouchEnd as EventListener);

    return () => {
      target.removeEventListener('touchstart', handleTouchStart as EventListener);
      target.removeEventListener('touchmove', handleTouchMove as EventListener);
      target.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  const showIndicator = pullDistance > 0 || refreshing;
  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      {showIndicator && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center transition-all duration-200 pointer-events-none"
          style={{
            top: Math.min(pullDistance - 50, threshold - 40),
            opacity: Math.min(progress * 1.5, 1),
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{
              backgroundColor: theme.card,
              border: `2px solid ${progress >= 1 ? theme.primary : theme.border}`,
            }}
          >
            <RefreshCw
              className={`h-5 w-5 transition-all ${refreshing ? 'animate-spin' : ''}`}
              style={{
                color: progress >= 1 || refreshing ? theme.primary : theme.textSecondary,
                transform: refreshing ? undefined : `rotate(${pullDistance * 4}deg)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Content with transform when pulling */}
      <div
        className="transition-transform duration-200"
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default PullToRefresh;
