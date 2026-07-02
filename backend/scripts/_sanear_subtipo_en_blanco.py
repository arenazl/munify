"""Saneo: rellena subtipo vacio desde el nombre del tipo (FK) en muni 80.

Caso: empleados con tipo_empleado_id seteado pero subtipo NULL/'' no aparecen
en la pantalla Empleados (que filtra por el string subtipo). Se copia el
nombre del tipo del catalogo al campo subtipo. NO pisa subtipos que ya tienen
valor (asi respeta los conflictos como 'corralon' / 'Personal de planta').

Por defecto solo toca tipo_empleado_id = 1 ('En blanco'). Cambiar SOLO_EN_BLANCO
a False para rellenar todos los tipos con subtipo vacio.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func, or_  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto  # noqa: E402
from models.tesoreria_extra import TesoreriaTipoEmpleado  # noqa: E402

MUNI = 80
SOLO_EN_BLANCO = False
TIPO_EN_BLANCO_ID = 1


async def main():
    async with AsyncSessionLocal() as db:
        tipos = (await db.execute(
            select(TesoreriaTipoEmpleado.id, TesoreriaTipoEmpleado.nombre)
            .where(TesoreriaTipoEmpleado.municipio_id == MUNI)
        )).all()
        nombre_por_id = {tid: nom for tid, nom in tipos}

        q = (
            select(Contacto)
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True,  # noqa: E712
                   Contacto.tipo_empleado_id.isnot(None),
                   or_(Contacto.subtipo.is_(None), func.trim(Contacto.subtipo) == ''))
        )
        if SOLO_EN_BLANCO:
            q = q.where(Contacto.tipo_empleado_id == TIPO_EN_BLANCO_ID)

        emps = (await db.execute(q.order_by(Contacto.apellido, Contacto.nombre))).scalars().all()

        print(f"\nA actualizar: {len(emps)} empleados (subtipo vacio -> nombre del tipo)\n")
        cambios = 0
        for e in emps:
            nuevo = nombre_por_id.get(e.tipo_empleado_id)
            if not nuevo:
                continue
            nom = f"{e.apellido or ''} {e.nombre}".strip()
            print(f"  {e.id:>5}  subtipo: NULL -> {nuevo!r}   ({nom})")
            e.subtipo = nuevo
            cambios += 1

        await db.commit()
        print(f"\nOK. {cambios} contactos actualizados.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
