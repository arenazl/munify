import { ReactNode, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface InboxSeccion {
  id: string;
  titulo: string;
  subtitulo?: string;
  icono: ReactNode;
  color: string;
  emptyMessage: string;
  items: ReactNode[];
  /** Si true, arranca colapsada por default. Default: false. */
  colapsable?: boolean;
  /** Si la sección tiene una acción global (ej: "Marcar todo como leído"). */
  accion?: { label: string; onClick: () => void };
}

interface InboxLayoutProps {
  saludoNombre: string;
  contextoLabel: string;          // "Tránsito y Seguridad Vial" o "todo el muni"
  totalPendiente: number;
  metricasChips: Array<{
    color: string;
    icon: ReactNode;
    label: string;
    value: number;
  }>;
  secciones: InboxSeccion[];
}

/**
 * Layout de la bandeja "Inbox" — vista guiada para supervisores.
 *
 * Se compone de:
 *   - Hero con saludo personalizado + total pendiente.
 *   - Chips de métricas rápidas (urgentes, nuevos, en curso, esperando).
 *   - Secciones colapsables, cada una con su lista de cards.
 *   - Empty states cariñosos cuando una sección no tiene items.
 *
 * El que renderiza las cards individuales es el caller — este layout solo
 * maneja el scaffolding visual + animaciones de entrada en cascada.
 */
export function InboxLayout({
  saludoNombre,
  contextoLabel,
  totalPendiente,
  metricasChips,
  secciones,
}: InboxLayoutProps) {
  const { theme } = useTheme();

  // Saludo según hora local
  const horaSaludo = (() => {
    const h = new Date().getHours();
    if (h < 6) return { texto: 'Buen amanecer', emoji: '🌙' };
    if (h < 13) return { texto: 'Buen día', emoji: '🌅' };
    if (h < 19) return { texto: 'Buenas tardes', emoji: '☀️' };
    return { texto: 'Buenas noches', emoji: '🌃' };
  })();

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes inboxFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .inbox-card {
          animation: inboxFadeIn 0.4s ease-out backwards;
        }
        .inbox-section {
          animation: inboxFadeIn 0.5s ease-out backwards;
        }
      `}</style>

      {/* === Hero === */}
      <div
        className="rounded-3xl p-6 inbox-section"
        style={{
          background: `linear-gradient(135deg, ${theme.primary}15 0%, ${theme.primary}05 100%)`,
          border: `1px solid ${theme.primary}30`,
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl">{horaSaludo.emoji}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight" style={{ color: theme.text }}>
              {horaSaludo.texto}, {saludoNombre || 'colega'}
            </h1>
            {totalPendiente > 0 ? (
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                Hoy tenés{' '}
                <span className="font-bold" style={{ color: theme.primary }}>
                  {totalPendiente}
                </span>{' '}
                {totalPendiente === 1 ? 'tarea' : 'tareas'} pendientes en{' '}
                <span className="font-medium" style={{ color: theme.text }}>{contextoLabel}</span>
              </p>
            ) : (
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                ¡Tenés la bandeja al día en {contextoLabel}! 🎉
              </p>
            )}
          </div>
        </div>

        {/* Chips de métricas */}
        {metricasChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {metricasChips.map((chip, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105 inbox-card"
                style={{
                  backgroundColor: `${chip.color}15`,
                  border: `1px solid ${chip.color}40`,
                  color: chip.color,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                {chip.icon}
                <span className="tabular-nums">{chip.value}</span>
                <span className="opacity-80">{chip.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === Secciones === */}
      {secciones.map((sec, idxSec) => (
        <Seccion key={sec.id} seccion={sec} indexBase={idxSec} />
      ))}
    </div>
  );
}

function Seccion({ seccion, indexBase }: { seccion: InboxSeccion; indexBase: number }) {
  const { theme } = useTheme();
  const [colapsada, setColapsada] = useState(seccion.colapsable || false);
  const isEmpty = seccion.items.length === 0;

  return (
    <div
      className="inbox-section"
      style={{ animationDelay: `${(indexBase + 1) * 80}ms` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${seccion.color}20`, color: seccion.color }}
        >
          {seccion.icono}
        </div>
        <div className="flex-1 min-w-0">
          <h2
            className="text-base font-bold leading-tight flex items-center gap-2"
            style={{ color: theme.text }}
          >
            {seccion.titulo}
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums"
              style={{ backgroundColor: `${seccion.color}20`, color: seccion.color }}
            >
              {seccion.items.length}
            </span>
          </h2>
          {seccion.subtitulo && (
            <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
              {seccion.subtitulo}
            </p>
          )}
        </div>
        {seccion.accion && !isEmpty && (
          <button
            type="button"
            onClick={seccion.accion.onClick}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: `${seccion.color}15`,
              color: seccion.color,
              border: `1px solid ${seccion.color}30`,
            }}
          >
            {seccion.accion.label}
          </button>
        )}
        {seccion.colapsable && (
          <button
            type="button"
            onClick={() => setColapsada((v) => !v)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-black/5"
            style={{ color: theme.textSecondary }}
          >
            {colapsada ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Body */}
      {!colapsada && (
        <>
          {isEmpty ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                backgroundColor: `${theme.backgroundSecondary}80`,
                border: `1px dashed ${theme.border}`,
              }}
            >
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                {seccion.emptyMessage}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {seccion.items.map((item, i) => (
                <div
                  key={i}
                  className="inbox-card"
                  style={{ animationDelay: `${(indexBase + 1) * 80 + i * 30}ms` }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
