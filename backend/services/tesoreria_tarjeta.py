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


class PagoTarjetaError(Exception):
    """Validacion de negocio. `status` es el HTTP que corresponde devolver."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


async def deuda_de_tarjeta(db: AsyncSession, caja_id: int) -> Decimal:
    """Lo que se debe HOY en esa tarjeta: egresos (compras) menos ingresos (pagos).

    OJO: la deuda NO depende del limite. `saldo_actual` es `limite + ingresos -
    egresos` y la deuda es `limite - saldo_actual`, asi que el limite se cancela
    solo. Por eso una tarjeta con limite 0 (el caso de San Pedro Norte, que no
    quiere administrar cupos) arroja la deuda correcta igual.
    Negativa = la tarjeta tiene saldo a favor (se pago mas de lo cargado).
    """
    rows = (await db.execute(
        select(TesoreriaMovimientoCaja.tipo,
               func.coalesce(func.sum(TesoreriaMovimientoCaja.monto), 0))
        .where(TesoreriaMovimientoCaja.caja_id == caja_id)
        .group_by(TesoreriaMovimientoCaja.tipo)
    )).all()
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
) -> ResultadoPagoTarjeta:
    """Agrega los dos movimientos a la sesion. NO hace commit: el que llama
    decide la transaccion (la agenda mete esto junto con el avance del
    programado; el modal commitea solo).

    `monto` None = pagar todo lo que se deba ahora. Con monto = pago parcial.
    `sin_deuda`: que hacer si se pidio "todo" y la tarjeta no debe nada.
      - "error"  -> PagoTarjetaError 422 (el modal: el usuario tiene que verlo).
      - "omitir" -> devuelve `omitido=True` sin tocar nada (la agenda: el
        periodo se saltea y el programado sigue; no es un error que un mes no
        haya habido compras).
    """
    deuda = await deuda_de_tarjeta(db, tarjeta.id)
    total = monto is None
    monto_final = monto if monto is not None else deuda

    if total and deuda <= 0:
        if sin_deuda == "omitir":
            return ResultadoPagoTarjeta(Decimal(0), True, deuda, deuda, omitido=True)
        raise PagoTarjetaError(422, f"'{tarjeta.nombre}' no tiene deuda para pagar")
    if monto_final <= 0:
        raise PagoTarjetaError(422, "El monto a pagar tiene que ser mayor a cero")

    concepto_final = (concepto or f"Pago de tarjeta {tarjeta.nombre}").strip()[:150]

    # INGRESO en la tarjeta: cancela deuda -> sube el credito disponible.
    db.add(TesoreriaMovimientoCaja(
        municipio_id=muni_id,
        caja_id=tarjeta.id,
        tipo=TipoMovimientoCaja.INGRESO,
        monto=monto_final,
        fecha=fecha,
        concepto=concepto_final,
        descripcion=descripcion or f"Pago desde {origen.nombre}",
        pago_programado_id=pago_programado_id,
    ))
    # EGRESO en la caja real: de ahi sale efectivamente la plata.
    db.add(TesoreriaMovimientoCaja(
        municipio_id=muni_id,
        caja_id=origen.id,
        tipo=TipoMovimientoCaja.EGRESO,
        monto=monto_final,
        fecha=fecha,
        concepto=concepto_final,
        descripcion=descripcion or f"Pago de {tarjeta.nombre}",
        pago_programado_id=pago_programado_id,
    ))
    return ResultadoPagoTarjeta(monto_final, total, deuda, deuda - monto_final)
