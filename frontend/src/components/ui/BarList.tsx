/**
 * BarList — lista de barras de progreso (ranking / cobertura / comparativa).
 *
 * AGNÓSTICO: es un componente del KIT, no de esta app. No sabe qué mide
 * (reclamos, entradas vendidas, tickets, leads…): todo entra por props.
 * Una sola implementación polimórfica; las variantes salen de props, nunca
 * de copiar el componente.
 *
 * Dos layouts (la misma data, distinta densidad):
 *   - `inline`  → [label] [barra] [valor]   (una línea por item; ranking)
 *   - `stacked` → [label ······ valor sub]  (dos líneas; % + fracción)
 *                 [barra]
 *
 * Tonos:
 *   - `rampa`        → la barra toma la rampa de datos --pl-data-1..5 según
 *                      la posición (el top 1 es el más saturado).
 *   - `bueno` / `advertencia` / `malo` → matiz semántico (fill + color del
 *                      valor). El veredicto lo decide QUIEN usa el componente
 *                      con sus propios umbrales — acá no hay reglas de negocio.
 *   - `neutro`       → gris de borde fuerte.
 *
 * Estilos en styles/bar-list.css sobre tokens --pl-*. Cero hex.
 * Inline SOLO valores runtime: el ancho % del relleno y los anchos de
 * columna, que se pasan como custom properties (no como estilos sueltos).
 */
import type { CSSProperties } from 'react';

export type BarListTono = 'rampa' | 'bueno' | 'advertencia' | 'malo' | 'neutro';

export interface BarListItem {
  /** Clave estable de la fila. */
  id: string;
  label: string;
  /** Relleno de la barra, 0–100 (se recorta al rango). */
  pct: number;
  /** Valor a la derecha (ej: 24, "27 d", "68%"). */
  valor: string | number;
  /** Dato secundario, solo en layout `stacked` (ej: "41/60"). */
  valorSub?: string;
  /** Tono de esta fila; si no viene, se usa el `tono` de la lista. */
  tono?: BarListTono;
}

export interface BarListProps {
  items: BarListItem[];
  /** Densidad: una línea por item (default) o dos líneas. */
  layout?: 'inline' | 'stacked';
  /** Tono por defecto de los items que no traen el suyo. */
  tono?: BarListTono;
  /** Ancho de la columna del label, en px (layout `inline`). */
  labelWidth?: number;
  /** Ancho de la columna del valor, en px (layout `inline`). */
  valueWidth?: number;
  /** Resalta el primer item como "top 1" (layout `inline`). */
  destacarPrimero?: boolean;
}

/**
 * Clase del relleno: rampa por posición, o matiz semántico.
 *
 * La rampa llega hasta --pl-data-4 y ahí se planta: --pl-data-5 es el NEUTRO
 * (gris) de la rampa y está reservado para series secundarias, no para un
 * puesto del ranking (una barra gris se lee como "sin dato").
 */
const claseFill = (tono: BarListTono, index: number): string =>
  tono === 'rampa' ? `bl-fill--d${Math.min(index + 1, 4)}` : `bl-fill--${tono}`;

/** El valor sólo se colorea con los tonos semánticos. */
const claseValor = (tono: BarListTono): string =>
  tono === 'bueno' || tono === 'advertencia' || tono === 'malo' ? ` bl-valor--${tono}` : '';

const clampPct = (pct: number): number => Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));

export function BarList({
  items,
  layout = 'inline',
  tono: tonoLista = 'rampa',
  labelWidth = 116,
  valueWidth = 32,
  destacarPrimero = true,
}: BarListProps) {
  // Valores runtime de layout → custom properties (el CSS hace el resto).
  const vars = {
    '--bl-label-w': `${labelWidth}px`,
    '--bl-value-w': `${valueWidth}px`,
  } as CSSProperties;

  if (layout === 'stacked') {
    return (
      <div className="bl bl--stacked">
        {items.map((item, i) => {
          const tono = item.tono ?? tonoLista;
          return (
            <div key={item.id} className="bl-bloque">
              <div className="bl-bloque-head">
                <span className="bl-bloque-label">{item.label}</span>
                <span className={`bl-bloque-valor${claseValor(tono)}`}>{item.valor}</span>
                {item.valorSub && <span className="bl-bloque-sub">{item.valorSub}</span>}
              </div>
              <span className="bl-track bl-track--stacked" aria-hidden="true">
                {/* runtime: el ancho lo define el dato */}
                <span
                  className={`bl-fill ${claseFill(tono, i)}`}
                  style={{ width: `${clampPct(item.pct)}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bl bl--inline" style={vars}>
      {items.map((item, i) => {
        const tono = item.tono ?? tonoLista;
        return (
          <div key={item.id} className="bl-fila">
            <span className={`bl-label${destacarPrimero && i === 0 ? ' bl-label--top' : ''}`}>
              {item.label}
            </span>
            <span className="bl-track" aria-hidden="true">
              {/* runtime: el ancho lo define el dato */}
              <span
                className={`bl-fill ${claseFill(tono, i)}`}
                style={{ width: `${clampPct(item.pct)}%` }}
              />
            </span>
            <span className={`bl-valor${claseValor(tono)}`}>{item.valor}</span>
          </div>
        );
      })}
    </div>
  );
}

export default BarList;
