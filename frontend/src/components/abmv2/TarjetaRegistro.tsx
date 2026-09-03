/**
 * abmv2/TarjetaRegistro — la tarjeta RICA del kit (vistas 'cards' y enfoque).
 *
 * [v3] Ingeniería inversa de las boards curadas de Reclamos/Trámites
 * (2026-09-02): la tarjeta se tiñe por VEREDICTO (el sistema de los 3
 * veredictos — verde al día, ámbar en curso/atención, rojo urgente), lleva el
 * tile de la categoría con su color, las píldoras (taxonomía + badges),
 * el actor con su vencimiento, la descripción y el footer con contexto,
 * código y estado.
 *
 * TODO sale de los ROLES SEMÁNTICOS: un set de datos, un solo dibujante —
 * esta tarjeta, la fila de la tabla y la ficha mobile muestran lo mismo con
 * otra densidad. La página no maqueta tarjetas nunca más.
 *
 * Recreada con tokens y clases av2-* (el original usaba Tailwind + hex
 * inline): cero hex — los únicos inline son colores RUNTIME que vienen de
 * datos (color de la categoría/badge), como manda la regla polimórfica.
 */
import { ChevronRight } from 'lucide-react';
import { Glifo } from './Glifo';
import type { RolesSemanticos } from './types';
import type { Veredicto } from '../../lib/semanticHero';

export interface TarjetaRegistroProps<Row> {
  fila: Row;
  roles: RolesSemanticos<Row>;
  onClick?: (fila: Row) => void;
  /** CTA ancho al pie ("Resolver ya") — lo declara la sección de la vista
   *  enfoque. Dispara el mismo onClick de la tarjeta. */
  ctaLabel?: string;
  /** Fuerza el veredicto (lo manda la sección del enfoque); sin él manda el
   *  rol `verdict` de la fila, y sin ninguno la tarjeta queda neutra. */
  veredicto?: Veredicto | null;
}

export function TarjetaRegistro<Row>({
  fila,
  roles,
  onClick,
  ctaLabel,
  veredicto,
}: TarjetaRegistroProps<Row>) {
  const identity = roles.identity?.(fila) || null;
  const taxonomy = roles.taxonomy?.(fila) || null;
  const headline = roles.headline(fila);
  const actor = roles.actor?.(fila) || null;
  const context = roles.context?.(fila) || null;
  const state = roles.state?.(fila) || null;
  const description = roles.description?.(fila) || null;
  const badges = roles.badges?.(fila) || [];
  const due = roles.due?.(fila) || null;
  const priority = roles.priority?.(fila) || null;
  const tono = veredicto ?? roles.verdict?.(fila) ?? null;

  const clickeable = typeof onClick === 'function';

  return (
    <article
      className={
        'av2-tarj' +
        (tono ? ` av2-tarj--${tono}` : '') +
        (clickeable ? ' av2-tarj--click' : '')
      }
      onClick={clickeable ? () => onClick?.(fila) : undefined}
      role={clickeable ? 'button' : undefined}
      tabIndex={clickeable ? 0 : undefined}
      onKeyDown={
        clickeable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.(fila);
              }
            }
          : undefined
      }
    >
      {/* Cabecera: tile de la categoría + título clamp-2 */}
      <header className="av2-tarj-cab">
        <span
          className="av2-tarj-tile"
          style={taxonomy?.color ? { ['--tile' as string]: taxonomy.color } : undefined}
          aria-hidden
        >
          <Glifo glifo={taxonomy?.icon} size={18} strokeWidth={1.9} />
        </span>
        <h3 className="av2-tarj-titulo">{headline}</h3>
      </header>

      {/* Píldoras: taxonomía con su color + badges (canal, marca) + prioridad */}
      {(taxonomy || badges.length > 0 || priority) && (
        <div className="av2-tarj-pills">
          {taxonomy && (
            <span
              className="av2-tarj-pill"
              style={taxonomy.color ? { ['--pill' as string]: taxonomy.color } : undefined}
            >
              {taxonomy.label}
            </span>
          )}
          {badges.map((b) => (
            <span
              key={b.label}
              className="av2-tarj-pill av2-tarj-pill--suave"
              style={b.color ? { ['--pill' as string]: b.color } : undefined}
            >
              {b.label}
            </span>
          ))}
          {priority && (
            <span
              className={`av2-tarj-pill av2-tarj-pill--suave${
                priority.veredicto ? ` av2-vered-${priority.veredicto}` : ''
              }`}
            >
              {priority.label}
            </span>
          )}
        </div>
      )}

      {/* Quién + vencimiento (el vencimiento habla en el color del veredicto) */}
      {(actor || due) && (
        <div className="av2-tarj-meta">
          {actor && <span className="av2-tarj-actor">{actor}</span>}
          {due && (
            <span className={`av2-tarj-due${due.veredicto ? ` av2-vered-${due.veredicto}` : ''}`}>
              {due.label}
            </span>
          )}
        </div>
      )}

      {/* La descripción del registro, clamp 2 */}
      {description && <p className="av2-tarj-desc">{description}</p>}

      {/* Footer: contexto (dónde/cuándo) + código + estado */}
      {(context || identity || state) && (
        <footer className="av2-tarj-pie">
          {context && <span className="av2-tarj-contexto">{context}</span>}
          <span className="av2-tarj-pie-der">
            {identity && <span className="av2-tarj-id av2-tnum">{identity}</span>}
            {state && (
              <span
                className={`av2-chip-estado av2-chip-estado--${state.tono || 'gray'}`}
              >
                {state.label}
              </span>
            )}
          </span>
        </footer>
      )}

      {/* CTA de la sección enfoque ("Resolver ya") */}
      {ctaLabel && clickeable && (
        <button
          type="button"
          className={`av2-tarj-cta${tono ? ` av2-tarj-cta--${tono}` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(fila);
          }}
        >
          {ctaLabel}
          <ChevronRight size={15} strokeWidth={2} aria-hidden />
        </button>
      )}
    </article>
  );
}

export default TarjetaRegistro;
