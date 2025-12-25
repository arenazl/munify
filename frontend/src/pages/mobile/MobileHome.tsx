import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  MapPin,
  Loader2,
  MessageCircle,
  BarChart3,
  Zap,
  Construction,
  Droplets,
  TreeDeciduous,
  Leaf,
  Trash2,
  Recycle,
  Brush,
  Car,
  Signpost,
  Bug,
  Building2,
  TrafficCone,
  Footprints,
  Lamp,
  VolumeX,
  MoreHorizontal,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { reclamosApi, publicApi } from '../../lib/api';
import type { Reclamo, EstadoReclamo, Categoria } from '../../types';

// Iconos por categoría (mismo patrón que NuevoReclamo)
const categoryIcons: Record<string, React.ReactNode> = {
  'alumbrado': <Zap className="h-5 w-5" />,
  'bache': <Construction className="h-5 w-5" />,
  'calle': <Construction className="h-5 w-5" />,
  'agua': <Droplets className="h-5 w-5" />,
  'cloaca': <Droplets className="h-5 w-5" />,
  'desague': <Droplets className="h-5 w-5" />,
  'arbolado': <TreeDeciduous className="h-5 w-5" />,
  'espacio': <Leaf className="h-5 w-5" />,
  'verde': <Leaf className="h-5 w-5" />,
  'basura': <Trash2 className="h-5 w-5" />,
  'residuo': <Recycle className="h-5 w-5" />,
  'recolec': <Recycle className="h-5 w-5" />,
  'limpieza': <Brush className="h-5 w-5" />,
  'transito': <Car className="h-5 w-5" />,
  'señal': <Signpost className="h-5 w-5" />,
  'plaga': <Bug className="h-5 w-5" />,
  'fumiga': <Bug className="h-5 w-5" />,
  'edificio': <Building2 className="h-5 w-5" />,
  'semaforo': <TrafficCone className="h-5 w-5" />,
  'semáforo': <TrafficCone className="h-5 w-5" />,
  'vereda': <Footprints className="h-5 w-5" />,
  'cordon': <Footprints className="h-5 w-5" />,
  'mobiliario': <Lamp className="h-5 w-5" />,
  'ruido': <VolumeX className="h-5 w-5" />,
  'default': <MoreHorizontal className="h-5 w-5" />,
};

// Colores por categoría (mismo patrón que NuevoReclamo)
const categoryColors: Record<string, string> = {
  'alumbrado': '#f59e0b',
  'bache': '#ef4444',
  'calle': '#ef4444',
  'agua': '#3b82f6',
  'cloaca': '#0ea5e9',
  'desague': '#0ea5e9',
  'arbolado': '#22c55e',
  'espacio': '#10b981',
  'verde': '#10b981',
  'basura': '#6b7280',
  'residuo': '#78716c',
  'recolec': '#78716c',
  'limpieza': '#14b8a6',
  'transito': '#8b5cf6',
  'señal': '#f97316',
  'plaga': '#dc2626',
  'fumiga': '#dc2626',
  'edificio': '#a855f7',
  'semaforo': '#ef4444',
  'semáforo': '#ef4444',
  'vereda': '#78716c',
  'cordon': '#78716c',
  'mobiliario': '#6366f1',
  'ruido': '#f97316',
  'default': '#6366f1',
};

function getCategoryIcon(nombre: string): React.ReactNode {
  const key = nombre.toLowerCase();
  for (const [k, icon] of Object.entries(categoryIcons)) {
    if (key.includes(k)) return icon;
  }
  return categoryIcons.default;
}

function getCategoryColor(nombre: string): string {
  const key = nombre.toLowerCase();
  for (const [k, color] of Object.entries(categoryColors)) {
    if (key.includes(k)) return color;
  }
  return categoryColors.default;
}

const estadoConfig: Record<EstadoReclamo, { icon: typeof Clock; color: string; label: string }> = {
  nuevo: { icon: Clock, color: '#6b7280', label: 'Nuevo' },
  asignado: { icon: AlertCircle, color: '#3b82f6', label: 'Asignado' },
  en_proceso: { icon: Clock, color: '#f59e0b', label: 'En Proceso' },
  resuelto: { icon: CheckCircle2, color: '#10b981', label: 'Resuelto' },
  rechazado: { icon: AlertCircle, color: '#ef4444', label: 'Rechazado' },
};

// Componente de estadística circular
interface CircularStatProps {
  value: number;
  total: number;
  label: string;
  color: string;
  theme: any;
}

function CircularStat({ value, total, label, color, theme }: CircularStatProps) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const circumference = 2 * Math.PI * 36; // radio 36
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        {/* Círculo de fondo */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r="36"
            stroke={theme.border}
            strokeWidth="8"
            fill="none"
          />
          {/* Círculo de progreso */}
          <circle
            cx="48"
            cy="48"
            r="36"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {/* Número en el centro */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {value}
          </span>
        </div>
      </div>
      <p className="text-xs mt-2 text-center" style={{ color: theme.textSecondary }}>
        {label}
      </p>
    </div>
  );
}

export default function MobileHome() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategorias, setLoadingCategorias] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendientes: 0, resueltos: 0 });
  const [noticias, setNoticias] = useState<any[]>([]);

  // Cargar categorías del municipio
  useEffect(() => {
    const loadCategorias = async () => {
      try {
        const municipioId = localStorage.getItem('municipio_id');
        const res = await publicApi.getCategorias(municipioId ? parseInt(municipioId) : undefined);
        setCategorias(res.data);
      } catch (error) {
        // Silenciar error - las categorías son opcionales
      } finally {
        setLoadingCategorias(false);
      }
    };
    loadCategorias();
  }, []);

  useEffect(() => {
    if (user) {
      loadReclamos();
      loadNoticias();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadNoticias = async () => {
    try {
      const municipioId = localStorage.getItem('municipio_id');
      if (municipioId) {
        const res = await publicApi.get(`/noticias/publico?municipio_id=${municipioId}`);
        setNoticias(res.data);
      }
    } catch (error) {
      console.error('Error cargando noticias:', error);
    }
  };

  const loadReclamos = async () => {
    try {
      const res = await reclamosApi.getMisReclamos();
      const data = res.data;
      setReclamos(data.slice(0, 3));
      setStats({
        total: data.length,
        pendientes: data.filter((r: Reclamo) => ['nuevo', 'asignado', 'en_proceso'].includes(r.estado)).length,
        resueltos: data.filter((r: Reclamo) => r.estado === 'resuelto').length,
      });
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    const municipioNombre = localStorage.getItem('municipio_nombre') || 'tu Municipio';

    return (
      <div className="p-4 space-y-4">
        {/* Header de bienvenida - compacto */}
        <div className="text-center pt-2">
          <h1 className="text-xl font-bold" style={{ color: theme.text }}>
            {municipioNombre}
          </h1>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Sistema de Reclamos Vecinales
          </p>
        </div>

        {/* Acciones principales */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/app/nuevo')}
            className="flex flex-col items-center justify-center gap-2 py-5 px-4 rounded-2xl font-semibold text-white shadow-lg transition-all active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}dd)`,
              boxShadow: `0 4px 20px ${theme.primary}40`,
            }}
          >
            <Plus className="h-7 w-7" />
            <span>Reportar Problema</span>
          </button>
          <button
            onClick={() => navigate('/app/consulta')}
            className="flex flex-col items-center justify-center gap-2 py-5 px-4 rounded-2xl font-semibold transition-all active:scale-[0.98]"
            style={{
              backgroundColor: theme.card,
              border: `2px solid ${theme.primary}`,
              color: theme.primary,
            }}
          >
            <MessageCircle className="h-7 w-7" />
            <span>Hacer Consulta</span>
          </button>
        </div>

        {/* Explorar trabajo del municipio */}
        <button
          onClick={() => navigate('/app/estadisticas')}
          className="w-full flex items-center justify-between p-4 rounded-xl transition-all active:scale-[0.98]"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}15` }}
            >
              <BarChart3 className="h-5 w-5" style={{ color: theme.primary }} />
            </div>
            <div className="text-left">
              <p className="font-medium" style={{ color: theme.text }}>Explorá nuestro trabajo</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Reclamos resueltos y en proceso</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5" style={{ color: theme.textSecondary }} />
        </button>

        {/* Login sutil al final */}
        <div className="text-center pt-2 pb-4">
          <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>
            ¿Ya tenés cuenta?
          </p>
          <button
            onClick={() => navigate('/app/login')}
            className="text-sm font-medium"
            style={{ color: theme.primary }}
          >
            Iniciar Sesión
          </button>
          <span className="mx-2" style={{ color: theme.textSecondary }}>•</span>
          <button
            onClick={() => navigate('/app/register')}
            className="text-sm font-medium"
            style={{ color: theme.primary }}
          >
            Crear Cuenta
          </button>
        </div>
      </div>
    );
  }

  // Datos hardcodeados de noticias para demo
  const noticiasHardcoded = [
    {
      id: 1,
      titulo: "Nueva pavimentación en Barrio Centro",
      descripcion: "Se iniciaron los trabajos de pavimentación en las calles principales del barrio centro, beneficiando a más de 500 familias.",
      imagen_url: "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=400"
    },
    {
      id: 2,
      titulo: "Inauguración de Plaza Renovada",
      descripcion: "Este sábado se inaugura la renovación completa de Plaza San Martín con nuevos juegos y espacios verdes para toda la familia.",
      imagen_url: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400"
    }
  ];

  const municipioNombre = localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '') || 'Municipio';

  // Calcular porcentajes para las estadísticas
  const totalReclamos = stats.total || 1; // Evitar división por 0
  const porcentajePendientes = Math.round((stats.pendientes / totalReclamos) * 100);
  const porcentajeResueltos = Math.round((stats.resueltos / totalReclamos) * 100);

  return (
    <div className="space-y-0">
      {/* Banner superior con imagen de fondo */}
      <div
        className="relative h-40 flex flex-col justify-end p-6"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6)), url(https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <h1 className="text-2xl font-bold text-white mb-1">
          Dashboard Analytics
        </h1>
        <p className="text-sm text-white/90">
          Monitoreo en tiempo real de gestión municipal
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs text-white/80">
          <div className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3" />
            <span>{stats.total} reclamos</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>4.9d promedio</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{municipioNombre}</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* 4 Cards de estadísticas en una línea */}
        <div className="grid grid-cols-4 gap-2">
          {/* Total Reclamos */}
          <div
            className="rounded-lg p-2 text-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-8 h-8 mx-auto mb-1 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20` }}
            >
              <ClipboardList className="h-4 w-4" style={{ color: theme.primary }} />
            </div>
            <p className="text-lg font-bold" style={{ color: theme.text }}>
              {loading ? '-' : stats.total}
            </p>
            <p className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>
              Total
            </p>
          </div>

          {/* Nuevos Hoy */}
          <div
            className="rounded-lg p-2 text-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-8 h-8 mx-auto mb-1 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#f59e0b20' }}
            >
              <Plus className="h-4 w-4" style={{ color: '#f59e0b' }} />
            </div>
            <p className="text-lg font-bold" style={{ color: theme.text }}>
              4
            </p>
            <p className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>
              Hoy
            </p>
          </div>

          {/* Esta Semana */}
          <div
            className="rounded-lg p-2 text-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-8 h-8 mx-auto mb-1 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#10b98120' }}
            >
              <ChevronRight className="h-4 w-4" style={{ color: '#10b981' }} />
            </div>
            <p className="text-lg font-bold" style={{ color: theme.text }}>
              {loading ? '-' : Math.min(7, stats.total)}
            </p>
            <p className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>
              Semana
            </p>
          </div>

          {/* Tiempo Promedio */}
          <div
            className="rounded-lg p-2 text-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div
              className="w-8 h-8 mx-auto mb-1 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#8b5cf620' }}
            >
              <Clock className="h-4 w-4" style={{ color: '#8b5cf6' }} />
            </div>
            <p className="text-lg font-bold" style={{ color: theme.text }}>
              4.9d
            </p>
            <p className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>
              Tiempo
            </p>
          </div>
        </div>

        {/* Botón Ver nuestro trabajo */}
        <button
            onClick={() => navigate('/app/estadisticas')}
            className="w-full flex items-center justify-between p-4 rounded-xl transition-all active:scale-[0.98]"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${theme.primary}15` }}
              >
                <BarChart3 className="h-5 w-5" style={{ color: theme.primary }} />
              </div>
              <div className="text-left">
                <p className="font-medium" style={{ color: theme.text }}>Explorá nuestro trabajo</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Estadísticas y reclamos resueltos</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5" style={{ color: theme.textSecondary }} />
        </button>

        {/* Noticias del Municipio */}
        <div>
          <h3 className="font-semibold mb-3" style={{ color: theme.text }}>
            Noticias del Municipio
          </h3>
          <div className="space-y-3">
            {noticiasHardcoded.map((noticia) => (
              <div
                key={noticia.id}
                className="rounded-xl p-4 flex gap-3"
                style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
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

        {/* Últimos Reclamos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold" style={{ color: theme.text }}>
              Últimos Reclamos
            </h3>
            {reclamos.length > 0 && (
              <button
                onClick={() => navigate('/app/mis-reclamos')}
                className="text-sm flex items-center gap-1"
                style={{ color: theme.primary }}
              >
                Ver todos
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
            </div>
          ) : reclamos.length === 0 ? (
            <div
              className="rounded-xl p-6 text-center"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div
                className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                style={{ backgroundColor: theme.backgroundSecondary }}
              >
                <ClipboardList className="h-6 w-6" style={{ color: theme.textSecondary }} />
              </div>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Aún no tenés reclamos
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reclamos.map((reclamo) => {
                const config = estadoConfig[reclamo.estado];
                const Icon = config.icon;
                return (
                  <button
                    key={reclamo.id}
                    onClick={() => navigate(`/app/mis-reclamos?id=${reclamo.id}`)}
                    className="w-full text-left rounded-xl p-4 transition-all active:scale-[0.98]"
                    style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${config.color}15` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: config.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium truncate" style={{ color: theme.text }}>
                            {reclamo.titulo}
                          </p>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: `${config.color}15`, color: config.color }}
                          >
                            {config.label}
                          </span>
                        </div>
                        <p className="text-sm mt-1 flex items-center gap-1 truncate" style={{ color: theme.textSecondary }}>
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {reclamo.direccion}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
