import { useState, useRef, useEffect, KeyboardEvent, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface SchemaColumn {
  name: string;
  type: string;
  fk: string | null;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  schema: Record<string, SchemaColumn[]>;
  placeholder?: string;
  onSubmit?: () => void;
  className?: string;
  disabled?: boolean;
  /** Callback cuando cambian las palabras seleccionadas del autocomplete */
  onSelectedWordsChange?: (words: string[]) => void;
}

type SuggestionType = 'table' | 'column';

interface Suggestion {
  type: SuggestionType;
  value: string;
  table?: string;
  fk?: string | null;
  columnType?: string;
}

/**
 * Input con autocompletado inline estilo IntelliSense.
 *
 * - Escribir texto → muestra sugerencias de tablas que coincidan
 * - Seleccionar tabla con Enter/Tab → se inserta en el texto
 * - Escribir "tabla." → muestra columnas de esa tabla
 * - Navegación con ↑↓, selección con Enter/Tab, cerrar con Escape
 * - Las palabras seleccionadas del autocomplete quedan resaltadas
 */
export function AutocompleteInput({
  value,
  onChange,
  schema,
  placeholder = 'Escribí tu consulta...',
  onSubmit,
  className = '',
  disabled = false,
  onSelectedWordsChange,
}: AutocompleteInputProps) {
  const { theme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  // Palabras seleccionadas del autocomplete (tablas y columnas)
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());

  // Notificar cambios en palabras seleccionadas
  useEffect(() => {
    onSelectedWordsChange?.(Array.from(selectedWords));
  }, [selectedWords, onSelectedWordsChange]);

  // Analizar el texto para determinar qué sugerir
  const analyzeCursor = (text: string): { type: 'table' | 'column' | 'none'; partial: string; table?: string } => {
    // Obtener la última "palabra" (puede incluir punto)
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1] || '';

    // Si tiene punto, es columna
    if (lastWord.includes('.')) {
      const [tableName, columnPartial] = lastWord.split('.');
      const tableExists = Object.keys(schema).includes(tableName.toLowerCase());
      if (tableExists) {
        return { type: 'column', partial: columnPartial || '', table: tableName.toLowerCase() };
      }
    }

    // Si tiene al menos 2 caracteres, buscar tablas
    if (lastWord.length >= 2) {
      return { type: 'table', partial: lastWord.toLowerCase() };
    }

    return { type: 'none', partial: '' };
  };

  // Actualizar sugerencias cuando cambia el valor
  useEffect(() => {
    const analysis = analyzeCursor(value);

    if (analysis.type === 'none') {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    let newSuggestions: Suggestion[] = [];

    if (analysis.type === 'table') {
      // Buscar tablas que coincidan
      newSuggestions = Object.keys(schema)
        .filter(tableName => tableName.includes(analysis.partial))
        .slice(0, 8)
        .map(tableName => ({
          type: 'table' as const,
          value: tableName,
        }));
    } else if (analysis.type === 'column' && analysis.table) {
      // Buscar columnas de la tabla
      const columns = schema[analysis.table] || [];
      newSuggestions = columns
        .filter(col => col.name.toLowerCase().includes(analysis.partial.toLowerCase()))
        .slice(0, 10)
        .map(col => ({
          type: 'column' as const,
          value: col.name,
          table: analysis.table,
          fk: col.fk,
          columnType: col.type,
        }));
    }

    setSuggestions(newSuggestions);
    setShowDropdown(newSuggestions.length > 0);
    setHighlightedIndex(0);
  }, [value, schema]);

  // Insertar la sugerencia seleccionada
  const insertSuggestion = (suggestion: Suggestion) => {
    const words = value.split(/\s+/);
    const lastWord = words[words.length - 1] || '';

    let newValue: string;
    let wordToAdd: string;

    if (suggestion.type === 'table') {
      // Reemplazar la palabra parcial con la tabla
      words[words.length - 1] = suggestion.value;
      newValue = words.join(' ') + ' ';
      wordToAdd = suggestion.value;
    } else {
      // Reemplazar tabla.parcial con tabla.columna
      const beforeLastWord = value.slice(0, value.length - lastWord.length);
      const fullColumn = `${suggestion.table}.${suggestion.value}`;
      newValue = beforeLastWord + fullColumn + ' ';
      wordToAdd = fullColumn;
    }

    // Agregar a palabras seleccionadas
    setSelectedWords(prev => new Set([...prev, wordToAdd]));

    onChange(newValue);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // Limpiar palabras que ya no están en el texto
  useEffect(() => {
    if (selectedWords.size === 0) return;

    const newSelected = new Set<string>();
    selectedWords.forEach(word => {
      // Verificar si la palabra sigue en el texto
      if (value.toLowerCase().includes(word.toLowerCase())) {
        newSelected.add(word);
      }
    });

    if (newSelected.size !== selectedWords.size) {
      setSelectedWords(newSelected);
    }
  }, [value]);

  // Generar HTML con highlighting para el overlay
  const highlightedHtml = useMemo(() => {
    if (selectedWords.size === 0) return value;

    let result = value;
    // Ordenar palabras por longitud descendente para evitar reemplazos parciales
    const sortedWords = Array.from(selectedWords).sort((a, b) => b.length - a.length);

    sortedWords.forEach(word => {
      // Escapar caracteres especiales para regex
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      result = result.replace(regex, `<mark>$1</mark>`);
    });

    return result;
  }, [value, selectedWords]);

  // Sincronizar scroll del overlay con el input
  useEffect(() => {
    const input = inputRef.current;
    const overlay = overlayRef.current;
    if (!input || !overlay) return;

    const syncScroll = () => {
      overlay.scrollLeft = input.scrollLeft;
    };

    input.addEventListener('scroll', syncScroll);
    return () => input.removeEventListener('scroll', syncScroll);
  }, []);

  // Manejar teclas especiales
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Enter' && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        insertSuggestion(suggestions[highlightedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        break;
    }
  };

  // Scroll al item highlighted
  useEffect(() => {
    if (dropdownRef.current && showDropdown) {
      const highlighted = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, showDropdown]);

  // Color del highlight
  const highlightColor = `${theme.primary}30`;

  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      {/* Input */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 z-10"
          style={{ color: theme.textSecondary }}
        />

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay para permitir click en sugerencia
            setTimeout(() => setShowDropdown(false), 150);
          }}
          onFocus={() => {
            // Re-analizar al enfocar
            const analysis = analyzeCursor(value);
            if (analysis.type !== 'none' && suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:ring-2 focus:outline-none transition-all"
          style={{
            backgroundColor: theme.background,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        />
      </div>

      {/* Tags de palabras seleccionadas */}
      {selectedWords.size > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {Array.from(selectedWords).map(word => (
            <span
              key={word}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: highlightColor,
                color: theme.primary,
              }}
            >
              {word.includes('.') ? '📋' : '📊'} {word}
            </span>
          ))}
        </div>
      )}

      {/* Dropdown de sugerencias */}
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-1.5 text-xs font-semibold border-b"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary, borderColor: theme.border }}
          >
            {suggestions[0]?.type === 'table' ? (
              '📊 Tablas'
            ) : (
              <>📋 Columnas de <span style={{ color: theme.primary }}>{suggestions[0]?.table}</span></>
            )}
            <span className="float-right opacity-70">↑↓ navegar · Enter seleccionar</span>
          </div>

          {/* Lista de sugerencias */}
          <div className="p-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.value}`}
                data-index={index}
                onClick={() => insertSuggestion(suggestion)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors"
                style={{
                  backgroundColor: index === highlightedIndex ? `${theme.primary}20` : 'transparent',
                  color: index === highlightedIndex ? theme.primary : theme.text,
                }}
              >
                {suggestion.type === 'table' ? (
                  <>
                    <span className="text-xs opacity-60">📊</span>
                    <span className="font-medium">{suggestion.value}</span>
                    <span className="text-xs opacity-50 ml-auto">
                      {schema[suggestion.value]?.length || 0} campos
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs opacity-60">{suggestion.fk ? '🔗' : '📋'}</span>
                    <span className="font-medium">{suggestion.value}</span>
                    <span className="text-xs opacity-50 ml-auto">
                      {suggestion.columnType}
                      {suggestion.fk && <span className="ml-1">→ {suggestion.fk}</span>}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AutocompleteInput;
