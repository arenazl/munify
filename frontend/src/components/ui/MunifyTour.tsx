import { useEffect, useState, useCallback } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData, Step } from 'react-joyride';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Tour interactivo tipo onboarding (overlay con highlight + tooltip).
 * Construido sobre react-joyride v3.x. Persiste qué tours vio cada user
 * en localStorage para no repetirlos.
 *
 * Uso típico:
 *   <MunifyTour
 *     tourKey="contaduria-op"
 *     steps={[
 *       { target: '[data-tour="op-nueva"]', content: 'Acá creás una nueva OP.' },
 *     ]}
 *   />
 *
 * Cada elemento referenciado en `target` debe tener el atributo `data-tour`
 * o ser un selector CSS valido. Si el elemento no esta en el DOM al
 * momento del step, react-joyride lo busca con retries internos.
 *
 * Para FORZAR la apertura del tour aunque el user ya lo haya visto, pasar
 * la query string `?tour=<tourKey>` en la URL.
 */
interface MunifyTourProps {
  tourKey: string;
  steps: Step[];
  autoStart?: boolean;
  readyToStart?: () => boolean;
  run?: boolean;
  onClose?: () => void;
}

const STORAGE_PREFIX = 'munify_tour_seen_';

function tourYaVisto(tourKey: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + tourKey) === '1';
  } catch {
    return false;
  }
}

function marcarTourVisto(tourKey: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + tourKey, '1');
  } catch {
    /* localStorage bloqueado */
  }
}

function tourForzadoEnUrl(tourKey: string): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get('tour') === tourKey;
  } catch {
    return false;
  }
}

export function MunifyTour({
  tourKey,
  steps,
  autoStart = true,
  readyToStart,
  run: runProp,
  onClose,
}: MunifyTourProps) {
  const { theme } = useTheme();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (runProp !== undefined) {
      setRun(runProp);
      return;
    }
    if (!autoStart) return;
    if (readyToStart && !readyToStart()) return;
    if (tourYaVisto(tourKey) && !tourForzadoEnUrl(tourKey)) return;
    const t = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(t);
  }, [tourKey, autoStart, readyToStart, runProp]);

  const onEvent = useCallback((data: EventData) => {
    const status = data.status;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      marcarTourVisto(tourKey);
      setRun(false);
      onClose?.();
    }
  }, [tourKey, onClose]);

  if (!run) return null;
  return (
    <Joyride
      steps={steps}
      onEvent={onEvent}
      locale={{
        back: 'Atrás',
        close: 'Cerrar',
        last: 'Listo',
        next: 'Siguiente',
        skip: 'Saltar tutorial',
        open: 'Abrir',
      }}
      options={{
        zIndex: 10000,
        primaryColor: theme.primary,
        backgroundColor: theme.card,
        textColor: theme.text,
        arrowColor: theme.card,
        overlayColor: 'rgba(0, 0, 0, 0.6)',
      }}
    />
  );
}

/** Reseta TODOS los tours del user. Util para el boton "Reiniciar tutoriales"
 *  en configuracion personal. */
export function resetearTodosLosTours(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* localStorage bloqueado */
  }
}
