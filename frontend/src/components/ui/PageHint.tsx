import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Sparkles, ChevronRight, ChevronLeft, Rocket, ExternalLink,
  Lightbulb, ClipboardList, FileText, Users, TrendingUp,
} from 'lucide-react';
import { PAGE_HINTS, type HintStep } from '../../config/pageHints';

// Mapa de íconos disponibles para los steps (por nombre)
const ICON_MAP: Record<string, typeof Sparkles> = {
  Sparkles,
  Rocket,
  Lightbulb,
  ClipboardList,
  FileText,
  Users,
  TrendingUp,
};

// Paleta por accent
const ACCENT_STYLES = {
  blue: {
    gradient: 'from-blue-50 via-blue-50/40 to-indigo-50/60',
    border: 'border-blue-100',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    chipBg: 'bg-blue-100/60',
    chipText: 'text-blue-700',
    title: 'text-blue-950',
    body: 'text-blue-900/80',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonGhost: 'text-blue-700 hover:bg-blue-100',
    accentBar: 'bg-blue-500',
    closeHover: 'hover:bg-blue-100',
    closeColor: 'text-blue-600',
    dotActive: 'bg-blue-600',
    dotInactive: 'bg-blue-200',
  },
  violet: {
    gradient: 'from-violet-50 via-fuchsia-50/40 to-indigo-50/50',
    border: 'border-violet-100',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    chipBg: 'bg-violet-100/60',
    chipText: 'text-violet-700',
    title: 'text-violet-950',
    body: 'text-violet-900/80',
    button: 'bg-violet-600 hover:bg-violet-700 text-white',
    buttonGhost: 'text-violet-700 hover:bg-violet-100',
    accentBar: 'bg-violet-500',
    closeHover: 'hover:bg-violet-100',
    closeColor: 'text-violet-600',
    dotActive: 'bg-violet-600',
    dotInactive: 'bg-violet-200',
  },
  emerald: {
    gradient: 'from-emerald-50 via-teal-50/40 to-cyan-50/50',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    chipBg: 'bg-emerald-100/60',
    chipText: 'text-emerald-700',
    title: 'text-emerald-950',
    body: 'text-emerald-900/80',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    buttonGhost: 'text-emerald-700 hover:bg-emerald-100',
    accentBar: 'bg-emerald-500',
    closeHover: 'hover:bg-emerald-100',
    closeColor: 'text-emerald-600',
    dotActive: 'bg-emerald-600',
    dotInactive: 'bg-emerald-200',
  },
  amber: {
    gradient: 'from-amber-50 via-orange-50/40 to-rose-50/50',
    border: 'border-amber-100',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    chipBg: 'bg-amber-100/60',
    chipText: 'text-amber-700',
    title: 'text-amber-950',
    body: 'text-amber-900/80',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
    buttonGhost: 'text-amber-700 hover:bg-amber-100',
    accentBar: 'bg-amber-500',
    closeHover: 'hover:bg-amber-100',
    closeColor: 'text-amber-600',
    dotActive: 'bg-amber-600',
    dotInactive: 'bg-amber-200',
  },
};

interface PageHintProps {
  /**
   * ID único de la pantalla — debe coincidir con una key en
   * `config/pageHints.ts`. Se usa para persistir el dismiss en localStorage.
   */
  pageId: string;
}

/**
 * Hint contextual arriba de cada pantalla de gestión.
 *
 * Soporta dos modos (definidos en `config/pageHints.ts`):
 *   - Simple: card con título + descripción.
 *   - Wizard: mini tutorial multi-paso con navegación Next/Back y progress.
 *
 * El dismiss se persiste en localStorage por pageId.
 */
export default function PageHint({ pageId }: PageHintProps) {
  const hint = PAGE_HINTS[pageId];
  const storageKey = `hint_dismissed_${pageId}`;
  const isWizard = !!hint?.steps?.length;
  const accent = ACCENT_STYLES[hint?.accent ?? 'blue'];

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === 'true';
  });
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === 'true');
    setStepIdx(0);
  }, [storageKey]);

  const steps = hint?.steps ?? [];
  const currentStep: HintStep | undefined = steps[stepIdx];
  const isLastStep = stepIdx === steps.length - 1;

  const IconComponent = useMemo(() => {
    if (isWizard && currentStep?.icon) {
      return ICON_MAP[currentStep.icon] ?? Sparkles;
    }
    return Lightbulb;
  }, [isWizard, currentStep]);

  if (!hint || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  const handleNext = () => {
    if (isLastStep) {
      handleDismiss();
    } else {
      setStepIdx((i) => Math.min(i + 1, steps.length - 1));
    }
  };

  const handleBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  return (
    <div
      className={`relative mb-4 overflow-hidden rounded-2xl border ${accent.border} bg-gradient-to-br ${accent.gradient} shadow-sm animate-in fade-in slide-in-from-top-2 duration-400`}
    >
      {/* Barra de acento decorativa arriba */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent.accentBar}`} />

      <div className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          {/* Ícono */}
          <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${accent.iconBg} flex items-center justify-center shadow-sm`}>
            <IconComponent className={`h-5 w-5 ${accent.iconColor}`} strokeWidth={2.2} />
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            {/* Chip superior (solo en wizard) */}
            {isWizard && (
              <div className={`inline-flex items-center gap-1.5 ${accent.chipBg} ${accent.chipText} text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2`}>
                <Sparkles className="h-3 w-3" />
                Tutorial · {stepIdx + 1} de {steps.length}
              </div>
            )}

            <h3 className={`text-base md:text-lg font-bold ${accent.title} mb-1.5 leading-tight`}>
              {isWizard ? currentStep?.title : hint.title}
            </h3>
            <p className={`text-sm ${accent.body} leading-relaxed`}>
              {isWizard ? currentStep?.description : hint.description}
            </p>

            {/* CTA del step (si tiene link) */}
            {isWizard && currentStep?.cta && (
              <Link
                to={currentStep.cta.href}
                className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold border border-current/20 ${accent.buttonGhost} transition-colors`}
              >
                {currentStep.cta.label}
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}

            {/* Navegación del wizard */}
            {isWizard && (
              <div className="mt-4 flex items-center justify-between gap-3">
                {/* Indicador de progreso con puntos */}
                <div className="flex items-center gap-1.5">
                  {steps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setStepIdx(idx)}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === stepIdx
                          ? `w-6 ${accent.dotActive}`
                          : `w-1.5 ${accent.dotInactive} hover:opacity-70`
                      }`}
                      aria-label={`Ir al paso ${idx + 1}`}
                    />
                  ))}
                </div>

                {/* Botones */}
                <div className="flex items-center gap-1.5">
                  {stepIdx > 0 && (
                    <button
                      onClick={handleBack}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${accent.buttonGhost}`}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Atrás
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm ${accent.button}`}
                  >
                    {isLastStep ? (
                      <>
                        Empezar
                        <Rocket className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        Siguiente
                        <ChevronRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Botón cerrar */}
          <button
            onClick={handleDismiss}
            className={`flex-shrink-0 w-7 h-7 rounded-lg ${accent.closeHover} flex items-center justify-center ${accent.closeColor} transition-colors`}
            aria-label="Ocultar sugerencia"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
