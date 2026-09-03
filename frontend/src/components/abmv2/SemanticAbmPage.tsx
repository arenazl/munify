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
import { TarjetaRegistro } from './TarjetaRegistro';
import { VistaEnfoque } from './VistaEnfoque';
import { HintBanner } from './HintBanner';
/* [v3] Pieza visual aún en ui/ — contrato de datos ya estable en types.ts;
   la migración estética a la suite v2 es una pasada posterior. */
import { DashboardIAPanel } from '../ui/DashboardIAPanel';
import { SideModal } from './SideModal';
import { useEmbed } from './useEmbed';
import { usePantallaCompleta } from './usePantallaCompleta';
import type { SideModalComponentProps } from './SideModal';
import type {
  Action,
  ColumnSpec,
  EnfoqueSpec,
  SemanticAbmPageProps,
  TableGroup,
  ViewKind,
} from './types';
import type { Veredicto } from '../../lib/semanticHero';
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

/** Tono de chip → veredicto, para el fallback de la vista enfoque cuando la
 *  página no declaró secciones: rojo exige, ámbar avisa, verde celebra. */
function tonoAVeredicto(tono?: string): Veredicto | undefined {
  if (tono === 'red') return 'malo';
  if (tono === 'amber') return 'advertencia';
  if (tono === 'green') return 'bueno';
  return undefined;
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
    groupAction,
    secondaryAction,
    primaryAction,
    steps,
    /* filtros */
    selects,
    period,
    statusTabs,
    sortSpec,
    groupSpec,
    filterSummary,
    /* cuerpo */
    viewSlots,
    aside,
    enfoque,
    ia,
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
    /* [v3.3] solapas, pantalla completa, sugerencias, orden por cabecera */
    viewLabels,
    pantallaCompleta,
    searchSuggestions,
    sort,
    onSortChange,
    defaultSort,
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

  /* [v3] Filtro AUTODERIVADO de taxonomía (cuando la página no declara
     selects) y ancho del aside de IA — estado interno del orquestador. */
  const [filtroTaxonomia, setFiltroTaxonomia] = useState('');
  const [iaColapsada, setIaColapsada] = useState(true);

  /* [v3.3] Pantalla completa del BLOQUE controles + cuerpo (ver el hook).
     Siempre se llama (orden de hooks); sólo se cablea si la página declaró
     `pantallaCompleta` y la vista activa está en la lista. */
  const {
    ref: refCompleta,
    activa: completaActiva,
    alternar: alternarCompleta,
    clase: claseCompleta,
  } = usePantallaCompleta<HTMLDivElement>();
  const ofreceCompleta = !!pantallaCompleta && pantallaCompleta.includes(activeView);

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
    /* Sólo tiene sentido avisar cuando el kit PODRÍA dibujar las otras
       (hay roles): sin roles, una pantalla de dos vistas declaradas (tabla +
       mapa, por caso) no está degradada — es lo que es. */
    if (views && roles && views.length < VISTAS_ESTANDAR.length) {
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

  /* --- [v3] FILTROS AUTODERIVADOS: sin `selects` declarados, el kit arma el
         combo/píldoras de TIPO desde roles.taxonomy (opciones únicas sobre el
         universo SIN filtrar) y filtra las filas él mismo, en TODAS las
         vistas. Declarar `selects` anula la autoderivación. --- */
  const filasTodas = groups?.length ? groups.flatMap((g) => g.rows) : rows;
  const autoFiltrar = (!selects || selects.length === 0) && !!roles?.taxonomy;
  const opcionesTaxonomia = (() => {
    if (!autoFiltrar) return [] as Array<{ label: string; color?: string }>;
    const vistos = new Map<string, string | undefined>();
    for (const r of filasTodas) {
      const t = roles!.taxonomy!(r);
      const label = t?.label ?? 'Sin tipo';
      if (!vistos.has(label)) vistos.set(label, t?.color);
    }
    return [...vistos.entries()].map(([label, color]) => ({ label, color }));
  })();
  const selectsEfectivos =
    autoFiltrar && opcionesTaxonomia.length > 1
      ? [
          {
            id: '__tipo',
            label: 'Tipo',
            value: filtroTaxonomia,
            options: [
              { value: '', label: 'Todos' },
              /* El color viaja con la opción: el SelectorAdaptativo lo pone
                 en el PUNTO de la píldora (criterio único v3.1). */
              ...opcionesTaxonomia.map((o) => ({ value: o.label, label: o.label, color: o.color })),
            ],
            onChange: setFiltroTaxonomia,
          },
        ]
      : selects ?? [];
  const pasaFiltro = (row: Row) =>
    !filtroTaxonomia || (roles?.taxonomy?.(row)?.label ?? 'Sin tipo') === filtroTaxonomia;
  const filtrando = autoFiltrar && !!filtroTaxonomia;
  const rowsVisibles = filtrando ? rows.filter(pasaFiltro) : rows;
  const groupsVisibles =
    filtrando && groups
      ? groups.map((g) => ({ ...g, rows: g.rows.filter(pasaFiltro) })).filter((g) => g.rows.length)
      : groups;

  /* --- [v3] Filas planas para las vistas autogeneradas (cards/enfoque):
         si la página mandó grupos precomputados, se aplanan — las vistas
         alternativas reagrupan por su propio criterio. --- */
  const filasPlanas = groupsVisibles?.length
    ? groupsVisibles.flatMap((g) => g.rows)
    : rowsVisibles;

  /* --- [v3] groupBy 'taxonomy'/'state': el kit AGRUPA SOLO desde los roles
         (la página declara la palabra). Orden de grupos = primera aparición
         en las filas, que la página ya ordenó. --- */
  const gruposAutomaticos = ((): TableGroup<Row>[] | undefined => {
    if ((groupBy !== 'taxonomy' && groupBy !== 'state') || !roles) return undefined;
    const etiquetaDe = (row: Row): { titulo: string; veredicto?: Veredicto; glifo?: TableGroup<Row>['glifo'] } => {
      if (groupBy === 'taxonomy') {
        const t = roles.taxonomy?.(row);
        return {
          titulo: t?.label ?? 'Sin tipo',
          /* [v3.2] La cabecera lleva la insignia del ICONO real de la
             categoría — mismo ritmo que el calendario de la vista por día. */
          glifo: t?.icon ? { icon: t.icon, color: t.color } : { icon: 'Tag' },
        };
      }
      const st = roles.state?.(row);
      return {
        titulo: st?.label ?? 'Sin estado',
        veredicto: tonoAVeredicto(st?.tono),
        glifo: { icon: 'CircleDot' },
      };
    };
    const mapa = new Map<string, TableGroup<Row>>();
    for (const row of filasPlanas) {
      const { titulo, veredicto, glifo } = etiquetaDe(row);
      let g = mapa.get(titulo);
      if (!g) {
        g = { key: titulo, title: titulo, label: '', veredicto, glifo, rows: [] };
        mapa.set(titulo, g);
      }
      g.rows.push(row);
    }
    const lista = [...mapa.values()];
    for (const g of lista) {
      const n = g.rows.length;
      g.label = `${n.toLocaleString('es-AR')} ${n === 1 ? 'registro' : 'registros'}`;
    }
    return lista;
  })();
  const gruposBase = gruposAutomaticos ?? groupsVisibles;
  /* [v3] Acción por grupo: el kit computó los grupos, la página decide qué
     acción lleva cada cabecera ("Eliminar estas 12"). */
  const gruposTabla =
    groupAction && gruposBase
      ? gruposBase.map((g) => ({ ...g, action: g.action ?? groupAction(g) ?? undefined }))
      : gruposBase;

  /* --- [v3] Vista ENFOQUE: secciones declaradas por la página o, sin
         declarar, derivadas del rol `state` (una sección por estado presente,
         teñida por su tono). El fallback mantiene la vista viva; la versión
         curada es declarar `enfoque` con frases y CTAs. --- */
  const enfoqueEfectivo = ((): EnfoqueSpec<Row> | null => {
    if (enfoque) return enfoque;
    if (!roles?.state) return null;
    const vistos = new Map<string, Veredicto | undefined>();
    for (const row of filasPlanas) {
      const st = roles.state(row);
      const label = st?.label ?? 'Sin estado';
      if (!vistos.has(label)) vistos.set(label, tonoAVeredicto(st?.tono));
    }
    return {
      secciones: [...vistos.entries()].map(([label, veredicto]) => ({
        id: label,
        titulo: label,
        veredicto,
        match: (row: Row) => (roles.state?.(row)?.label ?? 'Sin estado') === label,
      })),
    };
  })();

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
        rows={rowsVisibles}
        groups={gruposTabla}
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
        sort={sort}
        onSortChange={onSortChange}
        defaultSort={defaultSort}
      />
    );
  } else if (loading) {
    /* Cards/enfoque mientras carga: esqueleto, nunca un falso vacío. */
    cuerpo = <div className="av2-skeleton" style={{ minHeight: 220 }} aria-busy />;
  } else if (activeView === 'cards' && roles) {
    /* [v3] Vista 'cards' built-in: las BOARDS curadas (TarjetaRegistro) —
       tile de categoría, píldoras, veredicto en el borde. La página no arma
       tarjetas: declara roles. */
    cuerpo =
      filasPlanas.length === 0 ? (
        <div className="av2-fichas-vacio">{emptyMessage || 'No hay registros para mostrar.'}</div>
      ) : (
        <div className="av2-cards-ricas">
          {filasPlanas.map((fila, i) => (
            <TarjetaRegistro<Row>
              key={rowKey(fila, i)}
              fila={fila}
              roles={roles}
              onClick={filaClickeable ? manejarFila : undefined}
            />
          ))}
        </div>
      );
  } else if (activeView === 'guided' && roles && enfoqueEfectivo) {
    /* [v3] Vista 'guided' built-in: la VISTA ENFOQUE curada (secciones por
       veredicto, saludo, chips, CTA) — declarada en `enfoque` o derivada. */
    cuerpo = (
      <VistaEnfoque<Row>
        enfoque={enfoqueEfectivo}
        roles={roles}
        rows={filasPlanas}
        rowKey={rowKey}
        onRowClick={filaClickeable ? manejarFila : undefined}
        emptyMessage={emptyMessage}
      />
    );
  } else if (import.meta.env.DEV) {
    console.warn(
      `SemanticAbmPage[${moduleKey}]: la vista '${activeView}' no tiene slot ni ` +
        'roles para autogenerarse — el cuerpo queda vacío. Declará `roles` ' +
        '(cards/enfoque built-in) o el slot en `viewSlots`.',
    );
  }
  /* [v3] Cambio de vista con animación: el key remonta el wrapper y el cuerpo
     entra con fade+slide (respetando prefers-reduced-motion por CSS). */
  cuerpo = (
    <div key={activeView} className="av2-cuerpo-anim">
      {cuerpo}
    </div>
  );

  /* --- [v3] IA CONTEXTUAL: con `ia` (y sin `aside` propio) el orquestador
         monta el panel operativo como aside colapsable — el panel persiste su
         colapso solo (localStorage) y acá solo se ajusta el ancho. --- */
  const asideEfectivo =
    aside ??
    (ia
      ? {
          content: (
            <DashboardIAPanel
              data={ia.data}
              loading={ia.loading}
              title={ia.title}
              onTipClick={ia.onTipClick}
              onCollapsedChange={setIaColapsada}
            />
          ),
          width: iaColapsada ? 52 : 300,
        }
      : undefined);

  /* --- [v2.1] Ancho runtime del aside vía style var (default en CSS). --- */
  const estiloAside = asideEfectivo?.width
    ? ({ '--av2-aside-w': `${asideEfectivo.width}px` } as CSSProperties)
    : undefined;

  /* --- Spec del drawer abierto --- */
  const specDrawer = sideModal && drawer ? sideModal(drawer) : null;

  /* --- 3+4. Toolbar y filtros: UNA sola tarjeta partida por una línea. --- */
  const controles = (
    <div className="av2-controles">
      <ListToolbar
        searchPlaceholder={searchPlaceholder}
        search={search}
        onSearchChange={onSearchChange}
        views={viewsEfectivas}
        activeView={activeView}
        onViewChange={onViewChange}
        /* [v3.2] Orden (botón ciclador) y agrupamiento viven en la PRIMERA
           línea; abajo quedan solo los filtros. */
        sortSpec={sortSpec}
        groupSpec={groupSpec}
        secondaryAction={secondaryAction}
        primaryAction={primarioEfectivo}
        steps={steps}
        viewLabels={viewLabels}
        searchSuggestions={searchSuggestions}
        pantallaCompleta={
          ofreceCompleta ? { activa: completaActiva, onToggle: alternarCompleta } : undefined
        }
      />

      {/* [v3] En vista TABLA los tabs de estado se mudan al tope de la
          tarjeta de la tabla (patrón Trámites/Reclamos, canvas v2.3) — acá
          quedarían dobles. En cards/guiada siguen acá como segmented. */}
      <FilterBar
        selects={selectsEfectivos}
        period={period}
        onPeriodChange={onPeriodChange}
        statusTabs={activeView === 'table' && !tieneSlot ? [] : statusTabs}
        activeStatus={activeStatus}
        onStatusChange={onStatusChange}
        filterSummary={filterSummary}
      />
    </div>
  );

  /* --- 5. Cuerpo: slot de la vista activa o DataTable estándar. Con `aside`
         se envuelve en el flex .av2-body (panel sticky a la derecha); sin él,
         cuerpo directo — DOM idéntico al previo a v2.1. --- */
  const cuerpoConAside = asideEfectivo ? (
    <div className="av2-body">
      <div className="av2-body-main">{cuerpo}</div>
      <aside className="av2-aside" style={estiloAside}>
        {asideEfectivo.content}
      </aside>
    </div>
  ) : (
    cuerpo
  );

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

      {/* 3+4+5. Controles y cuerpo. [v3.3] Con `pantallaCompleta` declarada
          van adentro del bloque maximizable (`.av2-mapa-full`, que en reposo
          es display: contents y no genera caja); sin ella, sueltos como
          siempre. Lo que se maximiza es el bloque ENTERO —filtros y cuerpo—,
          nunca el cuerpo solo. */}
      {pantallaCompleta ? (
        <div ref={refCompleta} className={claseCompleta}>
          {controles}
          {cuerpoConAside}
        </div>
      ) : (
        <>
          {controles}
          {cuerpoConAside}
        </>
      )}

      {/* 6. SideModal (si la página delegó el estado en el orquestador) */}
      {specDrawer && <SideModal {...specDrawer} open onClose={cerrarDrawer} />}
    </div>
  );
}

export default SemanticAbmPage;
