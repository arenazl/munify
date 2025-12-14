import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, Building2, ChevronRight, Loader2, Navigation, Shield, Clock, Users, MapPinned } from 'lucide-react';

interface Municipio {
  id: number;
  nombre: string;
  codigo: string;
  latitud: number;
  longitud: number;
  radio_km: number;
  logo_url: string | null;
  color_primario: string;
  activo: boolean;
  distancia_km?: number;
}

const API_URL = import.meta.env.VITE_API_URL;

export default function Landing() {
  const navigate = useNavigate();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(true);
  const [suggestedMunicipio, setSuggestedMunicipio] = useState<Municipio | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'found' | 'not_found' | 'denied'>('detecting');

  useEffect(() => {
    fetchMunicipios();
    detectarUbicacion();
  }, []);

  const fetchMunicipios = async () => {
    try {
      const response = await fetch(`${API_URL}/municipios/public`);
      if (response.ok) {
        const data = await response.json();
        setMunicipios(data);
      }
    } catch (error) {
      console.error('Error al cargar municipios:', error);
    } finally {
      setLoading(false);
    }
  };

  const detectarUbicacion = () => {
    if (!navigator.geolocation) {
      setDetectingLocation(false);
      setLocationStatus('not_found');
      return;
    }

    setDetectingLocation(true);
    setLocationStatus('detecting');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `${API_URL}/municipios/public/cercano?lat=${latitude}&lng=${longitude}`
          );
          if (response.ok) {
            const data = await response.json();
            if (data) {
              setSuggestedMunicipio(data);
              setLocationStatus('found');
            } else {
              setLocationStatus('not_found');
            }
          } else {
            setLocationStatus('not_found');
          }
        } catch (error) {
          setLocationStatus('not_found');
        } finally {
          setDetectingLocation(false);
        }
      },
      (error) => {
        setDetectingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
        } else {
          setLocationStatus('not_found');
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  };

  const seleccionarMunicipio = (municipio: Municipio) => {
    localStorage.setItem('municipio_codigo', municipio.codigo);
    localStorage.setItem('municipio_id', municipio.id.toString());
    localStorage.setItem('municipio_nombre', municipio.nombre);
    localStorage.setItem('municipio_color', municipio.color_primario);
    // Ir directo al dashboard público (sin login)
    navigate(`/publico`);
  };

  const municipiosFiltrados = municipios.filter(m =>
    m.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.codigo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Ordenar: sugerido primero, luego el resto
  const municipiosOrdenados = suggestedMunicipio
    ? [
        suggestedMunicipio,
        ...municipiosFiltrados.filter(m => m.id !== suggestedMunicipio.id)
      ]
    : municipiosFiltrados;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
          <p className="mt-4 text-slate-400">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 relative overflow-hidden">
      {/* Background con imagen y overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070"
          alt="Ciudad"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-blue-900/50" />
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="px-4 py-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white text-xl">Reclamos Municipales</h1>
                <p className="text-xs text-slate-400">Sistema de gestion vecinal</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex items-center px-4 py-8">
          <div className="max-w-6xl mx-auto w-full">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Hero Text */}
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-blue-400 text-sm font-medium">Sistema activo</span>
                </div>

                <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                  Tu voz importa en{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                    tu ciudad
                  </span>
                </h2>

                <p className="text-lg text-slate-300 mb-8 max-w-xl mx-auto lg:mx-0">
                  Reporta problemas, sigue el estado de tus reclamos y ayuda a mejorar
                  tu comunidad. Simple, rapido y transparente.
                </p>

                {/* Features */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="text-center lg:text-left">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-2 mx-auto lg:mx-0">
                      <Clock className="h-5 w-5 text-blue-400" />
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Rapido</p>
                    <p className="text-xs text-slate-500">En minutos</p>
                  </div>
                  <div className="text-center lg:text-left">
                    <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center mb-2 mx-auto lg:mx-0">
                      <Shield className="h-5 w-5 text-green-400" />
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Seguro</p>
                    <p className="text-xs text-slate-500">Datos protegidos</p>
                  </div>
                  <div className="text-center lg:text-left">
                    <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center mb-2 mx-auto lg:mx-0">
                      <Users className="h-5 w-5 text-purple-400" />
                    </div>
                    <p className="text-sm text-slate-300 font-medium">Comunidad</p>
                    <p className="text-xs text-slate-500">Juntos mejor</p>
                  </div>
                </div>
              </div>

              {/* Right: Selection Card - Unified Flow */}
              <div className="w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
                <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl">
                  {/* Header del card */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <MapPinned className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Selecciona tu municipio
                      </h3>
                      {detectingLocation ? (
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Detectando ubicacion...
                        </p>
                      ) : locationStatus === 'found' && suggestedMunicipio ? (
                        <p className="text-xs text-green-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Detectamos tu zona
                        </p>
                      ) : locationStatus === 'denied' ? (
                        <p className="text-xs text-amber-400">
                          Ubicacion no disponible
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">
                          Elige de la lista
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Buscador */}
                  <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar municipio..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    />
                  </div>

                  {/* Lista de municipios */}
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {detectingLocation ? (
                      <div className="py-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm">Buscando tu municipio...</p>
                      </div>
                    ) : municipiosOrdenados.length === 0 ? (
                      <div className="text-center py-8">
                        <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">No se encontraron municipios</p>
                      </div>
                    ) : (
                      municipiosOrdenados.map((municipio) => {
                        const isSuggested = suggestedMunicipio?.id === municipio.id;
                        return (
                          <button
                            key={municipio.id}
                            onClick={() => seleccionarMunicipio(municipio)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${
                              isSuggested
                                ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 hover:border-blue-400/50'
                                : 'hover:bg-white/5 border border-transparent hover:border-white/10'
                            }`}
                          >
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                                isSuggested ? 'bg-blue-500/30' : ''
                              }`}
                              style={{ backgroundColor: isSuggested ? undefined : `${municipio.color_primario}20` }}
                            >
                              {municipio.logo_url ? (
                                <img
                                  src={municipio.logo_url}
                                  alt={municipio.nombre}
                                  className="w-6 h-6 object-contain"
                                />
                              ) : (
                                <Building2
                                  className="h-5 w-5"
                                  style={{ color: isSuggested ? '#60a5fa' : municipio.color_primario }}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`font-medium truncate ${isSuggested ? 'text-blue-100' : 'text-white'}`}>
                                  {municipio.nombre}
                                </p>
                                {isSuggested && (
                                  <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold bg-blue-500/30 text-blue-300 rounded-full">
                                    CERCANO
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                {isSuggested && municipio.distancia_km !== undefined
                                  ? `A ${municipio.distancia_km} km de tu ubicacion`
                                  : municipio.codigo}
                              </p>
                            </div>
                            <ChevronRight className={`h-5 w-5 transition-colors ${
                              isSuggested ? 'text-blue-400' : 'text-slate-600 group-hover:text-blue-400'
                            }`} />
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Mensaje si no se pudo detectar ubicacion */}
                  {locationStatus === 'denied' && (
                    <button
                      onClick={detectarUbicacion}
                      className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors"
                    >
                      <Navigation className="h-4 w-4" />
                      Reintentar deteccion de ubicacion
                    </button>
                  )}
                </div>

                {/* Stats debajo */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{municipios.length}</p>
                    <p className="text-xs text-slate-500">Municipios</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">24/7</p>
                    <p className="text-xs text-slate-500">Disponible</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">100%</p>
                    <p className="text-xs text-slate-500">Gratis</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-4 py-6 border-t border-white/5">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>Sistema de Reclamos Municipales v1.0</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-white transition-colors">Ayuda</a>
              <a href="#" className="hover:text-white transition-colors">Privacidad</a>
              <a href="#" className="hover:text-white transition-colors">Terminos</a>
            </div>
          </div>
        </footer>
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
