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
      <span className="av2-mapa-estados-titulo">¿En qué andan?</span>
      {grupos.map((g) => {
        const on = activos.has(g.id);
        return (
          <button
            key={g.id}
            type="button"
            className={`av2-mapa-estado${on ? ' av2-mapa-estado--on' : ''}`}
            style={{ '--av2-estado-color': g.color } as CSSProperties}
            onClick={() => onToggle(g.id)}
            aria-pressed={on}
            /* El titulo dice lo que el boton HACE, que no siempre es obvio con
               un toggle: apagado, lo que ofrece es volver a mostrarlos. */
            title={on ? `Ocultar los ${g.label.toLowerCase()}` : `Mostrar los ${g.label.toLowerCase()}`}
          >
            {/* El punto de color ES la leyenda: dice que significa ese color en
                el mapa, en el mismo lugar donde se prende y se apaga. Una
                leyenda aparte obliga a mirar dos sitios para entender uno. */}
            <span className="av2-mapa-estado-punto" aria-hidden />
            {g.label}
            <span className="av2-mapa-estado-n">{g.cuantos.toLocaleString('es-AR')}</span>
          </button>
        );
      })}
      {!todos && (
        <button type="button" className="av2-mapa-estados-todos" onClick={onTodos}>
          ver todos
        </button>
      )}
    </div>
  );
}

export default FiltroEstadoMapa;
