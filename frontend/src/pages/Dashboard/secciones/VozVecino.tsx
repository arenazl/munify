/**
 * VozVecino — la voz del vecino: promedio + distribución + últimas reseñas.
 * Sale del monolito `pages/Dashboard.tsx` :1293-1295: iba DENTRO del mismo
 * ternario de `loadingAnalytics` que la analítica, así que acá se respeta esa
 * espera (mientras carga, no se dibuja nada) para no cambiar el orden ni el
 * momento en que aparece.
 *
 * `VozDelVecino` ya es una pieza del kit y sin calificaciones NO renderiza.
 */
import { VozDelVecino } from '../../../components/dashboard/VozDelVecino';
import type { SeccionProps } from '../tipos';

export function VozVecino({ datos }: SeccionProps) {
  const { califStats, cargandoAnalytics } = datos.reclamos;
  if (cargandoAnalytics) return null;
  return <VozDelVecino stats={califStats} />;
}
