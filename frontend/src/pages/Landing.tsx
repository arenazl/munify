import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Search, Building2, ChevronRight, Loader2, Shield, Clock, Users, MapPinned, ArrowLeft, Wrench, User, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultRoute } from '../config/navigation';
import { useMunicipioFromUrl, buildMunicipioUrl, isDevelopment } from '../hooks/useSubdomain';
import { API_URL } from '../lib/api';

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

// API_URL importado desde lib/api.ts

// Calcular distancia entre dos puntos (Haversine)
const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function Landing() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestedMunicipio, setSuggestedMunicipio] = useState<Municipio | null>(null);
  const [locationStatus, setLocationStatus] = useState<string>('');

  // Detectar municipio desde subdominio o query param
  const municipioFromUrl = useMunicipioFromUrl();

  // Debug mode - mostrar usuarios de prueba después de seleccionar municipio
  const [selectedMunicipio, setSelectedMunicipio] = useState<Municipio | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState('');

  // Super Admin login modal
  const [showSuperAdminLogin, setShowSuperAdminLogin] = useState(false);
  const [superAdminEmail, setSuperAdminEmail] = useState('superadmin@test.com');
  const [superAdminPassword, setSuperAdminPassword] = useState('super123');
  const [demoUsers, setDemoUsers] = useState<Array<{
    email: string;
    nombre: string;
    apellido: string;
    nombre_completo: string;
    rol: string;
  }>>([]);
  const [dependenciaUsers, setDependenciaUsers] = useState<Array<{
    email: string;
    nombre_dependencia: string;
    color: string | null;
    icono: string | null;
    reclamos_count: number;
    tramites_count: number;
  }>>([]);

  useEffect(() => {
    // No limpiar si viene de un subdominio específico
    if (!municipioFromUrl) {
      localStorage.removeItem('municipio_codigo');
      localStorage.removeItem('municipio_id');
      localStorage.removeItem('municipio_nombre');
      localStorage.removeItem('municipio_color');
    }
    fetchMunicipios();
  }, [municipioFromUrl]);

  // Guardar municipio en localStorage si viene en la URL (incluso si está logueado)
  useEffect(() => {
    if (municipioFromUrl && municipios.length > 0) {
      const found = municipios.find(m => m.codigo.toLowerCase() === municipioFromUrl.toLowerCase());
      if (found) {
        localStorage.setItem('municipio_codigo', found.codigo);
        localStorage.setItem('municipio_id', found.id.toString());
        localStorage.setItem('municipio_nombre', found.nombre);
        localStorage.setItem('municipio_color', found.color_primario);
        if (found.logo_url) {
          localStorage.setItem('municipio_logo_url', found.logo_url);
        }
      }
    }
  }, [municipioFromUrl, municipios]);

  // Auto-redirigir a /home si viene desde subdominio o query param de municipio (SOLO si NO está logueado)
  useEffect(() => {
    console.log('Landing: municipioFromUrl=', municipioFromUrl, 'municipios.length=', municipios.length, 'user=', user);
    // Solo auto-redirigir si NO hay usuario logueado
    if (municipioFromUrl && municipios.length > 0 && !user) {
      const found = municipios.find(m => m.codigo.toLowerCase() === municipioFromUrl.toLowerCase());
      console.log('Landing: found=', found);
      if (found) {
        console.log('Landing: redirecting to /home (no user logged in)');
        // Redirigir a la landing publica responsiva
        navigate('/home', { replace: true });
      }
    }
  }, [municipioFromUrl, municipios, navigate, user]);

  // Detectar ubicación cuando tengamos municipios (solo si no hay municipio desde URL)
  useEffect(() => {
    if (municipios.length > 0 && !municipioFromUrl) {
      detectarUbicacion();
    }
  }, [municipios, municipioFromUrl]);

  const detectarUbicacion = () => {
    setLocationStatus('Detectando ubicación...');

    // En desarrollo sin HTTPS, usar ubicación fija (Merlo, Buenos Aires)
    const isSecureOrigin = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

    if (!isSecureOrigin) {
      // Coordenadas de Merlo, Buenos Aires
      const devLatitude = -34.6637;
      const devLongitude = -58.7276;
      procesarUbicacion(devLatitude, devLongitude);
      return;
    }

    if (!navigator.geolocation) {
      setLocationStatus('Geolocalización no soportada');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        procesarUbicacion(latitude, longitude);
      },
      () => {
        setLocationStatus('No se pudo detectar ubicación');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const procesarUbicacion = (latitude: number, longitude: number) => {
    // Encontrar municipio más cercano
    let municipioCercano: Municipio | null = null;
    let menorDistancia = Infinity;

    municipios.forEach(muni => {
      const distancia = calcularDistancia(latitude, longitude, muni.latitud, muni.longitud);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        municipioCercano = { ...muni, distancia_km: distancia };
      }
    });

    if (municipioCercano) {
      const cercano = municipioCercano as Municipio;
      setSuggestedMunicipio(cercano);
      setLocationStatus(`Cerca de ${cercano.nombre}`);
    }
  };

  const fetchMunicipios = async () => {
    try {
      const response = await fetch(`${API_URL}/municipios/public`);
      if (response.ok) {
        const data = await response.json();
        setMunicipios(data);
      }
    } catch {
      // Silently fail - municipios list will be empty
    } finally {
      setLoading(false);
    }
  };

  const seleccionarMunicipio = async (municipio: Municipio) => {
    localStorage.setItem('municipio_codigo', municipio.codigo);
    localStorage.setItem('municipio_id', municipio.id.toString());
    localStorage.setItem('municipio_nombre', municipio.nombre);
    localStorage.setItem('municipio_color', municipio.color_primario);
    if (municipio.logo_url) {
      localStorage.setItem('municipio_logo_url', municipio.logo_url);
    }
    // En modo debug, mostrar usuarios de prueba
    setSelectedMunicipio(municipio);
    setDebugError('');

    // Cargar usuarios demo desde la API
    try {
      const response = await fetch(`${API_URL}/municipios/public/${municipio.codigo}/demo-users`);
      if (response.ok) {
        const users = await response.json();
        setDemoUsers(users);
      }
    } catch {
      // Silent fail - demo users won't be shown
    }

    // Cargar usuarios de dependencias desde la API
    try {
      const response = await fetch(`${API_URL}/municipios/public/${municipio.codigo}/dependencia-users`);
      if (response.ok) {
        const users = await response.json();
        setDependenciaUsers(users);
      }
    } catch {
      // Silent fail
    }
  };

  // Login rápido para debug
  const quickLogin = async (email: string, password: string) => {
    setDebugLoading(true);
    setDebugError('');
    try {
      await login(email, password);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      navigate(getDefaultRoute(user.rol, !!user.dependencia));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setDebugError(error.response?.data?.detail || 'Error al iniciar sesión');
    } finally {
      setDebugLoading(false);
    }
  };

  // Ir al dashboard público sin login
  const irADashboardPublico = () => {
    navigate('/home');
  };

  // Volver a la selección de municipio
  const volverASeleccion = () => {
    setSelectedMunicipio(null);
    setDebugError('');
    setDemoUsers([]);
    setDependenciaUsers([]);
  };

  // Configuración visual por rol
  const rolConfig: Record<string, { icon: typeof Shield; color: string; label: string }> = {
    admin: { icon: Shield, color: 'from-red-500 to-rose-600', label: 'Administrador' },
    supervisor: { icon: Users, color: 'from-orange-500 to-amber-600', label: 'Supervisor' },
    empleado: { icon: Wrench, color: 'from-green-500 to-emerald-600', label: 'Empleado' },
    vecino: { icon: User, color: 'from-blue-500 to-indigo-600', label: 'Vecino' },
  };

  const municipiosFiltrados = municipios.filter(m =>
    m.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.codigo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Ordenar: sugerido primero, luego el resto
  const municipiosOrdenados = suggestedMunicipio
    ? [suggestedMunicipio, ...municipiosFiltrados.filter(m => m.id !== suggestedMunicipio.id)]
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

            {/* Botón Super Admin */}
            <button
              onClick={() => setShowSuperAdminLogin(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl text-purple-300 hover:from-purple-500/30 hover:to-pink-500/30 hover:text-white transition-all text-sm font-medium"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Super Admin</span>
            </button>
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

                  {/* Después de seleccionar municipio */}
                  {selectedMunicipio ? (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                      {/* Header con botón volver */}
                      <div className="flex items-center gap-3 mb-6">
                        <button
                          onClick={volverASeleccion}
                          className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-colors"
                        >
                          <ArrowLeft className="h-5 w-5 text-slate-400" />
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${selectedMunicipio.color_primario}20` }}
                            >
                              <Building2 className="h-4 w-4" style={{ color: selectedMunicipio.color_primario }} />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-white">{selectedMunicipio.nombre}</h3>
                              <p className="text-xs text-slate-400">Selecciona cómo continuar</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Error message */}
                      {debugError && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
                          {debugError}
                        </div>
                      )}

                      {/* Opción 1: Continuar sin registrarse */}
                      <div className="mb-4 p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl">
                        <div className="flex items-start gap-3 mb-3">
                          <AlertCircle className="h-5 w-5 text-green-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-white">Sin registro</p>
                            <p className="text-xs text-slate-400">Podés hacer reclamos sin crear una cuenta</p>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate('/home')}
                          disabled={debugLoading}
                          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg shadow-green-500/25 disabled:opacity-50"
                        >
                          <User className="h-5 w-5" />
                          Continuar sin registrarme
                        </button>
                      </div>

                      {/* Opción 2: Iniciar sesión */}
                      <button
                        onClick={() => navigate('/login')}
                        disabled={debugLoading}
                        className="w-full mb-3 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50"
                      >
                        <LogIn className="h-5 w-5" />
                        Iniciar Sesión
                      </button>

                      {/* Opción 3: Registrarse */}
                      <button
                        onClick={() => navigate('/register')}
                        disabled={debugLoading}
                        className="w-full mb-4 flex items-center justify-center gap-2 py-3 px-4 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition-all disabled:opacity-50"
                      >
                        <User className="h-5 w-5" />
                        Crear Cuenta
                      </button>

                      {/* Botón: Dashboard Público */}
                      <button
                        onClick={irADashboardPublico}
                        disabled={debugLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-slate-400 hover:text-white transition-all disabled:opacity-50"
                      >
                        <MapPinned className="h-4 w-4" />
                        <span className="text-sm">Ver Mapa de Reclamos</span>
                      </button>

                      {/* Divider - Usuarios demo */}
                      {demoUsers.length > 0 && (
                        <>
                          <div className="relative flex items-center gap-3 my-4">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-slate-500 text-xs">MODO DEMO</span>
                            <div className="flex-1 h-px bg-white/10" />
                          </div>

                          {/* Grid de usuarios de prueba */}
                          <div className="grid grid-cols-2 gap-3">
                            {demoUsers.map((user, index) => {
                              const config = rolConfig[user.rol] || rolConfig.vecino;
                              const Icon = config.icon;
                              return (
                                <button
                                  key={`${user.rol}-${index}`}
                                  type="button"
                                  onClick={() => quickLogin(user.email, 'demo123')}
                                  disabled={debugLoading}
                                  className={`relative overflow-hidden bg-gradient-to-r ${config.color} text-white py-3 px-4 rounded-xl text-sm font-medium transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] shadow-lg`}
                                >
                                  {debugLoading ? (
                                    <div className="flex items-center justify-center">
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Icon className="h-4 w-4 flex-shrink-0" />
                                      <div className="text-left min-w-0">
                                        <div className="font-semibold truncate">{config.label}</div>
                                        <div className="text-[10px] opacity-80 font-mono truncate">{user.email}</div>
                                      </div>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <p className="text-xs text-slate-500 text-center mt-4">
                            Usuarios de prueba · Pass: <span className="text-slate-400 font-mono">demo123</span>
                          </p>
                        </>
                      )}

                      {/* Sección de dependencias con reclamos */}
                      {dependenciaUsers.length > 0 && (
                        <>
                          <div className="relative flex items-center gap-3 my-4">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-slate-500 text-xs">ACCESO POR ÁREA</span>
                            <div className="flex-1 h-px bg-white/10" />
                          </div>

                          {/* Grid de dependencias */}
                          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                            {dependenciaUsers.map((dep) => (
                              <button
                                key={dep.email}
                                type="button"
                                onClick={() => quickLogin(dep.email, 'demo1234')}
                                disabled={debugLoading}
                                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                                style={{
                                  backgroundColor: `${dep.color || '#6366f1'}15`,
                                  border: `1px solid ${dep.color || '#6366f1'}30`
                                }}
                              >
                                {debugLoading ? (
                                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: dep.color || '#6366f1' }} />
                                ) : (
                                  <>
                                    <div
                                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: `${dep.color || '#6366f1'}25` }}
                                    >
                                      <Building2 className="h-5 w-5" style={{ color: dep.color || '#6366f1' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-white text-sm truncate">{dep.nombre_dependencia}</div>
                                      <div className="text-xs text-slate-400">{dep.reclamos_count} reclamos asignados</div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-500" />
                                  </>
                                )}
                              </button>
                            ))}
                          </div>

                          <p className="text-xs text-slate-500 text-center mt-3">
                            Acceso por área · Pass: <span className="text-slate-400 font-mono">demo1234</span>
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    /* MODO NORMAL: Selección de municipio */
                    <>
                      {/* Header del card */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                          <MapPinned className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Selecciona tu municipio
                          </h3>
                          <p className="text-xs text-slate-400">
                            {locationStatus || 'Elige de la lista'}
                          </p>
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
                        {municipiosOrdenados.length === 0 ? (
                          <div className="text-center py-8">
                            <img src="/logo-removebg-preview.png" alt="Logo" className="h-10 w-10 mx-auto mb-2 object-contain opacity-40" />
                            <p className="text-slate-500 text-sm">No se encontraron municipios</p>
                          </div>
                        ) : (
                          municipiosOrdenados.map((municipio) => {
                            const isSuggested = suggestedMunicipio?.id === municipio.id;
                            return (
                              <button
                                key={municipio.id}
                                onClick={() => seleccionarMunicipio(municipio)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group border ${
                                  isSuggested
                                    ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
                                    : 'hover:bg-white/5 border-transparent hover:border-white/10'
                                }`}
                              >
                                <div
                                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
                                  style={{ backgroundColor: `${municipio.color_primario}20` }}
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
                                      style={{ color: municipio.color_primario }}
                                    />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate text-white">
                                    {municipio.nombre}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {municipio.codigo}
                                  </p>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-blue-400 transition-colors" />
                              </button>
                            );
                          })
                        )}
                      </div>

                    </>
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

      {/* Modal Super Admin Login */}
      {showSuperAdminLogin && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          {/* Backdrop */}
          <div
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowSuperAdminLogin(false)}
          />

          {/* Modal */}
          <div className="relative bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Super Admin</h3>
                <p className="text-sm text-slate-400">Acceso a todos los municipios</p>
              </div>
              <button
                onClick={() => setShowSuperAdminLogin(false)}
                className="ml-auto p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Error */}
            {debugError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
                {debugError}
              </div>
            )}

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  value={superAdminEmail}
                  onChange={(e) => setSuperAdminEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Contraseña</label>
                <input
                  type="password"
                  value={superAdminPassword}
                  onChange={(e) => setSuperAdminPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                />
              </div>

              <button
                onClick={() => quickLogin(superAdminEmail, superAdminPassword)}
                disabled={debugLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-700 transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50"
              >
                {debugLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    Ingresar como Super Admin
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center mt-4">
              El Super Admin puede administrar todos los municipios
            </p>
          </div>
        </div>,
        document.body
      )}

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
