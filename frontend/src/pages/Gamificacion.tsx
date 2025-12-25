import { useEffect, useState } from 'react';
import {
  Trophy, Star, Medal, Award, Crown, Shield, Target,
  Eye, Camera, MapPin, Calendar, Sunrise, Moon, Flame,
  Gift, TrendingUp, User, Clock,
  Lightbulb, Droplets, TreeDeciduous, Construction, CheckCircle
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
    totales: number;
    mes_actual: number;
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

  return (
    <div className="space-y-6">
      {/* Header con nivel y puntos */}
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover || theme.primary})` }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mi Progreso</h1>
            <p className="opacity-90">Nivel {perfil?.puntos.nivel}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{perfil?.puntos.totales.toLocaleString()}</div>
            <div className="text-sm opacity-90">puntos totales</div>
          </div>
        </div>

        {/* Barra de progreso al siguiente nivel */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Progreso al nivel {(perfil?.puntos.nivel || 0) + 1}</span>
            <span>{perfil?.puntos.progreso_nivel}/100</span>
          </div>
          <div className="h-3 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${perfil?.puntos.progreso_nivel || 0}%` }}
            />
          </div>
        </div>

        {/* Stats rápidos */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <div className="text-2xl font-bold">{perfil?.estadisticas.reclamos_totales}</div>
            <div className="text-xs opacity-90">Reclamos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{perfil?.badges.length}</div>
            <div className="text-xs opacity-90">Badges</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">#{perfil?.posicion_leaderboard || '-'}</div>
            <div className="text-xs opacity-90">Ranking</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
        {[
          { id: 'perfil', label: 'Mi Perfil', icon: User },
          { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
          { id: 'recompensas', label: 'Recompensas', icon: Gift },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'shadow-sm' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: tab === id ? theme.background : 'transparent',
              color: tab === id ? theme.primary : theme.textSecondary,
            }}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'perfil' && (
        <div className="space-y-6">
          {/* Badges obtenidos */}
          <div className="rounded-xl p-5" style={{ backgroundColor: theme.backgroundSecondary }}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
              <Award className="h-5 w-5" style={{ color: theme.primary }} />
              Mis Badges ({perfil?.badges.length})
            </h2>
            {perfil?.badges.length === 0 ? (
              <p className="text-center py-8" style={{ color: theme.textSecondary }}>
                Todavía no tenés badges. ¡Creá tu primer reclamo para empezar!
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {perfil?.badges.map((badge) => (
                  <div
                    key={badge.tipo}
                    className="p-4 rounded-xl text-center transition-transform hover:scale-105"
                    style={{ backgroundColor: theme.background }}
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
                      style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                    >
                      {BADGE_ICONS[badge.icono] || <Star className="h-6 w-6" />}
                    </div>
                    <div className="font-medium text-sm" style={{ color: theme.text }}>
                      {badge.nombre}
                    </div>
                    <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                      +{badge.puntos_bonus} pts
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Badges por desbloquear */}
          {perfil && perfil.badges_disponibles.length > 0 && (
            <div className="rounded-xl p-5" style={{ backgroundColor: theme.backgroundSecondary }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                <Target className="h-5 w-5" style={{ color: theme.textSecondary }} />
                Por Desbloquear
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {perfil.badges_disponibles.slice(0, 8).map((badge) => (
                  <div
                    key={badge.tipo}
                    className="p-4 rounded-xl text-center opacity-60"
                    style={{ backgroundColor: theme.background }}
                  >
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-2"
                      style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
                    >
                      {BADGE_ICONS[badge.icono] || <Star className="h-6 w-6" />}
                    </div>
                    <div className="font-medium text-sm" style={{ color: theme.text }}>
                      {badge.nombre}
                    </div>
                    <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                      {badge.requisito}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estadísticas detalladas */}
          <div className="rounded-xl p-5" style={{ backgroundColor: theme.backgroundSecondary }}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
              <TrendingUp className="h-5 w-5" style={{ color: theme.primary }} />
              Mis Estadísticas
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Reclamos Creados', value: perfil?.estadisticas.reclamos_totales, icon: Target },
                { label: 'Reclamos Resueltos', value: perfil?.estadisticas.reclamos_resueltos, icon: CheckCircle },
                { label: 'Con Foto', value: perfil?.estadisticas.reclamos_con_foto, icon: Camera },
                { label: 'Con Ubicación', value: perfil?.estadisticas.reclamos_con_ubicacion, icon: MapPin },
                { label: 'Calificaciones', value: perfil?.estadisticas.calificaciones_dadas, icon: Star },
                { label: 'Racha (semanas)', value: perfil?.estadisticas.semanas_consecutivas, icon: Flame },
              ].map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="p-4 rounded-xl flex items-center gap-3"
                  style={{ backgroundColor: theme.background }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: theme.text }}>
                      {value || 0}
                    </div>
                    <div className="text-xs" style={{ color: theme.textSecondary }}>
                      {label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Historial reciente */}
          {perfil && perfil.historial_reciente.length > 0 && (
            <div className="rounded-xl p-5" style={{ backgroundColor: theme.backgroundSecondary }}>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                <Clock className="h-5 w-5" style={{ color: theme.primary }} />
                Actividad Reciente
              </h2>
              <div className="space-y-2">
                {perfil.historial_reciente.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ backgroundColor: theme.background }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                      >
                        +{item.puntos}
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: theme.text }}>
                          {item.descripcion || item.tipo.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs" style={{ color: theme.textSecondary }}>
                          {item.fecha ? new Date(item.fecha).toLocaleDateString() : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="space-y-4">
          {/* Selector de período */}
          <div className="flex gap-2">
            {[
              { id: 'mes', label: 'Este Mes' },
              { id: 'total', label: 'Histórico' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPeriodo(id as 'mes' | 'total')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  periodo === id ? 'shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: periodo === id ? theme.primary : theme.backgroundSecondary,
                  color: periodo === id ? '#fff' : theme.text,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Lista del leaderboard */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
            {leaderboard.map((entry, idx) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-4 p-4 ${idx !== leaderboard.length - 1 ? 'border-b' : ''}`}
                style={{
                  borderColor: theme.border,
                  backgroundColor: entry.user_id === user?.id ? `${theme.primary}10` : 'transparent',
                }}
              >
                {/* Posición */}
                <div className="w-10 text-center">
                  {entry.posicion <= 3 ? (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
                      style={{
                        backgroundColor:
                          entry.posicion === 1 ? '#fbbf24' : entry.posicion === 2 ? '#94a3b8' : '#cd7f32',
                        color: '#fff',
                      }}
                    >
                      {entry.posicion === 1 ? (
                        <Crown className="h-4 w-4" />
                      ) : (
                        <Medal className="h-4 w-4" />
                      )}
                    </div>
                  ) : (
                    <span className="text-lg font-bold" style={{ color: theme.textSecondary }}>
                      {entry.posicion}
                    </span>
                  )}
                </div>

                {/* Avatar y nombre */}
                <div className="flex-1 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                    style={{
                      backgroundColor: theme.primary,
                      color: '#fff',
                    }}
                  >
                    {entry.nombre.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium" style={{ color: theme.text }}>
                      {entry.nombre}
                      {entry.user_id === user?.id && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.primary, color: '#fff' }}>
                          Vos
                        </span>
                      )}
                    </div>
                    <div className="text-xs flex items-center gap-2" style={{ color: theme.textSecondary }}>
                      <span>{entry.reclamos} reclamos</span>
                      <span>|</span>
                      <span>{entry.badges} badges</span>
                    </div>
                  </div>
                </div>

                {/* Puntos */}
                <div className="text-right">
                  <div className="text-xl font-bold" style={{ color: theme.primary }}>
                    {entry.puntos.toLocaleString()}
                  </div>
                  <div className="text-xs" style={{ color: theme.textSecondary }}>
                    puntos
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'recompensas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>
              Canjear Recompensas
            </h2>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: theme.backgroundSecondary }}>
              <Star className="h-4 w-4" style={{ color: theme.primary }} />
              <span className="font-bold" style={{ color: theme.primary }}>
                {perfil?.puntos.totales.toLocaleString()}
              </span>
              <span className="text-sm" style={{ color: theme.textSecondary }}>disponibles</span>
            </div>
          </div>

          {recompensas.length === 0 ? (
            <div
              className="rounded-xl p-8 text-center"
              style={{ backgroundColor: theme.backgroundSecondary }}
            >
              <Gift className="h-12 w-12 mx-auto mb-4" style={{ color: theme.textSecondary }} />
              <p style={{ color: theme.textSecondary }}>
                No hay recompensas disponibles en este momento
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {recompensas.map((recompensa) => {
                const puedesCanjear = (perfil?.puntos.totales || 0) >= recompensa.puntos_requeridos;
                return (
                  <div
                    key={recompensa.id}
                    className="rounded-xl p-5 flex items-center gap-4"
                    style={{ backgroundColor: theme.backgroundSecondary }}
                  >
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
                    >
                      <Gift className="h-7 w-7" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold" style={{ color: theme.text }}>
                        {recompensa.nombre}
                      </h3>
                      {recompensa.descripcion && (
                        <p className="text-sm mt-0.5" style={{ color: theme.textSecondary }}>
                          {recompensa.descripcion}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-bold" style={{ color: theme.primary }}>
                          {recompensa.puntos_requeridos.toLocaleString()} pts
                        </span>
                        {recompensa.stock !== null && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.background, color: theme.textSecondary }}>
                            {recompensa.stock} disponibles
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => canjearRecompensa(recompensa.id)}
                      disabled={!puedesCanjear}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: puedesCanjear ? theme.primary : theme.backgroundSecondary,
                        color: puedesCanjear ? '#fff' : theme.textSecondary,
                      }}
                    >
                      Canjear
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
