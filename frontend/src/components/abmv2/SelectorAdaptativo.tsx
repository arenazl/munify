/**
 * abmv2/SelectorAdaptativo — el filtro que decide su propia forma.
 *
 * [v3] Migración conceptual del `PillsOrSelect` legacy (ui/) a la suite v2,
 * con la regla que dictó el dueño: **hasta ~5 opciones se dibuja como
 * PÍLDORAS; con más, como COMBO** (ModernSelect con etiqueta, el patrón
 * Av2Select del FilterBar). En contenedor angosto siempre combo — una fila
 * de píldoras en un teléfono es la barra que envuelve, y la barra nunca
 * envuelve.
 *
 * Pieza SUELTA y tonta: sirve dentro del FilterBar (que la usa por defecto
 * para cada SelectSpec) o independiente en cualquier pantalla. El color de
 * una opción es un valor RUNTIME que viene de datos (categoría) — tiñe la
 * píldora por tokens con color-mix, nunca un hex de tinta hardcodeado.
 */
import { ModernSelect } from '../ui/ModernSelect';
import type { SelectOption, SelectSpec } from './types';

export interface OpcionAdaptativa extends SelectOption {
  /** Color runtime (viene de datos). Omitido ⇒ acento neutro por tokens. */
  color?: string;
}

export interface SelectorAdaptativoProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OpcionAdaptativa[];
  /** Tope de opciones para dibujar píldoras (default 5). Más ⇒ combo. La
   *  opción "todas" (value '') no cuenta para el tope. */
  maxPildoras?: number;
}

export function SelectorAdaptativo({
  label,
  value,
  onChange,
  options,
  maxPildoras = 5,
}: SelectorAdaptativoProps) {
  /* GOTCHA (bug pagado 2026-09-03): NO medir el propio contenedor con
     useAnchoAngosto — este selector es shrink-to-fit, su ancho es el del
     combo y siempre se cree "angosto" (las píldoras no salían NUNCA). La
     forma la decide la CANTIDAD; el caso mobile lo resuelve el FilterBar,
     que en angosto usa su panel de combos apilados. */
  const reales = options.filter((o) => o.value !== '');
  const comoPildoras = reales.length > 0 && reales.length <= maxPildoras;

  if (!comoPildoras) {
    return (
      <div className="av2-select-grupo">
        <span className="av2-select-etiqueta">{label}</span>
        <ModernSelect
          value={value}
          onChange={onChange}
          options={options}
          placeholder={label}
          searchable={options.length > 8}
          className="av2-select-modern"
        />
      </div>
    );
  }

  return (
    <div className="av2-selad" role="group" aria-label={label}>
      <span className="av2-select-etiqueta">{label}</span>
      {options.map((o) => {
        const activa = value === o.value;
        return (
          <button
            key={o.value || '__todas__'}
            type="button"
            className={`av2-selad-pill${activa ? ' av2-selad-pill--activa' : ''}`}
            style={o.color ? ({ ['--pill' as string]: o.color } as React.CSSProperties) : undefined}
            onClick={() => onChange(o.value)}
            aria-pressed={activa}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Azúcar para el FilterBar: un SelectSpec entero, forma decidida acá. */
export function SelectorAdaptativoSpec({ spec }: { spec: SelectSpec }) {
  return (
    <SelectorAdaptativo
      label={spec.label}
      value={spec.value}
      onChange={spec.onChange}
      options={spec.options}
    />
  );
}

export default SelectorAdaptativo;
