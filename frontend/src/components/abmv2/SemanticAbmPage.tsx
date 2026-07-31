/**
 * SemanticAbmPage — orquestador del estándar de páginas ABM (rediseño v2).
 *
 * Compone, en el ORDEN ESTÁNDAR (design/handoff-v2/STANDARD-SemanticAbmPage.md):
 *
 *   <SemanticHero>   ← el ModuleHero ES el SemanticHero existente (ui/SemanticHero)
 *   <ListToolbar>    ← H1 + total + buscador + vistas + secundario + CTA primario
 *   <FilterBar>      ← selects + PeriodControl + segmented de estados + resumen
 *   <DataTable>      ← encabezado + grupos con subtotal + filas + pie
 *   <SideModal>      ← drawer derecho (detalle de la fila / alta)
 *
 * El TopBar sticky NO es de este componente: lo pone el layout shell de la app.
 *
 * Estado del SideModal: si la página pasa el builder `sideModal`, el
 * orquestador maneja abrir/cerrar — click en una fila abre `mode='detail'`
 * con esa fila; con `primaryOpensCreate` el CTA primario abre `mode='create'`.
 * La página consumidora DECIDE: sin builder, el orquestador no monta drawer
 * y la página escucha `onRowClick` / `primaryAction.onClick` y renderiza su
 * propio <SideModal> (exportado standalone desde ./SideModal).
 *
 * `accentColor` cambia el borde izquierdo del hero vía style var runtime
 * (--av2-hero-accent). SIEMPRE un token: `var(--pl-red)` en alerta — nunca
 * un hex literal (regla polimórfica).
 *
 * kind='board' (Planificación) NO está implementado en esta fase: en dev
 * tira un error explícito; en prod DataTable muestra su placeholder.
 *
 * Polimórfico: clases av2-* (styles/abmv2.css, sección [PAGE]) sobre tokens
 * --pl-*. Inline SOLO el valor runtime del acento del hero.
 */
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import { SemanticHero } from '../ui/SemanticHero';
import { ListToolbar } from './ListToolbar';
import { FilterBar } from './FilterBar';
import { DataTable } from './DataTable';
import { SideModal } from './SideModal';
import type { SideModalComponentProps } from './SideModal';
import type { Action, SemanticAbmPageProps } from './types';
import '../../styles/abmv2.css';

/* ============================================================
 * Extensiones de implementación (el contrato del estándar vive
 * en ./types.ts y acá NO se altera — solo se agrega el wiring
 * opcional del drawer, siguiendo el patrón de SideModal.tsx)
 * ============================================================ */

/** Qué pidió abrir la página: el detalle de una fila o el alta. */
export interface SideModalRequest<Row> {
  mode: 'detail' | 'create';
  /** La fila clickeada en detail; null en create. */
  row: Row | null;
}

/**
 * Builder del drawer: dado el pedido (detail de `row` / create) devuelve la
 * spec del SideModal SIN `open`/`onClose` (los maneja el orquestador).
 * Devolver `null` cancela la apertura (p. ej. una fila sin detalle).
 */
export type SideModalBuilder<Row> = (
  request: SideModalRequest<Row>,
) => Omit<SideModalComponentProps, 'open' | 'onClose'> | null;

export interface SemanticAbmPageComponentProps<Row> extends SemanticAbmPageProps<Row> {
  /**
   * Builder del drawer estándar. Con él, el click en una fila abre el
   * detail de esa fila (además de disparar `onRowClick` si vino).
   * Sin él, no se monta ningún drawer: la página usa sus callbacks.
   */
  sideModal?: SideModalBuilder<Row>;
  /**
   * true ⇒ el CTA primario abre el drawer en `mode='create'` (requiere
   * `sideModal`). Se ignora `primaryAction.to`; el `onClick` original se
   * dispara igual antes de abrir. Default false: la página decide.
   */
  primaryOpensCreate?: boolean;
}

/* ============================================================
 * SemanticAbmPage
 * ============================================================ */

export function SemanticAbmPage<Row>(props: SemanticAbmPageComponentProps<Row>) {
  const {
    /* identidad */
    moduleKey,
    hero,
    accentColor,
    /* toolbar */
    title,
    totalCount,
    searchPlaceholder,
    views,
    secondaryAction,
    primaryAction,
    /* filtros */
    selects,
    period,
    statusTabs,
    filterSummary,
    /* tabla */
    kind,
    columns,
    groupBy,
    showGroupSubtotal,
    rows,
    groups,
    rowActions,
    footer,
    /* estado controlado */
    search,
    onSearchChange,
    activeView,
    onViewChange,
    activeStatus,
    onStatusChange,
    onPeriodChange,
    rowKey,
    onRowClick,
    /* drawer */
    sideModal,
    primaryOpensCreate = false,
  } = props;

  const [drawer, setDrawer] = useState<SideModalRequest<Row> | null>(null);
  const cerrarDrawer = useCallback(() => setDrawer(null), []);

  /* --- Guardas de contrato (solo dev; después de los hooks) --- */
  if (import.meta.env.DEV) {
    if (kind === 'board') {
      throw new Error(
        `SemanticAbmPage[${moduleKey}]: kind='board' pendiente fase Planificacion — ` +
          "usá 'plain', 'money' o 'schedule'. Ver components/abmv2/types.ts.",
      );
    }
    if (kind === 'money' && !period) {
      console.warn(
        `SemanticAbmPage[${moduleKey}]: kind='money' exige \`period\` (PeriodControl ` +
          'obligatorio en toda lista con importes — §3 del estándar).',
      );
    }
  }

  /* --- Click en fila: callback de la página + detail del drawer --- */
  const manejarFila = useCallback(
    (row: Row) => {
      onRowClick?.(row);
      if (sideModal) setDrawer({ mode: 'detail', row });
    },
    [onRowClick, sideModal],
  );
  const filaClickeable = !!onRowClick || !!sideModal;

  /* --- CTA primario: puede abrir el create del drawer --- */
  const abreCreate = primaryOpensCreate && !!sideModal;
  const primarioEfectivo: Action = abreCreate
    ? {
        ...primaryAction,
        to: undefined,
        onClick: () => {
          primaryAction.onClick?.();
          setDrawer({ mode: 'create', row: null });
        },
      }
    : primaryAction;

  /* --- Acento del hero: token runtime vía style var --- */
  const estiloHero = accentColor
    ? ({ '--av2-hero-accent': accentColor } as CSSProperties)
    : undefined;

  /* --- Spec del drawer abierto --- */
  const specDrawer = sideModal && drawer ? sideModal(drawer) : null;

  return (
    <div className="av2-page" data-module={moduleKey}>
      {/* 1. ModuleHero = SemanticHero existente. Los números viven acá
          (stat strip en `hero.kpis`) — nada de KPIs sueltos arriba. */}
      <div className="av2-hero-wrap" style={estiloHero}>
        <SemanticHero
          etiqueta={hero.etiqueta}
          frases={hero.frases}
          kpis={hero.kpis}
          className={hero.className ? `av2-hero ${hero.className}` : 'av2-hero'}
        />
      </div>

      {/* 2. ListToolbar */}
      <ListToolbar
        title={title}
        totalCount={totalCount}
        searchPlaceholder={searchPlaceholder}
        search={search}
        onSearchChange={onSearchChange}
        views={views}
        activeView={activeView}
        onViewChange={onViewChange}
        secondaryAction={secondaryAction}
        primaryAction={primarioEfectivo}
      />

      {/* 3. FilterBar */}
      <FilterBar
        selects={selects}
        period={period}
        onPeriodChange={onPeriodChange}
        statusTabs={statusTabs}
        activeStatus={activeStatus}
        onStatusChange={onStatusChange}
        filterSummary={filterSummary}
      />

      {/* 4. DataTable */}
      <DataTable<Row>
        kind={kind}
        columns={columns}
        groupBy={groupBy}
        showGroupSubtotal={showGroupSubtotal}
        rows={rows}
        groups={groups}
        rowKey={rowKey}
        rowActions={rowActions}
        onRowClick={filaClickeable ? manejarFila : undefined}
        footer={footer}
      />

      {/* 5. SideModal (si la página delegó el estado en el orquestador) */}
      {specDrawer && <SideModal {...specDrawer} open onClose={cerrarDrawer} />}
    </div>
  );
}

export default SemanticAbmPage;
