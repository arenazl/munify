"""Read-only: lista los tipos de empleado del muni 80 (SPN) con conteo real.

Para cada TesoreriaTipoEmpleado del muni:
  - id, nombre, orden, activo
  - cantidad de contactos (tipo=empleado, activo) que lo apuntan via tipo_empleado_id

Ademas:
  - total de empleados activos
  - cuantos sin tipo_empleado_id (NULL)
  - distribucion del campo legacy `subtipo`

No escribe nada.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.tesoreria_extra import TesoreriaTipoEmpleado  # noqa: E402
from models.contacto import Contacto  # noqa: E402

MUNI = 80


async def main():
    async with AsyncSessionLocal() as db:
        tipos = (await db.execute(
            select(TesoreriaTipoEmpleado)
            .where(TesoreriaTipoEmpleado.municipio_id == MUNI)
            .order_by(TesoreriaTipoEmpleado.orden, TesoreriaTipoEmpleado.nombre)
        )).scalars().all()

        # conteo por tipo_empleado_id (empleados activos)
        rows = (await db.execute(
            select(Contacto.tipo_empleado_id, func.count(Contacto.id))
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True)  # noqa: E712
            .group_by(Contacto.tipo_empleado_id)
        )).all()
        counts = {r[0]: r[1] for r in rows}

        total_emp = (await db.execute(
            select(func.count(Contacto.id))
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True)  # noqa: E712
        )).scalar_one()

        sin_tipo = counts.get(None, 0)

        # distribucion legacy subtipo
        sub_rows = (await db.execute(
            select(Contacto.subtipo, func.count(Contacto.id))
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True)  # noqa: E712
            .group_by(Contacto.subtipo)
        )).all()

        print(f"\n{'='*70}")
        print(f"MUNI {MUNI} — empleados activos: {total_emp} | sin tipo_empleado_id: {sin_tipo}")
        print(f"{'='*70}")
        print(f"\nTIPOS DE EMPLEADO (catalogo) — {len(tipos)} registros\n")
        print(f"{'id':>4}  {'orden':>5}  {'act':>3}  {'#emp':>5}  nombre")
        print("-" * 70)
        for t in tipos:
            print(f"{t.id:>4}  {t.orden:>5}  {str(t.activo)[:1]:>3}  {counts.get(t.id, 0):>5}  {t.nombre}")

        print(f"\n{'-'*70}")
        print("Distribucion del campo legacy `subtipo` (string libre):")
        for s, c in sorted(sub_rows, key=lambda x: -x[1]):
            print(f"   {c:>5}  {s!r}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
