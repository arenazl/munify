/**
 * FilterBar — fila 3 del `SemanticAbmPage` (§3 del estándar).
 *
 *   [Selects…] │ [PeriodControl] │ [Segmented de estados]   …   [resumen]
 *
 * - Selects: patrón `Etiqueta` (muted) + `Valor` (600) + chevron en un solo
 *   control de 32px. Se logra ENVOLVIENDO el ModernSelect existente (no se
 *   duplica el dropdown): el grupo pone borde/hover, el trigger interno se
 *   neutraliza por CSS (ver bloque [PERIOD] de styles/abmv2.css).
 * - PeriodControl: envuelve el `PeriodNavigator` del dueño (switch Mes/Año +
 *   stepper ‹ Julio 2026 ›) y le suma el rango dinámico del estándar: botón
 *   punteado "→ Hasta" que abre un segundo stepper + × para volver a período
 *   simple. Contrato: `PeriodControlValue` ({ unit, from, to?, todos? }).
 * - [v2.1] Modo "todos" (opt-in con `PeriodControlValue.todos` definido — el
 *   default de Tesorería en prod): expone el `modoTodos`/`onToggleTodos` que
 *   el PeriodNavigator del dueño ya soporta. En "todos" el navegador muestra
 *   "Todos los meses/años" con flechas apagadas y el toggle acota al período
 *   propuesto (por defecto, el mes en curso); desde un período, el mismo
 *   toggle ("Todos los períodos") vuelve a "todos". `unit`/`from`/`to`
 *   conservan mientras tanto la propuesta de aterrizaje (contrato en types).
 * - Segmented de estados con conteo: count 0 ⇒ apagado y NO clickeable.
 * - [v2.1] `sortSpec`: segmented CHICO de orden al final de la barra, antes
 *   del resumen. Es ORDEN, no filtro: la página ordena; la barra notifica.
 * - `filterSummary` opcional dockeado a la derecha.
 *
 * Presentacional puro: todo estado controlado por props. Cero colores fijos —
 * clases `av2-*` + tokens `--pl-*`.
 */
import { ArrowRight, ArrowUpDown, X } from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';
import { PeriodNavigator } from '../ui/PeriodNavigator';
import type { PeriodModo } from '../ui/PeriodNavigator';
import type {
  FilterBarProps,
  PeriodControlValue,
  SelectSpec,
} from './types';

/* ============================================================
 * Select de filtro (Etiqueta + ModernSelect)
 * ============================================================ */

function Av2Select({ spec }: { spec: SelectSpec }) {
  return (
    <div className="av2-select-grupo">
      <span className="av2-select-etiqueta">{spec.label}</span>
      <ModernSelect
        value={spec.value}
        onChange={spec.onChange}
        options={spec.options}
        placeholder={spec.label}
        searchable={spec.options.length > 8}
        className="av2-select-modern"
      />
    </div>
  );
}

/* ============================================================
 * PeriodControl — aritmética de períodos (ISO "YYYY-MM" | "YYYY")
 * ============================================================ */

interface PeriodoParseado {
  anio: number;
  /** 0-11. En unit='year' siempre 0 (el mes no aplica). */
  mes: number;
}

/** Parsea `from`/`to` del contrato. El contrato admite "ISO o etiqueta ya
 *  formateada": si NO es ISO devuelve null y el control cae al fallback de
 *  etiqueta estática (sin navegación). */
function parseIsoPeriodo(valor: string): PeriodoParseado | null {
  const conMes = /^(\d{4})-(\d{1,2})$/.exec(valor);
  if (conMes) {
    const mes = Number(conMes[2]) - 1;
    if (mes < 0 || mes > 11) return null;
    return { anio: Number(conMes[1]), mes };
  }
  const soloAnio = /^\d{4}$/.exec(valor);
  if (soloAnio) return { anio: Number(valor), mes: 0 };
  return null;
}

function aIso(unit: PeriodControlValue['unit'], p: PeriodoParseado): string {
  return unit === 'year' ? String(p.anio) : `${p.anio}-${String(p.mes + 1).padStart(2, '0')}`;
}

function avanzar(
  unit: PeriodControlValue['unit'],
  p: PeriodoParseado,
  delta: number
): PeriodoParseado {
  if (unit === 'year') return { anio: p.anio + delta, mes: 0 };
  const total = p.anio * 12 + p.mes + delta;
  return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
}

function antesDe(a: PeriodoParseado, b: PeriodoParseado): boolean {
  return a.anio < b.anio || (a.anio === b.anio && a.mes < b.mes);
}

export interface PeriodControlProps {
  value: PeriodControlValue;
  onChange?: (value: PeriodControlValue) => void;
}

/**
 * Control de período del estándar. Reusa el `PeriodNavigator` existente para
 * cada stepper (el "desde" lleva el switch Mes/Año; el "hasta" no) y agrega
 * el rango dinámico. Reglas de coherencia al navegar:
 *  - mover el "desde" más allá del "hasta" arrastra el "hasta" (y viceversa);
 *  - abrir el rango propone `hasta = desde + 1 período`;
 *  - cambiar Mes↔Año convierte los extremos (Año→Mes: mes actual si es el año
 *    en curso, Enero si no).
 *
 * [v2.1] Modo "todos" (`value.todos`): OPT-IN — se activa con el flag
 * DEFINIDO (true o false); sin él, el control es idéntico al de siempre y
 * ningún emit lleva `todos` (compat con las páginas existentes). Con el flag:
 *  - `todos: true` ⇒ el PeriodNavigator del dueño entra en `modoTodos`
 *    ("Todos los meses/años", flechas apagadas) y el rango "→ Hasta" se
 *    oculta (no aplica sin período). El toggle acota al período que
 *    `unit`/`from`/`to` conservaron como propuesta (default: mes en curso).
 *  - `todos: false` ⇒ navegación normal + toggle "Todos los períodos" para
 *    volver a "todos" conservando el período visible como propuesta.
 *  - Cambiar Mes↔Año dentro de "todos" NO sale de "todos" (solo convierte la
 *    propuesta), fiel al comportamiento del PeriodNavigator en Tesorería.
 */
export function PeriodControl({ value, onChange }: PeriodControlProps) {
  const desde = parseIsoPeriodo(value.from);
  const rangoAbierto = value.to !== undefined;
  const hasta = value.to !== undefined ? parseIsoPeriodo(value.to) : null;
  const modo: PeriodModo = value.unit === 'year' ? 'anio' : 'mes';

  /* [v2.1] Modo "todos" — opt-in cuando la página define el flag. */
  const usaTodos = value.todos !== undefined;
  const enTodos = value.todos === true;

  const emitir = (v: PeriodControlValue) => onChange?.(v);

  /* El flag `todos` solo viaja en los emits si la página lo usa (opt-in):
     sin él, las páginas reciben el objeto de siempre, sin claves nuevas. */
  const conTodos = (v: PeriodControlValue, todos: boolean): PeriodControlValue =>
    usaTodos ? { ...v, todos } : v;

  /* Fallback: `from` vino como etiqueta preformateada — mostrar sin navegar.
     (Con `todos: true` no aplica: el navegador pinta su propio label.) */
  if (!desde && !enTodos) {
    return (
      <div className="av2-period" role="group" aria-label="Período">
        <span className="av2-period-label">{value.from}</span>
        {rangoAbierto && (
          <>
            <ArrowRight size={15} strokeWidth={2} className="av2-period-flecha" aria-hidden />
            <span className="av2-period-label">{value.to}</span>
          </>
        )}
      </div>
    );
  }

  /* Período de trabajo: el `from` parseado o, si en "todos" vino una etiqueta
     no-ISO, el período en curso como propuesta de aterrizaje. */
  const hoy = new Date();
  const propuesta: PeriodoParseado = desde ?? {
    anio: hoy.getFullYear(),
    mes: value.unit === 'year' ? 0 : hoy.getMonth(),
  };

  const moverDesde = (delta: 1 | -1) => {
    const nuevo = avanzar(value.unit, propuesta, delta);
    const nuevoIso = aIso(value.unit, nuevo);
    if (hasta && antesDe(hasta, nuevo)) {
      emitir(conTodos({ unit: value.unit, from: nuevoIso, to: nuevoIso }, false));
    } else {
      emitir(conTodos({ ...value, from: nuevoIso }, false));
    }
  };

  const moverHasta = (delta: 1 | -1) => {
    if (!hasta) return;
    const nuevo = avanzar(value.unit, hasta, delta);
    const nuevoIso = aIso(value.unit, nuevo);
    if (antesDe(nuevo, propuesta)) {
      emitir(conTodos({ unit: value.unit, from: nuevoIso, to: nuevoIso }, false));
    } else {
      emitir(conTodos({ unit: value.unit, from: value.from, to: nuevoIso }, false));
    }
  };

  const cambiarModo = (m: PeriodModo) => {
    const unit: PeriodControlValue['unit'] = m === 'anio' ? 'year' : 'month';
    if (unit === value.unit) return;
    const convertir = (p: PeriodoParseado): PeriodoParseado =>
      unit === 'year'
        ? { anio: p.anio, mes: 0 }
        : { anio: p.anio, mes: p.anio === hoy.getFullYear() ? hoy.getMonth() : 0 };
    const base: PeriodControlValue = { unit, from: aIso(unit, convertir(propuesta)) };
    /* Dentro de "todos", el switch solo convierte la propuesta (no sale). */
    emitir(conTodos(hasta ? { ...base, to: aIso(unit, convertir(hasta)) } : base, enTodos));
  };

  const abrirRango = () => {
    emitir(
      conTodos(
        {
          unit: value.unit,
          from: value.from,
          to: aIso(value.unit, avanzar(value.unit, propuesta, 1)),
        },
        false,
      ),
    );
  };

  const cerrarRango = () => {
    emitir(conTodos({ unit: value.unit, from: value.from }, false));
  };

  /* [v2.1] Toggle del modo "todos": acotar aterriza en la propuesta que el
     value conservó (default de la página: el mes en curso); volver a "todos"
     conserva el período visible como próxima propuesta. */
  const acotarPeriodo = () => {
    const base: PeriodControlValue = {
      unit: value.unit,
      from: aIso(value.unit, propuesta),
      todos: false,
    };
    emitir(hasta ? { ...base, to: aIso(value.unit, hasta) } : base);
  };

  const volverATodos = () => emitir({ ...value, todos: true });

  return (
    <div className="av2-period" role="group" aria-label="Período">
      <PeriodNavigator
        modo={modo}
        onModoChange={cambiarModo}
        mes={propuesta.mes}
        anio={propuesta.anio}
        onPrev={() => moverDesde(-1)}
        onNext={() => moverDesde(1)}
        modoTodos={enTodos}
        onToggleTodos={usaTodos ? (enTodos ? acotarPeriodo : volverATodos) : undefined}
        todosLabel="Todos los períodos"
        todosLabelActivo={modo === 'anio' ? 'Acotar a un año' : 'Acotar a un mes'}
      />

      {/* Rango "→ Hasta": no aplica en "todos" (no hay período que extender). */}
      {!enTodos &&
        (!rangoAbierto ? (
          <button
            type="button"
            className="av2-period-hasta"
            onClick={abrirRango}
            title="Extender a un rango de períodos"
          >
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
            Hasta
          </button>
        ) : (
          <>
            <ArrowRight size={15} strokeWidth={2} className="av2-period-flecha" aria-hidden />
            {hasta ? (
              <PeriodNavigator
                modo={modo}
                mes={hasta.mes}
                anio={hasta.anio}
                onPrev={() => moverHasta(-1)}
                onNext={() => moverHasta(1)}
              />
            ) : (
              <span className="av2-period-label">{value.to}</span>
            )}
            <button
              type="button"
              className="av2-period-quitar"
              onClick={cerrarRango}
              title="Quitar el hasta"
              aria-label="Volver a período simple"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </>
        ))}
    </div>
  );
}

/* ============================================================
 * FilterBar
 * ============================================================ */

export function FilterBar({
  // Defaults a propósito: `SemanticAbmPage` declara ambas OPCIONALES y las pasa
  // tal cual, así que una pantalla sin filtros (el árbol de trámites, por caso)
  // llega acá con `undefined` y un `.length` a ciegas se lleva puesta la
  // pantalla entera vía ErrorBoundary. Una pieza del kit no puede romperse
  // porque el consumidor omitió algo que su contrato marca opcional.
  selects = [],
  period,
  onPeriodChange,
  statusTabs = [],
  activeStatus,
  onStatusChange,
  sortSpec,
  filterSummary,
}: FilterBarProps) {
  const haySelects = selects.length > 0;
  const hayPeriodo = period !== undefined;
  const hayTabs = statusTabs.length > 0;
  const hayOrden = !!sortSpec && sortSpec.opciones.length > 0;

  /* [v2.2] Toolbar y filtros son UNA tarjeta partida: una barra vacía se vería
     como una franja muerta pegada abajo. Sin nada que filtrar no se renderiza
     y el CSS le devuelve las 4 esquinas a la toolbar (`:last-child`). */
  if (!haySelects && !hayPeriodo && !hayTabs && !hayOrden && !filterSummary) return null;

  return (
    <div className="av2-filterbar">
      {selects.map((spec) => (
        <Av2Select key={spec.id} spec={spec} />
      ))}

      {haySelects && hayPeriodo && <span className="av2-divisor" aria-hidden />}

      {period && <PeriodControl value={period} onChange={onPeriodChange} />}

      {(haySelects || hayPeriodo) && hayTabs && <span className="av2-divisor" aria-hidden />}

      {hayTabs && (
        <div className="av2-estados" role="group" aria-label="Filtrar por estado">
          {statusTabs.map((tab) => {
            const cero = tab.count === 0;
            const activo = tab.id === activeStatus;
            const clases = [
              'av2-estado-tab',
              activo ? 'av2-estado-tab--activo' : '',
              cero ? 'av2-estado-tab--cero' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={tab.id}
                type="button"
                className={clases}
                onClick={cero ? undefined : () => onStatusChange(tab.id)}
                disabled={cero}
                aria-pressed={activo}
              >
                {tab.label}
                <span className="av2-estado-conteo">{tab.count.toLocaleString('es-AR')}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* [v2.1] Segmented chico de orden — ORDEN, no filtro (la página
          ordena; acá solo se pinta el criterio activo y se notifica). */}
      {hayOrden && sortSpec && (
        <div className="av2-orden" role="group" aria-label="Ordenar por">
          <ArrowUpDown size={12} strokeWidth={2} className="av2-orden-icono" aria-hidden />
          {sortSpec.opciones.map((op) => {
            const activo = op.id === sortSpec.activo;
            return (
              <button
                key={op.id}
                type="button"
                className={activo ? 'av2-orden-tab av2-orden-tab--activo' : 'av2-orden-tab'}
                onClick={() => sortSpec.onSort(op.id)}
                aria-pressed={activo}
                title={`Ordenar por ${op.label.toLowerCase()}`}
              >
                {op.label}
              </button>
            );
          })}
        </div>
      )}

      {filterSummary && <span className="av2-filtro-resumen">{filterSummary}</span>}
    </div>
  );
}
