/**
 * abmv2/useReorder — reordenar una lista arrastrando (§ ReorderSpec de types.ts).
 *
 * Es un HOOK y no un componente porque el orden no es de la tabla: el mismo
 * gesto tiene que servir en la vista de tarjetas, en un riel y en cualquier
 * lista futura. El DataTable lo consume para su modo "Reordenar"; una vista
 * de tarjetas lo consume igual pidiendo `rowProps` para cada card.
 *
 * Decisiones que vale la pena no re-discutir:
 *
 *  - **Drag nativo de HTML5**, sin librería. Reordenar una lista de 20 filas
 *    no justifica sumar dnd-kit al bundle. La contra conocida es que en
 *    táctil no existe, y por eso el teclado no es un extra: es el otro camino
 *    (flechas sobre el handle), que además resuelve accesibilidad.
 *
 *  - **El índice de origen va en un ref, no en el dataTransfer.** Leer
 *    `dataTransfer` durante `dragover` está prohibido por spec en varios
 *    navegadores (sólo se puede en `drop`), y necesitamos saber qué se está
 *    arrastrando para pintar la línea de destino.
 *
 *  - **No reordena solo.** Emite la lista nueva y espera que la página mande
 *    las filas ya ordenadas por props. Si el guardado falla, la fila vuelve
 *    sola a su lugar — que es la verdad. Un estado interno mostraría un orden
 *    que el backend no tiene.
 */
import { useCallback, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';

/** Mueve un elemento de `from` a `to` devolviendo una lista NUEVA. */
export function moverEnLista<T>(lista: T[], from: number, to: number): T[] {
  const copia = lista.slice();
  const [item] = copia.splice(from, 1);
  copia.splice(to, 0, item);
  return copia;
}

export interface UseReorderOpciones<Row> {
  rows: Row[];
  rowKey: (row: Row) => string | number;
  /** Ver ReorderSpec.onReorder: llega la lista completa ya ordenada. */
  onReorder: (rows: Row[], moved: { row: Row; from: number; to: number }) => void;
  /** false ⇒ el hook devuelve props vacías y no engancha ningún evento. */
  active: boolean;
}

export function useReorder<Row>({ rows, rowKey, onReorder, active }: UseReorderOpciones<Row>) {
  const origen = useRef<number | null>(null);
  const [arrastrando, setArrastrando] = useState<string | number | null>(null);
  const [encima, setEncima] = useState<string | number | null>(null);

  const aplicar = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
      const fila = rows[from];
      onReorder(moverEnLista(rows, from, to), { row: fila, from, to });
    },
    [rows, onReorder],
  );

  const limpiar = useCallback(() => {
    origen.current = null;
    setArrastrando(null);
    setEncima(null);
  }, []);

  /** Props para el contenedor de CADA fila/tarjeta de la lista. */
  const rowProps = useCallback(
    (row: Row, index: number) => {
      if (!active) return {};
      const key = rowKey(row);
      return {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          origen.current = index;
          setArrastrando(key);
          // Algunos navegadores no inician el drag sin payload.
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('text/plain', String(key));
          } catch {
            /* Safari viejo tira si el drag no lo inició un elemento con datos. */
          }
        },
        onDragOver: (e: DragEvent) => {
          if (origen.current === null) return;
          e.preventDefault(); // sin esto el drop nunca se dispara
          e.dataTransfer.dropEffect = 'move';
          setEncima(key);
        },
        onDragLeave: () => setEncima((k) => (k === key ? null : k)),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          const from = origen.current;
          limpiar();
          if (from !== null) aplicar(from, index);
        },
        onDragEnd: limpiar,
        'data-arrastrando': key === arrastrando ? '' : undefined,
        'data-encima': key === encima && key !== arrastrando ? '' : undefined,
      };
    },
    [active, rowKey, arrastrando, encima, aplicar, limpiar],
  );

  /** Props del handle: el botón que se agarra (y por el que se navega). */
  const handleProps = useCallback(
    (row: Row, index: number) => {
      if (!active) return {};
      return {
        tabIndex: 0,
        role: 'button' as const,
        'aria-label': `Mover, posición ${index + 1} de ${rows.length}`,
        onKeyDown: (e: KeyboardEvent) => {
          // El otro camino al orden: sin mouse y sin táctil.
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            aplicar(index, index - 1);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            aplicar(index, index + 1);
          }
        },
        onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      };
    },
    [active, rows.length, aplicar],
  );

  return { rowProps, handleProps, arrastrando, encima, mover: aplicar };
}
