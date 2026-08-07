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
 *   - 'entity'→ EntityCellData (tile de icono/iniciales + título + subtítulo
 *               con punto de color); si no matchea, cae a texto.
 *   - 'dot'   → [v2.1] DotCellData {label, dotColor} o string: punto de color
 *               (runtime) + texto NEUTRO — versión liviana de 'entity' para
 *               columnas taxonómicas (categoría, dependencia, zona).
 *   - 'actions' → la resuelve SIEMPRE el DataTable con `rowActions`
 *               (máximo 2 visibles; el resto va a un menú "…").
 * La página declara la columna de acciones en `columns` (kind: 'actions');
 * sin esa columna, las rowActions no se renderizan.
 *
 * [v2.1] Upgrade con el backlog agnóstico de los pilotos (contratos en
 * types.ts, cada uno documenta su porqué):
 *   - `loading` → 6 skeleton rows (.av2-skeleton, shimmer con tokens) sobre
 *     el MISMO template de columnas; el vacío no se muestra mientras carga.
 *   - `emptyMessage` → copy del estado vacío (fallback al texto genérico).
 *   - EntityCell acepta `initials` (avatar circular, excluyente con icon) e
 *     `icon: LucideIcon | ReactNode` (nodos ya instanciados, p. ej. <img>).
 *   - EntityCellData/DotCellData son canónicas en types.ts; acá se
 *     RE-EXPORTAN para no romper los imports existentes (Empleados).
 *
 * kind='board' NO se implementa en esta fase (Planificación): se muestra
 * un placeholder explicativo. Ver types.ts.
 */
import { isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { estadoLabel } from '../../lib/enums/reclamo';
import type { Veredicto } from '../../lib/semanticHero';
import type {
  Action,
  ChipTone,
  ColumnSpec,
  DataTableProps,
  DotCellData,
  EntityCellData,
  MetricCellData,
  RowAction,
  TableGroup,
} from './types';
import { toneDeEstado } from './estadoTonos';
import { MetricCell } from './Controls';
import { useReorder } from './useReorder';

/** [v2.1] Canónicas en types.ts; re-export para los imports existentes
 *  de las páginas (Empleados importa EntityCellData desde './DataTable'). */
export type { EntityCellData, DotCellData } from './types';


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

/** Entidad de la fila: tile de icono O avatar de iniciales + título 13/600 +
 *  subtítulo con punto. [v2.1] `initials` es EXCLUYENTE con `icon` (gana
 *  initials, más específico); `icon` acepta LucideIcon o un nodo ya
 *  instanciado (p. ej. <img> de thumbnail, iconos dinámicos por nombre que
 *  resuelve la página). Contrato: EntityCellData en types.ts. */
export function EntityCell({ icon, initials, tileColor, title, subtitle, dotColor }: EntityCellData) {
  // Colores de categoría = valores runtime que vienen de datos (permitidos
  // inline por la regla polimórfica). El fondo suave se deriva del color.
  const tileStyle: CSSProperties | undefined = tileColor
    ? { color: tileColor, background: `color-mix(in srgb, ${tileColor} 12%, transparent)` }
    : undefined;

  let tile: ReactNode = null;
  if (initials) {
    // Avatar circular 30px, 11px/700. Sin tileColor cae a --pl-green-100
    // por la clase (tokens).
    tile = (
      <span className="av2-entidad-avatar" style={tileStyle}>
        {initials}
      </span>
    );
  } else if (icon != null) {
    if (isValidElement(icon)) {
      // Nodo ya instanciado: se pinta tal cual dentro del tile.
      tile = (
        <span className="av2-entidad-tile" style={tileStyle}>
          {icon}
        </span>
      );
    } else {
      // Componente LucideIcon (typeof no alcanza: lucide usa forwardRef).
      const Icono = icon as LucideIcon;
      tile = (
        <span className="av2-entidad-tile" style={tileStyle}>
          <Icono size={16} strokeWidth={2} />
        </span>
      );
    }
  }

  return (
    <span className="av2-entidad">
      {tile}
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

/** [v2.1] Celda kind='dot': punto de color (runtime) + texto NEUTRO.
 *  Versión liviana de EntityCell para columnas taxonómicas. Sin dotColor,
 *  punto neutro por tokens. Contrato: DotCellData en types.ts. */
export function DotCell({ label, dotColor }: DotCellData) {
  return (
    <span className="av2-dot-celda">
      <span
        className="av2-dot-punto"
        // Color del punto = valor runtime que viene de datos.
        style={dotColor ? { background: dotColor } : undefined}
      />
      <span className="av2-dot-texto">{label}</span>
    </span>
  );
}

/** Insignia 42×38 de los grupos: día sobre mes ("15"/"OCT") u hora ("09"/"HS").
 *  El `veredicto` la tiñe entera —día y mes— para que un día con vencidos se
 *  vea rojo de lejos. Sin veredicto queda el día en texto y el mes en el
 *  acento del theme. */
export function Insignia({
  top,
  bottom,
  veredicto,
}: {
  top: string;
  bottom: string;
  veredicto?: Veredicto;
}) {
  return (
    <span className={`av2-tabla-insignia ${veredicto ? `av2-tabla-insignia--${veredicto}` : ''}`}>
      <span className="av2-tabla-insignia-dia av2-tnum">{top}</span>
      <span className="av2-tabla-insignia-mes">{bottom}</span>
    </span>
  );
}

/** Cabecera de un grupo: insignia + título fuerte con su renglón chico.
 *  Con `title` son dos renglones; sin él queda el label solo, que es como
 *  venían todas las pantallas antes de este cambio. */
function GrupoTexto<Row>({ g }: { g: TableGroup<Row> }) {
  if (!g.title) return <span className="av2-tabla-grupo-label">{g.label}</span>;
  return (
    <span className="av2-tabla-grupo-texto">
      <span className="av2-tabla-grupo-titulo">{g.title}</span>
      <span className={`av2-tabla-grupo-label ${g.veredicto ? `av2-tabla-grupo-label--${g.veredicto}` : ''}`}>
        {g.label}
      </span>
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

const esDotData = (v: unknown): v is DotCellData =>
  typeof v === 'object' && v !== null && typeof (v as DotCellData).label === 'string';

const esMetricData = (v: unknown): v is MetricCellData =>
  typeof v === 'object' && v !== null && typeof (v as MetricCellData).value === 'string';

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
    case 'dot': {
      if (esDotData(valor)) return <DotCell {...valor} />;
      if (typeof valor === 'string' && valor) return <DotCell label={valor} />;
      return <span className="av2-tabla-texto">—</span>;
    }
    case 'metric': {
      // [v2.5] Número + nota. Un string suelto también sirve (sin nota).
      if (esMetricData(valor)) return <MetricCell {...valor} />;
      if (valor != null && valor !== '') return <MetricCell value={String(valor)} />;
      return <span className="av2-tabla-texto">—</span>;
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

/** [v2.1] Cantidad de filas fantasma del skeleton (loading). */
const SKELETON_FILAS = 6;

/** Copy genérico del estado vacío (fallback cuando no viene emptyMessage). */
const MENSAJE_VACIO =
  'No hay registros que coincidan con la búsqueda y los filtros aplicados. Probá ampliar el ' +
  'período o limpiar los filtros.';

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
  loading = false,
  emptyMessage,
  statusTabs,
  activeStatus,
  onStatusChange,
  reorder,
}: DataTableProps<Row>) {
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  const cerrarMenu = useCallback(() => setMenu(null), []);

  /* [v2.5] Modo "Reordenar". El hook va ACÁ ARRIBA, antes de cualquier return
     condicional: un hook después del `if (kind === 'board')` rompe el orden de
     hooks entre renders (React #310). */
  const reordenActivo = !!reorder?.active && groupBy === 'none';
  const noop = useCallback(() => {}, []);
  const { rowProps, handleProps } = useReorder<Row>({
    rows,
    rowKey,
    onReorder: reorder?.onReorder ?? noop,
    active: reordenActivo,
  });

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
    // [v2.4] El recorte por fila va ACÁ y no afuera: qué acciones aplican
    // depende del estado de CADA registro (ver RowAction.visible).
    const aplicables = rowActions.filter((a) => !a.visible || a.visible(row));
    const visibles = aplicables.slice(0, 2);
    const desbordadas = aplicables.slice(2);
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

  const renderFila = (row: Row, indice = 0) => {
    // Mientras se reordena, la fila NO abre el detalle: arrastrar y navegar
    // son gestos que se pisan (el drop termina en un click sintético).
    const clickeable = !!onRowClick && !reordenActivo;
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
        className={[
          'av2-tabla-grid av2-tabla-fila',
          clickeable ? 'av2-tabla-fila--click' : '',
          reordenActivo ? 'av2-tabla-fila--orden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={clickeable ? () => onRowClick!(row) : undefined}
        onKeyDown={onTecla}
        {...rowProps(row, indice)}
      >
        {columns.map((col, i) => {
          const contenido =
            col.kind === 'actions'
              ? renderAcciones(row)
              : col.cell
                ? col.cell(row)
                : celdaPorDefecto(col, row);
          // El handle vive DENTRO de la primera celda y no en una columna
          // propia: una columna extra movería todo el grid al entrar en modo
          // orden y la tabla "saltaría" al encenderlo.
          const conHandle = reordenActivo && i === 0;
          return (
            <span
              key={col.id}
              role="cell"
              className={`av2-celda ${clasePorAlineado(
                col.align ?? (col.kind === 'actions' ? 'right' : undefined),
              )}${conHandle ? ' av2-celda--con-handle' : ''}`}
            >
              {conHandle && (
                <span
                  className="av2-orden-handle"
                  title={reorder?.handleTitle ?? 'Arrastrá para reordenar'}
                  {...handleProps(row, indice)}
                >
                  <GripVertical size={14} strokeWidth={2} />
                </span>
              )}
              {contenido}
            </span>
          );
        })}
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
          <div className="av2-tabla-grid av2-tabla-grupo" role="row" aria-label={g.title || g.label}>
            <span>
              {g.badge && (
                <Insignia top={g.badge.top} bottom={g.badge.bottom} veredicto={g.veredicto} />
              )}
            </span>
            <GrupoTexto g={g} />
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
        <div
          className="av2-tabla-grupo av2-tabla-grupo--flex"
          role="row"
          aria-label={g.title || g.label}
        >
          {g.badge && <Insignia top={g.badge.top} bottom={g.badge.bottom} veredicto={g.veredicto} />}
          <GrupoTexto g={g} />
          <span className="av2-tabla-grupo-linea" aria-hidden="true" />
        </div>
        {g.rows.map(renderFila)}
      </div>
    );
  };

  /** [v2.1] Skeleton rows: filas fantasma sobre el MISMO template de columnas
   *  (av2-tabla-grid hereda --av2-cols). Barras con ancho por clase cíclica
   *  (presentacional → CSS, nada inline); 'entity' pinta tile + dos líneas y
   *  'actions' un botón fantasma. Sin spinner — shimmer con tokens. */
  const renderSkeleton = () => (
    <div aria-hidden="true">
      {Array.from({ length: SKELETON_FILAS }, (_, f) => (
        <div key={f} className="av2-tabla-grid av2-tabla-fila av2-tabla-fila--skel" role="presentation">
          {columns.map((col, c) => (
            <span
              key={col.id}
              className={`av2-celda ${clasePorAlineado(
                col.align ?? (col.kind === 'money' || col.kind === 'actions' ? 'right' : 'left'),
              )}`}
            >
              {col.kind === 'entity' ? (
                <span className="av2-skel-entidad">
                  <span className="av2-skeleton av2-skeleton--tile" />
                  <span className="av2-skel-lineas">
                    <span className="av2-skeleton av2-skeleton--w2" />
                    <span className="av2-skeleton av2-skeleton--w1 av2-skeleton--fina" />
                  </span>
                </span>
              ) : col.kind === 'actions' ? (
                <span className="av2-skeleton av2-skeleton--accion" />
              ) : (
                <span className={`av2-skeleton av2-skeleton--w${((f + c) % 3) + 1}`} />
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );

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
      {/* Tabs de estado subrayadas (diseño canvas): viven en el tope de la
          tarjeta de la tabla, no en la FilterBar. */}
      {statusTabs && statusTabs.length > 0 && (
        <div className="av2-ttabs" role="tablist" aria-label="Filtrar por estado">
          {statusTabs.map((tab) => {
            const cero = tab.count === 0;
            const activo = tab.id === activeStatus;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activo}
                disabled={cero}
                className={`av2-ttab${activo ? ' av2-ttab--activo' : ''}${cero ? ' av2-ttab--cero' : ''}`}
                onClick={cero || !onStatusChange ? undefined : () => onStatusChange(tab.id)}
              >
                {tab.label}
                {tab.count !== undefined && <span className="av2-ttab-n">{tab.count}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="av2-tabla-scroll" role="table" aria-busy={loading || undefined} style={estiloGrid}>
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

        {/* Cuerpo: skeleton (loading) > grupos o filas planas > vacío.
            Mientras carga NUNCA se muestra el vacío (falso "No hay registros"). */}
        {loading ? (
          renderSkeleton()
        ) : totalFilas === 0 ? (
          <div className="av2-tabla-vacia" role="row">
            {emptyMessage ?? MENSAJE_VACIO}
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

      {/* [v2.5] La regla de la entidad: por qué el sistema va a decir que no.
          Renglón propio bajo el pie, para que no compita con el conteo. */}
      {footer.note && <p className="av2-tabla-regla">{footer.note}</p>}
    </section>
  );
}

export default DataTable;
