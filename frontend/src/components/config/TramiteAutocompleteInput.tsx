import { useEffect, useRef, useState } from 'react';
import { Sparkles, Search, Loader2, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { tramitesSugeridosApi } from '../../lib/api';

export interface TramiteSugerencia {
  id: number;
  nombre: string;
  descripcion?: string | null;
  tiempo_estimado_dias?: number | null;
  costo?: number | null;
  documentos_sugeridos?: string | null;
  documentos_lista: string[];
  rubro?: string | null;
}

interface Props {
  value: string;
  onChange: (nombre: string) => void;
  /**
   * Callback que se dispara cuando el usuario elige una sugerencia del dropdown.
   * Recibe la sugerencia completa para que el caller precargue el resto del form
   * (descripción, tiempo, costo, documentos requeridos).
   */
  onSelectSugerencia: (sugerencia: TramiteSugerencia) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Input con autocomplete no-restrictivo contra el catálogo global de trámites
 * sugeridos (`/api/tramites-sugeridos`).
 *
 * Comportamiento:
 * - El admin puede escribir cualquier cosa libremente (no es un select).
 * - Mientras escribe >= 2 caracteres, debounced 300ms, consulta el endpoint
 *   y muestra un dropdown con hasta 10 sugerencias.
 * - Click en una sugerencia: llena el nombre **y** dispara `onSelectSugerencia`
 *   para que el caller precargue los demás campos del form.
 * - Si el admin sigue escribiendo después de elegir, no se borra nada — solo
 *   se reemplaza el nombre por lo que escribe.
 * - Esc o click afuera cierra el dropdown sin tocar el valor.
 */
export function TramiteAutocompleteInput({
  value,
  onChange,
  onSelectSugerencia,
  placeholder = 'Ej: Licencia de Conducir...',
  autoFocus = false,
}: Props) {
  const { theme } = useTheme();
  const [sugerencias, setSugerencias] = useState<TramiteSugerencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cerrar el dropdown si se hace click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch debounced cuando cambia el value
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSugerencias([]);
      setLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await tramitesSugeridosApi.search(value, undefined, 10);
        setSugerencias(res.data || []);
      } catch (err) {
        console.error('Error cargando sugerencias de trámites:', err);
        setSugerencias([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handleSelect = (sug: TramiteSugerencia) => {
    onChange(sug.nombre);
    onSelectSugerencia(sug);
    setOpen(false);
    setFocusedIdx(-1);
    // Sacar el foco del input para que el usuario vea el prefill
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || sugerencias.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx(i => Math.min(i + 1, sugerencias.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault();
      handleSelect(sugerencias[focusedIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setFocusedIdx(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setOpen(true);
            setFocusedIdx(-1);
          }}
          onFocus={() => value.trim().length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          className="w-full px-4 py-3 pr-10 rounded-xl text-sm"
          style={{
            backgroundColor: theme.backgroundSecondary,
            border: `1px solid ${theme.border}`,
            color: theme.text,
          }}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.textSecondary }} />
          ) : value ? (
            <button
              type="button"
              onClick={() => { onChange(''); inputRef.current?.focus(); }}
              className="p-0.5 rounded hover:bg-black/10"
              style={{ color: theme.textSecondary }}
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <Search className="h-4 w-4" style={{ color: theme.textSecondary }} />
          )}
        </div>
      </div>

      {/* Dropdown de sugerencias */}
      {open && sugerencias.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            zIndex: 100,
          }}
        >
          <div
            className="px-3 py-2 text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1.5"
            style={{
              backgroundColor: theme.backgroundSecondary,
              color: theme.textSecondary,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <Sparkles className="h-3 w-3" />
            Sugerencias del catálogo ({sugerencias.length})
          </div>
          {sugerencias.map((sug, idx) => {
            const focused = idx === focusedIdx;
            return (
              <button
                key={sug.id}
                type="button"
                onClick={() => handleSelect(sug)}
                onMouseEnter={() => setFocusedIdx(idx)}
                className="w-full text-left px-3 py-2.5 transition-colors border-b last:border-b-0"
                style={{
                  backgroundColor: focused ? theme.backgroundSecondary : 'transparent',
                  borderBottomColor: theme.border,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                      {sug.nombre}
                    </p>
                    {sug.descripcion && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: theme.textSecondary }}>
                        {sug.descripcion}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: theme.textSecondary }}>
                      {sug.rubro && (
                        <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: theme.backgroundSecondary }}>
                          {sug.rubro}
                        </span>
                      )}
                      {sug.tiempo_estimado_dias && <span>{sug.tiempo_estimado_dias} días</span>}
                      {sug.costo ? <span>${sug.costo.toLocaleString('es-AR')}</span> : <span>Gratis</span>}
                      {sug.documentos_lista.length > 0 && (
                        <span>{sug.documentos_lista.length} docs</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          <div
            className="px-3 py-2 text-[10px] italic text-center"
            style={{
              color: theme.textSecondary,
              backgroundColor: theme.backgroundSecondary,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            O seguí escribiendo para crear uno desde cero
          </div>
        </div>
      )}
    </div>
  );
}
