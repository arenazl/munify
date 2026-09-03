/**
 * abmv2/VistaEnfoque — la vista GUIADA del kit (§ EnfoqueSpec de types.ts).
 *
 * [v3] Ingeniería inversa de la inbox curada de Reclamos (2026-09-02): saludo
 * contextual con chips-resumen por sección, secciones con título en frase +
 * bajada + contador con veredicto, colapsables, y las tarjetas ricas
 * (TarjetaRegistro) con su CTA por sección.
 *
 * Declarativa de punta a punta: la página manda las SECCIONES como datos
 * (título, veredicto, match, ctaLabel) y los ROLES de la fila — nada de
 * ReactNode. El reparto de filas lo hace esta pieza: gana la PRIMERA sección
 * cuyo `match` acepta la fila (el orden de declaración es la prioridad).
 *
 * El saludo por hora lo pone el kit (Buenos días / Buenas tardes / Buenas
 * noches); el resumen ("21 pendientes en tu municipio") viene declarado.
 */
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TarjetaRegistro } from './TarjetaRegistro';
import type { EnfoqueSpec, RolesSemanticos } from './types';

function saludoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export interface VistaEnfoqueProps<Row> {
  enfoque: EnfoqueSpec<Row>;
  roles: RolesSemanticos<Row>;
  rows: Row[];
  rowKey: (row: Row, index?: number) => string | number;
  onRowClick?: (row: Row) => void;
  emptyMessage?: string;
}

export function VistaEnfoque<Row>({
  enfoque,
  roles,
  rows,
  rowKey,
  onRowClick,
  emptyMessage,
}: VistaEnfoqueProps<Row>) {
  const [colapsadas, setColapsadas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(enfoque.secciones.filter((s) => s.colapsable).map((s) => [s.id, true])),
  );

  /* Reparto: cada fila cae en la PRIMERA sección que la acepta. */
  const porSeccion = useMemo(() => {
    const mapa = new Map<string, Row[]>(enfoque.secciones.map((s) => [s.id, []]));
    for (const row of rows) {
      const seccion = enfoque.secciones.find((s) => s.match(row));
      if (seccion) mapa.get(seccion.id)!.push(row);
    }
    return mapa;
  }, [rows, enfoque.secciones]);

  const total = rows.length;
  if (total === 0) {
    return <div className="av2-fichas-vacio">{emptyMessage || 'No hay registros para mostrar.'}</div>;
  }

  return (
    <div className="av2-enf">
      {/* Banner de saludo + chips resumen (uno por sección con filas) */}
      {enfoque.resumen && (
        <div className="av2-enf-saludo">
          <span className="av2-enf-saludo-txt">
            {saludoPorHora()}. <strong>{enfoque.resumen}</strong>
          </span>
          <span className="av2-enf-chips">
            {enfoque.secciones.map((s) => {
              const n = porSeccion.get(s.id)!.length;
              if (n === 0) return null;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`av2-enf-chip${s.veredicto ? ` av2-enf-chip--${s.veredicto}` : ''}`}
                  onClick={() =>
                    document
                      .getElementById(`av2-enf-${s.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  <span className="av2-tnum">{n}</span> {s.titulo.toLowerCase()}
                </button>
              );
            })}
          </span>
        </div>
      )}

      {enfoque.secciones.map((s) => {
        const filas = porSeccion.get(s.id)!;
        // Una sección vacía solo se dibuja si declaró qué celebrar.
        if (filas.length === 0 && !s.emptyMessage) return null;
        const Icono = s.icon;
        const cerrada = !!colapsadas[s.id];
        return (
          <section
            key={s.id}
            id={`av2-enf-${s.id}`}
            className={`av2-enf-seccion${s.veredicto ? ` av2-enf-seccion--${s.veredicto}` : ''}`}
          >
            <header className="av2-enf-cab">
              {Icono && (
                <span className="av2-enf-ico" aria-hidden>
                  <Icono size={18} strokeWidth={1.9} />
                </span>
              )}
              <span className="av2-enf-cab-txt">
                <span className="av2-enf-titulo">
                  {s.titulo}
                  {filas.length > 0 && (
                    <span className="av2-enf-conteo av2-tnum">{filas.length}</span>
                  )}
                </span>
                {s.subtitulo && <span className="av2-enf-sub">{s.subtitulo}</span>}
              </span>
              {/* [v3] Acción de la sección entera ("Eliminar estas 88"):
                  operar el grupo sin abrir nada — la resuelve la página. */}
              {s.headerAction && filas.length > 0 && (
                <button
                  type="button"
                  className={`av2-enf-accion${s.veredicto ? ` av2-vered-${s.veredicto}` : ''}`}
                  onClick={s.headerAction.onClick}
                  title={s.headerAction.label}
                >
                  {s.headerAction.icon && (
                    <s.headerAction.icon size={13} strokeWidth={1.9} aria-hidden />
                  )}
                  {s.headerAction.label}
                </button>
              )}
              {s.colapsable && filas.length > 0 && (
                <button
                  type="button"
                  className={`av2-enf-toggle${cerrada ? '' : ' av2-enf-toggle--abierta'}`}
                  onClick={() => setColapsadas((c) => ({ ...c, [s.id]: !cerrada }))}
                  aria-expanded={!cerrada}
                  aria-label={cerrada ? `Mostrar ${s.titulo}` : `Ocultar ${s.titulo}`}
                >
                  <ChevronDown size={16} strokeWidth={2} />
                </button>
              )}
            </header>

            {filas.length === 0 ? (
              <p className="av2-enf-vacia">{s.emptyMessage}</p>
            ) : (
              !cerrada && (
                <div className="av2-enf-grid">
                  {filas.map((fila, i) => (
                    <TarjetaRegistro<Row>
                      key={rowKey(fila, i)}
                      fila={fila}
                      roles={roles}
                      onClick={onRowClick}
                      ctaLabel={s.ctaLabel}
                      veredicto={s.veredicto ?? null}
                    />
                  ))}
                </div>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

export default VistaEnfoque;
