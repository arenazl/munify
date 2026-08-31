"""El libro del depósito: una sola puerta para mover stock.

Antes el stock se tocaba en dos lugares (el ABM de ítems y el cierre de la
orden de trabajo) y ninguno dejaba rastro: no se podía contestar quién sacó
las diez bolsas de cemento (dueño, 2026-08-31).

Ahora todo cambio de `stock_actual` pasa por `registrar_movimiento`, que
escribe el renglón y actualiza el saldo en la misma transacción. Si algún día
aparece otro camino que mueva stock sin pasar por acá, el historial vuelve a
mentir — no agregar uno.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    InventarioItem, InventarioMovimiento, InventarioDeposito,
    NaturalezaInventario, TipoMovimientoInventario,
)

# Los que una persona puede cargar. Los `*_ot` los escribe el cierre de la
# orden de trabajo: cargarlos a mano descuadraría la cuenta contra la OT.
TIPOS_MANUALES = {
    TipoMovimientoInventario.ENTRADA,
    TipoMovimientoInventario.SALIDA,
    TipoMovimientoInventario.AJUSTE,
}


def _nombre_de(usuario) -> Optional[str]:
    """Nombre y apellido; el email como ultimo recurso. Se guarda plano porque
    el usuario puede irse del municipio y el renglon tiene que seguir
    contando quien lo hizo."""
    if usuario is None:
        return None
    partes = [getattr(usuario, "nombre", None), getattr(usuario, "apellido", None)]
    nombre = " ".join(p for p in partes if p).strip()
    return nombre or getattr(usuario, "email", None)


async def _nombres_depositos(db: AsyncSession, municipio_id: int) -> dict:
    """id -> nombre, para no hacer un JOIN por cada renglón de la lista."""
    filas = (await db.execute(
        select(InventarioDeposito.id, InventarioDeposito.nombre)
        .where(InventarioDeposito.municipio_id == municipio_id)
    )).all()
    return {i: n for i, n in filas}


async def registrar_movimiento(
    db: AsyncSession,
    item: InventarioItem,
    tipo: TipoMovimientoInventario,
    cantidad: float,
    *,
    deposito_id: Optional[int] = None,
    contraparte: Optional[str] = None,
    motivo: Optional[str] = None,
    usuario=None,
    orden_trabajo_id: Optional[int] = None,
    orden_compra_id: Optional[int] = None,
    fecha=None,
) -> InventarioMovimiento:
    """Mueve el stock y deja el renglón. NO hace commit (lo hace quien llama).

    - ENTRADA / DEVOLUCION_OT suman; SALIDA / CONSUMO_OT restan.
    - AJUSTE **fija** el stock en `cantidad`: es un conteo físico, no un
      delta. Es la única forma honesta de corregir sin inventar un movimiento
      que nunca ocurrió.
    - RESERVA_OT no toca el stock (un activo no se consume, se toma), pero
      queda registrado para poder contestar quién lo tiene.
    """
    es_consumible = item.naturaleza == NaturalezaInventario.CONSUMIBLE
    saldo = item.stock_actual if item.stock_actual is not None else 0.0
    cantidad = abs(cantidad or 0)

    if es_consumible:
        if tipo == TipoMovimientoInventario.AJUSTE:
            # El renglón guarda el DELTA (lo que cambió) y el saldo al que se
            # llegó: así el historial se lee como movimiento y como conteo.
            delta = cantidad - saldo
            saldo = cantidad
            cantidad = abs(delta)
        elif tipo in InventarioMovimiento.SUMAN:
            saldo = saldo + cantidad
        elif tipo in InventarioMovimiento.RESTAN:
            # El stock no baja de cero: si se consumió más de lo que había,
            # el que miente es el stock anterior, y eso se corrige con un
            # ajuste, no dejando un negativo dando vueltas.
            saldo = max(0.0, saldo - cantidad)
        item.stock_actual = saldo

    mov = InventarioMovimiento(
        municipio_id=item.municipio_id,
        item_id=item.id,
        item_nombre=item.nombre,
        tipo=tipo,
        cantidad=cantidad,
        stock_resultante=saldo if es_consumible else None,
        deposito_id=deposito_id if deposito_id is not None else item.deposito_id,
        contraparte=contraparte,
        motivo=motivo,
        orden_trabajo_id=orden_trabajo_id,
        orden_compra_id=orden_compra_id,
        usuario_id=getattr(usuario, "id", None),
        usuario_nombre=_nombre_de(usuario),
    )
    if fecha is not None:
        mov.fecha = fecha
    db.add(mov)
    return mov
