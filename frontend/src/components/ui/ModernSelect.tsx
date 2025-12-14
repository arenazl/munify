import { useState, useRef, useEffect, ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

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
}: ModernSelectProps) {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus en el input de búsqueda cuando se abre
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const filteredOptions = searchable && searchTerm
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opt.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
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
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
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

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-2 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
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
          <div className="max-h-64 overflow-y-auto py-1">
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
        </div>
      )}
    </div>
  );
}
