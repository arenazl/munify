/**
 * EL DATO POR BARRIO que la pantalla del mapa arma para leerse de dos maneras:
 * como fila de la lista lateral "Dónde se concentra" y, antes, como burbuja
 * sobre el mapa.
 *
 * El componente visual se retiró el 2026-09-05. Dibujaba cada barrio como un
 * círculo relleno de un solo color, y ahí estaba el problema: un disco tiene
 * que ELEGIR un estado para pintarse, así que mostraba el que más mandaba y
 * escondía la mezcla --- pero un barrio casi nunca es "todo pendiente", tiene
 * 10 pendientes, 2 frenados y 5 cerrados, y esa mezcla es justamente el dato.
 * El dueño lo rechazó dos veces ("esos circulitos no van, che, no van") y tenía
 * razón. Lo reemplaza `DonutZona`, que muestra el reparto completo en el anillo
 * y deja ver el mapa por el centro en vez de taparlo.
 *
 * El TIPO sobrevive porque los datos siempre estuvieron bien: lo que no servía
 * era dibujarlos como disco. La lista lateral los sigue consumiendo tal cual.
 */

export interface BurbujaBarrio {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
  /** Lo que define el tamaño. El padre decide qué significa. */
  valor: number;
  /** El padre lo elige: el kit no interpreta el dato. */
  color: string;
  /** Renglón principal del rótulo, ya redactado ("15 reclamos"). */
  etiqueta: string;
  /** Segundo renglón opcional ("8 pendientes"). */
  detalle?: string;
}
