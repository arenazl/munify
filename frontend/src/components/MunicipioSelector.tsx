import { useState, useRef, useEffect, useMemo } from 'react';
import { Building2, Search, Check, X } from 'lucide-react';
import { useAuth, Municipio } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export function MunicipioSelector() {
  const { municipios, municipioActual, setMunicipioActual, user } = useAuth();
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Solo mostrar para super admin (admin sin municipio_id asignado)
  const isSuperAdmin = user?.rol === 'admin' && !user?.municipio_id;
  const showSelector = isSuperAdmin && municipios.length > 0;

  // Filtrar municipios por búsqueda
  const filteredMunicipios = useMemo(() => {
    if (!searchTerm.trim()) return municipios;
    const term = searchTerm.toLowerCase();
    return municipios.filter(m =>
      m.nombre.toLowerCase().includes(term) ||
      m.codigo.toLowerCase().includes(term)
    );
  }, [municipios, searchTerm]);

  // Cerrar dropdown al hacer click fuera
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

  // Focus en input cuando se abre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (municipio: Municipio) => {
    setMunicipioActual(municipio);
    setIsOpen(false);
    setSearchTerm('');
    // Recargar la página para que los datos se actualicen
    window.location.reload();
  };

  const handleOpen = () => {
    setIsOpen(true);
    setSearchTerm('');
  };

  if (!showSelector || !municipioActual) {
    return null;
  }

  return (
    <div className="relative flex items-center gap-3" ref={containerRef}>
      {/* Badge Super Admin */}
      <div
        className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: `${theme.primary}20`,
          color: theme.primary,
          border: `1px solid ${theme.primary}40`,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.primary }} />
        Super Admin
      </div>

      {/* Botón/Input para abrir el selector */}
      {!isOpen ? (
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02]"
          style={{
            backgroundColor: `${theme.primary}10`,
            color: theme.text,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: municipioActual.color_primario || theme.primary,
            }}
          >
            <Building2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-medium text-sm truncate max-w-[150px]">
            {municipioActual.nombre.replace('Municipalidad de ', '')}
          </span>
          <Search className="h-4 w-4 opacity-50" />
        </button>
      ) : (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.primary}`,
            boxShadow: `0 0 0 2px ${theme.primary}30`,
          }}
        >
          <Search className="h-4 w-4" style={{ color: theme.primary }} />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar municipio..."
            className="bg-transparent outline-none text-sm w-40"
            style={{ color: theme.text }}
          />
          <button
            onClick={() => { setIsOpen(false); setSearchTerm(''); }}
            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" style={{ color: theme.textSecondary }} />
          </button>
        </div>
      )}

      {/* Dropdown de resultados */}
      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-2xl overflow-hidden"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            zIndex: 9999,
          }}
        >
          <div className="max-h-64 overflow-y-auto">
            {filteredMunicipios.length === 0 ? (
              <div className="p-4 text-center" style={{ color: theme.textSecondary }}>
                <p className="text-sm">No se encontraron municipios</p>
              </div>
            ) : (
              filteredMunicipios.map((muni) => {
                const isSelected = municipioActual?.id === muni.id;
                return (
                  <button
                    key={muni.id}
                    onClick={() => handleSelect(muni)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 hover:translate-x-1"
                    style={{
                      backgroundColor: isSelected ? `${theme.primary}15` : 'transparent',
                      color: theme.text,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = `${theme.primary}08`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: muni.color_primario || theme.primary,
                      }}
                    >
                      <Building2 className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {muni.nombre.replace('Municipalidad de ', '')}
                      </p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>
                        {muni.codigo}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
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
