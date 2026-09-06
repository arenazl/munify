import type { CSSProperties } from 'react';

/**
 * LA SEGUNDA LINEA DEL MAPA: en que anda cada reclamo.
 *
 * La primera linea pregunta QUE mirar ("donde se repiten", "lo atrasado"); esta
 * pregunta EN QUE ANDA, que es una dimension distinta y perpendicular. Nacio de
 * un reclamo concreto del dueno (2026-09-05) mirando burbujas de colores:
 * *"¿que es el color azul, rojo y amarillo? ¿resuelto, pospuesto o rechazado?
 * no se entiende"*.
 *
 * Y tenia razon: el color estaba diciendo "posicion relativa entre barrios",
 * que no es algo que se pueda adivinar mirando un circulo. Aca el color pasa a
 * decir el ESTADO --lo unico que la gente espera que diga el color de un
 * reclamo-- y ademas se declara con su nombre al lado, que es la leyenda que
 * faltaba.
 *
 * Los colores NO son de este componente: los pone el padre desde
 * `lib/enums/reclamo`, el SSoT visual de estados de toda la app. Asi el naranja
 * del mapa es el mismo naranja de la pantalla de Reclamos, y nadie tiene que
 * aprender dos idiomas.
 *
 * Va en LISTA vertical dentro del panel, y no en chips sobre el mapa, porque
 * asi hace tres trabajos con un solo componente (diseno de Claude Design,
 * 2026-09-05, y el dueno lo marco: "esto soluciona el reporte y la leyenda en
 * un mismo componente"): REPORTA cuantos hay de cada estado, es la LEYENDA del
 * color que se ve en el mapa, y FILTRA. Tres cosas que antes pedian tres
 * lugares distintos en pantalla.
 */

export interface GrupoEstado {
  id: string;
  /** El nombre que se lee. Corto: es un boton, no un titulo. */
  label: string;
  color: string;
  /** Cuantos hay. Se muestra al lado del nombre. */
  cuantos: number;
}

interface Props {
  grupos: GrupoEstado[];
  /** Los encendidos. Vacio = ninguno, que es un estado valido (mapa limpio). */
  activos: Set<string>;
  onToggle: (id: string) => void;
  /** Vuelve a encender todos. */
  onTodos: () => void;
}

export function FiltroEstadoMapa({ grupos, activos, onToggle, onTodos }: Props) {
  const todos = grupos.every((g) => activos.has(g.id));
  return (
    <div className="av2-mapa-estados" role="group" aria-label="En qué anda cada reclamo">
      <div className="av2-mapa-estados-head">
        <span className="av2-mapa-estados-titulo">Estado</span>
        {/* La instruccion va en el encabezado y no en cada fila: una lista de
            numeros no se ve clickeable, y sin esta linea nadie descubre que
            ademas filtra. */}
        <button
          type="button"
          className="av2-mapa-estados-todos"
          onClick={onTodos}
          disabled={todos}
        >
          {todos ? 'tocá para filtrar' : 'ver todos'}
        </button>
      </div>

      <ul className="av2-mapa-estados-lista">
        {grupos.map((g) => {
          const on = activos.has(g.id);
          return (
            <li key={g.id}>
              <button
                type="button"
                className={`av2-mapa-estado${on ? ' av2-mapa-estado--on' : ''}`}
                style={{ '--av2-estado-color': g.color } as CSSProperties}
                onClick={() => onToggle(g.id)}
                aria-pressed={on}
                title={on ? `Ocultar los ${g.label.toLowerCase()}` : `Mostrar los ${g.label.toLowerCase()}`}
              >
                {/* El punto de color ES la leyenda: dice que significa ese color
                    en el mapa, en la misma fila donde se prende y se apaga. Una
                    leyenda aparte obliga a mirar dos sitios para entender uno. */}
                <span className="av2-mapa-estado-punto" aria-hidden />
                <span className="av2-mapa-estado-label">{g.label}</span>
                <span className="av2-mapa-estado-n">{g.cuantos.toLocaleString('es-AR')}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default FiltroEstadoMapa;
