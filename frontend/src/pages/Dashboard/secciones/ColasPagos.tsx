/**
 * ColasPagos — "Tu agenda de pagos": el encabezado de cola + tres
 * `TarjetaCola`. Mismo patrón que `ColaReclamos` (que es el precedente del
 * bloque), con los datos del módulo de tesorería.
 *
 * LAS TRES PILAS
 *  1. Vencidos (rojo) — lo que ya se pasó de fecha, con el monto y cuánto
 *     hace que espera el más viejo.
 *  2. Esta semana (ámbar) — lo que vence en los próximos 7 días.
 *  3. La tercera sale del POOL por módulo: con contaduría activa son las
 *     órdenes de pago esperando firma; sin contaduría y con sueldos, la
 *     nómina programada.
 *
 * La barra fina de cada tarjeta es su porción de la cola: los tres números
 * suman el total y cada uno muestra qué parte se lleva. Es una lectura
 * visual de peso relativo, igual que en reclamos.
 *
 * Componente BOBO: los números y las franjas salen de `clasificarPagos`
 * (lib/tesoreria-helpers, compartido con la pantalla de Pagos programados);
 * acá sólo se redacta el detalle de cada tarjeta.
 */
import { useMemo } from 'react';
import { CalendarClock, FileSignature, Users, Wallet } from 'lucide-react';
import { TarjetaCola } from '../../../components/dashboard/TarjetaCola';
import { clasificarPagos, fmtMontoCompacto } from '../../../lib/tesoreria-helpers';
import { diaYMes } from '../armadoresFinanzas';
import type { SeccionProps } from '../tipos';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function ColasPagos({ datos, ctx }: SeccionProps) {
  const { pagos, opPendientes, nomina } = datos.finanzas;
  const contaduriaActiva = ctx.esActivo('contaduria');
  const sueldosActivo = ctx.esActivo('sueldos');

  const cola = useMemo(() => clasificarPagos(pagos), [pagos]);

  const nVencidos = cola.vencidos.length;
  const nSemana = cola.estaSemana.length;
  const nTercera = contaduriaActiva
    ? (opPendientes?.cantidad ?? 0)
    : (nomina?.empleados ?? 0);

  const totalCola = nVencidos + nSemana + nTercera;
  const porcion = (n: number) => (totalCola > 0 ? n / totalCola : 0);

  // Sin agenda cargada y sin nada en el pool, la sección entera sobra: tres
  // tarjetas en cero no son una cola de trabajo, son ruido.
  if (totalCola === 0 && pagos.length === 0) return null;

  return (
    <>
      <div className="tcola-encabezado">
        <Wallet className="tcola-enc-icono" aria-hidden="true" />
        <span className="tcola-enc-chip">Pagos</span>
        <span className="tcola-enc-titulo">Tu agenda de pagos</span>
        {nVencidos + nSemana > 0 && (
          <>
            <span className="tcola-enc-sep">·</span>
            <span className="tcola-enc-alcance">
              <strong>
                {nVencidos + nSemana} {plural(nVencidos + nSemana, 'pago', 'pagos')}
              </strong>{' '}
              {plural(nVencidos + nSemana, 'necesita', 'necesitan')} una decisión esta semana
            </span>
          </>
        )}
        <span className="tcola-enc-linea" />
      </div>

      <div className="tcola-fila">
        <TarjetaCola
          icono={Wallet}
          titulo="Vencidos"
          valor={nVencidos}
          unidad={plural(nVencidos, 'pago pasado de fecha', 'pagos pasados de fecha')}
          proporcion={porcion(nVencidos)}
          tono="rojo"
          detalle={
            nVencidos === 0 ? (
              <>Ningún pago se pasó de fecha. <strong>La agenda está al día.</strong></>
            ) : (
              <>
                Suman <strong>{fmtMontoCompacto(cola.montoVencido)}</strong>
                {cola.diasDelMasViejo > 0 && (
                  <> y el más viejo espera hace{' '}
                    <strong>{cola.diasDelMasViejo} {plural(cola.diasDelMasViejo, 'día', 'días')}.</strong></>
                )}
                {cola.diasDelMasViejo === 0 && <>.</>}
              </>
            )
          }
          accion={{ label: 'Marcar y pagar', to: '/gestion/tesoreria/pagos-programados' }}
        />

        <TarjetaCola
          icono={CalendarClock}
          titulo="Esta semana"
          valor={nSemana}
          unidad={plural(nSemana, 'pago por vencer', 'pagos por vencer')}
          proporcion={porcion(nSemana)}
          tono="ambar"
          detalle={
            nSemana === 0 ? (
              <>No vence nada en los próximos siete días. <strong>Semana despejada.</strong></>
            ) : (
              <>
                Suman <strong>{fmtMontoCompacto(cola.montoSemana)}</strong>
                {cola.estaSemana[0]
                  ? <> y el primero cae el <strong>{diaYMes(cola.estaSemana[0].proximo_pago)}.</strong></>
                  : <>.</>}
              </>
            )
          }
          accion={{ label: 'Ver la semana', to: '/gestion/tesoreria/pagos-programados' }}
        />

        {contaduriaActiva ? (
          <TarjetaCola
            icono={FileSignature}
            titulo="Por autorizar"
            valor={nTercera}
            unidad={plural(nTercera, 'orden de pago', 'órdenes de pago')}
            proporcion={porcion(nTercera)}
            tono="verde"
            detalle={
              nTercera === 0 ? (
                <>Contaduría no tiene órdenes pendientes. <strong>Nada espera tu firma.</strong></>
              ) : (
                <>
                  Suman <strong>{fmtMontoCompacto(opPendientes?.monto ?? 0)}</strong> y no salen de
                  Contaduría <strong>hasta que las autorices.</strong>
                </>
              )
            }
            accion={{ label: 'Revisar y autorizar', to: '/gestion/contaduria/ordenes-pago' }}
          />
        ) : sueldosActivo ? (
          <TarjetaCola
            icono={Users}
            titulo="Nómina"
            valor={nTercera}
            unidad={plural(nTercera, 'empleado con sueldo', 'empleados con sueldo')}
            proporcion={porcion(nTercera)}
            tono="verde"
            detalle={
              nTercera === 0 ? (
                <>Todavía no hay empleados con sueldo cargado. <strong>La nómina está vacía.</strong></>
              ) : (
                <>
                  Su liquidación programada suma{' '}
                  <strong>{fmtMontoCompacto(nomina?.masa ?? 0)}</strong>
                  {(nomina?.pagos ?? 0) > 0 && (
                    <> repartidos en <strong>{nomina?.pagos} pagos.</strong></>
                  )}
                  {(nomina?.pagos ?? 0) === 0 && <>.</>}
                </>
              )
            }
            accion={{ label: 'Ver la nómina', to: '/gestion/sueldos/empleados' }}
          />
        ) : null}
      </div>
    </>
  );
}
