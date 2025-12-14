import { ReactNode, useState } from 'react';
import { Plus, Search, Sparkles, ChevronDown, LayoutGrid, List } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Sheet } from './Sheet';
import { ConfirmModal } from './ConfirmModal';

type ViewMode = 'cards' | 'table';

interface ABMPageProps {
  // Header
  title: string;
  buttonLabel: string;
  onAdd: () => void;

  // Search
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;

  // Extra filters (opcional)
  extraFilters?: ReactNode;

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
}

export function ABMPage({
  title,
  buttonLabel,
  onAdd,
  searchPlaceholder = 'Buscar...',
  searchValue,
  onSearchChange,
  extraFilters,
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
}: ABMPageProps) {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

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
    <div className="space-y-6">
      {/* Header unificado: Título + Buscador + Filtros + Botón en una línea */}
      <div
        className="rounded-xl px-5 py-3 relative overflow-hidden"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-3 relative z-10">
          {/* Título con icono decorativo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
            </div>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: theme.text }}>
              {title}
            </h1>
          </div>

          {/* Separador vertical */}
          <div className="h-8 w-px" style={{ backgroundColor: theme.border }} />

          {/* Buscador con mejor contraste */}
          <div className="relative flex-1 group">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-all duration-300 group-focus-within:scale-110"
              style={{ color: theme.textSecondary }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: theme.background,
                color: theme.text,
                border: `1px solid ${theme.border}`,
              }}
            />
          </div>

          {/* Filtros extra */}
          {extraFilters && (
            <div className="flex-shrink-0 abm-filter-wrapper">
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
              {extraFilters}
            </div>
          )}

          {/* Toggle Vista Tarjetas/Tabla */}
          {tableView && (
            <div
              className="flex items-center rounded-lg p-1 flex-shrink-0"
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

          {/* Botón agregar con gradiente basado en theme.primary */}
          <button
            onClick={onAdd}
            className="
              inline-flex items-center px-4 py-2 rounded-lg font-semibold text-sm
              transition-all duration-300 ease-out
              hover:scale-105 hover:-translate-y-0.5
              active:scale-95
              group
              relative overflow-hidden
              flex-shrink-0
            "
            style={{
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
              color: '#ffffff',
              boxShadow: `0 4px 14px ${theme.primary}40`,
            }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <Plus className="h-4 w-4 mr-1.5 transition-transform duration-300 group-hover:rotate-90" />
            {buttonLabel}
          </button>
        </div>
      </div>

      {/* Grid de contenido con animación de transición */}
      {!isEmpty ? (
        <div className="relative overflow-hidden">
          {/* Vista Tarjetas - 1 columna en móvil, 2 en tablet, 3 en desktop */}
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5"
            style={{
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: viewMode === 'cards' ? 1 : 0,
              transform: viewMode === 'cards'
                ? 'translateX(0) rotateY(0deg)'
                : 'translateX(-100%) rotateY(-15deg)',
              position: viewMode === 'cards' ? 'relative' : 'absolute',
              inset: viewMode === 'cards' ? 'auto' : 0,
              pointerEvents: viewMode === 'cards' ? 'auto' : 'none',
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
                opacity: viewMode === 'table' ? 1 : 0,
                transform: viewMode === 'table'
                  ? 'translateX(0) rotateY(0deg)'
                  : 'translateX(100%) rotateY(15deg)',
                position: viewMode === 'table' ? 'relative' : 'absolute',
                inset: viewMode === 'table' ? 'auto' : 0,
                pointerEvents: viewMode === 'table' ? 'auto' : 'none',
                transformOrigin: 'center center',
              }}
            >
              {tableView}
            </div>
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

      {/* Side Modal (solo si se proporcionan las props) */}
      {onSheetClose && (
        <Sheet
          open={sheetOpen || false}
          onClose={onSheetClose}
          title={sheetTitle || ''}
          description={sheetDescription}
          footer={sheetFooter}
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
        rounded-xl p-4 sm:p-5
        transition-all duration-300 ease-out
        ${onClick ? 'cursor-pointer' : ''}
        sm:hover:scale-[1.03] sm:hover:-translate-y-2
        hover:shadow-xl hover:shadow-black/5
        active:scale-[0.98]
        group
        relative
        overflow-hidden
        animate-fade-in-up
        touch-manipulation
      `}
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        color: theme.text,
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Hover gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}08 0%, transparent 50%)`,
        }}
      />

      {/* Glow effect on hover */}
      <div
        className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}20, transparent)`,
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
}

export function ABMBadge({ active = true, label }: ABMBadgeProps) {
  return (
    <span className={`
      px-3 py-1 text-xs font-semibold rounded-full
      transition-all duration-300
      ${active
        ? 'bg-green-500/20 text-green-400 shadow-green-500/20'
        : 'bg-red-500/20 text-red-400 shadow-red-500/20'
      }
      shadow-sm
    `}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${active ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      {label || (active ? 'Activo' : 'Inactivo')}
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

const variantStyles = {
  default: { bg: 'transparent', border: '', text: '' },
  info: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  success: { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
  warning: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  danger: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
};

export function ABMCollapsible({ title, icon, children, defaultOpen = false, variant = 'default' }: ABMCollapsibleProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const styles = variantStyles[variant];

  const bgColor = variant === 'default' ? theme.backgroundSecondary : styles.bg;
  const borderColor = variant === 'default' ? theme.border : styles.border;
  const textColor = variant === 'default' ? theme.text : styles.text;

  return (
    <div
      className="rounded-lg overflow-hidden transition-all duration-200"
      style={{ border: `1px solid ${borderColor}` }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors duration-200 hover:opacity-90"
        style={{ backgroundColor: bgColor, color: textColor }}
        type="button"
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          {icon}
          {title}
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: textColor }}
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
  const styles = variantStyles[variant];

  const bgColor = variant === 'default' ? theme.backgroundSecondary : styles.bg;
  const borderColor = variant === 'default' ? theme.border : styles.border;
  const textColor = variant === 'default' ? theme.text : styles.text;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {title && (
        <div className="flex items-center gap-2 font-medium text-sm mb-3" style={{ color: textColor }}>
          {icon}
          {title}
        </div>
      )}
      <div style={{ color: variant === 'default' ? theme.text : textColor }}>
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
interface ABMTableColumn<T> {
  key: string;
  header: string;
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
}

type SortDirection = 'asc' | 'desc' | null;

export function ABMTable<T>({ data, columns, onRowClick, actions, keyExtractor }: ABMTableProps<T>) {
  const { theme } = useTheme();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${col.className || ''} ${isSortable ? 'cursor-pointer select-none hover:opacity-80' : ''}`}
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
                    className={`px-4 py-3 text-sm ${col.className || ''}`}
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
  `;
  document.head.appendChild(style);
}
