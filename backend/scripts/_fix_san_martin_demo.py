"""Normaliza el demo de San Martin para la demo comercial:
- muni 120: nombre 'San Martín' (con mayusculas y tilde)
- muni 121 (duplicado identico creado 2 min despues): activo=False (soft, reversible)
- muni 120: activa el modulo 'ordenes_trabajo' (opt-in, para mostrar el circuito de campo)
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.municipio import Municipio  # noqa: E402
from models.municipio_modulo import MunicipioModulo  # noqa: E402


async def main():
    async with AsyncSessionLocal() as db:
        m120 = (await db.execute(select(Municipio).where(Municipio.id == 120))).scalar_one()
        m121 = (await db.execute(select(Municipio).where(Municipio.id == 121))).scalar_one()

        m120.nombre = "San Martín"
        m120.descripcion = "Municipio demo — datos de demostración"
        m121.activo = False

        ot_flag = (await db.execute(select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == 120,
            MunicipioModulo.modulo == "ordenes_trabajo",
        ))).scalar_one_or_none()
        if not ot_flag:
            db.add(MunicipioModulo(municipio_id=120, modulo="ordenes_trabajo", activo=True))
        else:
            ot_flag.activo = True

        await db.commit()
        print(f"OK muni 120: nombre={m120.nombre!r} activo={m120.activo} + modulo ordenes_trabajo ON")
        print(f"OK muni 121: activo={m121.activo}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
