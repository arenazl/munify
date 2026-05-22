import { Sparkles, ArrowRight, ArrowLeft, X, Check } from 'lucide-react';
import type { TooltipRenderProps } from 'react-joyride';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Tooltip custom para MunifyTour. Look 2026:
 * - Card con glass morphism (backdrop blur + border sutil).
 * - Gradient de fondo con tinta del primary del muni.
 * - Badge con número del step y total.
 * - Progress bar animada arriba.
 * - Botones con gradient + hover scale + active scale.
 * - Animación de entrada via Tailwind animate-in.
 */
export function MunifyTourTooltip({
  index,
  isLastStep,
  size,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const { theme } = useTheme();
  const progress = ((index + 1) / size) * 100;
  const isFirst = index === 0;

  return (
    <div
      {...tooltipProps}
      className="relative overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-300"
      style={{
        width: 'min(420px, calc(100vw - 32px))',
        background: `linear-gradient(135deg, ${theme.card}f0 0%, ${theme.card} 100%)`,
        borderRadius: 20,
        border: `1px solid ${theme.primary}30`,
        boxShadow: `0 24px 64px -12px ${theme.primary}40, 0 8px 24px -8px rgba(0,0,0,0.25), 0 0 0 1px ${theme.primary}10 inset`,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {/* Progress bar arriba */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: `${theme.primary}15` }}
      >
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.primaryHover || theme.primary} 100%)`,
            boxShadow: `0 0 16px ${theme.primary}80`,
          }}
        />
      </div>

      {/* Halo decorativo top-right */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none opacity-50"
        style={{
          background: `radial-gradient(circle, ${theme.primary}30 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
      />

      {/* Botón X arriba a la derecha */}
      <button
        {...closeProps}
        className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90 z-10"
        style={{
          backgroundColor: `${theme.text}10`,
          color: theme.textSecondary,
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="relative px-6 pt-6 pb-5">
        {/* Header: badge step + sparkle */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}20, ${theme.primary}08)`,
              color: theme.primary,
              border: `1px solid ${theme.primary}30`,
            }}
          >
            <Sparkles className="h-3 w-3 animate-pulse" />
            Paso {index + 1} de {size}
          </div>
        </div>

        {/* Título */}
        {step.title && (
          <h3
            className="text-lg font-bold leading-tight mb-2 pr-8"
            style={{ color: theme.text }}
          >
            {step.title}
          </h3>
        )}

        {/* Contenido */}
        <div
          className="text-sm leading-relaxed mb-5"
          style={{ color: theme.textSecondary }}
        >
          {step.content}
        </div>

        {/* Footer: botones */}
        <div className="flex items-center justify-between gap-2">
          {/* Skip a la izquierda (solo si no es el último) */}
          {!isLastStep && (
            <button
              {...skipProps}
              className="text-[12px] font-semibold transition-all hover:opacity-70"
              style={{ color: theme.textSecondary }}
            >
              Saltar tutorial
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {!isFirst && (
              <button
                {...backProps}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all hover:scale-[1.03] active:scale-95"
                style={{
                  backgroundColor: `${theme.text}08`,
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Atrás
              </button>
            )}
            <button
              {...primaryProps}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-bold text-white transition-all hover:scale-[1.03] active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover || theme.primary} 100%)`,
                boxShadow: `0 8px 20px -6px ${theme.primary}80, 0 2px 4px ${theme.primary}30`,
              }}
            >
              {isLastStep ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Listo
                </>
              ) : (
                <>
                  Siguiente
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
