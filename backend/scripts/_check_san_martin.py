"""Read-only: verifica si ya existe un municipio 'san martin' en la base."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.municipio import Municipio  # noqa: E402


async def main():
    async with AsyncSessionLocal() as db:
        munis = (await db.execute(
            select(Municipio).where(Municipio.codigo.like('%san-martin%'))
        )).scalars().all()
        if not munis:
            print("No existe ningun muni con codigo like san-martin")
        for m in munis:
            print(f"id={m.id} codigo={m.codigo!r} nombre={m.nombre!r} activo={m.activo} "
                  f"es_demo={m.es_demo} lat={m.latitud} lng={m.longitud}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
