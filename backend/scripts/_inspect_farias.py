"""Read-only: todo lo que se sabe del contacto 12494 (Farias Nicolas) para
decidir que tipo asignarle sin inventar."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto  # noqa: E402
from models import Gasto, TesoreriaPagoProgramado  # noqa: E402

CID = 12494


async def main():
    async with AsyncSessionLocal() as db:
        c = (await db.execute(select(Contacto).where(Contacto.id == CID))).scalar_one_or_none()
        if not c:
            print("no existe"); await engine.dispose(); return

        print("=== Contacto 12494 ===")
        for col in ("nombre", "apellido", "dni", "cuit", "tipo", "subtipo",
                    "tipo_empleado_id", "telefono", "email", "direccion",
                    "alias_pago", "condicion_iva", "notas", "activo",
                    "created_at", "updated_at"):
            print(f"  {col:18} = {getattr(c, col)!r}")

        gs = (await db.execute(
            select(Gasto.concepto, Gasto.monto_pesos, Gasto.fecha)
            .where(Gasto.destino_contacto_id == CID)
            .order_by(Gasto.fecha.desc()).limit(15)
        )).all()
        gtot = (await db.execute(
            select(func.count(Gasto.id), func.coalesce(func.sum(Gasto.monto_pesos), 0))
            .where(Gasto.destino_contacto_id == CID)
        )).one()
        print(f"\n=== Gastos asociados: {gtot[0]} (total ${gtot[1]}) ===")
        for concepto, monto, fecha in gs:
            print(f"  {fecha}  ${monto}  {concepto!r}")

        pps = (await db.execute(
            select(TesoreriaPagoProgramado.concepto, TesoreriaPagoProgramado.monto_pesos,
                   TesoreriaPagoProgramado.frecuencia)
            .where(TesoreriaPagoProgramado.contacto_id == CID)
        )).all()
        print(f"\n=== Pagos programados: {len(pps)} ===")
        for concepto, monto, frec in pps:
            print(f"  ${monto}  {frec}  {concepto!r}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
