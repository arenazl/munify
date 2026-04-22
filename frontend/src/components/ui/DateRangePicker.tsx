import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export interface DateRange {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

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

const PRESETS: { label: string; get: () => DateRange }[] = [
  { label: 'Hoy', get: todayRange },
  { label: 'Esta semana', get: thisWeekRange },
  { label: 'Mes en curso', get: currentMonthRange },
  { label: 'Mes anterior', get: previousMonthRange },
  { label: 'Trimestre', get: currentQuarterRange },
];

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const display = value.desde && value.hasta
    ? `${formatDisplay(value.desde)} — ${formatDisplay(value.hasta)}`
    : 'Rango de fechas';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${theme.backgroundSecondary} 0%, ${theme.card} 100%)`,
          border: `1px solid ${theme.border}`,
          color: theme.text,
        }}
      >
        <Calendar className="h-4 w-4" style={{ color: theme.primary }} />
        <span>{display}</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: theme.textSecondary }} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 left-0 z-40 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            minWidth: '320px',
          }}
        >
          <div className="p-3 flex flex-wrap gap-1.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
            {PRESETS.map((p) => {
              const r = p.get();
              const active = r.desde === value.desde && r.hasta === value.hasta;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onChange(p.get());
                    setOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95"
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

          <div className="p-3 flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Desde</label>
              <input
                type="date"
                value={value.desde}
                max={value.hasta || undefined}
                onChange={(e) => onChange({ ...value, desde: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: theme.textSecondary }}>Hasta</label>
              <input
                type="date"
                value={value.hasta}
                min={value.desde || undefined}
                onChange={(e) => onChange({ ...value, hasta: e.target.value })}
                className="w-full px-2 py-1.5 rounded-lg text-sm focus:ring-2 focus:outline-none"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
