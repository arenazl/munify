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
 * Hero (= SemanticHero existente, components/ui/SemanticHero.tsx)
 * ============================================================ */

/** Props del ModuleHero. Espeja el contrato del SemanticHero existente para
 *  poder hacer `<SemanticHero {...hero} />` directo, sin adaptadores. */
export interface ModuleHeroProps {
  /** Eyebrow del módulo en caps: "TESORERÍA · JULIO 2026". */
  etiqueta: string;
  /** Frases-veredicto (interpretan, no enumeran la stat strip). */
  frases: HeroFrase[];
  /** Stat strip DENTRO del hero (nada de KPIs sueltos arriba). */
  kpis?: HeroKpi[];
  className?: string;
}

/* ============================================================
 * Toolbar
 * ============================================================ */

export interface ListToolbarProps {
  /** H1 del listado (Sora/display 22px 700). */
  title: string;
  /** Chip pill con el total, `tnum`. */
  totalCount: number;
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
  /** ÚNICO CTA primario verde de la pantalla ("Nuevo pago"). */
  primaryAction: Action;
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
  /** Pista semántica para el render por defecto de la celda. */
  kind?: 'text' | 'entity' | 'chip' | 'date' | 'money' | 'actions';
  /** Render custom de la celda. Sin `cell`, el DataTable resuelve un render
   *  por defecto según `kind` (los agentes de Tabla lo documentan). */
  cell?: (row: Row) => ReactNode;
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
}

/* ============================================================
 * SemanticAbmPage — contrato público (flat, nombres del estándar)
 * ============================================================ */

export interface SemanticAbmPageProps<Row = unknown> {
  /* --- Identidad y copy --- */
  /** 'reclamos' | 'gastos' | 'agenda' | … (analytics, keys de persistencia). */
  moduleKey: string;
  hero: ModuleHeroProps;
  /** Borde izquierdo del hero: token CSS (`var(--pl-green)` por defecto,
   *  `var(--pl-red)` cuando el módulo está en alerta). NUNCA un hex literal. */
  accentColor?: string;

  /* --- Toolbar --- */
  title: string;
  totalCount: number;
  searchPlaceholder: string;
  views: ViewKind[];
  secondaryAction?: Action;
  primaryAction: Action;

  /* --- Filtros --- */
  selects: SelectSpec[];
  /** Omitir en listas sin fecha (Personal, Inventario). Obligatorio en money. */
  period?: PeriodControlValue;
  statusTabs: StatusTab[];
  filterSummary?: string;

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
