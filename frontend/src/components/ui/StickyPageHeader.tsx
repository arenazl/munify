import { ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, ArrowLeft, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';

interface StickyPageHeaderProps {
  /** Icono del título (ReactNode, ej: <FileText className="h-5 w-5" />) */
  icon?: ReactNode;
  /** Título de la página */
  title?: string;
  /** Link para volver (muestra flecha antes del título) */
  backLink?: string;
  /** Placeholder del buscador */
  searchPlaceholder?: string;
  /** Valor del buscador */
  searchValue?: string;
  /** Callback cuando cambia el buscador */
  onSearchChange?: (value: string) => void;
  /** Botones de acción (ReactNode) */
  actions?: ReactNode;
  /** Texto del botón principal (si se pasa, muestra botón con +) */
  buttonLabel?: string;
  /** Callback del botón principal */
  onButtonClick?: () => void;
  /** Panel de filtros debajo del header (opcional) */
  filterPanel?: ReactNode;
  /** Contenido custom (si se usa, ignora icon/title/search/actions) */
  children?: ReactNode;
  /** Callback para pull-to-refresh (solo mobile). Si se pasa, habilita el gesto. */
  onRefresh?: () => Promise<void>;
}

/**
 * Componente para crear headers sticky consistentes en todas las páginas.
 *
 * MODO SIMPLE (recomendado):
 * <StickyPageHeader
 *   icon={<FileText className="h-5 w-5" />}
 *   title="Gestión de Trámites"
 *   searchPlaceholder="Buscar por número, vecino..."
 *   searchValue={searchTerm}
 *   onSearchChange={setSearchTerm}
 *   buttonLabel="Nuevo"
 *   onButtonClick={() => setShowModal(true)}
 *   actions={<MisAccionesExtra />}
 *   filterPanel={<MisFiltros />}
 * />
 *
 * MODO CUSTOM (children):
 * <StickyPageHeader filterPanel={<MisFiltros />}>
 *   <PageTitleIcon icon={<FileText />} />
 *   <PageTitle>Mi Página</PageTitle>
 *   <HeaderSeparator />
 *   <input placeholder="Buscar..." />
 * </StickyPageHeader>
 */
export function StickyPageHeader({
  icon,
  title,
  backLink,
  searchPlaceholder = 'Buscar...',
  searchValue,
  onSearchChange,
  actions,
  buttonLabel,
  onButtonClick,
  filterPanel,
  children,
  onRefresh,
}: StickyPageHeaderProps) {
  const { theme } = useTheme();
  const [searchFocused, setSearchFocused] = useState(false);

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const PULL_THRESHOLD = 80; // Distancia mínima para activar refresh

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!onRefresh || refreshing) return;
    // Solo activar si estamos en el top del scroll
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [onRefresh, refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || !onRefresh || refreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY.current;

    if (distance > 0 && window.scrollY === 0) {
      // Aplicar resistencia al pull
      const resistance = Math.min(distance * 0.4, PULL_THRESHOLD + 20);
      setPullDistance(resistance);

      // Prevenir scroll normal cuando estamos pulling
      if (distance > 10) {
        e.preventDefault();
      }
    }
  }, [onRefresh, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || !onRefresh) return;
    isPulling.current = false;

    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // Mantener en posición de loading

      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    if (!onRefresh) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Modo custom: si hay children, renderizar como antes
  const useCustomMode = !!children;

  // Usar position sticky - se queda fijo cuando llega al top
  return (
    <>
      {/* Pull-to-refresh indicator */}
      {onRefresh && (pullDistance > 0 || refreshing) && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center justify-center transition-all duration-200"
          style={{
            top: Math.min(pullDistance, PULL_THRESHOLD) - 10,
            opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <RefreshCw
              className={`h-5 w-5 transition-transform ${refreshing ? 'animate-spin' : ''}`}
              style={{
                color: pullDistance >= PULL_THRESHOLD ? theme.primary : theme.textSecondary,
                transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Header sticky - se pega al top cuando scrolleas */}
      <div
        className="sticky z-30 top-0 pt-1 pb-3 transition-transform"
        style={{
          backgroundColor: theme.background,
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        }}
      >
        {/* Parte 1: Header principal */}
        <div
          className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3 ${filterPanel ? 'rounded-t-xl' : 'rounded-xl'}`}
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderBottom: filterPanel ? 'none' : undefined,
          }}
        >
          {useCustomMode ? (
            children
          ) : (
            <>
              {/* BackLink + Icono + Título - se oculta en mobile cuando search enfocado */}
              {(backLink || icon || title) && (
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
                  {title && (
                    <h1
                      className="text-lg font-bold tracking-tight"
                      style={{ color: theme.text }}
                    >
                      {title}
                    </h1>
                  )}
                </div>
              )}

              {/* Separador - se oculta en mobile */}
              {(backLink || icon || title) && onSearchChange && (
                <div
                  className="h-8 w-px hidden sm:block flex-shrink-0"
                  style={{ backgroundColor: theme.border }}
                />
              )}

              {/* Buscador - se expande en mobile */}
              {onSearchChange && (
                <div className="relative flex-1 min-w-0">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: theme.textSecondary }}
                  />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchValue || ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none transition-all"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                  />
                </div>
              )}

              {/* Acciones extra */}
              {actions && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {actions}
                </div>
              )}

              {/* Botón principal - icono en mobile, texto en desktop */}
              {buttonLabel && onButtonClick && (
                <>
                  {/* Mobile: solo icono */}
                  <button
                    onClick={onButtonClick}
                    className="sm:hidden p-2 rounded-lg transition-all active:scale-95 flex-shrink-0"
                    style={{
                      backgroundColor: theme.primary,
                      color: '#ffffff',
                    }}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  {/* Desktop: con texto */}
                  <button
                    onClick={onButtonClick}
                    className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg font-semibold text-sm transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                      color: '#ffffff',
                      boxShadow: `0 4px 14px ${theme.primary}40`,
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {buttonLabel}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Parte 2: Panel de filtros (opcional) */}
        {filterPanel && (
          <div
            className="rounded-b-xl p-2 sm:p-3"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderTop: 'none',
            }}
          >
            {filterPanel}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Componente para el icono decorativo del título
 */
interface PageTitleIconProps {
  icon: ReactNode;
}

export function PageTitleIcon({ icon }: PageTitleIconProps) {
  const { theme } = useTheme();

  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: `${theme.primary}20` }}
    >
      <span style={{ color: theme.primary }}>{icon}</span>
    </div>
  );
}

/**
 * Componente para el título de la página
 */
interface PageTitleProps {
  children: ReactNode;
  className?: string;
}

export function PageTitle({ children, className = '' }: PageTitleProps) {
  const { theme } = useTheme();

  return (
    <h1
      className={`text-lg font-bold tracking-tight hidden sm:block ${className}`}
      style={{ color: theme.text }}
    >
      {children}
    </h1>
  );
}

/**
 * Separador vertical para usar entre elementos del header
 */
export function HeaderSeparator() {
  const { theme } = useTheme();

  return (
    <div
      className="h-8 w-px hidden sm:block flex-shrink-0"
      style={{ backgroundColor: theme.border }}
    />
  );
}

/**
 * Chip de filtro individual
 */
export interface FilterChip {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  color?: string;
}

interface FilterChipRowProps {
  /** Array de chips a mostrar */
  chips: FilterChip[];
  /** Key del chip activo (o null para "Todos") */
  activeKey: string | null;
  /** Callback cuando se clickea un chip */
  onChipClick: (key: string | null) => void;
  /** Mostrar botón "Todos" al inicio (default: true) */
  showAllButton?: boolean;
  /** Label del botón "Todos" */
  allLabel?: string;
  /** Icono del botón "Todos" */
  allIcon?: ReactNode;
  /** Key del chip que está cargando (opcional, para feedback visual) */
  loadingKey?: string | null;
  /** Altura de los chips */
  height?: number;
}

/**
 * Fila de chips de filtro reutilizable.
 *
 * Uso:
 * <FilterChipRow
 *   chips={[
 *     { key: 'iniciado', label: 'Nuevo', icon: <Clock />, count: 10, color: '#6366f1' },
 *     { key: 'en_curso', label: 'Proceso', icon: <Play />, count: 5, color: '#f59e0b' },
 *   ]}
 *   activeKey={filtroEstado}
 *   onChipClick={(key) => setFiltroEstado(key)}
 *   allLabel="Todos"
 *   allIcon={<Eye />}
 * />
 */
export function FilterChipRow({
  chips,
  activeKey,
  onChipClick,
  showAllButton = true,
  allLabel = 'Todos',
  allIcon,
  loadingKey,
  height = 32,
}: FilterChipRowProps) {
  const { theme } = useTheme();

  const totalCount = chips.reduce((sum, chip) => sum + (chip.count || 0), 0);

  // En mobile: altura más compacta
  const mobileHeight = Math.max(height - 4, 28);

  return (
    <div className="flex gap-1 sm:gap-1.5">
      {/* Botón "Todos" fijo */}
      {showAllButton && (
        <button
          onClick={() => onChipClick(null)}
          className="flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all flex-shrink-0"
          style={{
            height: `${mobileHeight}px`,
            background: 'transparent',
            border: `1.5px solid ${activeKey === null ? theme.primary : theme.border}`,
          }}
        >
          {allIcon && (
            <span
              className={`[&>svg]:h-3.5 [&>svg]:w-3.5 sm:[&>svg]:h-4 sm:[&>svg]:w-4 ${loadingKey === 'all' ? 'animate-pulse' : ''}`}
              style={{ color: activeKey === null ? theme.primary : theme.textSecondary }}
            >
              {allIcon}
            </span>
          )}
          {/* Label solo en desktop */}
          <span
            className={`hidden sm:inline text-xs font-medium whitespace-nowrap ${loadingKey === 'all' ? 'animate-pulse' : ''}`}
            style={{ color: activeKey === null ? theme.primary : theme.textSecondary }}
          >
            {allLabel}
          </span>
          {totalCount > 0 && (
            <span
              className={`text-[9px] sm:text-[10px] font-bold ${loadingKey === 'all' ? 'animate-pulse' : ''}`}
              style={{ color: activeKey === null ? theme.primary : theme.textSecondary }}
            >
              {totalCount}
            </span>
          )}
        </button>
      )}

      {/* Scroll de chips */}
      <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
        {chips.map((chip) => {
          const isActive = activeKey === chip.key;
          const chipColor = chip.color || theme.primary;
          const isLoading = loadingKey === chip.key;

          return (
            <button
              key={chip.key}
              onClick={() => onChipClick(isActive ? null : chip.key)}
              title={chip.label}
              className="flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all flex-shrink-0"
              style={{
                height: `${mobileHeight}px`,
                background: isActive ? chipColor : `${chipColor}15`,
                border: `1px solid ${isActive ? chipColor : `${chipColor}40`}`,
              }}
            >
              {chip.icon && (
                <span
                  className={`flex-shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5 sm:[&>svg]:h-4 sm:[&>svg]:w-4 ${isLoading ? 'animate-pulse' : ''}`}
                  style={{ color: isActive ? '#ffffff' : chipColor }}
                >
                  {chip.icon}
                </span>
              )}
              {/* Label solo en desktop */}
              <span
                className={`hidden sm:inline text-xs font-medium whitespace-nowrap ${isLoading ? 'animate-pulse' : ''}`}
                style={{ color: isActive ? '#ffffff' : chipColor }}
              >
                {chip.label}
              </span>
              {chip.count !== undefined && (
                <span
                  className={`text-[9px] sm:text-[10px] font-bold ${isLoading ? 'animate-pulse' : ''}`}
                  style={{ color: isActive ? '#ffffff' : chipColor }}
                >
                  {chip.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StickyPageHeader;
