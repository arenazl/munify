import { Calendar, ChevronLeft, ChevronRight, LayoutList } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * MonthRangeNavigator — control compacto para navegar por meses.
 *
 * Layout: [ < Mes Anio – Mes Anio > ]  [ Todos ]
 *
 * Las flechas estan PEGADAS al label del mes (no a los extremos del
 * contenedor) — esto evita que en pantallas anchas el usuario tenga
 * que mover el mouse muy lejos para cambiar de mes.
 *
 * El boton "Todos" es un toggle separado que desactiva el filtro por
 * mes y muestra todos los items. Cuando esta activo, las flechas se
 * deshabilitan (no tiene sentido navegar).
 *
 * 100% agnostico: no sabe de calendarios, gastos, pagos. Solo navega
 * meses y emite eventos.
 *
 * Patron canonico de uso dentro de un calendario:
 *
 *   <MonthRangeNavigator
 *     anio={calAnio} mes={calMes}
 *     cantidadMeses={mesesVisibles}
 *     modoTodos={modoTodos}
 *     onPrev={irMesAnterior}
 *     onNext={irMesSiguiente}
 *     onToggleTodos={() => setModoTodos(v => !v)}
 *   />
 */

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export interface MonthRangeNavigatorProps {
  /** Mes actual (0-11) */
  mes: number;
  /** Anio actual */
  anio: number;
  /** Cantidad de meses visibles (para mostrar rango "Ene – Mar") */
  cantidadMeses?: number;
  /** Si true, muestra "Todos los meses" y deshabilita flechas */
  modoTodos?: boolean;
  /** Si modoTodos no se pasa, el boton Todos no se renderiza */
  onToggleTodos?: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Labels custom opcionales */
  todosLabel?: string;
  todosLabelActivo?: string;
}

export function MonthRangeNavigator({
  mes,
  anio,
  cantidadMeses = 1,
  modoTodos = false,
  onToggleTodos,
  onPrev,
  onNext,
  todosLabel = 'Todos',
  todosLabelActivo = 'Por mes',
}: MonthRangeNavigatorProps) {
  const { theme } = useTheme();

  // Calcular ultimo mes del rango si cantidadMeses > 1
  const ultimoTotal = mes + cantidadMeses - 1;
  const ultimoMes = ultimoTotal % 12;
  const ultimoAnio = anio + Math.floor(ultimoTotal / 12);
  const esRango = cantidadMeses > 1;

  const flechaStyle: React.CSSProperties = {
    backgroundColor: theme.backgroundSecondary,
    color: theme.text,
    opacity: modoTodos ? 0.4 : 1,
    cursor: modoTodos ? 'not-allowed' : 'pointer',
  };

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {/* Bloque navegacion mes: flechas pegadas al label */}
      <div
        className="inline-flex items-center rounded-lg overflow-hidden"
        style={{ border: `1px solid ${theme.border}` }}
      >
        <button
          onClick={onPrev}
          disabled={modoTodos}
          className="px-1.5 h-[34px] flex items-center justify-center transition-all hover:brightness-110 disabled:hover:brightness-100"
          style={flechaStyle}
          title="Mes anterior"
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
            <span>Todos los meses</span>
          ) : esRango ? (
            <span>
              {MESES_LARGO[mes].slice(0, 3)} {anio} – {MESES_LARGO[ultimoMes].slice(0, 3)} {ultimoAnio}
            </span>
          ) : (
            <span>
              {MESES_LARGO[mes]} {anio}
            </span>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={modoTodos}
          className="px-1.5 h-[34px] flex items-center justify-center transition-all hover:brightness-110 disabled:hover:brightness-100"
          style={flechaStyle}
          title="Mes siguiente"
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Boton "Todos" — opt-in via onToggleTodos */}
      {onToggleTodos && (
        <button
          onClick={onToggleTodos}
          className="inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110"
          style={{
            backgroundColor: modoTodos ? theme.primary : theme.backgroundSecondary,
            color: modoTodos ? '#fff' : theme.textSecondary,
            border: `1px solid ${modoTodos ? theme.primary : theme.border}`,
          }}
          title={modoTodos ? 'Volver a vista por mes' : 'Ver todos los meses'}
          type="button"
        >
          <LayoutList className="h-3.5 w-3.5" />
          {modoTodos ? todosLabelActivo : todosLabel}
        </button>
      )}
    </div>
  );
}
