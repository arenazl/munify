import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { DayPicker, type Matcher } from 'react-day-picker';
import { es } from 'date-fns/locale';
import 'react-day-picker/style.css';
import { useTheme } from '../../contexts/ThemeContext';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  label?: string;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromISO(iso: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Seleccionar fecha',
  disabled = false,
  allowClear = false,
  className = '',
  label,
}: DatePickerProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const selected = fromISO(value);
  const display = value ? formatDisplay(value) : placeholder;

  const disabledMatcher: Matcher[] = [];
  if (minDate) {
    const d = fromISO(minDate);
    if (d) disabledMatcher.push({ before: d });
  }
  if (maxDate) {
    const d = fromISO(maxDate);
    if (d) disabledMatcher.push({ after: d });
  }

  const rdpVars = {
    '--rdp-accent-color': theme.primary,
    '--rdp-accent-background-color': `${theme.primary}22`,
    '--rdp-background-color': 'transparent',
    '--rdp-today-color': theme.primary,
    '--rdp-selected-border': `2px solid ${theme.primary}`,
    '--rdp-day-height': '34px',
    '--rdp-day-width': '34px',
    '--rdp-day_button-height': '32px',
    '--rdp-day_button-width': '32px',
    '--rdp-weekday-opacity': '0.7',
    color: theme.text,
  } as React.CSSProperties;

  // react-day-picker v9 por default solo pinta un borde en los seleccionados.
  // Forzamos fondo lleno con theme.primary y demás estados coherentes al tema.
  const rdpThemedCss = `
    .rdp-themed .rdp-day.rdp-selected > .rdp-day_button {
      background-color: ${theme.primary};
      color: #ffffff;
      border: 1px solid ${theme.primary};
      font-weight: 600;
    }
    .rdp-themed .rdp-day.rdp-today:not(.rdp-selected) > .rdp-day_button {
      color: ${theme.primary};
      font-weight: 700;
    }
    .rdp-themed .rdp-day:not(.rdp-selected):not(.rdp-disabled):not(.rdp-outside) > .rdp-day_button:hover {
      background-color: ${theme.primary}22;
      color: ${theme.text};
    }
    .rdp-themed .rdp-chevron {
      fill: ${theme.textSecondary};
    }
    .rdp-themed .rdp-button_previous:hover .rdp-chevron,
    .rdp-themed .rdp-button_next:hover .rdp-chevron {
      fill: ${theme.primary};
    }
    .rdp-themed .rdp-month_caption,
    .rdp-themed .rdp-caption_label {
      color: ${theme.text};
      font-weight: 600;
    }
    .rdp-themed .rdp-weekday {
      color: ${theme.textSecondary};
    }
  `;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textSecondary }}>
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{
          background: `linear-gradient(135deg, ${theme.backgroundSecondary} 0%, ${theme.card} 100%)`,
          border: `1px solid ${theme.border}`,
          color: value ? theme.text : theme.textSecondary,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
          <span className="truncate">{display}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {allowClear && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange(''); } }}
              className="p-0.5 rounded hover:scale-110 transition-transform inline-flex items-center justify-center"
              style={{ color: theme.textSecondary }}
              title="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            style={{ color: theme.textSecondary }}
          />
        </div>
      </button>

      {open && !disabled && (
        <div
          className="absolute top-full mt-2 left-0 z-40 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <style>{rdpThemedCss}</style>
          <div className="p-2 rdp-themed" style={rdpVars}>
            <DayPicker
              mode="single"
              locale={es}
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  onChange(toISO(d));
                  setOpen(false);
                } else {
                  onChange('');
                }
              }}
              disabled={disabledMatcher.length ? disabledMatcher : undefined}
              numberOfMonths={1}
              weekStartsOn={1}
              showOutsideDays
            />
          </div>
        </div>
      )}
    </div>
  );
}
