/**
 * Balance de un período: cuánto se cerró de lo que entró.
 *
 * Vive separado del componente <BalanceBar /> porque es lógica pura y
 * reusable — cualquier pantalla puede necesitar el veredicto o la frase sin
 * dibujar la barra (por ejemplo, para un segmento del hero semántico).
 *
 * AGNÓSTICO: dos números. Sirve para reclamos cerrados vs. recibidos, pedidos
 * despachados vs. entrados, o piezas terminadas vs. encargadas.
 */
import type { Veredicto } from './semanticHero';

/**
 * Veredicto del balance: qué proporción de lo que entró se logró cerrar.
 *   al día (cierra todo lo que entra)  → bueno
 *   del 75% para arriba                → advertencia (se junta de a poco)
 *   menos                              → malo (la cola crece)
 */
export function veredictoBalance(cerrados: number, entrados: number): Veredicto {
  if (entrados <= 0) return cerrados > 0 ? 'bueno' : 'advertencia';
  const ratio = cerrados / entrados;
  if (ratio >= 1) return 'bueno';
  if (ratio >= 0.75) return 'advertencia';
  return 'malo';
}

/** La frase que acompaña a la barra, con la consecuencia ya dicha. */
export function textoBalance({ cerrados, entrados }: { cerrados: number; entrados: number }): string {
  if (entrados <= 0) {
    return cerrados > 0 ? 'Cerrados, sin entradas nuevas' : 'Sin movimiento esta semana';
  }
  const resto = entrados - cerrados;
  if (resto <= 0) return 'Cerramos más de lo que entró';
  return `Se acumulan ${resto} de los ${entrados} que entraron`;
}
