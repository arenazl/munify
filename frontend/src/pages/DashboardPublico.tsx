import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Building2, MapPin, Clock, CheckCircle2, Plus,
  Search, ChevronRight, User, X, ArrowRight, Loader2,
  MessageSquare, Calendar, TrendingUp, Navigation, LogOut
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Reclamo {
  id: number;
  titulo: string;
  descripcion: string;
  estado: string;
  prioridad: number;
  direccion: string;
  created_at: string;
  categoria: {
    nombre: string;
    color: string;
    icono: string;
  };
  zona?: {
    nombre: string;
  };
}

interface Estadisticas {
  total: number;
  nuevos: number;
  en_proceso: number;
  resueltos: number;
  por_zona?: { zona: string; cantidad: number }[];
  por_categoria?: { categoria: string; color: string; cantidad: number }[];
}

const API_URL = import.meta.env.VITE_API_URL;

export default function DashboardPublico() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas>({ total: 0, nuevos: 0, en_proceso: 0, resueltos: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegistroModal, setShowRegistroModal] = useState(false);
  const [registroData, setRegistroData] = useState({ nombre: '', apellido: '', direccion: '' });
  const [direccionSugerencias, setDireccionSugerencias] = useState<string[]>([]);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const direccionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const municipioNombre = localStorage.getItem('municipio_nombre') || 'Mi Municipio';
  const municipioId = localStorage.getItem('municipio_id');
  const municipioColor = localStorage.getItem('municipio_color') || '#3b82f6';

  useEffect(() => {
    if (!municipioId) {
      navigate('/bienvenido');
      return;
    }
    fetchReclamosPublicos();
    fetchEstadisticas();
  }, [municipioId]);

  const fetchReclamosPublicos = async () => {
    try {
      const response = await fetch(`${API_URL}/publico/reclamos?municipio_id=${municipioId}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setReclamos(data);
      }
    } catch (error) {
      console.error('Error cargando reclamos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEstadisticas = async () => {
    try {
      const response = await fetch(`${API_URL}/publico/estadisticas/municipio?municipio_id=${municipioId}`);
      if (response.ok) {
        const data = await response.json();
        setEstadisticas(data);
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const handleCrearReclamo = () => {
    // Siempre ir a nuevo-reclamo, ahí se maneja el registro si es necesario
    navigate('/nuevo-reclamo');
  };

  const buscarDireccion = async (query: string) => {
    if (query.length < 3) {
      setDireccionSugerencias([]);
      return;
    }

    setBuscandoDireccion(true);
    try {
      // Usar Nominatim para autocompletado de direcciones en Argentina
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&countrycodes=ar&q=${encodeURIComponent(query + ', ' + municipioNombre + ', Buenos Aires')}&limit=5`,
        { headers: { 'Accept-Language': 'es' } }
      );
      if (response.ok) {
        const data = await response.json();
        const sugerencias = data.map((item: any) => item.display_name.split(',').slice(0, 3).join(','));
        setDireccionSugerencias(sugerencias);
      }
    } catch (error) {
      console.error('Error buscando dirección:', error);
    } finally {
      setBuscandoDireccion(false);
    }
  };

  const handleDireccionChange = (value: string) => {
    setRegistroData({ ...registroData, direccion: value });

    // Debounce la búsqueda
    if (direccionTimeoutRef.current) {
      clearTimeout(direccionTimeoutRef.current);
    }
    direccionTimeoutRef.current = setTimeout(() => {
      buscarDireccion(value);
    }, 300);
  };

  const handleContinuarReclamo = (e: React.FormEvent) => {
    e.preventDefault();

    // Guardar datos del vecino
    localStorage.setItem('vecino_nombre', registroData.nombre);
    localStorage.setItem('vecino_apellido', registroData.apellido);
    localStorage.setItem('vecino_direccion', registroData.direccion);

    setShowRegistroModal(false);
    // Ir directo al formulario de reclamo con la dirección pre-cargada
    navigate('/reclamos/nuevo', { state: { direccion: registroData.direccion } });
  };

  const getEstadoColor = (estado: string) => {
    const colores: Record<string, string> = {
      'NUEVO': 'bg-blue-500/20 text-blue-400',
      'ASIGNADO': 'bg-amber-500/20 text-amber-400',
      'EN_PROCESO': 'bg-purple-500/20 text-purple-400',
      'RESUELTO': 'bg-green-500/20 text-green-400',
      'RECHAZADO': 'bg-red-500/20 text-red-400'
    };
    return colores[estado] || 'bg-slate-500/20 text-slate-400';
  };

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      'NUEVO': 'Nuevo',
      'ASIGNADO': 'Asignado',
      'EN_PROCESO': 'En Proceso',
      'RESUELTO': 'Resuelto',
      'RECHAZADO': 'Rechazado'
    };
    return labels[estado] || estado;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  };

  const reclamosFiltrados = reclamos.filter(r =>
    r.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.direccion.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.categoria.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800/50 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${municipioColor}20` }}
              >
                <Building2 className="h-5 w-5" style={{ color: municipioColor }} />
              </div>
              <div>
                <h1 className="font-bold text-white">{municipioNombre}</h1>
                <p className="text-xs text-slate-400">Sistema de Reclamos</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{user.nombre}</span>
                  </div>
                  <button
                    onClick={() => navigate('/mi-panel')}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Mi Panel
                  </button>
                  <button
                    onClick={() => { logout(); navigate('/publico'); }}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/bienvenido')}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <Navigation className="h-4 w-4" />
                    <span className="hidden sm:inline">Cambiar</span>
                  </button>
                  <span className="text-slate-700">|</span>
                  <button
                    onClick={() => navigate('/login')}
                    className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Acceso empleados
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Reclamos en {municipioNombre}
          </h2>
          <p className="text-slate-400">
            Seguí el estado de los reclamos o creá uno nuevo
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{estadisticas.total}</p>
                <p className="text-xs text-slate-400">Total Reclamos</p>
              </div>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{estadisticas.nuevos}</p>
                <p className="text-xs text-slate-400">Pendientes</p>
              </div>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: estadisticas.total ? `${(estadisticas.nuevos / estadisticas.total) * 100}%` : '0%' }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{estadisticas.total ? Math.round((estadisticas.nuevos / estadisticas.total) * 100) : 0}% del total</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{estadisticas.en_proceso}</p>
                <p className="text-xs text-slate-400">En Proceso</p>
              </div>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: estadisticas.total ? `${(estadisticas.en_proceso / estadisticas.total) * 100}%` : '0%' }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{estadisticas.total ? Math.round((estadisticas.en_proceso / estadisticas.total) * 100) : 0}% del total</p>
          </div>
          <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{estadisticas.resueltos}</p>
                <p className="text-xs text-slate-400">Resueltos</p>
              </div>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: estadisticas.total ? `${(estadisticas.resueltos / estadisticas.total) * 100}%` : '0%' }} />
            </div>
            <p className="text-[10px] text-green-400 mt-1">{estadisticas.total ? Math.round((estadisticas.resueltos / estadisticas.total) * 100) : 0}% tasa de resolución</p>
          </div>
        </div>

        {/* Estadísticas por zona y categoría */}
        {(estadisticas.por_zona?.length || estadisticas.por_categoria?.length) && (
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {/* Por zona */}
            {estadisticas.por_zona && estadisticas.por_zona.length > 0 && (
              <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5">
                <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Reclamos por Localidad
                </h3>
                <div className="space-y-2">
                  {estadisticas.por_zona.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-white">{item.zona}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min((item.cantidad / estadisticas.total) * 100, 100)}%`,
                              backgroundColor: municipioColor
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{item.cantidad}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Por categoría */}
            {estadisticas.por_categoria && estadisticas.por_categoria.length > 0 && (
              <div className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5">
                <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Por Tipo de Reclamo
                </h3>
                <div className="space-y-2">
                  {estadisticas.por_categoria.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-white">{item.categoria}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min((item.cantidad / estadisticas.total) * 100, 100)}%`,
                              backgroundColor: item.color
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{item.cantidad}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar reclamos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>
          <button
            onClick={handleCrearReclamo}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25"
          >
            <Plus className="h-5 w-5" />
            Crear Reclamo
          </button>
        </div>

        {/* Lista de reclamos */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-slate-400">Cargando reclamos...</p>
          </div>
        ) : reclamosFiltrados.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/5">
            <MessageSquare className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-4">No hay reclamos para mostrar</p>
            <button
              onClick={handleCrearReclamo}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Sé el primero en crear uno
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reclamosFiltrados.map((reclamo) => (
              <div
                key={reclamo.id}
                className="bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-all cursor-pointer group"
                onClick={() => navigate(`/reclamo/${reclamo.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${reclamo.categoria.color}20` }}
                  >
                    <MessageSquare className="h-6 w-6" style={{ color: reclamo.categoria.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white group-hover:text-blue-400 transition-colors truncate">
                          {reclamo.titulo}
                        </h3>
                        <p className="text-sm text-slate-400 truncate">{reclamo.direccion}</p>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-1 text-xs font-medium rounded-lg ${getEstadoColor(reclamo.estado)}`}>
                        {getEstadoLabel(reclamo.estado)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(reclamo.created_at)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${reclamo.categoria.color}20`, color: reclamo.categoria.color }}>
                        {reclamo.categoria.nombre}
                      </span>
                      {reclamo.zona && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {reclamo.zona.nombre}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal de datos del vecino */}
      {showRegistroModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-slate-800 rounded-3xl border border-white/10 p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Antes de empezar</h3>
                  <p className="text-xs text-slate-400">Necesitamos algunos datos</p>
                </div>
              </div>
              <button
                onClick={() => setShowRegistroModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleContinuarReclamo} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={registroData.nombre}
                    onChange={(e) => setRegistroData({ ...registroData, nombre: e.target.value })}
                    placeholder="Juan"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Apellido</label>
                  <input
                    type="text"
                    required
                    value={registroData.apellido}
                    onChange={(e) => setRegistroData({ ...registroData, apellido: e.target.value })}
                    placeholder="Pérez"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="block text-sm text-slate-400 mb-1">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  Tu dirección
                </label>
                <input
                  type="text"
                  required
                  value={registroData.direccion}
                  onChange={(e) => handleDireccionChange(e.target.value)}
                  placeholder="Ej: Av. San Martín 1234"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
                {buscandoDireccion && (
                  <Loader2 className="absolute right-4 top-9 h-5 w-5 animate-spin text-slate-400" />
                )}

                {/* Sugerencias de dirección */}
                {direccionSugerencias.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-slate-700 border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    {direccionSugerencias.map((sugerencia, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setRegistroData({ ...registroData, direccion: sugerencia });
                          setDireccionSugerencias([]);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-2"
                      >
                        <MapPin className="h-4 w-4 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{sugerencia}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!registroData.nombre || !registroData.apellido || !registroData.direccion}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuar con el reclamo
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                Solo usaremos estos datos para tu reclamo
              </p>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
