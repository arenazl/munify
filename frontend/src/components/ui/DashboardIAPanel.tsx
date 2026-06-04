import { useEffect, useState } from 'react';
import {
  Sparkles, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle,
  MapPin, Tag, Users, FileText, Wallet, CalendarClock, type LucideIcon,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useIaHabilitada } from '../../hooks/useIaHabilitada';

// =====================================================================
// DashboardIAPanel — panel lateral de "análisis operativo IA".
// Muestra: urgentes + recomendaciones (LLM) + secciones estadísticas (SQL).
// Reutilizable para Reclamos / Trámites / Tesorería.
// =====================================================================

export interface IATip {
  titulo: string;
  descripcion: string;
  accion?: string;
  severidad?: 'alta' | 'media' | 'baja';
  items?: number[];
}

export interface IASeccionItem {
  label: string;
  value: string;
  sub?: string;
  badge?: 'warning' | 'danger' | 'success' | null;
  color?: string;
}

export interface IASeccion {
  key: string;
  titulo: string;
  icono: string;
  color: string;
  items: IASeccionItem[];
}

export interface DashboardIAData {
  urgentes: IATip[];
  recomendaciones: IATip[];
  secciones: IASeccion[];
  generadoEn?: string | null;
}

interface DashboardIAPanelProps {
  data: DashboardIAData | null;
  loading?: boolean;
  title?: string;
  onCollapsedChange?: (collapsed: boolean) => void;
  onTipClick?: (tip: IATip) => void;
}

// Map de iconos por key string que viene del backend
const ICON_MAP: Record<string, LucideIcon> = {
  MapPin, Tag, Users, FileText, Wallet, CalendarClock, AlertTriangle, Sparkles,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Sparkles;
}

export function DashboardIAPanel({
  data,
  loading = false,
  title = 'Panel operativo',
  onCollapsedChange,
  onTipClick,
}: DashboardIAPanelProps) {
  const { theme } = useTheme();
  // Gate central: si el muni tiene la IA desactivada, el panel no se muestra.
  const iaHabilitada = useIaHabilitada();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dashboard_ia_collapsed') !== '0'; } catch { return true; }
  });
  useEffect(() => { onCollapsedChange?.(collapsed); }, [collapsed, onCollapsedChange]);
  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('dashboard_ia_collapsed', next ? '1' : '0'); } catch (e) { void e; }
      return next;
    });
  };

  // Acordeones — TODAS las secciones arrancan abiertas. Si el user las cierra
  // se guarda en el state local pero el default es abierto (key undefined = open).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (k: string) => setOpenSections(s => ({ ...s, [k]: s[k] === false ? true : false }));
  const isSectionOpen = (k: string) => openSections[k] !== false; // default: true

  // Gate de IA: tras declarar todos los hooks (no romper rules-of-hooks).
  if (!iaHabilitada) return null;

  // Colapsado: barra vertical fina
  if (collapsed) {
    const totalTips = (data?.urgentes?.length || 0) + (data?.recomendaciones?.length || 0);
    return (
      <button
        onClick={toggle}
        className="sticky top-0 w-full min-h-[120px] rounded-lg flex flex-col items-center justify-start gap-2 py-3 transition-all hover:shadow-sm"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        title={`Expandir ${title}`}
      >
        <ChevronLeft className="h-3 w-3" style={{ color: theme.textSecondary }} />
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        {totalTips > 0 && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: theme.primary, color: theme.primaryText || '#fff' }}
          >
            {totalTips}
          </span>
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mt-1"
          style={{ color: theme.textSecondary, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {title}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2 sticky top-0 text-[12px]">
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full rounded-lg p-2.5 flex items-center gap-2 transition-all hover:shadow-sm text-left"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold leading-tight" style={{ color: theme.text }}>{title}</div>
          <div className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>
            {loading ? 'Analizando...' : `${(data?.urgentes?.length || 0) + (data?.recomendaciones?.length || 0)} insights`}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
      </button>

      {loading && (
        <div className="rounded-lg p-4 text-center text-[11px]" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
          Analizando datos...
        </div>
      )}

      {/* Urgentes */}
      {!loading && data && data.urgentes && data.urgentes.length > 0 && (
        <AcordeonSeccion
          titulo="Urgente"
          icono={AlertTriangle}
          color="#ef4444"
          open={isSectionOpen('urgentes')}
          onToggle={() => toggleSection('urgentes')}
          badge={data.urgentes.length}
        >
          {data.urgentes.map((t, i) => (
            <TipCard key={`u-${i}`} tip={t} color="#ef4444" onClick={onTipClick} />
          ))}
        </AcordeonSeccion>
      )}

      {/* Recomendaciones */}
      {!loading && data && data.recomendaciones && data.recomendaciones.length > 0 && (
        <AcordeonSeccion
          titulo="Recomendaciones"
          icono={Sparkles}
          color="#f59e0b"
          open={isSectionOpen('recomendaciones')}
          onToggle={() => toggleSection('recomendaciones')}
          badge={data.recomendaciones.length}
        >
          {data.recomendaciones.map((t, i) => (
            <TipCard key={`r-${i}`} tip={t} color="#f59e0b" onClick={onTipClick} />
          ))}
        </AcordeonSeccion>
      )}

      {/* Secciones SQL */}
      {!loading && data && data.secciones && data.secciones.map(s => {
        const Icon = getIcon(s.icono);
        return (
          <AcordeonSeccion
            key={s.key}
            titulo={s.titulo}
            icono={Icon}
            color={s.color}
            open={isSectionOpen(s.key)}
            onToggle={() => toggleSection(s.key)}
            badge={s.items.length}
          >
            {s.items.map((it, i) => (
              <SeccionItemRow key={`${s.key}-${i}`} item={it} sectionColor={s.color} />
            ))}
          </AcordeonSeccion>
        );
      })}
    </div>
  );
}

// =====================================================================
// Sub-componentes
// =====================================================================

function AcordeonSeccion({
  titulo, icono: Icon, color, open, onToggle, badge, children,
}: {
  titulo: string;
  icono: LucideIcon;
  color: string;
  open: boolean;
  onToggle: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <button
        onClick={onToggle}
        className="w-full px-2.5 py-2 flex items-center gap-2 transition-all hover:brightness-105 text-left"
      >
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-3 w-3" style={{ color }} />
        </div>
        <span className="text-[11px] font-bold flex-1 truncate" style={{ color: theme.text }}>{titulo}</span>
        {badge != null && badge > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color}20`, color }}>
            {badge}
          </span>
        )}
        <ChevronDown
          className="h-3 w-3 transition-transform"
          style={{ color: theme.textSecondary, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      {open && <div className="px-2 pb-2 space-y-1.5">{children}</div>}
    </div>
  );
}

function TipCard({ tip, color, onClick }: { tip: IATip; color: string; onClick?: (t: IATip) => void }) {
  const { theme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => onClick?.(tip)}
      className="w-full text-left rounded-md p-2 transition-all hover:brightness-105"
      style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}
    >
      <div className="text-[11px] font-bold leading-tight mb-0.5" style={{ color: theme.text }}>{tip.titulo}</div>
      <div className="text-[10px] leading-snug mb-1" style={{ color: theme.textSecondary }}>{tip.descripcion}</div>
      {tip.accion && (
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
          → {tip.accion}
        </div>
      )}
    </button>
  );
}

function SeccionItemRow({ item, sectionColor }: { item: IASeccionItem; sectionColor: string }) {
  const { theme } = useTheme();
  const badgeColor = item.badge === 'danger' ? '#ef4444' : item.badge === 'warning' ? '#f59e0b' : item.badge === 'success' ? '#10b981' : null;
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-[11px]">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate" style={{ color: theme.text }}>{item.label}</div>
        {item.sub && (
          <div className="text-[10px] truncate" style={{ color: badgeColor || theme.textSecondary }}>{item.sub}</div>
        )}
      </div>
      <span className="font-bold tabular-nums flex-shrink-0" style={{ color: item.color || sectionColor }}>
        {item.value}
      </span>
    </div>
  );
}

export default DashboardIAPanel;
