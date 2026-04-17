import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Check, Building2, Sparkles, ArrowRight, Trash2 } from 'lucide-react';
import { municipiosApi } from '../lib/api';
import { clearMunicipio } from '../utils/municipioStorage';
import DemoCreationProgress from '../components/DemoCreationProgress';
import munifyLogo from '../assets/munify_logo.png';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  color_primario?: string;
  logo_url?: string;
}

export default function Demo() {
  const navigate = useNavigate();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [selectedMunicipio, setSelectedMunicipio] = useState<Municipio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Estado del creador de muni demo (input + loading del POST).
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [creandoDone, setCreandoDone] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);

  // Cargar municipios al montar (endpoint público, sin auth).
  // También limpiamos el municipio guardado del localStorage para que
  // el tab vuelva a decir "Munify" (no el nombre de un muni anterior).
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

  // Guardar municipio seleccionado en localStorage
  const saveMunicipioToStorage = (municipio: Municipio) => {
    localStorage.setItem('municipio_id', String(municipio.id));
    localStorage.setItem('municipio_actual_id', String(municipio.id));
    localStorage.setItem('municipio_codigo', municipio.codigo);
    localStorage.setItem('municipio_nombre', municipio.nombre);
    localStorage.setItem('municipio_color', municipio.color_primario || '#0088cc');
  };

  const handleSelectMunicipio = (municipio: Municipio) => {
    // Al clickear un muni, ir directo a la pantalla de perfiles (DemoReady)
    // para que elijan el rol con el que quieren entrar (admin/supervisor/vecino).
    setSelectedMunicipio(municipio);
    saveMunicipioToStorage(municipio);
    navigate(`/demo/listo?muni=${municipio.codigo}`);
  };

  const handleEliminarDemo = async (e: React.MouseEvent, municipio: Municipio) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar la demo "${municipio.nombre}"? Se borran todos sus datos.`)) return;
    setEliminando(municipio.codigo);
    try {
      await municipiosApi.eliminarDemo(municipio.codigo);
      setMunicipios((prev) => prev.filter((m) => m.id !== municipio.id));
      if (selectedMunicipio?.id === municipio.id) setSelectedMunicipio(null);
    } catch (err) {
      console.error('Error eliminando demo:', err);
      setError('No se pudo eliminar la demo');
    } finally {
      setEliminando(null);
    }
  };

  /**
   * Crea un municipio de demo en vivo desde el input comercial.
   *
   * Flujo:
   * 1. POST /municipios/crear-demo con solo el nombre → el backend arma
   *    todo el seed (categorías, dep General, 2 users demo con `demo123`).
   * 2. Guardamos el muni en localStorage como "municipio actual".
   * 3. Navegamos a /demo/listo?muni=<codigo> — pantalla minimalista con
   *    SOLO los 2 botones de quick-login (Admin / Vecino) del muni creado.
   */
  const handleCrearDemo = async () => {
    const nombre = nuevoNombre.trim();
    if (nombre.length < 3) {
      setError('El nombre del municipio debe tener al menos 3 caracteres');
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
      // Mostrar "¡Listo!" y check verde unos 600ms antes de navegar
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      {/* Progress modal mientras crear-demo está en vuelo (endpoint tarda ~18s) */}
      {creando && (
        <DemoCreationProgress done={creandoDone} municipioNombre={nuevoNombre} />
      )}

      {/* Header minimalista */}
      <header className="flex-shrink-0 px-4 sm:px-6 py-4 sm:py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src={munifyLogo} alt="Munify" className="h-8 sm:h-9 w-auto flex-shrink-0" />
            <span className="text-lg sm:text-xl font-bold text-slate-800 truncate">Munify</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-slate-600 hover:text-slate-900 font-medium text-xs sm:text-sm transition-colors flex-shrink-0"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Ya tengo cuenta</span>
            <span className="sm:hidden">Ingresar</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-8">
        <div className="w-full max-w-2xl">
          {/* Título comercial */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-800 mb-3 leading-tight">
              Probá Munify en tu municipio
            </h1>
            <p className="text-slate-500 text-base sm:text-lg">
              Escribí el nombre y armamos una demo en 3 segundos
            </p>
          </div>

          {/* Creador de muni demo — protagonista comercial. */}
          <div className="mb-8 sm:mb-10 bg-white rounded-2xl border-2 border-slate-200 shadow-sm p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wider">
                Crear demo en vivo
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creando) handleCrearDemo();
                }}
                placeholder="Ej: Pergamino, San Pedro, Salta..."
                disabled={creando}
                className="flex-1 min-w-0 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800 placeholder-slate-400 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleCrearDemo}
                disabled={creando || nuevoNombre.trim().length < 3}
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
            <p className="text-[11px] text-slate-400 mt-3">
              Se crea un municipio con categorías, trámites y 2 usuarios de prueba (admin y vecino).
              Sin registro ni tarjeta.
            </p>
          </div>

          {/* Separador entre "crear nuevo" y "elegir existente". */}
          {municipios.length > 0 && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">
                o entrá a uno existente
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Grid de municipios */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {municipios.map((municipio) => {
                  const isSelected = selectedMunicipio?.id === municipio.id;
                  const primaryColor = municipio.color_primario || '#0088cc';

                  const isEliminando = eliminando === municipio.codigo;
                  return (
                    <div
                      key={municipio.id}
                      className="relative group rounded-2xl border-2 border-slate-200 bg-white overflow-hidden transition-all duration-200 hover:border-slate-300 hover:shadow-lg"
                    >
                      {/* Contenido base (visible normal) */}
                      <div className="p-5 flex items-center gap-4 transition-all duration-300 group-hover:opacity-20 group-hover:blur-[2px]">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                          {municipio.logo_url ? (
                            <img src={municipio.logo_url} alt={municipio.nombre} className="w-8 h-8 object-contain" />
                          ) : (
                            <Building2 className="h-6 w-6" style={{ color: primaryColor }} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate text-slate-800">{municipio.nombre}</h3>
                          <p className="text-sm text-slate-400 truncate">{municipio.codigo}</p>
                        </div>
                      </div>

                      {/* Overlay de acciones (aparece en hover) */}
                      <div
                        className="absolute inset-0 flex items-center justify-center gap-2 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(135deg, ${primaryColor}08 0%, rgba(255,255,255,0.85) 100%)`,
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        <button
                          onClick={() => handleSelectMunicipio(municipio)}
                          disabled={isEliminando}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white font-semibold text-sm shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                          style={{
                            background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                          }}
                        >
                          <LogIn className="h-4 w-4" />
                          Entrar
                        </button>
                        <button
                          onClick={(e) => handleEliminarDemo(e, municipio)}
                          disabled={isEliminando}
                          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 font-semibold text-sm shadow hover:bg-red-500 hover:text-white hover:border-red-500 active:scale-95 transition-all disabled:opacity-50"
                          title="Eliminar demo"
                        >
                          {isEliminando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {/* Check indicator si está seleccionado (mantener por consistencia) */}
                      {isSelected && (
                        <div
                          className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center shadow-md"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Hint sutil abajo */}
              <p className="text-center text-xs text-slate-400 mt-2">
                Pasá el mouse sobre un municipio para entrar o eliminarlo
              </p>

              {/* Texto de ayuda */}
              {selectedMunicipio && (
                <p className="text-center text-slate-400 text-sm mt-8 animate-in fade-in duration-300">
                  Vas a ingresar a <span className="font-medium text-slate-600">{selectedMunicipio.nombre}</span>
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 py-6 px-6">
        <p className="text-center text-slate-400 text-sm">
          Munify - Conectando al gobierno con las necesidades del vecino
        </p>
      </footer>
    </div>
  );
}
