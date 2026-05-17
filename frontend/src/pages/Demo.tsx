import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Building2, Sparkles, ArrowRight, Trash2, Check, Search, ShieldCheck, CreditCard } from 'lucide-react';
import { municipiosApi } from '../lib/api';
import { clearMunicipio } from '../utils/municipioStorage';
import DemoCreationProgress from '../components/DemoCreationProgress';
import { MunifyLogo } from '../components/ui/MunifyLogo';
import { ConfirmModal } from '../components/ui/ConfirmModal';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  color_primario?: string;
  logo_url?: string;
}

const PLACEHOLDER_CITIES = ['Pergamino', 'San Pedro', 'Salta', 'Tandil', 'Rosario', 'Bariloche'];
const MAX_NAME = 40;
const MIN_NAME = 3;
const SEARCH_THRESHOLD = 6;

export default function Demo() {
  const navigate = useNavigate();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [creandoDone, setCreandoDone] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Municipio | null>(null);
  const [search, setSearch] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    clearMunicipio();
    const fetchMunicipios = async () => {
      try {
        const response = await municipiosApi.getPublic();
        setMunicipios(response.data);
      } catch (err) {
        console.error('Error cargando municipios:', err);
        setError('No se pudieron cargar los municipios');
      } finally {
        setLoading(false);
      }
    };
    fetchMunicipios();
  }, []);

  // Rotar placeholder cada 2.2s mientras el input esté vacío y no haya foco.
  useEffect(() => {
    if (nuevoNombre.length > 0) return;
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_CITIES.length);
    }, 2200);
    return () => clearInterval(id);
  }, [nuevoNombre]);

  const saveMunicipioToStorage = (municipio: Municipio) => {
    localStorage.setItem('municipio_id', String(municipio.id));
    localStorage.setItem('municipio_actual_id', String(municipio.id));
    localStorage.setItem('municipio_codigo', municipio.codigo);
    localStorage.setItem('municipio_nombre', municipio.nombre);
    localStorage.setItem('municipio_color', municipio.color_primario || '#0088cc');
  };

  const handleSelectMunicipio = (municipio: Municipio) => {
    saveMunicipioToStorage(municipio);
    navigate(`/demo/listo?muni=${municipio.codigo}`);
  };

  const confirmEliminar = async () => {
    if (!toDelete) return;
    const muni = toDelete;
    setEliminando(muni.codigo);
    try {
      await municipiosApi.eliminarDemo(muni.codigo);
      setMunicipios((prev) => prev.filter((m) => m.id !== muni.id));
      setToDelete(null);
    } catch (err) {
      console.error('Error eliminando demo:', err);
      setError('No se pudo eliminar la demo');
    } finally {
      setEliminando(null);
    }
  };

  const handleCrearDemo = async () => {
    const nombre = nuevoNombre.trim();
    if (nombre.length < MIN_NAME) {
      setError(`El nombre debe tener al menos ${MIN_NAME} caracteres`);
      return;
    }
    setCreando(true);
    setCreandoDone(false);
    setError('');
    try {
      const res = await municipiosApi.crearDemo(nombre);
      const muni = res.data;
      saveMunicipioToStorage({
        id: muni.id,
        nombre: muni.nombre,
        codigo: muni.codigo,
        color_primario: '#0088cc',
      });
      setCreandoDone(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      navigate(`/demo/listo?muni=${muni.codigo}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail || 'Error creando el municipio de demo');
    } finally {
      setCreando(false);
    }
  };

  const trimmed = nuevoNombre.trim();
  const nameValid = trimmed.length >= MIN_NAME && trimmed.length <= MAX_NAME;

  const filteredMunicipios = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return municipios;
    return municipios.filter(
      (m) => m.nombre.toLowerCase().includes(q) || m.codigo.toLowerCase().includes(q),
    );
  }, [municipios, search]);

  const showSearch = municipios.length >= SEARCH_THRESHOLD;

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col overflow-hidden">
      {/* Mesh gradient de fondo — blobs blurreados que dan profundidad sin ruido. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full bg-blue-300/40 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full bg-cyan-200/50 blur-[130px]" />
        <div className="absolute -bottom-40 left-1/3 w-[420px] h-[420px] rounded-full bg-violet-200/40 blur-[120px]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      </div>

      {/* Wrapper relative para que todo lo de abajo quede sobre los blobs. */}
      <div className="relative z-10 flex flex-col flex-1">
      {creando && (
        <DemoCreationProgress done={creandoDone} municipioNombre={nuevoNombre} />
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmEliminar}
        title="Eliminar demo"
        message={
          toDelete
            ? `Se borrarán todos los datos de "${toDelete.nombre}" (categorías, trámites, usuarios). Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={!!eliminando}
      />

      <header className="flex-shrink-0 px-4 sm:px-6 py-4 sm:py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <MunifyLogo size={36} variant="content" className="flex-shrink-0" />
            <span className="text-lg sm:text-xl font-bold text-slate-800 truncate">Munify</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-700 text-xs transition-colors flex-shrink-0"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ya tengo cuenta</span>
            <span className="sm:hidden">Ingresar</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-800 mb-3 leading-tight">
              Probá Munify en tu municipio
            </h1>
            <p className="text-slate-500 text-base sm:text-lg">
              Escribí el nombre y armamos una demo en 3 segundos
            </p>
          </div>

          <div className="mb-6 bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_-8px_rgba(15,23,42,0.12),0_2px_8px_-2px_rgba(15,23,42,0.06)] p-4 sm:p-6 relative overflow-hidden">
            {/* Top stripe gradient — refuerza que es el CTA principal. */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-violet-400" />
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Crear demo en vivo
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 min-w-0 relative">
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value.slice(0, MAX_NAME))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !creando && nameValid) handleCrearDemo();
                  }}
                  placeholder={`Ej: ${PLACEHOLDER_CITIES[placeholderIdx]}...`}
                  disabled={creando}
                  maxLength={MAX_NAME}
                  className={`w-full px-4 py-3 pr-20 rounded-xl border-2 focus:outline-none text-slate-800 placeholder-slate-400 transition-colors disabled:opacity-50 ${
                    nameValid
                      ? 'border-green-400 focus:border-green-500'
                      : 'border-slate-200 focus:border-blue-500'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  {nameValid && <Check className="h-4 w-4 text-green-500" />}
                  <span
                    className={`text-[10px] font-medium tabular-nums ${
                      trimmed.length === 0
                        ? 'text-slate-300'
                        : nameValid
                          ? 'text-green-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {trimmed.length}/{MAX_NAME}
                  </span>
                </div>
              </div>
              <button
                onClick={handleCrearDemo}
                disabled={creando || !nameValid}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {creando ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    Probar ahora
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>

            {/* Social proof / garantía — antes era texto gris chiquito. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <CreditCard className="h-3.5 w-3.5 text-green-600" />
                Sin tarjeta
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                Sin registro
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                Admin + vecino listos
              </div>
            </div>
          </div>

          {municipios.length > 0 && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                o entrá a uno existente
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              {showSearch && (
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar municipio..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/60 bg-white/70 backdrop-blur-md focus:border-blue-400 focus:bg-white/90 focus:outline-none focus:ring-4 focus:ring-blue-500/10 text-sm text-slate-800 placeholder-slate-400 transition-all"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {filteredMunicipios.map((municipio) => {
                  const primaryColor = municipio.color_primario || '#0088cc';
                  const isEliminando = eliminando === municipio.codigo;
                  return (
                    <div
                      key={municipio.id}
                      className="relative group rounded-2xl border border-white/70 bg-white/75 backdrop-blur-md overflow-hidden transition-all duration-200 hover:bg-white/90 hover:-translate-y-0.5 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_2px_6px_-1px_rgba(15,23,42,0.06)]"
                      style={{
                        // Glow sutil del color del muni en hover (via box-shadow inset top).
                        boxShadow: undefined,
                      }}
                    >
                      {/* Top stripe del color del muni — identidad visual + jerarquía. */}
                      <div
                        className="absolute top-0 left-0 right-0 h-[3px] opacity-70 group-hover:opacity-100 transition-opacity"
                        style={{
                          background: `linear-gradient(90deg, ${primaryColor} 0%, ${primaryColor}80 100%)`,
                        }}
                      />
                      <button
                        onClick={() => handleSelectMunicipio(municipio)}
                        disabled={isEliminando}
                        className="w-full text-left p-4 flex items-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-50"
                      >
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${primaryColor}15` }}
                        >
                          {municipio.logo_url ? (
                            <img src={municipio.logo_url} alt={municipio.nombre} className="w-7 h-7 object-contain" />
                          ) : (
                            <Building2 className="h-5 w-5" style={{ color: primaryColor }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold truncate text-slate-800 text-sm">{municipio.nombre}</h3>
                          <p className="text-xs text-slate-400 truncate">{municipio.codigo}</p>
                        </div>
                        <ArrowRight
                          className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all"
                          style={{ color: primaryColor }}
                        />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setToDelete(municipio);
                        }}
                        disabled={isEliminando}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg flex items-center justify-center bg-white/0 hover:bg-red-50 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                        title={`Eliminar demo ${municipio.nombre}`}
                        aria-label={`Eliminar demo ${municipio.nombre}`}
                      >
                        {isEliminando ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {showSearch && filteredMunicipios.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">
                  No hay municipios que coincidan con "{search}"
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="flex-shrink-0 py-6 px-6">
        <p className="text-center text-slate-400 text-sm">
          Munify - Conectando al gobierno con las necesidades del vecino
        </p>
      </footer>
      </div>
    </div>
  );
}
