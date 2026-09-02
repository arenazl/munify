/**
 * SectionTitleV2 — título de sección del rediseño v2:
 * [icono acento] [label] [───── hairline ─────] [caption] [Ver todos →]
 *
 * Polimórfico: estilos en styles/dashboard-v2.css sobre tokens --pl-*.
 */
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface SectionTitleV2Props {
  icon: LucideIcon;
  label: string;
  /** Link a la derecha (ej: "Ver todos" → /gestion/reclamos). */
  action?: { label: string; to: string };
  /** Texto informativo a la derecha (sin link). */
  caption?: string;
  /** Matiz del icono: acento (default) o azul (ej: sección Trámites). */
  tone?: 'accent' | 'blue';
}

export function SectionTitleV2({ icon: Icon, label, action, caption, tone }: SectionTitleV2Props) {
  return (
    <div className={`dv2-seccion${tone === 'blue' ? ' dv2-seccion--blue' : ''}`}>
      <Icon className="dv2-seccion-icono" aria-hidden="true" />
      <span className="dv2-seccion-label">{label}</span>
      <span className="dv2-seccion-hairline" aria-hidden="true" />
      {caption && <span className="dv2-seccion-caption">{caption}</span>}
      {action && (
        <Link to={action.to} className="dv2-seccion-link">
          {action.label}
        </Link>
      )}
    </div>
  );
}
