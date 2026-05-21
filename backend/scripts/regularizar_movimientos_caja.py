"""Regulariza movimientos de caja para gastos historicos.

Por un bug en `create_gasto`, los gastos creados antes del fix no tenian
TesoreriaMovimientoCaja asociado aunque tuvieran caja_id seteado. Las
cajas mostraban un saldo incorrectamente alto.

Este script recorre todos los gastos contado + concretado + con caja
que NO tienen movimiento asociado y crea el movimiento faltante.

Idempotente: si el movimiento ya existe (creado manualmente o por otro
flujo), no lo duplica.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, and_
from core.config import settings
from models import Gasto, TesoreriaMovimientoCaja, TipoMovimientoCaja
from models.gasto import TipoFinanciacion, EstadoPagoGasto


async def regularizar():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        # Gastos contado, concretado, con caja, activos, sin movimiento
        # asociado.
        q = (
            select(Gasto)
            .where(
                Gasto.activo == True,  # noqa: E712
                Gasto.caja_id.isnot(None),
                Gasto.tipo_financiacion == TipoFinanciacion.CONTADO,
                Gasto.estado_pago == EstadoPagoGasto.CONCRETADO,
            )
        )
        gastos = list((await db.execute(q)).scalars().all())
        creados = 0
        saltados = 0
        for g in gastos:
            # Verificar si ya hay movimiento para este gasto
            existente = (await db.execute(
                select(TesoreriaMovimientoCaja).where(
                    TesoreriaMovimientoCaja.gasto_id == g.id,
                    TesoreriaMovimientoCaja.tipo == TipoMovimientoCaja.EGRESO,
                )
            )).scalar_one_or_none()
            if existente:
                saltados += 1
                continue
            db.add(TesoreriaMovimientoCaja(
                municipio_id=g.municipio_id,
                caja_id=g.caja_id,
                gasto_id=g.id,
                tipo=TipoMovimientoCaja.EGRESO,
                monto=g.monto_pesos,
                fecha=g.fecha,
                concepto=g.concepto,
            ))
            creados += 1
        await db.commit()
        print(f"[OK] Gastos revisados: {len(gastos)}")
        print(f"     Movimientos creados: {creados}")
        print(f"     Saltados (ya tenian): {saltados}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(regularizar())
