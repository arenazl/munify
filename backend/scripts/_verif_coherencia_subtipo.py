"""Read-only: verifica coherencia subtipo vs nombre del tipo (FK) en muni 80.

Lista empleados activos donde subtipo != nombre del tipo_empleado_id.
Tambien reconcilia el conteo final: por FK vs por subtipo, por cada tipo.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto  # noqa: E402
from models.tesoreria_extra import TesoreriaTipoEmpleado  # noqa: E402

MUNI = 80


async def main():
    async with AsyncSessionLocal() as db:
        tipos = (await db.execute(
            select(TesoreriaTipoEmpleado)
            .where(TesoreriaTipoEmpleado.municipio_id == MUNI)
        )).scalars().all()
        nombre_por_id = {t.id: t.nombre for t in tipos}

        emps = (await db.execute(
            select(Contacto)
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True)  # noqa: E712
            .order_by(Contacto.apellido, Contacto.nombre)
        )).scalars().all()

        sin_fk = [e for e in emps if e.tipo_empleado_id is None]
        difieren = []
        for e in emps:
            if e.tipo_empleado_id is None:
                continue
            esperado = nombre_por_id.get(e.tipo_empleado_id)
            if (e.subtipo or '') != (esperado or ''):
                difieren.append((e, esperado))

        print(f"\n{'='*72}")
        print(f"MUNI {MUNI} — coherencia subtipo vs FK (post-saneo)")
        print(f"{'='*72}")
        print(f"  empleados activos ......... {len(emps)}")
        print(f"  sin tipo_empleado_id (FK) . {len(sin_fk)}  (no se pueden derivar)")
        print(f"  subtipo != nombre del FK .. {len(difieren)}")

        if sin_fk:
            print(f"\n  Sin FK (subtipo actual entre comillas):")
            for e in sin_fk:
                nom = f"{e.apellido or ''} {e.nombre}".strip()
                print(f"    {e.id:>5}  subtipo={e.subtipo!r:<22} {nom}")

        if difieren:
            print(f"\n  Desalineados (FK dice una cosa, subtipo otra):")
            print(f"    {'id':>5}  {'subtipo (string)':<22}  {'FK -> nombre tipo':<22}  nombre")
            for e, esperado in difieren:
                nom = f"{e.apellido or ''} {e.nombre}".strip()
                print(f"    {e.id:>5}  {str(e.subtipo)!r:<22}  {str(esperado)!r:<22}  {nom}")

        print(f"\n{'-'*72}")
        print("Conteo final por tipo (FK vs subtipo exacto):")
        print(f"  {'tipo':<24}  {'#FK':>5}  {'#subtipo':>8}")
        for t in sorted(tipos, key=lambda x: x.nombre):
            n_fk = sum(1 for e in emps if e.tipo_empleado_id == t.id)
            n_sub = sum(1 for e in emps if (e.subtipo or '') == t.nombre)
            if n_fk or n_sub:
                flag = '' if n_fk == n_sub else '  <-- DIFF'
                print(f"  {t.nombre[:24]:<24}  {n_fk:>5}  {n_sub:>8}{flag}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
