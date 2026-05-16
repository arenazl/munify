import { Sparkles, Check, Pencil, X as XIcon, AlertCircle } from 'lucide-react';
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
}: RevisionIAPanelProps) {
  const { theme } = useTheme();
  const hasItems = items.length > 0;
  const subtitleResolved = subtitle ?? `${items.length} ${items.length === 1 ? 'item esperando aprobación' : 'items esperando aprobación'}`;

  return (
    <div className="space-y-3 sticky top-4">
      {/* Header */}
      <div
        className="rounded-xl p-3 flex items-center gap-2"
        style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Sparkles className="h-5 w-5" style={{ color: theme.primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{ color: theme.text }}>{title}</div>
          <div className="text-[11px]" style={{ color: theme.textSecondary }}>{subtitleResolved}</div>
        </div>
      </div>

      {/* Aprobar todo (solo si hay items y onApproveAll) */}
      {hasItems && onApproveAll && (
        <button
          onClick={onApproveAll}
          className="w-full rounded-xl p-3 flex items-center justify-between gap-2 transition-all hover:shadow-md"
          style={{ backgroundColor: theme.text, color: theme.card }}
        >
          <div className="text-left">
            <div className="text-[10px] uppercase font-bold opacity-70">A revisar</div>
            <div className="text-base font-bold">{items.length} {items.length === 1 ? 'item' : 'items'}</div>
          </div>
          <span className="text-xs font-semibold">Aprobar todos →</span>
        </button>
      )}

      {/* Loading */}
      {loading && !hasItems && (
        <div
          className="rounded-xl p-6 text-center text-xs"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        >
          <Sparkles className="h-5 w-5 mx-auto mb-2 animate-pulse" style={{ color: theme.primary }} />
          Analizando con IA…
        </div>
      )}

      {/* Empty */}
      {!loading && !hasItems && (
        <div
          className="rounded-xl p-6 text-center text-xs"
          style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        >
          <Check className="h-5 w-5 mx-auto mb-2" style={{ color: '#22c55e' }} />
          No hay nada para revisar
        </div>
      )}

      {/* Items */}
      {items.map((it, i) => {
        const tipoColor = TIPO_COLOR[it.tipo] || theme.primary;
        return (
          <div
            key={`${it.resourceId}-${i}`}
            className="rounded-xl p-3"
            style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
          >
            {/* Header: IA · X% + fecha */}
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1"
                style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
              >
                <Sparkles className="h-3 w-3" />
                IA · {it.confianza}%
              </span>
              {it.fecha && (
                <span className="text-[11px]" style={{ color: theme.textSecondary }}>
                  {formatFecha(it.fecha)}
                </span>
              )}
            </div>

            {/* Titulo + categoria */}
            <div className="font-semibold text-sm leading-tight" style={{ color: theme.text }}>
              {it.titulo || `#${it.resourceId}`}
            </div>
            {it.categoria && (
              <div className="text-[11px] mb-2" style={{ color: theme.textSecondary }}>
                {it.categoria}
              </div>
            )}

            {/* Tipo + demo flag */}
            <div className="flex items-center gap-1.5 mb-2 mt-1 flex-wrap">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1"
                style={{ backgroundColor: `${tipoColor}15`, color: tipoColor }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tipoColor }} />
                {tipoLabel(it.tipo)}
              </span>
              {it.es_demo && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1"
                  style={{ backgroundColor: '#fbbf2418', color: '#b45309' }}
                  title="Item de demo, sin IA real"
                >
                  <AlertCircle className="h-3 w-3" />
                  DEMO
                </span>
              )}
            </div>

            {/* Hint */}
            {it.hint && (
              <div
                className="flex items-start gap-1.5 text-[11px] mb-3 leading-snug"
                style={{ color: theme.textSecondary }}
              >
                <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: theme.primary }} />
                <span>{it.hint}</span>
              </div>
            )}

            {/* Acciones */}
            <div className="flex items-center gap-1.5">
              {onApprove && (
                <button
                  onClick={() => onApprove(it)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all hover:brightness-110"
                  style={{ backgroundColor: theme.primary, color: theme.primaryText || '#ffffff' }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Aprobar
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(it)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={() => onDismiss(it)}
                  className="px-2 py-1.5 rounded-lg text-xs"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                  }}
                  title="Descartar"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Footnote */}
      {hasItems && (
        <div
          className="rounded-xl p-3 text-center text-[11px] italic"
          style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}
        >
          La IA aprende de tus decisiones · cada confirmación mejora la categorización
        </div>
      )}
    </div>
  );
}

export default RevisionIAPanel;
