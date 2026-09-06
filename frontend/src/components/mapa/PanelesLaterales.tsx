import type { CSSProperties } from 'react';

/**
 * Las FRANJAS de los costados del mapa: lo que el mapa no puede decir dibujando.
 *
 * Nacen de dos pedidos que resultaron ser el mismo (dueno, 2026-09-05):
 *
 *   1. "¿en donde le mostramos estas metricas al funcionario?" --- el mapa
 *      muestra DONDE, pero el por que y el cuanto necesitan texto.
 *   2. "como es tan grande el mapa, cuando queres hacer scroll te paras encima
 *      y se te va toda la miercoles... hay que hacer que sea un poquito mas
 *      fino de los costados".
 *
 * Angostar el mapa dejaba dos franjas vacias justo del ancho de una lista. Asi
 * que las franjas no son decoracion: son el lugar donde vive la lectura
 * PROCESADA --"lo que mas te frena es la compra de materiales"-- y de paso
 * devuelven el margen por donde scrollear sin pasar por arriba del mapa.
 *
 * TONTO (regla 6.bis): no sabe de reclamos, de motivos ni de barrios. Recibe
 * filas ya redactadas. Quien decide que se cuenta y como se dice es la
 * pantalla, que es la que tiene los datos.
 */

export interface FilaPanel {
  id: string;
  /** Lo que se lee primero: el sujeto de la frase ("Materiales"). */
  titulo: string;
  /** El numero que importa, ya formateado ("5"). */
  valor: string;
  /** La vara al lado del numero: sin esto un numero solo no dice si es mucho
   *  o poco ("80 días esperando"). */
  detalle?: string;
  /** El padre lo decide; el kit no interpreta el dato. */
  color?: string;
  /** Cuanto de la barra se pinta (0 a 1). Sin valor, no se dibuja barra. */
  proporcion?: number;
  onClick?: () => void;
  activo?: boolean;
}

interface Props {
  titulo: string;
  /** Una linea que explica QUE se esta mirando. Es la diferencia entre una
   *  lista de numeros y una lectura. */
  bajada?: string;
  filas: FilaPanel[];
  /** Que decir cuando no hay filas. Un panel vacio sin texto parece roto. */
  vacio: string;
  /** El remate: la conclusion en prosa, abajo de todo. */
  remate?: string;
}

export function PanelLateral({ titulo, bajada, filas, vacio, remate }: Props) {
  return (
    <aside className="av2-mapa-lateral">
      <div className="av2-mapa-lateral-head">
        <h3 className="av2-mapa-lateral-titulo">{titulo}</h3>
        {bajada && <p className="av2-mapa-lateral-bajada">{bajada}</p>}
      </div>

      {filas.length === 0 ? (
        <p className="av2-mapa-lateral-vacio">{vacio}</p>
      ) : (
        <ul className="av2-mapa-lateral-lista">
          {filas.map((f) => {
            const Tag = f.onClick ? 'button' : 'div';
            return (
              <li key={f.id}>
                <Tag
                  {...(f.onClick ? { type: 'button' as const, onClick: f.onClick } : {})}
                  className={`av2-mapa-fila${f.activo ? ' av2-mapa-fila--activa' : ''}${
                    f.onClick ? ' av2-mapa-fila--clickeable' : ''
                  }`}
                  style={{ '--av2-fila-color': f.color || 'var(--pl-text-3)' } as CSSProperties}
                >
                  <span className="av2-mapa-fila-titulo">{f.titulo}</span>
                  <span className="av2-mapa-fila-valor">{f.valor}</span>
                  {f.detalle && <span className="av2-mapa-fila-detalle">{f.detalle}</span>}
                  {/* La barra es la comparacion: dos numeros en una lista se
                      comparan leyendo, dos barras se comparan mirando. */}
                  {f.proporcion != null && (
                    <span className="av2-mapa-fila-barra" aria-hidden>
                      <span style={{ width: `${Math.max(f.proporcion, 0.04) * 100}%` }} />
                    </span>
                  )}
                </Tag>
              </li>
            );
          })}
        </ul>
      )}

      {remate && <p className="av2-mapa-lateral-remate">{remate}</p>}
    </aside>
  );
}

export default PanelLateral;
