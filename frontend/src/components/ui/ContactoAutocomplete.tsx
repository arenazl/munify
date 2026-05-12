import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useDebounce } from '../../hooks/useDebounce';
import { contactosApi } from '../../lib/api';
import type { Contacto, TipoContacto } from '../../types';

/**
 * Input con autocomplete async contra contactosApi.list({search}).
 *
 * Pensado para filtros y wizards que necesiten elegir un contacto por nombre.
 * Hace fetch debounced (300ms) mientras el user tipea. El dropdown muestra
 * nombre + apellido + tipo con chip de color.
 *
 * Reusable: cualquier pantalla que necesite "elegir un contacto" debe usar
 * este componente en lugar de armarlo a mano (regla DRY del repo).
 */
interface Props {
  value: number | null;
  onChange: (id: number | null, contacto: Contacto | null) => void;
  placeholder?: string;
  tipoFilter?: TipoContacto[];
  className?: string;
  /** Largo minimo del input para arrancar el fetch. Default 1. */
  minChars?: number;
}

const TIPO_COLORS: Record<TipoContacto, string> = {
  concejal: '#8b5cf6',
  empleado: '#3b82f6',
  profesional: '#f59e0b',
  proveedor: '#10b981',
  contratista: '#06b6d4',
  beneficiario: '#ec4899',
  otro: '#71717a',
};

const TIPO_LABELS: Record<TipoContacto, string> = {
  concejal: 'Concejal',
  empleado: 'Empleado',
  profesional: 'Profesional',
  proveedor: 'Proveedor',
  contratista: 'Contratista',
  beneficiario: 'Beneficiario',
  otro: 'Otro',
};

function nombreCompleto(c: Contacto): string {
  return `${c.nombre} ${c.apellido || ''}`.trim();
}

export function ContactoAutocomplete({
  value,
  onChange,
  placeholder = 'Buscar contacto...',
  tipoFilter,
  className = '',
  minChars = 1,
}: Props) {
  const { theme } = useTheme();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Contacto | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(search, 300);

  // Si recibe un value externo, cargamos el contacto para mostrar su nombre
  useEffect(() => {
    if (value == null) {
      setSelected(null);
      return;
    }
    // Si ya lo tenemos cacheado por busqueda previa, usalo
    const hit = results.find(c => c.id === value);
    if (hit) {
      setSelected(hit);
      return;
    }
    // Sino, fetch individual para resolver el nombre
    contactosApi.list({ skip: 0, limit: 100 })
      .then(res => {
        const found = (res.data as Contacto[]).find(c => c.id === value);
        if (found) setSelected(found);
      })
      .catch(() => {});
  }, [value]);

  // Cerrar al hacer click afuera
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Fetch debounced
  useEffect(() => {
    if (debounced.length < minChars) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    contactosApi.list({ search: debounced, limit: 20 })
      .then(res => {
        if (cancelled) return;
        let data = res.data as Contacto[];
        if (tipoFilter && tipoFilter.length > 0) {
          data = data.filter(c => tipoFilter.includes(c.tipo as TipoContacto));
        }
        setResults(data);
      })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, minChars, tipoFilter]);

  const handlePick = (c: Contacto) => {
    setSelected(c);
    setSearch('');
    setOpen(false);
    onChange(c.id, c);
  };

  const handleClear = () => {
    setSelected(null);
    setSearch('');
    setResults([]);
    onChange(null, null);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <Search className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
        {selected ? (
          <>
            <span
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: `${TIPO_COLORS[selected.tipo as TipoContacto]}22`,
                color: TIPO_COLORS[selected.tipo as TipoContacto],
              }}
            >
              {TIPO_LABELS[selected.tipo as TipoContacto]}
            </span>
            <span className="flex-1 truncate" style={{ color: theme.text }}>
              {nombreCompleto(selected)}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="flex-shrink-0 p-0.5 rounded hover:opacity-70"
              style={{ color: theme.textSecondary }}
              title="Limpiar"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none"
            style={{ color: theme.text }}
          />
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" style={{ color: theme.textSecondary }} />}
      </div>

      {open && !selected && search.length >= minChars && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-lg shadow-xl overflow-hidden z-50 max-h-72 overflow-y-auto"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          {results.length === 0 && !loading && (
            <div className="px-3 py-2 text-sm" style={{ color: theme.textSecondary }}>
              Sin resultados
            </div>
          )}
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => handlePick(c)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:opacity-80 transition-opacity"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <span
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 uppercase font-semibold"
                style={{
                  backgroundColor: `${TIPO_COLORS[c.tipo as TipoContacto]}22`,
                  color: TIPO_COLORS[c.tipo as TipoContacto],
                }}
              >
                {TIPO_LABELS[c.tipo as TipoContacto]}
              </span>
              <span className="flex-1 truncate text-sm" style={{ color: theme.text }}>
                {nombreCompleto(c)}
              </span>
              {c.dni && (
                <span className="text-[10px] font-mono" style={{ color: theme.textSecondary }}>
                  {c.dni}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
