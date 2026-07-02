"""Read-only: encuentra un muni demo apto para test del endpoint de contactos.

Busca un municipio con un user admin demo (email like '%.demo.com') y al menos
un tipo de empleado activo. Devuelve email admin + codigo muni + un
tipo_empleado_id para armar el test e2e contra el ambiente.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.user import User, RolUsuario  # noqa: E402
from models.municipio import Municipio  # noqa: E402
from models.tesoreria_extra import TesoreriaTipoEmpleado  # noqa: E402


async def main():
    async with AsyncSessionLocal() as db:
        admins = (await db.execute(
            select(User).where(User.rol == RolUsuario.ADMIN,
                               User.email.like('%.demo.com'),
                               User.activo == True)  # noqa: E712
        )).scalars().all()

        for u in admins:
            tipo = (await db.execute(
                select(TesoreriaTipoEmpleado)
                .where(TesoreriaTipoEmpleado.municipio_id == u.municipio_id,
                       TesoreriaTipoEmpleado.activo == True)  # noqa: E712
                .limit(1)
            )).scalar_one_or_none()
            if tipo:
                muni = (await db.execute(
                    select(Municipio).where(Municipio.id == u.municipio_id)
                )).scalar_one()
                print(f"ADMIN_EMAIL={u.email}")
                print(f"MUNI_ID={u.municipio_id}  MUNI_COD={muni.codigo}  MUNI={muni.nombre}")
                print(f"TIPO_ID={tipo.id}  TIPO_NOMBRE={tipo.nombre!r}")
                break
        else:
            print("No se encontro muni demo con admin + tipo de empleado.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
