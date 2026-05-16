import { Calendar, ChevronLeft, ChevronRight, LayoutList } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * PeriodNavigator — control unico para navegar por mes O por año.
 *
 * Layout (switch integrado a la izquierda):
 *   [ Mes | Año ]│[ ←  Mayo 2026  → ][ Todos ]
 *
 * El switch Mes/Año es opcional: si NO se pasa `onModoChange`, no aparece y
 * el componente se comporta como navegador mensual puro (modo='mes' default).
 *
 * Cuando `modo='anio'`:
 *  - El label muestra "Año 2026".
 *  - Las flechas saltan de a un año entero.
 *
 * Cuando `modo='mes'`:
 *  - El label muestra "Mayo 2026" (o "Ene 2026 – Mar 2026" si cantidadMeses > 1).
 *  - Las flechas avanzan de mes en mes.
 *
 * Las flechas estan PEGADAS al label (no en los bordes) para que en pantallas
 * anchas el usuario no tenga que mover el mouse muy lejos.
 *
 * El boton "Todos" (opt-in via `onToggleTodos`) desactiva el filtro temporal
 * y muestra todos los items. Cuando esta activo, las flechas se deshabilitan.
 *
 * 100% agnostico: no sabe de calendarios, gastos, etc. Solo navega periodos.
 *
 * Patron canonico:
 *
 *   <PeriodNavigator
 *     modo={modo}
 *     onModoChange={setModo}
 *     mes={mesActual}
 *     anio={anioActual}
 *     onPrev={irAtras}
 *     onNext={irAdelante}
 *     modoTodos={todosLosMeses}
 *     onToggleTodos={() => setTodosLosMeses(v => !v)}
 *   />
 */

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export type PeriodModo = 'mes' | 'anio';

export interface PeriodNavigatorProps {
  /** Modo activo. Default 'mes'. */
  modo?: PeriodModo;
  /** Si se pasa, renderiza el switch Mes/Año a la izquierda. */
  onModoChange?: (modo: PeriodModo) => void;
  /** Mes actual (0-11). Usado en modo='mes'. */
  mes?: number;
  /** Anio actual. */
  anio: number;
  /** Cantidad de meses visibles (para mostrar rango "Ene – Mar" en modo='mes'). */
  cantidadMeses?: number;
  /** Si true, muestra "Todos los meses/años" y deshabilita flechas */
  modoTodos?: boolean;
  /** Si modoTodos no se pasa, el boton Todos no se renderiza */
  onToggleTodos?: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Labels custom opcionales */
  todosLabel?: string;
  todosLabelActivo?: string;
}

export function PeriodNavigator({
  modo = 'mes',
  onModoChange,
  mes = 0,
  anio,
  cantidadMeses = 1,
  modoTodos = false,
  onToggleTodos,
  onPrev,
  onNext,
  todosLabel = 'Todos',
  todosLabelActivo = 'Por período',
}: PeriodNavigatorProps) {
  const { theme } = useTheme();

  // Rango si cantidadMeses > 1 (solo aplica en modo mes)
  const esRangoMes = modo === 'mes' && cantidadMeses > 1;
  const ultimoTotal = mes + cantidadMeses - 1;
  const ultimoMes = ultimoTotal % 12;
  const ultimoAnio = anio + Math.floor(ultimoTotal / 12);

  const flechaStyle: React.CSSProperties = {
    backgroundColor: theme.backgroundSecondary,
    color: theme.text,
    opacity: modoTodos ? 0.4 : 1,
    cursor: modoTodos ? 'not-allowed' : 'pointer',
  };

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {/* Bloque navegacion: switch Mes/Año + flechas + label */}
      <div
        className="inline-flex items-stretch rounded-lg overflow-hidden"
        style={{ border: `1px solid ${theme.border}` }}
      >
        {/* Switch Mes/Año (opcional) */}
        {onModoChange && (
          <div
            className="inline-flex items-stretch"
            style={{ borderRight: `1px solid ${theme.border}` }}
          >
            {(['mes', 'anio'] as PeriodModo[]).map(m => {
              const activo = modo === m;
              return (
                <button
                  key={m}
                  onClick={() => onModoChange(m)}
                  className="px-2.5 h-[34px] text-[12px] font-semibold transition-all"
                  style={{
                    backgroundColor: activo ? theme.primary : theme.backgroundSecondary,
                    color: activo ? '#fff' : theme.textSecondary,
                  }}
                  type="button"
                >
                  {m === 'mes' ? 'Mes' : 'Año'}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={onPrev}
          disabled={modoTodos}
          className="px-1.5 h-[34px] flex items-center justify-center transition-all hover:brightness-110 disabled:hover:brightness-100"
          style={flechaStyle}
          title={modo === 'mes' ? 'Mes anterior' : 'Año anterior'}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div
          className="px-3 h-[34px] inline-flex items-center gap-1.5 text-[12px] font-bold whitespace-nowrap"
          style={{
            backgroundColor: theme.card,
            color: modoTodos ? theme.textSecondary : theme.text,
            borderLeft: `1px solid ${theme.border}`,
            borderRight: `1px solid ${theme.border}`,
          }}
        >
          <Calendar className="h-3.5 w-3.5" style={{ color: theme.primary }} />
          {modoTodos ? (
            <span>{modo === 'mes' ? 'Todos los meses' : 'Todos los años'}</span>
          ) : modo === 'anio' ? (
            <span>Año {anio}</span>
          ) : esRangoMes ? (
            <span>
              {MESES_LARGO[mes].slice(0, 3)} {anio} – {MESES_LARGO[ultimoMes].slice(0, 3)} {ultimoAnio}
            </span>
          ) : (
            <span>{MESES_LARGO[mes]} {anio}</span>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={modoTodos}
          className="px-1.5 h-[34px] flex items-center justify-center transition-all hover:brightness-110 disabled:hover:brightness-100"
          style={flechaStyle}
          title={modo === 'mes' ? 'Mes siguiente' : 'Año siguiente'}
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Toggle "Todos los periodos" — solo icono, pegado a la flecha derecha.
          Icono cambia segun modo: LayoutList = ver todos, Calendar = filtrar por periodo.
          El title da el contexto en hover. Texto removido para ahorrar ancho. */}
      {onToggleTodos && (
        <button
          onClick={onToggleTodos}
          className="inline-flex items-center justify-center h-[34px] w-[34px] rounded-lg transition-all hover:brightness-110"
          style={{
            backgroundColor: modoTodos ? theme.primary : theme.backgroundSecondary,
            color: modoTodos ? '#fff' : theme.textSecondary,
            border: `1px solid ${modoTodos ? theme.primary : theme.border}`,
          }}
          title={modoTodos ? (todosLabelActivo || 'Ver todos los períodos') : (todosLabel || 'Ver todos')}
          aria-label={modoTodos ? 'Filtrar por período' : 'Ver todos los períodos'}
          type="button"
        >
          {modoTodos
            ? <Calendar className="h-4 w-4" />
            : <LayoutList className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

// Alias retro-compat: MonthRangeNavigator era el nombre original cuando solo
// soportaba mes. Sigue funcionando, ahora se llama PeriodNavigator.
export const MonthRangeNavigator = PeriodNavigator;
export type MonthRangeNavigatorProps = PeriodNavigatorProps;
