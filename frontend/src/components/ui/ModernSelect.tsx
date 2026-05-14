import { useState, useRef, useEffect, ReactNode, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * ModernSelect — Combo dropdown canónico de la app. REEMPLAZA `<select>` nativo.
 *
 * Soporta:
 *   - `searchable`: convierte el combo en autocomplete con input "Buscar..."
 *      al abrirlo. Las opciones se filtran por `label` y `description`.
 *   - `color` por opción: tinta el label y el icono con un color custom (útil
 *      para estados, tipos, dependencias).
 *   - `icon` y `description` por opción para listas ricas.
 *
 * GOTCHA z-index / overflow: el dropdown usa `z-50` y se renderiza con
 * `position: absolute`. Si su contenedor ancestro tiene `overflow-hidden`,
 * el dropdown se CLIPEA. Patrón canónico: meter el ModernSelect en
 * `secondaryFilters` de ABMPage (sin overflow-hidden), NUNCA en `extraFilters`
 * (que vive dentro de un container con overflow-hidden).
 *
 * Patrón canónico (autocomplete combo de filtrado):
 * ```tsx
 * const options = useMemo(() => ([
 *   { value: '', label: 'Todas las opciones' },
 *   { value: 'a', label: 'Opción A', color: theme.success },
 * ]), []);
 *
 * <div className="min-w-[200px] flex-shrink-0">
 *   <ModernSelect
 *     value={filtro}
 *     onChange={setFiltro}
 *     options={options}
 *     placeholder="Todas las opciones"
 *     searchable
 *   />
 * </div>
 * ```
 */
export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  color?: string;
}

interface ModernSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  onOpen?: () => void;
  onClose?: (selectedValue: string | null) => void;
}

export function ModernSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  label,
  disabled = false,
  searchable = false,
  className = '',
  onOpen,
  onClose,
}: ModernSelectProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Posicion calculada del dropdown (fixed). Se recalcula en cada open
  // + scroll/resize. Asi el dropdown ESCAPA de cualquier overflow:hidden
  // ancestro (problema clasico) y nunca se clipea.
  const [dropdownPos, setDropdownPos] = useState<{
    top: number; left: number; width: number; maxHeight: number; openUp: boolean;
  } | null>(null);

  const recalcPos = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const espacioAbajo = vh - r.bottom - 12;
    const espacioArriba = r.top - 12;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    // En mobile usamos hasta 60vh, en desktop hasta 400px
    const maxAlturaDeseada = isMobile ? Math.min(vh * 0.6, 480) : 400;
    let openUp = false;
    let maxHeight = Math.min(maxAlturaDeseada, espacioAbajo);
    if (espacioAbajo < 220 && espacioArriba > espacioAbajo) {
      openUp = true;
      maxHeight = Math.min(maxAlturaDeseada, espacioArriba);
    }
    setDropdownPos({
      top: openUp ? r.top - 8 : r.bottom + 8,
      left: r.left,
      width: r.width,
      maxHeight: Math.max(200, maxHeight),
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) recalcPos();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onScrollOrResize = () => recalcPos();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  // Cerrar al hacer clic fuera. Tiene en cuenta el dropdown portaleado.
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const t = event.target as Node;
      const inContainer = containerRef.current?.contains(t);
      const inDropdown = dropdownRef.current?.contains(t);
      if (!inContainer && !inDropdown) {
        if (isOpen) onClose?.(null);
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Focus en el input de busqueda solo en desktop. En mobile el auto-focus
  // hace aparecer el teclado y tapa las opciones — el user igual puede
  // tocar el input si quiere filtrar.
  useEffect(() => {
    if (!isOpen || !searchable || !inputRef.current) return;
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) inputRef.current.focus();
  }, [isOpen, searchable]);

  const filteredOptions = searchable && searchTerm
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opt.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    onClose?.(optionValue); // Cerrado con selección
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        onOpen?.();
      }
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: theme.textSecondary }}
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl
          transition-all duration-200 text-left
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-opacity-60'}
          ${isOpen ? 'ring-2' : ''}
        `}
        style={{
          backgroundColor: theme.backgroundSecondary,
          border: `1px solid ${isOpen ? theme.primary : theme.border}`,
          color: theme.text,
          ['--tw-ring-color' as string]: `${theme.primary}40`,
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedOption?.icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: selectedOption.color ? `${selectedOption.color}20` : `${theme.primary}20`,
                color: selectedOption.color || theme.primary
              }}
            >
              {selectedOption.icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {selectedOption ? (
              <>
                <span
                  className="block truncate font-medium"
                  style={{ color: selectedOption.color || theme.text }}
                >
                  {selectedOption.label}
                </span>
                {selectedOption.description && (
                  <span
                    className="block text-xs truncate"
                    style={{ color: theme.textSecondary }}
                  >
                    {selectedOption.description}
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: theme.textSecondary }}>{placeholder}</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: theme.textSecondary }}
        />
      </button>

      {/* Dropdown via portal con position: fixed.
          Escapa de cualquier overflow:hidden ancestro y se ubica
          inteligentemente arriba/abajo segun el espacio disponible. */}
      {isOpen && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            position: 'fixed',
            top: dropdownPos.openUp ? undefined : dropdownPos.top,
            bottom: dropdownPos.openUp ? (window.innerHeight - dropdownPos.top) : undefined,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            boxShadow: `0 20px 40px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px ${theme.border}`,
          }}
        >
          {/* Search Input */}
          {searchable && (
            <div
              className="p-2 border-b"
              style={{ borderColor: theme.border }}
            >
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  ['--tw-ring-color' as string]: `${theme.primary}40`,
                }}
              />
            </div>
          )}

          {/* Options List */}
          <div className="overflow-y-auto py-1" style={{ maxHeight: dropdownPos.maxHeight - (searchable ? 60 : 0) }}>
            {filteredOptions.length === 0 ? (
              <div
                className="px-4 py-3 text-sm text-center"
                style={{ color: theme.textSecondary }}
              >
                No se encontraron opciones
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left
                      transition-all duration-150
                    `}
                    style={{
                      backgroundColor: isSelected ? `${theme.primary}15` : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = `${theme.primary}08`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? `${theme.primary}15` : 'transparent';
                    }}
                  >
                    {option.icon && (
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: option.color ? `${option.color}20` : `${theme.primary}20`,
                          color: option.color || theme.primary
                        }}
                      >
                        {option.icon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}
                        style={{ color: option.color || theme.text }}
                      >
                        {option.label}
                      </span>
                      {option.description && (
                        <span
                          className="block text-xs truncate"
                          style={{ color: theme.textSecondary }}
                        >
                          {option.description}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        className="h-5 w-5 flex-shrink-0"
                        style={{ color: theme.primary }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
