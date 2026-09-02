/**
 * FilaLista — la fila de un listado en pantalla angosta.
 *
 * QUÉ PROBLEMA RESUELVE
 * Las tarjetas grandes en un teléfono dejan menos de dos ítems por pantalla:
 * revisar veinticinco trámites eran veinte scrolls. Además repetían el mismo
 * dato dos veces (el nombre en un chip y otra vez en el título) y lo más
 * grande de la tarjeta era el código, que es justo lo que menos se mira.
 *
 * Esta fila muestra lo único que se necesita para decidir si abrir o no:
 * QUÉ es, DE QUIÉN es y HACE CUÁNTO. El estado no ocupa una banda: es una
 * barra de color al costado, así se escanea la columna izquierda y se ve el
 * estado de toda la lista sin leer una palabra. Entran 7 u 8 por pantalla.
 *
 * AGNÓSTICO: no sabe de reclamos ni de trámites ni de ningún dominio. Recibe
 * items ya armados. La MISMA fila sirve para las dos pantallas —esa era la
 * condición— y para cualquier listado de otra app: pedidos, órdenes, casos.
 *
 * La acción opcional deja despachar desde la lista, sin entrar a cada ítem:
 * para quien trabaja la cola todo el día, es la diferencia entre dos toques
 * y seis.
 */
import type { ReactNode } from 'react';

export type FilaTono = 'bueno' | 'advertencia' | 'malo' | 'neutro' | 'info';

export interface FilaListaItem {
  id: string | number;
  /** Lo que se rankea/identifica. Se lee entero, nunca cortado. */
  titulo: string;
  /**
   * Datos de contexto, en orden de importancia: quién, área, código.
   * Se separan con puntos medios; los vacíos se descartan solos.
   */
  meta?: (string | null | undefined)[];
  /** Estado del ítem: da el color de la barra lateral y de la píldora. */
  estado?: { label: string; tono: FilaTono };
  /** Antigüedad ya formateada ("2 h", "ayer", "3 d"). */
  hace?: string;
  /** Acción de "lo que sigue", para despachar sin abrir el ítem. */
  accion?: { label: string; onClick: () => void };
  /** Marca visual extra (ej: prioridad alta). */
  distintivo?: ReactNode;
  onClick?: () => void;
}

interface FilaListaProps {
  items: FilaListaItem[];
  /** Nombre accesible de la lista. */
  ariaLabel: string;
  /** Qué mostrar cuando no hay nada. */
  vacio?: ReactNode;
  className?: string;
}

export function FilaLista({ items, ariaLabel, vacio, className }: FilaListaProps) {
  if (items.length === 0) {
    return vacio ? <div className="fila-vacio">{vacio}</div> : null;
  }

  return (
    <ul className={`fila-lista ${className || ''}`} aria-label={ariaLabel}>
      {items.map((item) => {
        const meta = (item.meta || []).filter(Boolean) as string[];
        const tono = item.estado?.tono || 'neutro';
        return (
          <li key={item.id} className={`fila fila--${tono}`}>
            <button
              type="button"
              className="fila-cuerpo"
              onClick={item.onClick}
              disabled={!item.onClick}
            >
              <span className="fila-titulo">{item.titulo}</span>
              {meta.length > 0 && (
                <span className="fila-meta">
                  {meta.map((m, i) => (
                    <span key={i} className="fila-meta-item">{m}</span>
                  ))}
                </span>
              )}
            </button>

            <div className="fila-dcha">
              {item.distintivo}
              {item.estado && (
                <span className={`fila-estado fila-estado--${tono}`}>{item.estado.label}</span>
              )}
              {item.hace && <span className="fila-hace">{item.hace}</span>}
              {item.accion && (
                <button
                  type="button"
                  className="fila-accion"
                  onClick={(e) => { e.stopPropagation(); item.accion!.onClick(); }}
                >
                  {item.accion.label}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
