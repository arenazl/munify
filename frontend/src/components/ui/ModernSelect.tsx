import { useState, useRef, useEffect, ReactNode, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { abreviarPalabras } from '../../lib/textAbbreviation';

/**
 * ModernSelect — Combo dropdown canónico de la app. REEMPLAZA `<select>` nativo.
 *
 * VARIANTES (`variant`):
 *   - `clasico` (DEFAULT, no tocar): el look histórico, con estilos inline
 *     derivados del theme. Lo usan las decenas de pantallas sin migrar.
 *   - `v2`: estética del estándar v2 (mockup de Claude Design) — superficie
 *     --pl-surface-2, borde fino --pl-border, radius 10px, tipografía 12.5px,
 *     alto de píldora. OPT-IN y 100% por clases `ms2-*` en
 *     styles/modern-select-v2.css sobre tokens --pl-* (cero hex, cero rgba).
 *     Es la variante que usa AdaptiveFilter al colapsar.
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
 *
 * REGLA DURA: el placeholder + el label del item "vacio" debe ser corto, en
 * plural sin "Todos los / Todas las". Ej: "Contactos", "Dependencias",
 * "Conceptos", "Estados". El usuario no necesita leer "Todos los X" cada vez —
 * con el plural alcanza, y ahorramos ancho horizontal.
 *
 * ```tsx
 * const options = useMemo(() => ([
 *   { value: '', label: 'Opciones' },               // sin "Todas las"
 *   { value: 'a', label: 'Opción A', color: theme.success },
 * ]), []);
 *
 * <div className="min-w-[160px] flex-shrink-0">
 *   <ModernSelect
 *     value={filtro}
 *     onChange={setFiltro}
 *     options={options}
 *     placeholder="Opciones"
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
  /** Si true, la opcion se muestra en negrita y a opacidad full (tiene elementos
   *  en el dataset actual). Las que no, quedan font-medium y atenuadas. */
  emphasized?: boolean;
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
  /** Si es true (default), aplica abreviaturas al label del trigger para
   * que entren textos largos. Las opciones del dropdown siempre muestran
   * texto completo. Pasar `abbreviate={false}` solo cuando se necesite
   * texto exacto en el trigger (raro). */
  abbreviate?: boolean;
  /** Estética. `clasico` (default) = look histórico intacto; `v2` = estándar
   *  v2 por clases `ms2-*` (styles/modern-select-v2.css). Ver cabecera. */
  variant?: 'clasico' | 'v2';
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
  abbreviate = true,
  variant = 'clasico',
}: ModernSelectProps) {
  const { theme } = useTheme();
  // Interruptor de la variante: con `v2` NO se aplica ningún estilo inline de
  // color — manda el CSS de clases (así el look sale íntegro de tokens --pl-*).
  const esV2 = variant === 'v2';
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

  // Focus en el input de busqueda SOLO en desktop con teclado fisico.
  // En mobile y tablet el auto-focus hace aparecer el teclado virtual y
  // tapa las opciones — el user igual puede tocar el input si quiere
  // filtrar. Breakpoint a 1024px para incluir tablets verticales/iPads.
  useEffect(() => {
    if (!isOpen || !searchable || !inputRef.current) return;
    const isTouchDevice = typeof window !== 'undefined' && (
      window.matchMedia('(max-width: 1024px)').matches ||
      ('ontouchstart' in window) ||
      navigator.maxTouchPoints > 0
    );
    if (!isTouchDevice) inputRef.current.focus();
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

      {/* Trigger Button — alto canonico 34px, tipografia 12px.
          Aplica abreviaturas al label si abbreviate=true (default). */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={esV2
          ? `ms2-trigger${isOpen ? ' ms2-trigger--abierto' : ''}${disabled ? ' ms2-trigger--off' : ''}`
          : `
          w-full h-[34px] flex items-center justify-between gap-1.5 px-2.5 rounded-lg
          transition-all duration-200 text-left text-[12px]
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-opacity-60'}
          ${isOpen ? 'ring-2' : ''}
        `}
        style={esV2 ? undefined : {
          backgroundColor: theme.backgroundSecondary,
          border: `1px solid ${isOpen ? theme.primary : theme.border}`,
          color: theme.text,
          ['--tw-ring-color' as string]: `${theme.primary}40`,
        }}
      >
        <div className={esV2 ? 'ms2-cara' : 'flex items-center gap-1.5 flex-1 min-w-0'}>
          {selectedOption?.icon && (
            <div
              className={esV2 ? 'ms2-icono' : 'w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0'}
              style={esV2
                ? (selectedOption.color ? { color: selectedOption.color } : undefined)
                : {
                    backgroundColor: selectedOption.color ? `${selectedOption.color}20` : `${theme.primary}20`,
                    color: selectedOption.color || theme.primary
                  }}
            >
              {selectedOption.icon}
            </div>
          )}
          {esV2 ? (
            selectedOption ? (
              // runtime: color de la opción (dato), si la trae
              <span className="ms2-valor" style={selectedOption.color ? { color: selectedOption.color } : undefined}>
                {abbreviate ? abreviarPalabras(selectedOption.label) : selectedOption.label}
              </span>
            ) : (
              <span className="ms2-placeholder">{placeholder}</span>
            )
          ) : (
            <div className="min-w-0 flex-1">
              {selectedOption ? (
                <span
                  className="block truncate font-medium leading-tight"
                  style={{ color: selectedOption.color || theme.text }}
                >
                  {abbreviate ? abreviarPalabras(selectedOption.label) : selectedOption.label}
                </span>
              ) : (
                <span className="truncate block" style={{ color: theme.textSecondary }}>{placeholder}</span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={esV2
            ? `ms2-chevron${isOpen ? ' ms2-chevron--abierto' : ''}`
            : `h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={esV2 ? undefined : { color: theme.textSecondary }}
        />
      </button>

      {/* Dropdown via portal con position: fixed.
          Escapa de cualquier overflow:hidden ancestro y se ubica
          inteligentemente arriba/abajo segun el espacio disponible. */}
      {isOpen && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className={esV2
            ? 'ms2-menu'
            : 'rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200'}
          style={{
            position: 'fixed',
            top: dropdownPos.openUp ? undefined : dropdownPos.top,
            bottom: dropdownPos.openUp ? (window.innerHeight - dropdownPos.top) : undefined,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            ...(esV2 ? {} : {
              backgroundColor: theme.card,
              border: `1px solid ${theme.border}`,
              boxShadow: `0 20px 40px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px ${theme.border}`,
            }),
          }}
        >
          {/* Search Input */}
          {searchable && (
            <div
              className={esV2 ? 'ms2-buscador' : 'p-2 border-b'}
              style={esV2 ? undefined : { borderColor: theme.border }}
            >
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className={esV2 ? 'ms2-input' : 'w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2'}
                style={esV2 ? undefined : {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  ['--tw-ring-color' as string]: `${theme.primary}40`,
                }}
              />
            </div>
          )}

          {/* Options List */}
          <div
            className={esV2 ? 'ms2-lista' : 'overflow-y-auto py-1'}
            style={{ maxHeight: dropdownPos.maxHeight - (searchable ? 60 : 0) }}
          >
            {filteredOptions.length === 0 ? (
              <div
                className={esV2 ? 'ms2-vacio' : 'px-4 py-3 text-sm text-center'}
                style={esV2 ? undefined : { color: theme.textSecondary }}
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
                    className={esV2
                      ? `ms2-opcion${isSelected ? ' ms2-opcion--sel' : ''}${
                          option.emphasized === false ? ' ms2-opcion--tenue' : ''
                        }${!isSelected && option.emphasized ? ' ms2-opcion--fuerte' : ''}`
                      : `
                      w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px]
                      transition-all duration-150
                    `}
                    style={esV2 ? undefined : {
                      backgroundColor: isSelected ? `${theme.primary}15` : 'transparent',
                    }}
                    onMouseEnter={esV2 ? undefined : (e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = `${theme.primary}08`;
                      }
                    }}
                    onMouseLeave={esV2 ? undefined : (e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? `${theme.primary}15` : 'transparent';
                    }}
                  >
                    {option.icon && (
                      <div
                        className={esV2 ? 'ms2-opcion-icono' : 'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0'}
                        style={esV2
                          ? (option.color ? { color: option.color } : undefined)
                          : {
                              backgroundColor: option.color ? `${option.color}20` : `${theme.primary}20`,
                              color: option.color || theme.primary
                            }}
                      >
                        {option.icon}
                      </div>
                    )}
                    <div className={esV2 ? 'ms2-opcion-textos' : 'min-w-0 flex-1'}>
                      <span
                        className={esV2
                          ? 'ms2-opcion-label'
                          : `block truncate leading-tight ${
                              isSelected ? 'font-semibold' : option.emphasized ? 'font-bold' : 'font-medium'
                            }`}
                        style={esV2
                          ? (option.color ? { color: option.color } : undefined)
                          : {
                              color: option.color || theme.text,
                              opacity: option.emphasized === false ? 0.45 : 1,
                            }}
                      >
                        {option.label}
                      </span>
                      {option.description && (
                        <span
                          className={esV2 ? 'ms2-opcion-desc' : 'block text-[11px] truncate leading-tight'}
                          style={esV2 ? undefined : { color: theme.textSecondary }}
                        >
                          {option.description}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        className={esV2 ? 'ms2-check' : 'h-4 w-4 flex-shrink-0'}
                        style={esV2 ? undefined : { color: theme.primary }}
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
