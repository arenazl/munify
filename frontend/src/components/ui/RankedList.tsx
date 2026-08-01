/**
 * RankedList — lista RANKEADA (top N) del KIT.
 *
 * AGNÓSTICA: es un componente del kit, no de esta app. No sabe qué rankea
 * (zonas calientes de un mapa, vendedores, productos, categorías, sucursales…):
 * todo entra por props. Una sola implementación polimórfica; las variantes
 * salen de props, nunca de copiar el componente.
 *
 * Anatomía de cada fila:
 *
 *   [ 1 ]  Título de la fila                    12
 *          detalle secundario                reclamos
 *
 * El NÚMERO DE RANKING lo pone el componente (1, 2, 3…) — quien lo usa manda
 * los items YA ORDENADOS y no se ocupa de la numeración. El tratamiento del
 * número se DEGRADA del primero al último (más intenso arriba, más suave
 * abajo), derivado de tokens con `color-mix`: nunca colores fijos.
 *
 * Tonos (matiz del número, opcional por item):
 *   - `acento` (default) → el acento de la marca.
 *   - `bueno` / `advertencia` / `malo` → matiz semántico. El veredicto lo
 *     decide QUIEN usa el componente con sus propios umbrales — acá no hay
 *     ni una regla de negocio.
 *   - `neutro` → gris de texto.
 *
 * `maxVisibles` recorta la lista y agrega el pie "+N más" (degradación
 * progresiva: se muestra lo que entra, nunca todo-o-nada).
 *
 * Estilos en styles/ranked-list.css sobre tokens --pl-*. Cero hex, cero
 * estilos inline (el único valor de layout runtime son las clases de
 * posición, que son discretas).
 */

export type RankedListTono = 'acento' | 'bueno' | 'advertencia' | 'malo' | 'neutro';

export interface RankedListItem {
  /** Clave estable de la fila. */
  id: string;
  /** Línea principal (lo que se rankea). */
  titulo: string;
  /** Línea secundaria opcional (contexto: dirección, categoría, período…). */
  detalle?: string;
  /** Valor a la derecha (ej: 12, "68%", "$ 1.240"). */
  valor: string | number;
  /** Unidad / aclaración chica debajo del valor (ej: "reclamos"). */
  valorSub?: string;
  /** Matiz del número de ranking; si no viene, `acento`. */
  tono?: RankedListTono;
  /** Si viene, la fila es clickeable (se renderiza como botón). */
  onClick?: () => void;
}

export interface RankedListProps {
  /** Items YA ORDENADOS (el puesto 1 es el primero del array). */
  items: RankedListItem[];
  /** Cuántos se muestran; el resto se resume en "+N más". Default 5. */
  maxVisibles?: number;
  /** Nombre accesible de la lista (obligatorio: es una lista de datos). */
  ariaLabel: string;
  className?: string;
}

/**
 * Escalón de intensidad por posición: 5 pasos discretos, del más intenso al
 * más suave. A partir del quinto se planta en el más suave — un ranking largo
 * no tiene por qué desvanecerse hasta desaparecer.
 */
const clasePosicion = (index: number): string => `rk-item--p${Math.min(index + 1, 5)}`;

export function RankedList({ items, maxVisibles = 5, ariaLabel, className }: RankedListProps) {
  if (items.length === 0) return null;

  const visibles = items.slice(0, Math.max(1, maxVisibles));
  const resto = items.length - visibles.length;

  return (
    <div className={`rk-wrap ${className || ''}`}>
      <ol className="rk" aria-label={ariaLabel}>
        {visibles.map((item, i) => {
          const contenido = (
            <>
              <span className="rk-num">{i + 1}</span>
              <span className="rk-cuerpo">
                <span className="rk-titulo">{item.titulo}</span>
                {item.detalle && <span className="rk-detalle">{item.detalle}</span>}
              </span>
              <span className="rk-valor-col">
                <span className="rk-valor">{item.valor}</span>
                {item.valorSub && <span className="rk-valor-sub">{item.valorSub}</span>}
              </span>
            </>
          );

          return (
            <li
              key={item.id}
              className={`rk-item rk-item--${item.tono ?? 'acento'} ${clasePosicion(i)}`}
            >
              {item.onClick ? (
                <button type="button" className="rk-fila rk-fila--click" onClick={item.onClick}>
                  {contenido}
                </button>
              ) : (
                <div className="rk-fila">{contenido}</div>
              )}
            </li>
          );
        })}
      </ol>
      {resto > 0 && <p className="rk-resto">+{resto} más</p>}
    </div>
  );
}

export default RankedList;
