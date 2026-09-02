/**
 * BentoMenu — menú de acciones en mosaico asimétrico.
 *
 * QUÉ PROBLEMA RESUELVE
 * Un menú en grilla pareja pone todo al mismo peso: con ocho tarjetas
 * idénticas, encontrar una es leerlas todas. Acá el tamaño de cada bloque ES
 * la jerarquía — lo que se usa todos los días ocupa el doble y ancla la vista,
 * lo secundario cae a bloques chicos, y lo que sólo navega va en tiras anchas
 * al pie.
 *
 * Además cada acción puede traer SU DATO ("24 zonas calientes", "8 turnos
 * hoy"). Un menú que sólo muestra etiquetas es la única pantalla muda de una
 * app que en todo el resto habla con números; con el dato al lado, abrir el
 * menú ya informa algo aunque no se toque nada.
 *
 * AGNÓSTICO: no sabe de reclamos, municipios ni de ningún dominio. Recibe
 * items con su forma y los dibuja. Sirve igual para el menú de un CRM, de un
 * taller o de una fábrica: lo único que cambia es qué se le pasa.
 *
 * FORMAS
 *   'destacada' → bloque alto (ocupa dos filas) sobre el acento. Va primero.
 *   'chica'     → bloque normal, se apila a la derecha de la destacada.
 *   'ancha'     → tira de ancho completo, para lo que sólo lleva a otro lado.
 *
 * El mosaico se arma solo: la destacada toma la columna izquierda y las chicas
 * la derecha. Si no hay ninguna destacada, quedan todas parejas — el
 * componente no se rompe, sólo pierde el énfasis.
 *
 * Estilos en styles/bento-menu.css sobre tokens --pl-*: cero colores fijos,
 * así cada marca lo hereda en el suyo.
 */
import type { LucideIcon } from 'lucide-react';

export type BentoForma = 'banner' | 'destacada' | 'chica' | 'ancha';

export interface BentoItem {
  id: string;
  /** Lo que se lee. En minúscula: en mayúscula se lee más lento. */
  titulo: string;
  /** Línea de apoyo: para qué sirve, o el contexto de la acción. */
  detalle?: string;
  /** El dato que trae la acción ("24", "8"). Se muestra a la derecha. */
  dato?: string | number;
  /** Aclaración del dato ("zonas calientes", "turnos hoy"). */
  datoSub?: string;
  icono: LucideIcon;
  forma?: BentoForma;
  onClick: () => void;
}

interface BentoMenuProps {
  items: BentoItem[];
  /** Nombre accesible del menú. */
  ariaLabel: string;
  className?: string;
}

export function BentoMenu({ items, ariaLabel, className }: BentoMenuProps) {
  if (items.length === 0) return null;

  return (
    <div className={`bm ${className || ''}`} role="menu" aria-label={ariaLabel}>
      {items.map((item) => {
        const Icono = item.icono;
        const forma = item.forma || 'chica';
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`bm-item bm-item--${forma}`}
            onClick={item.onClick}
          >
            <Icono className="bm-icono" aria-hidden="true" />
            <span className="bm-textos">
              <span className="bm-titulo">{item.titulo}</span>
              {item.detalle && <span className="bm-detalle">{item.detalle}</span>}
            </span>
            {item.dato !== undefined && (
              <span className="bm-dato">
                <b>{item.dato}</b>
                {item.datoSub && <span className="bm-dato-sub">{item.datoSub}</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
