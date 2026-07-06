import { CSSProperties, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Slider theme-aware (reemplazo del `<input type="range">` nativo crudo).
 *
 * Envuelve un input range pero estiliza track + thumb con los colores del
 * tema (useTheme) en vez de dejar el control nativo (que ignora el dark mode).
 * El track relleno se pinta con un linear-gradient sobre el fondo del input
 * (mismo patrón ya usado en Configuracion) y el thumb se estiliza con reglas
 * de pseudo-elemento inyectadas UNA sola vez en el <head>, parametrizadas por
 * CSS custom properties seteadas inline por instancia — así el color del thumb
 * sigue al tema sin duplicar <style> por cada slider.
 *
 * Uso canónico: el radio de un POI (100-10000, step 100).
 *
 *   <Slider value={radio} onChange={setRadio} min={100} max={10000} step={100}
 *           label="Radio de zona" />
 *
 * CANDIDATO A PORTAR a APP_GUIDE/components/ui/ cuando quede estable (es
 * agnóstico, sin lógica de Munify). No portar todavía.
 */

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  /** Si viene, se renderiza una fila con el label a la izquierda y el valor a la derecha. */
  label?: string;
}

const STYLE_ID = 'ui-slider-thumb-styles';

// Reglas de pseudo-elemento (no se pueden setear inline). El color/tamaño
// llegan por CSS vars seteadas inline en cada input, así una sola hoja sirve
// para todas las instancias y todos los temas.
const THUMB_CSS = `
.ui-slider {
  -webkit-appearance: none;
  appearance: none;
  outline: none;
}
.ui-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: var(--ui-slider-thumb-size, 18px);
  height: var(--ui-slider-thumb-size, 18px);
  border-radius: 50%;
  background: var(--ui-slider-thumb, #3b82f6);
  border: 2px solid var(--ui-slider-thumb-ring, #ffffff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
  margin-top: 0;
}
.ui-slider::-moz-range-thumb {
  width: var(--ui-slider-thumb-size, 18px);
  height: var(--ui-slider-thumb-size, 18px);
  border-radius: 50%;
  background: var(--ui-slider-thumb, #3b82f6);
  border: 2px solid var(--ui-slider-thumb-ring, #ffffff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.ui-slider::-moz-range-track {
  background: transparent;
}
.ui-slider:hover:not(:disabled)::-webkit-slider-thumb { transform: scale(1.12); }
.ui-slider:hover:not(:disabled)::-moz-range-thumb { transform: scale(1.12); }
.ui-slider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 4px var(--ui-slider-focus, rgba(59, 130, 246, 0.3));
}
.ui-slider:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 4px var(--ui-slider-focus, rgba(59, 130, 246, 0.3));
}
.ui-slider:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-slider:disabled::-webkit-slider-thumb { cursor: not-allowed; }
.ui-slider:disabled::-moz-range-thumb { cursor: not-allowed; }
`;

// Convierte un hex (#RRGGBB) a rgba con alpha, para el halo de foco.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Slider({ value, onChange, min, max, step, disabled = false, label }: SliderProps) {
  const { theme } = useTheme();

  // Inyectar la hoja de estilos del thumb una única vez.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = THUMB_CSS;
    document.head.appendChild(styleEl);
  }, []);

  const range = max - min;
  const pct = range > 0 ? Math.min(100, Math.max(0, ((value - min) / range) * 100)) : 0;

  const focusHalo = theme.primary.startsWith('#')
    ? hexToRgba(theme.primary, 0.3)
    : theme.primary;

  const inputStyle: CSSProperties & Record<string, string> = {
    background: `linear-gradient(to right, ${theme.primary} 0%, ${theme.primary} ${pct}%, ${theme.border} ${pct}%, ${theme.border} 100%)`,
    '--ui-slider-thumb': theme.primary,
    '--ui-slider-thumb-ring': theme.card,
    '--ui-slider-focus': focusHalo,
    '--ui-slider-thumb-size': '18px',
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: theme.text }}>
            {label}
          </span>
          <span className="text-sm tabular-nums" style={{ color: theme.textSecondary }}>
            {value}
          </span>
        </div>
      )}
      <input
        type="range"
        className="ui-slider w-full h-2 rounded-full cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inputStyle}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
    </div>
  );
}
