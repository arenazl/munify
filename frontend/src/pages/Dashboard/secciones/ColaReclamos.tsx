/**
 * ColaReclamos — "Tu cola de trabajo": encabezado + tres TarjetaCola
 * (urgentes / sin asignar / para cerrar) + el pie de cerrados de la semana.
 * Sale del monolito `pages/Dashboard.tsx` :973-1061, sin tocar markup,
 * clases ni copy.
 *
 * Antes esto era un array de cuatro columnas que renderizaban la LISTA de
 * reclamos. Ahora cada pila es un numero con su motivo y su accion, y el
 * detalle vive a un clic — que es donde tiene que estar.
 */
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Clock, UserPlus } from 'lucide-react';
import { TarjetaCola } from '../../../components/dashboard/TarjetaCola';
import type { SeccionProps } from '../tipos';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function ColaReclamos({ datos, ctx }: SeccionProps) {
  const { metricasAccion, metricasDetalle } = datos.reclamos;

  const cambioEf = metricasAccion?.cambio_eficiencia ?? 0;
  const nUrgentes = metricasAccion?.urgentes ?? 0;
  const nSinAsignar = metricasAccion?.sin_asignar ?? 0;
  const nPorCerrar = metricasAccion?.esperando_visto_bueno ?? 0;
  /** Todo lo que espera una decision. La barra de cada tarjeta es su parte de esto. */
  const totalCola = nUrgentes + nSinAsignar + nPorCerrar;
  const porcion = (n: number) => (totalCola > 0 ? n / totalCola : 0);

  /** Cuanto hace que espera el mas viejo sin dueno. Sale del detalle REAL. */
  const esperaMasViejo = (metricasDetalle?.sin_asignar ?? [])
    .reduce((may, r) => Math.max(may, r.dias_antiguedad || 0), 0);

  return (
    <>
      <div className="tcola-encabezado">
        <ClipboardList className="tcola-enc-icono" aria-hidden="true" />
        <span className="tcola-enc-chip">Reclamos</span>
        <span className="tcola-enc-titulo">Tu cola de trabajo</span>
        {totalCola > 0 && (
          <>
            <span className="tcola-enc-sep">·</span>
            <span className="tcola-enc-alcance">
              <strong>{totalCola} {plural(totalCola, 'reclamo', 'reclamos')}</strong>{' '}
              {ctx.dependenciaNombre ? 'de tu dependencia esperan' : 'esperan'} una decisión tuya
            </span>
          </>
        )}
        <span className="tcola-enc-linea" />
      </div>

      <div className="tcola-fila">
        <TarjetaCola
          icono={Clock}
          titulo="Urgentes"
          valor={nUrgentes}
          unidad={plural(nUrgentes, 'reclamo vencido', 'reclamos vencidos')}
          proporcion={porcion(nUrgentes)}
          tono="rojo"
          detalle={
            nUrgentes > 0 ? (
              <>Prioridad alta y más de 3 días abiertos. <strong>Ya venció su plazo.</strong></>
            ) : (
              <>Nada urgente pendiente. <strong>La cola está al día.</strong></>
            )
          }
          accion={{ label: 'Asignar cuadrilla', to: '/gestion/reclamos?vista=urgentes' }}
        />

        <TarjetaCola
          icono={UserPlus}
          titulo="Sin asignar"
          valor={nSinAsignar}
          unidad={plural(nSinAsignar, 'reclamo sin dueño', 'reclamos sin dueño')}
          proporcion={porcion(nSinAsignar)}
          tono="ambar"
          detalle={
            nSinAsignar === 0 ? (
              <>Todo tiene responsable. <strong>Nada esperando asignación.</strong></>
            ) : esperaMasViejo > 0 ? (
              <>Nadie a cargo todavía. El más viejo espera hace{' '}
                <strong>{esperaMasViejo} {plural(esperaMasViejo, 'día', 'días')}.</strong></>
            ) : (
              <>Nadie a cargo todavía. <strong>Entraron hoy.</strong></>
            )
          }
          accion={{ label: 'Asignar en lote', to: '/gestion/reclamos?vista=sin_asignar' }}
        />

        <TarjetaCola
          icono={CheckCircle2}
          titulo="Para cerrar"
          valor={nPorCerrar}
          unidad={plural(nPorCerrar, 'reclamo por cerrar', 'reclamos por cerrar')}
          proporcion={porcion(nPorCerrar)}
          tono="verde"
          detalle={
            nPorCerrar > 0 ? (
              <>La cuadrilla ya terminó y subió fotos. <strong>Falta tu visto bueno.</strong></>
            ) : (
              <>No hay nada esperando cierre. <strong>Todo revisado.</strong></>
            )
          }
          accion={{ label: 'Revisar y cerrar', to: '/gestion/reclamos?vista=esperando_visto_bueno' }}
        />
      </div>

      {/* Lo cerrado de la semana ya no ocupa una tarjeta entera: es una linea.
          Un conteo de resueltos solo no dice nada ("¿6 esta bien? ¿contra
          que?") — por eso va con la comparacion contra la semana anterior. */}
      <div className="tcola-pie">
        <CheckCircle2 className="tcola-pie-icono" aria-hidden="true" />
        <span>
          Cerraste <strong>{metricasAccion?.resueltos_semana ?? 0} esta semana</strong>
          {cambioEf !== 0 && (
            <>, {Math.abs(cambioEf)}% {cambioEf > 0 ? 'más' : 'menos'} que la anterior</>
          )}
          {' · '}entraron {metricasAccion?.entraron_semana ?? 0} en los mismos días
        </span>
        <Link to="/gestion/reclamos?estado=finalizado" className="tcola-pie-link">
          Ver cerrados
        </Link>
      </div>
    </>
  );
}
