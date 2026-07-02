"""Resincroniza caja 2 de SPN (muni 80): crea los 3 movimientos de egreso
que la ventana de deploy del 21/05 dejó sin crear ($1.888.027,46 total).

CAUSA VERIFICADA (forense _forense_caja2_spn*.py): la feature de movimientos
de caja nació el 21/05 (commit d250ec9). El backfill corrió 11:28:25-11:28:28
(movs ids 2-12) y el código nuevo empezó a servir ~11:34 (primer mov orgánico:
gasto 17578). Los gastos 17575/17576/17577, cargados a mano por Bartolo entre
11:29 y 11:33, quedaron en el hueco: ni backfill ni auto-sync.

Este script crea el movimiento EXACTO que hubiera creado el backfill
(idempotente: salta si el gasto ya tiene movimiento).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models import Gasto, TesoreriaMovimientoCaja, TipoMovimientoCaja  # noqa: E402

IDS = (17575, 17576, 17577)


async def main():
    async with AsyncSessionLocal() as db:
        for gid in IDS:
            gasto = (await db.execute(
                select(Gasto).where(Gasto.id == gid, Gasto.municipio_id == 80)
            )).scalar_one_or_none()
            if not gasto:
                print(f"SKIP {gid}: no encontrado en muni 80")
                continue
            ya_tiene = (await db.execute(
                select(TesoreriaMovimientoCaja.id)
                .where(TesoreriaMovimientoCaja.gasto_id == gid).limit(1)
            )).scalar_one_or_none()
            if ya_tiene:
                print(f"SKIP {gid}: ya tiene movimiento (id {ya_tiene})")
                continue
            if not gasto.caja_id or gasto.estado_pago.value != "concretado":
                print(f"SKIP {gid}: sin caja o no concretado")
                continue
            db.add(TesoreriaMovimientoCaja(
                municipio_id=80,
                caja_id=gasto.caja_id,
                gasto_id=gasto.id,
                tipo=TipoMovimientoCaja.EGRESO,
                monto=gasto.monto_pesos,
                fecha=gasto.fecha,
                concepto=gasto.concepto,
            ))
            print(f"OK {gid}: egreso ${gasto.monto_pesos} caja {gasto.caja_id} fecha {gasto.fecha}")
        await db.commit()
        print("Commit hecho. Caja 2 resincronizada.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
