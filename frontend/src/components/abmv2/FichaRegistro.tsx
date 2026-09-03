/**
 * RENDERER DE FICHAS — la otra manera que tiene el control de dibujarse.
 * ---------------------------------------------------------------------------
 * No es una pantalla ni un componente de una app: es el segundo renderer del
 * MISMO control. Donde el renderer de columnas dibuja una grilla, este dibuja
 * una lista de fichas. Comparten datos, filtros, estado y acciones, y no
 * comparten una sola regla de layout.
 *
 * Qué lo elige: el ANCHO DEL CONTENEDOR, no el de la ventana (ver
 * `useAnchoAngosto`). El control puede vivir embebido en un panel angosto de
 * escritorio, y ahí también corresponde la proyección de fichas.
 *
 * De dónde saca los datos: SÓLO de los roles semánticos (`RolesSemanticos`).
 * No conoce columnas, no conoce entidades, no sabe qué pasa arriba. El padre
 * declara los roles; esta pieza los dibuja en cuatro slots fijos:
 *
 *   1 · Encabezado      identity + taxonomy   una línea, sin wrap
 *   2 · Titular         headline              clamp a 2 líneas
 *   3 · Meta            actor / context       una línea cada uno, con elipsis
 *   4 · Margen derecho  state + elapsed       ancho intrínseco, no se comprime
 *
 * Todo campo que no entre en esos slots NO se muestra en la lista: va al
 * detalle. Esa es la decisión que evita volver a la tabla apretada.
 */
import { useEffect, useRef, useState } from 'react';
import { Glifo } from './Glifo';
import type { RolesSemanticos } from './types';

/** Debajo de esto, el control se dibuja como fichas. Es el ancho del
 *  CONTENEDOR: un panel lateral angosto de escritorio también proyecta. */
export const ANCHO_FICHAS = 720;

/**
 * ¿El contenedor es angosto? Devuelve la ref para colgar y la respuesta.
 *
 * Con ResizeObserver y no con una media query, porque la pregunta es por el
 * contenedor. Y se usa para NO RENDERIZAR el renderer que no corresponde: un
 * `display:none` sobre una tabla de 50 filas deja 50 filas de DOM con sus
 * listeners, invisibles y accesibles al lector de pantalla.
 *
 * Arranca en `null` (sin medir) para no dibujar el renderer equivocado en el
 * primer frame y hacer saltar la lista.
 */
export function useAnchoAngosto<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [angosto, setAngosto] = useState<boolean | null>(null);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    if (typeof ResizeObserver === 'undefined') {
      setAngosto(window.innerWidth < ANCHO_FICHAS);
      return;
    }
    const ro = new ResizeObserver(([entrada]) => {
      const w = entrada.contentRect.width;
      if (w > 0) setAngosto(w < ANCHO_FICHAS);
    });
    ro.observe(nodo);
    return () => ro.disconnect();
  }, []);

  return { ref, angosto };
}

/** Una ficha. Tonta: todo lo que dibuja se lo dio el padre. */
export function FichaRegistro<Row>({
  fila,
  roles,
  onClick,
}: {
  fila: Row;
  roles: RolesSemanticos<Row>;
  onClick?: (fila: Row) => void;
}) {
  const identity = roles.identity?.(fila) || null;
  const taxonomy = roles.taxonomy?.(fila) || null;
  const headline = roles.headline(fila);
  const actor = roles.actor?.(fila) || null;
  const context = roles.context?.(fila) || null;
  const state = roles.state?.(fila) || null;
  // El importe manda sobre el tiempo cuando la entidad declara los dos: en una
  // lista de plata, "hace 3 d" no es lo que se viene a leer.
  const cola = roles.amount?.(fila) || roles.elapsed?.(fila) || null;

  const clickeable = typeof onClick === 'function';

  return (
    <article
      className={`av2-ficha${clickeable ? ' av2-ficha--clickeable' : ''}`}
      onClick={clickeable ? () => onClick?.(fila) : undefined}
      role={clickeable ? 'button' : undefined}
      tabIndex={clickeable ? 0 : undefined}
      onKeyDown={
        clickeable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.(fila);
              }
            }
          : undefined
      }
    >
      {/* Ficha de categoría: no es decoración — es lo único que permite
          reconocer el tipo de registro sin leer. Se conserva siempre. */}
      <span
        className="av2-ficha-tile"
        style={taxonomy?.color ? { ['--tile' as string]: taxonomy.color } : undefined}
        aria-hidden
      >
        {/* [v3] El tile dibuja el ICONO de la taxonomía (antes era un span
            vacío y la ficha mostraba un cuadradito sin nada adentro). */}
        <Glifo glifo={taxonomy?.icon} size={16} strokeWidth={1.9} />
      </span>

      <div className="av2-ficha-cuerpo">
        {(identity || taxonomy) && (
          <div className="av2-ficha-encabezado">
            {identity && <span className="av2-ficha-id">{identity}</span>}
            {taxonomy && (
              <span className="av2-ficha-taxonomia">
                <i
                  className="av2-ficha-punto"
                  style={taxonomy.color ? { background: taxonomy.color } : undefined}
                  aria-hidden
                />
                {taxonomy.label}
              </span>
            )}
          </div>
        )}

        <h3 className="av2-ficha-titular">{headline}</h3>

        {(actor || context) && (
          <div className="av2-ficha-meta">
            {actor && <span className="av2-ficha-linea">{actor}</span>}
            {context && <span className="av2-ficha-linea">{context}</span>}
          </div>
        )}
      </div>

      {(state || cola) && (
        <div className="av2-ficha-margen">
          {state && (
            <span className={`av2-ficha-estado${state.tono ? ` av2-tono-${state.tono}` : ''}`}>
              {state.label}
            </span>
          )}
          {cola && <span className="av2-ficha-cola">{cola}</span>}
        </div>
      )}
    </article>
  );
}

/** La lista completa de fichas, con sus grupos. También tonta. */
export function ListaDeFichas<Row>({
  grupos,
  roles,
  rowKey,
  onRowClick,
  vacio,
}: {
  /** Ya agrupado por el control: la pieza no decide cómo se agrupa. */
  grupos: Array<{ titulo: string | null; filas: Row[] }>;
  roles: RolesSemanticos<Row>;
  rowKey: (row: Row, index?: number) => string | number;
  onRowClick?: (row: Row) => void;
  vacio?: string;
}) {
  const total = grupos.reduce((n, g) => n + g.filas.length, 0);
  if (total === 0) {
    return <div className="av2-fichas-vacio">{vacio || 'No hay registros para mostrar.'}</div>;
  }

  return (
    <div className="av2-fichas">
      {grupos.map((grupo, gi) => (
        <section className="av2-fichas-grupo" key={grupo.titulo ?? `g${gi}`}>
          {grupo.titulo && (
            /* Barra de día: chip + conteo. Es lo que le da ritmo al scroll. */
            <header className="av2-fichas-dia">
              <span className="av2-fichas-dia-chip">{grupo.titulo}</span>
              <span className="av2-fichas-dia-conteo">
                {grupo.filas.length.toLocaleString('es-AR')}
              </span>
            </header>
          )}
          {grupo.filas.map((fila, i) => (
            <FichaRegistro key={rowKey(fila, i)} fila={fila} roles={roles} onClick={onRowClick} />
          ))}
        </section>
      ))}
      <p className="av2-fichas-pie">
        {total.toLocaleString('es-AR')} {total === 1 ? 'registro' : 'registros'}
      </p>
    </div>
  );
}
