import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Clock,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Loader2,
  MessageCircle,
  BarChart3,
  Building2,
  FileText,
  Search,
  TrendingUp,
  MessageSquare,
  Calendar,
  User,
  LogIn,
  Home,
  Download,
  X,
  Share,
  PlusSquare,
  Bell,
  Smartphone,
  Settings,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
} from '../lib/pushNotifications';

interface Reclamo {
  id: number;
  titulo: string;
  descripcion: string;
  estado: string;
  direccion: string;
  created_at: string;
  categoria: {
    nombre: string;
    color: string;
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

// Noticias de ejemplo
const noticiasDefault = [
  {
    id: 1,
    titulo: "Mejoras en el servicio de recoleccion de residuos",
    descripcion: "Se implemento un nuevo sistema de rutas optimizadas para la recoleccion de residuos, mejorando la frecuencia y cobertura en todos los barrios del municipio.",
    imagen_url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=400"
  },
  {
    id: 2,
    titulo: "Nueva iluminacion LED en espacios publicos",
    descripcion: "El municipio continua con el plan de modernizacion del alumbrado publico, instalando luminarias LED de bajo consumo en plazas y calles principales.",
    imagen_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"
  },
  {
    id: 3,
    titulo: "Trabajos de mantenimiento en calles y veredas",
    descripcion: "Se realizan trabajos de bacheo y reparacion de veredas en diversos puntos del distrito para mejorar la transitabilidad y seguridad de los vecinos.",
    imagen_url: "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=400"
  }
];

export default function HomePublic() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [estadisticas, setEstadisticas] = useState<Estadisticas>({ total: 0, nuevos: 0, en_proceso: 0, resueltos: 0 });
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  const { isInstallable, isInstalled, promptInstall, showIOSInstructions, isIOS } = usePWAInstall();
  const pushSupported = isPushSupported();

  // Actualizar estado de permisos de notificacion
  useEffect(() => {
    setNotificationPermission(getNotificationPermission());
  }, [showConfigModal]);

  const municipioNombre = localStorage.getItem('municipio_nombre') || 'Mi Municipio';
  const municipioId = localStorage.getItem('municipio_id');
  const municipioColor = localStorage.getItem('municipio_color') || '#3b82f6';
  const municipioLogo = localStorage.getItem('municipio_logo_url');

  // Scroll to top al montar el componente
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!municipioId) {
      navigate('/bienvenido');
      return;
    }
    fetchData();
  }, [municipioId]);

  const fetchData = async () => {
    try {
      const [reclamosRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/publico/reclamos?municipio_id=${municipioId}&limit=10`),
        fetch(`${API_URL}/publico/estadisticas/municipio?municipio_id=${municipioId}`)
      ]);

      if (reclamosRes.ok) {
        const data = await reclamosRes.json();
        setReclamos(data);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setEstadisticas(data);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEstadoConfig = (estado: string) => {
    const configs: Record<string, { color: string; label: string }> = {
      'NUEVO': { color: '#6b7280', label: 'Nuevo' },
      'nuevo': { color: '#6b7280', label: 'Nuevo' },
      'ASIGNADO': { color: '#3b82f6', label: 'Asignado' },
      'asignado': { color: '#3b82f6', label: 'Asignado' },
      'EN_PROCESO': { color: '#f59e0b', label: 'En Proceso' },
      'en_proceso': { color: '#f59e0b', label: 'En Proceso' },
      'RESUELTO': { color: '#10b981', label: 'Resuelto' },
      'resuelto': { color: '#10b981', label: 'Resuelto' },
      'RECHAZADO': { color: '#ef4444', label: 'Rechazado' },
      'rechazado': { color: '#ef4444', label: 'Rechazado' },
    };
    return configs[estado] || { color: '#6b7280', label: estado };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  };

  const reclamosFiltrados = reclamos.filter(r =>
    r.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.direccion.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.categoria?.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handlers para configuracion
  const handleInstallPWA = async () => {
    setConfigLoading(true);
    try {
      await promptInstall();
    } finally {
      setConfigLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    setConfigLoading(true);
    try {
      await subscribeToPush();
      setNotificationPermission(getNotificationPermission());
    } catch (error) {
      console.error('Error activando notificaciones:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  // Si el usuario está logueado, redirigir al panel correspondiente
  useEffect(() => {
    if (user) {
      if (user.rol === 'vecino') {
        navigate('/gestion/mi-panel');
      } else {
        navigate('/gestion');
      }
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen pb-20 md:pb-0 overflow-x-hidden" style={{ backgroundColor: theme.background }}>
      {/* Header - Desktop */}
      <header
        className="hidden md:block sticky top-0 z-40 border-b"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
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
                <h1 className="font-bold" style={{ color: theme.text }}>{municipioNombre}</h1>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Sistema de Reclamos</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                <LogIn className="h-4 w-4" />
                Ingresar
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                style={{ backgroundColor: theme.primary }}
              >
                <User className="h-4 w-4" />
                Crear Cuenta
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Header Mobile */}
      <header
        className="md:hidden sticky top-0 z-40 border-b"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${municipioColor}20` }}
              >
                <Building2 className="h-4 w-4" style={{ color: municipioColor }} />
              </div>
              <div>
                <h1 className="font-semibold text-sm" style={{ color: theme.text }}>
                  {municipioNombre.replace('Municipalidad de ', '')}
                </h1>
              </div>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <LogIn className="h-3.5 w-3.5" />
              Ingresar
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner - Mas compacto en mobile */}
      <div className="relative overflow-hidden min-h-[120px] md:min-h-[180px]">
        <div className="absolute inset-0">
          {municipioLogo ? (
            <img
              src={municipioLogo}
              alt={municipioNombre}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${municipioColor} 0%, ${municipioColor}aa 100%)`,
              }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, rgba(15, 23, 42, 0.3) 0%, rgba(15, 23, 42, 0.8) 100%)`,
            }}
          />
        </div>

        <div className="relative z-10 p-4 md:p-8 flex flex-col justify-end max-w-7xl mx-auto min-h-[120px] md:min-h-[180px]">
          <h1 className="text-xl md:text-4xl text-white mb-0.5 md:mb-1 drop-shadow-lg">
            <span className="font-light">Municipalidad de </span>
            <span className="font-bold">{municipioNombre.replace('Municipalidad de ', '')}</span>
          </h1>
          <p className="text-white/90 text-sm md:text-lg">
            Sistema de Reclamos y Tramites
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* Banner de instalación PWA - Solo mobile */}
        {showInstallBanner && !isInstalled && (isInstallable || showIOSInstructions) && (
          <div
            className="md:hidden mb-4 rounded-xl p-4 border relative"
            style={{ backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}30` }}
          >
            <button
              onClick={() => setShowInstallBanner(false)}
              className="absolute top-2 right-2 p-1 rounded-full"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <X className="h-4 w-4" style={{ color: theme.textSecondary }} />
            </button>

            <div className="flex items-start gap-3 pr-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: theme.primary }}
              >
                <Download className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1" style={{ color: theme.text }}>
                  Instala la app
                </h4>
                {showIOSInstructions ? (
                  <div className="text-xs space-y-1" style={{ color: theme.textSecondary }}>
                    <p>Agrega al inicio para acceso rapido:</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Share className="h-4 w-4" style={{ color: theme.primary }} />
                      <span>Toca Compartir</span>
                      <span style={{ color: theme.border }}>→</span>
                      <PlusSquare className="h-4 w-4" style={{ color: theme.primary }} />
                      <span>Agregar a inicio</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
                      Accede mas rapido sin abrir el navegador
                    </p>
                    <button
                      onClick={promptInstall}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                      style={{ backgroundColor: theme.primary, color: 'white' }}
                    >
                      Instalar ahora
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards - Mobile: horizontal scroll, Desktop: grid */}
        <div className="flex md:grid md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6 overflow-x-auto pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
          <div
            className="flex-shrink-0 w-[140px] md:w-auto rounded-xl md:rounded-2xl p-3 md:p-4 border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
                <MessageSquare className="h-4 w-4 md:h-5 md:w-5" style={{ color: theme.primary }} />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold" style={{ color: theme.text }}>
                  {loading ? '-' : estadisticas.total}
                </p>
                <p className="text-[10px] md:text-xs" style={{ color: theme.textSecondary }}>Total</p>
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0 w-[140px] md:w-auto rounded-xl md:rounded-2xl p-3 md:p-4 border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f59e0b20' }}>
                <Clock className="h-4 w-4 md:h-5 md:w-5" style={{ color: '#f59e0b' }} />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold" style={{ color: theme.text }}>
                  {loading ? '-' : estadisticas.nuevos}
                </p>
                <p className="text-[10px] md:text-xs" style={{ color: theme.textSecondary }}>Pendientes</p>
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0 w-[140px] md:w-auto rounded-xl md:rounded-2xl p-3 md:p-4 border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: '#8b5cf620' }}>
                <TrendingUp className="h-4 w-4 md:h-5 md:w-5" style={{ color: '#8b5cf6' }} />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold" style={{ color: theme.text }}>
                  {loading ? '-' : estadisticas.en_proceso}
                </p>
                <p className="text-[10px] md:text-xs" style={{ color: theme.textSecondary }}>En Proceso</p>
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0 w-[140px] md:w-auto rounded-xl md:rounded-2xl p-3 md:p-4 border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center" style={{ backgroundColor: '#10b98120' }}>
                <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" style={{ color: '#10b981' }} />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-bold" style={{ color: theme.text }}>
                  {loading ? '-' : estadisticas.resueltos}
                </p>
                <p className="text-[10px] md:text-xs" style={{ color: theme.textSecondary }}>Resueltos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Acciones principales - Mobile: 2 botones grandes, Desktop: 4 botones */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
          <button
            onClick={() => navigate('/nuevo-reclamo')}
            className="flex flex-col items-center justify-center gap-2 py-5 md:py-4 px-3 md:px-4 rounded-2xl font-medium transition-all active:scale-[0.98] hover:scale-[1.02]"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}dd)`,
              boxShadow: `0 4px 12px ${theme.primary}40`,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <Plus className="h-6 w-6 text-white" />
            </div>
            <div className="text-center">
              <span className="text-sm text-white font-semibold">Nuevo Reclamo</span>
              <p className="text-[10px] md:text-xs text-white/70 mt-0.5">Reportar problema</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/tramites')}
            className="flex flex-col items-center justify-center gap-2 py-5 md:py-4 px-3 md:px-4 rounded-2xl font-medium transition-all active:scale-[0.98] hover:scale-[1.02]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#8B5CF620' }}
            >
              <FileText className="h-6 w-6" style={{ color: '#8B5CF6' }} />
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold" style={{ color: theme.text }}>Tramites</span>
              <p className="text-[10px] md:text-xs mt-0.5" style={{ color: theme.textSecondary }}>Iniciar tramite</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/app/consulta')}
            className="flex flex-col items-center justify-center gap-2 py-5 md:py-4 px-3 md:px-4 rounded-2xl font-medium transition-all active:scale-[0.98] hover:scale-[1.02]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <MessageCircle className="h-6 w-6" style={{ color: '#10b981' }} />
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold" style={{ color: theme.text }}>Asistente</span>
              <p className="text-[10px] md:text-xs mt-0.5" style={{ color: theme.textSecondary }}>Consultas IA</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/app/estadisticas')}
            className="flex flex-col items-center justify-center gap-2 py-5 md:py-4 px-3 md:px-4 rounded-2xl font-medium transition-all active:scale-[0.98] hover:scale-[1.02]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#f59e0b20' }}
            >
              <BarChart3 className="h-6 w-6" style={{ color: '#f59e0b' }} />
            </div>
            <div className="text-center">
              <span className="text-sm font-semibold" style={{ color: theme.text }}>Estadisticas</span>
              <p className="text-[10px] md:text-xs mt-0.5" style={{ color: theme.textSecondary }}>Ver datos</p>
            </div>
          </button>
        </div>

        {/* Layout de 2 columnas en desktop, 1 en mobile */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6">
          {/* Noticias - Carrusel horizontal en mobile */}
          <div>
            <h3 className="font-semibold mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base" style={{ color: theme.text }}>
              <BarChart3 className="h-4 w-4 md:h-5 md:w-5" style={{ color: theme.primary }} />
              Noticias del Municipio
            </h3>

            {/* Mobile: Carrusel horizontal */}
            <div className="md:hidden flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
              {noticiasDefault.map((noticia) => (
                <div
                  key={noticia.id}
                  className="flex-shrink-0 w-[280px] rounded-xl overflow-hidden border"
                  style={{ backgroundColor: theme.card, borderColor: theme.border }}
                >
                  <img
                    src={noticia.imagen_url}
                    alt={noticia.titulo}
                    className="w-full h-32 object-cover"
                  />
                  <div className="p-3">
                    <h4 className="font-medium text-sm mb-1 line-clamp-2" style={{ color: theme.text }}>
                      {noticia.titulo}
                    </h4>
                    <p className="text-xs line-clamp-2" style={{ color: theme.textSecondary }}>
                      {noticia.descripcion}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Lista vertical */}
            <div className="hidden md:block space-y-3">
              {noticiasDefault.map((noticia) => (
                <div
                  key={noticia.id}
                  className="rounded-xl p-4 flex gap-3 border transition-all hover:scale-[1.01]"
                  style={{ backgroundColor: theme.card, borderColor: theme.border }}
                >
                  <img
                    src={noticia.imagen_url}
                    alt={noticia.titulo}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm mb-1" style={{ color: theme.text }}>
                      {noticia.titulo}
                    </h4>
                    <p className="text-xs line-clamp-2" style={{ color: theme.textSecondary }}>
                      {noticia.descripcion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reclamos recientes */}
          <div>
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="font-semibold flex items-center gap-2 text-sm md:text-base" style={{ color: theme.text }}>
                <MessageSquare className="h-4 w-4 md:h-5 md:w-5" style={{ color: theme.primary }} />
                Reclamos Recientes
              </h3>
            </div>

            {/* Buscador */}
            <div className="relative mb-3 md:mb-4">
              <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5" style={{ color: theme.textSecondary }} />
              <input
                type="text"
                placeholder="Buscar reclamos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 md:pl-12 pr-4 py-2.5 md:py-3 rounded-xl border outline-none transition-all text-sm"
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  color: theme.text,
                }}
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
              </div>
            ) : reclamosFiltrados.length === 0 ? (
              <div
                className="rounded-xl p-6 text-center border"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}
              >
                <MessageSquare className="h-10 w-10 mx-auto mb-2" style={{ color: theme.textSecondary }} />
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  No hay reclamos para mostrar
                </p>
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3 max-h-[350px] md:max-h-[400px] overflow-y-auto pr-1">
                {reclamosFiltrados.map((reclamo) => {
                  const estadoConfig = getEstadoConfig(reclamo.estado);
                  return (
                    <div
                      key={reclamo.id}
                      className="rounded-xl p-3 md:p-4 border transition-all hover:scale-[1.01] cursor-pointer"
                      style={{ backgroundColor: theme.card, borderColor: theme.border }}
                      onClick={() => navigate(`/reclamo/${reclamo.id}`)}
                    >
                      <div className="flex items-start gap-2 md:gap-3">
                        <div
                          className="w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${reclamo.categoria?.color || theme.primary}20` }}
                        >
                          <MessageSquare className="h-4 w-4 md:h-5 md:w-5" style={{ color: reclamo.categoria?.color || theme.primary }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-sm truncate" style={{ color: theme.text }}>
                              {reclamo.titulo}
                            </p>
                          </div>
                          <p className="text-xs mt-0.5 flex items-center gap-1 truncate" style={{ color: theme.textSecondary }}>
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {reclamo.direccion}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[10px] md:text-xs flex items-center gap-1" style={{ color: theme.textSecondary }}>
                              <Calendar className="h-3 w-3" />
                              {formatDate(reclamo.created_at)}
                            </span>
                            {reclamo.categoria && (
                              <span
                                className="text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${reclamo.categoria.color}20`, color: reclamo.categoria.color }}
                              >
                                {reclamo.categoria.nombre}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" style={{ color: theme.textSecondary }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* CTA de registro - Solo visible en desktop */}
        <div className="hidden md:block mt-8">
          <div
            className="rounded-2xl p-6 text-center border"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
              Crea tu cuenta para hacer seguimiento
            </h3>
            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              Registrate para recibir notificaciones sobre tus reclamos y acceder a mas funciones
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                Ya tengo cuenta
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                style={{ backgroundColor: theme.primary }}
              >
                Crear cuenta gratis
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer - Desktop */}
      <footer
        className="hidden md:block border-t mt-8"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm" style={{ color: theme.textSecondary }}>
            <p>Sistema de Reclamos Municipales</p>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/bienvenido')} className="hover:underline">
                Cambiar Municipio
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Bottom Navigation - Mobile */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t pb-safe"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}
      >
        <div className="grid grid-cols-4 items-end py-2 px-2">
          {/* Inicio */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex flex-col items-center justify-center gap-1 py-2"
          >
            <Home className="h-5 w-5" style={{ color: theme.primary }} />
            <span className="text-[10px] font-medium" style={{ color: theme.primary }}>
              Inicio
            </span>
          </button>

          {/* Nuevo Reclamo - Boton central destacado */}
          <button
            onClick={() => navigate('/nuevo-reclamo')}
            className="flex flex-col items-center justify-center -mt-4"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-4"
              style={{
                backgroundColor: theme.primary,
                borderColor: theme.card
              }}
            >
              <Plus className="h-7 w-7 text-white" />
            </div>
            <span className="text-[10px] font-semibold mt-1" style={{ color: theme.primary }}>
              Reclamo
            </span>
          </button>

          {/* Configuracion PWA/Notificaciones */}
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex flex-col items-center justify-center gap-1 py-2 relative"
          >
            {/* Badge si hay algo por configurar */}
            {(!isInstalled || notificationPermission !== 'granted') && (
              <div
                className="absolute top-1 right-3 w-2 h-2 rounded-full"
                style={{ backgroundColor: '#f59e0b' }}
              />
            )}
            <Settings className="h-5 w-5" style={{ color: theme.textSecondary }} />
            <span className="text-[10px] font-medium" style={{ color: theme.textSecondary }}>
              Ajustes
            </span>
          </button>

          {/* Ingresar */}
          <button
            onClick={() => navigate('/login')}
            className="flex flex-col items-center justify-center gap-1 py-2"
          >
            <User className="h-5 w-5" style={{ color: theme.textSecondary }} />
            <span className="text-[10px] font-medium" style={{ color: theme.textSecondary }}>
              Ingresar
            </span>
          </button>
        </div>
      </nav>

      {/* Modal de Configuracion PWA y Notificaciones */}
      {showConfigModal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfigModal(false)}
          />

          {/* Modal Content */}
          <div
            className="relative w-full md:max-w-md mx-4 mb-0 md:mb-0 rounded-t-3xl md:rounded-3xl p-6 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            style={{ backgroundColor: theme.card }}
          >
            {/* Handle bar para mobile */}
            <div className="md:hidden w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${theme.primary}20` }}
                >
                  <Settings className="h-5 w-5" style={{ color: theme.primary }} />
                </div>
                <div>
                  <h3 className="font-bold text-lg" style={{ color: theme.text }}>
                    Configuracion
                  </h3>
                  <p className="text-xs" style={{ color: theme.textSecondary }}>
                    Mejora tu experiencia
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-2 rounded-lg transition-colors hover:bg-white/10"
              >
                <X className="h-5 w-5" style={{ color: theme.textSecondary }} />
              </button>
            </div>

            {/* Seccion 1: Instalar App */}
            <div
              className="rounded-xl p-4 mb-4 border"
              style={{ backgroundColor: theme.backgroundSecondary, borderColor: theme.border }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#8B5CF620' }}
                >
                  <Smartphone className="h-5 w-5" style={{ color: '#8B5CF6' }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold" style={{ color: theme.text }}>
                      Instalar App
                    </h4>
                    {isInstalled && (
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                    Accede mas rapido desde tu pantalla de inicio
                  </p>
                </div>
              </div>

              {isInstalled ? (
                <div
                  className="flex items-center gap-2 py-2 px-3 rounded-lg"
                  style={{ backgroundColor: '#10b98120' }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
                  <span className="text-sm" style={{ color: '#10b981' }}>
                    App instalada correctamente
                  </span>
                </div>
              ) : showIOSInstructions ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: theme.text }}>
                    Para instalar en iPhone/iPad:
                  </p>
                  <div className="flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
                    <div className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-[10px] font-bold">1</span>
                      <Share className="h-4 w-4" style={{ color: theme.primary }} />
                      <span>Compartir</span>
                    </div>
                    <span>→</span>
                    <div className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-[10px] font-bold">2</span>
                      <PlusSquare className="h-4 w-4" style={{ color: theme.primary }} />
                      <span>Agregar a inicio</span>
                    </div>
                  </div>
                </div>
              ) : isInstallable ? (
                <button
                  onClick={handleInstallPWA}
                  disabled={configLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#8B5CF6' }}
                >
                  {configLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Instalar ahora
                    </>
                  )}
                </button>
              ) : (
                <div
                  className="py-2 px-3 rounded-lg text-xs"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                >
                  La instalacion no esta disponible en este navegador
                </div>
              )}
            </div>

            {/* Seccion 2: Notificaciones */}
            <div
              className="rounded-xl p-4 mb-4 border"
              style={{ backgroundColor: theme.backgroundSecondary, borderColor: theme.border }}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#f59e0b20' }}
                >
                  <Bell className="h-5 w-5" style={{ color: '#f59e0b' }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold" style={{ color: theme.text }}>
                      Notificaciones
                    </h4>
                    {notificationPermission === 'granted' && (
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                    Recibe alertas cuando tu reclamo cambie de estado
                  </p>
                </div>
              </div>

              {!pushSupported ? (
                <div
                  className="py-2 px-3 rounded-lg text-xs"
                  style={{ backgroundColor: '#fef3c720', color: '#f59e0b' }}
                >
                  Tu navegador no soporta notificaciones push
                </div>
              ) : notificationPermission === 'denied' ? (
                <div
                  className="py-2 px-3 rounded-lg text-xs"
                  style={{ backgroundColor: '#fee2e220', color: '#ef4444' }}
                >
                  <p className="font-medium mb-1">Notificaciones bloqueadas</p>
                  <p>Debes habilitarlas desde la configuracion de tu navegador</p>
                </div>
              ) : notificationPermission === 'granted' ? (
                <div
                  className="flex items-center gap-2 py-2 px-3 rounded-lg"
                  style={{ backgroundColor: '#10b98120' }}
                >
                  <CheckCircle2 className="h-4 w-4" style={{ color: '#10b981' }} />
                  <span className="text-sm" style={{ color: '#10b981' }}>
                    Notificaciones activadas
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleEnableNotifications}
                  disabled={configLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#f59e0b' }}
                >
                  {configLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Bell className="h-4 w-4" />
                      Activar notificaciones
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Info adicional */}
            <div
              className="rounded-xl p-4 border"
              style={{ backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}30` }}
            >
              <p className="text-xs" style={{ color: theme.textSecondary }}>
                <strong style={{ color: theme.text }}>Tip:</strong> Para una mejor experiencia,
                registrate y activa las notificaciones. Asi podras hacer seguimiento de tus reclamos
                y recibir actualizaciones en tiempo real.
              </p>
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  navigate('/register');
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ backgroundColor: theme.primary }}
              >
                <User className="h-4 w-4" />
                Crear cuenta gratis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
