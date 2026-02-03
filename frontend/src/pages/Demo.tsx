import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MapPin, UserPlus, LogIn, Check, Building2 } from 'lucide-react';
import { municipiosApi } from '../lib/api';
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

  // Cargar municipios al montar
  useEffect(() => {
    const fetchMunicipios = async () => {
      try {
        const response = await municipiosApi.getAll();
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
    setSelectedMunicipio(municipio);
    saveMunicipioToStorage(municipio);
  };

  const handleEntrarAnonimo = () => {
    if (!selectedMunicipio) return;
    navigate('/home');
  };

  const handleCrearCuenta = () => {
    if (!selectedMunicipio) return;
    navigate('/register');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex flex-col">
      {/* Header minimalista */}
      <header className="flex-shrink-0 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={munifyLogo} alt="Munify" className="h-9 w-auto" />
            <span className="text-xl font-bold text-slate-800">Munify</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Ya tengo cuenta
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-2xl">
          {/* Título */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
              Elegir municipio
            </h1>
            <p className="text-slate-500 text-lg">
              Seleccioná tu municipio para continuar
            </p>
          </div>

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

                  return (
                    <button
                      key={municipio.id}
                      onClick={() => handleSelectMunicipio(municipio)}
                      className={`
                        relative group p-5 rounded-2xl border-2 text-left transition-all duration-200
                        ${isSelected
                          ? 'border-transparent shadow-lg scale-[1.02]'
                          : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white'
                        }
                      `}
                      style={isSelected ? {
                        background: `linear-gradient(135deg, ${primaryColor}15 0%, ${primaryColor}08 100%)`,
                        borderColor: primaryColor,
                      } : undefined}
                    >
                      {/* Check indicator */}
                      {isSelected && (
                        <div
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Check className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex items-center gap-4">
                        {/* Logo o icono */}
                        <div
                          className={`
                            w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                            ${isSelected ? 'bg-white/80' : 'bg-slate-100'}
                          `}
                        >
                          {municipio.logo_url ? (
                            <img
                              src={municipio.logo_url}
                              alt={municipio.nombre}
                              className="w-8 h-8 object-contain"
                            />
                          ) : (
                            <Building2
                              className="h-6 w-6"
                              style={{ color: isSelected ? primaryColor : '#64748b' }}
                            />
                          )}
                        </div>

                        {/* Texto */}
                        <div className="min-w-0">
                          <h3 className={`font-semibold truncate ${isSelected ? 'text-slate-800' : 'text-slate-700'}`}>
                            {municipio.nombre}
                          </h3>
                          <p className="text-sm text-slate-500 truncate">
                            {municipio.codigo}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Botones de acción */}
              <div className={`
                flex flex-col sm:flex-row items-center justify-center gap-4
                transition-all duration-300
                ${selectedMunicipio ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2 pointer-events-none'}
              `}>
                <button
                  onClick={handleEntrarAnonimo}
                  disabled={!selectedMunicipio}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white border-2 border-slate-200 rounded-2xl text-slate-700 font-semibold text-lg hover:border-slate-300 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MapPin className="h-5 w-5" />
                  Entrar anónimo
                </button>

                <button
                  onClick={handleCrearCuenta}
                  disabled={!selectedMunicipio}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 text-white font-semibold text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: selectedMunicipio
                      ? `linear-gradient(135deg, ${selectedMunicipio.color_primario || '#0088cc'} 0%, ${selectedMunicipio.color_primario || '#0088cc'}dd 100%)`
                      : 'linear-gradient(135deg, #0088cc 0%, #0088ccdd 100%)'
                  }}
                >
                  <UserPlus className="h-5 w-5" />
                  Crear cuenta
                </button>
              </div>

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
