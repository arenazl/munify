import { useMemo, useState, type ReactNode } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * CalendarView — vista de calendario multi-mes, agnostica, generica.
 *
 * Pensada para integrarse como tercera vista (junto a cards/table) dentro
 * de un ABMPage. La fuente de datos son los items ya filtrados que pasa
 * el padre — el componente no filtra, solo agrupa por fecha y pinta.
 *
 * Features:
 *  - Toggle 1/2/3/4 meses simultaneos (persistido en localStorage opt-in).
 *  - Navegacion mes anterior / mes siguiente.
 *  - Cada celda muestra los items del dia con label + monto y un borde
 *    coloreado por categoria (getColor).
 *  - Click sobre un item -> onItemClick(item).
 *  - Drag-and-drop opt-in: si se pasa onItemDrop, los items son
 *    arrastrables y las celdas son drop targets.
 *  - Lista detallada debajo del grid con todos los items del rango.
 *
 * 100% agnostica de Munify: no sabe de pagos, gastos, contactos. Recibe
 * funciones para extraer label/monto/fecha/color/categoria de cada item.
 */

export interface CalendarViewProps<T> {
  /** Items ya filtrados que el padre quiere ver en el calendario */
  items: T[];

  /** Funciones para extraer datos de cada item */
  getId: (item: T) => string | number;
  getDate: (item: T) => string; // ISO yyyy-mm-dd (o yyyy-mm-ddTHH... ; se trunca a 10 chars)
  getLabel: (item: T) => string;
  getAmount?: (item: T) => number; // opcional: si no se pasa, no muestra monto
  getColor?: (item: T) => string; // hex, ej '#3b82f6'. Default: primary del theme
  getTooltip?: (item: T) => string;

  /** Acciones */
  onItemClick?: (item: T) => void;
  /** Si se define -> drag-drop activado. Llamado con (item, newDateYYYYMMDD) */
  onItemDrop?: (item: T, newDateISO: string) => void;

  /** Persistencia del toggle de meses (1/2/3/4) — opcional */
  mesesStorageKey?: string;

  /** Texto de ayuda arriba del grid */
  helperText?: string;

  /** Render custom para la fila de "detalle" debajo del grid (opcional) */
  renderDetailRow?: (item: T) => ReactNode;

  /** Formateo de moneda — default: $ es-AR sin decimales */
  formatMoney?: (n: number) => string;
}

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const defaultFmtMoney = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

export function CalendarView<T>(props: CalendarViewProps<T>) {
  const {
    items, getId, getDate, getLabel, getAmount, getColor, getTooltip,
    onItemClick, onItemDrop, mesesStorageKey, helperText, renderDetailRow,
    formatMoney = defaultFmtMoney,
  } = props;
  const { theme } = useTheme();

  const today = new Date();
  const [calMes, setCalMes] = useState(today.getMonth());
  const [calAnio, setCalAnio] = useState(today.getFullYear());

  const [mesesVisibles, setMesesVisibles] = useState<1 | 2 | 3 | 4>(() => {
    if (typeof window === 'undefined' || !mesesStorageKey) return 1;
    const saved = parseInt(localStorage.getItem(mesesStorageKey) || '1', 10);
    return ([1, 2, 3, 4].includes(saved) ? saved : 1) as 1 | 2 | 3 | 4;
  });
  const setMesesVisiblesPersist = (n: 1 | 2 | 3 | 4) => {
    setMesesVisibles(n);
    if (mesesStorageKey) { try { localStorage.setItem(mesesStorageKey, String(n)); } catch {} }
  };

  const [dragItemId, setDragItemId] = useState<string | number | null>(null);
  const dragEnabled = !!onItemDrop;

  const irMesAnterior = () => {
    if (calMes === 0) { setCalMes(11); setCalAnio(a => a - 1); }
    else setCalMes(m => m - 1);
  };
  const irMesSiguiente = () => {
    if (calMes === 11) { setCalMes(0); setCalAnio(a => a + 1); }
    else setCalMes(m => m + 1);
  };

  // Items agrupados por fecha completa yyyy-mm-dd (multi-mes safe)
  const itemsPorFecha = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const it of items) {
      const key = getDate(it).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [items, getDate]);

  const mesesAMostrar = useMemo(() => {
    const out: { anio: number; mes: number }[] = [];
    for (let i = 0; i < mesesVisibles; i++) {
      const total = calMes + i;
      out.push({ anio: calAnio + Math.floor(total / 12), mes: total % 12 });
    }
    return out;
  }, [calMes, calAnio, mesesVisibles]);

  const itemsEnRango = useMemo(() => {
    return items.filter(it => {
      const d = new Date(getDate(it));
      return mesesAMostrar.some(m => m.anio === d.getFullYear() && m.mes === d.getMonth());
    });
  }, [items, mesesAMostrar, getDate]);

  const handleDrop = (anio: number, mes: number, dia: number) => {
    if (!onItemDrop || dragItemId == null) return;
    const item = items.find(it => getId(it) === dragItemId);
    setDragItemId(null);
    if (!item) return;
    const newIso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const oldIso = getDate(item).slice(0, 10);
    if (newIso === oldIso) return;
    onItemDrop(item, newIso);
  };

  const renderMes = (anio: number, mes: number) => {
    const primer = new Date(anio, mes, 1).getDay();
    const diasN = new Date(anio, mes + 1, 0).getDate();
    const off = (primer + 6) % 7; // L=0 ... D=6
    return (
      <div key={`${anio}-${mes}`} className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <p className="text-sm font-bold mb-2 text-center" style={{ color: theme.text }}>
          {MESES_LARGO[mes]} <span style={{ color: theme.textSecondary }}>{anio}</span>
        </p>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold uppercase py-1" style={{ color: theme.textSecondary }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: off }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-lg" style={{ minHeight: 72 }} />
          ))}
          {Array.from({ length: diasN }).map((_, i) => {
            const dia = i + 1;
            const fechaKey = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const itemsHoy = itemsPorFecha.get(fechaKey) || [];
            const total = getAmount ? itemsHoy.reduce((s, it) => s + getAmount(it), 0) : 0;
            const now = new Date();
            const esHoy = (now.getDate() === dia && now.getMonth() === mes && now.getFullYear() === anio);
            const maxLineas = mesesVisibles === 1 ? 3 : mesesVisibles === 2 ? 2 : 1;
            return (
              <div
                key={dia}
                onDragOver={dragEnabled ? (e) => { e.preventDefault(); e.currentTarget.style.outline = `2px dashed ${theme.primary}`; } : undefined}
                onDragLeave={dragEnabled ? (e) => { e.currentTarget.style.outline = 'none'; } : undefined}
                onDrop={dragEnabled ? (e) => { e.currentTarget.style.outline = 'none'; handleDrop(anio, mes, dia); } : undefined}
                className="rounded-lg p-1.5 flex flex-col gap-0.5 transition-all hover:shadow-md"
                style={{
                  backgroundColor: itemsHoy.length > 0 ? `${theme.primary}08` : theme.backgroundSecondary,
                  border: esHoy ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
                  minHeight: 72,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold" style={{ color: esHoy ? theme.primary : theme.text }}>{dia}</span>
                  {itemsHoy.length > 0 && (
                    <span className="text-[8px] font-bold px-1 rounded" style={{ backgroundColor: theme.primary, color: '#fff' }}>
                      {itemsHoy.length}
                    </span>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                  {itemsHoy.slice(0, maxLineas).map(it => {
                    const id = getId(it);
                    const color = getColor ? getColor(it) : theme.primary;
                    const label = getLabel(it);
                    const amount = getAmount ? getAmount(it) : null;
                    const tooltip = getTooltip ? getTooltip(it) : label;
                    return (
                      <div
                        key={id}
                        draggable={dragEnabled}
                        onDragStart={dragEnabled ? (e) => { setDragItemId(id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
                        onDragEnd={dragEnabled ? () => setDragItemId(null) : undefined}
                        onClick={onItemClick ? (e) => { e.stopPropagation(); onItemClick(it); } : undefined}
                        className={`rounded px-1 py-0.5 truncate ${onItemClick ? 'cursor-pointer' : ''} ${dragEnabled ? 'cursor-move' : ''}`}
                        style={{
                          backgroundColor: `${color}25`,
                          borderLeft: `3px solid ${color}`,
                          fontSize: 9,
                          color: theme.text,
                          opacity: dragItemId === id ? 0.4 : 1,
                        }}
                        title={dragEnabled ? `${tooltip} · Arrastrá a otro día` : tooltip}
                      >
                        <div className="font-semibold truncate">{label}</div>
                        {amount != null && (
                          <div className="tabular-nums truncate" style={{ color: theme.textSecondary, fontSize: 8 }}>
                            {formatMoney(amount)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {itemsHoy.length > maxLineas && (
                    <div className="text-[8px] text-center font-semibold" style={{ color: theme.primary }}>
                      +{itemsHoy.length - maxLineas} más
                    </div>
                  )}
                </div>
                {itemsHoy.length > 0 && mesesVisibles <= 2 && getAmount && (
                  <div className="text-[9px] tabular-nums truncate font-semibold border-t pt-0.5" style={{ color: theme.primary, borderColor: theme.border }}>
                    {formatMoney(total)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header: nav + toggle 1/2/3/4 meses */}
      <div className="flex items-center gap-2 rounded-xl p-3 flex-wrap" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        <button onClick={irMesAnterior} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-base font-bold inline-flex items-center gap-2 flex-1 justify-center" style={{ color: theme.text }}>
          <Calendar className="h-5 w-5" style={{ color: theme.primary }} />
          {mesesAMostrar[0] && (
            <>
              {MESES_LARGO[mesesAMostrar[0].mes]} {mesesAMostrar[0].anio}
              {mesesVisibles > 1 && mesesAMostrar[mesesVisibles - 1] && (
                <> – {MESES_LARGO[mesesAMostrar[mesesVisibles - 1].mes]} {mesesAMostrar[mesesVisibles - 1].anio}</>
              )}
            </>
          )}
        </h3>
        <button onClick={irMesSiguiente} className="p-2 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}>
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="inline-flex items-center rounded-lg p-0.5" style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}>
          {([1, 2, 3, 4] as const).map(n => (
            <button key={n}
              onClick={() => setMesesVisiblesPersist(n)}
              className="px-2.5 py-1 rounded text-xs font-bold transition-all"
              style={{
                backgroundColor: mesesVisibles === n ? theme.primary : 'transparent',
                color: mesesVisibles === n ? '#fff' : theme.textSecondary,
              }}
              title={`Ver ${n} mes${n > 1 ? 'es' : ''}`}
            >
              {n}M
            </button>
          ))}
        </div>
      </div>

      {helperText && (
        <p className="text-[11px] text-center" style={{ color: theme.textSecondary }}>{helperText}</p>
      )}

      <div className={`grid gap-3 ${
        mesesVisibles === 1 ? 'grid-cols-1' :
        mesesVisibles === 2 ? 'grid-cols-1 md:grid-cols-2' :
        mesesVisibles === 3 ? 'grid-cols-1 md:grid-cols-3' :
        'grid-cols-1 md:grid-cols-2'
      }`}>
        {mesesAMostrar.map(m => renderMes(m.anio, m.mes))}
      </div>

      {/* Lista detallada del rango */}
      {renderDetailRow && itemsEnRango.length > 0 && (
        <div className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>
            Items del rango ({itemsEnRango.length})
          </p>
          <div className="space-y-1.5">
            {itemsEnRango.map(it => (
              <div key={getId(it)}>{renderDetailRow(it)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
