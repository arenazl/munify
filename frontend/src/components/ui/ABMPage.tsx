import { ReactNode, useState, useEffect } from 'react';
import { Plus, Search, Sparkles, LayoutGrid, List, ChevronDown, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from './Sheet';
import { ConfirmModal } from './ConfirmModal';

type ViewMode = 'cards' | 'table';

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

  // Extra filters (opcional)
  extraFilters?: ReactNode;
  filters?: ReactNode; // Alias para compatibilidad

  // Header actions - botones extra junto al toggle de vista (ej: ordenamiento)
  headerActions?: ReactNode;

  // Secondary filters bar (opcional - barra completa debajo del header)
  secondaryFilters?: ReactNode;

  // Grid
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;

  // Loading
  loading?: boolean;

  // Sheet (opcional - para páginas que manejan su propio Sheet)
  sheetOpen?: boolean;
  sheetTitle?: string;
  sheetDescription?: string;
  sheetContent?: ReactNode;
  sheetFooter?: ReactNode;
  onSheetClose?: () => void;

  // Vista tabla (opcional)
  tableView?: ReactNode;

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
  searchValue,
  onSearchChange,
  extraFilters,
  filters,
  headerActions,
  secondaryFilters,
  children,
  emptyMessage = 'No se encontraron resultados',
  isEmpty = false,
  loading = false,
  sheetOpen,
  sheetTitle,
  sheetDescription,
  sheetContent,
  sheetFooter,
  onSheetClose,
  tableView,
  disabledSection,
  defaultViewMode,
  stickyHeader = false,
}: ABMPageProps) {
  // Combinar filters con extraFilters para compatibilidad
  const allFilters = filters || extraFilters;
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  // Si no hay tableView, defaultear a 'cards' para evitar pantalla vacía
  const resolvedDefaultViewMode = defaultViewMode || (tableView ? 'table' : 'cards');
  const [viewMode, setViewMode] = useState<ViewMode>(resolvedDefaultViewMode);
  const [searchFocused, setSearchFocused] = useState(false);

  // En mobile, siempre usar cards (mejor UX que tabla)
  const effectiveViewMode = isMobile ? 'cards' : viewMode;

  if (loading) {
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

  return (
    <div className="space-y-6 pb-4" style={{ touchAction: 'pan-y', minHeight: '100vh' }}>
      {/* Contenedor sticky para header y secondary filters - usando CSS sticky puro */}
      <div
        className={stickyHeader ? 'sticky top-0 z-30 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 pt-1 pb-1' : ''}
        style={{
          backgroundColor: stickyHeader ? theme.background : 'transparent',
        }}
      >
        {/* Header unificado: Título + Buscador + Filtros + Botón en una línea */}
        <div
          className={`px-5 py-3 relative overflow-hidden ${secondaryFilters ? 'rounded-t-xl' : 'rounded-xl'}`}
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderBottom: secondaryFilters ? 'none' : `1px solid ${theme.border}`,
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
          <div className={`relative group transition-all duration-300 ${searchFocused ? 'flex-1' : 'flex-1 sm:flex-1'}`}>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-all duration-300 group-focus-within:scale-110"
              style={{ color: theme.textSecondary }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none transition-all duration-300"
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

          {/* Toggle Vista - solo desktop */}
          {tableView && (
            <div
              className="hidden sm:flex items-center rounded-lg p-1 flex-shrink-0"
              style={{ backgroundColor: theme.backgroundSecondary, border: `1px solid ${theme.border}` }}
            >
              <button
                onClick={() => setViewMode('cards')}
                className={`
                  relative p-2 rounded-md transition-all duration-300 ease-out
                  ${viewMode === 'cards' ? 'text-white' : ''}
                `}
                style={{
                  color: viewMode === 'cards' ? '#ffffff' : theme.textSecondary,
                }}
                title="Vista tarjetas"
              >
                {viewMode === 'cards' && (
                  <div
                    className="absolute inset-0 rounded-md transition-all duration-300 ease-out"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                      boxShadow: `0 2px 8px ${theme.primary}40`,
                    }}
                  />
                )}
                <LayoutGrid className="h-4 w-4 relative z-10" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`
                  relative p-2 rounded-md transition-all duration-300 ease-out
                  ${viewMode === 'table' ? 'text-white' : ''}
                `}
                style={{
                  color: viewMode === 'table' ? '#ffffff' : theme.textSecondary,
                }}
                title="Vista tabla"
              >
                {viewMode === 'table' && (
                  <div
                    className="absolute inset-0 rounded-md transition-all duration-300 ease-out"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                      boxShadow: `0 2px 8px ${theme.primary}40`,
                    }}
                  />
                )}
                <List className="h-4 w-4 relative z-10" />
              </button>
            </div>
          )}

          {/* Contenedor para headerActions + Botón Nuevo - siempre juntos */}
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            {/* Header Actions (ordenamiento, etc) */}
            {headerActions}

            {/* Botón agregar */}
            {onAdd && buttonLabel && (
              <button
                onClick={onAdd}
                className={`
                  inline-flex items-center px-4 py-2 rounded-lg font-semibold text-sm
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

        {/* Secondary Filters Bar (full width) - dentro del sticky container */}
        {secondaryFilters && (
          <div
            className="rounded-b-xl p-3"
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              borderTop: 'none',
            }}
          >
            {secondaryFilters}
          </div>
        )}
      </div>

      {/* Grid de contenido con animación de transición */}
      {!isEmpty ? (
        <div className="relative mt-4">
          {/* Vista Tarjetas - 1 columna en móvil, 2 en tablet, 3 en desktop */}
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5"
            style={{
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: effectiveViewMode === 'cards' ? 1 : 0,
              transform: effectiveViewMode === 'cards'
                ? 'translateX(0) rotateY(0deg)'
                : 'translateX(-100%) rotateY(-15deg)',
              position: effectiveViewMode === 'cards' ? 'relative' : 'absolute',
              inset: effectiveViewMode === 'cards' ? 'auto' : 0,
              pointerEvents: effectiveViewMode === 'cards' ? 'auto' : 'none',
              transformOrigin: 'center center',
            }}
          >
            {children}
          </div>

          {/* Vista Tabla */}
          {tableView && (
            <div
              style={{
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: effectiveViewMode === 'table' ? 1 : 0,
                transform: effectiveViewMode === 'table'
                  ? 'translateX(0) rotateY(0deg)'
                  : 'translateX(100%) rotateY(15deg)',
                position: effectiveViewMode === 'table' ? 'relative' : 'absolute',
                inset: effectiveViewMode === 'table' ? 'auto' : 0,
                pointerEvents: effectiveViewMode === 'table' ? 'auto' : 'none',
                transformOrigin: 'center center',
              }}
            >
              {tableView}
            </div>
          )}

          {/* Sección de deshabilitados - visible en ambas vistas */}
          {disabledSection}
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
        className="w-full flex items-center justify-between px-4 py-2 transition-colors duration-200 hover:opacity-90"
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
        <div className="px-4 py-3" style={{ backgroundColor: theme.card }}>
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
          className="flex items-center gap-2 font-bold text-sm px-4 py-2"
          style={{ backgroundColor: `${theme.background}ee`, color: theme.primary }}
        >
          {icon}
          {title}
        </div>
      )}
      <div className="p-4" style={{ backgroundColor: bgColor, color: theme.text }}>
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
    <div className={`flex items-center gap-3 py-2 ${fullWidth ? 'w-full' : ''}`}>
      {icon && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>{label}</p>
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
            {sortedData.map((item, index) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={`
                  transition-all duration-200
                  ${onRowClick ? 'cursor-pointer hover:scale-[1.01]' : ''}
                `}
                style={{
                  backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}50`,
                  animationDelay: `${index * 30}ms`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${theme.primary}10`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'transparent' : `${theme.backgroundSecondary}50`;
                }}
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
            ))}
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
