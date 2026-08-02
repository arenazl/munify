/**
 * abmv2/types.ts — Contratos TypeScript del estándar `SemanticAbmPage` (rediseño v2).
 *
 * Fuente de verdad: design/handoff-v2/STANDARD-SemanticAbmPage.md y
 * design/handoff-v2/STANDARD-Variaciones-por-props.md. Los nombres de props
 * RESPETAN el estándar; los campos extra (callbacks controlados, `open`,
 * `onClose`, `rowKey`…) son extensiones de implementación necesarias para que
 * los componentes sean presentacionales (datos y callbacks por props).
 *
 * El ModuleHero ES el SemanticHero existente: acá solo se tipa su contrato
 * reutilizando HeroFrase/HeroKpi de lib/semanticHero — NO se duplica el
 * componente.
 *
 * Regla polimórfica: ningún tipo acepta colores literales; donde hay color
 * (accentColor, tonos de chip) se usan tokens `--pl-*` o tonos semánticos.
 *
 * [v2.1] Upgrade con el backlog AGNÓSTICO que reportaron los pilotos
 * (Reclamos, Personal/Empleados, Tesorería/Gastos): TODOS los agregados son
 * opcionales y aditivos — ninguna página existente necesita tocarse. Cada
 * agregado documenta el porqué con referencia al piloto que lo pidió.
 * Única excepción semántica: `primaryAction` pasa a opcional (ver su doc).
 *
 * [v2.2] La referencia NUEVA de Reclamos
 * (design/handoff-v2/references/reclamos-lista-v2.dc.html) se adoptó como
 * estándar de TODOS los ABMs y mueve el encabezado de la página:
 *  - Aparece la CABECERA DE MÓDULO (`PageHeaderProps`: eyebrow + H1 34px +
 *    bajada) como PRIMER bloque de la página, arriba del hero.
 *  - En consecuencia el `ListToolbar` PIERDE su H1 y su chip de total: la
 *    toolbar es solo buscador + vistas + orden + CTA. El total ya lo dicen
 *    los `statusTabs` ("Todos 49") y el pie de la tabla ("Mostrando 50 de
 *    50"), así que `totalCount` desaparece del contrato en vez de quedar
 *    como prop muerta.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { HeroFrase, HeroKpi } from '../../lib/semanticHero';

/* ============================================================
 * Básicos compartidos
 * ============================================================ */

/**
 * Variante de lista. Define columnas, agrupado y pie (ver tabla del estándar):
 * - 'plain'    → Reclamos, Personal, Inventario, Trámites (sin dinero).
 * - 'money'    → Gastos, Cobros, Liquidaciones (columna MONTO al final,
 *                subtotal por grupo, gran total en el pie, `period` obligatorio).
 * - 'schedule' → Agenda de turnos (groupBy 'hour', cupos, vistas day/week).
 * - 'board'    → Planificación. **PENDIENTE: NO se implementa en esta fase.**
 *                Queda tipado para reservar el contrato; la grilla recurso × día
 *                (celdas de carga, tareas arrastrables, bandeja "Sin asignar")
 *                se especifica cuando se encare Planificación.
 */
export type ListKind = 'plain' | 'money' | 'schedule' | 'board';

/** Vistas del segmented de la toolbar. 'day'/'week' solo en kind='schedule'. */
export type ViewKind = 'cards' | 'table' | 'guided' | 'day' | 'week';

/** Tonos semánticos de chips/estados (paleta StatusPill del estándar):
 *  azul = recibido/completado · ámbar = en curso/pendiente ·
 *  verde = al día/finalizado · gris = pospuesto/rechazado · rojo = vencido/mora. */
export type ChipTone = 'blue' | 'amber' | 'green' | 'gray' | 'red';

/** Acción genérica (CTAs, botones secundarios, acciones del footer del drawer).
 *  El label nombra el RESULTADO, no el objeto: "Marcar como pagado". */
export interface Action {
  label: string;
  /** Navegación por link (react-router). Excluyente con onClick. */
  to?: string;
  onClick?: () => void;
  /** Icono lucide opcional (trazo 1.8-2). Nunca emojis. */
  icon?: LucideIcon;
  disabled?: boolean;
  /** Regla del estándar: nunca un botón deshabilitado sin decir qué falta. */
  disabledReason?: string;
}

/* ============================================================
 * PageHeader — cabecera de módulo (primer bloque de la página)
 * ============================================================ */

/**
 * [v2.2] Cabecera de módulo del estándar: eyebrow en caps + H1 de 34px +
 * bajada de una o dos líneas. Va ARRIBA DE TODO (antes del hero semántico)
 * porque el título del módulo tiene que leerse primero; en la v2.1 vivía
 * dentro de la toolbar, pegado al buscador, y quedaba enterrado bajo el hero.
 *
 * Agnóstica y sin datos: es COPY del módulo, no números. Los números viven
 * en el hero (frase + stat strip). Regla de escritura del estándar: el H1
 * nombra lo que el usuario viene a resolver ("Todo lo que el vecino pidió y
 * qué falta resolver"), no la entidad de la tabla; el eyebrow sí nombra el
 * módulo ("RECLAMOS") y la bajada explica de dónde salen las filas y cómo
 * está ordenada la lista.
 */
export interface PageHeaderProps {
  /** Eyebrow del módulo. Se pinta en MAYÚSCULAS por CSS: pasar texto natural.
   *  Omitido ⇒ no se renderiza (el H1 sube al tope del bloque). */
  eyebrow?: string;
  /** H1 de la página (display 34px). Único obligatorio. */
  title: string;
  /** Bajada de 1-2 líneas bajo el H1. Omitida ⇒ no se renderiza. */
  description?: string;
}

/* ============================================================
 * Hero (= SemanticHero existente, components/ui/SemanticHero.tsx)
 * ============================================================ */

/** Props del ModuleHero. Espeja el contrato del SemanticHero existente para
 *  poder hacer `<SemanticHero {...hero} />` directo, sin adaptadores.
 *  [v2.2] El hero del estándar es el MISMO componente `ui/SemanticHero` con
 *  la variante visual de la referencia nueva (superficie `--pl-green-050`,
 *  borde de acento de 4px, KPIs separados por hairline verde y hasta 3
 *  acciones, la primera sólida). La variante se activa por la clase de
 *  contexto `av2-hero` que pone el orquestador — no hay un segundo hero. */
export interface ModuleHeroProps {
  /** Eyebrow del hero, en caps: "TESORERÍA · JULIO 2026". Es el PERÍODO/estado
   *  del módulo — distinto del eyebrow de la cabecera, que nombra el módulo. */
  etiqueta: string;
  /** Frases-veredicto (interpretan, no enumeran la stat strip). Cada frase
   *  admite hasta 3 acciones; la marcada `primaria` se pinta sólida. */
  frases: HeroFrase[];
  /** Stat strip DENTRO del hero (nada de KPIs sueltos arriba). */
  kpis?: HeroKpi[];
  className?: string;
}

/* ============================================================
 * Toolbar
 * ============================================================ */

/** [v2.1] Paso de un flujo por etapas en la toolbar (chip numerado). */
export interface ToolbarStep {
  id: string;
  /** Label corto del paso ("Cliente", "Items", "Cobro"). El número lo pinta
   *  el componente por posición (1, 2, 3…) — no viene en datos. */
  label: string;
}

/**
 * [v2.1] Chips numerados de flujo en la toolbar, para pantallas donde la
 * operación primaria es un proceso por etapas y no un alta puntual (flujos
 * tipo Mostrador: 1 Cliente → 2 Items → 3 Cobro). Reemplazan al CTA como
 * indicador de "en qué parte del proceso estoy" sin inventar un wizard modal.
 * Why (pilotos): el estándar solo contemplaba listar + crear por drawer; los
 * flujos de atención en mostrador necesitan el avance visible en la toolbar.
 */
export interface StepsSpec {
  items: ToolbarStep[];
  /** id del ToolbarStep activo (los anteriores se pintan completados). */
  activo: string;
  /** Click en un chip (volver a un paso). Omitido ⇒ chips solo informativos. */
  onStep?: (id: string) => void;
}

/**
 * [v2.2] La toolbar YA NO lleva `title` ni `totalCount`:
 *  - el H1 se mudó a la cabecera de módulo (`PageHeaderProps`), arriba del
 *    hero — tenerlo acá lo dejaba abajo, pegado al buscador;
 *  - el total ya lo dicen el tab "Todos" de los `statusTabs` y el pie de la
 *    tabla, así que el chip era una tercera copia del mismo número.
 * Queda: buscador (flex-grow) + segmented de vistas + steps + secundario +
 * CTA, todo dentro de la MISMA tarjeta que la FilterBar (ver abmv2.css).
 */
export interface ListToolbarProps {
  searchPlaceholder: string;
  /** Valor controlado del buscador. */
  search: string;
  onSearchChange: (query: string) => void;
  /** Vistas disponibles del segmented (orden = orden de render). */
  views: ViewKind[];
  activeView: ViewKind;
  onViewChange: (view: ViewKind) => void;
  /** Botón secundario del módulo ("Proyección", "Pago masivo"…). */
  secondaryAction?: Action;
  /**
   * ÚNICO CTA primario verde de la pantalla ("Nuevo pago").
   * [v2.1] Ahora OPCIONAL: los pilotos reportaron vistas de solo consulta
   * (sin alta desde la pantalla) donde el CTA obligatorio forzaba un botón
   * artificial. Sin `primaryAction`, la toolbar simplemente no lo renderiza
   * — sigue valiendo la regla "como máximo UN primario por pantalla".
   */
  primaryAction?: Action;
  /** [v2.1] Chips numerados de flujo (ver StepsSpec). Van entre las vistas y
   *  las acciones. Compatibles con `primaryAction` pero en flujos tipo
   *  Mostrador lo usual es steps SIN CTA (el avance ES la acción). */
  steps?: StepsSpec;
}

/* ============================================================
 * FilterBar
 * ============================================================ */

export interface SelectOption {
  value: string;
  label: string;
}

/** Select de la FilterBar (patrón Etiqueta muted + Valor 600 + chevron).
 *  Se renderiza con el ModernSelect existente, alto 32. */
export interface SelectSpec {
  id: string;
  /** Etiqueta visible: "Categoría", "Dependencia", "Caja"… */
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

/** Tab del segmented de estados. count 0 ⇒ se pinta `--pl-text-disabled`
 *  y NO es clickeable. Nunca duplicar estos conteos en tarjetas. */
export interface StatusTab {
  id: string;
  label: string;
  count: number;
}

/** Valor del PeriodControl (obligatorio en toda lista con fechas).
 *  Contrato literal del estándar. */
export interface PeriodControlValue {
  unit: 'month' | 'year';
  /** ISO o etiqueta ya formateada ("2026-07" / "Julio 2026"). */
  from: string;
  /** Presente ⇒ el control muestra el segundo stepper ("Hasta") y la ×. */
  to?: string;
  /**
   * [v2.1] Modo "todos": true ⇒ SIN filtro de período — el control muestra
   * "Todos los períodos" y un botón para acotar; al acotar, el onChange emite
   * `todos: false` (o lo omite) y vuelven a regir `unit`/`from`/`to`, que
   * mientras tanto conservan el último valor como propuesta de aterrizaje.
   * Why (piloto Tesorería): la página tiene "todos los meses" y el contrato
   * no podía expresarlo — el control mostraba un mes como si filtrara y la
   * verdad la decían el eyebrow del hero y el resumen (GOTCHA documentado
   * en Tesoreria.tsx, mapeo de `periodValue`).
   */
  todos?: boolean;
}

/** [v2.1] Opción del segmented de orden. */
export interface SortOption {
  id: string;
  /** Label corto ("Urgencia", "Fecha", "Monto"). */
  label: string;
}

/**
 * [v2.1] Segmented CHICO de orden en la FilterBar (mismo lenguaje visual que
 * el segmented de estados, tamaño reducido, a la derecha antes del resumen).
 * Es ORDEN, no filtro: cambia el criterio con que la página ordena las filas
 * (la página ordena; la barra solo pinta y notifica — presentacional puro).
 * Why (piloto Reclamos): la bandeja ordena por urgencia/vencimiento además
 * de fecha y lo resolvía con un control ad-hoc fuera del estándar.
 */
export interface SortSpec {
  opciones: SortOption[];
  /** id de la SortOption activa. */
  activo: string;
  onSort: (id: string) => void;
}

export interface FilterBarProps {
  selects: SelectSpec[];
  /** Omitir en listas sin fecha (Personal, Inventario). */
  period?: PeriodControlValue;
  onPeriodChange?: (value: PeriodControlValue) => void;
  statusTabs: StatusTab[];
  /** id del StatusTab activo. */
  activeStatus: string;
  onStatusChange: (id: string) => void;
  /** [v2.1] Segmented chico de orden (ver SortSpec). Omitido ⇒ no se pinta. */
  sortSpec?: SortSpec;
  /** Resumen del filtro aplicado, a la derecha: "50 movimientos · $ 43.048.905". */
  filterSummary?: string;
}

/* ============================================================
 * DataTable
 * ============================================================ */

/** Columna de la tabla. TODA columna con `minmax()` en el track — nunca px
 *  fijos junto a tracks flexibles. El dinero SIEMPRE en la última columna
 *  de datos, alineado a la derecha. */
export interface ColumnSpec<Row = unknown> {
  id: string;
  /** Encabezado eyebrow (10px/700, tracking .09em). Rotular también ACCIONES. */
  header: string;
  /** Track de grid: "minmax(200px, 1.9fr)", "76px" solo para fijas puras. */
  width: string;
  /** Alineación de la celda Y de su encabezado (importes/acciones: right). */
  align?: 'left' | 'right' | 'center';
  /** Pista semántica para el render por defecto de la celda.
   *  [v2.1] Se suma 'dot': punto de color + texto NEUTRO (DotCellData) —
   *  la versión liviana de 'entity' para columnas taxonómicas (categoría,
   *  dependencia, zona) donde el tile completo es demasiado peso visual.
   *  Why (pilotos Reclamos y Personal): ambos repetían el mismo markup
   *  punto+texto en `cell` custom para esas columnas. */
  kind?: 'text' | 'entity' | 'chip' | 'date' | 'money' | 'actions' | 'dot';
  /** Render custom de la celda. Sin `cell`, el DataTable resuelve un render
   *  por defecto según `kind` (los agentes de Tabla lo documentan). */
  cell?: (row: Row) => ReactNode;
}

/** [v2.1] Datos de la celda kind='dot': punto de color + texto neutro.
 *  Regla del estándar intacta: el COLOR va solo en el punto, el texto queda
 *  neutro (nunca texto coloreado). */
export interface DotCellData {
  label: string;
  /** Color del punto — valor RUNTIME que viene de datos (categoría/área),
   *  por eso se permite inline. Omitido ⇒ punto neutro por tokens. */
  dotColor?: string;
}

/**
 * Datos de la celda de entidad (kind='entity'): tile + título + subtítulo.
 * [v2.1] CANÓNICA ACÁ (antes vivía solo en DataTable.tsx): DataTable.tsx debe
 * re-exportarla desde este módulo (`export type { EntityCellData } from
 * './types'`) para no romper los imports existentes de las páginas
 * (Empleados importa `EntityCellData` desde './DataTable').
 */
export interface EntityCellData {
  /**
   * Icono del tile (28-30px, fondo suave de la familia).
   * [v2.1] Ampliado a `LucideIcon | ReactNode`: además del componente lucide
   * acepta un nodo ya instanciado (p. ej. el `<img>` del thumbnail de la
   * categoría). Why (piloto Reclamos): sus categorías tienen imagen propia y
   * el contrato solo admitía lucide. Discriminación en el render: si
   * `isValidElement(icon)` se pinta tal cual dentro del tile; si no, se trata
   * como componente LucideIcon (`typeof` no alcanza: lucide usa forwardRef).
   * Excluyente con `initials`.
   */
  icon?: LucideIcon | ReactNode;
  /**
   * [v2.1] Avatar circular con iniciales ("MG"), EXCLUYENTE con `icon` (si
   * vienen ambos gana `initials`, que es más específico). Why (piloto
   * Personal): la entidad de la fila es una persona sin icono natural — el
   * tile genérico de lucide desperdiciaba la celda; las iniciales identifican.
   */
  initials?: string;
  /** Color de la familia/categoría — viene de DATOS (runtime): tiñe el
   *  icono/iniciales y el fondo suave del tile. Sin él, tile neutro por tokens. */
  tileColor?: string;
  title: string;
  /** Subtítulo: punto de color + TEXTO NEUTRO (nunca texto coloreado). */
  subtitle?: string;
  /** Color del punto del subtítulo — runtime (categoría de los datos). */
  dotColor?: string;
}

/** Acción por fila: botón de icono de 28px, trazo 1.8, sin color permanente.
 *  Máximo 2 visibles; el resto va a un menú "…" (lo resuelve el DataTable). */
export interface RowAction<Row = unknown> {
  id: string;
  /** Tooltip / aria-label ("Ver", "Eliminar"). */
  label: string;
  icon: LucideIcon;
  onClick: (row: Row) => void;
  /** true ⇒ gris que pasa a `--pl-red-700` en hover (Eliminar). */
  danger?: boolean;
}

/** Grupo precomputado por la página (DateGroupRow / franja horaria).
 *  La página agrupa y formatea; el DataTable solo pinta. */
export interface TableGroup<Row = unknown> {
  key: string;
  /** Insignia 42×38: día sobre mes ("15"/"OCT") u hora ("09"/"HS"). */
  badge?: { top: string; bottom: string };
  /** "3 movimientos" · "4 de 4 cupos" · "1 cupo libre". */
  label: string;
  /** Subtotal YA formateado; se muestra si showGroupSubtotal (kind='money'). */
  subtotal?: string;
  rows: Row[];
}

export interface DataTableFooter {
  /** "Mostrando 50 de 50". */
  showing: string;
  /** Gran total del período (kind='money'). */
  total?: { label: string; value: string };
  /** Acción del pie en listas sin importes ("Cargar más"). */
  action?: Action;
}

export interface DataTableProps<Row = unknown> {
  kind: ListKind;
  /** [v2.3 — canvas Reclamos] Tabs de estado SUBRAYADAS en el tope de la
   *  tarjeta ("Todos 49 · Recibidos 21…"): label + conteo, count 0 ⇒ apagada
   *  y no clickeable. Opcionales: sin tabs la tarjeta arranca directo en el
   *  encabezado (compat con todas las pantallas actuales). Cuando la página
   *  las pasa acá, NO las pase también a la FilterBar (quedarían dobles). */
  statusTabs?: StatusTab[];
  activeStatus?: string;
  onStatusChange?: (id: string) => void;
  columns: ColumnSpec<Row>[];
  /** 'date' (money/plain con fecha) · 'hour' (schedule) · 'none'. */
  groupBy?: 'date' | 'hour' | 'none';
  /** true en kind='money': subtotal por grupo en la columna del importe. */
  showGroupSubtotal?: boolean;
  /** Filas planas (groupBy 'none' u omitido). */
  rows: Row[];
  /** Grupos precomputados por la página cuando groupBy ≠ 'none'.
   *  Si vienen, tienen prioridad sobre `rows`. */
  groups?: TableGroup<Row>[];
  /** Key estable por fila (id de la entidad). */
  rowKey: (row: Row) => string | number;
  rowActions: RowAction<Row>[];
  /** Click en la fila abre el SideModal de detalle (cursor pointer). */
  onRowClick?: (row: Row) => void;
  footer: DataTableFooter;
  /** min-width del grid interno antes de scrollear horizontal (default ~940). */
  tableMinWidth?: number;
  /**
   * [v2.1] true ⇒ skeleton rows (filas fantasma sobre tokens, sin spinner)
   * en lugar del cuerpo; el estado vacío NO se muestra mientras carga.
   * Why (pilotos, todos): las tres páginas fetchean async y la tabla decía
   * "No hay registros" durante la carga (falso vacío) — cada piloto lo
   * parcheaba por afuera con skeletons ad-hoc.
   */
  loading?: boolean;
  /**
   * [v2.1] Copy del estado vacío. Omitido ⇒ mensaje genérico actual.
   * Why (piloto Reclamos): cada bandeja quiere su copy contextual ("Sin
   * urgentes. Bandeja al día." ≠ "No hay registros que coincidan…") — el
   * texto hardcodeado del DataTable no lo permitía.
   */
  emptyMessage?: string;
}

/* ============================================================
 * SemanticAbmPage — contrato público (flat, nombres del estándar)
 * ============================================================ */

/**
 * [v2.1] Panel lateral sticky junto al cuerpo de la lista (columna derecha,
 * sticky bajo el TopBar; en viewports angostos cae debajo del cuerpo).
 * El contenido lo arma la página (panel de IA, resumen de bandeja, ayuda
 * contextual) — el orquestador solo resuelve layout y stickiness.
 * Why (piloto Reclamos): la bandeja convive con un panel lateral (inbox /
 * panel de IA) que hoy la obliga a componer el layout a mano por afuera.
 */
export interface AsideSpec {
  content: ReactNode;
  /** Ancho en px de la columna del aside (default lo fija el CSS ~320). */
  width?: number;
}

export interface SemanticAbmPageProps<Row = unknown> {
  /* --- Identidad y copy --- */
  /** 'reclamos' | 'gastos' | 'agenda' | … (analytics, keys de persistencia). */
  moduleKey: string;
  /**
   * [v2.2] Eyebrow de la CABECERA de módulo ("Reclamos", "Personal"). Se pinta
   * en caps por CSS. Omitido ⇒ la cabecera arranca directo en el H1 (una
   * pantalla vieja que no lo mande NO se rompe: degrada sin eyebrow).
   */
  eyebrow?: string;
  /**
   * H1 de la página. [v2.2] CAMBIÓ DE LUGAR Y DE TONO: antes era el título
   * chico de la toolbar (22px, la entidad: "Reclamos"); ahora es el H1 de 34px
   * de la cabecera y nombra lo que el usuario viene a resolver ("Todo lo que
   * el vecino pidió y qué falta resolver"). La entidad va en `eyebrow`.
   */
  title: string;
  /** [v2.2] Bajada de la cabecera (1-2 líneas: de dónde salen las filas y cómo
   *  se agrupan). Omitida ⇒ no se renderiza. */
  description?: string;
  hero: ModuleHeroProps;
  /** Borde izquierdo del hero: token CSS (`var(--pl-green)` por defecto,
   *  `var(--pl-red)` cuando el módulo está en alerta). NUNCA un hex literal. */
  accentColor?: string;

  /* --- Toolbar --- */
  searchPlaceholder: string;
  views: ViewKind[];
  secondaryAction?: Action;
  /** [v2.1] Ahora OPCIONAL (vistas de solo consulta) — ver ListToolbarProps. */
  primaryAction?: Action;
  /** [v2.1] Chips numerados de flujo en la toolbar (ver StepsSpec —
   *  flujos tipo Mostrador). Pass-through a ListToolbar. */
  steps?: StepsSpec;

  /* --- Filtros --- */
  selects: SelectSpec[];
  /** Omitir en listas sin fecha (Personal, Inventario). Obligatorio en money. */
  period?: PeriodControlValue;
  statusTabs: StatusTab[];
  /** [v2.1] Segmented chico de orden (ver SortSpec). Pass-through a FilterBar. */
  sortSpec?: SortSpec;
  filterSummary?: string;

  /* --- Cuerpo --- */
  /**
   * [v2.1] Cuerpo alternativo por vista: si la vista activa tiene slot, el
   * orquestador renderiza ESE nodo como cuerpo (manteniendo hero + toolbar +
   * filtros + drawer); sin slot, fallback al DataTable estándar en 'table'
   * (las demás vistas sin slot no renderizan cuerpo). La página arma el
   * contenido (cards, vista guiada, day/week custom) con los MISMOS datos ya
   * filtrados — el shell no se entera.
   * Why (piloto Reclamos): compone las piezas a mano porque el orquestador
   * no soportaba sus vistas cards/guiada (nota en el header de Reclamos.tsx)
   * — con viewSlots vuelve al orquestador sin perder sus vistas.
   */
  viewSlots?: Partial<Record<ViewKind, ReactNode>>;
  /** [v2.1] Panel lateral sticky junto al cuerpo (ver AsideSpec). */
  aside?: AsideSpec;

  /* --- Tabla --- */
  kind: ListKind;
  columns: ColumnSpec<Row>[];
  groupBy?: 'date' | 'hour' | 'none';
  showGroupSubtotal?: boolean;
  rows: Row[];
  /** Grupos precomputados (ver DataTableProps.groups). */
  groups?: TableGroup<Row>[];
  rowActions: RowAction<Row>[];
  footer: DataTableFooter;
  /** [v2.1] Skeleton rows mientras carga — ver DataTableProps.loading. */
  loading?: boolean;
  /** [v2.1] Copy del estado vacío — ver DataTableProps.emptyMessage. */
  emptyMessage?: string;

  /* --- Estado controlado (extensión de implementación) --- */
  search: string;
  onSearchChange: (query: string) => void;
  activeView: ViewKind;
  onViewChange: (view: ViewKind) => void;
  activeStatus: string;
  onStatusChange: (id: string) => void;
  onPeriodChange?: (value: PeriodControlValue) => void;
  rowKey: (row: Row) => string | number;
  onRowClick?: (row: Row) => void;
}

/* ============================================================
 * SideModal — drawer derecho (detalle / alta / edición)
 * ============================================================ */

/** Paso del StatusStepper (solo mode='detail' con estados).
 *  Completos verde · actual ámbar con barra parcial y motivo · futuros track. */
export interface StepperStep {
  id: string;
  label: string;
  status: 'done' | 'current' | 'pending';
  /** Timestamp bajo el label ("14 oct · 09:32"). */
  timestamp?: string;
  /** Avance de la barra del paso actual (0..1). Default 0.5. */
  progress?: number;
  /** Motivo del bloqueo del paso actual ("Falta autorización de Presupuesto"). */
  blockedReason?: string;
}

/** Sección del cuerpo: label eyebrow + contenido, separadas por hairlines.
 *  NUNCA una tarjeta con borde de color por sección. */
export interface SectionSpec {
  id: string;
  label: string;
  content: ReactNode;
}

/** Paso del DepartmentTrail (dependencias que tocaron el registro o circuito
 *  de autorización). El actual lleva punto verde con halo y acción "Derivar". */
export interface TrailStep {
  id: string;
  /** Área / dependencia ("Compras", "Dirección de Alumbrado"). */
  area: string;
  /** Quién lo tocó. */
  who?: string;
  /** Cuándo ("14 oct 09:32"). */
  when?: string;
  /** Responsable actual (punto con halo). */
  current?: boolean;
  /** Acción contextual del paso actual ("Derivar"). */
  action?: Action;
}

/** Candidato de asignación (CandidateList): radio real, match como número +
 *  barra fina, una línea de razones. Solo el sugerido con superficie verde. */
export interface CandidateSpec {
  id: string;
  nombre: string;
  /** Score de match 0..100. */
  match: number;
  /** Una línea de razones ("Zona norte · 2 OTs abiertas · libre hoy"). */
  razones?: string;
  /** Sugerido por el sistema (superficie verde). */
  sugerido?: boolean;
  seleccionado?: boolean;
  onSelect?: () => void;
}

/** Header fijo del drawer. En dinero el importe vive ACÁ (Sora 26 `tnum`),
 *  nunca en una tarjeta debajo del título. */
export interface SideModalHeaderSpec {
  /** Identificador visible ("#REC-0148" / "#OP-2201"). */
  id?: string;
  /** Título Sora/display 20px 700. */
  title: string;
  /** Línea superior: creado · canal · vencimiento. */
  metaTop?: ReactNode;
  /** Fila de metadatos: categoría con punto, chip de prioridad, ubicación. */
  metaBottom?: ReactNode;
  /** Importe formateado (solo registros de dinero). */
  amount?: string;
  /** Al lado del importe: moneda extranjera + cotización, 12.5px muted. */
  amountAside?: string;
  statusChip?: { label: string; tone: ChipTone };
}

export interface SideModalFooter {
  /** Campo para justificar el cambio de estado (mode='detail'). Controlado
   *  opcionalmente por la página vía value/onChange. */
  note?: {
    required: boolean;
    placeholder: string;
    value?: string;
    onChange?: (value: string) => void;
  };
  /** Línea informativa del footer en create/edit ("2 obligatorios sin completar"). */
  info?: string;
  /** Nombra el resultado: "Marcar como pagado", "Registrar cobro", "Guardar". */
  primary: Action;
  /** "Generar OP", "Editar", "Posponer"… */
  secondary?: Action[];
  /** Eliminar/Anular: SOLO icono, nunca botón de texto. */
  destructive?: Action;
}

export interface SideModalProps {
  mode: 'detail' | 'create' | 'edit';
  /** 480 alta/edición y registros simples · 520 dinero · 560 con proceso. */
  width?: 480 | 520 | 560;
  /** Extensión de implementación: montaje/cierre del drawer. Cierra con
   *  Esc, la × o click en el backdrop — "Cerrar" nunca es un botón. */
  open: boolean;
  onClose: () => void;
  header: SideModalHeaderSpec;
  /** Solo mode='detail' y registros con estados. */
  stepper?: StepperStep[];
  /** Cuerpo scrolleable: secciones con hairlines. */
  sections: SectionSpec[];
  /** Circuito entre dependencias / autorización. */
  trail?: TrailStep[];
  /** Asignación con radios y score. */
  candidates?: CandidateSpec[];
  footer: SideModalFooter;
}
