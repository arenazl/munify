import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, Star, Medal, Award, Crown, Shield, Target,
  Eye, Camera, MapPin, Calendar, Sunrise, Moon, Flame,
  Gift, User, Loader2,
  Lightbulb, Droplets, TreeDeciduous, Construction
} from 'lucide-react';
import { toast } from 'sonner';
import { gamificacionApi } from '../../lib/api';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

// Mapeo de iconos por nombre
const BADGE_ICONS: Record<string, React.ReactNode> = {
  'footprints': <Target className="h-5 w-5" />,
  'user-check': <User className="h-5 w-5" />,
  'eye': <Eye className="h-5 w-5" />,
  'star': <Star className="h-5 w-5" />,
  'shield': <Shield className="h-5 w-5" />,
  'trophy': <Trophy className="h-5 w-5" />,
  'construction': <Construction className="h-5 w-5" />,
  'lightbulb': <Lightbulb className="h-5 w-5" />,
  'trees': <TreeDeciduous className="h-5 w-5" />,
  'droplets': <Droplets className="h-5 w-5" />,
  'camera': <Camera className="h-5 w-5" />,
  'map-pin': <MapPin className="h-5 w-5" />,
  'calendar-check': <Calendar className="h-5 w-5" />,
  'sunrise': <Sunrise className="h-5 w-5" />,
  'moon': <Moon className="h-5 w-5" />,
  'crown': <Crown className="h-5 w-5" />,
  'medal': <Medal className="h-5 w-5" />,
  'flame': <Flame className="h-5 w-5" />,
};

interface Badge {
  tipo: string;
  nombre: string;
  descripcion: string;
  icono: string;
  color: string;
  requisito: string;
  puntos_bonus: number;
  obtenido_en?: string;
}

interface PerfilGamificacion {
  puntos: {
    puntos_totales: number;
    puntos_mes_actual: number;
    nivel: number;
    progreso_nivel: number;
    puntos_para_siguiente: number;
  };
  estadisticas: {
    reclamos_totales: number;
    reclamos_resueltos: number;
    reclamos_con_foto: number;
    reclamos_con_ubicacion: number;
    calificaciones_dadas: number;
    semanas_consecutivas: number;
  };
  badges: Badge[];
  badges_disponibles: Badge[];
  posicion_leaderboard: number | null;
  historial_reciente: Array<{
    tipo: string;
    puntos: number;
    descripcion: string;
    fecha: string;
  }>;
}

// Componente de progreso circular simple
function CircularProgress({
  value,
  max,
  size = 100,
  strokeWidth = 8,
  color,
  bgColor,
  children
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  bgColor: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(value / max, 1);
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export default function MobileLogros() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<PerfilGamificacion | null>(null);

  useEffect(() => {
    if (user) {
      fetchPerfil();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchPerfil = async () => {
    try {
      const res = await gamificacionApi.getMiPerfil();
      setPerfil(res.data);
    } catch (error) {
      console.error('Error cargando perfil:', error);
      toast.error('Error al cargar logros');
    } finally {
      setLoading(false);
    }
  };

  // Si no está logueado
  if (!user) {
    return (
      <div className="p-4">
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.primary}dd)`,
          }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Ganá puntos y badges
          </h2>
          <p className="text-white/80 text-sm mb-6">
            Iniciá sesión para ver tus logros y competir en el ranking
          </p>
          <button
            onClick={() => navigate('/app/login')}
            className="w-full py-3 px-4 bg-white text-slate-900 font-semibold rounded-xl"
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header con nivel y puntos */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center gap-4">
          {/* Círculo de progreso */}
          <CircularProgress
            value={perfil?.puntos.progreso_nivel || 0}
            max={100}
            size={80}
            strokeWidth={6}
            color={theme.primary}
            bgColor={`${theme.primary}20`}
          >
            <div className="text-center">
              <div className="text-xl font-bold" style={{ color: theme.text }}>
                {perfil?.puntos.nivel || 1}
              </div>
              <div className="text-[10px]" style={{ color: theme.textSecondary }}>
                NIVEL
              </div>
            </div>
          </CircularProgress>

          {/* Stats */}
          <div className="flex-1">
            <div className="text-2xl font-bold" style={{ color: theme.primary }}>
              {perfil?.puntos.puntos_totales.toLocaleString() || 0}
            </div>
            <div className="text-sm" style={{ color: theme.textSecondary }}>
              puntos totales
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: theme.textSecondary }}>
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                #{perfil?.posicion_leaderboard || '-'}
              </span>
              <span>|</span>
              <span>{perfil?.puntos.puntos_mes_actual || 0} este mes</span>
            </div>
          </div>
        </div>

        {/* Barra de progreso al siguiente nivel */}
        <div className="mt-4 pt-3 border-t" style={{ borderColor: theme.border }}>
          <div className="flex justify-between text-xs mb-1" style={{ color: theme.textSecondary }}>
            <span>Nivel {perfil?.puntos.nivel || 1}</span>
            <span>{perfil?.puntos.puntos_para_siguiente || 100} pts para nivel {(perfil?.puntos.nivel || 1) + 1}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.primary}20` }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${perfil?.puntos.progreso_nivel || 0}%`,
                backgroundColor: theme.primary
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Reclamos', value: perfil?.estadisticas.reclamos_totales || 0, color: theme.primary },
          { label: 'Resueltos', value: perfil?.estadisticas.reclamos_resueltos || 0, color: '#10b981' },
          { label: 'Badges', value: perfil?.badges.length || 0, color: '#f59e0b' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-3 text-center"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            <div className="text-xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-[10px]" style={{ color: theme.textSecondary }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Mis Badges */}
      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
            <Award className="h-4 w-4" style={{ color: '#f59e0b' }} />
            Mis Badges
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
            {perfil?.badges.length || 0} / {(perfil?.badges.length || 0) + (perfil?.badges_disponibles.length || 0)}
          </span>
        </div>

        {(!perfil?.badges || perfil.badges.length === 0) ? (
          <div className="text-center py-6">
            <Award className="h-10 w-10 mx-auto mb-2 opacity-30" style={{ color: theme.textSecondary }} />
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Aún no tenés badges. Creá reclamos para desbloquear.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {perfil.badges.map((badge) => (
              <div
                key={badge.tipo}
                className="p-2 rounded-xl text-center"
                style={{ backgroundColor: theme.background }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-1"
                  style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                >
                  {BADGE_ICONS[badge.icono] || <Star className="h-5 w-5" />}
                </div>
                <div className="text-[10px] font-medium truncate" style={{ color: theme.text }}>
                  {badge.nombre}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Próximos badges */}
      {perfil && perfil.badges_disponibles.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
            <Target className="h-4 w-4" style={{ color: theme.textSecondary }} />
            Por desbloquear
          </h3>
          <div className="space-y-2">
            {perfil.badges_disponibles.slice(0, 4).map((badge) => (
              <div
                key={badge.tipo}
                className="flex items-center gap-3 p-2 rounded-xl opacity-60"
                style={{ backgroundColor: theme.background }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                >
                  {BADGE_ICONS[badge.icono] || <Star className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: theme.text }}>
                    {badge.nombre}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: theme.textSecondary }}>
                    {badge.requisito}
                  </div>
                </div>
                <div className="text-[10px] font-medium" style={{ color: theme.primary }}>
                  +{badge.puntos_bonus}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actividad reciente */}
      {perfil && perfil.historial_reciente.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
            <Flame className="h-4 w-4" style={{ color: '#ef4444' }} />
            Actividad reciente
          </h3>
          <div className="space-y-2">
            {perfil.historial_reciente.slice(0, 5).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-2 rounded-xl"
                style={{ backgroundColor: idx % 2 === 0 ? theme.background : 'transparent' }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                >
                  +{item.puntos}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: theme.text }}>
                    {item.descripcion || item.tipo.replace(/_/g, ' ')}
                  </div>
                  <div className="text-[10px]" style={{ color: theme.textSecondary }}>
                    {item.fecha ? new Date(item.fecha).toLocaleDateString('es-AR') : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA para crear reclamo */}
      <div
        className="rounded-2xl p-4 text-center"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}20, ${theme.primary}10)`,
          border: `1px solid ${theme.primary}30`,
        }}
      >
        <Gift className="h-8 w-8 mx-auto mb-2" style={{ color: theme.primary }} />
        <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>
          Ganá +10 puntos por cada reclamo
        </p>
        <button
          onClick={() => navigate('/app/nuevo')}
          className="w-full py-2.5 px-4 rounded-xl font-medium text-white"
          style={{ backgroundColor: theme.primary }}
        >
          Crear Reclamo
        </button>
      </div>
    </div>
  );
}
