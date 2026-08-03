/**
 * abmv2/Controls — piezas chicas del kit v2 (§ CONTROLES de types.ts).
 *
 * Origen: "Configuracion.dc.html" (canvas Claude Design, 2026-08-03). Son los
 * controles que el canvas usa una y otra vez adentro de sus cuerpos y que el
 * kit todavía no tenía sueltos: el interruptor, el segmented genérico, los
 * chips de filtro, la celda de métrica y la escala ordinal.
 *
 * Están juntos en un archivo a propósito: son de 30 líneas cada uno y se usan
 * de a varios en la misma pantalla. Las piezas grandes (AssignmentPanel,
 * TreeList, IconColorPicker) sí tienen archivo propio.
 *
 * POLIMÓRFICO: cero colores fijos. Todo por clases `av2-*` sobre tokens
 * `--pl-*` (styles/abmv2.css, sección [CONTROLES v2.5]). Los únicos inline
 * son valores runtime que vienen de datos (el color de un punto de categoría).
 */
import type { CSSProperties, ReactNode } from 'react';
import type {
  FilterChip,
  MetricCellData,
  ScalePickerProps,
  SegmentedControlProps,
  SwitchProps,
} from './types';

/* ============================================================
 * Switch — interruptor de dos estados
 * ============================================================ */

/**
 * Reemplazo del checkbox nativo (que rompe el theme igual que el `<select>`).
 * Controlado: el estado lo tiene la página, así el optimismo —pintar
 * encendido antes de que responda el backend— lo decide quien sabe si puede
 * revertir.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  size = 'md',
  disabled = false,
  disabledReason,
  ariaLabel,
}: SwitchProps) {
  const perilla = (
    <span className={`av2-switch-pista${checked ? ' av2-switch-pista--on' : ''}`}>
      <span className="av2-switch-perilla" />
    </span>
  );

  // Sin label es la variante de fila de tabla: sólo la perilla, con su
  // etiqueta accesible por aria (la columna ya dice qué es).
  if (!label) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        className={`av2-switch av2-switch--${size}`}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
      >
        {perilla}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={disabled ? disabledReason : undefined}
      disabled={disabled}
      className={`av2-switch av2-switch--${size} av2-switch--con-label`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      {perilla}
      <span className="av2-switch-texto">
        <span className="av2-switch-label">{label}</span>
        {description && <span className="av2-switch-desc">{description}</span>}
      </span>
    </button>
  );
}

/* ============================================================
 * SegmentedControl — píldora hundida con el activo elevado
 * ============================================================ */

/**
 * El kit tenía este control maquetado por dentro tres veces (vistas de la
 * toolbar, estados de la FilterBar, orden) y el canvas pedía dos más. Este es
 * el único que se toca de acá en adelante.
 *
 * Una opción sin `label` queda de sólo icono (el toggle tabla/tarjetas).
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
  fullWidth = false,
}: SegmentedControlProps) {
  return (
    <div
      className={`av2-seg av2-seg--${size}${fullWidth ? ' av2-seg--full' : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const activo = o.id === value;
        const soloIcono = !o.label && !!o.icon;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            disabled={o.disabled}
            title={o.title ?? o.label}
            className={[
              'av2-seg-op',
              activo ? 'av2-seg-op--activo' : '',
              soloIcono ? 'av2-seg-op--icono' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => !o.disabled && onChange(o.id)}
          >
            {o.dotColor && (
              // Color de la entidad = valor runtime que viene de datos.
              <span className="av2-seg-punto" style={{ background: o.dotColor }} />
            )}
            {o.icon && <o.icon size={size === 'sm' ? 13 : 15} strokeWidth={2} />}
            {o.label && <span className="av2-seg-label">{o.label}</span>}
            {o.count !== undefined && <span className="av2-seg-n av2-tnum">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
 * FilterChips — chips redondeados con contador
 * ============================================================ */

/**
 * Mismo lenguaje que los `statusTabs` de la tabla, pero suelto: sirve donde
 * no hay tabla que los albergue (el panel de asignación, un panel de
 * ajustes). Un chip en 0 se apaga y no se puede apretar — filtrar a un vacío
 * conocido es un callejón.
 */
export function FilterChips({
  chips,
  value,
  onChange,
  label,
}: {
  chips: FilterChip[];
  value?: string;
  onChange?: (id: string) => void;
  /** Eyebrow a la izquierda de la fila ("FILTRAR"). */
  label?: string;
}) {
  if (!chips.length) return null;
  return (
    <div className="av2-chips" role="group" aria-label={label ?? 'Filtros'}>
      {label && <span className="av2-eyebrow av2-chips-label">{label}</span>}
      {chips.map((c) => {
        const activo = c.id === value;
        const cero = c.count === 0;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={activo}
            disabled={cero && !activo}
            className={[
              'av2-chip-filtro',
              activo ? 'av2-chip-filtro--activo' : '',
              c.veredicto ? `av2-chip-filtro--${c.veredicto}` : '',
              cero ? 'av2-chip-filtro--cero' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange?.(c.id)}
          >
            {c.veredicto && <span className="av2-chip-filtro-punto" />}
            <span>{c.label}</span>
            {c.count !== undefined && <span className="av2-chip-filtro-n av2-tnum">{c.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
 * MetricCell — número + nota (columna "EN USO")
 * ============================================================ */

/**
 * Responde "¿cuánto pesa esta fila?" sin abrirla. El número en display con
 * `tnum` y la nota en muted; el color sale del veredicto, nunca de un hex.
 *
 * `muted` es para el cero real: que una categoría no se haya usado nunca no
 * es una alerta, es un dato menor — pintarlo rojo sería mentir.
 */
export function MetricCell({ value, note, veredicto, muted }: MetricCellData) {
  return (
    <span className="av2-metrica">
      <span
        className={[
          'av2-metrica-valor',
          'av2-tnum',
          veredicto ? `av2-metrica-valor--${veredicto}` : '',
          muted ? 'av2-metrica-valor--apagado' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
      {note && <span className="av2-metrica-nota">{note}</span>}
    </span>
  );
}

/* ============================================================
 * ScalePicker — escala ordinal (prioridad 1..5)
 * ============================================================ */

/**
 * N cajas iguales con el número grande y su label. Reemplaza al combo para
 * escalas cortas: el usuario compara los extremos de un vistazo en vez de
 * desplegar una lista de cinco ítems que además esconde el orden.
 */
export function ScalePicker({ steps, value, onChange, note, ariaLabel }: ScalePickerProps) {
  return (
    <div className="av2-escala-wrap">
      <div className="av2-escala" role="radiogroup" aria-label={ariaLabel ?? 'Escala'}>
        {steps.map((s) => {
          const activo = s.value === value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={activo}
              className={[
                'av2-escala-op',
                activo ? 'av2-escala-op--activo' : '',
                s.veredicto ? `av2-escala-op--${s.veredicto}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(s.value)}
            >
              <span className="av2-escala-n av2-tnum">{s.value}</span>
              <span className="av2-escala-label">{s.label}</span>
            </button>
          );
        })}
      </div>
      {note && <p className="av2-escala-nota">{note}</p>}
    </div>
  );
}

/* ============================================================
 * Tile — cuadrito de icono con fondo teñido
 * ============================================================ */

/**
 * El tile de 30px que aparece en TODOS los cuerpos del canvas (fila de
 * catálogo, panel de asignación, nodo del árbol, cabecera del drawer).
 * Estaba escrito adentro de `EntityCell`; se saca acá para que las piezas
 * nuevas no lo copien.
 *
 * `color` es un valor RUNTIME que viene de datos (el color de la categoría
 * que el usuario eligió), por eso se permite inline: el fondo se deriva del
 * mismo color con `color-mix`, así una marca nueva no necesita tokens extra.
 */
export function Tile({
  children,
  color,
  size = 30,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  const estilo: CSSProperties = {
    width: size,
    height: size,
    flex: `0 0 ${size}px`,
    ...(color ? { color, background: `color-mix(in srgb, ${color} 12%, transparent)` } : {}),
  };
  return (
    <span className="av2-tile" style={estilo}>
      {children}
    </span>
  );
}
