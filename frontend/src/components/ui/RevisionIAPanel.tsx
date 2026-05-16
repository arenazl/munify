import { useState, useEffect } from 'react';
import { Sparkles, Check, Pencil, X as XIcon, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

// RevisionIAPanel — side panel reusable que muestra items sugeridos por IA
// para que el supervisor revise (duplicados, sospechosos, sin asignar, etc).
//
// Disenado para usarse en ABMPage.sidePanel:
//   <ABMPage sidePanel={<RevisionIAPanel items={iaItems} loading={loading} ... />}>
//
// Cada item lleva: confianza (0-100), tipo, titulo, hint y fecha.
// Los botones Aprobar / Editar / Descartar son opcionales — la pagina decide
// que hacer con cada accion.

export type RevisionIATipo = 'duplicado' | 'sospechoso' | 'sin_asignar' | 'datos_pobres' | string;

export interface RevisionIAItem {
  /** ID del recurso (reclamo / tramite / tasa / etc). 0 = item demo. */
  resourceId: number;
  /** Tipo de hallazgo. */
  tipo: RevisionIATipo;
  /** Confianza 0-100. */
  confianza: number;
  /** Frase corta para el supervisor (ej: "Posible duplicado del #423"). */
  hint: string;
  /** Titulo del recurso (ej: el titulo del reclamo). */
  titulo: string;
  /** Subtitulo / categoria (opcional). */
  categoria?: string;
  /** Fecha ISO o ya formateada (opcional). */
  fecha?: string;
  /** Marca interna de demo (cuando no hay backend IA real). */
  es_demo?: boolean;
}

interface RevisionIAPanelProps {
  /** Items a mostrar. Se permiten 0+. */
  items: RevisionIAItem[];
  /** Si esta cargando del backend. */
  loading?: boolean;
  /** Titulo del panel. Default "Revisión IA". */
  title?: string;
  /** Subtitulo / hint inicial. Default "N items esperando revisión". */
  subtitle?: string;
  /** Callback de aprobar. */
  onApprove?: (item: RevisionIAItem) => void;
  /** Callback de editar (abrir sheet, etc). */
  onEdit?: (item: RevisionIAItem) => void;
  /** Callback de descartar. */
  onDismiss?: (item: RevisionIAItem) => void;
  /** Callback "aprobar todos" (boton superior). */
  onApproveAll?: () => void;
  /** Notifica al padre cuando cambia el estado collapsed (para que reduzca el ancho del slot). */
  onCollapsedChange?: (collapsed: boolean) => void;
}

const TIPO_COLOR: Record<string, string> = {
  duplicado: '#a855f7',
  sospechoso: '#f59e0b',
  sin_asignar: '#3b82f6',
  datos_pobres: '#6b7280',
};

function tipoLabel(t: string): string {
  switch (t) {
    case 'duplicado': return 'Duplicado';
    case 'sospechoso': return 'Sospechoso';
    case 'sin_asignar': return 'Sin asignar';
    case 'datos_pobres': return 'Datos pobres';
    default: return t;
  }
}

function formatFecha(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function RevisionIAPanel({
  items,
  loading = false,
  title = 'Revisión IA',
  subtitle,
  onApprove,
  onEdit,
  onDismiss,
  onApproveAll,
  onCollapsedChange,
}: RevisionIAPanelProps) {
  const { theme } = useTheme();
  const hasItems = items.length > 0;
  const subtitleResolved = subtitle ?? `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  // Collapse persistido en localStorage. Default expandido.
  // Cuando esta colapsado, el panel se vuelve una barra vertical fina
  // pegada a la DERECHA (solo icono + count rotado).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('revision_ia_collapsed') === '1'; } catch { return false; }
  });
  useEffect(() => { onCollapsedChange?.(collapsed); }, [collapsed, onCollapsedChange]);
  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('revision_ia_collapsed', next ? '1' : '0'); } catch (e) { void e; }
      return next;
    });
  };

  // Modo colapsado: barra vertical fina a la derecha, sin contenido.
  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="sticky top-0 w-full min-h-[120px] rounded-lg flex flex-col items-center justify-start gap-2 py-3 transition-all hover:shadow-sm"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        title={`Expandir ${title}`}
        aria-label={`Expandir ${title}`}
      >
        <ChevronLeft className="h-3 w-3" style={{ color: theme.textSecondary }} />
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        {hasItems && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: theme.primary, color: theme.primaryText || '#fff' }}
          >
            {items.length}
          </span>
        )}
        {/* Label rotado 90deg para que se lea vertical */}
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mt-1"
          style={{
            color: theme.textSecondary,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}
        >
          {title}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2 sticky top-4 text-[12px]">
      {/* Header (siempre visible, clickeable para colapsar) */}
      <button
        onClick={toggle}
        className="w-full rounded-lg p-2.5 flex items-center gap-2 transition-all hover:shadow-sm text-left"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
        title="Colapsar panel IA"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold leading-tight" style={{ color: theme.text }}>{title}</div>
          <div className="text-[10px] leading-tight" style={{ color: theme.textSecondary }}>{subtitleResolved}</div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: theme.textSecondary }} />
      </button>

      {!collapsed && (<>
      {/* Aprobar todo (solo si hay items y onApproveAll) */}
      {hasItems && onApproveAll && (
        <button
          onClick={onApproveAll}
          className="w-full rounded-lg p-2.5 flex items-center justify-between gap-2 transition-all hover:shadow-sm"
          style={{ backgroundColor: theme.text, color: theme.card }}
        >
          <div className="text-left">
            <div className="text-[9px] uppercase font-bold opacity-70">A revisar</div>
            <div className="text-[13px] font-bold">{items.length} {items.length === 1 ? 'item' : 'items'}</div>
          </div>
          <span className="text-[11px] font-semibold">Aprobar todos →</span>
        </button>
      )}

      {/* Loading */}
      {loading && !hasItems && (
        <div
          className="rounded-lg p-3 text-center text-[11px]"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        >
          <Sparkles className="h-4 w-4 mx-auto mb-1.5 animate-pulse" style={{ color: theme.primary }} />
          Analizando con IA…
        </div>
      )}

      {/* Empty */}
      {!loading && !hasItems && (
        <div
          className="rounded-lg p-3 text-center text-[11px]"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        >
          <Check className="h-4 w-4 mx-auto mb-1.5" style={{ color: '#22c55e' }} />
          No hay nada para revisar
        </div>
      )}

      {/* Items */}
      {items.map((it, i) => {
        const tipoColor = TIPO_COLOR[it.tipo] || theme.primary;
        return (
          <div
            key={`${it.resourceId}-${i}`}
            className="rounded-lg p-2.5"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {/* Header: IA · X% + tipo + fecha (todo en una linea) */}
            <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                <Sparkles className="h-2.5 w-2.5" />
                IA·{it.confianza}%
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{ backgroundColor: `${tipoColor}15`, color: tipoColor }}
              >
                <span className="inline-block h-1 w-1 rounded-full" style={{ backgroundColor: tipoColor }} />
                {tipoLabel(it.tipo)}
              </span>
              {it.es_demo && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ backgroundColor: '#fbbf2418', color: '#b45309' }}
                  title="Item de demo, sin IA real"
                >
                  <AlertCircle className="h-2.5 w-2.5" />
                  DEMO
                </span>
              )}
              {it.fecha && (
                <span className="text-[10px] ml-auto" style={{ color: theme.textSecondary }}>
                  {formatFecha(it.fecha)}
                </span>
              )}
            </div>

            {/* Titulo + categoria */}
            <div className="font-semibold text-[12px] leading-tight truncate" style={{ color: theme.text }}>
              {it.titulo || `#${it.resourceId}`}
            </div>
            {it.categoria && (
              <div className="text-[10px] truncate" style={{ color: theme.textSecondary }}>
                {it.categoria}
              </div>
            )}

            {/* Hint */}
            {it.hint && (
              <div
                className="flex items-start gap-1 text-[10px] mt-1.5 mb-2 leading-snug"
                style={{ color: theme.textSecondary }}
              >
                <Sparkles className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                <span>{it.hint}</span>
              </div>
            )}

            {/* Acciones — todas iconicas para ahorrar ancho */}
            <div className="flex items-center gap-1">
              {onApprove && (
                <button
                  onClick={() => onApprove(it)}
                  className="flex-1 px-2 py-1 rounded text-[10px] font-semibold inline-flex items-center justify-center gap-1 transition-all hover:brightness-110"
                  style={{ backgroundColor: theme.primary, color: theme.primaryText || '#ffffff' }}
                >
                  <Check className="h-3 w-3" />
                  Aprobar
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(it)}
                  className="px-2 py-1 rounded text-[10px] font-semibold inline-flex items-center gap-1"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                  title="Editar"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={() => onDismiss(it)}
                  className="px-2 py-1 rounded text-[10px]"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                  }}
                  title="Descartar"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Footnote */}
      {hasItems && (
        <div
          className="rounded-lg p-2 text-center text-[10px] italic"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
        >
          La IA aprende de tus decisiones
        </div>
      )}
      </>)}
    </div>
  );
}

export default RevisionIAPanel;
