import { useEffect, useState } from 'react';
import {
  Trophy, Star, Medal, Award, Crown, Shield, Target,
  Eye, Camera, MapPin, Calendar, Sunrise, Moon, Flame,
  Gift, TrendingUp, User, Clock, ChevronRight, Zap,
  Lightbulb, Droplets, TreeDeciduous, Construction, CheckCircle, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { gamificacionApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

// Mapeo de iconos por nombre
const BADGE_ICONS: Record<string, React.ReactNode> = {
  'footprints': <Target className="h-6 w-6" />,
  'user-check': <User className="h-6 w-6" />,
  'eye': <Eye className="h-6 w-6" />,
  'star': <Star className="h-6 w-6" />,
  'shield': <Shield className="h-6 w-6" />,
  'trophy': <Trophy className="h-6 w-6" />,
  'construction': <Construction className="h-6 w-6" />,
  'lightbulb': <Lightbulb className="h-6 w-6" />,
  'trees': <TreeDeciduous className="h-6 w-6" />,
  'droplets': <Droplets className="h-6 w-6" />,
  'camera': <Camera className="h-6 w-6" />,
  'map-pin': <MapPin className="h-6 w-6" />,
  'calendar-check': <Calendar className="h-6 w-6" />,
  'sunrise': <Sunrise className="h-6 w-6" />,
  'moon': <Moon className="h-6 w-6" />,
  'crown': <Crown className="h-6 w-6" />,
  'medal': <Medal className="h-6 w-6" />,
  'flame': <Flame className="h-6 w-6" />,
};

// Colores para gráficos (más variados)
const CHART_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#0ea5e9', // sky
];

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

interface LeaderboardEntry {
  posicion: number;
  user_id: number;
  nombre: string;
  puntos: number;
  puntos_totales: number;
  reclamos: number;
  badges: number;
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

interface Recompensa {
  id: number;
  nombre: string;
  descripcion: string;
  icono: string;
  puntos_requeridos: number;
  stock: number | null;
}

// Componente de gráfico circular con SVG
function CircularProgress({
  value,
  max,
  size = 120,
  strokeWidth = 10,
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

// Mini bar chart component
function MiniBarChart({
  data,
  height = 60,
  barColor,
  bgColor
}: {
  data: { label: string; value: number }[];
  height?: number;
  barColor: string;
  bgColor: string;
}) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="flex items-end gap-1.5 justify-center" style={{ height }}>
      {data.map((item, idx) => (
        <div key={idx} className="flex flex-col items-center gap-1">
          <div
            className="w-6 rounded-t-sm transition-all duration-500"
            style={{
              height: `${Math.max((item.value / maxValue) * (height - 16), 4)}px`,
              backgroundColor: item.value > 0 ? barColor : bgColor
            }}
          />
          <span className="text-[10px] opacity-60">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// Stat card with mini visualization
function StatCard({
  icon: Icon,
  label,
  value,
  subvalue,
  color,
  bgColor,
  textColor,
  secondaryColor
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subvalue?: string;
  color: string;
  bgColor: string;
  textColor: string;
  secondaryColor: string;
}) {
  return (
    <div
      className="p-4 rounded-2xl transition-all hover:scale-[1.02]"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold" style={{ color: textColor }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subvalue && (
            <div className="text-xs" style={{ color: secondaryColor }}>
              {subvalue}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 text-sm font-medium" style={{ color: secondaryColor }}>
        {label}
      </div>
    </div>
  );
}

export default function Gamificacion() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState<PerfilGamificacion | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [periodo, setPeriodo] = useState<'mes' | 'total'>('mes');
  const [tab, setTab] = useState<'perfil' | 'leaderboard' | 'recompensas'>('perfil');

  useEffect(() => {
    fetchData();
  }, [periodo]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [perfilRes, leaderboardRes, recompensasRes] = await Promise.all([
        gamificacionApi.getMiPerfil(),
        gamificacionApi.getLeaderboard({ periodo, limite: 20 }),
        gamificacionApi.getRecompensas(),
      ]);
      setPerfil(perfilRes.data);
      setLeaderboard(leaderboardRes.data.usuarios);
      setRecompensas(recompensasRes.data);
    } catch (error) {
      console.error('Error cargando gamificación:', error);
      toast.error('Error al cargar datos de gamificación');
    } finally {
      setLoading(false);
    }
  };

  const canjearRecompensa = async (recompensaId: number) => {
    try {
      const res = await gamificacionApi.canjearRecompensa(recompensaId);
      toast.success(`Recompensa canjeada. Código: ${res.data.codigo_canje}`);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al canjear recompensa');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: theme.primary }} />
      </div>
    );
  }

  // Datos para el mini chart de actividad semanal
  const weekData = [
    { label: 'L', value: 3 },
    { label: 'M', value: 5 },
    { label: 'X', value: 2 },
    { label: 'J', value: 7 },
    { label: 'V', value: 4 },
    { label: 'S', value: 1 },
    { label: 'D', value: 0 },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Header moderno - más sutil */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Nivel y progreso circular */}
        <div
          className="md:col-span-1 rounded-2xl p-6 flex flex-col items-center justify-center"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <CircularProgress
            value={perfil?.puntos.progreso_nivel || 0}
            max={100}
            size={140}
            strokeWidth={12}
            color={theme.primary}
            bgColor={`${theme.primary}20`}
          >
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: theme.text }}>
                {perfil?.puntos.nivel}
              </div>
              <div className="text-xs uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                Nivel
              </div>
            </div>
          </CircularProgress>
          <div className="mt-4 text-center">
            <div className="text-sm" style={{ color: theme.textSecondary }}>
              {perfil?.puntos.puntos_para_siguiente} pts para nivel {(perfil?.puntos.nivel || 0) + 1}
            </div>
          </div>
        </div>

        {/* Stats principales */}
        <div
          className="md:col-span-2 rounded-2xl p-6"
          style={{ backgroundColor: theme.backgroundSecondary }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Mi Progreso
            </h2>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              <Zap className="h-4 w-4" />
              <span className="font-semibold">{perfil?.puntos.puntos_mes_actual.toLocaleString()}</span>
              <span className="opacity-70">este mes</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-xl" style={{ backgroundColor: theme.background }}>
              <div className="text-3xl font-bold" style={{ color: CHART_COLORS[0] }}>
                {perfil?.puntos.puntos_totales.toLocaleString()}
              </div>
              <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Puntos Totales
              </div>
            </div>
            <div className="text-center p-4 rounded-xl" style={{ backgroundColor: theme.background }}>
              <div className="text-3xl font-bold" style={{ color: CHART_COLORS[1] }}>
                {perfil?.badges.length}
              </div>
              <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Badges
              </div>
            </div>
            <div className="text-center p-4 rounded-xl" style={{ backgroundColor: theme.background }}>
              <div className="text-3xl font-bold" style={{ color: CHART_COLORS[2] }}>
                #{perfil?.posicion_leaderboard || '-'}
              </div>
              <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Ranking
              </div>
            </div>
          </div>

          {/* Mini bar chart */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: theme.border }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: theme.textSecondary }}>
                Actividad esta semana
              </span>
              <BarChart3 className="h-4 w-4" style={{ color: theme.textSecondary }} />
            </div>
            <MiniBarChart
              data={weekData}
              barColor={theme.primary}
              bgColor={`${theme.primary}20`}
            />
          </div>
        </div>
      </div>

      {/* Tabs modernos */}
      <div
        className="flex gap-1 p-1.5 rounded-2xl"
        style={{ backgroundColor: theme.backgroundSecondary }}
      >
        {[
          { id: 'perfil', label: 'Mi Perfil', icon: User },
          { id: 'leaderboard', label: 'Ranking', icon: Trophy },
          { id: 'recompensas', label: 'Premios', icon: Gift },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-200 ${
              tab === id ? 'shadow-sm' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: tab === id ? theme.background : 'transparent',
              color: tab === id ? theme.primary : theme.textSecondary,
            }}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'perfil' && (
        <div className="space-y-6">
          {/* Stats Grid con colores variados */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              icon={Target}
              label="Reclamos Creados"
              value={perfil?.estadisticas.reclamos_totales || 0}
              color={CHART_COLORS[0]}
              bgColor={theme.backgroundSecondary}
              textColor={theme.text}
              secondaryColor={theme.textSecondary}
            />
            <StatCard
              icon={CheckCircle}
              label="Resueltos"
              value={perfil?.estadisticas.reclamos_resueltos || 0}
              subvalue={`${perfil?.estadisticas.reclamos_totales ? Math.round((perfil.estadisticas.reclamos_resueltos / perfil.estadisticas.reclamos_totales) * 100) : 0}%`}
              color={CHART_COLORS[4]}
              bgColor={theme.backgroundSecondary}
              textColor={theme.text}
              secondaryColor={theme.textSecondary}
            />
            <StatCard
              icon={Camera}
              label="Con Foto"
              value={perfil?.estadisticas.reclamos_con_foto || 0}
              color={CHART_COLORS[2]}
              bgColor={theme.backgroundSecondary}
              textColor={theme.text}
              secondaryColor={theme.textSecondary}
            />
            <StatCard
              icon={MapPin}
              label="Con Ubicación"
              value={perfil?.estadisticas.reclamos_con_ubicacion || 0}
              color={CHART_COLORS[5]}
              bgColor={theme.backgroundSecondary}
              textColor={theme.text}
              secondaryColor={theme.textSecondary}
            />
            <StatCard
              icon={Star}
              label="Calificaciones"
              value={perfil?.estadisticas.calificaciones_dadas || 0}
              color={CHART_COLORS[3]}
              bgColor={theme.backgroundSecondary}
              textColor={theme.text}
              secondaryColor={theme.textSecondary}
            />
            <StatCard
              icon={Flame}
              label="Racha Semanal"
              value={perfil?.estadisticas.semanas_consecutivas || 0}
              subvalue="semanas"
              color={CHART_COLORS[2]}
              bgColor={theme.backgroundSecondary}
              textColor={theme.text}
              secondaryColor={theme.textSecondary}
            />
          </div>

          {/* Badges section mejorada */}
          <div className="rounded-2xl p-6" style={{ backgroundColor: theme.backgroundSecondary }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: theme.text }}>
                <Award className="h-5 w-5" style={{ color: CHART_COLORS[3] }} />
                Mis Badges
              </h2>
              <span
                className="text-sm px-3 py-1 rounded-full"
                style={{ backgroundColor: `${CHART_COLORS[3]}15`, color: CHART_COLORS[3] }}
              >
                {perfil?.badges.length} / {(perfil?.badges.length || 0) + (perfil?.badges_disponibles.length || 0)}
              </span>
            </div>

            {perfil?.badges.length === 0 ? (
              <div className="text-center py-10 rounded-xl" style={{ backgroundColor: theme.background }}>
                <Award className="h-12 w-12 mx-auto mb-3 opacity-30" style={{ color: theme.textSecondary }} />
                <p className="font-medium" style={{ color: theme.text }}>
                  Sin badges todavía
                </p>
                <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                  Creá tu primer reclamo para empezar a ganar badges
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {perfil?.badges.map((badge) => (
                  <div
                    key={badge.tipo}
                    className="group p-3 rounded-xl text-center transition-all hover:scale-105 cursor-pointer"
                    style={{ backgroundColor: theme.background }}
                    title={badge.descripcion}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-110"
                      style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                    >
                      {BADGE_ICONS[badge.icono] || <Star className="h-5 w-5" />}
                    </div>
                    <div className="font-medium text-xs truncate" style={{ color: theme.text }}>
                      {badge.nombre}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: badge.color }}>
                      +{badge.puntos_bonus}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Badges por desbloquear - más compacto */}
          {perfil && perfil.badges_disponibles.length > 0 && (
            <div className="rounded-2xl p-6" style={{ backgroundColor: theme.backgroundSecondary }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                <Target className="h-5 w-5" style={{ color: theme.textSecondary }} />
                Por Desbloquear
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {perfil.badges_disponibles.slice(0, 8).map((badge) => (
                  <div
                    key={badge.tipo}
                    className="p-3 rounded-xl flex items-center gap-3 opacity-60 hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: theme.background }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                    >
                      {BADGE_ICONS[badge.icono] || <Star className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: theme.text }}>
                        {badge.nombre}
                      </div>
                      <div className="text-xs truncate" style={{ color: theme.textSecondary }}>
                        {badge.requisito}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial reciente - timeline style */}
          {perfil && perfil.historial_reciente.length > 0 && (
            <div className="rounded-2xl p-6" style={{ backgroundColor: theme.backgroundSecondary }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                <Clock className="h-5 w-5" style={{ color: CHART_COLORS[0] }} />
                Actividad Reciente
              </h2>
              <div className="space-y-1">
                {perfil.historial_reciente.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors hover:bg-opacity-50"
                    style={{ backgroundColor: idx % 2 === 0 ? theme.background : 'transparent' }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}15`,
                        color: CHART_COLORS[idx % CHART_COLORS.length]
                      }}
                    >
                      +{item.puntos}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: theme.text }}>
                        {item.descripcion || item.tipo.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs" style={{ color: theme.textSecondary }}>
                        {item.fecha ? new Date(item.fecha).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : ''}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="space-y-4">
          {/* Selector de período mejorado */}
          <div className="flex gap-2">
            {[
              { id: 'mes', label: 'Este Mes', icon: Calendar },
              { id: 'total', label: 'Histórico', icon: TrendingUp },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPeriodo(id as 'mes' | 'total')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  backgroundColor: periodo === id ? theme.primary : theme.backgroundSecondary,
                  color: periodo === id ? '#fff' : theme.text,
                }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Top 3 destacado */}
          {leaderboard.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map((idx) => {
                const entry = leaderboard[idx];
                if (!entry) return null;
                const isFirst = idx === 0;
                const colors = ['#fbbf24', '#94a3b8', '#cd7f32'];

                return (
                  <div
                    key={entry.user_id}
                    className={`rounded-2xl p-4 text-center ${isFirst ? 'md:-mt-4' : ''}`}
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      border: entry.user_id === user?.id ? `2px solid ${theme.primary}` : 'none'
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
                      style={{ backgroundColor: colors[entry.posicion - 1], color: '#fff' }}
                    >
                      {entry.posicion === 1 ? (
                        <Crown className="h-6 w-6" />
                      ) : (
                        <Medal className="h-5 w-5" />
                      )}
                    </div>
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-xl font-bold mb-2"
                      style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                    >
                      {entry.nombre.charAt(0)}
                    </div>
                    <div className="font-semibold truncate" style={{ color: theme.text }}>
                      {entry.nombre}
                      {entry.user_id === user?.id && (
                        <span className="ml-1 text-xs">(Vos)</span>
                      )}
                    </div>
                    <div className="text-2xl font-bold mt-1" style={{ color: colors[entry.posicion - 1] }}>
                      {entry.puntos.toLocaleString()}
                    </div>
                    <div className="text-xs" style={{ color: theme.textSecondary }}>
                      {entry.reclamos} reclamos
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resto del leaderboard */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
            {leaderboard.slice(3).map((entry, idx) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-4 p-4 transition-colors ${idx !== leaderboard.length - 4 ? 'border-b' : ''}`}
                style={{
                  borderColor: theme.border,
                  backgroundColor: entry.user_id === user?.id ? `${theme.primary}10` : 'transparent',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: theme.background, color: theme.textSecondary }}
                >
                  {entry.posicion}
                </div>

                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                  style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
                >
                  {entry.nombre.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" style={{ color: theme.text }}>
                    {entry.nombre}
                    {entry.user_id === user?.id && (
                      <span
                        className="ml-2 text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: theme.primary, color: '#fff' }}
                      >
                        Vos
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: theme.textSecondary }}>
                    {entry.reclamos} reclamos · {entry.badges} badges
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color: theme.primary }}>
                    {entry.puntos.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'recompensas' && (
        <div className="space-y-4">
          {/* Header con puntos disponibles */}
          <div
            className="rounded-2xl p-5 flex items-center justify-between"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <div>
              <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
                Canjear Premios
              </h2>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                Usá tus puntos para obtener recompensas
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5" style={{ color: CHART_COLORS[3] }} />
                <span className="text-2xl font-bold" style={{ color: theme.text }}>
                  {perfil?.puntos.puntos_totales.toLocaleString()}
                </span>
              </div>
              <div className="text-xs" style={{ color: theme.textSecondary }}>
                puntos disponibles
              </div>
            </div>
          </div>

          {recompensas.length === 0 ? (
            <div
              className="rounded-2xl p-12 text-center"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${theme.textSecondary}15` }}
              >
                <Gift className="h-8 w-8" style={{ color: theme.textSecondary }} />
              </div>
              <p className="font-medium" style={{ color: theme.text }}>
                No hay premios disponibles
              </p>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                Pronto habrá recompensas para canjear
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {recompensas.map((recompensa, idx) => {
                const puedesCanjear = (perfil?.puntos.puntos_totales || 0) >= recompensa.puntos_requeridos;
                const progress = Math.min(((perfil?.puntos.puntos_totales || 0) / recompensa.puntos_requeridos) * 100, 100);

                return (
                  <div
                    key={recompensa.id}
                    className="rounded-2xl p-5 transition-all hover:scale-[1.01]"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}15`,
                          color: CHART_COLORS[idx % CHART_COLORS.length]
                        }}
                      >
                        <Gift className="h-7 w-7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold" style={{ color: theme.text }}>
                          {recompensa.nombre}
                        </h3>
                        {recompensa.descripcion && (
                          <p className="text-sm mt-1 line-clamp-2" style={{ color: theme.textSecondary }}>
                            {recompensa.descripcion}
                          </p>
                        )}

                        {/* Progress bar hacia el premio */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span style={{ color: theme.textSecondary }}>
                              {puedesCanjear ? 'Disponible' : `${Math.round(progress)}% completado`}
                            </span>
                            <span className="font-semibold" style={{ color: CHART_COLORS[idx % CHART_COLORS.length] }}>
                              {recompensa.puntos_requeridos.toLocaleString()} pts
                            </span>
                          </div>
                          <div
                            className="h-2 rounded-full overflow-hidden"
                            style={{ backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}20` }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: CHART_COLORS[idx % CHART_COLORS.length]
                              }}
                            />
                          </div>
                        </div>

                        {recompensa.stock !== null && (
                          <div className="mt-2 text-xs" style={{ color: theme.textSecondary }}>
                            {recompensa.stock} unidades disponibles
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => canjearRecompensa(recompensa.id)}
                      disabled={!puedesCanjear}
                      className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: puedesCanjear ? theme.primary : theme.background,
                        color: puedesCanjear ? '#fff' : theme.textSecondary,
                      }}
                    >
                      {puedesCanjear ? 'Canjear Premio' : `Necesitás ${(recompensa.puntos_requeridos - (perfil?.puntos.puntos_totales || 0)).toLocaleString()} pts más`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
