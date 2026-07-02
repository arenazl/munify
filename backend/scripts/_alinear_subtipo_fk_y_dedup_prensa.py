"""Saneo final muni 80:

1. Alinea subtipo = nombre del tipo (FK) para TODOS los empleados activos con
   tipo_empleado_id seteado. Idempotente: deja la base coherente con el nuevo
   invariante (subtipo = espejo de la FK). Resuelve los 4 conflictos
   (corralon/Personal de planta/Personal contratado -> nombre del FK).

2. Borra el tipo 'Prensa' duplicado (id 97, 0 empleados). El FK es
   ondelete=SET NULL, asi que es seguro; igual se verifica 0 referencias.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func, delete  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto  # noqa: E402
from models.tesoreria_extra import TesoreriaTipoEmpleado  # noqa: E402

MUNI = 80
PRENSA_DUP_ID = 97


async def main():
    async with AsyncSessionLocal() as db:
        # --- 1. Alinear subtipo <- nombre FK ---
        tipos = (await db.execute(
            select(TesoreriaTipoEmpleado.id, TesoreriaTipoEmpleado.nombre)
            .where(TesoreriaTipoEmpleado.municipio_id == MUNI)
        )).all()
        nombre_por_id = {tid: nom for tid, nom in tipos}

        emps = (await db.execute(
            select(Contacto)
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True,  # noqa: E712
                   Contacto.tipo_empleado_id.isnot(None))
        )).scalars().all()

        cambios = 0
        for e in emps:
            nuevo = nombre_por_id.get(e.tipo_empleado_id)
            if nuevo and (e.subtipo or '') != nuevo:
                nom = f"{e.apellido or ''} {e.nombre}".strip()
                print(f"  subtipo: {str(e.subtipo)!r:<22} -> {nuevo!r}   ({nom})")
                e.subtipo = nuevo
                cambios += 1
        print(f"\n[1] subtipo alineado a la FK: {cambios} contactos actualizados.")

        # --- 2. Borrar Prensa duplicado (id 97) ---
        refs = (await db.execute(
            select(func.count(Contacto.id))
            .where(Contacto.tipo_empleado_id == PRENSA_DUP_ID)
        )).scalar_one()
        dup = (await db.execute(
            select(TesoreriaTipoEmpleado)
            .where(TesoreriaTipoEmpleado.id == PRENSA_DUP_ID,
                   TesoreriaTipoEmpleado.municipio_id == MUNI)
        )).scalar_one_or_none()

        if dup is None:
            print(f"[2] tipo id {PRENSA_DUP_ID} no existe (ya borrado).")
        elif refs > 0:
            print(f"[2] ABORTADO: tipo id {PRENSA_DUP_ID} tiene {refs} contactos. No se borra.")
        else:
            print(f"[2] Borrando tipo id {PRENSA_DUP_ID} {dup.nombre!r} (0 referencias).")
            await db.execute(delete(TesoreriaTipoEmpleado).where(TesoreriaTipoEmpleado.id == PRENSA_DUP_ID))

        await db.commit()
        print("\nOK. Commit hecho.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
