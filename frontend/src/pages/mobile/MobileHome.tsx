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
  Building2,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { reclamosApi } from '../../lib/api';
import type { Reclamo, EstadoReclamo } from '../../types';

const estadoConfig: Record<EstadoReclamo, { icon: typeof Clock; color: string; label: string }> = {
  nuevo: { icon: Clock, color: '#6b7280', label: 'Nuevo' },
  asignado: { icon: AlertCircle, color: '#3b82f6', label: 'Asignado' },
  en_proceso: { icon: Clock, color: '#f59e0b', label: 'En Proceso' },
  resuelto: { icon: CheckCircle2, color: '#10b981', label: 'Resuelto' },
  rechazado: { icon: AlertCircle, color: '#ef4444', label: 'Rechazado' },
};

export default function MobileHome() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendientes: 0, resueltos: 0 });

  useEffect(() => {
    if (user) {
      loadReclamos();
    } else {
      setLoading(false);
    }
  }, [user]);

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
    const municipioNombre = localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '') || 'tu Municipio';
    const logoUrl = localStorage.getItem('municipio_logo_url');

    return (
      <div className="space-y-0">
        {/* Banner superior con imagen de fondo del municipio */}
        <div className="relative overflow-hidden" style={{ minHeight: '180px' }}>
          {/* Imagen de fondo */}
          <div className="absolute inset-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={municipioNombre}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
                }}
              />
            )}
            {/* Gradiente oscuro para legibilidad */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(180deg,
                  rgba(15, 23, 42, 0.5) 0%,
                  rgba(15, 23, 42, 0.7) 50%,
                  ${theme.primary}90 100%
                )`,
              }}
            />
          </div>

          {/* Contenido del banner */}
          <div className="relative z-10 p-6 flex flex-col justify-end" style={{ minHeight: '180px' }}>
            <h1 className="text-2xl text-white mb-1 drop-shadow-lg">
              <span className="font-light">Municipalidad de </span>
              <span className="font-bold">{municipioNombre}</span>
            </h1>
            <p className="text-sm text-white/90">
              Sistema de Reclamos Vecinales
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
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
      </div>
    );
  }

  // Datos hardcodeados de noticias genéricas para demo
  const noticiasHardcoded = [
    {
      id: 1,
      titulo: "Mejoras en el servicio de recolección de residuos",
      descripcion: "Se implementó un nuevo sistema de rutas optimizadas para la recolección de residuos, mejorando la frecuencia y cobertura en todos los barrios del municipio.",
      imagen_url: "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=400"
    },
    {
      id: 2,
      titulo: "Nueva iluminación LED en espacios públicos",
      descripcion: "El municipio continúa con el plan de modernización del alumbrado público, instalando luminarias LED de bajo consumo en plazas y calles principales.",
      imagen_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"
    },
    {
      id: 3,
      titulo: "Trabajos de mantenimiento en calles y veredas",
      descripcion: "Se realizan trabajos de bacheo y reparación de veredas en diversos puntos del distrito para mejorar la transitabilidad y seguridad de los vecinos.",
      imagen_url: "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=400"
    }
  ];

  const municipioNombre = localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '') || 'Municipio';
  const logoUrl = localStorage.getItem('municipio_logo_url');

  return (
    <div className="space-y-0">
      {/* Banner superior con imagen de fondo del municipio */}
      <div className="relative overflow-hidden" style={{ minHeight: '180px' }}>
        {/* Imagen de fondo */}
        <div className="absolute inset-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={municipioNombre}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryHover} 100%)`,
              }}
            />
          )}
          {/* Gradiente oscuro para legibilidad */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg,
                rgba(15, 23, 42, 0.5) 0%,
                rgba(15, 23, 42, 0.7) 50%,
                ${theme.primary}90 100%
              )`,
            }}
          />
        </div>

        {/* Contenido del banner */}
        <div className="relative z-10 p-6 flex flex-col justify-end" style={{ minHeight: '180px' }}>
          <h1 className="text-2xl text-white mb-1 drop-shadow-lg">
            <span className="font-light">Municipalidad de </span>
            <span className="font-bold">{municipioNombre}</span>
          </h1>
          <p className="text-sm text-white/90">
            Sistema de Reclamos Vecinales
          </p>
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
