import { ReactNode, useState, useEffect } from 'react';
import { Plus, Search, Sparkles, LayoutGrid, List, ChevronDown, ArrowLeft, Wand2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { KpiRow, KpiSpec } from './KpiCard';
import { Sheet } from './Sheet';
import { ConfirmModal } from './ConfirmModal';
import { ModernSelect, type SelectOption } from './ModernSelect';

// =====================================================================
// Toolbar declarativo (API nueva, ver REINGENIERIA_ABMPAGE_TOOLBAR.md)
// =====================================================================

export interface ToolbarComboSpec {
  /** Key estable (ej: 'categoria'). */
  key: string;
  /** Placeholder + label del item ''. */
  placeholder: string;
  /** Valor seleccionado (controlled). */
  value: string;
  onChange: (v: string) => void;
  /** Opciones de ModernSelect. ABMPage agrega el item vacio. */
  options: SelectOption[];
  searchable?: boolean;
  /** Si false, no se renderiza. */
  visible?: boolean;
  /** Ancho minimo (px). Default 180. */
  minWidth?: number;
}

export interface ToolbarStatusPillsSpec {
  value: string;
  onChange: (v: string) => void;
  items: Array<{
    key: string;
    label: string;
    icon?: LucideIcon;
    color: string;
    count?: number;
  }>;
  /** Mostrar pill "Todos" outlined. Default true. */
  showTodos?: boolean;
  /** Count del "Todos". */
  todosCount?: number;
}

export interface ToolbarActionSpec {
  key: string;
  label: string;
  icon?: LucideIcon;
  active?: boolean;
  onClick: () => void;
  title?: string;
  visible?: boolean;
}

export interface AbmToolbar {
  combos?: ToolbarComboSpec[];
  statusPills?: ToolbarStatusPillsSpec;
  actions?: ToolbarActionSpec[];
  /** Slots custom (PeriodNavigator, DateRangePicker, etc) intercalados despues
   *  de los combos y antes de los pills. Cada item es un nodo React. */
  customAfterCombos?: ReactNode[];
  /** Lo mismo, pero al final (despues de los pills). */
  customAtEnd?: ReactNode[];
  /** 'left' = todo pegado a la izquierda. 'split' = combos izq, pills der. Default 'left'. */
  layout?: 'left' | 'split';
}

type ViewMode = 'cards' | 'table' | 'guided';

// Hook simple para detectar mobile (< 640px)
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

/**
 * Layout canonico para paginas tipo ABM (listado + crear/editar/ver en Sheet).
 * Es el componente de referencia para cualquier pagina de "tabla + botones".
 * Maneja: titulo + boton "Nuevo", buscador, filtros extra (chips, selects),
 * toggle entre vista cards y tabla, Sheet lateral opcional para
 * crear/editar/ver, empty state, loading, sticky header opcional y
 * back link opcional.
 *
 * Usar SIEMPRE para pantallas de ABM en lugar de armar la estructura a mano.
 * Las acciones de fila se manejan adentro de cada card/row; las acciones
 * globales (filtros, ordenamiento) van como `extraFilters` o `headerActions`.
 *
 * Patron canonico (ver BUILD_GUIDE.md §7.1):
 *   <ABMPage title="Cosas" searchValue={s} onSearchChange={setS} onAdd={...}>
 *     {items.map(item => <Card onClick={() => openSheet(item)} />)}
 *   </ABMPage>
 */
interface ABMPageProps {
  // Header
  title: string;
  icon?: ReactNode; // Icono decorativo del título (igual que StickyPageHeader)
  backLink?: string; // Link para volver (muestra flecha antes del título)
  buttonLabel?: string;
  buttonIcon?: ReactNode;
  onAdd?: () => void;

  // Search
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Ancho maximo del input de busqueda (px). Si no se setea ocupa flex-1. */
  searchMaxWidth?: number;

  // Extra filters (opcional)
  extraFilters?: ReactNode;
  filters?: ReactNode; // Alias para compatibilidad

  // Header actions - botones extra junto al toggle de vista (ej: ordenamiento)
  headerActions?: ReactNode;

  // Secondary filters bar (opcional - barra completa debajo del header).
  // LEGACY: preferir `toolbar` declarativo.
  secondaryFilters?: ReactNode;

  /** Toolbar declarativo. Si se pasa, ABMPage renderiza combos+pills+actions
   *  de forma estandar y NO se usan `secondaryFilters` ni `headerActions`.
   *  Las paginas viejas siguen con la API legacy. */
  toolbar?: AbmToolbar;

  // Grid
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;

  // Loading
  loading?: boolean;

  // Paginacion (opt-in). Si se pasa, renderiza un footer con
  // navegacion de paginas + selector de page size. Si no, no se muestra
  // nada (compat con paginas que cargan todo client-side).
  pagination?: {
    page: number;          // 1-based
    pageSize: number;      // items por pagina
    totalItems: number;    // total filtrado (despues de search/filters server-side)
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    /** Opciones de page size (default [25, 50, 100, 200]) */
    pageSizeOptions?: number[];
  };

  // Slot opcional que se renderiza ARRIBA del paginator (totalizadores,
  // resumenes del filtro activo, etc). Va dentro del mismo flujo del footer
  // para mantener los margenes/centrado alineados con el resto del contenido.
  paginationSummary?: ReactNode;

  // Fila de KPIs arriba del header. Acepta dos formatos:
  //   - ReactNode (legacy): la pagina arma su propio JSX libre.
  //   - KpiSpec[]: array de specs (max 4) que ABMPage renderiza con <KpiRow>
  //     outlined estandar. Es la API recomendada nueva.
  kpis?: ReactNode | KpiSpec[];

  // Agrupacion opcional por algun key (ej: fecha ISO). Cuando se pasa,
  // ABMPage inserta separadores entre grupos en la vista cards (full-row)
  // y en la tabla (filas separadoras). Para que funcione, la pagina debe
  // pasar `items` ordenados — ABMPage NO reordena.
  groupBy?: {
    /** items debe venir ordenado (asc o desc, segun la pagina). */
    items: any[];
    /** key del grupo (ej: '2026-05-09'). */
    getKey: (item: any) => string;
    /** Label a la izquierda del header (ej: 'Hoy · 4 movimientos'). */
    renderLabel: (key: string, items: any[]) => ReactNode;
    /** Subtotal a la derecha del header (ej: '$13.565.000'). Opcional. */
    renderSubtotal?: (key: string, items: any[]) => ReactNode;
    /**
     * Render de cada item dentro del grupo. Devolver el JSX de la card o
     * fila de tabla. Si no se pasa, ABMPage cae en `children` (compat).
     */
    renderItem?: (item: any, indexInGroup: number) => ReactNode;
  };

  // Panel lateral derecho (solo desktop, lg+). Si se pasa, el grid de cards
  // se reduce a 2 columnas (en lg) y el panel queda a la derecha como
  // columna fija de ancho `sidePanelWidth` (default 360px).
  sidePanel?: ReactNode;
  sidePanelWidth?: number;

  // Sheet (opcional - para páginas que manejan su propio Sheet)
  sheetOpen?: boolean;
  sheetTitle?: string;
  sheetDescription?: string;
  sheetContent?: ReactNode;
  sheetFooter?: ReactNode;
  onSheetClose?: () => void;

  // Vista tabla (opcional)
  tableView?: ReactNode;

  // Vista guiada (opcional). Cuando se pasa, aparece un 3er boton en el
  // toggle de vista (icono varita magica) y al seleccionarlo se renderiza
  // este contenido en lugar de cards/table. Sirve para layouts Inbox/Wizard
  // que muestran la misma data con otro enfoque.
  guidedView?: ReactNode;

  /** Clave de localStorage para persistir la vista elegida. Si se pasa,
   * la eleccion sobrevive recargas (ej: "tramites_view"). */
  viewStorageKey?: string;

  /** Callback cuando el usuario cambia la vista. Util para que el parent
   * re-fetche con limits diferentes (ej: inbox carga 500, grilla 50). */
  onViewModeChange?: (mode: ViewMode) => void;

  // Sección de deshabilitados (se muestra en ambas vistas)
  disabledSection?: ReactNode;

  // Vista por defecto
  defaultViewMode?: ViewMode;

  // Header sticky (fijo al hacer scroll)
  stickyHeader?: boolean;
}

export function ABMPage({
  title,
  icon,
  backLink,
  buttonLabel,
  buttonIcon,
  onAdd,
  searchPlaceholder = 'Buscar...',
  searchMaxWidth,
  searchValue,
  onSearchChange,
  extraFilters,
  filters,
  headerActions,
  secondaryFilters,
  toolbar,
  children,
  emptyMessage = 'No se encontraron resultados',
  isEmpty = false,
  loading = false,
  pagination,
  paginationSummary,
  kpis,
  groupBy,
  sidePanel,
  sidePanelWidth = 280,
  sheetOpen,
  sheetTitle,
  sheetDescription,
  sheetContent,
  sheetFooter,
  onSheetClose,
  tableView,
  guidedView,
  viewStorageKey,
  onViewModeChange,
  disabledSection,
  defaultViewMode,
  stickyHeader = true,
}: ABMPageProps) {
  // Combinar filters con extraFilters para compatibilidad
  const allFilters = filters || extraFilters;
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  // Si no hay tableView, defaultear a 'cards' para evitar pantalla vacía.
  // Si se paso viewStorageKey, restaurar la vista guardada.
  const resolvedDefaultViewMode: ViewMode = (() => {
    if (typeof window !== 'undefined' && viewStorageKey) {
      const saved = localStorage.getItem(viewStorageKey) as ViewMode | null;
      if (saved && ['cards', 'table', 'guided'].includes(saved)) {
        // Validar que la vista guardada sea posible (sino fallback)
        if (saved === 'guided' && !guidedView) return 'cards';
        if (saved === 'table' && !tableView) return 'cards';
        return saved;
      }
    }
    return defaultViewMode || (guidedView ? 'guided' : (tableView ? 'table' : 'cards'));
  })();
  const [viewMode, setViewModeState] = useState<ViewMode>(resolvedDefaultViewMode);
  const setViewMode = (m: ViewMode) => {
    setViewModeState(m);
    if (typeof window !== 'undefined' && viewStorageKey) {
      localStorage.setItem(viewStorageKey, m);
    }
    onViewModeChange?.(m);
  };

  // Notificar al parent del modo inicial (para que sincronice fetch limits, etc)
  useEffect(() => {
    onViewModeChange?.(viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [searchFocused, setSearchFocused] = useState(false);

  // En mobile, siempre usar cards (mejor UX que tabla). La vista guiada
  // se respeta porque tipicamente esta diseñada para todos los anchos.
  const effectiveViewMode: ViewMode = isMobile && viewMode === 'table' ? 'cards' : viewMode;

  // Spinner full-page SOLO en carga inicial (cuando no hay nada para mostrar
  // todavía). Si hay paginacion, NO usamos este spinner — el footer ya tiene
  // su propio indicador y los items previos se mantienen visibles mientras
  // llegan los nuevos (sin flicker en blanco).
  if (loading && !pagination && isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div
            className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent"
            style={{ borderColor: `${theme.primary}33`, borderTopColor: theme.primary }}
          />
          <Sparkles
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse"
            style={{ color: theme.primary }}
          />
        </div>
        <p className="text-sm animate-pulse" style={{ color: theme.textSecondary }}>Cargando...</p>
      </div>
    );
  }

  // Agrupacion: pre-computa los grupos en orden de aparicion de items.
  // ABMPage NO ordena — confia en el orden que viene de la pagina.
  const groupedItems = (() => {
    if (!groupBy) return null;
    const groups: { key: string; items: any[] }[] = [];
    const map = new Map<string, any[]>();
    for (const it of groupBy.items) {
      const k = groupBy.getKey(it);
      if (!map.has(k)) {
        const arr: any[] = [];
        map.set(k, arr);
        groups.push({ key: k, items: arr });
      }
      map.get(k)!.push(it);
    }
    return groups;
  })();

  // -------------------------------------------------------------------
  // Render del toolbar declarativo (combos + status pills + actions).
  // Layout 'left': todo pegado a la izquierda en una fila.
  // Layout 'split': combos a la izquierda, pills a la derecha (justify-between).
  // Si toolbar.actions tiene items, van junto al toggle de vista (no aca).
  // -------------------------------------------------------------------
  const renderToolbarFilters = (): ReactNode => {
    if (!toolbar) return null;
    const { combos = [], statusPills, customAfterCombos = [], customAtEnd = [], layout = 'left' } = toolbar;
    const visibleCombos = combos.filter(c => c.visible !== false);
    const hasPills = !!statusPills;
    if (visibleCombos.length === 0 && !hasPills && customAfterCombos.length === 0 && customAtEnd.length === 0) return null;

    return (
      <div className={`flex flex-wrap items-center gap-2 ${layout === 'split' ? 'justify-between' : 'justify-start'}`}>
        {visibleCombos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {visibleCombos.map(c => (
              <div key={c.key} style={{ minWidth: c.minWidth || 180 }} className="flex-shrink-0">
                <ModernSelect
                  value={c.value}
                  onChange={c.onChange}
                  options={[{ value: '', label: c.placeholder }, ...c.options]}
                  placeholder={c.placeholder}
                  searchable={c.searchable !== false}
                />
              </div>
            ))}
          </div>
        )}
        {customAfterCombos.map((node, i) => (
          <div key={`tb-after-${i}`} className="flex-shrink-0">{node}</div>
        ))}
        {hasPills && renderStatusPills(statusPills!)}
        {customAtEnd.map((node, i) => (
          <div key={`tb-end-${i}`} className="flex-shrink-0">{node}</div>
        ))}
      </div>
    );
  };

  const renderStatusPills = (spec: ToolbarStatusPillsSpec): ReactNode => {
    const { value, onChange, items, showTodos = true, todosCount } = spec;
    const totalCount = todosCount != null
      ? todosCount
      : items.reduce((acc, it) => acc + (it.count || 0), 0);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {showTodos && (
          <button
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full text-[11px] font-semibold transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: value === '' ? `${theme.primary}15` : 'transparent',
              border: `1px solid ${value === '' ? theme.primary : theme.border}`,
              color: value === '' ? theme.primary : theme.textSecondary,
            }}
          >
            Todos {totalCount > 0 && <span className="opacity-70">({totalCount})</span>}
          </button>
        )}
        {items.map(it => {
          const active = it.key === value;
          const hasItems = (it.count || 0) > 0;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full text-[11px] font-semibold transition-all hover:scale-105 active:scale-95"
              style={{
                backgroundColor: active ? `${it.color}20` : 'transparent',
                border: `1px solid ${active ? it.color : theme.border}`,
                color: active ? it.color : (hasItems ? theme.text : theme.textSecondary),
                opacity: hasItems ? 1 : 0.45,
              }}
              title={it.label}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {it.label}
              {hasItems && <span className="opacity-70">({it.count})</span>}
            </button>
          );
        })}
      </div>
    );
  };

  const renderToolbarActions = (): ReactNode => {
    if (!toolbar?.actions || toolbar.actions.length === 0) return null;
    return (
      <div className="flex items-center gap-1.5">
        {toolbar.actions.filter(a => a.visible !== false).map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={a.onClick}
              title={a.title || a.label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
              style={{
                backgroundColor: a.active ? `${theme.primary}15` : theme.backgroundSecondary,
                border: `1px solid ${a.active ? theme.primary : theme.border}`,
                color: a.active ? theme.primary : theme.textSecondary,
              }}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {a.label}
            </button>
          );
        })}
      </div>
    );
  };

  // Si se pasa `toolbar`, sobreescribe a `headerActions` y `secondaryFilters`.
  const effectiveHeaderActions = toolbar ? renderToolbarActions() : headerActions;
  const effectiveSecondaryFilters = toolbar ? renderToolbarFilters() : secondaryFilters;

  return (
    <div className="space-y-6 pb-4" style={{ touchAction: 'pan-y' }}>
      {/* KPIs (opt-in). Si es un array de KpiSpec, lo renderizamos con KpiRow
          (look outlined estandar, hard-limit 4). Si es un ReactNode arma JSX
          libre. Se wrappea con el mismo padding-x que usa el sticky header,
          asi quedan visualmente alineados al toolbar del ABM (no full-bleed). */}
      {kpis && (
        <div className="px-3 sm:px-6 lg:px-8 -mx-3 sm:-mx-6 lg:-mx-8">
          {Array.isArray(kpis)
            ? <KpiRow kpis={kpis as KpiSpec[]} />
            : <div>{kpis}</div>}
        </div>
      )}

      {/* Contenedor sticky para header y secondary filters - usando CSS sticky puro */}
      <div
        className={stickyHeader ? 'sticky top-0 z-30 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 pt-1 pb-1' : ''}
        style={{
          backgroundColor: stickyHeader ? theme.background : 'transparent',
        }}
      >
        {/* Header unificado: Título + Buscador + Filtros + Botón en una línea */}
        <div
          className={`px-5 py-3 relative overflow-hidden ${effectiveSecondaryFilters ? 'rounded-t-xl' : 'rounded-xl'}`}
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderBottom: effectiveSecondaryFilters ? 'none' : `1px solid ${theme.border}`,
          }}
        >
        <div className="flex items-center gap-2 sm:gap-3 relative z-10 flex-wrap sm:flex-nowrap">
          {/* BackLink + Icono + Título - se oculta cuando el search está enfocado en mobile */}
          <div className={`hidden sm:flex items-center gap-2 flex-shrink-0 transition-all duration-300 ${searchFocused ? 'hidden sm:flex' : ''}`}>
            {backLink && (
              <Link
                to={backLink}
                className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
                style={{
                  backgroundColor: `${theme.primary}15`,
                  color: theme.primary
                }}
                title="Volver"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            {icon && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${theme.primary}15` }}
              >
                <span style={{ color: theme.primary }}>{icon}</span>
              </div>
            )}
            <h1 className="text-lg font-bold tracking-tight" style={{ color: theme.text }}>
              {title}
            </h1>
          </div>

          {/* Separador vertical - se oculta en mobile cuando search enfocado */}
          <div className={`h-8 w-px hidden sm:block ${searchFocused ? 'sm:hidden md:block' : ''}`} style={{ backgroundColor: theme.border }} />

          {/* Buscador que se expande en mobile al focus */}
          <div
            className={`relative group transition-all duration-300 ${searchFocused ? 'flex-1' : 'flex-1 sm:flex-1'}`}
            style={searchMaxWidth ? { maxWidth: searchMaxWidth, flex: '0 1 auto', width: '100%' } : undefined}
          >
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-all duration-300 group-focus-within:scale-110"
              style={{ color: theme.textSecondary }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full h-[34px] pl-8 pr-3 rounded-lg text-[12px] focus:ring-2 focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: theme.background,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          {/* Botón + mobile - al lado del search */}
          {onAdd && buttonLabel && (
            <button
              onClick={onAdd}
              className="sm:hidden p-2 rounded-lg transition-all active:scale-95 flex-shrink-0"
              style={{
                backgroundColor: theme.primary,
                color: '#ffffff',
              }}
            >
              <Plus className="h-5 w-5" />
            </button>
          )}

          {/* Toggle Vista (cards / table / guided) - solo desktop */}
          {(tableView || guidedView) && (
            <div
              className="hidden sm:flex items-center rounded-lg p-1 flex-shrink-0"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <button
                onClick={() => setViewMode('cards')}
                className={`relative p-2 rounded-md transition-all duration-300 ease-out ${viewMode === 'cards' ? 'text-white' : ''}`}
                style={{ color: viewMode === 'cards' ? '#ffffff' : theme.textSecondary }}
                title="Vista tarjetas"
              >
                {viewMode === 'cards' && (
                  <div className="absolute inset-0 rounded-md transition-all duration-300 ease-out"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                      boxShadow: `0 2px 8px ${theme.primary}40`,
                    }}
                  />
                )}
                <LayoutGrid className="h-4 w-4 relative z-10" />
              </button>
              {tableView && (
                <button
                  onClick={() => setViewMode('table')}
                  className={`relative p-2 rounded-md transition-all duration-300 ease-out ${viewMode === 'table' ? 'text-white' : ''}`}
                  style={{ color: viewMode === 'table' ? '#ffffff' : theme.textSecondary }}
                  title="Vista tabla"
                >
                  {viewMode === 'table' && (
                    <div className="absolute inset-0 rounded-md transition-all duration-300 ease-out"
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                        boxShadow: `0 2px 8px ${theme.primary}40`,
                      }}
                    />
                  )}
                  <List className="h-4 w-4 relative z-10" />
                </button>
              )}
              {guidedView && (
                <button
                  onClick={() => setViewMode('guided')}
                  className={`relative p-2 rounded-md transition-all duration-300 ease-out ${viewMode === 'guided' ? 'text-white' : ''}`}
                  style={{ color: viewMode === 'guided' ? '#ffffff' : theme.textSecondary }}
                  title="Vista guiada"
                >
                  {viewMode === 'guided' && (
                    <div className="absolute inset-0 rounded-md transition-all duration-300 ease-out"
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                        boxShadow: `0 2px 8px ${theme.primary}40`,
                      }}
                    />
                  )}
                  <Wand2 className="h-4 w-4 relative z-10" />
                </button>
              )}
            </div>
          )}

          {/* Contenedor para headerActions + Botón Nuevo - siempre juntos */}
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            {/* Header Actions (ordenamiento, etc). Si hay toolbar, usa sus actions. */}
            {effectiveHeaderActions}

            {/* Botón agregar */}
            {onAdd && buttonLabel && (
              <button
                onClick={onAdd}
                className={`
                  inline-flex items-center h-[34px] px-3 rounded-lg font-semibold text-[12px]
                  transition-all duration-300 ease-out
                  hover:scale-105 hover:-translate-y-0.5
                  active:scale-95
                  group
                  relative overflow-hidden
                  flex-shrink-0
                `}
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                  color: '#ffffff',
                  boxShadow: `0 4px 14px ${theme.primary}40`,
                }}
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                {buttonIcon || <Plus className="h-4 w-4 mr-1.5 transition-transform duration-300 group-hover:rotate-90" />}
                {buttonLabel}
              </button>
            )}
          </div>

          {/* Filtros extra - en mobile van debajo */}
          {allFilters && (
            <div className={`flex-shrink-0 abm-filter-wrapper overflow-x-auto transition-all duration-300 hidden sm:block`} style={{ scrollbarWidth: 'none' }}>
              <style>{`
                .abm-filter-wrapper select {
                  background: linear-gradient(135deg, ${theme.backgroundSecondary} 0%, ${theme.card} 100%);
                  border: 1px solid ${theme.border};
                  color: ${theme.text};
                  font-weight: 500;
                  padding: 0.5rem 2rem 0.5rem 1rem;
                  border-radius: 0.5rem;
                  font-size: 0.875rem;
                  cursor: pointer;
                  transition: all 0.2s;
                }
                .abm-filter-wrapper select:hover {
                  border-color: ${theme.primary};
                  box-shadow: 0 0 0 2px ${theme.primary}20;
                }
                .abm-filter-wrapper select:focus {
                  outline: none;
                  border-color: ${theme.primary};
                  box-shadow: 0 0 0 3px ${theme.primary}30;
                }
              `}</style>
              {allFilters}
            </div>
          )}

        </div>

          {/* Mobile: Filtros extra */}
          {allFilters && (
            <div className="flex sm:hidden mt-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {allFilters}
            </div>
          )}
        </div>

        {/* Secondary Filters Bar (full width) - dentro del sticky container.
            Wrapper responsive: horizontal-scroll si no entra, scrollbar oculto.
            Esto previene el bug de chips/combos apilados verticalmente en tablet/mobile
            cuando una pagina pone `flex-wrap` adentro. */}
        {effectiveSecondaryFilters && (
          <div
            className="rounded-b-xl p-2.5 abm-secondary-filters-wrap"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderTop: 'none',
            }}
          >
            <style>{`
              /* Wrapper interno: row horizontal con scroll-x cuando no entra */
              .abm-secondary-filters-wrap > div {
                overflow-x: auto;
                overflow-y: visible;
                scrollbar-width: none;
                gap: 8px;
                align-items: center;
              }
              .abm-secondary-filters-wrap > div::-webkit-scrollbar {
                display: none;
              }
              /* Si la pagina puso flex-wrap directamente, lo neutralizamos
                 — el ROW se mantiene horizontal con scroll. */
              .abm-secondary-filters-wrap > div.flex-wrap {
                flex-wrap: nowrap !important;
              }
              /* TODOS los controles del header tienen alto canonico 34px
                 y tipografia 12px para que se vean homogeneos.
                 Esto aplica a botones, ModernSelect triggers, DatePickers,
                 chips/pildoras, etc. */
              .abm-secondary-filters-wrap button,
              .abm-secondary-filters-wrap input:not([type="checkbox"]):not([type="radio"]) {
                min-height: 34px;
                font-size: 12px;
              }
              /* Las pildoras-chip que ya tienen text-xs (estados con badge)
                 quedan organicas: matchean alto pero conservan su tipografia */
              .abm-secondary-filters-wrap .text-xs,
              .abm-secondary-filters-wrap [data-pill="true"] {
                font-size: 11px;
              }
              /* Cada hijo directo no se aplasta */
              .abm-secondary-filters-wrap > div > * {
                flex-shrink: 0;
              }
              /* Mobile: padding lateral interno para que el primer/ultimo
                 elemento no quede pegado al borde durante el scroll */
              @media (max-width: 640px) {
                .abm-secondary-filters-wrap > div {
                  padding-left: 2px;
                  padding-right: 2px;
                  scroll-padding-left: 8px;
                  scroll-padding-right: 8px;
                }
              }
            `}</style>
            {effectiveSecondaryFilters}
          </div>
        )}
      </div>

      {/* Mini hint sobre el toggle de vistas (cards/table/guided).
          Se muestra una sola vez por usuario, dismissable, y solo si hay
          al menos 2 vistas disponibles. Aplica a TODAS las pantallas
          que usan ABMPage. */}
      {(tableView || guidedView) && <ViewToggleHint hasGuided={!!guidedView} hasTable={!!tableView} />}

      {/* Grid de contenido. Solo renderizamos la vista activa para que la
          altura de la pagina sea exactamente la de su contenido (sin
          espacio blanco al final por vistas inactivas con position:absolute
          que igual contribuian a la altura virtual via children render). */}
      {!isEmpty ? (
        <div className={`mt-4 ${sidePanel ? 'lg:flex lg:gap-4' : ''}`}>
          {/* Columna principal: lista (cards/table/guided) */}
          <div className={sidePanel ? 'flex-1 min-w-0' : ''}>
            {effectiveViewMode === 'cards' && (
              <div className="animate-in fade-in duration-200">
                {groupedItems && groupBy?.renderItem ? (
                  // Cards agrupadas por grupo. Cada grupo: header sticky
                  // [label · subtotal] + grid de cards del grupo.
                  <div className="space-y-4">
                    {groupedItems.map((g) => (
                      <div key={g.key}>
                        <div
                          className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2 rounded-lg mb-3"
                          style={{
                            backgroundColor: theme.backgroundSecondary,
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          <div className="text-sm font-semibold" style={{ color: theme.text }}>
                            {groupBy.renderLabel(g.key, g.items)}
                          </div>
                          {groupBy.renderSubtotal && (
                            <div className="text-sm font-bold tabular-nums" style={{ color: theme.text }}>
                              {groupBy.renderSubtotal(g.key, g.items)}
                            </div>
                          )}
                        </div>
                        <div
                          className={
                            sidePanel
                              ? 'grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5'
                              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5'
                          }
                        >
                          {g.items.map((it, i) => groupBy.renderItem!(it, i))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Compat: children como siempre.
                  <div
                    className={
                      sidePanel
                        ? 'grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5'
                        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5'
                    }
                  >
                    {children}
                  </div>
                )}
              </div>
            )}
            {effectiveViewMode === 'table' && tableView && (
              <div className="animate-in fade-in duration-200">
                {tableView}
              </div>
            )}
            {effectiveViewMode === 'guided' && guidedView && (
              <div className="animate-in fade-in duration-200">
                {guidedView}
              </div>
            )}

            {/* Sección de deshabilitados - visible en ambas vistas */}
            {disabledSection}
          </div>

          {/* Panel lateral derecho (solo desktop lg+). */}
          {sidePanel && (
            <aside
              className="hidden lg:block flex-shrink-0"
              style={{ width: sidePanelWidth }}
            >
              {sidePanel}
            </aside>
          )}
        </div>
      ) : (
        <div
          className="text-center py-16 rounded-xl flex flex-col items-center gap-4"
          style={{ backgroundColor: theme.card, color: theme.textSecondary }}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.backgroundSecondary }}>
            <Search className="h-8 w-8" style={{ color: theme.textSecondary }} />
          </div>
          <p className="text-lg">{emptyMessage}</p>
        </div>
      )}

      {/* Footer area (opt-in). Orden: paginationSummary (totalizador) ARRIBA,
          paginator ABAJO. Ambos comparten margenes para quedar alineados. */}
      {paginationSummary && (
        <div className="mt-3">{paginationSummary}</div>
      )}
      {pagination && pagination.totalItems > pagination.pageSize && (
        <PaginationFooter pagination={pagination} loading={loading} />
      )}

      {/* Side Modal (solo si se proporcionan las props) */}
      {onSheetClose && (
        <Sheet
          open={sheetOpen || false}
          onClose={onSheetClose}
          title={sheetTitle || ''}
          description={sheetDescription}
          stickyFooter={sheetFooter}
        >
          {sheetContent}
        </Sheet>
      )}
    </div>
  );
}

// Componente Card para usar dentro del ABMPage
interface ABMCardProps {
  children: ReactNode;
  onClick?: () => void;
  index?: number;
}

export function ABMCard({ children, onClick, index = 0 }: ABMCardProps) {
  const { theme } = useTheme();

  return (
    <div
      onClick={onClick}
      className={`
        rounded-2xl p-4 sm:p-5
        ${onClick ? 'cursor-pointer' : ''}
        group
        relative
        overflow-hidden
        animate-fade-in-up
        touch-manipulation
        abm-card-hover
      `}
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        color: theme.text,
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
        // Variables CSS para usar en las animaciones
        ['--card-primary' as string]: theme.primary,
        ['--card-border' as string]: theme.border,
      }}
    >
      {/* Animated border glow - sutil */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}15, transparent 60%, ${theme.primary}10)`,
          transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Shine effect that moves on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none overflow-hidden rounded-2xl"
        style={{
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          className="absolute -inset-full group-hover:translate-x-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${theme.primary}10, transparent)`,
            transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: 'translateX(-100%)',
          }}
        />
      </div>

      {/* Subtle inner shadow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{
          boxShadow: `inset 0 1px 1px ${theme.primary}10, inset 0 -1px 1px ${theme.primary}05`,
          transition: 'opacity 0.4s ease',
        }}
      />

      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

// Componente para botones de acción en las cards con animaciones
interface ABMCardActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  children?: ReactNode;
}

// Botón de acción individual para cards (interno)
function CardActionButton({
  onClick,
  variant,
  title,
  children
}: {
  onClick: () => void;
  variant: 'primary' | 'danger';
  title: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 400);
    onClick();
  };

  const baseColor = variant === 'danger' ? '#ef4444' : theme.primary;

  return (
    <button
      onClick={handleClick}
      className={`
        p-2 rounded-lg transition-all duration-200
        hover:scale-110 active:scale-95
        relative overflow-hidden
        ${isAnimating ? 'animate-table-action-click' : ''}
      `}
      style={{ color: baseColor }}
      title={title}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${baseColor}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Ripple effect */}
      {isAnimating && (
        <span
          className="absolute inset-0 animate-ripple-effect rounded-lg"
          style={{ backgroundColor: `${baseColor}40` }}
        />
      )}
      {/* Icon with animation on click */}
      <span className={`relative z-10 block transition-transform duration-300 ${isAnimating ? 'scale-125 rotate-12' : ''}`}>
        {children}
      </span>
    </button>
  );
}

export function ABMCardActions({ onEdit, onDelete, children }: ABMCardActionsProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleConfirmDelete = () => {
    setShowConfirm(false);
    onDelete?.();
  };

  const handleCloseConfirm = () => {
    setShowConfirm(false);
  };

  return (
    <>
      <div className="flex space-x-1">
        {children}
        {onEdit && (
          <CardActionButton onClick={onEdit} variant="primary" title="Editar">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </CardActionButton>
        )}
        {onDelete && (
          <button
            onClick={handleDeleteClick}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ color: '#ef4444' }}
            title="Eliminar"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef444420';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={handleCloseConfirm}
        onConfirm={handleConfirmDelete}
        title="Confirmar eliminacion"
        message="¿Estas seguro de que deseas desactivar este elemento? Esta accion se puede revertir."
        confirmText="Desactivar"
        cancelText="Cancelar"
        variant="danger"
      />
    </>
  );
}

// Footer estándar para el Sheet
interface ABMSheetFooterProps {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
}

export function ABMSheetFooter({ onCancel, onSave, saving = false, saveLabel = 'Guardar' }: ABMSheetFooterProps) {
  const { theme } = useTheme();

  return (
    <div className="flex justify-end space-x-3">
      <button
        onClick={onCancel}
        className="px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ border: `1px solid ${theme.border}`, color: theme.text }}
      >
        Cancelar
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-5 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 relative overflow-hidden group"
        style={{ backgroundColor: theme.primary, color: '#ffffff' }}
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <span className="relative">{saving ? 'Guardando...' : saveLabel}</span>
      </button>
    </div>
  );
}

// Badge/Chip para estados con animación
interface ABMBadgeProps {
  active?: boolean;
  label?: string;
  activeLabel?: string;
  inactiveLabel?: string;
}

export function ABMBadge({ active = true, label, activeLabel, inactiveLabel }: ABMBadgeProps) {
  const displayLabel = label || (active ? (activeLabel || 'Activo') : (inactiveLabel || 'Inactivo'));
  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap
      transition-all duration-300
      ${active
        ? 'bg-green-500/20 text-green-400'
        : 'bg-red-500/20 text-red-400'
      }
    `}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      {displayLabel}
    </span>
  );
}

// Input con estilos de tema
interface ABMInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
}

export function ABMInput({ label, required, className = '', ...props }: ABMInputProps) {
  const { theme } = useTheme();

  return (
    <div className="group">
      {label && (
        <label className="block text-sm font-medium mb-2 transition-colors duration-200" style={{ color: theme.textSecondary }}>
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input
        {...props}
        className={`
          w-full rounded-xl px-4 py-2.5
          focus:ring-2 focus:outline-none
          transition-all duration-300
          focus:shadow-lg focus:-translate-y-0.5
          ${className}
        `}
        style={{
          backgroundColor: theme.backgroundSecondary,
          color: theme.text,
          border: `1px solid ${theme.border}`,
        }}
      />
    </div>
  );
}

// Textarea con estilos de tema
interface ABMTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function ABMTextarea({ label, className = '', ...props }: ABMTextareaProps) {
  const { theme } = useTheme();

  return (
    <div className="group">
      {label && (
        <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
          {label}
        </label>
      )}
      <textarea
        {...props}
        className={`
          w-full rounded-xl px-4 py-3
          focus:ring-2 focus:outline-none
          transition-all duration-300
          focus:shadow-lg
          resize-none
          ${className}
        `}
        style={{
          backgroundColor: theme.backgroundSecondary,
          color: theme.text,
          border: `1px solid ${theme.border}`,
        }}
      />
    </div>
  );
}

// Select con estilos de tema
interface ABMSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

export function ABMSelect({ label, options, placeholder, className = '', ...props }: ABMSelectProps) {
  const { theme } = useTheme();

  return (
    <div className="group">
      {label && (
        <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
          {label}
        </label>
      )}
      <select
        {...props}
        className={`
          w-full rounded-xl px-4 py-2.5
          focus:ring-2 focus:outline-none
          transition-all duration-300
          focus:shadow-lg
          appearance-none
          bg-no-repeat bg-right
          ${className}
        `}
        style={{
          backgroundColor: theme.backgroundSecondary,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23888'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          backgroundSize: '1.5rem',
          backgroundPosition: 'right 0.75rem center',
          paddingRight: '2.5rem',
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// Panel colapsable para side modals
interface ABMCollapsibleProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}

// All variants now use theme-aware colors derived from theme.primary
// This ensures consistent styling across all themes

export function ABMCollapsible({ title, icon, children, defaultOpen = false, variant = 'default' }: ABMCollapsibleProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // All variants use theme-aware colors derived from theme.primary
  let bgColor: string;
  let borderColor: string;
  let textColor: string;

  if (variant === 'default') {
    bgColor = theme.backgroundSecondary;
    borderColor = theme.border;
    textColor = theme.text;
  } else {
    // All semantic variants (info, success, warning, danger) use theme.primary
    bgColor = `${theme.primary}15`;
    borderColor = `${theme.primary}40`;
    textColor = theme.text;
  }

  return (
    <div
      className="rounded-lg overflow-hidden transition-all duration-200"
      style={{ border: `1px solid ${borderColor}` }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 transition-colors duration-200 hover:opacity-90"
        style={{ backgroundColor: `${theme.background}ee`, color: theme.primary }}
        type="button"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          {icon}
          {title}
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: theme.primary }}
        />
      </button>
      <div
        className={`
          transition-all duration-200 ease-out overflow-hidden
          ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className="px-3 py-2.5" style={{ backgroundColor: theme.card }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Panel de información (no colapsable, solo visual)
interface ABMInfoPanelProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}

export function ABMInfoPanel({ title, icon, children, variant = 'default' }: ABMInfoPanelProps) {
  const { theme } = useTheme();

  // All variants use theme-aware colors derived from theme.primary
  let bgColor: string;
  let borderColor: string;
  let textColor: string;

  if (variant === 'default') {
    bgColor = theme.backgroundSecondary;
    borderColor = theme.border;
    textColor = theme.text;
  } else {
    // All semantic variants (info, success, warning, danger) use theme.primary
    bgColor = `${theme.primary}15`;
    borderColor = `${theme.primary}40`;
    textColor = theme.text;
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${borderColor}`,
      }}
    >
      {title && (
        <div
          className="flex items-center gap-2 font-bold text-sm px-3 py-1.5"
          style={{ backgroundColor: `${theme.background}ee`, color: theme.primary }}
        >
          {icon}
          {title}
        </div>
      )}
      <div className="px-3 py-2" style={{ backgroundColor: bgColor, color: theme.text }}>
        {children}
      </div>
    </div>
  );
}

// Campo de información de solo lectura - estilo moderno en una línea
interface ABMFieldProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function ABMField({ label, value, icon, fullWidth = false }: ABMFieldProps) {
  const { theme } = useTheme();

  return (
    <div className={`flex items-center gap-2.5 py-1 ${fullWidth ? 'w-full' : ''}`}>
      {icon && (
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0 leading-tight">
        <p className="text-[11px] font-medium" style={{ color: theme.textSecondary }}>{label}</p>
        <p className="text-sm font-medium truncate" style={{ color: theme.text }}>{value}</p>
      </div>
    </div>
  );
}

// Grid de campos para organizar múltiples ABMFields
interface ABMFieldGridProps {
  children: ReactNode;
  columns?: 1 | 2;
}

export function ABMFieldGrid({ children, columns = 2 }: ABMFieldGridProps) {
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {children}
    </div>
  );
}

// Separador con título opcional
interface ABMDividerProps {
  title?: string;
}

export function ABMDivider({ title }: ABMDividerProps) {
  const { theme } = useTheme();

  if (title) {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="h-px flex-1" style={{ backgroundColor: theme.border }} />
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: theme.textSecondary }}>
          {title}
        </span>
        <div className="h-px flex-1" style={{ backgroundColor: theme.border }} />
      </div>
    );
  }

  return <div className="h-px my-4" style={{ backgroundColor: theme.border }} />;
}

// Componente Tabla genérica para ABM con ordenamiento
export interface ABMTableColumn<T> {
  key: string;
  header: string | ReactNode;
  render?: (item: T) => ReactNode;
  className?: string;
  sortable?: boolean; // Por defecto true
  sortValue?: (item: T) => string | number | boolean | null | undefined; // Función para obtener el valor de ordenamiento
}

interface ABMTableProps<T> {
  data: T[];
  columns: ABMTableColumn<T>[];
  onRowClick?: (item: T) => void;
  actions?: (item: T) => ReactNode;
  keyExtractor: (item: T) => string | number;
  // Ordenamiento inicial (opcional)
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  // Render alternativo para mobile (cards)
  renderMobileCard?: (item: T, actions?: ReactNode) => ReactNode;
  /** Agrupacion opcional. Inserta una fila-separador antes de cada grupo con
   *  label izq + subtotal der. La data DEBE venir ordenada por el padre. */
  groupBy?: {
    getKey: (item: T) => string;
    renderLabel: (key: string, items: T[]) => ReactNode;
    renderSubtotal?: (key: string, items: T[]) => ReactNode;
  };
}

type SortDirection = 'asc' | 'desc' | null;

export function ABMTable<T>({
  data,
  columns,
  onRowClick,
  actions,
  keyExtractor,
  defaultSortKey,
  defaultSortDirection,
  renderMobileCard,
  groupBy,
}: ABMTableProps<T>) {
  const { theme } = useTheme();
  // Estado de ordenamiento - inicializar con valores por defecto si se proporcionan
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey || null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection || null);

  const handleSort = (col: ABMTableColumn<T>) => {
    if (col.sortable === false) return;

    if (sortKey === col.key) {
      // Ciclo: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortKey(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortKey(col.key);
      setSortDirection('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey || !sortDirection) return 0;

    const col = columns.find(c => c.key === sortKey);
    if (!col) return 0;

    // Obtener valores para comparar
    let valueA: unknown;
    let valueB: unknown;

    if (col.sortValue) {
      valueA = col.sortValue(a);
      valueB = col.sortValue(b);
    } else {
      valueA = (a as Record<string, unknown>)[sortKey];
      valueB = (b as Record<string, unknown>)[sortKey];
    }

    // Manejar nulls/undefined
    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return sortDirection === 'asc' ? 1 : -1;
    if (valueB == null) return sortDirection === 'asc' ? -1 : 1;

    // Comparar según tipo
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      const comparison = valueA.localeCompare(valueB, 'es', { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    }

    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    }

    if (typeof valueA === 'boolean' && typeof valueB === 'boolean') {
      return sortDirection === 'asc'
        ? (valueA === valueB ? 0 : valueA ? -1 : 1)
        : (valueA === valueB ? 0 : valueA ? 1 : -1);
    }

    // Fallback: convertir a string
    const strA = String(valueA);
    const strB = String(valueB);
    const comparison = strA.localeCompare(strB, 'es', { sensitivity: 'base' });
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const SortIcon = ({ colKey }: { colKey: string }) => {
    const isActive = sortKey === colKey;
    const direction = isActive ? sortDirection : null;

    return (
      <span className="ml-1.5 inline-flex flex-col" style={{ fontSize: '8px', lineHeight: '6px' }}>
        <span
          style={{
            color: direction === 'asc' ? theme.primary : `${theme.textSecondary}50`,
            transition: 'color 0.2s',
          }}
        >
          ▲
        </span>
        <span
          style={{
            color: direction === 'desc' ? theme.primary : `${theme.textSecondary}50`,
            transition: 'color 0.2s',
          }}
        >
          ▼
        </span>
      </span>
    );
  };

  const isMobile = useIsMobile();

  // En mobile, si hay renderMobileCard, mostrar cards
  if (isMobile && renderMobileCard) {
    return (
      <div className="space-y-3 animate-fade-in-up">
        {sortedData.map((item) => (
          <div
            key={keyExtractor(item)}
            onClick={() => onRowClick?.(item)}
            className={onRowClick ? 'cursor-pointer' : ''}
          >
            {renderMobileCard(item, actions?.(item))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden animate-fade-in-up"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: theme.backgroundSecondary }}>
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider first:pl-4 ${col.className || ''} ${isSortable ? 'cursor-pointer select-none hover:opacity-80' : ''}`}
                    style={{ color: theme.textSecondary }}
                    onClick={() => isSortable && handleSort(col)}
                  >
                    <div className="flex items-center">
                      {col.header}
                      {isSortable && <SortIcon colKey={col.key} />}
                    </div>
                  </th>
                );
              })}
              {actions && (
                <th
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider"
                  style={{ color: theme.textSecondary }}
                >
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: theme.border }}>
            {(() => {
              const colSpan = columns.length + (actions ? 1 : 0);
              // Si hay groupBy, particiono en bloques contiguos por key.
              // La data debe venir ordenada por el padre.
              const blocks: Array<{ key: string; items: T[] }> = [];
              if (groupBy) {
                let cur: { key: string; items: T[] } | null = null;
                for (const it of sortedData) {
                  const k = groupBy.getKey(it);
                  if (!cur || cur.key !== k) {
                    cur = { key: k, items: [] };
                    blocks.push(cur);
                  }
                  cur.items.push(it);
                }
              }
              const renderRow = (item: T, index: number) => (
                <tr
                  key={String(keyExtractor(item))}
                  onClick={() => onRowClick?.(item)}
                  className={`transition-all duration-200 ${onRowClick ? 'cursor-pointer' : ''}`}
                  style={{
                    backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}50`,
                    borderBottom: `1px solid ${theme.border}40`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${theme.primary}10`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}50`; }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-2 py-2 text-xs first:pl-4 ${col.className || ''}`}
                      style={{ color: theme.text }}
                    >
                      {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as ReactNode}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {actions(item)}
                      </div>
                    </td>
                  )}
                </tr>
              );
              if (!groupBy) {
                return sortedData.map((item, index) => renderRow(item, index));
              }
              const out: ReactNode[] = [];
              let runningIdx = 0;
              for (const b of blocks) {
                out.push(
                  <tr key={`grp-${b.key}`} style={{ backgroundColor: theme.backgroundSecondary }}>
                    <td colSpan={colSpan} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">{groupBy.renderLabel(b.key, b.items)}</div>
                        {groupBy.renderSubtotal && (
                          <div className="flex-shrink-0">{groupBy.renderSubtotal(b.key, b.items)}</div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                for (const it of b.items) {
                  out.push(renderRow(it, runningIdx));
                  runningIdx++;
                }
              }
              return out;
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Botón de acción para tablas con animación de ripple
interface ABMTableActionProps {
  icon: ReactNode;
  onClick: () => void;
  title: string;
  variant?: 'primary' | 'danger';
}

export function ABMTableAction({ icon, onClick, title, variant = 'primary' }: ABMTableActionProps) {
  const { theme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (variant === 'danger') {
      setShowConfirm(true);
    } else {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 400);
      onClick();
    }
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 400);
    onClick();
  };

  const handleCloseConfirm = () => {
    setShowConfirm(false);
  };

  const baseColor = variant === 'danger' ? '#ef4444' : theme.primary;

  return (
    <>
      <button
        onClick={handleClick}
        className={`
          p-2 rounded-lg transition-all duration-200
          hover:scale-110 active:scale-95
          relative overflow-hidden
          ${isAnimating ? 'animate-table-action-click' : ''}
        `}
        style={{
          color: baseColor,
          backgroundColor: 'transparent',
        }}
        title={title}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = `${baseColor}20`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Ripple effect */}
        {isAnimating && (
          <span
            className="absolute inset-0 animate-ripple-effect rounded-lg"
            style={{ backgroundColor: `${baseColor}40` }}
          />
        )}
        {/* Icon with rotation animation on click */}
        <span className={`relative z-10 block transition-transform duration-300 ${isAnimating ? 'scale-125 rotate-12' : ''}`}>
          {icon}
        </span>
      </button>

      {variant === 'danger' && (
        <ConfirmModal
          isOpen={showConfirm}
          onClose={handleCloseConfirm}
          onConfirm={handleConfirm}
          title="Confirmar eliminacion"
          message="¿Estas seguro de que deseas desactivar este elemento? Esta accion se puede revertir."
          confirmText="Desactivar"
          cancelText="Cancelar"
          variant="danger"
        />
      )}
    </>
  );
}

// Skeleton para Card - se usa mientras cargan los datos
interface ABMCardSkeletonProps {
  index?: number;
}

export function ABMCardSkeleton({ index = 0 }: ABMCardSkeletonProps) {
  const { theme } = useTheme();

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 animate-pulse"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        animationDelay: `${index * 100}ms`,
      }}
    >
      {/* Header skeleton */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg"
            style={{ backgroundColor: theme.backgroundSecondary }}
          />
          <div className="space-y-2">
            <div
              className="h-4 rounded w-24"
              style={{ backgroundColor: theme.backgroundSecondary }}
            />
            <div
              className="h-3 rounded w-16"
              style={{ backgroundColor: theme.backgroundSecondary }}
            />
          </div>
        </div>
        <div
          className="h-6 w-16 rounded-full"
          style={{ backgroundColor: theme.backgroundSecondary }}
        />
      </div>

      {/* Content skeleton */}
      <div className="space-y-3">
        <div
          className="h-3 rounded w-full"
          style={{ backgroundColor: theme.backgroundSecondary }}
        />
        <div
          className="h-3 rounded w-3/4"
          style={{ backgroundColor: theme.backgroundSecondary }}
        />
      </div>

      {/* Footer skeleton */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full"
            style={{ backgroundColor: theme.backgroundSecondary }}
          />
          <div
            className="h-3 rounded w-20"
            style={{ backgroundColor: theme.backgroundSecondary }}
          />
        </div>
        <div
          className="h-3 rounded w-16"
          style={{ backgroundColor: theme.backgroundSecondary }}
        />
      </div>
    </div>
  );
}

// Skeleton individual para un chip de filtro (usa clase CSS global skeleton-shimmer)
interface FilterChipSkeletonProps {
  height?: number;
  width?: number;
}

export function FilterChipSkeleton({ height = 34, width = 70 }: FilterChipSkeletonProps) {
  return (
    <div
      className="rounded-lg flex-shrink-0 skeleton-shimmer"
      style={{ height: `${height}px`, width: `${width}px` }}
    />
  );
}

// Skeleton para una fila de chips de filtro
interface FilterRowSkeletonProps {
  count?: number;
  height?: number;
  widths?: number[]; // anchos personalizados, si no se pasa usa defaults
}

export function FilterRowSkeleton({ count = 6, height = 34, widths }: FilterRowSkeletonProps) {
  const defaultWidths = [60, 80, 70, 90, 65, 85];
  const chipWidths = widths || defaultWidths.slice(0, count);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {chipWidths.map((w, i) => (
        <FilterChipSkeleton key={`skeleton-${i}`} height={height} width={w} />
      ))}
    </div>
  );
}

// Skeleton completo para filtros secundarios (dos filas: categorías + estados)
interface ABMFiltersSkeletonProps {
  showCategories?: boolean;
  showStates?: boolean;
  categoryCount?: number;
  stateCount?: number;
  categoryHeight?: number;
  stateHeight?: number;
}

export function ABMFiltersSkeleton({
  showCategories = true,
  showStates = true,
  categoryCount = 6,
  stateCount = 6,
  categoryHeight = 34,
  stateHeight = 32,
}: ABMFiltersSkeletonProps) {
  return (
    <div className="space-y-1.5">
      {showCategories && (
        <FilterRowSkeleton count={categoryCount} height={categoryHeight} />
      )}
      {showStates && (
        <FilterRowSkeleton count={stateCount} height={stateHeight} widths={[55, 65, 60, 70, 55, 65].slice(0, stateCount)} />
      )}
    </div>
  );
}

// CSS animations (se inyectan una sola vez)
const styleId = 'abm-page-animations';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes fade-in-up {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .animate-fade-in-up {
      animation: fade-in-up 0.4s ease-out;
    }

    @keyframes ripple-effect {
      0% {
        transform: scale(0);
        opacity: 1;
      }
      100% {
        transform: scale(2.5);
        opacity: 0;
      }
    }

    .animate-ripple-effect {
      animation: ripple-effect 0.4s ease-out forwards;
    }

    @keyframes table-action-click {
      0% {
        transform: scale(1);
      }
      50% {
        transform: scale(0.85);
      }
      100% {
        transform: scale(1);
      }
    }

    .animate-table-action-click {
      animation: table-action-click 0.3s ease-out;
    }

    /* ABMCard hover animations - SMOOTH & PROFESSIONAL */
    .abm-card-hover {
      transition:
        transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
        box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        border-color 0.3s ease;
      will-cange: transform, box-shadow;
    }

    .abm-card-hover:hover {
      transform: translateY(-6px) scale(1.01);
      box-shadow:
        0 20px 40px -12px rgba(0, 0, 0, 0.15),
        0 12px 24px -8px rgba(0, 0, 0, 0.1),
        0 0 0 1px var(--card-primary, #8b5cf6);
      border-color: var(--card-primary, #8b5cf6) !important;
    }

    .abm-card-hover:active {
      transform: translateY(-3px) scale(0.99);
      transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Glow effect behind card on hover */
    .abm-card-hover::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: inherit;
      background: linear-gradient(135deg, var(--card-primary, #8b5cf6), transparent 60%);
      opacity: 0;
      z-index: -1;
      transition: opacity 0.4s ease;
      filter: blur(12px);
    }

    .abm-card-hover:hover::before {
      opacity: 0.3;
    }

    /* Shine sweep animation - smooth gradient */
    @keyframes shine-sweep {
      0% {
        transform: translateX(-100%) skewX(-15deg);
        opacity: 0;
      }
      30% {
        opacity: 0.6;
      }
      100% {
        transform: translateX(200%) skewX(-15deg);
        opacity: 0;
      }
    }

    .abm-card-hover:hover .group-hover\\:translate-x-full {
      animation: shine-sweep 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    /* Image zoom effect inside cards */
    .abm-card-hover img {
      transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
    }

    .abm-card-hover:hover img {
      transform: scale(1.08);
    }

    /* Icon bounce on hover */
    .abm-card-hover .group-hover\\:scale-110 {
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    /* Touch devices - reduce motion */
    @media (hover: none) {
      .abm-card-hover:hover {
        transform: none;
        box-shadow: none;
      }
      .abm-card-hover:hover::before {
        opacity: 0;
      }
      .abm-card-hover:active {
        transform: scale(0.98);
        transition: transform 0.1s ease;
      }
    }

    /* Prefer reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .abm-card-hover {
        transition: opacity 0.2s ease, border-color 0.2s ease;
      }
      .abm-card-hover:hover {
        transform: none;
      }
      .abm-card-hover:hover img {
        transform: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// Mini hint dismissable que explica el toggle cards/table/guided
// ============================================================
const VIEW_HINT_KEY = 'abm_view_toggle_hint_seen';

function ViewToggleHint({ hasGuided, hasTable }: { hasGuided: boolean; hasTable: boolean }) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(VIEW_HINT_KEY) !== '1';
  });

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(VIEW_HINT_KEY, '1');
    setVisible(false);
  };

  const modos: string[] = [];
  modos.push('Tarjetas');
  if (hasTable) modos.push('Tabla');
  if (hasGuided) modos.push('Guiada');

  return (
    <div
      className="mt-3 mb-1 rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm"
      style={{
        backgroundColor: `${theme.primary}10`,
        border: `1px solid ${theme.primary}30`,
        color: theme.text,
      }}
    >
      <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
      <span className="flex-1">
        <b>Tip:</b> probá los <b>{modos.length} modos de vista</b> ({modos.join(' · ')}) con los iconos de la derecha arriba.
        {hasGuided && ' La vista guiada agrupa los items por urgencia y prioridad.'}
      </span>
      <button
        onClick={dismiss}
        className="text-xs px-2 py-1 rounded font-semibold hover:bg-opacity-80 transition-colors flex-shrink-0"
        style={{ backgroundColor: theme.primary, color: '#fff' }}
      >
        Entendido
      </button>
    </div>
  );
}


// ============================================================
// PaginationFooter — footer interno de ABMPage cuando se pasa `pagination`.
// Estilo coherente con el header (h-[34px], text-[12px]).
// ============================================================
interface PaginationFooterProps {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    pageSizeOptions?: number[];
  };
  loading?: boolean;
}

function PaginationFooter({ pagination, loading }: PaginationFooterProps) {
  const { theme } = useTheme();
  const { page, pageSize, totalItems, onPageChange, onPageSizeChange, pageSizeOptions } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const opts = pageSizeOptions || [25, 50, 100, 200];

  const flechaStyle = (disabled: boolean) => ({
    backgroundColor: theme.backgroundSecondary,
    color: theme.text,
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div
      className="flex items-center gap-3 flex-wrap rounded-xl px-5 py-3 mt-3"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      <span className="text-[12px] font-medium flex-1 min-w-[140px]" style={{ color: theme.textSecondary }}>
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${theme.primary}55`, borderTopColor: theme.primary }} />
            Cargando…
          </span>
        ) : (
          <>Mostrando <strong style={{ color: theme.text }}>{start}-{end}</strong> de <strong style={{ color: theme.text }}>{totalItems.toLocaleString('es-AR')}</strong></>
        )}
      </span>

      {/* Navegacion (flechas pegadas al label como PeriodNavigator) */}
      <div className="inline-flex items-stretch rounded-lg overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2 h-[34px] flex items-center justify-center transition-all hover:brightness-110"
          style={flechaStyle(page <= 1)}
          title="Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          className="px-3 h-[34px] inline-flex items-center text-[12px] font-bold whitespace-nowrap"
          style={{
            backgroundColor: theme.card,
            color: theme.text,
            borderLeft: `1px solid ${theme.border}`,
            borderRight: `1px solid ${theme.border}`,
          }}
        >
          {page} de {totalPages}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2 h-[34px] flex items-center justify-center transition-all hover:brightness-110"
          style={flechaStyle(page >= totalPages)}
          title="Siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Selector page size (estilo ModernSelect compacto) */}
      {onPageSizeChange && (
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          className="h-[34px] px-2 rounded-lg text-[12px] font-semibold"
          style={{
            backgroundColor: theme.backgroundSecondary,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        >
          {opts.map(n => <option key={n} value={n}>{n} por página</option>)}
        </select>
      )}
    </div>
  );
}
