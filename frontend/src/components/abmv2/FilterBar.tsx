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
 *   simple. Contrato: `PeriodControlValue` ({ unit, from, to? }).
 * - Segmented de estados con conteo: count 0 ⇒ apagado y NO clickeable.
 * - `filterSummary` opcional dockeado a la derecha.
 *
 * Presentacional puro: todo estado controlado por props. Cero colores fijos —
 * clases `av2-*` + tokens `--pl-*`.
 */
import { ArrowRight, X } from 'lucide-react';
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
 */
export function PeriodControl({ value, onChange }: PeriodControlProps) {
  const desde = parseIsoPeriodo(value.from);
  const rangoAbierto = value.to !== undefined;
  const hasta = value.to !== undefined ? parseIsoPeriodo(value.to) : null;
  const modo: PeriodModo = value.unit === 'year' ? 'anio' : 'mes';

  const emitir = (v: PeriodControlValue) => onChange?.(v);

  /* Fallback: `from` vino como etiqueta preformateada — mostrar sin navegar. */
  if (!desde) {
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

  const moverDesde = (delta: 1 | -1) => {
    const nuevo = avanzar(value.unit, desde, delta);
    const nuevoIso = aIso(value.unit, nuevo);
    if (hasta && antesDe(hasta, nuevo)) {
      emitir({ unit: value.unit, from: nuevoIso, to: nuevoIso });
    } else {
      emitir({ ...value, from: nuevoIso });
    }
  };

  const moverHasta = (delta: 1 | -1) => {
    if (!hasta) return;
    const nuevo = avanzar(value.unit, hasta, delta);
    const nuevoIso = aIso(value.unit, nuevo);
    if (antesDe(nuevo, desde)) {
      emitir({ unit: value.unit, from: nuevoIso, to: nuevoIso });
    } else {
      emitir({ unit: value.unit, from: value.from, to: nuevoIso });
    }
  };

  const cambiarModo = (m: PeriodModo) => {
    const unit: PeriodControlValue['unit'] = m === 'anio' ? 'year' : 'month';
    if (unit === value.unit) return;
    const hoy = new Date();
    const convertir = (p: PeriodoParseado): PeriodoParseado =>
      unit === 'year'
        ? { anio: p.anio, mes: 0 }
        : { anio: p.anio, mes: p.anio === hoy.getFullYear() ? hoy.getMonth() : 0 };
    const base: PeriodControlValue = { unit, from: aIso(unit, convertir(desde)) };
    emitir(hasta ? { ...base, to: aIso(unit, convertir(hasta)) } : base);
  };

  const abrirRango = () => {
    emitir({
      unit: value.unit,
      from: value.from,
      to: aIso(value.unit, avanzar(value.unit, desde, 1)),
    });
  };

  const cerrarRango = () => {
    emitir({ unit: value.unit, from: value.from });
  };

  return (
    <div className="av2-period" role="group" aria-label="Período">
      <PeriodNavigator
        modo={modo}
        onModoChange={cambiarModo}
        mes={desde.mes}
        anio={desde.anio}
        onPrev={() => moverDesde(-1)}
        onNext={() => moverDesde(1)}
      />

      {!rangoAbierto ? (
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
      )}
    </div>
  );
}

/* ============================================================
 * FilterBar
 * ============================================================ */

export function FilterBar({
  selects,
  period,
  onPeriodChange,
  statusTabs,
  activeStatus,
  onStatusChange,
  filterSummary,
}: FilterBarProps) {
  const haySelects = selects.length > 0;
  const hayPeriodo = period !== undefined;
  const hayTabs = statusTabs.length > 0;

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

      {filterSummary && <span className="av2-filtro-resumen">{filterSummary}</span>}
    </div>
  );
}
