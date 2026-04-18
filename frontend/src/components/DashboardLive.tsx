import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ChevronLeft, ChevronRight, Pause, Play, ClipboardList, AlertCircle,
  Clock, MapPin, TrendingUp, Trophy, Building2, Activity, Sparkles,
  Receipt, FileCheck, Wrench, Lightbulb, Trash2, Construction, BarChart3,
  Bell, Wallet, Zap,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import HeatmapWidget from './ui/HeatmapWidget';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, RadialBarChart, RadialBar } from 'recharts';
import { dashboardApi, analyticsApi } from '../lib/api';

// ============================================================
// Tipos
// ============================================================

interface Stats {
  total: number;
  pendientes?: number;
  hoy?: number;
  esta_semana?: number;
  tiempo_promedio_dias?: number;
}

interface TramitesStats {
  total: number;
  iniciados?: number;
  en_revision?: number;
  en_curso?: number;
  aprobados?: number;
  esta_semana?: number;
}

interface CategoriaData { categoria: string; cantidad: number; }
interface ZonaData { zona: string; cantidad: number; }
interface TendenciaData { fecha: string; cantidad: number; }
interface HeatmapPoint {
  lat: number; lng: number; intensidad: number;
  categoria?: string; color?: string;
}

interface DashboardLiveProps {
  open: boolean;
  onClose: () => void;
  municipioNombre: string;
  stats: Stats | null;
  porCategoria: CategoriaData[];
  porZona: ZonaData[];
  tendencias: TendenciaData[];
  heatmapData: HeatmapPoint[];
}

const SLIDE_DURATION_MS = 10000;

// Hook: cuenta de 0 al target con easing
function useCountUp(target: number, durationMs = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// ============================================================
// Component
// ============================================================

export default function DashboardLive({
  open, onClose, municipioNombre, stats: statsProp, porCategoria: catProp,
  porZona: zonaProp, tendencias: tendProp, heatmapData: heatProp,
}: DashboardLiveProps) {
  const { theme } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(new Date());

  // Fetch fresco cuando se abre el modo Live — así no dependemos del state del
  // Dashboard (que slice-a a 5 zonas y puede estar stale).
  const [stats, setStats] = useState<Stats | null>(statsProp);
  const [tramitesStats, setTramitesStats] = useState<TramitesStats | null>(null);
  const [porCategoria, setPorCategoria] = useState<CategoriaData[]>(catProp || []);
  const [porZona, setPorZona] = useState<ZonaData[]>(zonaProp || []);
  const [tendencias, setTendencias] = useState<TendenciaData[]>(tendProp || []);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>(heatProp || []);

  useEffect(() => {
    if (!open) return;
    // Refrescar todo de la API al abrir
    Promise.all([
      dashboardApi.getStats().then(r => setStats(r.data)).catch(() => {}),
      dashboardApi.getTramitesStats().then(r => setTramitesStats(r.data)).catch(() => {}),
      dashboardApi.getPorCategoria().then(r => setPorCategoria(r.data || [])).catch(() => {}),
      dashboardApi.getPorZona().then(r => setPorZona(r.data || [])).catch(() => {}),
      dashboardApi.getTendencia(30).then(r => setTendencias(r.data || [])).catch(() => {}),
      analyticsApi.getHeatmap().then(r => {
        const puntos = r.data?.puntos || (Array.isArray(r.data) ? r.data : []);
        setHeatmapData(puntos);
      }).catch(() => {}),
    ]);
  }, [open]);

  const slides = [
    {
      key: 'kpis',
      title: 'Resumen general',
      icon: <Activity className="h-7 w-7" />,
      render: () => <KPIsSlide stats={stats} tramitesStats={tramitesStats} theme={theme} />,
    },
    {
      key: 'mapa',
      title: 'Mapa de calor — concentración de reclamos',
      icon: <MapPin className="h-7 w-7" />,
      render: () => <MapaSlide data={heatmapData} theme={theme} />,
    },
    {
      key: 'tendencia-cat',
      title: 'Tendencia y categorías',
      icon: <TrendingUp className="h-7 w-7" />,
      render: () => (
        <DualSlide
          left={{ title: 'Tendencia 30 días', icon: <TrendingUp className="h-5 w-5" />, content: <TendenciaSlide data={tendencias} theme={theme} /> }}
          right={{ title: 'Top categorías', icon: <Trophy className="h-5 w-5" />, content: <CategoriasSlide data={porCategoria} theme={theme} /> }}
          theme={theme}
        />
      ),
    },
    {
      key: 'zonas-est',
      title: 'Distribución territorial',
      icon: <Building2 className="h-7 w-7" />,
      render: () => (
        <DualSlide
          left={{ title: 'Reclamos por zona', icon: <Building2 className="h-5 w-5" />, content: <ZonasSlide data={porZona} theme={theme} /> }}
          right={{ title: 'Por estado', icon: <Activity className="h-5 w-5" />, content: <EstadosSlide stats={stats} theme={theme} /> }}
          theme={theme}
        />
      ),
    },
    {
      key: 'donut-radial',
      title: 'Visión 360° de actividad',
      icon: <Sparkles className="h-7 w-7" />,
      render: () => (
        <QuadSlide
          panels={[
            { title: 'Distribución por estado', icon: <Activity className="h-4 w-4" />, content: <DonutSlide stats={stats} theme={theme} /> },
            { title: 'Top categorías', icon: <Trophy className="h-4 w-4" />, content: <RadialSlide data={porCategoria} theme={theme} /> },
            { title: 'Trámites por estado', icon: <FileCheck className="h-4 w-4" />, content: <TramitesEstadoSlide tramitesStats={tramitesStats} theme={theme} /> },
            { title: 'Actividad últimos 7 días', icon: <TrendingUp className="h-4 w-4" />, content: <MiniTendenciaSlide data={tendencias} theme={theme} /> },
            { title: 'Top zonas', icon: <Building2 className="h-4 w-4" />, content: <MiniZonasSlide data={porZona} theme={theme} /> },
            { title: 'Reclamos vs Trámites', icon: <BarChart3 className="h-4 w-4" />, content: <ComparativaSlide stats={stats} tramitesStats={tramitesStats} theme={theme} /> },
          ]}
          theme={theme}
        />
      ),
    },
    {
      key: 'rendimiento',
      title: 'Rendimiento operativo',
      icon: <Zap className="h-7 w-7" />,
      render: () => (
        <DualSlide
          left={{
            title: 'Tasa de resolución',
            icon: <Trophy className="h-5 w-5" />,
            content: <TasaResolucionSlide stats={stats} theme={theme} />,
          }}
          right={{
            title: 'Volumen por día de la semana',
            icon: <BarChart3 className="h-5 w-5" />,
            content: <DiaSemanaSlide data={tendencias} theme={theme} />,
          }}
          theme={theme}
        />
      ),
    },
  ];

  // Auto-rotate
  useEffect(() => {
    if (!open || paused) return;
    setProgress(0);
    const tickMs = 50;
    const total = SLIDE_DURATION_MS / tickMs;
    let cur = 0;
    const id = setInterval(() => {
      cur++;
      setProgress((cur / total) * 100);
      if (cur >= total) {
        setCurrentSlide(s => (s + 1) % slides.length);
        cur = 0;
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [open, paused, currentSlide, slides.length]);

  // Reloj en vivo
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      if (e.key === 'ArrowRight') setCurrentSlide(s => (s + 1) % slides.length);
      if (e.key === 'ArrowLeft') setCurrentSlide(s => (s - 1 + slides.length) % slides.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, slides.length]);

  if (!open) return null;
  const slide = slides[currentSlide];

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        zIndex: 99999,
        background: `radial-gradient(ellipse at top, ${theme.primary}15 0%, ${theme.background} 50%, ${theme.background} 100%)`,
      }}
    >
      {/* CSS animations inyectadas */}
      <style>{`
        @keyframes liveBgShift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(40px, -30px) scale(1.1); }
          50% { transform: translate(-30px, 40px) scale(0.95); }
          75% { transform: translate(50px, 20px) scale(1.05); }
        }
        @keyframes liveBgShift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-50px, 30px) scale(1.15); }
          66% { transform: translate(40px, -50px) scale(0.9); }
        }
        @keyframes liveGlowPulse {
          0%, 100% { opacity: 0.6; transform: scale(1) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.1) rotate(180deg); }
        }
        @keyframes liveShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes liveParticleFloat {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
          50% { transform: translateY(-30px) translateX(15px); opacity: 0.8; }
        }
        @keyframes liveIconDrift {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0.1; }
          25% { transform: translate(40px, -30px) rotate(8deg); opacity: 0.25; }
          50% { transform: translate(-20px, -60px) rotate(-5deg); opacity: 0.2; }
          75% { transform: translate(-50px, -20px) rotate(12deg); opacity: 0.28; }
          100% { transform: translate(0, 0) rotate(0deg); opacity: 0.1; }
        }
        .live-bg-blob-1 { animation: liveBgShift 18s ease-in-out infinite; }
        .live-bg-blob-2 { animation: liveBgShift2 22s ease-in-out infinite; }
        .live-bg-blob-3 { animation: liveGlowPulse 10s ease-in-out infinite; }
        .live-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          background-size: 200% 100%;
          animation: liveShimmer 3s linear infinite;
        }
        .live-particle { animation: liveParticleFloat 6s ease-in-out infinite; }
        .live-icon { animation: liveIconDrift 12s ease-in-out infinite; }
      `}</style>

      {/* Animated background blobs (3 capas con movimiento) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-[250px] h-[250px] sm:w-[500px] sm:h-[500px] rounded-full blur-3xl opacity-40 live-bg-blob-1"
          style={{ background: `radial-gradient(circle, ${theme.primary} 0%, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-20 -left-20 sm:-bottom-40 sm:-left-40 w-[250px] h-[250px] sm:w-[500px] sm:h-[500px] rounded-full blur-3xl opacity-40 live-bg-blob-2"
          style={{ background: `radial-gradient(circle, ${theme.primaryHover || theme.primary} 0%, transparent 70%)` }}
        />
        <div
          className="absolute top-1/3 left-1/2 w-[150px] h-[150px] sm:w-[300px] sm:h-[300px] rounded-full blur-3xl opacity-30 live-bg-blob-3"
          style={{ background: `radial-gradient(circle, #8b5cf6 0%, transparent 70%)` }}
        />
        {/* Particles flotando - menos en mobile */}
        {[...Array(typeof window !== 'undefined' && window.innerWidth < 640 ? 5 : 12)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full live-particle"
            style={{
              top: `${(i * 7 + 10) % 90}%`,
              left: `${(i * 13 + 5) % 95}%`,
              backgroundColor: i % 3 === 0 ? theme.primary : i % 3 === 1 ? '#8b5cf6' : '#10b981',
              animationDelay: `${i * 0.4}s`,
              boxShadow: `0 0 8px currentColor`,
            }}
          />
        ))}

        {/* Iconos del muni flotando — capa decorativa con drift lento. Se ocultan en mobile para no saturar */}
        <div className="hidden sm:block absolute inset-0">
          {[
            { Icon: ClipboardList, color: '#3b82f6' },
            { Icon: Receipt, color: '#10b981' },
            { Icon: FileCheck, color: '#8b5cf6' },
            { Icon: Wrench, color: '#f59e0b' },
            { Icon: Building2, color: '#06b6d4' },
            { Icon: Lightbulb, color: '#eab308' },
            { Icon: Trash2, color: '#ec4899' },
            { Icon: Construction, color: '#f97316' },
            { Icon: BarChart3, color: '#14b8a6' },
            { Icon: Bell, color: '#6366f1' },
            { Icon: Wallet, color: '#22c55e' },
            { Icon: Zap, color: '#facc15' },
            { Icon: MapPin, color: '#ef4444' },
            { Icon: Trophy, color: '#a855f7' },
          ].map(({ Icon, color }, i) => (
            <div
              key={`icon-${i}`}
              className="absolute live-icon"
              style={{
                top: `${(i * 11 + 7) % 88}%`,
                left: `${(i * 17 + 3) % 92}%`,
                color,
                opacity: 0.18,
                animationDelay: `${i * 0.7}s`,
                animationDuration: `${8 + (i % 5) * 2}s`,
              }}
            >
              <Icon
                style={{
                  width: `${28 + (i % 4) * 12}px`,
                  height: `${28 + (i % 4) * 12}px`,
                  filter: `drop-shadow(0 0 12px ${color})`,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* HEADER */}
      <header
        className="relative z-10 flex-shrink-0 px-3 py-2 sm:px-8 sm:py-4 flex items-center justify-between backdrop-blur-md gap-2"
        style={{
          backgroundColor: `${theme.card}cc`,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500" />
            <div className="absolute inset-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500 animate-ping" />
          </div>
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-red-500 flex-shrink-0">EN VIVO</span>
          <span className="opacity-30 hidden sm:inline">·</span>
          <span className="text-sm sm:text-base font-semibold truncate" style={{ color: theme.text }}>
            <span className="hidden sm:inline">Municipalidad de </span>{municipioNombre}
          </span>
          <span className="opacity-30 hidden md:inline">·</span>
          <span className="text-xs sm:text-sm font-mono tabular-nums hidden md:inline" style={{ color: theme.textSecondary }}>
            {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => setCurrentSlide(s => (s - 1 + slides.length) % slides.length)}
            className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            title="Anterior (←)"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            onClick={() => setPaused(p => !p)}
            className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
            style={{
              backgroundColor: paused ? theme.primary : theme.backgroundSecondary,
              color: paused ? (theme.primaryText || '#fff') : theme.text,
            }}
            title={paused ? 'Reanudar (espacio)' : 'Pausar (espacio)'}
          >
            {paused ? <Play className="h-4 w-4 sm:h-5 sm:w-5" /> : <Pause className="h-4 w-4 sm:h-5 sm:w-5" />}
          </button>
          <button
            onClick={() => setCurrentSlide(s => (s + 1) % slides.length)}
            className="p-1.5 sm:p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text }}
            title="Siguiente (→)"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: theme.primary, color: theme.primaryText || '#fff' }}
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* PROGRESO */}
      <div className="relative z-10 h-1 w-full" style={{ backgroundColor: `${theme.border}80` }}>
        <div
          className="h-full transition-all duration-75"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryHover || theme.primary})`,
            boxShadow: `0 0 12px ${theme.primary}`,
          }}
        />
      </div>

      {/* SLIDE actual */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <div
          key={currentSlide}
          className="absolute inset-0 flex flex-col p-3 sm:p-6 md:p-8 animate-in fade-in slide-in-from-right-12 duration-700"
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-5 md:mb-6 flex-shrink-0">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center animate-in zoom-in-50 duration-500 flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover || theme.primary})`,
                color: theme.primaryText || '#fff',
                boxShadow: `0 8px 24px ${theme.primary}40`,
              }}
            >
              {slide.icon}
            </div>
            <div className="animate-in fade-in slide-in-from-left-4 duration-700 min-w-0">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] opacity-50 font-bold flex items-center gap-2" style={{ color: theme.textSecondary }}>
                <Sparkles className="h-3 w-3" />
                Slide {currentSlide + 1} de {slides.length}
              </p>
              <h2 className="text-lg sm:text-2xl md:text-3xl font-bold mt-0.5 sm:mt-1 truncate" style={{ color: theme.text }}>
                {slide.title}
              </h2>
            </div>
          </div>
          <div className="flex-1 min-h-0">{slide.render()}</div>
        </div>
      </div>

      {/* DOTS */}
      <footer
        className="relative z-10 flex-shrink-0 px-6 py-3 flex items-center justify-center gap-2"
        style={{ backgroundColor: `${theme.card}cc`, borderTop: `1px solid ${theme.border}`, backdropFilter: 'blur(8px)' }}
      >
        {slides.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setCurrentSlide(i)}
            className="h-2 rounded-full transition-all"
            style={{
              width: i === currentSlide ? '40px' : '8px',
              backgroundColor: i === currentSlide ? theme.primary : theme.border,
              boxShadow: i === currentSlide ? `0 0 8px ${theme.primary}` : 'none',
            }}
            aria-label={s.title}
          />
        ))}
      </footer>
    </div>,
    document.body
  );
}

// ============================================================
// Slides
// ============================================================

function KPIsSlide({ stats, tramitesStats, theme }: { stats: Stats | null; tramitesStats: TramitesStats | null; theme: any }) {
  // Tacómetros (fila superior): KPIs con valor de referencia
  const total = stats?.total ?? 0;
  const pendientes = stats?.pendientes ?? 0;
  const semana = stats?.esta_semana ?? 0;
  const tiempoPromedio = stats?.tiempo_promedio_dias ?? 0;

  const gauges = [
    {
      label: 'Reclamos totales',
      value: total,
      max: Math.max(total, 300),
      icon: <ClipboardList className="h-5 w-5" />,
      color: '#3b82f6',
      suffix: '',
    },
    {
      label: 'Pendientes',
      value: pendientes,
      max: Math.max(total || 1, 1),
      icon: <AlertCircle className="h-5 w-5" />,
      color: '#f59e0b',
      suffix: '',
      showPct: true,
    },
    {
      label: 'Esta semana',
      value: semana,
      max: Math.max(semana * 2, 50),
      icon: <TrendingUp className="h-5 w-5" />,
      color: '#8b5cf6',
      suffix: '',
    },
    {
      label: 'Tiempo promedio',
      value: tiempoPromedio,
      max: 30,
      icon: <Clock className="h-5 w-5" />,
      color: '#10b981',
      suffix: 'd',
      inverted: true, // verde cuando es bajo
    },
  ];

  // Cards (fila inferior): resumen de trámites
  const tramPorEstado = (tramitesStats as any)?.por_estado || {};
  const cards = [
    {
      label: 'Trámites totales',
      value: tramitesStats?.total ?? 0,
      icon: <FileCheck className="h-9 w-9" />,
      color: '#06b6d4',
      suffix: '',
      image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?q=80&w=1600',
    },
    {
      label: 'Trámites en curso',
      value: tramPorEstado.en_curso ?? 0,
      icon: <Activity className="h-9 w-9" />,
      color: '#eab308',
      suffix: '',
      image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1600',
    },
    {
      label: 'Trámites finalizados',
      value: tramPorEstado.finalizado ?? 0,
      icon: <Trophy className="h-9 w-9" />,
      color: '#22c55e',
      suffix: '',
      image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?q=80&w=1600',
    },
    {
      label: 'Trámites esta semana',
      value: (tramitesStats as any)?.semana ?? 0,
      icon: <BarChart3 className="h-9 w-9" />,
      color: '#ec4899',
      suffix: '',
      image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 auto-rows-fr gap-2 sm:gap-3 md:gap-4 h-full overflow-y-auto">
      {gauges.map((g, i) => <GaugeKPI key={g.label} item={g} theme={theme} delay={i * 120} />)}
      {cards.map((c, i) => <KPICard key={c.label} item={c} theme={theme} delay={500 + i * 100} />)}
    </div>
  );
}

// Tacómetro semi-circular animado
function GaugeKPI({ item, theme, delay }: { item: any; theme: any; delay: number }) {
  const animated = useCountUp(item.value, 1800);
  const pct = Math.min(1, Math.max(0, item.value / (item.max || 1)));
  // Si está invertido (ej. tiempo promedio), el color cambia: bajo = verde, alto = rojo
  const displayPct = item.inverted ? Math.min(1, item.value / item.max) : pct;
  const R = 70;
  const arcLen = Math.PI * R;
  const offset = arcLen * (1 - displayPct);
  const gradId = `gauge-grad-${item.label.replace(/\s/g, '')}`;
  // Color dinámico si está invertido
  const baseColor = item.inverted
    ? (pct < 0.4 ? '#10b981' : pct < 0.7 ? '#f59e0b' : '#ef4444')
    : item.color;

  return (
    <div
      className="rounded-3xl relative overflow-hidden animate-in fade-in zoom-in-90 duration-700 p-5 flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${baseColor}15 100%)`,
        border: `2px solid ${baseColor}50`,
        animationDelay: `${delay}ms`,
        animationFillMode: 'backwards',
        boxShadow: `0 8px 32px ${baseColor}30, inset 0 1px 0 ${baseColor}20`,
      }}
    >
      {/* Halo rotativo de fondo */}
      <div
        className="absolute -top-16 -right-16 w-52 h-52 rounded-full blur-3xl live-bg-blob-3"
        style={{ background: `radial-gradient(circle, ${baseColor} 0%, transparent 70%)`, opacity: 0.4 }}
      />
      <div className="absolute inset-x-0 top-0 h-px live-shimmer" style={{ opacity: 0.6 }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between flex-shrink-0">
        <p className="text-xs uppercase tracking-wider font-bold" style={{ color: theme.textSecondary }}>
          {item.label}
        </p>
        <div
          className="p-2 rounded-xl backdrop-blur-sm"
          style={{
            background: `linear-gradient(135deg, ${baseColor}30, ${baseColor}10)`,
            color: baseColor,
            border: `1px solid ${baseColor}40`,
          }}
        >
          {item.icon}
        </div>
      </div>

      {/* Gauge SVG */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0">
        <svg viewBox="0 0 200 120" className="w-full max-h-full">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={baseColor} stopOpacity={0.6} />
              <stop offset="100%" stopColor={baseColor} stopOpacity={1} />
            </linearGradient>
            <filter id={`glow-${gradId}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Arco de fondo */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke={theme.border}
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.35"
          />
          {/* Ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const ang = Math.PI * (1 - t);
            const x1 = 100 + Math.cos(ang) * 80;
            const y1 = 100 - Math.sin(ang) * 80;
            const x2 = 100 + Math.cos(ang) * 88;
            const y2 = 100 - Math.sin(ang) * 88;
            return (
              <line key={t} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={theme.textSecondary} strokeWidth="1.5" opacity="0.4" />
            );
          })}
          {/* Arco relleno */}
          <path
            d="M 30 100 A 70 70 0 0 1 170 100"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={arcLen}
            strokeDashoffset={offset}
            filter={`url(#glow-${gradId})`}
            style={{
              transition: 'stroke-dashoffset 1800ms cubic-bezier(0.22, 1, 0.36, 1)',
              transitionDelay: `${delay}ms`,
            }}
          />
        </svg>
        {/* Valor al centro del gauge */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
          <p
            className="text-3xl sm:text-4xl md:text-5xl font-black tabular-nums leading-none"
            style={{
              background: `linear-gradient(135deg, ${baseColor}, ${baseColor}aa)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: `drop-shadow(0 2px 8px ${baseColor}60)`,
            }}
          >
            {animated}{item.suffix}
          </p>
          {item.showPct && (
            <p className="text-xs font-bold tabular-nums mt-0.5" style={{ color: baseColor, opacity: 0.8 }}>
              {(pct * 100).toFixed(0)}% del total
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ item, theme, delay }: { item: any; theme: any; delay: number }) {
  const animatedValue = useCountUp(item.value, 1800);
  return (
    <div
      className="rounded-3xl flex flex-col justify-between relative overflow-hidden animate-in fade-in zoom-in-90 duration-700"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${item.color}15 100%)`,
        border: `2px solid ${item.color}50`,
        animationDelay: `${delay}ms`,
        animationFillMode: 'backwards',
        boxShadow: `0 8px 32px ${item.color}30, inset 0 1px 0 ${item.color}20`,
      }}
    >
      {/* Imagen de fondo temática del card */}
      {item.image && (
        <>
          <img
            src={item.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.18 }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${theme.card}ee 0%, ${theme.card}99 50%, ${item.color}30 100%)`,
            }}
          />
        </>
      )}

      {/* Halo rotativo de fondo */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl live-bg-blob-3"
        style={{ background: `radial-gradient(circle, ${item.color} 0%, transparent 70%)` }}
      />
      {/* Shimmer en borde */}
      <div className="absolute inset-x-0 top-0 h-px live-shimmer" style={{ opacity: 0.6 }} />

      <div className="relative z-10 flex items-start justify-between p-4 sm:p-6 md:p-8 pb-0">
        <p className="text-xs sm:text-sm md:text-base uppercase tracking-wider font-bold truncate" style={{ color: theme.textSecondary }}>
          {item.label}
        </p>
        <div
          className="p-2 sm:p-3 rounded-xl sm:rounded-2xl backdrop-blur-sm flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${item.color}30, ${item.color}10)`,
            color: item.color,
            border: `1px solid ${item.color}40`,
          }}
        >
          {item.icon}
        </div>
      </div>
      <div className="relative z-10 px-4 sm:px-6 md:px-8 pb-4 sm:pb-6 md:pb-8 mt-auto flex items-baseline gap-2">
        <p
          className="text-4xl sm:text-6xl md:text-8xl font-black tabular-nums leading-none"
          style={{
            background: `linear-gradient(135deg, ${item.color}, ${item.color}aa)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: `drop-shadow(0 4px 16px ${item.color}60)`,
          }}
        >
          {animatedValue}
        </p>
        {item.suffix && (
          <p className="text-xl sm:text-3xl md:text-4xl font-bold" style={{ color: item.color }}>
            {item.suffix}
          </p>
        )}
        {item.delta != null && (
          <p
            className="text-sm font-bold ml-auto px-2 py-1 rounded-lg"
            style={{
              backgroundColor: item.delta >= 0 ? '#10b98120' : '#ef444420',
              color: item.delta >= 0 ? '#10b981' : '#ef4444',
            }}
          >
            {item.delta >= 0 ? '↑' : '↓'} {Math.abs(item.delta)}{item.deltaSuffix || '%'}
          </p>
        )}
      </div>
    </div>
  );
}

function MapaSlide({ data, theme }: { data: HeatmapPoint[]; theme: any }) {
  // Heatmap necesita altura concreta para renderizar bien — el wrapper le da `100%`
  // pero algunos navegadores no resuelven bien si el padre es flex. Le forzamos altura.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(600);
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(() => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect && rect.height > 0) setH(rect.height);
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return <EmptyState text="Sin datos de ubicación" theme={theme} />;
  }
  return (
    <div ref={wrapperRef} className="h-full w-full rounded-3xl overflow-hidden" style={{ border: `1px solid ${theme.border}` }}>
      <HeatmapWidget
        data={data}
        height={`${h}px`}
        showLegend={false}
        showMarkers={true}
        expandable={false}
        forceDark
      />
    </div>
  );
}

function TendenciaSlide({ data, theme }: { data: TendenciaData[]; theme: any }) {
  if (!data?.length) return <EmptyState text="Sin datos de tendencia" theme={theme} />;
  const total = data.reduce((s, d) => s + d.cantidad, 0);
  const promedio = Math.round(total / data.length);
  return (
    <div className="rounded-3xl p-8 h-full flex flex-col" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center gap-8 mb-6 flex-shrink-0">
        <Stat label="Total reclamos" value={total} color={theme.primary} />
        <Stat label="Promedio diario" value={promedio} color="#8b5cf6" />
        <Stat label="Días" value={data.length} color="#10b981" />
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
            <defs>
              <linearGradient id="liveTendencia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.primary} stopOpacity={0.6} />
                <stop offset="100%" stopColor={theme.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
            <XAxis dataKey="fecha" stroke={theme.textSecondary} tick={{ fontSize: 14 }} />
            <YAxis stroke={theme.textSecondary} tick={{ fontSize: 14 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: theme.card,
                border: `1px solid ${theme.border}`,
                borderRadius: '12px',
                fontSize: '14px',
              }}
            />
            <Area
              type="monotone"
              dataKey="cantidad"
              stroke={theme.primary}
              strokeWidth={4}
              fill="url(#liveTendencia)"
              animationDuration={2000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const v = useCountUp(value, 1500);
  return (
    <div>
      <p className="text-xs uppercase tracking-wider opacity-60 font-bold">{label}</p>
      <p className="text-4xl font-black tabular-nums" style={{ color }}>{v}</p>
    </div>
  );
}

function CategoriasSlide({ data, theme }: { data: CategoriaData[]; theme: any }) {
  const top = data.slice(0, 8);
  const max = Math.max(...top.map(d => d.cantidad), 1);
  if (!top.length) return <EmptyState text="Sin categorías" theme={theme} />;
  return (
    <div className="space-y-3 h-full overflow-y-auto pr-2">
      {top.map((c, i) => <CatRow key={c.categoria} cat={c} max={max} idx={i} theme={theme} />)}
    </div>
  );
}

function CatRow({ cat, max, idx, theme }: { cat: CategoriaData; max: number; idx: number; theme: any }) {
  const v = useCountUp(cat.cantidad, 1200);
  const pct = (cat.cantidad / max) * 100;
  return (
    <div
      className="rounded-2xl p-5 animate-in fade-in slide-in-from-left-8 duration-700"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
        animationDelay: `${idx * 100}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xl font-bold flex items-center gap-3" style={{ color: theme.text }}>
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
            style={{
              backgroundColor: idx < 3 ? theme.primary : `${theme.primary}30`,
              color: idx < 3 ? (theme.primaryText || '#fff') : theme.primary,
            }}
          >
            {idx + 1}
          </span>
          {cat.categoria}
        </p>
        <p className="text-3xl font-black tabular-nums" style={{ color: theme.primary }}>
          {v}
        </p>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${theme.primary}, ${theme.primaryHover || theme.primary})`,
            transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: `0 0 12px ${theme.primary}80`,
          }}
        />
      </div>
    </div>
  );
}

function ZonasSlide({ data, theme }: { data: ZonaData[]; theme: any }) {
  const containerRef = useAutoScroll();
  const max = data?.length ? Math.max(...data.map(d => d.cantidad), 1) : 1;
  const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#a855f7', '#14b8a6', '#eab308', '#f97316', '#6366f1'];
  if (!data?.length) return <EmptyState text="Sin zonas" theme={theme} />;
  return (
    <div
      ref={containerRef}
      className="grid grid-cols-2 gap-3 h-full overflow-y-auto pr-2"
      style={{ scrollbarWidth: 'thin' }}
    >
      {data.map((z, i) => {
        const color = palette[i % palette.length];
        return <ZonaRow key={z.zona} zona={z} max={max} idx={i} color={color} theme={theme} />;
      })}
    </div>
  );
}

// Hook: auto-scroll suave con pausa en los extremos (loop tipo marquee vertical)
function useAutoScroll(speedPxPerFrame = 0.5, pauseMs = 1500) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId = 0;
    let direction = 1; // 1 = down, -1 = up (we loop by resetting instead)
    let pausedUntil = performance.now() + pauseMs;
    let pointerInside = false;

    const onEnter = () => { pointerInside = true; };
    const onLeave = () => { pointerInside = false; };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);

    const tick = () => {
      if (!el) return;
      const now = performance.now();
      const maxScroll = el.scrollHeight - el.clientHeight;

      if (maxScroll <= 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (pointerInside || now < pausedUntil) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      el.scrollTop += speedPxPerFrame * direction;

      if (el.scrollTop >= maxScroll - 0.5) {
        el.scrollTop = maxScroll;
        pausedUntil = now + pauseMs;
        // smooth reset al top
        setTimeout(() => {
          if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
          pausedUntil = performance.now() + pauseMs;
        }, pauseMs);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [speedPxPerFrame, pauseMs]);
  return ref;
}

function ZonaRow({ zona, max, idx, color, theme }: { zona: ZonaData; max: number; idx: number; color: string; theme: any }) {
  const v = useCountUp(zona.cantidad, 1200);
  const pct = (zona.cantidad / max) * 100;
  return (
    <div
      className="rounded-2xl p-5 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-700"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${color}10 100%)`,
        border: `1.5px solid ${color}40`,
        animationDelay: `${idx * 70}ms`,
        animationFillMode: 'backwards',
        boxShadow: `0 4px 16px ${color}20`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-base font-bold flex items-center gap-2" style={{ color: theme.text }}>
          <Building2 className="h-4 w-4" style={{ color }} />
          {zona.zona}
        </p>
        <p className="text-3xl font-black tabular-nums" style={{ color }}>
          {v}
        </p>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}aa)`,
            transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
      </div>
    </div>
  );
}

function EmptyState({ text, theme }: { text: string; theme: any }) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-2xl" style={{ color: theme.textSecondary }}>{text}</p>
    </div>
  );
}

// ============================================================
// DualSlide — split 2 columnas con encabezado por panel
// ============================================================

// QuadSlide — grid adaptativo (mobile 1 col → tablet 2 → desktop 2/3 según # paneles)
function QuadSlide({
  panels, theme,
}: {
  panels: { title: string; icon: React.ReactNode; content: React.ReactNode }[];
  theme: any;
}) {
  const lgCols = panels.length > 4 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${lgCols} auto-rows-fr gap-3 sm:gap-4 h-full overflow-y-auto`}>
      {panels.map((panel, i) => (
        <div
          key={i}
          className="flex flex-col h-full min-h-0 animate-in fade-in zoom-in-95 duration-700"
          style={{
            animationDelay: `${i * 120}ms`,
            animationFillMode: 'backwards',
          }}
        >
          <div className="flex items-center gap-2 mb-2 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              {panel.icon}
            </div>
            <h3 className="text-base font-bold" style={{ color: theme.text }}>
              {panel.title}
            </h3>
          </div>
          <div className="flex-1 min-h-0">{panel.content}</div>
        </div>
      ))}
    </div>
  );
}

function DualSlide({
  left, right, theme,
}: {
  left: { title: string; icon: React.ReactNode; content: React.ReactNode };
  right: { title: string; icon: React.ReactNode; content: React.ReactNode };
  theme: any;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4 md:gap-6 h-full overflow-y-auto">
      {[left, right].map((panel, i) => (
        <div
          key={i}
          className="flex flex-col h-full min-h-0 animate-in fade-in slide-in-from-bottom-8 duration-700"
          style={{
            animationDelay: `${i * 200}ms`,
            animationFillMode: 'backwards',
          }}
        >
          <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-shrink-0">
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}
            >
              {panel.icon}
            </div>
            <h3 className="text-base sm:text-lg font-bold truncate" style={{ color: theme.text }}>
              {panel.title}
            </h3>
          </div>
          <div className="flex-1 min-h-0">{panel.content}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// EstadosSlide — donut "estilo gráfico" con conteo por estado
// ============================================================

function EstadosSlide({ stats, theme }: { stats: Stats | null; theme: any }) {
  const porEstado = (stats as any)?.por_estado as Record<string, number> | undefined;
  if (!porEstado) return <EmptyState text="Sin datos" theme={theme} />;
  const items: { estado: string; label: string; count: number; color: string }[] = [
    { estado: 'recibido', label: 'Recibido', count: porEstado.recibido || 0, color: '#3b82f6' },
    { estado: 'en_curso', label: 'En curso', count: porEstado.en_curso || 0, color: '#f59e0b' },
    { estado: 'finalizado', label: 'Finalizado', count: porEstado.finalizado || 0, color: '#10b981' },
    { estado: 'pospuesto', label: 'Pospuesto', count: porEstado.pospuesto || 0, color: '#8b5cf6' },
    { estado: 'rechazado', label: 'Rechazado', count: porEstado.rechazado || 0, color: '#ef4444' },
  ].filter(it => it.count > 0);

  const total = items.reduce((s, it) => s + it.count, 0) || 1;
  return (
    <div className="space-y-3 h-full overflow-y-auto pr-2">
      {items.map((it, i) => <EstadoRow key={it.estado} item={it} pct={(it.count / total) * 100} idx={i} theme={theme} />)}
    </div>
  );
}

// Donut chart de estados (Recharts PieChart)
// Mini tendencia: area chart compacto de últimos 7 días con KPIs
function MiniTendenciaSlide({ data, theme }: { data: TendenciaData[]; theme: any }) {
  const last7 = (data || []).slice(-7);
  const total = last7.reduce((s, d) => s + d.cantidad, 0);
  const promedio = last7.length ? Math.round(total / last7.length) : 0;
  const max = last7.length ? Math.max(...last7.map(d => d.cantidad), 1) : 0;
  const pico = last7.find(d => d.cantidad === max);
  const animTotal = useCountUp(total, 1400);
  const animProm = useCountUp(promedio, 1400);
  const animPico = useCountUp(max, 1400);
  if (!data?.length) return <EmptyState text="Sin datos" theme={theme} />;
  return (
    <div
      className="rounded-3xl p-4 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3 flex-shrink-0">
        <MiniStat label="Total" value={animTotal} color={theme.primary} theme={theme} />
        <MiniStat label="Promedio" value={animProm} color="#8b5cf6" theme={theme} />
        <MiniStat label="Pico" value={animPico} color="#10b981" theme={theme} sub={pico?.fecha} />
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={last7} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="miniTendencia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.primary} stopOpacity={0.7} />
                <stop offset="100%" stopColor={theme.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="fecha"
              stroke={theme.textSecondary}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: string) => v?.slice(5) || v}
            />
            <YAxis stroke={theme.textSecondary} tick={{ fontSize: 10 }} width={28} />
            <Tooltip
              contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', fontSize: '12px', color: theme.text }}
              formatter={(v: any) => [`${v}`, 'Reclamos']}
            />
            <Area
              type="monotone"
              dataKey="cantidad"
              stroke={theme.primary}
              strokeWidth={3}
              fill="url(#miniTendencia)"
              animationDuration={1800}
              animationBegin={200}
              dot={{ r: 3, fill: theme.primary, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: theme.primary, stroke: theme.card, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, sub, theme }: { label: string; value: number; color: string; sub?: string; theme: any }) {
  return (
    <div
      className="rounded-xl px-2.5 py-1.5 text-center"
      style={{ background: `${color}15`, border: `1px solid ${color}30` }}
    >
      <p className="text-[9px] uppercase tracking-wider font-bold opacity-70" style={{ color: theme.textSecondary }}>{label}</p>
      <p className="text-xl font-black tabular-nums leading-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-[9px] opacity-60 truncate" style={{ color: theme.textSecondary }}>{sub.slice(5)}</p>}
    </div>
  );
}

// Mini zonas: top 4 zonas con barras compactas y count-up
function MiniZonasSlide({ data, theme }: { data: ZonaData[]; theme: any }) {
  const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];
  const top = (data || []).slice(0, 4);
  const max = top.length ? Math.max(...top.map(d => d.cantidad), 1) : 1;
  const total = top.reduce((s, d) => s + d.cantidad, 0);
  const animTotal = useCountUp(total, 1500);
  if (!data?.length) return <EmptyState text="Sin zonas" theme={theme} />;
  return (
    <div
      className="rounded-3xl p-4 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-60" style={{ color: theme.textSecondary }}>
          Top 4 zonas
        </p>
        <div className="flex items-baseline gap-1">
          <p className="text-2xl font-black tabular-nums leading-none" style={{ color: theme.text }}>{animTotal}</p>
          <p className="text-[10px] font-bold opacity-60" style={{ color: theme.textSecondary }}>reclamos</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 grid grid-rows-4 gap-2">
        {top.map((z, i) => (
          <MiniZonaRow key={z.zona} zona={z} color={palette[i]} pct={(z.cantidad / max) * 100} idx={i} theme={theme} />
        ))}
      </div>
    </div>
  );
}

function MiniZonaRow({ zona, color, pct, idx, theme }: { zona: ZonaData; color: string; pct: number; idx: number; theme: any }) {
  const v = useCountUp(zona.cantidad, 1400);
  return (
    <div
      className="rounded-xl px-3 py-2 flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-700"
      style={{
        background: `linear-gradient(90deg, ${color}18 0%, transparent 100%)`,
        border: `1px solid ${color}30`,
        animationDelay: `${300 + idx * 100}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <Building2 className="h-4 w-4 flex-shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold truncate" style={{ color: theme.text }}>{zona.zona}</p>
          <p className="text-base font-black tabular-nums flex-shrink-0 ml-2" style={{ color }}>{v}</p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.border}80` }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${color}, ${color}aa)`,
              transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
              transitionDelay: `${idx * 80}ms`,
              boxShadow: `0 0 6px ${color}80`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Tasa de resolución — gauge grande con KPIs secundarios
function TasaResolucionSlide({ stats, theme }: { stats: Stats | null; theme: any }) {
  const porEstado = (stats as any)?.por_estado as Record<string, number> | undefined;
  const total = stats?.total || 0;
  const finalizados = (porEstado?.finalizado || 0) + (porEstado?.resuelto || 0);
  const rechazados = porEstado?.rechazado || 0;
  const enCurso = porEstado?.en_curso || 0;
  const pendientes = stats?.pendientes || 0;
  const tasa = total > 0 ? (finalizados / total) * 100 : 0;

  const animTasa = useCountUp(Math.round(tasa), 1800);
  const animFin = useCountUp(finalizados, 1500);
  const animEnCurso = useCountUp(enCurso, 1500);
  const animPend = useCountUp(pendientes, 1500);
  const animRech = useCountUp(rechazados, 1500);

  const pct = Math.min(1, tasa / 100);
  const R = 110;
  const arcLen = Math.PI * R;
  const offset = arcLen * (1 - pct);
  const color = tasa >= 70 ? '#10b981' : tasa >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div
      className="rounded-3xl p-6 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${color}12 100%)`,
        border: `1px solid ${theme.border}`,
        boxShadow: `0 8px 32px ${color}15`,
      }}
    >
      {/* Gauge grande */}
      <div className="flex-1 min-h-0 flex items-center justify-center relative">
        <svg viewBox="0 0 300 180" className="w-full max-h-full">
          <defs>
            <linearGradient id="tasa-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
            <filter id="tasa-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M 40 150 A 110 110 0 0 1 260 150"
            fill="none" stroke={theme.border} strokeWidth="22" strokeLinecap="round" opacity="0.35"
          />
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const ang = Math.PI * (1 - t);
            const x1 = 150 + Math.cos(ang) * 125;
            const y1 = 150 - Math.sin(ang) * 125;
            const x2 = 150 + Math.cos(ang) * 138;
            const y2 = 150 - Math.sin(ang) * 138;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={theme.textSecondary} strokeWidth="2" opacity="0.5" />;
          })}
          <path
            d="M 40 150 A 110 110 0 0 1 260 150"
            fill="none" stroke="url(#tasa-grad)" strokeWidth="22" strokeLinecap="round"
            strokeDasharray={arcLen} strokeDashoffset={offset}
            filter="url(#tasa-glow)"
            style={{ transition: 'stroke-dashoffset 1800ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
          <text x="150" y="130" textAnchor="middle"
            style={{
              fontSize: '64px', fontWeight: 900, fill: color,
              filter: `drop-shadow(0 4px 12px ${color}80)`,
            }}
          >{animTasa}<tspan style={{ fontSize: '32px' }}>%</tspan></text>
          <text x="150" y="165" textAnchor="middle"
            style={{ fontSize: '13px', fontWeight: 700, fill: theme.textSecondary, letterSpacing: '2px' }}
          >RESOLUCIÓN</text>
        </svg>
      </div>

      {/* Mini KPIs debajo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 flex-shrink-0">
        <MiniStatBig label="Finalizados" value={animFin} color="#10b981" theme={theme} />
        <MiniStatBig label="En curso" value={animEnCurso} color="#f59e0b" theme={theme} />
        <MiniStatBig label="Pendientes" value={animPend} color="#3b82f6" theme={theme} />
        <MiniStatBig label="Rechazados" value={animRech} color="#ef4444" theme={theme} />
      </div>
    </div>
  );
}

function MiniStatBig({ label, value, color, theme }: { label: string; value: number; color: string; theme: any }) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
      style={{ background: `${color}15`, border: `1px solid ${color}30` }}
    >
      <p className="text-[10px] uppercase tracking-wider font-bold opacity-70" style={{ color: theme.textSecondary }}>{label}</p>
      <p className="text-2xl font-black tabular-nums leading-tight" style={{ color }}>{value}</p>
    </div>
  );
}

// Volumen por día de semana — barras verticales con picos destacados
function DiaSemanaSlide({ data, theme }: { data: TendenciaData[]; theme: any }) {
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const bucket = DIAS.map((d) => ({ dia: d, cantidad: 0 }));
  (data || []).forEach((t) => {
    const d = new Date(t.fecha);
    if (!isNaN(d.getTime())) {
      bucket[d.getDay()].cantidad += t.cantidad;
    }
  });
  const max = Math.max(...bucket.map(b => b.cantidad), 1);
  const total = bucket.reduce((s, b) => s + b.cantidad, 0);
  const peak = bucket.reduce((p, c) => c.cantidad > p.cantidad ? c : p, bucket[0]);
  const animTotal = useCountUp(total, 1500);
  if (!data?.length) return <EmptyState text="Sin datos" theme={theme} />;

  return (
    <div
      className="rounded-3xl p-4 sm:p-6 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3 sm:mb-4 flex-shrink-0 gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] font-bold opacity-60" style={{ color: theme.textSecondary }}>
            Últimos 30 días
          </p>
          <p className="text-2xl sm:text-4xl font-black tabular-nums leading-none mt-1" style={{ color: theme.text }}>{animTotal}</p>
          <p className="text-[10px] sm:text-[11px] font-semibold opacity-60 mt-0.5" style={{ color: theme.textSecondary }}>reclamos totales</p>
        </div>
        <div
          className="rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 flex-shrink-0"
          style={{ background: `${theme.primary}18`, border: `1px solid ${theme.primary}40` }}
        >
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wider font-bold opacity-70" style={{ color: theme.textSecondary }}>Pico</p>
          <p className="text-base sm:text-xl font-black" style={{ color: theme.primary }}>{peak.dia}</p>
          <p className="text-[10px] sm:text-xs font-bold tabular-nums" style={{ color: theme.primary, opacity: 0.8 }}>{peak.cantidad}</p>
        </div>
      </div>

      {/* Barras */}
      <div className="flex-1 min-h-0 flex items-end gap-2">
        {bucket.map((b, i) => {
          const h = (b.cantidad / max) * 100;
          const isPeak = b.cantidad === max && max > 0;
          const color = isPeak ? theme.primary : theme.primary;
          const opacity = isPeak ? 1 : 0.55;
          return (
            <div key={b.dia} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 min-w-0">
              <p className="text-sm font-black tabular-nums" style={{ color: isPeak ? theme.primary : theme.text }}>
                {b.cantidad}
              </p>
              <div className="w-full flex-1 flex flex-col justify-end relative">
                <div
                  className="w-full rounded-t-lg animate-in slide-in-from-bottom-4 duration-1000"
                  style={{
                    height: `${h}%`,
                    background: `linear-gradient(180deg, ${color} 0%, ${color}aa 100%)`,
                    opacity,
                    boxShadow: isPeak ? `0 0 20px ${color}80, 0 -4px 12px ${color}60` : 'none',
                    animationDelay: `${200 + i * 80}ms`,
                    animationFillMode: 'backwards',
                    transition: 'height 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                />
                {isPeak && (
                  <div
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                  />
                )}
              </div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: isPeak ? theme.primary : theme.textSecondary }}>
                {b.dia}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Trámites por estado — pie compacto
function TramitesEstadoSlide({ tramitesStats, theme }: { tramitesStats: TramitesStats | null; theme: any }) {
  const porEstado = (tramitesStats as any)?.por_estado as Record<string, number> | undefined;
  const data = [
    { name: 'Recibido', value: porEstado?.recibido || 0, color: '#3b82f6' },
    { name: 'En curso', value: porEstado?.en_curso || 0, color: '#f59e0b' },
    { name: 'Finalizado', value: porEstado?.finalizado || 0, color: '#10b981' },
    { name: 'Pospuesto', value: porEstado?.pospuesto || 0, color: '#8b5cf6' },
    { name: 'Rechazado', value: porEstado?.rechazado || 0, color: '#ef4444' },
    { name: 'Pendiente pago', value: porEstado?.pendiente_pago || 0, color: '#06b6d4' },
  ].filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const animTotal = useCountUp(total, 1500);
  if (!data.length) return <EmptyState text="Sin trámites" theme={theme} />;
  return (
    <div
      className="rounded-3xl p-3 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 flex-1 min-h-0 items-center">
        <div className="sm:col-span-2 relative h-[160px] sm:h-full sm:min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((d, i) => (
                  <linearGradient key={i} id={`tram-grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                    <stop offset="100%" stopColor={d.color} stopOpacity={0.7} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={data} cx="50%" cy="50%"
                innerRadius="60%" outerRadius="92%"
                paddingAngle={4} dataKey="value"
                animationDuration={1800} animationBegin={200}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={`url(#tram-grad-${i})`}
                    style={{ filter: `drop-shadow(0 0 6px ${data[i].color}60)` }} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', color: theme.text }}
                formatter={(v: any) => [`${v}`, 'Trámites']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <FileCheck className="h-4 w-4 mb-0.5" style={{ color: theme.primary }} />
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold opacity-60" style={{ color: theme.textSecondary }}>Total</p>
            <p className="text-2xl font-black tabular-nums leading-none mt-0.5" style={{ color: theme.text }}>{animTotal}</p>
          </div>
        </div>
        <div className="sm:col-span-3 space-y-1.5 sm:h-full flex flex-col justify-center">
          {data.map((d, i) => {
            const pct = (d.value / total) * 100;
            return <DonutLegendRow key={d.name} item={d} pct={pct} idx={i} theme={theme} />;
          })}
        </div>
      </div>
    </div>
  );
}

// Comparativa Reclamos vs Trámites — 3 métricas side-by-side
function ComparativaSlide({ stats, tramitesStats, theme }: { stats: Stats | null; tramitesStats: TramitesStats | null; theme: any }) {
  const tramPorEstado = (tramitesStats as any)?.por_estado || {};
  const rows = [
    { label: 'Totales', reclamos: stats?.total || 0, tramites: tramitesStats?.total || 0 },
    { label: 'Esta semana', reclamos: stats?.esta_semana || 0, tramites: (tramitesStats as any)?.semana || 0 },
    { label: 'En curso', reclamos: (stats as any)?.por_estado?.en_curso || 0, tramites: tramPorEstado.en_curso || 0 },
  ];
  const maxAll = Math.max(...rows.flatMap(r => [r.reclamos, r.tramites]), 1);
  const RECL = '#3b82f6';
  const TRAM = '#10b981';
  return (
    <div
      className="rounded-3xl p-3 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="flex items-center justify-center gap-4 mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RECL, boxShadow: `0 0 6px ${RECL}` }} />
          <span className="text-[11px] font-bold" style={{ color: theme.text }}>Reclamos</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TRAM, boxShadow: `0 0 6px ${TRAM}` }} />
          <span className="text-[11px] font-bold" style={{ color: theme.text }}>Trámites</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 grid grid-rows-3 gap-2">
        {rows.map((r, i) => (
          <ComparativaRow key={r.label} row={r} max={maxAll} idx={i} reclColor={RECL} tramColor={TRAM} theme={theme} />
        ))}
      </div>
    </div>
  );
}

function ComparativaRow({ row, max, idx, reclColor, tramColor, theme }: {
  row: { label: string; reclamos: number; tramites: number }; max: number; idx: number;
  reclColor: string; tramColor: string; theme: any;
}) {
  const vR = useCountUp(row.reclamos, 1400);
  const vT = useCountUp(row.tramites, 1400);
  const pctR = (row.reclamos / max) * 100;
  const pctT = (row.tramites / max) * 100;
  return (
    <div
      className="animate-in fade-in slide-in-from-left-4 duration-700"
      style={{ animationDelay: `${300 + idx * 120}ms`, animationFillMode: 'backwards' }}
    >
      <p className="text-[11px] font-bold mb-1" style={{ color: theme.textSecondary }}>{row.label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.border}80` }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pctR}%`,
                background: `linear-gradient(90deg, ${reclColor}, ${reclColor}aa)`,
                transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
                transitionDelay: `${idx * 80}ms`,
                boxShadow: `0 0 6px ${reclColor}80`,
              }}
            />
          </div>
          <p className="text-sm font-black tabular-nums w-10 text-right" style={{ color: reclColor }}>{vR}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.border}80` }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pctT}%`,
                background: `linear-gradient(90deg, ${tramColor}, ${tramColor}aa)`,
                transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
                transitionDelay: `${idx * 80 + 150}ms`,
                boxShadow: `0 0 6px ${tramColor}80`,
              }}
            />
          </div>
          <p className="text-sm font-black tabular-nums w-10 text-right" style={{ color: tramColor }}>{vT}</p>
        </div>
      </div>
    </div>
  );
}

function DonutSlide({ stats, theme }: { stats: Stats | null; theme: any }) {
  const porEstado = (stats as any)?.por_estado as Record<string, number> | undefined;
  const data = [
    { name: 'Recibido', value: porEstado?.recibido || 0, color: '#3b82f6' },
    { name: 'En curso', value: porEstado?.en_curso || 0, color: '#f59e0b' },
    { name: 'Finalizado', value: porEstado?.finalizado || 0, color: '#10b981' },
    { name: 'Pospuesto', value: porEstado?.pospuesto || 0, color: '#8b5cf6' },
    { name: 'Rechazado', value: porEstado?.rechazado || 0, color: '#ef4444' },
  ].filter(d => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const animatedTotal = useCountUp(total, 1500);
  if (!porEstado) return <EmptyState text="Sin datos" theme={theme} />;
  return (
    <div
      className="rounded-3xl p-3 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 flex-1 min-h-0 items-center">
        {/* Donut con total al centro */}
        <div className="sm:col-span-2 relative h-[160px] sm:h-full sm:min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((d, i) => (
                  <linearGradient key={i} id={`donut-grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                    <stop offset="100%" stopColor={d.color} stopOpacity={0.75} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius="60%" outerRadius="92%"
                paddingAngle={4}
                dataKey="value"
                animationDuration={1800}
                animationBegin={200}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={`url(#donut-grad-${i})`}
                    style={{ filter: `drop-shadow(0 0 8px ${data[i].color}60)` }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', color: theme.text }}
                formatter={(v: any) => [`${v} reclamos`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Total al centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[9px] uppercase tracking-[0.2em] opacity-60 font-bold" style={{ color: theme.textSecondary }}>
              Total
            </p>
            <p className="text-3xl font-black tabular-nums leading-none mt-0.5" style={{ color: theme.text }}>
              {animatedTotal}
            </p>
            <p className="text-[10px] mt-0.5 font-semibold opacity-60" style={{ color: theme.textSecondary }}>
              reclamos
            </p>
          </div>
        </div>

        {/* Leyenda con números, barras y % */}
        <div className="sm:col-span-3 space-y-1.5 sm:h-full flex flex-col justify-center">
          {data.map((d, i) => {
            const pct = (d.value / total) * 100;
            return <DonutLegendRow key={d.name} item={d} pct={pct} idx={i} theme={theme} />;
          })}
        </div>
      </div>
    </div>
  );
}

function DonutLegendRow({ item, pct, idx, theme }: { item: { name: string; value: number; color: string }; pct: number; idx: number; theme: any }) {
  const v = useCountUp(item.value, 1400);
  return (
    <div
      className="rounded-lg px-2.5 py-1.5 animate-in fade-in slide-in-from-right-4 duration-700"
      style={{
        background: `linear-gradient(90deg, ${item.color}18 0%, transparent 100%)`,
        border: `1px solid ${item.color}30`,
        animationDelay: `${400 + idx * 120}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }}
          />
          <p className="text-xs font-bold truncate" style={{ color: theme.text }}>{item.name}</p>
        </div>
        <div className="flex items-baseline gap-1 flex-shrink-0">
          <p className="text-base font-black tabular-nums leading-none" style={{ color: item.color }}>{v}</p>
          <p className="text-[10px] font-bold tabular-nums" style={{ color: item.color, opacity: 0.7 }}>
            {pct.toFixed(0)}%
          </p>
        </div>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.border}80` }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${item.color}, ${item.color}aa)`,
            transition: 'width 1400ms cubic-bezier(0.22, 1, 0.36, 1)',
            transitionDelay: `${idx * 80}ms`,
            boxShadow: `0 0 6px ${item.color}80`,
          }}
        />
      </div>
    </div>
  );
}

// Radial bar chart de categorías
function RadialSlide({ data, theme }: { data: CategoriaData[]; theme: any }) {
  const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'];
  const top = (data || []).slice(0, 4).map((d, i) => ({
    name: d.categoria,
    value: d.cantidad,
    fill: palette[i % palette.length],
  }));
  const maxVal = top.length ? Math.max(...top.map(t => t.value), 1) : 1;
  const totalTop = top.reduce((s, t) => s + t.value, 0);
  const animatedTotal = useCountUp(totalTop, 1500);
  if (!data?.length) return <EmptyState text="Sin categorías" theme={theme} />;

  return (
    <div
      className="rounded-3xl p-3 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${theme.card} 60%, ${theme.primary}08 100%)`,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 flex-1 min-h-0 items-center">
        {/* Radial chart con total al centro */}
        <div className="sm:col-span-2 relative h-[160px] sm:h-full sm:min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%" cy="50%"
              innerRadius="30%" outerRadius="100%"
              data={top}
              startAngle={90} endAngle={-270}
              barSize={8}
            >
              <RadialBar
                dataKey="value"
                cornerRadius={20}
                background={{ fill: `${theme.border}50` }}
                animationDuration={1800}
                animationBegin={200}
              />
              <Tooltip
                contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: '12px', color: theme.text }}
                formatter={(v: any, _n: any, p: any) => [`${v} reclamos`, p?.payload?.name]}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Trophy className="h-4 w-4 mb-0.5" style={{ color: theme.primary, opacity: 0.9 }} />
            <p className="text-[9px] uppercase tracking-[0.2em] opacity-60 font-bold" style={{ color: theme.textSecondary }}>
              Top 4
            </p>
            <p className="text-2xl font-black tabular-nums leading-none mt-0.5" style={{ color: theme.text }}>
              {animatedTotal}
            </p>
          </div>
        </div>

        {/* Ranking con números, barras y posición */}
        <div className="sm:col-span-3 space-y-1.5 sm:h-full flex flex-col justify-center">
          {top.map((t, i) => (
            <RadialLegendRow
              key={t.name}
              item={t}
              rank={i + 1}
              pct={(t.value / maxVal) * 100}
              theme={theme}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RadialLegendRow({ item, rank, pct, theme }: { item: { name: string; value: number; fill: string }; rank: number; pct: number; theme: any }) {
  const v = useCountUp(item.value, 1400);
  return (
    <div
      className="rounded-lg px-2.5 py-1.5 animate-in fade-in slide-in-from-right-4 duration-700"
      style={{
        background: `linear-gradient(90deg, ${item.fill}18 0%, transparent 100%)`,
        border: `1px solid ${item.fill}30`,
        animationDelay: `${400 + rank * 100}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
            style={{
              backgroundColor: rank <= 3 ? item.fill : `${item.fill}30`,
              color: rank <= 3 ? '#fff' : item.fill,
              boxShadow: rank <= 3 ? `0 0 8px ${item.fill}80` : 'none',
            }}
          >
            {rank}
          </span>
          <p className="text-xs font-bold truncate" style={{ color: theme.text }}>{item.name}</p>
        </div>
        <p className="text-base font-black tabular-nums leading-none flex-shrink-0" style={{ color: item.fill }}>{v}</p>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.border}80` }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${item.fill}, ${item.fill}aa)`,
            transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
            transitionDelay: `${rank * 80}ms`,
            boxShadow: `0 0 6px ${item.fill}80`,
          }}
        />
      </div>
    </div>
  );
}

function EstadoRow({ item, pct, idx, theme }: { item: { label: string; count: number; color: string }; pct: number; idx: number; theme: any }) {
  const v = useCountUp(item.count, 1300);
  return (
    <div
      className="rounded-2xl p-4 animate-in fade-in slide-in-from-right-8 duration-700"
      style={{
        background: `linear-gradient(135deg, ${theme.card} 0%, ${item.color}10 100%)`,
        border: `1.5px solid ${item.color}40`,
        animationDelay: `${idx * 100}ms`,
        animationFillMode: 'backwards',
        boxShadow: `0 4px 12px ${item.color}25`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-base font-semibold" style={{ color: theme.text }}>
          {item.label}
        </p>
        <div className="flex items-baseline gap-1">
          <p className="text-2xl font-black tabular-nums" style={{ color: item.color }}>{v}</p>
          <p className="text-sm font-bold" style={{ color: item.color, opacity: 0.7 }}>
            {pct.toFixed(0)}%
          </p>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.backgroundSecondary }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${item.color}, ${item.color}aa)`,
            transition: 'width 1500ms cubic-bezier(0.22, 1, 0.36, 1)',
            boxShadow: `0 0 6px ${item.color}80`,
          }}
        />
      </div>
    </div>
  );
}
