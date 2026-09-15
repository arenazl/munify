"""Pago de una tarjeta de credito: la operacion INVERSA al gasto con tarjeta.

Vive como servicio porque lo usan DOS puertas distintas:
  - `POST /tesoreria/cajas/pagar-tarjeta` (el modal "Pagar tarjeta"), y
  - la agenda, cuando un pago programado tiene DESTINO tarjeta en vez de
    contacto (dueno, 2026-09-11: "el pago programado, asi como descuenta de
    caja, tiene que descontar de la caja tarjeta de credito").

Las dos hacen exactamente lo mismo: DOS movimientos en la misma transaccion,
INGRESO en la caja-tarjeta (cancela deuda) y EGRESO en la caja de origen (de
ahi sale la plata real). NUNCA un Gasto: el gasto ya se registro al comprar
con la tarjeta; volver a registrarlo es contar la plata dos veces, que es
justo lo que le paso a San Pedro Norte durante cuatro meses.

Sin `monto` = se paga TODO lo que se deba en el instante de grabar. La deuda
se lee ACA, de la base, no en la pantalla: si entro una compra mientras el
modal estaba abierto, la tarjeta igual queda en cero exacto.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja
from models.tesoreria_extra import es_caja_tarjeta


def plata(monto: Decimal) -> str:
    """$1.234.567,89 — el formato en el que el municipio lee un numero."""
    entero, _, dec = f"{monto:.2f}".partition(".")
    negativo = entero.startswith("-")
    entero = entero.lstrip("-")
    miles = ""
    while len(entero) > 3:
        miles = "." + entero[-3:] + miles
        entero = entero[:-3]
    return f"{'-' if negativo else ''}${entero}{miles},{dec}"


def narrar_pago(tarjeta_nombre: str, origen_nombre: str, monto: Decimal, deuda_restante: Decimal,
                programado: bool = False) -> str:
    """La CONSTANCIA del pago, con el monto escrito. Es lo que el municipio ve
    en el movimiento de caja y lo que le queda como comprobante: tiene que
    poder leerse solo, sin abrir la ficha ni mirar otra columna (dueño,
    2026-09-12: "el pago programado tiene que decir, se hizo un pago programado
    de la tarjeta tal por tantos pesos")."""
    quien = "Pago programado" if programado else "Pago"
    cierre = ("la tarjeta queda en cero" if deuda_restante <= 0
              else f"sigue debiendo {plata(deuda_restante)}")
    return f"{quien} de {tarjeta_nombre} por {plata(monto)} desde {origen_nombre}: {cierre}"


class PagoTarjetaError(Exception):
    """Validacion de negocio. `status` es el HTTP que corresponde devolver."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


async def deuda_de_tarjeta(db: AsyncSession, caja_id: int, hasta: Optional[date] = None) -> Decimal:
    """Lo que se debe en esa tarjeta: egresos (compras) menos ingresos (pagos).

    `hasta` acota a lo que se debia A ESA FECHA. Un pago con fecha 10 salda lo
    gastado hasta el 10; lo que se compro del 11 en adelante es del periodo
    siguiente, aunque el pago se confirme el 16 (dueño, 2026-09-12: *"si el pago
    programado fue el dia diez, deberiamos imputarle todo lo que sucedio hasta el
    dia diez"*). Sin `hasta`, es la deuda de hoy: lo que la pantalla muestra.

    OJO: la deuda NO depende del limite. `saldo_actual` es `limite + ingresos -
    egresos` y la deuda es `limite - saldo_actual`, asi que el limite se cancela
    solo. Por eso una tarjeta con limite 0 (el caso de San Pedro Norte, que no
    quiere administrar cupos) arroja la deuda correcta igual.
    Negativa = la tarjeta tiene saldo a favor (se pago mas de lo cargado).
    """
    q = (select(TesoreriaMovimientoCaja.tipo,
                func.coalesce(func.sum(TesoreriaMovimientoCaja.monto), 0))
         .where(TesoreriaMovimientoCaja.caja_id == caja_id))
    if hasta:
        q = q.where(TesoreriaMovimientoCaja.fecha <= hasta)
    rows = (await db.execute(q.group_by(TesoreriaMovimientoCaja.tipo))).all()
    ingresos = egresos = Decimal(0)
    for tipo, total in rows:
        tipo_val = tipo.value if hasattr(tipo, "value") else tipo
        if tipo_val == "ingreso":
            ingresos = Decimal(total)
        else:
            egresos = Decimal(total)
    return egresos - ingresos


async def deudas_de_tarjetas(db: AsyncSession, caja_ids: set[int]) -> dict[int, Decimal]:
    """Misma cuenta que `deuda_de_tarjeta`, para N tarjetas en una sola query."""
    if not caja_ids:
        return {}
    rows = (await db.execute(
        select(TesoreriaMovimientoCaja.caja_id, TesoreriaMovimientoCaja.tipo,
               func.coalesce(func.sum(TesoreriaMovimientoCaja.monto), 0))
        .where(TesoreriaMovimientoCaja.caja_id.in_(caja_ids))
        .group_by(TesoreriaMovimientoCaja.caja_id, TesoreriaMovimientoCaja.tipo)
    )).all()
    deudas: dict[int, Decimal] = {cid: Decimal(0) for cid in caja_ids}
    for caja_id, tipo, total in rows:
        tipo_val = tipo.value if hasattr(tipo, "value") else tipo
        deudas[caja_id] += Decimal(total) * (-1 if tipo_val == "ingreso" else 1)
    return deudas


async def cargar_tarjeta_y_origen(
    db: AsyncSession, muni_id: int, tarjeta_caja_id: int, caja_origen_id: Optional[int],
) -> tuple[TesoreriaCaja, TesoreriaCaja]:
    """Trae las dos cajas y valida que sean lo que dicen ser. Mismos mensajes
    que siempre mostro el modal, para que la pantalla no cambie."""
    if not caja_origen_id:
        raise PagoTarjetaError(422, "Falta la caja de donde sale la plata para pagar la tarjeta")
    if tarjeta_caja_id == caja_origen_id:
        raise PagoTarjetaError(422, "La tarjeta y la caja de origen no pueden ser la misma")

    cajas = {c.id: c for c in (await db.execute(
        select(TesoreriaCaja).where(
            TesoreriaCaja.id.in_([tarjeta_caja_id, caja_origen_id]),
            TesoreriaCaja.municipio_id == muni_id,
        )
    )).scalars().all()}

    tarjeta = cajas.get(tarjeta_caja_id)
    origen = cajas.get(caja_origen_id)
    if not tarjeta:
        raise PagoTarjetaError(404, "Tarjeta no encontrada")
    if not origen:
        raise PagoTarjetaError(404, "Caja de origen no encontrada")
    if not es_caja_tarjeta(tarjeta):
        raise PagoTarjetaError(422, f"'{tarjeta.nombre}' no es una tarjeta de credito")
    if es_caja_tarjeta(origen):
        raise PagoTarjetaError(422, "No se puede pagar una tarjeta con otra tarjeta")
    return tarjeta, origen


@dataclass(frozen=True)
class ResultadoPagoTarjeta:
    monto: Decimal            # lo que efectivamente se pago (0 si se omitio)
    total: bool               # True = se pidio "pagar todo"
    deuda_previa: Decimal
    deuda_restante: Decimal
    omitido: bool = False     # True = no habia deuda y se pidio omitir en vez de fallar


async def registrar_pago_tarjeta(
    db: AsyncSession,
    muni_id: int,
    tarjeta: TesoreriaCaja,
    origen: TesoreriaCaja,
    monto: Optional[Decimal],
    fecha: date,
    concepto: Optional[str] = None,
    descripcion: Optional[str] = None,
    pago_programado_id: Optional[int] = None,
    sin_deuda: str = "error",
    desde_programado: bool = False,
    fecha_programada: Optional[date] = None,
) -> ResultadoPagoTarjeta:
    """Agrega los dos movimientos a la sesion. NO hace commit: el que llama
    decide la transaccion (la agenda mete esto junto con el avance del
    programado; el modal commitea solo).

    `monto` None = pagar todo lo que se deba ahora. Con monto = pago parcial.
    Con "todo", lo que se paga es lo que se debia A LA FECHA del pago, no lo de
    hoy: un resumen que vencio el 10 no incluye lo que se compro el 12.

    `sin_deuda`: que hacer si se pidio "todo" y la tarjeta no debe nada.
      - "error"  -> PagoTarjetaError 422 (el modal: el usuario tiene que verlo).
      - "omitir" -> devuelve `omitido=True` sin tocar nada (la agenda: el
        periodo se saltea y el programado sigue; no es un error que un mes no
        haya habido compras).
    """
    deuda = await deuda_de_tarjeta(db, tarjeta.id, hasta=fecha)
    total = monto is None
    monto_final = monto if monto is not None else deuda

    if total and deuda <= 0:
        if sin_deuda == "omitir":
            return ResultadoPagoTarjeta(Decimal(0), True, deuda, deuda, omitido=True)
        raise PagoTarjetaError(422, f"'{tarjeta.nombre}' no tiene deuda para pagar")
    if monto_final <= 0:
        raise PagoTarjetaError(422, "El monto a pagar tiene que ser mayor a cero")

    concepto_final = (concepto or f"Pago de tarjeta {tarjeta.nombre}").strip()[:150]
    # La constancia lleva el MONTO escrito: es el comprobante que le queda al
    # municipio y tiene que leerse solo. Si el que llama trae su propio texto
    # (la curacion, por ejemplo), se respeta.
    constancia = descripcion or narrar_pago(
        tarjeta.nombre, origen.nombre, monto_final, deuda - monto_final, desde_programado,
    )

    # INGRESO en la tarjeta: cancela deuda -> sube el credito disponible.
    db.add(TesoreriaMovimientoCaja(
        municipio_id=muni_id,
        caja_id=tarjeta.id,
        tipo=TipoMovimientoCaja.INGRESO,
        monto=monto_final,
        fecha=fecha,
        concepto=concepto_final,
        descripcion=constancia,
        pago_programado_id=pago_programado_id,
        fecha_programada=fecha_programada,
    ))
    # EGRESO en la caja real: de ahi sale efectivamente la plata.
    db.add(TesoreriaMovimientoCaja(
        municipio_id=muni_id,
        caja_id=origen.id,
        tipo=TipoMovimientoCaja.EGRESO,
        monto=monto_final,
        fecha=fecha,
        concepto=concepto_final,
        descripcion=constancia,
        pago_programado_id=pago_programado_id,
        fecha_programada=fecha_programada,
    ))
    return ResultadoPagoTarjeta(monto_final, total, deuda, deuda - monto_final)


class CajaFormaPagoError(Exception):
    """La caja y la forma de pago no se corresponden."""

    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail
        super().__init__(detail)


async def resolver_caja_y_forma_pago(db: AsyncSession, municipio_id: int, caja_id, forma_pago):
    """Devuelve (caja, forma_pago) coherentes, o explota. UNA sola implementacion.

    LA REGLA (dueño, 2026-09-15): *"cuando el ponga pago de tarjeta de credito, si
    o si tiene que elegir una tarjeta para avanzar; entonces ya esto no va a pasar
    mas"*. Dicho al derecho y al reves:

      - si se paga con tarjeta, la caja tiene que ser LA tarjeta;
      - si la caja es una tarjeta, la forma de pago tiene que ser tarjeta.

    Las dos direcciones rompen algo distinto. Un gasto que dice "tarjeta" y sale
    de una caja comun no le suma deuda a ninguna tarjeta; uno que sale de la caja
    de la tarjeta con otra forma de pago le suma deuda sin haberla usado.

    POR QUE ACA Y NO EN CADA ENDPOINT: los gastos nacen en cinco lugares —el alta
    normal, el editor, la carga de combustible de la flota, la orden de pago y la
    ejecucion de un pago programado— y en tres de ellos el usuario elige la caja
    pero NO la forma de pago, que se completa con un default. Una regla repetida
    en dos endpoints deja las otras puertas abiertas, que es exactamente como
    empezo lo de San Pedro Norte.

    Cuando la forma de pago no la eligio nadie (`forma_pago=None`, el caso de la
    flota) se DEDUCE de la caja en vez de rechazar: si elegiste la tarjeta, se
    pago con la tarjeta. Es lo que el usuario quiso decir.
    """
    from models import TesoreriaCaja

    if caja_id is None:
        return None, forma_pago

    caja = (await db.execute(
        select(TesoreriaCaja).where(
            TesoreriaCaja.id == caja_id,
            TesoreriaCaja.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not caja:
        raise CajaFormaPagoError(422, "caja_id invalido para este municipio")

    tarjeta = es_caja_tarjeta(caja)
    if forma_pago is None:
        return caja, ("tarjeta" if tarjeta else None)

    con_tarjeta = str(getattr(forma_pago, "value", forma_pago)) == "tarjeta"
    if con_tarjeta and not tarjeta:
        raise CajaFormaPagoError(
            422,
            "Si se paga con tarjeta hay que elegir la tarjeta, no una caja comun. "
            "Es la tarjeta la que acumula la deuda, y despues se salda con 'Pagar tarjeta'.")
    if tarjeta and not con_tarjeta:
        raise CajaFormaPagoError(
            422, "Esa es una tarjeta de credito: la forma de pago tiene que ser 'tarjeta'.")
    return caja, forma_pago
