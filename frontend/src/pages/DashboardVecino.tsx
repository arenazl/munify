import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  MapPin,
  ChevronRight,
  Trophy,
  Map,
  Megaphone,
  Calendar,
  Newspaper,
  ClipboardList,
  Sparkles,
  FileCheck,
  XCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  Star,
  BarChart3,
  X,
  Users,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { reclamosApi, configuracionApi, publicoApi } from '../lib/api';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import NotificationPrompt from '../components/NotificationPrompt';
import type { Reclamo, EstadoReclamo } from '../types';

interface MisEstadisticas {
  total: number;
  nuevos: number;
  asignados: number;
  en_proceso: number;
  resueltos: number;
  rechazados: number;
}

interface EstadisticasPublicas {
  total_reclamos: number;
  resueltos: number;
  en_proceso: number;
  nuevos: number;
  tasa_resolucion: number;
  tiempo_promedio_resolucion_dias: number;
  calificacion_promedio: number;
  por_categoria: Array<{ categoria: string; cantidad: number }>;
}

interface DashboardComponente {
  id: string;
  nombre: string;
  visible: boolean;
  orden: number;
}

interface DashboardConfig {
  componentes: DashboardComponente[];
}

// Noticias hardcodeadas del municipio - 3 por cada slot del carrusel (4 slots x 3 = 12 noticias)
const noticiasCarrusel = [
  // Slot 1
  [
    {
      id: 1,
      titulo: 'Obra de pavimentación en Av. San Martín',
      descripcion: 'Se están realizando trabajos de mejoramiento vial en toda la avenida principal.',
      imagen: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=400&h=250&fit=crop',
      fecha: 'Hace 2 días',
      categoria: 'Obras',
    },
    {
      id: 2,
      titulo: 'Repavimentación de calles en Barrio Norte',
      descripcion: 'Continúan los trabajos de bacheo y repavimentación en el sector norte.',
      imagen: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=400&h=250&fit=crop',
      fecha: 'Hace 5 días',
      categoria: 'Obras',
    },
    {
      id: 3,
      titulo: 'Nueva iluminación LED en el centro',
      descripcion: 'Se instalaron más de 200 luminarias LED en el casco céntrico.',
      imagen: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=250&fit=crop',
      fecha: 'Hace 1 semana',
      categoria: 'Obras',
    },
  ],
  // Slot 2
  [
    {
      id: 4,
      titulo: 'Festival gratuito este sábado',
      descripcion: 'Shows en vivo, food trucks y actividades para toda la familia.',
      imagen: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=250&fit=crop',
      fecha: 'Hace 1 día',
      categoria: 'Eventos',
    },
    {
      id: 5,
      titulo: 'Feria de emprendedores locales',
      descripcion: 'Más de 50 emprendedores locales expondrán sus productos.',
      imagen: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=400&h=250&fit=crop',
      fecha: 'Mañana',
      categoria: 'Eventos',
    },
    {
      id: 6,
      titulo: 'Maratón solidaria por el hospital',
      descripcion: 'Inscripciones abiertas para la carrera de 5K y 10K.',
      imagen: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=250&fit=crop',
      fecha: 'Próximo domingo',
      categoria: 'Eventos',
    },
  ],
  // Slot 3
  [
    {
      id: 7,
      titulo: 'Nuevo centro de atención al vecino',
      descripcion: 'Ya está habilitado el nuevo CAV en el barrio San José.',
      imagen: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=250&fit=crop',
      fecha: 'Hoy',
      categoria: 'Servicios',
    },
    {
      id: 8,
      titulo: 'Ampliación de horarios en oficinas',
      descripcion: 'Ahora podés hacer trámites de 7:00 a 19:00 hs.',
      imagen: 'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=400&h=250&fit=crop',
      fecha: 'Desde el lunes',
      categoria: 'Servicios',
    },
    {
      id: 9,
      titulo: 'Nuevo sistema de turnos online',
      descripcion: 'Sacá tu turno desde la app sin hacer filas.',
      imagen: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=250&fit=crop',
      fecha: 'Ya disponible',
      categoria: 'Servicios',
    },
  ],
  // Slot 4
  [
    {
      id: 10,
      titulo: 'Campaña de vacunación gratuita',
      descripcion: 'Vacunas contra la gripe disponibles en todos los centros de salud.',
      imagen: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=250&fit=crop',
      fecha: 'Ayer',
      categoria: 'Salud',
    },
    {
      id: 11,
      titulo: 'Operativo de salud en barrios',
      descripcion: 'Controles médicos gratuitos en distintos puntos de la ciudad.',
      imagen: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop',
      fecha: 'Esta semana',
      categoria: 'Salud',
    },
    {
      id: 12,
      titulo: 'Charlas sobre prevención de dengue',
      descripcion: 'Aprende a eliminar criaderos de mosquitos en tu hogar.',
      imagen: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=250&fit=crop',
      fecha: 'Viernes 18hs',
      categoria: 'Salud',
    },
  ],
];

const estadoColors: Record<EstadoReclamo, { bg: string; text: string }> = {
  nuevo: { bg: '#e5e7eb', text: '#374151' },
  recibido: { bg: '#cffafe', text: '#0e7490' },
  asignado: { bg: '#dbeafe', text: '#1e40af' },
  en_proceso: { bg: '#fef3c7', text: '#92400e' },
  pendiente_confirmacion: { bg: '#ede9fe', text: '#5b21b6' },
  resuelto: { bg: '#d1fae5', text: '#065f46' },
  rechazado: { bg: '#fee2e2', text: '#991b1b' },
};

const estadoLabels: Record<EstadoReclamo, string> = {
  nuevo: 'Nuevo',
  recibido: 'Recibido',
  asignado: 'Asignado',
  en_proceso: 'En Proceso',
  pendiente_confirmacion: 'Pendiente',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

export default function DashboardVecino() {
  const { theme } = useTheme();
  const { user, municipioActual } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [misReclamos, setMisReclamos] = useState<Reclamo[]>([]);
  const [misEstadisticas, setMisEstadisticas] = useState<MisEstadisticas>({
    total: 0,
    nuevos: 0,
    asignados: 0,
    en_proceso: 0,
    resueltos: 0,
    rechazados: 0,
  });
  const [nombreMunicipio, setNombreMunicipio] = useState('');
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [estadisticasPublicas, setEstadisticasPublicas] = useState<EstadisticasPublicas | null>(null);
  const [modalEstadistica, setModalEstadistica] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [reclamosRes, configRes, dashConfigRes, estadisticasRes] = await Promise.all([
        reclamosApi.getMisReclamos(),
        configuracionApi.getPublica('municipio').catch(() => ({ data: {} })),
        configuracionApi.getDashboardConfig('vecino').catch(() => ({ data: { config: null } })),
        publicoApi.getEstadisticas().catch(() => ({ data: null })),
      ]);

      const reclamos = reclamosRes.data as Reclamo[];
      setMisReclamos(reclamos);

      const stats: MisEstadisticas = {
        total: reclamos.length,
        nuevos: reclamos.filter(r => r.estado === 'nuevo').length,
        asignados: reclamos.filter(r => r.estado === 'asignado').length,
        en_proceso: reclamos.filter(r => r.estado === 'en_proceso').length,
        resueltos: reclamos.filter(r => r.estado === 'resuelto').length,
        rechazados: reclamos.filter(r => r.estado === 'rechazado').length,
      };
      setMisEstadisticas(stats);

      if (configRes.data?.nombre_municipio) {
        const nombre = configRes.data.nombre_municipio.replace(/^Municipalidad de\s*/i, '');
        setNombreMunicipio(nombre);
      }

      if (dashConfigRes.data?.config) {
        setDashboardConfig(dashConfigRes.data.config);
      }

      if (estadisticasRes.data) {
        setEstadisticasPublicas(estadisticasRes.data);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const reclamosRecientes = misReclamos
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 3);

  const reclamosPendientes = misReclamos.filter(
    r => r.estado !== 'resuelto' && r.estado !== 'rechazado'
  ).length;

  const isComponentVisible = (componentId: string): boolean => {
    if (!dashboardConfig?.componentes) return true;
    const comp = dashboardConfig.componentes.find(c => c.id === componentId);
    return comp ? comp.visible : true;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: theme.primary }}></div>
      </div>
    );
  }

  const municipioNombre = municipioActual?.nombre?.replace('Municipalidad de ', '')
    || nombreMunicipio
    || localStorage.getItem('municipio_nombre')?.replace('Municipalidad de ', '')
    || 'Mi Municipio';

  const municipioLogo = municipioActual?.logo_url || localStorage.getItem('municipio_logo_url');

  // Stats cards data
  const statsCards = [
    {
      title: 'Total Reclamos',
      value: misEstadisticas.total,
      icon: ClipboardList,
      iconBg: `${theme.primary}20`,
      iconColor: theme.primary,
    },
    {
      title: 'Pendientes',
      value: reclamosPendientes,
      icon: Clock,
      iconBg: '#f59e0b20',
      iconColor: '#f59e0b',
    },
    {
      title: 'Resueltos',
      value: misEstadisticas.resueltos,
      icon: CheckCircle,
      iconBg: '#22c55e20',
      iconColor: '#22c55e',
    },
    {
      title: 'Rechazados',
      value: misEstadisticas.rechazados,
      icon: XCircle,
      iconBg: '#ef444420',
      iconColor: '#ef4444',
    },
  ];

  return (
    <div className="space-y-6">
      <NotificationPrompt delay={2000} />

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl" style={{ minHeight: '180px' }}>
        <div className="absolute inset-0">
          <img
            alt={municipioNombre}
            className="w-full h-full object-cover"
            src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(15, 23, 42, 0.7) 50%, ${theme.backgroundSecondary}90 100%)`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/50 via-transparent to-slate-900/30" />
        </div>

        <div className="relative z-10 p-6 flex items-center gap-5" style={{ minHeight: '180px' }}>
          {municipioLogo && (
            <img
              src={municipioLogo}
              alt={municipioNombre}
              className="h-20 w-20 md:h-24 md:w-24 rounded-2xl object-contain bg-white/10 backdrop-blur p-3 flex-shrink-0"
            />
          )}

          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl mb-1 drop-shadow-lg text-white">
              <span className="font-light">Municipalidad de </span>
              <span className="font-bold">{municipioNombre}</span>
            </h1>
            <p className="text-sm md:text-base mb-3" style={{ color: 'rgba(148, 163, 184, 1)' }}>
              ¡Hola, {user?.nombre}! Bienvenido a tu panel
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'rgba(148, 163, 184, 1)' }}>
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>{misEstadisticas.total} reclamos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{reclamosPendientes} pendientes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>{misEstadisticas.resueltos} resueltos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards - Estilo Glassmorphism */}
      {isComponentVisible('stats') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {statsCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="group relative rounded-2xl p-4 md:p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer overflow-hidden"
                style={{
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(135deg, ${card.iconColor}10 0%, transparent 50%)` }}
                />
                <div
                  className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-300"
                  style={{ backgroundColor: card.iconColor }}
                />
                <div className="relative flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] md:text-xs uppercase tracking-wider font-medium" style={{ color: theme.textSecondary }}>
                      {card.title}
                    </p>
                    <p className="text-2xl md:text-3xl font-black mt-1 tracking-tight" style={{ color: theme.text }}>
                      {card.value}
                    </p>
                  </div>
                  <div
                    className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      backgroundColor: card.iconBg,
                      boxShadow: `0 4px 14px ${card.iconColor}25`
                    }}
                  >
                    <Icon className="h-5 w-5 md:h-6 md:w-6" style={{ color: card.iconColor }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Accesos Rápidos y Explora - en una sola fila */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Accesos Rápidos */}
        <div
          className="relative rounded-xl overflow-hidden"
          style={{ border: `1px solid ${theme.border}` }}
        >
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=2070"
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: 0.06 }}
            />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, ${theme.card}00 0%, ${theme.card} 100%)` }}
            />
          </div>
          <div className="relative z-10 p-3">
            <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: theme.text }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: theme.primary }} />
              Accesos Rápidos
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAccessCard
                theme={theme}
                icon={<AlertCircle className="h-5 w-5" />}
                label="Reclamo"
                color={theme.primary}
                onClick={() => navigate('/gestion/crear-reclamo')}
                animated
              />
              <QuickAccessCard
                theme={theme}
                icon={<FileCheck className="h-5 w-5" />}
                label="Trámite"
                color="#8b5cf6"
                onClick={() => navigate('/gestion/crear-tramite')}
                animated
              />
            </div>
          </div>
        </div>

        {/* Explora */}
        <div
          className="rounded-xl p-3"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: theme.text }}>
            <TrendingUp className="w-3.5 h-3.5" style={{ color: theme.primary }} />
            Explora
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <QuickAccessCard
              theme={theme}
              icon={<ClipboardList className="h-5 w-5" />}
              label="Reclamos"
              color="#3b82f6"
              onClick={() => navigate('/gestion/mis-reclamos')}
              compact
            />
            <QuickAccessCard
              theme={theme}
              icon={<FileText className="h-5 w-5" />}
              label="Trámites"
              color="#06b6d4"
              onClick={() => navigate('/gestion/mis-tramites')}
              compact
            />
            <QuickAccessCard
              theme={theme}
              icon={<Map className="h-5 w-5" />}
              label="Mapa"
              color="#10b981"
              onClick={() => navigate('/gestion/mapa')}
              compact
            />
            <QuickAccessCard
              theme={theme}
              icon={<Trophy className="h-5 w-5" />}
              label="Logros"
              color="#f59e0b"
              onClick={() => navigate('/gestion/logros')}
              compact
            />
          </div>
        </div>
      </div>

      {/* News Feed - Grid 2x2 con carruseles */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
            <Newspaper className="h-5 w-5" style={{ color: theme.primary }} />
            Novedades del Municipio
          </h2>
          <button className="text-sm font-medium" style={{ color: theme.primary }}>
            Ver todas
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {noticiasCarrusel.map((noticias, slotIndex) => (
            <NewsCarouselCard key={slotIndex} noticias={noticias} theme={theme} slotIndex={slotIndex} />
          ))}
        </div>
      </div>

      {/* Estadísticas del Municipio - Versión moderna con gráficos */}
      {estadisticasPublicas && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
              <Activity className="h-5 w-5" style={{ color: theme.primary }} />
              Estadísticas del Municipio
            </h2>
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              Actualizado hoy
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card: Total Reclamos */}
            <button
              onClick={() => setModalEstadistica('total')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, ${theme.primary}, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.primary}15` }}>
                  <Building2 className="w-5 h-5" style={{ color: theme.primary }} />
                </div>
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
                  <ArrowUpRight className="w-3 h-3" />
                  +12%
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.total_reclamos}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Reclamos totales</p>
              {/* Mini gráfico de barras */}
              <div className="flex items-end gap-0.5 mt-3 h-8">
                {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t transition-all group-hover:opacity-100"
                    style={{ height: `${h}%`, backgroundColor: i === 6 ? theme.primary : `${theme.primary}30`, opacity: 0.7 }}
                  />
                ))}
              </div>
            </button>

            {/* Card: Tasa Resolución */}
            <button
              onClick={() => setModalEstadistica('resolucion')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, #22c55e, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#22c55e15' }}>
                  <Target className="w-5 h-5" style={{ color: '#22c55e' }} />
                </div>
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
                  <ArrowUpRight className="w-3 h-3" />
                  +5%
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.tasa_resolucion.toFixed(0)}%</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Tasa de resolución</p>
              {/* Mini gráfico circular */}
              <div className="mt-3 flex justify-center">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" stroke={`${theme.border}`} />
                    <circle
                      cx="20" cy="20" r="16" fill="none" strokeWidth="4" stroke="#22c55e"
                      strokeDasharray={`${estadisticasPublicas.tasa_resolucion} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* Card: Tiempo Promedio */}
            <button
              onClick={() => setModalEstadistica('tiempo')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, #f59e0b, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f59e0b15' }}>
                  <Zap className="w-5 h-5" style={{ color: '#f59e0b' }} />
                </div>
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
                  <ArrowDownRight className="w-3 h-3" />
                  -2 días
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.tiempo_promedio_resolucion_dias.toFixed(1)}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Días promedio</p>
              {/* Mini gráfico de línea */}
              <div className="mt-3 h-8 flex items-end">
                <svg className="w-full h-8" viewBox="0 0 100 32" preserveAspectRatio="none">
                  <path
                    d="M0,28 L15,20 L30,24 L45,16 L60,18 L75,10 L100,8"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,28 L15,20 L30,24 L45,16 L60,18 L75,10 L100,8 L100,32 L0,32 Z"
                    fill="url(#gradientAmber)"
                    opacity="0.2"
                  />
                  <defs>
                    <linearGradient id="gradientAmber" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </button>

            {/* Card: Calificación */}
            <button
              onClick={() => setModalEstadistica('calificacion')}
              className="group relative rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left overflow-hidden"
              style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div className="absolute top-0 right-0 w-20 h-20 opacity-10" style={{ background: `radial-gradient(circle at top right, #eab308, transparent 70%)` }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#eab30815' }}>
                  <Star className="w-5 h-5" style={{ color: '#eab308' }} />
                </div>
                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: '#22c55e' }}>
                  <ArrowUpRight className="w-3 h-3" />
                  +0.3
                </div>
              </div>
              <p className="text-2xl font-bold mb-0.5" style={{ color: theme.text }}>{estadisticasPublicas.calificacion_promedio.toFixed(1)}</p>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Calificación</p>
              {/* Estrellas */}
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="w-4 h-4"
                    fill={star <= Math.round(estadisticasPublicas.calificacion_promedio) ? '#eab308' : 'none'}
                    stroke="#eab308"
                  />
                ))}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Estadísticas */}
      {modalEstadistica && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setModalEstadistica(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: theme.card }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold" style={{ color: theme.text }}>
                {modalEstadistica === 'total' && 'Reclamos del Municipio'}
                {modalEstadistica === 'resolucion' && 'Tasa de Resolución'}
                {modalEstadistica === 'tiempo' && 'Tiempo de Respuesta'}
                {modalEstadistica === 'calificacion' && 'Calificación del Servicio'}
              </h3>
              <button
                onClick={() => setModalEstadistica(null)}
                className="p-2 rounded-full hover:bg-black/10 transition-colors"
              >
                <X className="w-5 h-5" style={{ color: theme.textSecondary }} />
              </button>
            </div>

            {modalEstadistica === 'total' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: `${theme.primary}10` }}>
                    <p className="text-xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.total_reclamos}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Total</p>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#22c55e10' }}>
                    <p className="text-xl font-bold" style={{ color: '#22c55e' }}>{estadisticasPublicas.resueltos}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Resueltos</p>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ backgroundColor: '#f59e0b10' }}>
                    <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>{estadisticasPublicas.en_proceso}</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>En proceso</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Reclamos por mes (últimos 6 meses)</p>
                  <div className="flex items-end gap-2 h-24">
                    {[45, 62, 55, 78, 85, 92].map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-t" style={{ height: `${h}%`, backgroundColor: i === 5 ? theme.primary : `${theme.primary}50` }} />
                        <span className="text-[10px]" style={{ color: theme.textSecondary }}>{['Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene'][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Este mes se recibieron un 12% más de reclamos que el mes anterior. Las categorías más reportadas son: Alumbrado (25%), Baches (20%) y Limpieza (18%).
                </p>
              </div>
            )}

            {modalEstadistica === 'resolucion' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="flex justify-center mb-4">
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 -rotate-90">
                      <circle cx="64" cy="64" r="56" fill="none" strokeWidth="12" stroke={theme.border} />
                      <circle
                        cx="64" cy="64" r="56" fill="none" strokeWidth="12" stroke="#22c55e"
                        strokeDasharray={`${estadisticasPublicas.tasa_resolucion * 3.52} 352`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.tasa_resolucion.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: '#22c55e10' }}>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>{estadisticasPublicas.resueltos}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Resueltos satisfactoriamente</p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ backgroundColor: '#ef444410' }}>
                    <p className="text-lg font-bold" style={{ color: '#ef4444' }}>{estadisticasPublicas.total_reclamos - estadisticasPublicas.resueltos}</p>
                    <p className="text-xs" style={{ color: theme.textSecondary }}>Pendientes de resolución</p>
                  </div>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  La tasa de resolución mejoró un 5% respecto al mes anterior. El objetivo del municipio es alcanzar el 95% para fin de año.
                </p>
              </div>
            )}

            {modalEstadistica === 'tiempo' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <p className="text-4xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.tiempo_promedio_resolucion_dias.toFixed(1)}</p>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>días promedio de resolución</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.backgroundSecondary }}>
                  <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Evolución del tiempo de respuesta</p>
                  <svg className="w-full h-20" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <path
                      d="M0,45 L30,38 L60,42 L90,30 L120,32 L150,22 L200,18"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0,45 L30,38 L60,42 L90,30 L120,32 L150,22 L200,18 L200,60 L0,60 Z"
                      fill="url(#gradientModal)"
                      opacity="0.3"
                    />
                    <defs>
                      <linearGradient id="gradientModal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#22c55e' }}>1.2</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Alumbrado</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>3.5</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Baches</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: '#3b82f6' }}>2.1</p>
                    <p className="text-[10px]" style={{ color: theme.textSecondary }}>Limpieza</p>
                  </div>
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  El tiempo de respuesta se redujo 2 días respecto al trimestre anterior gracias a la optimización de procesos internos.
                </p>
              </div>
            )}

            {modalEstadistica === 'calificacion' && estadisticasPublicas && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <div className="flex justify-center gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="w-8 h-8"
                        fill={star <= Math.round(estadisticasPublicas.calificacion_promedio) ? '#eab308' : 'none'}
                        stroke="#eab308"
                      />
                    ))}
                  </div>
                  <p className="text-3xl font-bold" style={{ color: theme.text }}>{estadisticasPublicas.calificacion_promedio.toFixed(1)}</p>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>de 5 estrellas</p>
                </div>
                <div className="space-y-2">
                  {[
                    { stars: 5, percent: 45 },
                    { stars: 4, percent: 30 },
                    { stars: 3, percent: 15 },
                    { stars: 2, percent: 7 },
                    { stars: 1, percent: 3 },
                  ].map((item) => (
                    <div key={item.stars} className="flex items-center gap-2">
                      <span className="text-xs w-12" style={{ color: theme.textSecondary }}>{item.stars} estrellas</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                        <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: '#eab308' }} />
                      </div>
                      <span className="text-xs w-8 text-right" style={{ color: theme.textSecondary }}>{item.percent}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  El 75% de los vecinos calificó el servicio con 4 o 5 estrellas. Los aspectos mejor valorados son la rapidez y la comunicación.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tus Gestiones - Reclamos y Trámites lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tus Reclamos Vigentes */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm" style={{ color: theme.text }}>
              <Megaphone className="h-4 w-4" style={{ color: theme.primary }} />
              Tus Reclamos
            </h2>
            <button
              onClick={() => navigate('/gestion/mis-reclamos')}
              className="text-xs flex items-center gap-1 font-medium"
              style={{ color: theme.primary }}
            >
              Ver todos <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {reclamosPendientes > 0 ? (
            <div>
              {reclamosRecientes.slice(0, 3).map((reclamo, idx) => {
                const estado = estadoColors[reclamo.estado];
                return (
                  <div
                    key={reclamo.id}
                    onClick={() => navigate('/gestion/mis-reclamos')}
                    className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-black/5"
                    style={{ borderTop: idx > 0 ? `1px solid ${theme.border}` : undefined }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono" style={{ color: theme.textSecondary }}>#{reclamo.id}</span>
                        <span
                          className="px-1.5 py-0.5 text-[9px] font-medium rounded-full"
                          style={{ backgroundColor: estado.bg, color: estado.text }}
                        >
                          {estadoLabels[reclamo.estado]}
                        </span>
                      </div>
                      <p className="font-medium text-xs truncate" style={{ color: theme.text }}>{reclamo.titulo}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${theme.primary}10` }}>
                <CheckCircle className="h-6 w-6" style={{ color: theme.primary }} />
              </div>
              <p className="text-sm font-medium" style={{ color: theme.text }}>Sin reclamos vigentes</p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>Todos tus reclamos fueron resueltos</p>
            </div>
          )}
        </div>

        {/* Tus Trámites Vigentes */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm" style={{ color: theme.text }}>
              <FileCheck className="h-4 w-4" style={{ color: '#8b5cf6' }} />
              Tus Trámites
            </h2>
            <button
              onClick={() => navigate('/gestion/mis-tramites')}
              className="text-xs flex items-center gap-1 font-medium"
              style={{ color: '#8b5cf6' }}
            >
              Ver todos <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {/* Por ahora siempre muestra vacío - se conectará con API de trámites */}
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: '#8b5cf610' }}>
              <FileText className="h-6 w-6" style={{ color: '#8b5cf6' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: theme.text }}>Sin trámites vigentes</p>
            <p className="text-xs mt-1 mb-3" style={{ color: theme.textSecondary }}>No tenés trámites en curso</p>
            <button
              onClick={() => navigate('/gestion/crear-tramite')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}
            >
              Iniciar trámite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick Access Card - Estilo uniforme con opción de animación y compacto
function QuickAccessCard({
  theme,
  icon,
  label,
  color,
  onClick,
  animated = false,
  compact = false,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  animated?: boolean;
  compact?: boolean;
}) {
  if (animated) {
    // Versión vertical compacta con animaciones multicolor
    const secondaryColor = color === '#8b5cf6' ? '#ec4899' : '#f59e0b';

    return (
      <button
        onClick={onClick}
        className="group flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:scale-105 active:scale-95 relative overflow-hidden animated-cta-btn"
        style={{
          background: `linear-gradient(135deg, ${color}15 0%, ${secondaryColor}10 100%)`,
          border: `2px solid transparent`,
        }}
      >
        {/* Borde con gradiente animado */}
        <div
          className="absolute inset-0 rounded-xl animate-gradient-border"
          style={{
            background: `linear-gradient(90deg, ${color}, ${secondaryColor}, ${color})`,
            backgroundSize: '200% 100%',
            padding: '2px',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />

        {/* Efecto aurora */}
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className="absolute inset-0 animate-aurora-1"
            style={{ background: `radial-gradient(ellipse at 30% 30%, ${color}35 0%, transparent 60%)` }}
          />
          <div
            className="absolute inset-0 animate-aurora-2"
            style={{ background: `radial-gradient(ellipse at 70% 70%, ${secondaryColor}25 0%, transparent 60%)` }}
          />
        </div>

        {/* Shine sweep */}
        <div
          className="absolute inset-0 animate-shine-sweep"
          style={{
            background: `linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)`,
            backgroundSize: '200% 100%',
          }}
        />

        {/* Partículas */}
        <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
          <div className="animate-particle-1 absolute w-1 h-1 rounded-full" style={{ backgroundColor: color, top: '15%', left: '20%' }} />
          <div className="animate-particle-2 absolute w-1 h-1 rounded-full" style={{ backgroundColor: secondaryColor, top: '75%', left: '70%' }} />
        </div>

        {/* Icono */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center relative z-10 animate-icon-glow"
          style={{
            background: `linear-gradient(135deg, ${color}50 0%, ${secondaryColor}40 100%)`,
            boxShadow: `0 0 15px ${color}40`,
          }}
        >
          <div className="animate-icon-float" style={{ color: 'white' }}>{icon}</div>
        </div>

        {/* Texto */}
        <span
          className="text-[11px] font-bold relative z-10 animate-text-glow"
          style={{ color: theme.text }}
        >
          {label}
        </span>

        <style>{`
          @keyframes gradient-border {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          @keyframes aurora-1 {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
            50% { transform: translate(5px, -3px) scale(1.1); opacity: 0.9; }
          }
          @keyframes aurora-2 {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
            50% { transform: translate(-5px, 3px) scale(1.15); opacity: 0.7; }
          }
          @keyframes shine-sweep {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @keyframes icon-glow {
            0%, 100% { box-shadow: 0 0 15px ${color}40; transform: scale(1); }
            50% { box-shadow: 0 0 25px ${color}60, 0 0 35px ${secondaryColor}30; transform: scale(1.08); }
          }
          @keyframes icon-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-2px); }
          }
          @keyframes text-glow {
            0%, 100% { text-shadow: 0 0 0 transparent; }
            50% { text-shadow: 0 0 8px ${color}50; }
          }
          @keyframes particle-1 {
            0%, 100% { transform: translate(0, 0); opacity: 0.8; }
            50% { transform: translate(6px, -8px); opacity: 0.3; }
          }
          @keyframes particle-2 {
            0%, 100% { transform: translate(0, 0); opacity: 0.6; }
            50% { transform: translate(-6px, 6px); opacity: 0.2; }
          }
          .animate-gradient-border { animation: gradient-border 3s ease-in-out infinite; }
          .animate-aurora-1 { animation: aurora-1 4s ease-in-out infinite; }
          .animate-aurora-2 { animation: aurora-2 5s ease-in-out infinite 0.5s; }
          .animate-shine-sweep { animation: shine-sweep 3s ease-in-out infinite; }
          .animate-icon-glow { animation: icon-glow 2s ease-in-out infinite; }
          .animate-icon-float { animation: icon-float 2s ease-in-out infinite; }
          .animate-text-glow { animation: text-glow 2s ease-in-out infinite; }
          .animate-particle-1 { animation: particle-1 3s ease-in-out infinite; }
          .animate-particle-2 { animation: particle-2 4s ease-in-out infinite 0.5s; }
          .animated-cta-btn:hover {
            box-shadow: 0 6px 25px ${color}35, 0 3px 12px ${secondaryColor}25;
          }
        `}</style>
      </button>
    );
  }

  // Versión normal sin animación
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center ${compact ? 'gap-1 p-2' : 'gap-2 p-3'} rounded-xl transition-all hover:scale-105 active:scale-95 relative overflow-hidden`}
      style={{ backgroundColor: `${color}10`, border: `1px solid ${color}20` }}
    >
      <div
        className={`${compact ? 'w-9 h-9' : 'w-12 h-12'} rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 relative z-10`}
        style={{ backgroundColor: `${color}20` }}
      >
        <div style={{ color }}>{icon}</div>
      </div>
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-center leading-tight relative z-10`} style={{ color: theme.text }}>
        {label}
      </span>
    </button>
  );
}

// News Carousel Card - Carrusel horizontal con slide (todas las imágenes en fila)
function NewsCarouselCard({
  noticias,
  theme,
  slotIndex,
}: {
  noticias: typeof noticiasCarrusel[0];
  theme: ReturnType<typeof useTheme>['theme'];
  slotIndex: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const categoriaColors: Record<string, string> = {
    Obras: '#f59e0b',
    Eventos: '#8b5cf6',
    Servicios: '#10b981',
    Salud: '#ef4444',
  };

  // Auto-rotate cada 7 segundos
  useEffect(() => {
    const delay = 7000 + slotIndex * 1200;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % noticias.length);
    }, delay);

    return () => clearInterval(interval);
  }, [noticias.length, slotIndex]);

  const noticia = noticias[activeIndex];

  return (
    <div
      className="group rounded-2xl overflow-hidden transition-all hover:shadow-xl cursor-pointer"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {/* Container de imagen con overflow hidden */}
      <div className="relative h-44 md:h-48 overflow-hidden">
        {/* Track horizontal con todas las imágenes */}
        <div
          className="absolute inset-0 flex"
          style={{
            width: `${noticias.length * 100}%`,
            transform: `translateX(-${activeIndex * (100 / noticias.length)}%)`,
            transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {noticias.map((n) => (
            <div
              key={n.id}
              className="relative h-full flex-shrink-0"
              style={{ width: `${100 / noticias.length}%` }}
            >
              <img
                src={n.imagen}
                alt={n.titulo}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Gradiente oscuro en la parte inferior */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

        {/* Badge categoría - arriba izquierda */}
        <span
          className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md"
          style={{
            backgroundColor: `${categoriaColors[noticia.categoria] || theme.primary}90`,
            color: 'white',
            backdropFilter: 'blur(4px)',
          }}
        >
          {noticia.categoria}
        </span>

        {/* Dots de navegación - arriba derecha */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          {noticias.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(idx);
              }}
              className="w-2.5 h-2.5 rounded-full transition-all duration-300 hover:scale-125"
              style={{
                backgroundColor: idx === activeIndex ? 'white' : 'rgba(255,255,255,0.4)',
                transform: idx === activeIndex ? 'scale(1.2)' : 'scale(1)',
                boxShadow: idx === activeIndex ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Título y descripción sobre la imagen */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-bold text-base md:text-lg text-white leading-tight line-clamp-1 drop-shadow-lg">
            {noticia.titulo}
          </h3>
          <p className="text-xs text-white/80 mt-1 line-clamp-1 drop-shadow">
            {noticia.descripcion}
          </p>
        </div>
      </div>

      {/* Footer con fecha */}
      <div className="p-3 flex items-center justify-between" style={{ borderTop: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: theme.textSecondary }}>
          <Clock className="w-3.5 h-3.5" />
          <span>{noticia.fecha}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.primary }}>
          <span>Leer más</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}
