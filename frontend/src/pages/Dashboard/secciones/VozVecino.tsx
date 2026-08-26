/**
 * VozVecino — la voz del vecino: promedio + distribución + últimas reseñas.
 *
 * ES UNA DE LAS CUATRO FOTOS de la app (reclamos, trámites, tesorería y lo
 * que opina el vecino), así que NO puede evaporarse: sin calificaciones el
 * bloque igual existe y dice, en castellano, que todavía nadie calificó y
 * cómo se consigue (regla del dueño, 2026-08-25). Antes desaparecía y el
 * tablero perdía una de sus patas sin avisar.
 *
 * `VozDelVecino` (pieza del kit) sigue encargándose del caso CON datos.
 */
import { MessageSquare } from 'lucide-react';
import { VozDelVecino } from '../../../components/dashboard/VozDelVecino';
import { SectionTitleV2 } from '../../../components/dashboard/SectionTitleV2';
import { KpiSemantico } from '../../../components/ui/KpiSemantico';
import type { SeccionProps } from '../tipos';

export function VozVecino({ datos }: SeccionProps) {
  const { califStats, cargandoAnalytics, stats } = datos.reclamos;
  if (cargandoAnalytics) return null;
  if (califStats && califStats.total_calificaciones > 0) {
    return <VozDelVecino stats={califStats} />;
  }

  // Estado sin calificaciones: la pregunta se hace igual y se contesta con lo
  // que SÍ se sabe. Cero enunciado, jamás ("0 calificaciones" no se dice).
  const cerrados = stats
    ? Math.max((stats.por_estado?.finalizado ?? 0), 0)
    : 0;
  return (
    <>
      <SectionTitleV2 icon={MessageSquare} label="Vecinos" />
      <div className="kse-fila-1">
        <KpiSemantico
          pregunta="¿Qué opina el vecino?"
          icono={MessageSquare}
          tono="info"
          valor="Sin respuestas"
          unidad="todavía nadie calificó"
          detalle={
            cerrados > 0 ? (
              <>
                Al cerrar un reclamo el vecino recibe la invitación a calificar la
                gestión. Ya se {cerrados === 1 ? 'cerró' : 'cerraron'}{' '}
                <strong>{cerrados} {cerrados === 1 ? 'reclamo' : 'reclamos'}</strong>,
                así que las primeras respuestas están por llegar.
              </>
            ) : (
              <>
                La calificación se le pide al vecino cuando su reclamo se cierra.
                <strong> Todavía no se cerró ninguno</strong>, así que no hay nada
                que opinar sobre la gestión.
              </>
            )
          }
          accion={{ label: 'Ver calificaciones', to: '/gestion/calificaciones' }}
        />
      </div>
    </>
  );
}
