import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Building2, Globe, Check } from 'lucide-react';
import { municipiosApi } from '../../lib/api';
import { saveMunicipio, clearMunicipio } from '../../utils/municipioStorage';
import { useTheme } from '../../contexts/ThemeContext';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  color_primario?: string;
}

/**
 * Muni switcher — dropdown en la topbar para que el super admin pueda
 * alternar entre "Global (cross-tenant)" y cualquier muni específico.
 *
 * Global → limpia el muni activo, navega a /gestion/consola.
 * Muni X → setea muni activo en localStorage, navega a /gestion/dashboard.
 */
export default function MunicipioSwitcher() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [currentMuniId, setCurrentMuniId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cargar lista de munis al montar
  useEffect(() => {
    (async () => {
      try {
        const res = await municipiosApi.getPublic();
        setMunicipios(res.data);
      } catch (e) {
        console.error('Error cargando munis:', e);
      }
    })();
  }, []);

  // Sincronizar con localStorage
  useEffect(() => {
    const syncFromStorage = () => {
      const id = localStorage.getItem('municipio_actual_id');
      setCurrentMuniId(id ? parseInt(id) : null);
    };
    syncFromStorage();
    window.addEventListener('municipio-changed', syncFromStorage);
    return () => window.removeEventListener('municipio-changed', syncFromStorage);
  }, []);

  // Click outside close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleGlobal = async () => {
    await clearMunicipio();
    setOpen(false);
    navigate('/gestion/consola');
  };

  const handleSelectMuni = async (m: Municipio) => {
    await saveMunicipio({
      id: String(m.id),
      codigo: m.codigo,
      nombre: m.nombre,
      color: m.color_primario || theme.primary,
    });
    setOpen(false);
    navigate('/gestion/dashboard');
  };

  const current = currentMuniId ? municipios.find((m) => m.id === currentMuniId) : null;
  const label = current ? current.nombre : 'Global';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors"
        style={{
          backgroundColor: theme.card,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {current ? (
          <Building2 className="h-4 w-4" style={{ color: theme.primary }} />
        ) : (
          <Globe className="h-4 w-4" style={{ color: theme.primary }} />
        )}
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ backgroundColor: theme.card, borderColor: theme.border }}
        >
          <div
            className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}
          >
            Cambiar contexto
          </div>
          <button
            onClick={handleGlobal}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-black/5"
            style={{ color: theme.text }}
          >
            <Globe className="h-4 w-4 flex-shrink-0" style={{ color: theme.primary }} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Global</div>
              <div className="text-xs" style={{ color: theme.textSecondary }}>Vista cross-tenant</div>
            </div>
            {!current && <Check className="h-4 w-4" style={{ color: theme.primary }} />}
          </button>
          <div className="max-h-72 overflow-y-auto" style={{ borderTop: `1px solid ${theme.border}` }}>
            {municipios.length === 0 ? (
              <p className="px-3 py-4 text-sm text-center" style={{ color: theme.textSecondary }}>
                Sin municipios
              </p>
            ) : (
              municipios.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMuni(m)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-black/5"
                  style={{ color: theme.text }}
                >
                  <Building2 className="h-4 w-4 flex-shrink-0" style={{ color: m.color_primario || theme.textSecondary }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{m.nombre}</div>
                    <div className="text-xs font-mono" style={{ color: theme.textSecondary }}>{m.codigo}</div>
                  </div>
                  {current?.id === m.id && <Check className="h-4 w-4" style={{ color: theme.primary }} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
