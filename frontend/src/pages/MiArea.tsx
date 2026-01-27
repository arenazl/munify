import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  ClipboardList, FileCheck, Clock, CheckCircle, AlertCircle,
  ArrowRight, ArrowUpRight, Activity, Inbox, Timer,
  ChevronRight, Sparkles, Map, BarChart3
} from 'lucide-react';
import { dashboardApi } from '../lib/api';

interface EstadisticasDependencia {
  reclamos: {
    total: number;
    nuevos: number;
    en_proceso: number;
    resueltos: number;
    pendientes: number;
  };
  tramites: {
    total: number;
    iniciados: number;
    en_proceso: number;
    finalizados: number;
    pendientes: number;
  };
}

export default function MiArea() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EstadisticasDependencia | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.dependencia) return;

      try {
        setLoading(true);
        // El backend filtra automáticamente por la dependencia del usuario logueado
        const conteoResponse = await dashboardApi.getConteoEstados();
        const conteoData = conteoResponse.data as Array<{ estado: string; cantidad: number }>;

        const reclamosStats = {
          total: 0,
          nuevos: 0,
          en_proceso: 0,
          resueltos: 0,
          pendientes: 0,
        };

        // Procesar conteos por estado
        conteoData.forEach((item) => {
          reclamosStats.total += item.cantidad;
          if (item.estado === 'nuevo') reclamosStats.nuevos = item.cantidad;
          if (item.estado === 'en_proceso') reclamosStats.en_proceso = item.cantidad;
          if (item.estado === 'resuelto') reclamosStats.resueltos = item.cantidad;
        });
        reclamosStats.pendientes = reclamosStats.total - reclamosStats.resueltos;

        setStats({
          reclamos: reclamosStats,
          tramites: {
            total: 0,
            iniciados: 0,
            en_proceso: 0,
            finalizados: 0,
            pendientes: 0,
          },
        });
      } catch (error) {
        console.error('Error cargando estadísticas:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [user?.dependencia]);

  if (!user?.dependencia) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p style={{ color: theme.textSecondary }}>No tienes una dependencia asignada.</p>
      </div>
    );
  }

  const dependenciaColor = user.dependencia.color || theme.primary;
  const tasaResolucion = stats?.reclamos.total ? Math.round((stats.reclamos.resueltos / stats.reclamos.total) * 100) : 0;

  // Skeleton loading
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ backgroundColor: theme.backgroundSecondary }} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 h-48 rounded-2xl animate-pulse" style={{ backgroundColor: theme.backgroundSecondary }} />
          <div className="h-48 rounded-2xl animate-pulse" style={{ backgroundColor: theme.backgroundSecondary }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Row - Compacto */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStatCard
          label="Pendientes"
          value={stats?.reclamos.pendientes || 0}
          icon={<Inbox className="h-4 w-4" />}
          color="#f59e0b"
          theme={theme}
          trend={stats?.reclamos.nuevos ? `+${stats.reclamos.nuevos} nuevos` : undefined}
        />
        <MiniStatCard
          label="En Proceso"
          value={stats?.reclamos.en_proceso || 0}
          icon={<Timer className="h-4 w-4" />}
          color="#3b82f6"
          theme={theme}
        />
        <MiniStatCard
          label="Resueltos"
          value={stats?.reclamos.resueltos || 0}
          icon={<CheckCircle className="h-4 w-4" />}
          color="#22c55e"
          theme={theme}
          trend={tasaResolucion > 0 ? `${tasaResolucion}% tasa` : undefined}
        />
        <MiniStatCard
          label="Total"
          value={stats?.reclamos.total || 0}
          icon={<Activity className="h-4 w-4" />}
          color={dependenciaColor}
          theme={theme}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Acciones Rápidas - Card Principal */}
        <div
          className="lg:col-span-2 p-5 rounded-2xl"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: theme.text }}>Acciones Rápidas</h2>
            <Sparkles className="h-4 w-4" style={{ color: theme.textSecondary }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <QuickActionCard
              to="/gestion/reclamos-area"
              icon={<ClipboardList className="h-5 w-5" />}
              title="Reclamos"
              subtitle={`${stats?.reclamos.pendientes || 0} pendientes`}
              color={dependenciaColor}
              theme={theme}
            />
            <QuickActionCard
              to="/gestion/tramites-area"
              icon={<FileCheck className="h-5 w-5" />}
              title="Trámites"
              subtitle={`${stats?.tramites.pendientes || 0} pendientes`}
              color="#8b5cf6"
              theme={theme}
            />
            <QuickActionCard
              to="/gestion/mapa"
              icon={<Map className="h-5 w-5" />}
              title="Mapa"
              subtitle="Ver ubicaciones"
              color="#3b82f6"
              theme={theme}
            />
            <QuickActionCard
              to="/gestion/estadisticas-area"
              icon={<BarChart3 className="h-5 w-5" />}
              title="Estadísticas"
              subtitle="Rendimiento"
              color="#22c55e"
              theme={theme}
            />
          </div>
        </div>

        {/* Panel de Estado */}
        <div
          className="p-5 rounded-2xl"
          style={{
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: theme.text }}>Estado del Área</h2>
            <Activity className="h-4 w-4" style={{ color: theme.textSecondary }} />
          </div>

          <div className="space-y-3">
            {/* Barra de progreso visual */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: theme.textSecondary }}>Tasa de resolución</span>
                <span className="font-semibold" style={{ color: dependenciaColor }}>{tasaResolucion}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${dependenciaColor}20` }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(tasaResolucion, 5)}%`,
                    backgroundColor: dependenciaColor,
                  }}
                />
              </div>
            </div>

            {/* Mini stats */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs" style={{ color: theme.textSecondary }}>Nuevos</span>
                </div>
                <span className="text-xl font-bold" style={{ color: theme.text }}>{stats?.reclamos.nuevos || 0}</span>
              </div>
              <div className="p-3 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs" style={{ color: theme.textSecondary }}>Proceso</span>
                </div>
                <span className="text-xl font-bold" style={{ color: theme.text }}>{stats?.reclamos.en_proceso || 0}</span>
              </div>
            </div>

            {/* Link a ver todos */}
            <Link
              to="/gestion/reclamos-area"
              className="flex items-center justify-between p-3 rounded-xl transition-all hover:scale-[1.02]"
              style={{ backgroundColor: `${dependenciaColor}10` }}
            >
              <span className="text-sm font-medium" style={{ color: dependenciaColor }}>Ver todos los reclamos</span>
              <ArrowRight className="h-4 w-4" style={{ color: dependenciaColor }} />
            </Link>
          </div>
        </div>
      </div>

      {/* Trámites Section - Compacto */}
      <div
        className="p-5 rounded-2xl"
        style={{
          backgroundColor: theme.card,
          border: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" style={{ color: '#8b5cf6' }} />
            <h2 className="font-semibold" style={{ color: theme.text }}>Trámites del Área</h2>
          </div>
          <Link
            to="/gestion/tramites-area"
            className="text-xs flex items-center gap-1 hover:underline"
            style={{ color: theme.textSecondary }}
          >
            Ver todos <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <TramiteStatCard
            label="Total"
            value={stats?.tramites.total || 0}
            icon={<FileCheck className="h-4 w-4" />}
            color="#8b5cf6"
            theme={theme}
          />
          <TramiteStatCard
            label="Iniciados"
            value={stats?.tramites.iniciados || 0}
            icon={<AlertCircle className="h-4 w-4" />}
            color="#f59e0b"
            theme={theme}
          />
          <TramiteStatCard
            label="En Proceso"
            value={stats?.tramites.en_proceso || 0}
            icon={<Clock className="h-4 w-4" />}
            color="#3b82f6"
            theme={theme}
          />
          <TramiteStatCard
            label="Finalizados"
            value={stats?.tramites.finalizados || 0}
            icon={<CheckCircle className="h-4 w-4" />}
            color="#22c55e"
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}

// Mini Stat Card - Ultra compacto
interface MiniStatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  theme: any;
  trend?: string;
}

function MiniStatCard({ label, value, icon, color, theme, trend }: MiniStatCardProps) {
  return (
    <div
      className="p-4 rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-transform"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
      }}
    >
      {/* Glow effect */}
      <div
        className="absolute -top-4 -right-4 w-16 h-16 rounded-full blur-2xl opacity-30 group-hover:opacity-50 transition-opacity"
        style={{ backgroundColor: color }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {icon}
          </div>
          {trend && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>
              {trend}
            </span>
          )}
        </div>
        <p className="text-2xl font-bold" style={{ color: theme.text }}>{value}</p>
        <p className="text-xs" style={{ color: theme.textSecondary }}>{label}</p>
      </div>
    </div>
  );
}

// Quick Action Card
interface QuickActionCardProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  theme: any;
}

function QuickActionCard({ to, icon, title, subtitle, color, theme }: QuickActionCardProps) {
  return (
    <Link
      to={to}
      className="group p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] h-[72px]"
      style={{
        backgroundColor: theme.backgroundSecondary,
        border: `1px solid transparent`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}50`;
        e.currentTarget.style.backgroundColor = `${color}08`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.backgroundColor = theme.backgroundSecondary;
      }}
    >
      <div
        className="p-2.5 rounded-xl transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm" style={{ color: theme.text }}>{title}</p>
        <p className="text-xs truncate" style={{ color: theme.textSecondary }}>{subtitle}</p>
      </div>
      <ArrowUpRight
        className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0"
        style={{ color: theme.textSecondary }}
      />
    </Link>
  );
}

// Tramite Stat Card - Minimal
interface TramiteStatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  theme: any;
}

function TramiteStatCard({ label, value, icon, color, theme }: TramiteStatCardProps) {
  return (
    <div
      className="p-3 rounded-xl flex items-center gap-3"
      style={{ backgroundColor: theme.backgroundSecondary }}
    >
      <div
        className="p-2 rounded-lg"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold" style={{ color: theme.text }}>{value}</p>
        <p className="text-xs" style={{ color: theme.textSecondary }}>{label}</p>
      </div>
    </div>
  );
}
