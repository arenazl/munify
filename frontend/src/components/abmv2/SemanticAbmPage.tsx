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
import type { CSSProperties, ReactNode } from 'react';
import { SemanticHero } from '../ui/SemanticHero';
import { PageHeader } from './PageHeader';
import { ListToolbar } from './ListToolbar';
import { FilterBar } from './FilterBar';
import { DataTable } from './DataTable';
import { CardGrid } from './CardGrid';
import { ListaDeFichas } from './FichaRegistro';
import { HintBanner } from './HintBanner';
import { SideModal } from './SideModal';
import { useEmbed } from './useEmbed';
import type { SideModalComponentProps } from './SideModal';
import type {
  Action,
  CardItem,
  ChipTone,
  ColumnSpec,
  SemanticAbmPageProps,
  ViewKind,
} from './types';
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
 * [v3] Built-ins del estándar (espec del dueño, 2026-09-02)
 * ============================================================ */

/** Las tres vistas del estándar. Se heredan SIN declararlas cuando la página
 *  trae `roles` (el kit sabe dibujar cards y guiada desde los roles) o el
 *  slot correspondiente. Declarar `views` es la excepción, no el default. */
const VISTAS_ESTANDAR: ViewKind[] = ['table', 'cards', 'guided'];

const TONOS_CHIP: readonly ChipTone[] = ['blue', 'amber', 'green', 'gray', 'red'];

/** El tono del rol `state` viene tipado laxo (string del dominio): acá se
 *  normaliza a la escala del kit — desconocido ⇒ gris, nunca un color inventado. */
function aTonoChip(tono?: string): ChipTone {
  return TONOS_CHIP.includes(tono as ChipTone) ? (tono as ChipTone) : 'gray';
}

/** Columna de acciones que el orquestador GARANTIZA cuando hay `rowActions` y
 *  la página no la declaró: sin esto cada agente la maquetaba distinto (o la
 *  olvidaba) y los botones quedaban sin header, cortados contra el borde. */
const COLUMNA_ACCIONES: ColumnSpec<unknown> = {
  id: '__acciones',
  header: 'Acciones',
  width: 'minmax(76px, 0.5fr)',
  align: 'right',
  kind: 'actions',
};

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
    roles,
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

  /* --- [v3] Vistas efectivas: las 3 del estándar salen built-in.
         Sin `views` declaradas, se ofrecen 'table' siempre y 'cards'/'guided'
         cuando el kit puede dibujarlas (roles declarados o slot de la página).
         Declarar `views` sigue valiendo como excepción explícita. --- */
  const puedeDibujar = (v: ViewKind) => (!!viewSlots && v in viewSlots) || !!roles;
  const viewsEfectivas: ViewKind[] =
    views ?? VISTAS_ESTANDAR.filter((v) => v === 'table' || puedeDibujar(v));

  /* --- [v3] Columna de acciones GARANTIZADA (ver COLUMNA_ACCIONES). --- */
  const columnasEfectivas: ColumnSpec<Row>[] =
    rowActions.length > 0 && !columns.some((c) => c.kind === 'actions')
      ? [...columns, COLUMNA_ACCIONES as ColumnSpec<Row>]
      : columns;

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
    /* [v3] El estándar del hero grande es la strip de CINCO KPIs con
       veredicto (referencia: Trámites/Gastos). Menos que eso es una pantalla
       que salió degradada sin que nadie lo note — se avisa, no se rompe. */
    if (hero?.kpis && hero.kpis.length > 0 && hero.kpis.length !== 5) {
      console.warn(
        `SemanticAbmPage[${moduleKey}]: el hero declara ${hero.kpis.length} KPIs — ` +
          'el estándar es la strip de 5 (cada uno con su leyenda). Ver Trámites/Gastos.',
      );
    }
    /* [v3] Sin roles ni slots, cards/guided no existen y la pantalla queda
       de una sola vista: casi siempre es un agente que no declaró `roles`. */
    if (!roles && !views && !viewSlots) {
      console.warn(
        `SemanticAbmPage[${moduleKey}]: sin \`roles\` (ni views/viewSlots) la página ` +
          'queda SOLO con la tabla. Declará RolesSemanticos y heredás cards + guiada ' +
          'built-in (y la ficha mobile). Ver types.ts § RolesSemanticos.',
      );
    }
    if (views && views.length < VISTAS_ESTANDAR.length) {
      console.warn(
        `SemanticAbmPage[${moduleKey}]: \`views\` declara ${views.length} vista(s) — ` +
          'el estándar trae las 3 sin declararlas (con `roles`). Declarar menos es ' +
          'la excepción, no el default.',
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

  /* --- [v3] Filas planas para las vistas autogeneradas (cards/guiada):
         si la página mandó grupos precomputados, se aplanan — las vistas
         alternativas reagrupan por su propio criterio. --- */
  const filasPlanas = groups?.length ? groups.flatMap((g) => g.rows) : rows;

  /* --- [v3] Una fila → una tarjeta, derivada de los ROLES (un set de datos,
         un solo dibujante: mismo icono, misma segunda línea, misma píldora
         que la ficha mobile). Solo se usa cuando hay `roles`. --- */
  const cardDesdeRoles = (row: Row): CardItem => {
    const tax = roles?.taxonomy?.(row);
    const st = roles?.state?.(row);
    const subLineas = [roles?.actor?.(row), roles?.context?.(row)].filter(Boolean);
    return {
      title: roles!.headline(row),
      subtitle: subLineas.length ? subLineas.join(' · ') : tax?.label ?? undefined,
      tileColor: tax?.color,
      chip: st ? { label: st.label, tone: aTonoChip(st.tono) } : undefined,
    };
  };

  /* --- [v3] Vista GUIADA autogenerada: las fichas agrupadas por el rol
         `state`, en el orden de los statusTabs (los labels que no matchean
         van al final, en orden de aparición — graceful, nunca se pierden). --- */
  const gruposGuiada = (): Array<{ titulo: string | null; filas: Row[] }> => {
    if (!roles?.state) return [{ titulo: null, filas: filasPlanas }];
    const porEstado = new Map<string, Row[]>();
    for (const row of filasPlanas) {
      const etiqueta = roles.state(row)?.label ?? 'Sin estado';
      const lista = porEstado.get(etiqueta);
      if (lista) lista.push(row);
      else porEstado.set(etiqueta, [row]);
    }
    const orden = statusTabs
      .map((t) => t.label)
      .filter((l) => porEstado.has(l));
    const resto = [...porEstado.keys()].filter((l) => !orden.includes(l));
    return [...orden, ...resto].map((titulo) => ({
      titulo: `${titulo} · ${porEstado.get(titulo)!.length}`,
      filas: porEstado.get(titulo)!,
    }));
  };

  /* --- Cuerpo por vista: slot de la página > built-in del kit.
         `in` (y no `?.[activeView] ?? …`) para respetar un slot null
         EXPLÍCITO de la página ("esta vista no lleva cuerpo"). --- */
  const tieneSlot = !!viewSlots && activeView in viewSlots;
  let cuerpo: ReactNode = null;
  if (tieneSlot) {
    cuerpo = viewSlots?.[activeView];
  } else if (activeView === 'table') {
    cuerpo = (
      <DataTable<Row>
        kind={kind}
        columns={columnasEfectivas}
        roles={roles}
        groupBy={groupBy}
        showGroupSubtotal={showGroupSubtotal}
        rows={rows}
        groups={groups}
        rowKey={rowKey}
        rowActions={rowActions}
        onRowClick={filaClickeable ? manejarFila : undefined}
        /* [v3] En vista tabla los tabs de estado viven ACÁ, subrayados en el
           tope de la tarjeta (patrón Trámites/Reclamos) — no en la FilterBar. */
        statusTabs={statusTabs}
        activeStatus={activeStatus}
        onStatusChange={onStatusChange}
        footer={footer}
        loading={loading}
        emptyMessage={emptyMessage}
        reorder={reorder}
      />
    );
  } else if (activeView === 'cards' && roles) {
    /* [v3] Vista 'cards' built-in desde los roles — la página no la arma. */
    cuerpo = (
      <CardGrid<Row>
        rows={filasPlanas}
        rowKey={(row) => rowKey(row)}
        card={cardDesdeRoles}
        actions={rowActions}
        onCardClick={filaClickeable ? manejarFila : undefined}
        loading={loading}
        emptyMessage={emptyMessage}
      />
    );
  } else if (activeView === 'guided' && roles) {
    /* [v3] Vista 'guided' built-in: fichas agrupadas por estado. */
    cuerpo = loading ? (
      <div className="av2-skeleton" style={{ minHeight: 220 }} aria-busy />
    ) : (
      <section className="av2-tabla av2-tabla--fichas">
        <ListaDeFichas<Row>
          grupos={gruposGuiada()}
          roles={roles}
          rowKey={rowKey}
          onRowClick={filaClickeable ? manejarFila : undefined}
          vacio={emptyMessage}
        />
      </section>
    );
  } else if (loading) {
    /* Mientras `loading`, que el slot todavía no exista es normal (la página
       lo monta recién con datos): ni warning ni cuerpo vacío — esqueleto. */
    cuerpo = <div className="av2-skeleton" style={{ minHeight: 220 }} aria-busy />;
  } else if (import.meta.env.DEV) {
    console.warn(
      `SemanticAbmPage[${moduleKey}]: la vista '${activeView}' no tiene slot ni ` +
        'roles para autogenerarse — el cuerpo queda vacío. Declará `roles` ' +
        '(cards/guided built-in) o el slot en `viewSlots`.',
    );
  }

  /* --- [v2.1] Ancho runtime del aside vía style var (default en CSS). --- */
  const estiloAside = aside?.width
    ? ({ '--av2-aside-w': `${aside.width}px` } as CSSProperties)
    : undefined;

  /* --- Spec del drawer abierto --- */
  const specDrawer = sideModal && drawer ? sideModal(drawer) : null;

  return (
    <div className={`av2-page ${embebida ? 'av2-page--embebida' : ''}`} data-module={moduleKey}>
      {/* 0. [v3] PISTA en el segmento de ayudas: ARRIBA DE TODO, cerrable con
          la cruz y persistida por módulo. Ya no vive entre el hero y los
          controles (dueño, 2026-09-02). */}
      {pista && (
        <HintBanner
          storageKey={moduleKey}
          titulo={pista.titulo}
          texto={pista.texto}
          accion={pista.accion}
        />
      )}

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

      {/* 3+4. Toolbar y filtros: UNA sola tarjeta partida por una línea. */}
      <div className="av2-controles">
        <ListToolbar
          searchPlaceholder={searchPlaceholder}
          search={search}
          onSearchChange={onSearchChange}
          views={viewsEfectivas}
          activeView={activeView}
          onViewChange={onViewChange}
          secondaryAction={secondaryAction}
          primaryAction={primarioEfectivo}
          steps={steps}
        />

        {/* [v3] En vista TABLA los tabs de estado se mudan al tope de la
            tarjeta de la tabla (patrón Trámites/Reclamos, canvas v2.3) — acá
            quedarían dobles. En cards/guiada siguen acá como segmented. */}
        <FilterBar
          selects={selects}
          period={period}
          onPeriodChange={onPeriodChange}
          statusTabs={activeView === 'table' && !tieneSlot ? [] : statusTabs}
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
