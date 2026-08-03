/**
 * SemanticAbmPage — orquestador del estándar de páginas ABM (rediseño v2).
 *
 * Compone, en el ORDEN ESTÁNDAR (design/handoff-v2/STANDARD-SemanticAbmPage.md
 * + referencia nueva references/reclamos-lista-v2.dc.html):
 *
 *   <PageHeader>     ← [v2.2] eyebrow + H1 34px + bajada (cabecera de módulo)
 *   <SemanticHero>   ← el ModuleHero ES el SemanticHero existente (ui/SemanticHero)
 *   <ListToolbar>    ← buscador + vistas + steps + secundario + CTA (SIN H1)
 *   <FilterBar>      ← selects + PeriodControl + segmented de estados + resumen
 *   <cuerpo>         ← slot de la vista activa (viewSlots) o DataTable estándar
 *   <SideModal>      ← drawer derecho (detalle de la fila / alta)
 *
 * [v2.2] El cambio de fondo respecto de v2.1: el título del módulo estaba
 * DENTRO de la toolbar y por lo tanto ABAJO del hero, pegado al buscador. Se
 * extrajo a `PageHeader` y ahora encabeza la página. Toolbar y FilterBar
 * quedan envueltas en `.av2-controles`: se ven como UNA tarjeta partida por
 * una línea (la toolbar redondea arriba; si la FilterBar no renderiza nada,
 * el CSS le devuelve las 4 esquinas a la toolbar).
 *
 * El TopBar sticky NO es de este componente: lo pone el layout shell de la app.
 *
 * [v2.1] Backlog agnóstico de los pilotos (ver types.ts, cada prop documenta
 * su porqué):
 *  - `viewSlots`: cuerpo alternativo por vista. Si la vista activa tiene slot
 *    (aunque sea null explícito), se renderiza ESE nodo como cuerpo — hero,
 *    toolbar, filtros y drawer quedan intactos. Sin slot: 'table' cae al
 *    DataTable estándar; las demás vistas no renderizan cuerpo (en dev se
 *    avisa por consola para no dejar un hueco silencioso).
 *  - `aside`: panel lateral sticky a la derecha del cuerpo (.av2-body flex +
 *    .av2-aside sticky bajo el TopBar; en viewports angostos cae debajo).
 *    El ancho runtime va por style var --av2-aside-w (default ~320 en CSS).
 *    Sin `aside` NO se agrega wrapper: el cuerpo se renderiza directo (DOM
 *    idéntico al de las páginas existentes).
 *  - `primaryAction` OPCIONAL: sin CTA la toolbar no renderiza botón primario.
 *  - `steps` / `sortSpec` / `loading` / `emptyMessage`: pass-through a
 *    ListToolbar / FilterBar / DataTable respectivamente.
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
 * Polimórfico: clases av2-* (styles/abmv2.css, secciones [PAGE] y [PAGE v2.1])
 * sobre tokens --pl-*. Inline SOLO valores runtime: el acento del hero
 * (--av2-hero-accent) y el ancho del aside (--av2-aside-w).
 */
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { SemanticHero } from '../ui/SemanticHero';
import { PageHeader } from './PageHeader';
import { ListToolbar } from './ListToolbar';
import { FilterBar } from './FilterBar';
import { DataTable } from './DataTable';
import { SideModal } from './SideModal';
import { useEmbed } from './useEmbed';
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
  /**
   * [v2.4] Modo EMBEBIDO: la pieza entra dentro de otra pantalla (hoy el
   * panel del `SettingsShell`) y por eso NO dibuja su `PageHeader` — el
   * título ya lo puso el contenedor y dos H1 seguidos es ruido.
   *
   * Es exactamente lo que pide la nota del canvas: "entra la misma pieza que
   * Gastos o Liquidaciones, pero pelada: el título lo pone esta pantalla, no
   * el componente".
   *
   * Aditivo: sin la prop, todas las pantallas existentes renderizan igual.
   */
  embedded?: boolean;
}

/* ============================================================
 * SemanticAbmPage
 * ============================================================ */

export function SemanticAbmPage<Row>(props: SemanticAbmPageComponentProps<Row>) {
  const {
    /* identidad */
    moduleKey,
    eyebrow,
    title,
    description,
    hero,
    pista,
    accentColor,
    /* toolbar */
    searchPlaceholder,
    views,
    secondaryAction,
    primaryAction,
    steps,
    /* filtros */
    selects,
    period,
    statusTabs,
    sortSpec,
    filterSummary,
    /* cuerpo */
    viewSlots,
    aside,
    /* tabla */
    kind,
    columns,
    groupBy,
    showGroupSubtotal,
    rows,
    groups,
    rowActions,
    footer,
    loading,
    emptyMessage,
    reorder,
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
    embedded = false,
  } = props;

  // Embebida (panel del SettingsShell): sin PageHeader y publicando su total.
  const embedCtx = useEmbed();
  const embebida = embedded || embedCtx.embedded;
  const { slotId, reportarTotal } = embedCtx;
  // El total sale del tab "Todos" (que ya lo calcula la página) o, en su
  // defecto, de las filas cargadas. Si no hay ninguno, no se reporta nada:
  // el riel prefiere no mostrar número antes que mostrar uno inventado.
  const totalReportable =
    statusTabs?.find(t => t.id === 'todos')?.count
    ?? (groups ? groups.reduce((acc, g) => acc + g.rows.length, 0) : rows?.length);
  useEffect(() => {
    if (slotId && reportarTotal && typeof totalReportable === 'number') {
      reportarTotal(slotId, totalReportable);
    }
  }, [slotId, reportarTotal, totalReportable]);

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
    if (primaryOpensCreate && !primaryAction) {
      console.warn(
        `SemanticAbmPage[${moduleKey}]: primaryOpensCreate sin \`primaryAction\` — ` +
          'no hay CTA que abra el create (el CTA es opcional desde v2.1).',
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

  /* --- CTA primario: puede abrir el create del drawer.
         [v2.1] `primaryAction` es opcional — sin CTA no hay nada que envolver
         y la toolbar no renderiza botón primario. --- */
  const abreCreate = primaryOpensCreate && !!sideModal;
  const primarioEfectivo: Action | undefined =
    primaryAction && abreCreate
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

  /* --- [v2.1] Cuerpo por vista: slot de la vista activa o DataTable.
         `in` (y no `?.[activeView] ?? …`) para respetar un slot null
         EXPLÍCITO de la página ("esta vista no lleva cuerpo"). --- */
  const tieneSlot = !!viewSlots && activeView in viewSlots;
  if (import.meta.env.DEV && !tieneSlot && activeView !== 'table') {
    console.warn(
      `SemanticAbmPage[${moduleKey}]: la vista '${activeView}' no tiene slot en ` +
        "`viewSlots` y solo 'table' cae al DataTable estándar — el cuerpo queda vacío.",
    );
  }
  const cuerpo = tieneSlot ? (
    viewSlots?.[activeView]
  ) : activeView === 'table' ? (
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
      loading={loading}
      emptyMessage={emptyMessage}
      reorder={reorder}
    />
  ) : null;

  /* --- [v2.1] Ancho runtime del aside vía style var (default en CSS). --- */
  const estiloAside = aside?.width
    ? ({ '--av2-aside-w': `${aside.width}px` } as CSSProperties)
    : undefined;

  /* --- Spec del drawer abierto --- */
  const specDrawer = sideModal && drawer ? sideModal(drawer) : null;

  return (
    <div className={`av2-page ${embebida ? 'av2-page--embebida' : ''}`} data-module={moduleKey}>
      {/* 1. [v2.2] Cabecera de módulo: lo PRIMERO que se lee de la pantalla.
          [v2.4] En modo embebido no va: el título lo puso el contenedor. */}
      {!embebida && <PageHeader eyebrow={eyebrow} title={title} description={description} />}

      {/* 2. ModuleHero = SemanticHero existente. Los números viven acá
          (stat strip en `hero.kpis`) — nada de KPIs sueltos arriba.
          [v2.5] Opcional: un catálogo simple no tiene veredicto que contar
          (ver SemanticAbmPageProps.hero). Sin él la página arranca en la
          toolbar. */}
      {hero && (
        <div className="av2-hero-wrap" style={estiloHero}>
          <SemanticHero
            etiqueta={hero.etiqueta}
            frases={hero.frases}
            kpis={hero.kpis}
            className={hero.className ? `av2-hero ${hero.className}` : 'av2-hero'}
          />
        </div>
      )}

      {/* 2-bis. [v2.5] PISTA: cómo FUNCIONA la cosa (regla que no cambia),
          debajo del hero que dice cómo VIENE (números de hoy). Sin números
          adentro: una pista con cifras envejece sin que nadie la actualice. */}
      {pista && (
        <div className="av2-nota av2-nota--ok av2-nota--con-accion">
          <Sparkles className="av2-nota-ico" aria-hidden />
          <span className="av2-nota-txt">
            <span className="av2-nota-eyebrow">{pista.titulo}</span>
            {pista.texto}
          </span>
          {pista.accion &&
            (pista.accion.to ? (
              <Link className="av2-btn-secundario" to={pista.accion.to}>
                {pista.accion.label}
                <ArrowRight size={15} strokeWidth={2} />
              </Link>
            ) : (
              <button type="button" className="av2-btn-secundario" onClick={pista.accion.onClick}>
                {pista.accion.label}
                <ArrowRight size={15} strokeWidth={2} />
              </button>
            ))}
        </div>
      )}

      {/* 3+4. Toolbar y filtros: UNA sola tarjeta partida por una línea. */}
      <div className="av2-controles">
        <ListToolbar
          searchPlaceholder={searchPlaceholder}
          search={search}
          onSearchChange={onSearchChange}
          views={views}
          activeView={activeView}
          onViewChange={onViewChange}
          secondaryAction={secondaryAction}
          primaryAction={primarioEfectivo}
          steps={steps}
        />

        <FilterBar
          selects={selects}
          period={period}
          onPeriodChange={onPeriodChange}
          statusTabs={statusTabs}
          activeStatus={activeStatus}
          onStatusChange={onStatusChange}
          sortSpec={sortSpec}
          filterSummary={filterSummary}
        />
      </div>

      {/* 5. Cuerpo: slot de la vista activa o DataTable estándar. Con `aside`
          se envuelve en el flex .av2-body (panel sticky a la derecha); sin él,
          cuerpo directo — DOM idéntico al previo a v2.1. */}
      {aside ? (
        <div className="av2-body">
          <div className="av2-body-main">{cuerpo}</div>
          <aside className="av2-aside" style={estiloAside}>
            {aside.content}
          </aside>
        </div>
      ) : (
        cuerpo
      )}

      {/* 6. SideModal (si la página delegó el estado en el orquestador) */}
      {specDrawer && <SideModal {...specDrawer} open onClose={cerrarDrawer} />}
    </div>
  );
}

export default SemanticAbmPage;
