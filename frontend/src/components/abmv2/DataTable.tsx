/**
 * abmv2/DataTable — tabla del estándar `SemanticAbmPage` (§4 del STANDARD).
 *
 * Card surface radio 12 con `overflow: clip` + scroller horizontal propio.
 * Grid por columnas `minmax()` (ColumnSpec.width), encabezado eyebrow,
 * grupos por fecha (insignia día/mes 42×38) u hora (kind='schedule': cupos
 * por bloque) con SUBTOTAL en la columna del importe cuando kind='money',
 * filas con hover que llaman onRowClick(row), pie "Mostrando N de M" +
 * gran total (money) o acción ("Cargar más").
 *
 * POLIMÓRFICO: cero colores fijos — clases av2-* sobre tokens --pl-*
 * (styles/abmv2.css, sección [TABLA]). Estilos inline SOLO para valores
 * runtime: el template de columnas, la posición de la columna del subtotal
 * y los colores de categoría que vienen de datos (punto/tile de entidad).
 *
 * Render por defecto de celdas (cuando ColumnSpec.cell no viene): el valor
 * se lee de `row[col.id]` y se pinta según `col.kind`:
 *   - 'text'  → texto secundario con ellipsis ('—' si vacío).
 *   - 'date'  → caption muted con `tnum` (la página ya formatea la fecha).
 *   - 'money' → .av2-money 13.5px (la página ya formatea el importe).
 *   - 'chip'  → ChipCellData {label, tone} o string de estado (tono por
 *               `toneDeEstado`, label por lib/enums/reclamo si aplica).
 *   - 'entity'→ EntityCellData (tile de icono + título + subtítulo con
 *               punto de color); si no matchea, cae a texto.
 *   - 'actions' → la resuelve SIEMPRE el DataTable con `rowActions`
 *               (máximo 2 visibles; el resto va a un menú "…").
 * La página declara la columna de acciones en `columns` (kind: 'actions');
 * sin esa columna, las rowActions no se renderizan.
 *
 * kind='board' NO se implementa en esta fase (Planificación): se muestra
 * un placeholder explicativo. Ver types.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { estadoLabel } from '../../lib/enums/reclamo';
import type {
  Action,
  ChipTone,
  ColumnSpec,
  DataTableProps,
  RowAction,
  TableGroup,
} from './types';
import { toneDeEstado } from './estadoTonos';


/* ============================================================
 * Piezas exportadas (las páginas las reusan dentro de `cell`)
 * ============================================================ */

/** Datos del chip de estado para el render por defecto (kind='chip'). */
export interface ChipCellData {
  label: string;
  tone?: ChipTone;
}

/** Pill 22px con punto, tonos de la paleta StatusPill. */
export function ChipEstado({ label, tone = 'gray' }: ChipCellData) {
  return <span className={`av2-chip-estado av2-chip-estado--${tone}`}>{label}</span>;
}

/** Datos de la celda de entidad (kind='entity'): tile + título + subtítulo. */
export interface EntityCellData {
  /** Icono lucide del tile (28-30px, fondo suave de la familia). */
  icon?: LucideIcon;
  /** Color de la familia/categoría — viene de DATOS (runtime): tiñe el
   *  icono y el fondo suave del tile. Sin él, tile neutro por tokens. */
  tileColor?: string;
  title: string;
  /** Subtítulo: punto de color + TEXTO NEUTRO (nunca texto coloreado). */
  subtitle?: string;
  /** Color del punto del subtítulo — runtime (categoría de los datos). */
  dotColor?: string;
}

/** Entidad de la fila: tile de icono + título 13/600 + subtítulo con punto. */
export function EntityCell({ icon: Icon, tileColor, title, subtitle, dotColor }: EntityCellData) {
  // Colores de categoría = valores runtime que vienen de datos (permitidos
  // inline por la regla polimórfica). El fondo suave se deriva del color.
  const tileStyle: CSSProperties | undefined = tileColor
    ? { color: tileColor, background: `color-mix(in srgb, ${tileColor} 12%, transparent)` }
    : undefined;
  return (
    <span className="av2-entidad">
      {Icon && (
        <span className="av2-entidad-tile" style={tileStyle}>
          <Icon size={16} strokeWidth={2} />
        </span>
      )}
      <span className="av2-entidad-cuerpo">
        <span className="av2-entidad-titulo">{title}</span>
        {subtitle && (
          <span className="av2-entidad-sub">
            {dotColor && <span className="av2-entidad-punto" style={{ background: dotColor }} />}
            <span className="av2-entidad-subtexto">{subtitle}</span>
          </span>
        )}
      </span>
    </span>
  );
}

/** Insignia 42×38 de los grupos: día sobre mes ("15"/"OCT") u hora ("09"/"HS"). */
export function Insignia({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="av2-tabla-insignia">
      <span className="av2-tabla-insignia-dia av2-tnum">{top}</span>
      <span className="av2-tabla-insignia-mes">{bottom}</span>
    </span>
  );
}

/* ============================================================
 * Helpers internos
 * ============================================================ */

const clasePorAlineado = (align?: 'left' | 'right' | 'center'): string =>
  align === 'right' ? 'av2-al-der' : align === 'center' ? 'av2-al-centro' : '';

const esChipData = (v: unknown): v is ChipCellData =>
  typeof v === 'object' && v !== null && typeof (v as ChipCellData).label === 'string';

const esEntityData = (v: unknown): v is EntityCellData =>
  typeof v === 'object' && v !== null && typeof (v as EntityCellData).title === 'string';

/** Render por defecto de una celda según ColumnSpec.kind (ver doc de arriba). */
function celdaPorDefecto<Row>(col: ColumnSpec<Row>, row: Row): ReactNode {
  const valor = (row as Record<string, unknown>)[col.id];
  switch (col.kind) {
    case 'money':
      return valor == null ? (
        <span className="av2-tabla-texto">—</span>
      ) : (
        <span className="av2-money av2-tabla-monto">{String(valor)}</span>
      );
    case 'date':
      return <span className="av2-tabla-fecha av2-tnum">{valor == null ? '—' : String(valor)}</span>;
    case 'chip': {
      if (esChipData(valor)) return <ChipEstado label={valor.label} tone={valor.tone} />;
      if (typeof valor === 'string' && valor)
        return <ChipEstado label={estadoLabel(valor)} tone={toneDeEstado(valor)} />;
      return <span className="av2-tabla-texto">—</span>;
    }
    case 'entity': {
      if (esEntityData(valor)) return <EntityCell {...valor} />;
      return <span className="av2-tabla-texto">{valor == null ? '—' : String(valor)}</span>;
    }
    case 'text':
    default:
      return <span className="av2-tabla-texto">{valor == null || valor === '' ? '—' : String(valor)}</span>;
  }
}

/* ============================================================
 * Menú "…" de acciones desbordadas (a partir de la 3ra)
 * Posicionado FIXED desde el rect del botón para escapar del
 * clip del scroller horizontal. Cierra con click afuera, Esc,
 * scroll o resize.
 * ============================================================ */

interface MenuAbierto {
  filaKey: string | number;
  x: number;
  y: number;
}

function MenuAcciones<Row>({
  acciones,
  row,
  pos,
  onCerrar,
}: {
  acciones: RowAction<Row>[];
  row: Row;
  pos: { x: number; y: number };
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickAfuera = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar();
    };
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('mousedown', clickAfuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', onCerrar, true);
    window.addEventListener('resize', onCerrar);
    return () => {
      document.removeEventListener('mousedown', clickAfuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', onCerrar, true);
      window.removeEventListener('resize', onCerrar);
    };
  }, [onCerrar]);

  return (
    <div
      ref={ref}
      className="av2-tabla-menu"
      role="menu"
      // Posición runtime calculada del rect del botón.
      style={{ top: pos.y, left: pos.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {acciones.map((a) => (
        <button
          key={a.id}
          type="button"
          role="menuitem"
          className={`av2-tabla-menu-item${a.danger ? ' av2-tabla-menu-item--peligro' : ''}`}
          onClick={() => {
            onCerrar();
            a.onClick(row);
          }}
        >
          <a.icon size={15} strokeWidth={1.8} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
 * DataTable
 * ============================================================ */

const MENU_ANCHO = 168; // debe coincidir con min-width de .av2-tabla-menu

export function DataTable<Row>({
  kind,
  columns,
  groupBy = 'none',
  showGroupSubtotal = false,
  rows,
  groups,
  rowKey,
  rowActions,
  onRowClick,
  footer,
  tableMinWidth = 940,
}: DataTableProps<Row>) {
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  const cerrarMenu = useCallback(() => setMenu(null), []);

  /* --- kind='board': PENDIENTE (Planificación, otra fase) --- */
  if (kind === 'board') {
    return (
      <section className="av2-tabla">
        <div className="av2-tabla-board-pendiente">
          La vista de planificación (kind=&apos;board&apos;) todavía no está implementada — queda
          para la fase de Planificación. Ver components/abmv2/types.ts.
        </div>
      </section>
    );
  }

  const visibles = rowActions.slice(0, 2);
  const desbordadas = rowActions.slice(2);

  // Template del grid y min-width = valores runtime → CSS vars inline.
  const estiloGrid = {
    '--av2-cols': columns.map((c) => c.width).join(' '),
    '--av2-tabla-minw': `${tableMinWidth}px`,
  } as CSSProperties;

  // Columna del importe (1-based) para anclar el SUBTOTAL del grupo.
  const idxMonto = columns.findIndex((c) => c.kind === 'money');
  const colSubtotal = (idxMonto >= 0 ? idxMonto : Math.max(columns.length - 2, 0)) + 1;

  const usarGrupos = groupBy !== 'none' && !!groups?.length;
  const totalFilas = usarGrupos ? groups!.reduce((n, g) => n + g.rows.length, 0) : rows.length;

  const abrirMenu = (e: MouseEvent<HTMLButtonElement>, filaKey: string | number) => {
    e.stopPropagation();
    if (menu?.filaKey === filaKey) {
      setMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ filaKey, x: Math.max(8, r.right - MENU_ANCHO), y: r.bottom + 4 });
  };

  const renderAcciones = (row: Row) => {
    const key = rowKey(row);
    return (
      <span className="av2-tabla-acciones" role="cell">
        {visibles.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`av2-tabla-accion${a.danger ? ' av2-tabla-accion--peligro' : ''}`}
            title={a.label}
            aria-label={a.label}
            onClick={(e) => {
              e.stopPropagation();
              a.onClick(row);
            }}
          >
            <a.icon size={16} strokeWidth={1.8} />
          </button>
        ))}
        {desbordadas.length > 0 && (
          <button
            type="button"
            className="av2-tabla-accion"
            title="Más acciones"
            aria-label="Más acciones"
            aria-haspopup="menu"
            aria-expanded={menu?.filaKey === key}
            onClick={(e) => abrirMenu(e, key)}
          >
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
        )}
        {menu?.filaKey === key && (
          <MenuAcciones acciones={desbordadas} row={row} pos={menu} onCerrar={cerrarMenu} />
        )}
      </span>
    );
  };

  const renderFila = (row: Row) => {
    const clickeable = !!onRowClick;
    const onTecla = (e: KeyboardEvent<HTMLDivElement>) => {
      if (!clickeable) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick!(row);
      }
    };
    return (
      <div
        key={rowKey(row)}
        role="row"
        tabIndex={clickeable ? 0 : undefined}
        className={`av2-tabla-grid av2-tabla-fila${clickeable ? ' av2-tabla-fila--click' : ''}`}
        onClick={clickeable ? () => onRowClick!(row) : undefined}
        onKeyDown={onTecla}
      >
        {columns.map((col) =>
          col.kind === 'actions' ? (
            <span key={col.id} className={`av2-celda ${clasePorAlineado(col.align ?? 'right')}`}>
              {renderAcciones(row)}
            </span>
          ) : (
            <span key={col.id} role="cell" className={`av2-celda ${clasePorAlineado(col.align)}`}>
              {col.cell ? col.cell(row) : celdaPorDefecto(col, row)}
            </span>
          ),
        )}
      </div>
    );
  };

  /** Encabezado de grupo. Con subtotal (kind='money') va en GRID para que el
   *  SUBTOTAL caiga en la misma columna que el importe; sin subtotal (plain /
   *  schedule con cupos) va en flex con hairline de relleno. */
  const renderGrupo = (g: TableGroup<Row>) => {
    const conSubtotal = showGroupSubtotal && g.subtotal != null;
    if (conSubtotal) {
      return (
        <div key={g.key} role="rowgroup">
          <div className="av2-tabla-grid av2-tabla-grupo" role="row" aria-label={g.label}>
            <span>{g.badge && <Insignia top={g.badge.top} bottom={g.badge.bottom} />}</span>
            <span className="av2-tabla-grupo-label">{g.label}</span>
            {/* Anclado a la columna del importe (posición runtime). */}
            <span className="av2-tabla-subtotal" style={{ gridColumn: colSubtotal }}>
              <span className="av2-tabla-subtotal-eyebrow">SUBTOTAL</span>
              <span className="av2-money av2-tabla-subtotal-valor">{g.subtotal}</span>
            </span>
          </div>
          {g.rows.map(renderFila)}
        </div>
      );
    }
    return (
      <div key={g.key} role="rowgroup">
        <div className="av2-tabla-grupo av2-tabla-grupo--flex" role="row" aria-label={g.label}>
          {g.badge && <Insignia top={g.badge.top} bottom={g.badge.bottom} />}
          <span className="av2-tabla-grupo-label">{g.label}</span>
          <span className="av2-tabla-grupo-linea" aria-hidden="true" />
        </div>
        {g.rows.map(renderFila)}
      </div>
    );
  };

  const renderPieAccion = (a: Action) =>
    a.to ? (
      <Link className="av2-tabla-pie-accion" to={a.to}>
        {a.label}
      </Link>
    ) : (
      <button type="button" className="av2-tabla-pie-accion" onClick={a.onClick} disabled={a.disabled}>
        {a.label}
      </button>
    );

  return (
    <section className="av2-tabla">
      <div className="av2-tabla-scroll" role="table" style={estiloGrid}>
        {/* Encabezado eyebrow */}
        <div className="av2-tabla-grid av2-tabla-encabezado" role="row">
          {columns.map((col) => (
            <span
              key={col.id}
              role="columnheader"
              className={`av2-eyebrow ${clasePorAlineado(
                col.align ?? (col.kind === 'money' || col.kind === 'actions' ? 'right' : 'left'),
              )}`}
            >
              {col.header}
            </span>
          ))}
        </div>

        {/* Cuerpo: grupos o filas planas */}
        {totalFilas === 0 ? (
          <div className="av2-tabla-vacia" role="row">
            No hay registros que coincidan con la búsqueda y los filtros aplicados. Probá ampliar el
            período o limpiar los filtros.
          </div>
        ) : usarGrupos ? (
          groups!.map(renderGrupo)
        ) : (
          rows.map(renderFila)
        )}
      </div>

      {/* Pie: Mostrando N de M + gran total (money) o acción */}
      <div className="av2-tabla-pie">
        <span className="av2-tabla-pie-mostrando av2-tnum">{footer.showing}</span>
        {footer.total && (
          <>
            <span className="av2-tabla-pie-total-label">{footer.total.label}</span>
            <span className="av2-money av2-tabla-pie-total-valor">{footer.total.value}</span>
          </>
        )}
        {!footer.total && footer.action && renderPieAccion(footer.action)}
      </div>
    </section>
  );
}

export default DataTable;
