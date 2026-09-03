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
import type { HeroFrase, HeroKpi, Veredicto } from '../../lib/semanticHero';

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
/** 'arbol': jerarquía expandible (categoría → trámite → requisitos). El cuerpo
 *  lo pone la página por `viewSlots.arbol` — el kit trae `AccordionTree`. */
export type ViewKind = 'cards' | 'table' | 'guided' | 'day' | 'week' | 'arbol';

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
  /**
   * Cuánto hero pide la pantalla. Pass-through a `SemanticHero`.
   *
   * - `'full'` (default): frase + stat strip de KPIs.
   * - `'simple'`: sólo la barra con el color del veredicto y la frase.
   *
   * Existe porque no toda pantalla tiene cinco números que contar. Un
   * formulario de datos, un generador de QR o el selector de apariencia no
   * tienen stat strip: con `'full'` prometen una que queda vacía, y sin hero
   * se salen de la familia visual del resto del módulo.
   */
  size?: 'full' | 'simple';
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
 *  y NO es clickeable. count ausente ⇒ el conteo no se conoce: el tab queda
 *  clickeable y SIN número (nunca un número inventado al lado de datos
 *  reales). Nunca duplicar estos conteos en tarjetas. */
export interface StatusTab {
  id: string;
  label: string;
  count?: number;
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
/**
 * ROLES SEMÁNTICOS — la unidad de declaración que SÍ se puede proyectar.
 *
 * Una columna es un concepto de escritorio: tiene ancho, orden y alineación, y
 * nada de eso significa algo en una ficha de celular. Por eso el control no se
 * declara sólo con columnas: cada campo declara QUÉ ROL CUMPLE en el registro,
 * y cada renderer interpreta ese rol como puede.
 *
 *   renderer de columnas → dibuja las `columns` en el orden declarado
 *   renderer de fichas   → dibuja estos roles en sus 4 slots fijos
 *
 * Los dos leen de la MISMA declaración: comparten datos, filtros, estado y
 * acciones, y no comparten una sola regla de layout. Agregar una entidad nueva
 * al sistema es mapear estos roles — no se escribe UI de celular, ya existe.
 *
 * Cada rol es una función que extrae el dato de la fila. Un rol que no aplica
 * se omite y el renderer se acomoda; ninguno es obligatorio salvo `headline`,
 * que es lo único que identifica al registro para una persona.
 */
export interface RolesSemanticos<Row = unknown> {
  /** El código o número del registro. Slot 1, junto a la taxonomía. */
  identity?: (row: Row) => string | null | undefined;
  /** Categoría/tipo, con su color. Slot 1: punto de color + texto con elipsis. */
  taxonomy?: (row: Row) => { label: string; color?: string; icon?: string } | null | undefined;
  /** La frase que identifica al registro. Slot 2. Lo ÚNICO que puede ocupar
   *  dos líneas en toda la ficha (clamp 2). */
  headline: (row: Row) => string;
  /** Quién, y de qué área. Slot 3, primera línea, con elipsis. */
  actor?: (row: Row) => string | null | undefined;
  /** Dónde, cuánto, o cuándo vence. Slot 3, segunda línea, con elipsis.
   *  Si una entidad "necesita un quinto dato" en la lista, casi siempre ese
   *  dato era el context. */
  context?: (row: Row) => string | null | undefined;
  /** Estado con su semántica de color. Slot 4: píldora arriba. El `tono`
   *  entra en la escala del kit; no se inventan colores por entidad. */
  state?: (row: Row) => { label: string; tono?: string } | null | undefined;
  /** Tiempo relativo ("hace 3 d"). Slot 4: abajo de la píldora. */
  elapsed?: (row: Row) => string | null | undefined;
  /** Importe, para las entidades que lo tengan. Reemplaza a `elapsed` en el
   *  slot 4 cuando ambos están declarados. */
  amount?: (row: Row) => string | null | undefined;
}

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
   *  punto+texto en `cell` custom para esas columnas.
   *  [v2.5] Se suma 'metric': número + nota debajo (MetricCellData) — la
   *  columna "EN USO" del canvas de Configuración. Ver MetricCellData. */
  kind?: 'text' | 'entity' | 'chip' | 'date' | 'money' | 'actions' | 'dot' | 'metric';
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
 * [v2.5] Datos de la celda kind='metric': un número con su nota debajo
 * ("9 / históricos", "0 / sin usar"). Es la columna "EN USO" del canvas de
 * Configuración, y sirve para cualquier lista que quiera responder "¿cuánto
 * pesa esta fila?" sin abrirla.
 *
 * El NÚMERO se pinta en display con `tnum` y la NOTA en muted. El color sale
 * del `veredicto` (tokens), nunca de un hex: un catálogo sin uso se lee
 * apagado y uno desbordado se lee en alerta. Sin veredicto queda neutro.
 *
 * El SUSTANTIVO de la nota lo pone la página —el kit no sabe si son
 * "históricos", "trámites" o "empleados"—, igual que el `label` de TableGroup.
 */
export interface MetricCellData {
  /** Número YA formateado por la página ("1.240", "0", "—"). */
  value: string;
  /** Renglón chico debajo: qué son esas unidades ("históricos", "sin usar"). */
  note?: string;
  /** Tiñe el número. Omitido ⇒ neutro. */
  veredicto?: Veredicto;
  /** true ⇒ número apagado (--pl-text-disabled). Para el cero real: "no se
   *  usó nunca" no es una alerta, es un dato menor. */
  muted?: boolean;
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
  /** [v2.4] ¿Esta acción aplica a ESTA fila? Sin la prop, la acción va en
   *  todas (comportamiento histórico). Existe porque los circuitos con
   *  estados —una orden de pago se autoriza sólo si está pendiente y se paga
   *  sólo si está autorizada— necesitan que el juego de botones cambie por
   *  fila; sin esto la única salida era mostrar acciones que fallan al
   *  apretarlas. El recorte se aplica ANTES de partir en visibles/desbordadas,
   *  así una fila con pocas acciones no arrastra un menú "…" vacío. */
  visible?: (row: Row) => boolean;
}

/** Grupo precomputado por la página (DateGroupRow / franja horaria).
 *  La página agrupa y formatea; el DataTable solo pinta. */
export interface TableGroup<Row = unknown> {
  key: string;
  /** Insignia 42×38: día sobre mes ("15"/"OCT") u hora ("09"/"HS"). */
  badge?: { top: string; bottom: string };
  /** Renglón fuerte del grupo: la fecha escrita entera ("15 de octubre",
   *  "Lunes 3"). Opcional — sin él la cabecera queda de UNA línea, como
   *  siempre, y no se toca ninguna pantalla existente. */
  title?: string;
  /** Renglón chico, debajo del title: qué hay adentro del grupo. El
   *  SUSTANTIVO lo pone la página, que es la que sabe qué lista es —
   *  "3 movimientos", "4 gastos", "1 pago · venció hace 2 d",
   *  "4 de 4 cupos". El kit no sabe de dominios. */
  label: string;
  /** Estado del grupo. Tiñe la insignia y el renglón chico: un día con
   *  pagos vencidos se lee en rojo sin abrir nada. Sin veredicto la
   *  cabecera queda neutra con el mes en el acento del theme. */
  veredicto?: Veredicto;
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
  /**
   * [v2.5] La REGLA de la entidad, al pie de la tarjeta: "El empleado con
   * reclamos asignados no se puede borrar: primero hay que reasignarlos".
   *
   * Sale del canvas de Configuración, donde cada ABM cierra con la suya. Va
   * acá y no en un tooltip del botón porque explica por qué el sistema va a
   * decir que no ANTES de que el usuario lo intente — que es cuando sirve.
   */
  note?: string;
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
  /** Los mismos datos, declarados por ROL. Es lo que consume el renderer de
   *  fichas cuando el CONTENEDOR es angosto (ver RolesSemanticos). Sin roles,
   *  el control se comporta como siempre: sólo dibuja columnas. */
  roles?: RolesSemanticos<Row>;
  /** 'date' (money/plain con fecha) · 'hour' (schedule) · 'none'. */
  groupBy?: 'date' | 'hour' | 'none';
  /** true en kind='money': subtotal por grupo en la columna del importe. */
  showGroupSubtotal?: boolean;
  /** Filas planas (groupBy 'none' u omitido). */
  rows: Row[];
  /** Grupos precomputados por la página cuando groupBy ≠ 'none'.
   *  Si vienen, tienen prioridad sobre `rows`. */
  groups?: TableGroup<Row>[];
  /** Key estable por fila (id de la entidad). El índice llega segundo para
   *  desempatar filas homónimas cuando la entidad no trae id. */
  rowKey: (row: Row, index?: number) => string | number;
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
  /**
   * [v2.5] Reordenamiento por arrastre (ver ReorderSpec). Omitido ⇒ la tabla
   * no se reordena y no aparece ninguna columna extra: las pantallas
   * existentes no cambian ni un píxel.
   */
  reorder?: ReorderSpec<Row>;
}

/* ============================================================
 * [v2.5] Reordenamiento por arrastre — pieza del canvas de Configuración
 * ============================================================ */

/**
 * Modo "Reordenar" de una lista ordenable (el `orden` de un catálogo es un
 * campo del dominio: define en qué secuencia ve el vecino las categorías).
 *
 * Es un MODO, no un estado permanente: mientras está apagado la lista se lee
 * y se ordena por el criterio que quiera la página; al encenderlo aparecen
 * los handles y las filas se arrastran. Se separó así porque una lista donde
 * todas las filas son arrastrables SIEMPRE se reordena sin querer al
 * intentar seleccionar texto.
 *
 * Accesible por teclado a propósito: el handle es un botón real y las flechas
 * mueven la fila. Sin eso el orden sería inalcanzable sin mouse — y en
 * móviles el drag nativo de HTML5 directamente no existe.
 *
 * El componente NO persiste nada: emite el orden nuevo y la página decide
 * (PATCH por fila, endpoint de bulk, optimista). Tampoco reordena por su
 * cuenta: las filas siguen llegando por `rows`, así que quien manda es el
 * estado de la página (un fallo del guardado se ve como la fila volviendo a
 * su lugar, que es la verdad).
 */
export interface ReorderSpec<Row = unknown> {
  /** true ⇒ modo activo (handles visibles, filas arrastrables). */
  active: boolean;
  /**
   * Soltó una fila en otra posición. Llega la lista COMPLETA en el orden
   * nuevo (no un índice suelto) porque casi siempre hay que reasignar el
   * campo `orden` de todas las filas afectadas, no sólo de la que se movió.
   * `moved` viene aparte para poder mandar un PATCH de una sola fila cuando
   * el backend lo soporta.
   */
  onReorder: (rows: Row[], moved: { row: Row; from: number; to: number }) => void;
  /** Tooltip del handle. Default: "Arrastrá para reordenar". */
  handleTitle?: string;
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
  /**
   * [v2.5] AHORA OPCIONAL. Un catálogo simple —nombre, icono, color, activo,
   * orden— no tiene veredicto que contar: forzarle un hero obligaba a
   * inventar una frase ("hay 9 categorías") que no interpreta nada, y encima
   * dentro del panel de Configuración competía con el título que ya puso el
   * shell. Sin `hero` la página arranca directo en la toolbar.
   *
   * Sigue siendo obligatorio en el espíritu del estándar para los módulos que
   * SÍ tienen estado que leer (Reclamos, Gastos, Liquidaciones): omitirlo ahí
   * es perder la única pieza que dice cómo viene el mes.
   */
  hero?: ModuleHeroProps;
  /**
   * [v2.5] PISTA: la banda de ayuda del módulo ("Los plazos se cuentan en
   * días hábiles", "El CBU es lo que habilita el pago masivo").
   *
   * Sale del canvas de Configuración. Es distinta del hero: el hero dice CÓMO
   * VIENE la cosa (números de hoy), la pista explica CÓMO FUNCIONA (una regla
   * que no cambia). Por eso no se mezclan — y por eso la pista no lleva
   * números: si los llevara, envejecería sin que nadie la actualice.
   *
   * [v3] CAMBIÓ DE LUGAR: ya no va entre el hero y los controles — va ARRIBA
   * DE TODO (el segmento de ayudas, antes de la cabecera) y SE CIERRA CON UNA
   * CRUZ, persistida por módulo (HintBanner). Una ayuda es para leerla una
   * vez, no para ocupar el medio de la pantalla para siempre (dueño,
   * 2026-09-02).
   */
  pista?: { titulo: string; texto: string; accion?: Action };
  /** Borde izquierdo del hero: token CSS (`var(--pl-green)` por defecto,
   *  `var(--pl-red)` cuando el módulo está en alerta). NUNCA un hex literal. */
  accentColor?: string;

  /* --- Toolbar --- */
  searchPlaceholder: string;
  /**
   * [v3] AHORA OPCIONAL — el estándar es NO declararla: con `roles` declarados
   * el kit trae las tres vistas built-in ('table' + 'cards' + 'guided'
   * autogeneradas desde los roles semánticos). Declararla es la EXCEPCIÓN
   * explícita (una pantalla que de verdad no admite una vista), no el default.
   * Why (dueño, 2026-09-02): los agentes declaraban de menos y las pantallas
   * perdían vistas que el kit ya sabía dibujar.
   */
  views?: ViewKind[];
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
  /**
   * [v3] Los mismos datos declarados por ROL (ver RolesSemanticos). Con esto
   * el kit dibuja SOLO las otras vistas: la ficha mobile, la vista 'cards' y
   * la vista 'guided' (fichas agrupadas por estado) salen de acá — la página
   * no arma UI alternativa, declara qué rol cumple cada dato. Es la pieza que
   * mantiene íconos, segundas líneas, píldoras y acciones SIMÉTRICOS en todas
   * las vistas: un set de datos, un solo dibujante.
   */
  roles?: RolesSemanticos<Row>;
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
  /** [v2.5] Modo "Reordenar" de la tabla — pass-through a DataTable.reorder.
   *  El botón que lo prende y apaga lo pone la página (normalmente en
   *  `secondaryAction`), porque es ella la que sabe si el orden se puede
   *  guardar. */
  reorder?: ReorderSpec<Row>;

  /* --- Estado controlado (extensión de implementación) --- */
  search: string;
  onSearchChange: (query: string) => void;
  activeView: ViewKind;
  onViewChange: (view: ViewKind) => void;
  activeStatus: string;
  onStatusChange: (id: string) => void;
  onPeriodChange?: (value: PeriodControlValue) => void;
  rowKey: (row: Row, index?: number) => string | number;
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

/* ============================================================
 * [v2.5] CONTROLES DEL CANVAS DE CONFIGURACIÓN
 *
 * Origen: "Configuracion.dc.html" (canvas Claude Design 46976e44,
 * 2026-08-03). El canvas trajo tres cuerpos que el kit no tenía —una lista
 * ordenable a mano, un panel de asignación y un árbol— más los controles
 * chicos que esos cuerpos usan.
 *
 * REGLA DE INGRESO AL KIT (acuerdo del dueño, 2026-08-03): cuando un diseño
 * traiga un control que no tenemos, no se maqueta adentro de la pantalla —
 * se componentiza acá, con props que lo hagan servir en OTRAS apps, y se
 * documenta en los STANDARD-*.md que leen los agentes. Por eso ninguno de
 * estos tipos nombra un catálogo, una dependencia ni un trámite: hablan de
 * filas, destinos y nodos.
 * ============================================================ */

/** Tamaño de las piezas chicas. 'sm' es la variante de fila de tabla. */
export type ControlSize = 'sm' | 'md';

/**
 * Interruptor de dos estados (activo / inactivo). Reemplaza al checkbox
 * nativo, que rompe el theme igual que el `<select>`.
 *
 * Va en la fila de la tabla (sin label) o en un formulario (con label y
 * descripción). Es controlado: no guarda estado propio, así el optimismo lo
 * decide la página.
 */
export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto al lado de la perilla. Omitido ⇒ sólo la perilla (fila de tabla). */
  label?: string;
  /** Renglón chico bajo el label (formularios). */
  description?: string;
  size?: ControlSize;
  disabled?: boolean;
  /** Por qué está deshabilitado. Regla del estándar: nunca un control muerto
   *  sin decir qué falta. Se pinta como `title`. */
  disabledReason?: string;
  /** aria-label cuando no hay `label` visible (fila de tabla). */
  ariaLabel?: string;
}

/** Opción del segmented. `icon` sin `label` ⇒ botón de sólo icono. */
export interface SegmentedOption {
  id: string;
  label?: string;
  icon?: LucideIcon;
  /** Contador a la derecha del label ("Trámites 42"). */
  count?: number;
  /** Punto de color a la izquierda — runtime (viene de datos). */
  dotColor?: string;
  disabled?: boolean;
  /** Tooltip; obligatorio de hecho cuando el botón es sólo icono. */
  title?: string;
}

/**
 * Segmented control genérico (píldora hundida con el activo elevado). El kit
 * ya lo tenía TRES veces maquetado por dentro —vistas de la toolbar, estados
 * de la FilterBar, orden— y el canvas pide dos más (lado de la asignación,
 * unidad horas/días). Este es el único que hay que tocar de acá en más.
 */
export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
  size?: ControlSize;
  /** Etiqueta accesible del grupo ("Vista", "Unidad del plazo"). */
  ariaLabel?: string;
  /** true ⇒ ocupa todo el ancho disponible repartiendo en partes iguales. */
  fullWidth?: boolean;
}

/**
 * Chip de filtro con contador (y punto de color opcional). Es el mismo
 * lenguaje que los `statusTabs` pero SUELTO: sirve donde no hay tabla que lo
 * albergue (el panel de asignación, un panel de ajustes).
 */
export interface FilterChip {
  id: string;
  label: string;
  count?: number;
  /** Tiñe el punto y el chip activo. Omitido ⇒ acento del theme. */
  veredicto?: Veredicto;
}

/* --- Panel de asignación ------------------------------------------------ */

/** Destino posible de una asignación (dependencia, responsable, cuadrilla). */
export interface AssignTarget {
  value: string;
  label: string;
  /** Color del punto — runtime (viene de datos). */
  dotColor?: string;
}

/** Fila del panel: la entidad de la izquierda + a quién quedó asignada. */
export interface AssignRow {
  id: string | number;
  label: string;
  /** Tile de la entidad. Acepta lucide o un nodo ya instanciado. */
  icon?: LucideIcon | ReactNode;
  /** Color del tile — runtime. */
  tileColor?: string;
  /** Cuánto pesa la fila ("38 · históricos"). Misma pieza que kind='metric'. */
  metric?: MetricCellData;
  /** value del AssignTarget actual. null/undefined ⇒ sin asignar. */
  assignedTo?: string | null;
  /**
   * Propuesta del sistema para una fila sin asignar. Se pinta en un botón
   * PUNTEADO, distinto del combo lleno: el usuario tiene que poder ver de un
   * vistazo qué está decidido y qué está sugerido. Aplicar es un click.
   */
  suggestion?: { value: string; label: string; reason?: string };
  /** Bloquea el cambio en esta fila (sin permiso, registro del sistema). */
  disabled?: boolean;
  disabledReason?: string;
}

/** Grupo de filas del panel (por rama, por estado, por lo que sea). */
export interface AssignGroup {
  key: string;
  /** Título del grupo, en eyebrow ("SIN ATENDER"). */
  title: string;
  /** Renglón de contexto a la derecha del título. */
  detail?: string;
  /** Tiñe el punto y el título del grupo. */
  veredicto?: Veredicto;
  rows: AssignRow[];
}

/**
 * Panel de ASIGNACIÓN: emparejar cada fila de un catálogo con un destino
 * (categoría → dependencia, zona → cuadrilla, concepto → caja). Es el cuerpo
 * "asignacion" del canvas.
 *
 * Por qué es una pieza propia y no una tabla con un combo en una columna:
 *  - el estado que importa es "cuántas quedaron sin asignar", y eso se lee en
 *    los grupos y los chips, no fila por fila;
 *  - la sugerencia necesita un affordance distinto del valor confirmado
 *    (punteado vs lleno), cosa que una celda de tabla no expresa;
 *  - la acción masiva ("aplicar las 6 sugerencias") no tiene dónde vivir en
 *    el contrato del DataTable.
 *
 * Presentacional puro: filtra, busca y agrupa la PÁGINA; el panel pinta y
 * avisa. Todos los combos son `ModernSelect` (nada de `<select>` nativo).
 */
export interface AssignmentPanelProps {
  /** Lados del mismo problema ("Reclamos" / "Trámites"). Omitido ⇒ sin tabs. */
  sides?: SegmentedOption[];
  activeSide?: string;
  onSideChange?: (id: string) => void;

  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;

  /**
   * Acción masiva de sugerencias ("Aplicar las 6 sugerencias"). Se pinta como
   * CTA primario del panel y sólo cuando hay algo que aplicar — un botón que
   * no hace nada enseña al usuario a ignorarlo.
   */
  bulkAction?: Action;

  filters?: FilterChip[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;

  /** Encabezados de las tres columnas. Default: entidad / "EN USO" / destino. */
  columnLabels?: { entity?: string; metric?: string; target?: string };

  /** Destinos elegibles (los mismos para todas las filas). */
  targets: AssignTarget[];
  groups: AssignGroup[];

  /** Eligió un destino para una fila (o aplicó su sugerencia). */
  onAssign: (rowId: string | number, targetValue: string) => void;
  /** Quitó la asignación. Omitido ⇒ el combo no ofrece vaciarse. */
  onClear?: (rowId: string | number) => void;

  /** Pie del panel: resumen a la izquierda, dato a la derecha. */
  footer?: { left?: string; right?: string };
  loading?: boolean;
  emptyMessage?: string;
}

/* --- Árbol -------------------------------------------------------------- */

/**
 * Nodo del árbol. La jerarquía es la de `children`: el componente calcula la
 * sangría y la tipografía por profundidad (rama fuerte arriba, hoja normal
 * abajo), así la página no manda medidas.
 */
export interface TreeNode {
  id: string;
  label: string;
  /** Tile de icono. Sin icono, el nodo queda con la sangría igual (alineado). */
  icon?: LucideIcon | ReactNode;
  /** Color del tile — runtime. */
  tileColor?: string;
  /** Renglón chico bajo el label ("3 categorías · 11 trámites"). */
  sub?: string;
  /** Píldora a la derecha del label ("6 trámites"). */
  chip?: { label: string; icon?: LucideIcon; tone?: ChipTone };
  /** Cifra a la derecha del nodo (costo, plazo, cantidad). */
  amount?: MetricCellData;
  /** Acciones del nodo (mismas reglas que RowAction: máximo 2 + menú). */
  actions?: RowAction<TreeNode>[];
  children?: TreeNode[];
  /** Fila punteada al final de los hijos ("+ Agregar categoría"). */
  addLabel?: string;
  onAdd?: () => void;
  /**
   * Panel que se despliega DEBAJO del nodo cuando está expandido y no tiene
   * hijos (el detalle de una hoja: requisitos, documentos, validaciones).
   * Excluyente con `children` en la práctica: si hay ambos, se pintan los dos
   * y manda el orden (hijos y después el detalle).
   */
  detail?: ReactNode;
}

/**
 * Árbol jerárquico con expandir/colapsar. Es el cuerpo "arbol" del canvas
 * (Dependencia → Categoría → Trámite → requisitos), pero no sabe nada de
 * trámites: sirve para cualquier estructura de 2+ niveles (organigrama,
 * plan de cuentas, categorías anidadas).
 *
 * Controlado si viene `expandedIds`; si no, se maneja solo desde
 * `defaultExpandedIds`. Se soportan las dos formas porque el "expandir todo"
 * de la toolbar necesita mandar desde afuera, pero un árbol chico no merece
 * que la página cargue con ese estado.
 */
export interface TreeListProps {
  nodes: TreeNode[];
  /** Modo controlado: ids expandidos. */
  expandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;
  /** Modo no controlado: qué arranca abierto. */
  defaultExpandedIds?: string[];
  /** Click en el cuerpo del nodo (abrir el detalle en un drawer). El chevron
   *  siempre expande, incluso con `onNodeClick` — son dos gestos distintos. */
  onNodeClick?: (node: TreeNode) => void;
  /** Pie del árbol ("11 dependencias · 42 trámites"). */
  footer?: string;
  loading?: boolean;
  emptyMessage?: string;
}

/* --- Grilla de tarjetas ------------------------------------------------- */

/** Cómo se ve UNA tarjeta. Lo arma la página a partir de su fila. */
export interface CardItem {
  title: string;
  subtitle?: string;
  icon?: LucideIcon | ReactNode;
  /** Color del tile — runtime (viene de datos). */
  tileColor?: string;
  /** Cifra grande de la tarjeta (lo que pesa este registro). */
  metric?: MetricCellData;
  /** Píldora de estado arriba a la derecha. */
  chip?: { label: string; tone?: ChipTone };
}

/**
 * Grilla de tarjetas: la MISMA lista que la tabla, en la otra vista del
 * segmented. No es un componente distinto por pantalla — es la vista 'cards'
 * del kit, y por eso toma las mismas piezas (entidad, métrica, acciones,
 * interruptor) que la fila de la tabla.
 *
 * Por qué existe: cada pantalla que quería tarjetas se maquetaba su grilla, y
 * terminábamos con seis tarjetas distintas para el mismo dato. El toggle
 * tabla/tarjetas del canvas sólo tiene sentido si las dos vistas son la misma
 * información con otra densidad.
 */
export interface CardGridProps<Row = unknown> {
  rows: Row[];
  rowKey: (row: Row) => string | number;
  /** Traduce una fila a lo que se ve en la tarjeta. */
  card: (row: Row) => CardItem;
  /** Mismas acciones que la tabla (máximo 2 visibles, sin menú). */
  actions?: RowAction<Row>[];
  /** Interruptor en el pie de la tarjeta (activo/inactivo). */
  toggle?: {
    checked: (row: Row) => boolean;
    onChange: (row: Row, value: boolean) => void;
    labelOn?: string;
    labelOff?: string;
  };
  onCardClick?: (row: Row) => void;
  loading?: boolean;
  emptyMessage?: string;
}

/* --- Pickers ------------------------------------------------------------ */

/** Punto de una escala ordinal (prioridad 1..5, riesgo bajo/alto). */
export interface ScaleStep {
  value: number;
  /** Label corto bajo el número ("Urgente", "Baja"). */
  label: string;
  /** Tiñe el punto elegido. Omitido ⇒ acento del theme. */
  veredicto?: Veredicto;
}

/**
 * Selector de escala ordinal: N cajas iguales con el número grande y su
 * label. Reemplaza al combo para escalas cortas — el usuario compara los
 * extremos de un vistazo en vez de desplegar una lista.
 */
export interface ScalePickerProps {
  steps: ScaleStep[];
  value: number | null;
  onChange: (value: number) => void;
  /** Renglón que explica qué implica lo elegido. Lo escribe la página. */
  note?: string;
  ariaLabel?: string;
}

/**
 * Picker de icono + color de una entidad del catálogo (categoría, tipo). Los
 * dos van juntos a propósito: lo que el usuario elige no es "un icono", es
 * cómo se va a ver la fila en la app del vecino, y eso se juzga con la
 * combinación puesta.
 *
 * Los iconos son nombres de lucide (los resuelve `DynamicIcon`), así el
 * catálogo de iconos lo define la app y no el componente. Los colores son
 * valores runtime que se guardan en la base.
 */
export interface IconColorPickerProps {
  /** Nombres lucide ofrecidos ("Wrench", "Trash2"…). */
  icons: string[];
  icon: string | null;
  onIconChange: (name: string) => void;
  /** Colores ofrecidos. Cada uno con su nombre para el tooltip. */
  colors: { name: string; value: string }[];
  color: string | null;
  onColorChange: (value: string) => void;
  /** Vista previa: cómo se ve la entidad con lo elegido. */
  preview?: { title: string; subtitle?: string };
  /** Nota al pie del picker (qué significa el color en esta app). */
  note?: string;
  /** Arranca cerrado y se abre con un botón: en un formulario largo, 40
   *  iconos desplegados tapan el resto de los campos. */
  collapsible?: boolean;
}
