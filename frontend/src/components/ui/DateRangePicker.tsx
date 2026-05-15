import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { DayPicker, DateRange as RdpRange } from 'react-day-picker';
import { es } from 'date-fns/locale';
import 'react-day-picker/style.css';
import { useTheme } from '../../contexts/ThemeContext';

export interface DateRange {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  placeholder?: string;
  allowClear?: boolean;
}

// ------------------------------------------------------------
// Helpers de fecha (ISO YYYY-MM-DD <-> Date local, sin drift UTC)
// ------------------------------------------------------------
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
  return `${d}/${m}/${y.slice(2)}`;
}

// ------------------------------------------------------------
// Presets (exportados para usar desde pages)
// ------------------------------------------------------------
export function currentMonthRange(): DateRange {
  const now = new Date();
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
  const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { desde: toISO(inicio), hasta: toISO(fin) };
}

function previousMonthRange(): DateRange {
  const now = new Date();
  const inicio = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fin = new Date(now.getFullYear(), now.getMonth(), 0);
  return { desde: toISO(inicio), hasta: toISO(fin) };
}

function todayRange(): DateRange {
  const iso = toISO(new Date());
  return { desde: iso, hasta: iso };
}

function thisWeekRange(): DateRange {
  const now = new Date();
  const dow = now.getDay(); // 0 = Domingo
  const diffLunes = dow === 0 ? -6 : 1 - dow;
  const inicio = new Date(now);
  inicio.setDate(now.getDate() + diffLunes);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  return { desde: toISO(inicio), hasta: toISO(fin) };
}

function currentQuarterRange(): DateRange {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const inicio = new Date(now.getFullYear(), q * 3, 1);
  const fin = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { desde: toISO(inicio), hasta: toISO(fin) };
}

function yearToDateRange(): DateRange {
  const now = new Date();
  const inicio = new Date(now.getFullYear(), 0, 1);
  return { desde: toISO(inicio), hasta: toISO(now) };
}

const PRESETS: { label: string; get: () => DateRange }[] = [
  { label: 'Hoy', get: todayRange },
  { label: 'Esta semana', get: thisWeekRange },
  { label: 'Mes en curso', get: currentMonthRange },
  { label: 'Mes anterior', get: previousMonthRange },
  { label: 'Trimestre', get: currentQuarterRange },
  { label: 'Año', get: yearToDateRange },
];

// ------------------------------------------------------------
// Componente
// ------------------------------------------------------------
export function DateRangePicker({
  value,
  onChange,
  className = '',
  placeholder = 'Rango de fechas',
  allowClear = false,
}: DateRangePickerProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Posicion del dropdown calculada via fixed (escapa de cualquier ancestro
  // con overflow:hidden/auto que clipea el calendario).
  const [dropdownPos, setDropdownPos] = useState<{
    top: number; left: number; openUp: boolean;
  } | null>(null);

  const recalcPos = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const espacioAbajo = vh - r.bottom - 12;
    const altoEstimado = 460; // calendar + presets aprox
    const openUp = espacioAbajo < altoEstimado && r.top > altoEstimado;
    setDropdownPos({
      top: openUp ? r.top - 8 : r.bottom + 8,
      left: r.left,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (open) recalcPos();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => recalcPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    const onDown = (e: Event) => {
      const t = e.target as Node;
      const inTrigger = ref.current?.contains(t);
      const inDropdown = dropdownRef.current?.contains(t);
      if (!inTrigger && !inDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, []);

  const display = value.desde && value.hasta
    ? `${formatDisplay(value.desde)} — ${formatDisplay(value.hasta)}`
    : placeholder;

  const selectedRange: RdpRange | undefined = value.desde || value.hasta
    ? { from: fromISO(value.desde), to: fromISO(value.hasta) }
    : undefined;

  const handleRdpSelect = (range: RdpRange | undefined) => {
    if (!range) {
      onChange({ desde: '', hasta: '' });
      return;
    }
    const desde = range.from ? toISO(range.from) : '';
    const hasta = range.to ? toISO(range.to) : desde;
    onChange({ desde, hasta });
    // Cerrar cuando el rango está completo
    if (range.from && range.to) setOpen(false);
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.get();
    return r.desde === value.desde && r.hasta === value.hasta;
  });

  // CSS variables que consume react-day-picker v9 (estiladas con el theme)
  const rdpVars = {
    '--rdp-accent-color': theme.primary,
    '--rdp-accent-background-color': `${theme.primary}22`,
    '--rdp-background-color': 'transparent',
    '--rdp-today-color': theme.primary,
    '--rdp-range_middle-color': theme.text,
    '--rdp-range_middle-background-color': `${theme.primary}18`,
    '--rdp-range_start-color': '#fff',
    '--rdp-range_start-background': theme.primary,
    '--rdp-range_end-color': '#fff',
    '--rdp-range_end-background': theme.primary,
    '--rdp-selected-border': `2px solid ${theme.primary}`,
    '--rdp-day-height': '34px',
    '--rdp-day-width': '34px',
    '--rdp-day_button-height': '32px',
    '--rdp-day_button-width': '32px',
    '--rdp-weekday-opacity': '0.7',
    color: theme.text,
  } as React.CSSProperties;

  // react-day-picker v9 por default deja estados medios sin fondo coherente.
  // Override completo para que todo el calendario hable el idioma del tema.
  const rdpThemedCss = `
    .rdp-themed .rdp-day.rdp-range_start > .rdp-day_button,
    .rdp-themed .rdp-day.rdp-range_end > .rdp-day_button {
      background-color: ${theme.primary};
      color: #ffffff;
      border: 1px solid ${theme.primary};
      font-weight: 600;
    }
    .rdp-themed .rdp-day.rdp-range_middle > .rdp-day_button {
      background-color: ${theme.primary}22;
      color: ${theme.text};
      border-radius: 0;
      border: none;
    }
    .rdp-themed .rdp-day.rdp-selected:not(.rdp-range_start):not(.rdp-range_end):not(.rdp-range_middle) > .rdp-day_button {
      background-color: ${theme.primary};
      color: #ffffff;
      border: 1px solid ${theme.primary};
      font-weight: 600;
    }
    .rdp-themed .rdp-day.rdp-today:not(.rdp-selected) > .rdp-day_button {
      color: ${theme.primary};
      font-weight: 700;
    }
    .rdp-themed .rdp-day:not(.rdp-selected):not(.rdp-disabled):not(.rdp-outside):not(.rdp-range_middle) > .rdp-day_button:hover {
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
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 h-[34px] rounded-lg text-[12px] font-semibold transition-all hover:brightness-110"
        style={{
          backgroundColor: theme.backgroundSecondary,
          border: `1px solid ${theme.border}`,
          color: theme.text,
        }}
      >
        <Calendar className="h-3.5 w-3.5" style={{ color: theme.primary }} />
        <span className="whitespace-nowrap">{display}</span>
        {allowClear && (value.desde || value.hasta) && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange({ desde: '', hasta: '' }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange({ desde: '', hasta: '' }); } }}
            className="p-0.5 rounded hover:scale-110 transition-transform inline-flex items-center justify-center"
            style={{ color: theme.textSecondary }}
            title="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: theme.textSecondary }} />
      </button>

      {open && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2"
          style={{
            position: 'fixed',
            top: dropdownPos.openUp ? undefined : dropdownPos.top,
            bottom: dropdownPos.openUp ? (window.innerHeight - dropdownPos.top) : undefined,
            left: dropdownPos.left,
            zIndex: 9999,
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            minWidth: '320px',
            boxShadow: `0 20px 40px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px ${theme.border}`,
          }}
        >
          {/* Presets */}
          <div className="p-3 flex flex-wrap gap-1.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
            {PRESETS.map((p) => {
              const active = activePreset?.label === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onChange(p.get());
                    setOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: active ? theme.primary : theme.backgroundSecondary,
                    color: active ? '#fff' : theme.text,
                    border: `1px solid ${active ? theme.primary : theme.border}`,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendario range */}
          <style>{rdpThemedCss}</style>
          <div className="p-2 rdp-themed" style={rdpVars}>
            <DayPicker
              mode="range"
              locale={es}
              selected={selectedRange}
              onSelect={handleRdpSelect}
              numberOfMonths={1}
              weekStartsOn={1}
              showOutsideDays
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
