/**
 * abmv2/TreeList — árbol jerárquico expandible (§ TreeListProps de types.ts).
 *
 * Origen: cuerpo "arbol" de "Configuracion.dc.html" (canvas Claude Design,
 * 2026-08-03). En Munify pinta Dependencia → Categoría → Trámite → requisitos,
 * pero no sabe nada de trámites: sirve para cualquier estructura de 2+ niveles
 * (organigrama, plan de cuentas, categorías anidadas, menús).
 *
 * Por qué un árbol y no una tabla con una columna "padre": cuando lo que el
 * usuario viene a entender es la ESTRUCTURA —quién cuelga de quién— una tabla
 * plana lo obliga a reconstruirla de memoria. El árbol la muestra.
 *
 * Reglas de la pieza:
 *  - La profundidad la calcula el componente recorriendo `children`. La página
 *    manda datos, no medidas: sangría y tipografía por nivel salen de acá.
 *  - Chevron y cuerpo son dos gestos distintos: el chevron SIEMPRE expande;
 *    el cuerpo llama a `onNodeClick` si la página lo pasó (abrir el detalle),
 *    y si no, también expande. Así un árbol de sólo lectura no necesita
 *    handler y uno con drawer no pierde el expandir.
 *  - Máximo 2 acciones por nodo, sin menú "…" de desborde: el nodo ya carga
 *    chevron, tile, chip y cifra; una tercera capa de interacción lo vuelve
 *    ilegible. Si hacen falta más, van en el drawer que abre `onNodeClick`.
 *
 * POLIMÓRFICO: clases `av2-arbol-*` sobre tokens `--pl-*`. Los únicos inline
 * son la sangría (calculada por nivel) y los colores que vienen de datos.
 */
import { isValidElement, useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MetricCell, Tile } from './Controls';
import type { TreeListProps, TreeNode } from './types';

/** Sangría por nivel. 22px es el ancho del chevron + su gap: cada nivel
 *  arranca donde arrancaba el label del padre. */
const SANGRIA = 22;
const PADDING_BASE = 16;

function IconoNodo({ icon, color, size }: { icon?: LucideIcon | ReactNode; color?: string; size: number }) {
  if (icon == null) return null;
  if (isValidElement(icon)) return <Tile color={color} size={size}>{icon}</Tile>;
  const Icono = icon as LucideIcon;
  return (
    <Tile color={color} size={size}>
      <Icono size={size <= 26 ? 14 : 16} strokeWidth={1.9} />
    </Tile>
  );
}

export function TreeList({
  nodes,
  expandedIds,
  onExpandedChange,
  defaultExpandedIds,
  onNodeClick,
  footer,
  loading = false,
  emptyMessage = 'Todavía no hay nada cargado acá.',
}: TreeListProps) {
  // Controlado si viene `expandedIds`; si no, estado propio. Se soportan las
  // dos formas porque el "expandir todo" de una toolbar necesita mandar desde
  // afuera, pero un árbol chico no merece que la página cargue con eso.
  const [internos, setInternos] = useState<string[]>(defaultExpandedIds ?? []);
  const abiertos = expandedIds ?? internos;

  const alternar = useCallback(
    (id: string) => {
      const nuevo = abiertos.includes(id) ? abiertos.filter((x) => x !== id) : [...abiertos, id];
      if (expandedIds) onExpandedChange?.(nuevo);
      else setInternos(nuevo);
    },
    [abiertos, expandedIds, onExpandedChange],
  );

  const renderNodo = (nodo: TreeNode, nivel: number): ReactNode => {
    const tieneHijos = !!nodo.children?.length;
    const expandible = tieneHijos || !!nodo.detail || !!nodo.addLabel;
    const abierto = abiertos.includes(nodo.id);
    const acciones = (nodo.actions ?? []).slice(0, 2);

    // Sangría = valor calculado por nivel (runtime), no un color.
    const estiloFila: CSSProperties = { paddingLeft: PADDING_BASE + nivel * SANGRIA };
    const tamTile = nivel === 0 ? 30 : 26;

    return (
      <div key={nodo.id} role="treeitem" aria-expanded={expandible ? abierto : undefined}>
        <div
          className={`av2-arbol-fila av2-arbol-fila--n${Math.min(nivel, 2)}${
            expandible || onNodeClick ? ' av2-arbol-fila--click' : ''
          }`}
          style={estiloFila}
          onClick={() => {
            if (onNodeClick) onNodeClick(nodo);
            else if (expandible) alternar(nodo.id);
          }}
        >
          <button
            type="button"
            className={`av2-arbol-chevron${abierto ? ' av2-arbol-chevron--abierto' : ''}`}
            aria-label={abierto ? 'Colapsar' : 'Expandir'}
            disabled={!expandible}
            onClick={(e) => {
              e.stopPropagation();
              if (expandible) alternar(nodo.id);
            }}
          >
            {expandible && <ChevronRight size={13} strokeWidth={2.4} />}
          </button>

          <IconoNodo icon={nodo.icon} color={nodo.tileColor} size={tamTile} />

          <span className="av2-arbol-cuerpo">
            <span className="av2-arbol-linea">
              <span className="av2-arbol-label">{nodo.label}</span>
              {nodo.chip && (
                <span className={`av2-chip-estado av2-chip-estado--${nodo.chip.tone ?? 'gray'}`}>
                  {nodo.chip.icon && <nodo.chip.icon size={10} strokeWidth={2.2} />}
                  {nodo.chip.label}
                </span>
              )}
            </span>
            {nodo.sub && <span className="av2-arbol-sub">{nodo.sub}</span>}
          </span>

          {nodo.amount && (
            <span className="av2-arbol-monto">
              <MetricCell {...nodo.amount} />
            </span>
          )}

          {acciones.length > 0 && (
            <span className="av2-arbol-acciones">
              {acciones.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`av2-tabla-accion${a.danger ? ' av2-tabla-accion--peligro' : ''}`}
                  title={a.label}
                  aria-label={a.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    a.onClick(nodo);
                  }}
                >
                  <a.icon size={15} strokeWidth={1.8} />
                </button>
              ))}
            </span>
          )}
        </div>

        {abierto && (
          <>
            {nodo.children?.map((h) => renderNodo(h, nivel + 1))}
            {nodo.detail && (
              <div
                className="av2-arbol-detalle"
                style={{ paddingLeft: PADDING_BASE + (nivel + 1) * SANGRIA }}
              >
                {nodo.detail}
              </div>
            )}
            {nodo.addLabel && nodo.onAdd && (
              <button
                type="button"
                className="av2-arbol-agregar"
                style={{ paddingLeft: PADDING_BASE + (nivel + 1) * SANGRIA }}
                onClick={nodo.onAdd}
              >
                <span className="av2-arbol-agregar-mas">
                  <Plus size={13} strokeWidth={2.2} />
                </span>
                {nodo.addLabel}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="av2-arbol" role="tree">
      {loading ? (
        <div aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="av2-arbol-fila" style={{ paddingLeft: PADDING_BASE + (i % 3) * SANGRIA }}>
              <span className="av2-skeleton av2-skeleton--tile" />
              <span className="av2-skeleton av2-skeleton--w2" />
            </div>
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <div className="av2-tabla-vacia">{emptyMessage}</div>
      ) : (
        nodes.map((n) => renderNodo(n, 0))
      )}
      {footer && <div className="av2-arbol-pie">{footer}</div>}
    </section>
  );
}

export default TreeList;
