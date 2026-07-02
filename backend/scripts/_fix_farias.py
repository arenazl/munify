"""Reclasifica el contacto 12494 (Nicolas Farias) de empleado -> proveedor.

Evidencia: nota Bartolo `categoria=proveedor`, 6 gastos de obra publica
($3.7M), 0 pagos programados de sueldo. Quedo como empleado por error de la
importacion. La FK/subtipo ya son None, no hay que limpiar nada mas.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto, TipoContacto  # noqa: E402

CID = 12494


async def main():
    async with AsyncSessionLocal() as db:
        c = (await db.execute(select(Contacto).where(Contacto.id == CID))).scalar_one_or_none()
        if not c:
            print("no existe"); await engine.dispose(); return
        print(f"antes: tipo={c.tipo.value} subtipo={c.subtipo!r} fk={c.tipo_empleado_id}")
        c.tipo = TipoContacto.PROVEEDOR
        await db.commit()
        await db.refresh(c)
        print(f"despues: tipo={c.tipo.value}  (Nicolas Farias reclasificado a proveedor)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
