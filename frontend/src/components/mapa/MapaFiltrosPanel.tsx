import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  ChevronDown,
  Clock,
  Filter,
  Flame,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Square,
  Tag,
  X,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

// =====================================================================
// Tipos públicos (los re-exporta el padre)
// =====================================================================
export type ViewMode = 'pins' | 'heat' | 'both';
export type TimePreset = '7' | '30' | '90' | '365' | 'all';

export interface CategoriaItem {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface DependenciaItem {
  id: number;
  nombre: string;
  color: string;
  count: number;
}

export interface MapaFiltrosState {
  filtroCategoria: string | null;
  filtroEstado: string | null;
  filtroDependencia: number | null;
  timePreset: TimePreset;
  viewMode: ViewMode;
  showHotspots: boolean;
  showCoverage: boolean;
}

interface MapaFiltrosPanelProps {
  // Catálogos
  categoriasDisponibles: CategoriaItem[];
  dependenciasDisponibles: DependenciaItem[];
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  conteosPorEstado: Record<string, number>;

  // Totales informativos
  totalReclamos: number;
  totalEnRangoTiempo: number;
  hotspotsCount: number;

  // Estado
  filtroCategoria: string | null;
  filtroEstado: string | null;
  filtroDependencia: number | null;
  timePreset: TimePreset;
  viewMode: ViewMode;
  showHotspots: boolean;
  showCoverage: boolean;

  // Setters / handlers
  onCategoriaChange: (key: string | null) => void;
  onEstadoChange: (estado: string | null) => void;
  onDependenciaChange: (id: number | null) => void;
  onTimePresetChange: (p: TimePreset) => void;
  onViewModeChange: (m: ViewMode) => void;
  onToggleHotspots: () => void;
  onToggleCoverage: () => void;
  onClearAll: () => void;

  // Time-lapse
  isPlaying: boolean;
  hasDateRange: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;

  // Dibujo
  drawMode: boolean;
  onToggleDraw: () => void;

  // Animación banda
  animationDate: Date | null;
  animationDay: number;
  totalAnimationDays: number;
  reclamosFiltradosCount: number;

  // Persistencia open/closed
  storageKey?: string;
  openStorageKey?: string;
}

const DEFAULT_OPEN_KEY = 'mapa_filtros_open';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : true,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    // addEventListener para navegadores modernos; fallback addListener
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, []);
  return isDesktop;
}

// Helper para leer/escribir el estado open del panel sin romper si el JSON es invalido
function readOpenPref(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : null;
  } catch {
    return null;
  }
}
function writeOpenPref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

// =====================================================================
// Componente principal
// =====================================================================
export default function MapaFiltrosPanel(props: MapaFiltrosPanelProps) {
  const { theme } = useTheme();
  const isDesktop = useIsDesktop();
  const openKey = props.openStorageKey || DEFAULT_OPEN_KEY;

  // Default open = desktop ; el user puede sobreescribir con su preferencia persistida
  const [userTouched, setUserTouched] = useState(() => readOpenPref(openKey) !== null);
  const [open, setOpen] = useState<boolean>(() => {
    const stored = readOpenPref(openKey);
    if (stored != null) return stored;
    // default por viewport
    return typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : true;
  });

  // Si cambia el viewport y el user nunca tocó el toggle, seguir el default del viewport
  useEffect(() => {
    if (!userTouched) setOpen(isDesktop);
  }, [isDesktop, userTouched]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      writeOpenPref(openKey, next);
      setUserTouched(true);
      return next;
    });
  };

  // ===================================================================
  // Chips activos (resumen para el header)
  // ===================================================================
  const activeChips = useMemo(() => {
    const list: Array<{
      key: string;
      label: string;
      color: string;
      onClear: () => void;
    }> = [];
    if (props.filtroCategoria) {
      const cat = props.categoriasDisponibles.find(
        (c) => c.key === props.filtroCategoria,
      );
      list.push({
        key: 'cat',
        label: cat?.label || props.filtroCategoria,
        color: cat?.color || theme.primary,
        onClear: () => props.onCategoriaChange(null),
      });
    }
    if (props.filtroEstado) {
      list.push({
        key: 'estado',
        label: props.statusLabels[props.filtroEstado] || props.filtroEstado,
        color: props.statusColors[props.filtroEstado] || theme.primary,
        onClear: () => props.onEstadoChange(null),
      });
    }
    if (props.filtroDependencia != null) {
      const dep = props.dependenciasDisponibles.find(
        (d) => d.id === props.filtroDependencia,
      );
      list.push({
        key: 'dep',
        label: dep?.nombre || `Dependencia #${props.filtroDependencia}`,
        color: dep?.color || theme.primary,
        onClear: () => props.onDependenciaChange(null),
      });
    }
    if (props.timePreset !== 'all') {
      const labelMap: Record<TimePreset, string> = {
        '7': 'Últimos 7d',
        '30': 'Últimos 30d',
        '90': 'Últimos 90d',
        '365': 'Último año',
        all: 'Todo el período',
      };
      list.push({
        key: 'time',
        label: labelMap[props.timePreset],
        color: theme.primary,
        onClear: () => props.onTimePresetChange('all'),
      });
    }
    if (props.viewMode !== 'pins') {
      const labelMap: Record<ViewMode, string> = {
        pins: 'Pins',
        heat: 'Calor',
        both: 'Pins + Calor',
      };
      list.push({
        key: 'view',
        label: labelMap[props.viewMode],
        color: theme.primary,
        onClear: () => props.onViewModeChange('pins'),
      });
    }
    if (!props.showHotspots) {
      list.push({
        key: 'hotspots',
        label: 'Hotspots ocultos',
        color: '#ef4444',
        onClear: () => props.onToggleHotspots(),
      });
    }
    return list;
  }, [
    props.filtroCategoria,
    props.filtroEstado,
    props.filtroDependencia,
    props.timePreset,
    props.viewMode,
    props.showHotspots,
    props.categoriasDisponibles,
    props.dependenciasDisponibles,
    props.statusColors,
    props.statusLabels,
    theme.primary,
  ]);

  const activeCount = activeChips.length;
  const visibleChips = activeChips.slice(0, 2);
  const hiddenChipsCount = Math.max(0, activeChips.length - visibleChips.length);

  // ===================================================================
  // Render
  // ===================================================================
  return (
    <div className="flex flex-col">
      {/* HEADER siempre visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={toggleOpen}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95 flex-shrink-0"
          style={{
            backgroundColor: open ? `${theme.primary}15` : 'transparent',
            border: `1px solid ${open ? theme.primary : theme.border}`,
            color: open ? theme.primary : theme.textSecondary,
          }}
          aria-expanded={open}
          aria-controls="mapa-filtros-body"
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">Filtros</span>
          {activeCount > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: theme.primary,
                color: '#fff',
              }}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              open ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {/* Chips activos resumidos */}
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {visibleChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-200"
                style={{
                  backgroundColor: `${chip.color}18`,
                  color: chip.color,
                  border: `1px solid ${chip.color}40`,
                }}
              >
                <span className="truncate max-w-[140px]">{chip.label}</span>
                <button
                  onClick={chip.onClear}
                  className="rounded-full p-0.5 transition-all duration-150 hover:bg-black/10 active:scale-90"
                  aria-label={`Quitar ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {hiddenChipsCount > 0 && (
              <button
                onClick={() => {
                  if (!open) toggleOpen();
                }}
                className="text-[11px] font-medium px-2 py-1 rounded-md transition-all duration-200 hover:opacity-80"
                style={{
                  color: theme.textSecondary,
                  backgroundColor: `${theme.textSecondary}10`,
                  border: `1px solid ${theme.border}`,
                }}
              >
                …+{hiddenChipsCount} más
              </button>
            )}
            <button
              onClick={props.onClearAll}
              className="text-[11px] font-semibold px-2 py-1 rounded-md transition-all duration-200 active:scale-95"
              style={{
                color: '#ef4444',
                backgroundColor: '#ef444412',
                border: '1px solid #ef444440',
              }}
            >
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {/* BODY colapsable */}
      {open && (
        <div
          id="mapa-filtros-body"
          className="flex flex-col gap-2 mt-3 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Fila 1: Categorías */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => props.onCategoriaChange(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
              style={{
                backgroundColor:
                  props.filtroCategoria === null
                    ? theme.primary
                    : `${theme.textSecondary}15`,
                color:
                  props.filtroCategoria === null
                    ? '#ffffff'
                    : theme.textSecondary,
                border: `1px solid ${
                  props.filtroCategoria === null ? theme.primary : theme.border
                }`,
              }}
            >
              <Tag className="h-3 w-3" />
              <span className="text-xs font-medium">Todas las categorías</span>
              <span className="text-xs font-bold">({props.totalReclamos})</span>
            </button>
            {props.categoriasDisponibles.map((cat) => {
              const isActive = props.filtroCategoria === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() =>
                    props.onCategoriaChange(isActive ? null : cat.key)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
                  style={{
                    backgroundColor: isActive ? cat.color : `${cat.color}15`,
                    color: isActive ? '#ffffff' : cat.color,
                    border: `1px solid ${isActive ? cat.color : `${cat.color}40`}`,
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? '#ffffff' : cat.color,
                    }}
                  />
                  <span className="text-xs font-medium">{cat.label}</span>
                  <span className="text-xs font-bold">({cat.count})</span>
                </button>
              );
            })}
          </div>

          <div
            className="h-px w-full"
            style={{ backgroundColor: theme.border }}
          />

          {/* Fila 2: Estados */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => props.onEstadoChange(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
              style={{
                backgroundColor:
                  props.filtroEstado === null
                    ? theme.primary
                    : `${theme.textSecondary}15`,
                color:
                  props.filtroEstado === null
                    ? '#ffffff'
                    : theme.textSecondary,
                border: `1px solid ${
                  props.filtroEstado === null ? theme.primary : theme.border
                }`,
              }}
            >
              <span className="text-xs font-medium">Todos los estados</span>
              <span className="text-xs font-bold">
                ({props.totalEnRangoTiempo})
              </span>
            </button>
            {Object.entries(props.statusColors).map(([estado, color]) => {
              const count = props.conteosPorEstado[estado] || 0;
              if (count === 0) return null;
              const isActive = props.filtroEstado === estado;
              return (
                <button
                  key={estado}
                  onClick={() =>
                    props.onEstadoChange(isActive ? null : estado)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
                  style={{
                    backgroundColor: isActive ? color : `${color}15`,
                    color: isActive ? '#ffffff' : color,
                    border: `1px solid ${isActive ? color : `${color}40`}`,
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: isActive ? '#ffffff' : color }}
                  />
                  <span className="text-xs font-medium">
                    {props.statusLabels[estado] || estado}
                  </span>
                  <span className="text-xs font-bold">({count})</span>
                </button>
              );
            })}
          </div>

          {props.dependenciasDisponibles.length > 0 && (
            <>
              <div
                className="h-px w-full"
                style={{ backgroundColor: theme.border }}
              />
              {/* Fila 3: Dependencias */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => props.onDependenciaChange(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
                  style={{
                    backgroundColor:
                      props.filtroDependencia === null
                        ? theme.primary
                        : `${theme.textSecondary}15`,
                    color:
                      props.filtroDependencia === null
                        ? '#ffffff'
                        : theme.textSecondary,
                    border: `1px solid ${
                      props.filtroDependencia === null
                        ? theme.primary
                        : theme.border
                    }`,
                  }}
                >
                  <Building2 className="h-3 w-3" />
                  <span className="text-xs font-medium">
                    Todas las dependencias
                  </span>
                </button>
                {props.dependenciasDisponibles.map((d) => {
                  const isActive = props.filtroDependencia === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() =>
                        props.onDependenciaChange(isActive ? null : d.id)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
                      style={{
                        backgroundColor: isActive ? d.color : `${d.color}15`,
                        color: isActive ? '#ffffff' : d.color,
                        border: `1px solid ${
                          isActive ? d.color : `${d.color}40`
                        }`,
                      }}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: isActive ? '#ffffff' : d.color,
                        }}
                      />
                      <span className="text-xs font-medium">{d.nombre}</span>
                      <span className="text-xs font-bold">({d.count})</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div
            className="h-px w-full"
            style={{ backgroundColor: theme.border }}
          />

          {/* Fila 4: Tiempo + Vista + Hotspots + Cobertura + Dibujar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Time presets */}
            <div
              className="flex items-center gap-1 p-1 rounded-lg"
              style={{
                backgroundColor: `${theme.textSecondary}10`,
                border: `1px solid ${theme.border}`,
              }}
            >
              <Clock
                className="h-3 w-3 mx-1"
                style={{ color: theme.textSecondary }}
              />
              {(['7', '30', '90', '365', 'all'] as TimePreset[]).map((p) => {
                const isActive = props.timePreset === p && !props.isPlaying;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      if (props.isPlaying) props.onPause();
                      props.onTimePresetChange(p);
                    }}
                    className="px-2 py-0.5 rounded text-xs font-medium transition-all duration-200 ease-in-out active:scale-95"
                    style={{
                      backgroundColor: isActive ? theme.primary : 'transparent',
                      color: isActive ? '#fff' : theme.textSecondary,
                    }}
                  >
                    {p === 'all' ? 'Todo' : p === '365' ? '1 año' : `${p}d`}
                  </button>
                );
              })}
            </div>

            {/* Time-lapse controls */}
            <div
              className="flex items-center gap-1 p-1 rounded-lg"
              style={{
                backgroundColor: `${theme.textSecondary}10`,
                border: `1px solid ${theme.border}`,
              }}
            >
              {!props.isPlaying ? (
                <button
                  onClick={props.onPlay}
                  disabled={!props.hasDateRange}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all duration-200 ease-in-out active:scale-95 disabled:opacity-50"
                  style={{ color: theme.primary }}
                  title="Reproducir time-lapse"
                >
                  <Play className="h-3 w-3" />
                  <span className="hidden sm:inline">Time-lapse</span>
                </button>
              ) : (
                <button
                  onClick={props.onPause}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-all duration-200 ease-in-out active:scale-95"
                  style={{ color: theme.primary }}
                >
                  <Pause className="h-3 w-3" />
                  <span className="hidden sm:inline">Pausar</span>
                </button>
              )}
              <button
                onClick={props.onReset}
                className="px-1.5 py-0.5 rounded transition-all duration-200 ease-in-out active:scale-95"
                style={{ color: theme.textSecondary }}
                title="Reiniciar"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>

            {/* View mode toggle */}
            <div
              className="flex items-center gap-1 p-1 rounded-lg"
              style={{
                backgroundColor: `${theme.textSecondary}10`,
                border: `1px solid ${theme.border}`,
              }}
            >
              <Layers
                className="h-3 w-3 mx-1"
                style={{ color: theme.textSecondary }}
              />
              {(['pins', 'heat', 'both'] as ViewMode[]).map((m) => {
                const isActive = props.viewMode === m;
                const label =
                  m === 'pins' ? 'Pins' : m === 'heat' ? 'Calor' : 'Ambos';
                return (
                  <button
                    key={m}
                    onClick={() => props.onViewModeChange(m)}
                    className="px-2 py-0.5 rounded text-xs font-medium transition-all duration-200 ease-in-out active:scale-95"
                    style={{
                      backgroundColor: isActive ? theme.primary : 'transparent',
                      color: isActive ? '#fff' : theme.textSecondary,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Hotspots toggle */}
            <button
              onClick={props.onToggleHotspots}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ease-in-out active:scale-95"
              style={{
                backgroundColor: props.showHotspots
                  ? '#ef444420'
                  : `${theme.textSecondary}10`,
                color: props.showHotspots ? '#ef4444' : theme.textSecondary,
                border: `1px solid ${
                  props.showHotspots ? '#ef4444' : theme.border
                }`,
              }}
            >
              <Flame className="h-3 w-3" />
              Hotspots
              {props.hotspotsCount > 0 && ` (${props.hotspotsCount})`}
            </button>

            {/* Cobertura toggle (solo si hay dependencia activa) */}
            {props.filtroDependencia != null && (
              <button
                onClick={props.onToggleCoverage}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ease-in-out active:scale-95"
                style={{
                  backgroundColor: props.showCoverage
                    ? `${
                        props.dependenciasDisponibles.find(
                          (d) => d.id === props.filtroDependencia,
                        )?.color || theme.primary
                      }20`
                    : `${theme.textSecondary}10`,
                  color: props.showCoverage
                    ? props.dependenciasDisponibles.find(
                        (d) => d.id === props.filtroDependencia,
                      )?.color || theme.primary
                    : theme.textSecondary,
                  border: `1px solid ${
                    props.showCoverage
                      ? props.dependenciasDisponibles.find(
                          (d) => d.id === props.filtroDependencia,
                        )?.color || theme.primary
                      : theme.border
                  }`,
                }}
              >
                <Building2 className="h-3 w-3" />
                Cobertura
              </button>
            )}

            {/* Dibujar zona */}
            <button
              onClick={props.onToggleDraw}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ease-in-out active:scale-95"
              style={{
                backgroundColor: props.drawMode
                  ? theme.primary
                  : `${theme.primary}15`,
                color: props.drawMode ? '#fff' : theme.primary,
                border: `1px solid ${theme.primary}`,
              }}
              title="Dibujar zona en el mapa"
            >
              <Square className="h-3 w-3" />
              {props.drawMode ? 'Dibujando…' : 'Dibujar zona'}
            </button>
          </div>

          {/* Banda de animación */}
          {props.isPlaying && props.animationDate && (
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: `${theme.primary}10`,
                border: `1px solid ${theme.primary}40`,
              }}
            >
              <Calendar
                className="h-4 w-4"
                style={{ color: theme.primary }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: theme.text }}
              >
                Ventana: {props.animationDate.toLocaleDateString('es-AR')} →{' '}
                {new Date(
                  props.animationDate.getTime() + 30 * 86400000,
                ).toLocaleDateString('es-AR')}
              </span>
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: theme.border }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (props.animationDay /
                        Math.max(1, props.totalAnimationDays)) *
                        100,
                    )}%`,
                    backgroundColor: theme.primary,
                  }}
                />
              </div>
              <span
                className="text-xs"
                style={{ color: theme.textSecondary }}
              >
                {props.reclamosFiltradosCount} reclamos
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
