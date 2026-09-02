/**
 * CintaConteos — los contadores CRUDOS de la pantalla en UNA línea finita,
 * con un tramo por dominio activo.
 *
 * Reemplaza a las dos filas de KpiCardV2 (`KpisReclamos` + `KpisTramites`):
 * ocho tarjetas para decir total / hoy / esta semana / resolución, que en un
 * muni tranquilo se llenaban de ceros ("Nuevos hoy 0", "Esta semana 0") y de
 * porcentajes sobre base ridícula. Un conteo no es una pregunta con respuesta:
 * es una referencia, y va en una cinta.
 *
 * Componente BOBO: qué se dice, con qué números y qué segmento se OMITE por
 * la regla del cero lo decide `buildCintaTramos` (armadores.ts). Acá sólo se
 * dibuja. Estilos en styles/cinta-conteos.css, sobre tokens --pl-*.
 *
 * Sin tramos (ningún dominio activo, o todos sin un solo caso) no se dibuja
 * nada: la cinta desaparece en vez de mostrar un chip vacío.
 */
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildCintaTramos } from '../armadores';
import type { SeccionProps } from '../tipos';

export function CintaConteos({ datos }: SeccionProps) {
  const statsReclamos = datos.reclamos.stats;
  const statsTramites = datos.tramites.stats;

  const tramos = useMemo(
    () => buildCintaTramos({ reclamos: statsReclamos, tramites: statsTramites }),
    [statsReclamos, statsTramites],
  );

  if (tramos.length === 0) return null;

  return (
    <div className="dcc">
      {tramos.map((tramo, i) => (
        <Fragment key={tramo.id}>
          {i > 0 && <span className="dcc-sep dcc-sep--tramo" aria-hidden="true" />}
          <div className={`dcc-tramo${tramo.tono === 'blue' ? ' dcc-tramo--blue' : ''}`}>
            <span className={`dcc-chip dcc-chip--${tramo.tono}`}>{tramo.etiqueta}</span>
            {tramo.segmentos.map((s, j) => (
              <Fragment key={s.id}>
                {j > 0 && <span className="dcc-sep" aria-hidden="true" />}
                <span className="dcc-seg">
                  {s.pre && <span>{s.pre}</span>}
                  {s.valor && <span className="dcc-valor">{s.valor}</span>}
                  {s.post && <span>{s.post}</span>}
                </span>
              </Fragment>
            ))}
            <Link className="dcc-link" to={tramo.accion.to}>
              {tramo.accion.label}
            </Link>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
