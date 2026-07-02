"""Read-only: reconcilia 'En blanco' en el muni 80.

- Cuenta empleados activos con tipo_empleado_id = 1 (catalogo 'En blanco').
- Cuenta empleados activos con subtipo ILIKE 'en blanco'.
- Lista los que tienen tipo_empleado_id = 1 pero subtipo != 'En blanco'
  (los que la pantalla Empleados NO muestra -> hay que arreglar).
- Lista los que tienen subtipo 'en blanco' pero tipo_empleado_id != 1.

No escribe nada.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func, or_  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto  # noqa: E402

MUNI = 80
TIPO_EN_BLANCO_ID = 1


def _norm(s):
    return (s or "").strip().lower()


async def main():
    async with AsyncSessionLocal() as db:
        emps = (await db.execute(
            select(Contacto)
            .where(Contacto.municipio_id == MUNI,
                   Contacto.tipo == 'empleado',
                   Contacto.activo == True)  # noqa: E712
            .order_by(Contacto.apellido, Contacto.nombre)
        )).scalars().all()

        por_fk = [e for e in emps if e.tipo_empleado_id == TIPO_EN_BLANCO_ID]
        por_sub = [e for e in emps if _norm(e.subtipo) == "en blanco"]

        # tienen FK=En blanco pero subtipo NO es 'en blanco' -> no aparecen en Empleados
        a_arreglar = [e for e in por_fk if _norm(e.subtipo) != "en blanco"]
        # tienen subtipo 'en blanco' pero FK != 1
        sub_sin_fk = [e for e in por_sub if e.tipo_empleado_id != TIPO_EN_BLANCO_ID]

        print(f"\n{'='*72}")
        print(f"MUNI {MUNI} — reconciliacion 'En blanco'")
        print(f"{'='*72}")
        print(f"  empleados activos totales ............... {len(emps)}")
        print(f"  con tipo_empleado_id = 1 (catalogo) ..... {len(por_fk)}   <- la pantalla TIPOS muestra esto")
        print(f"  con subtipo 'en blanco' (string) ........ {len(por_sub)}   <- la pantalla EMPLEADOS filtra esto")
        print(f"  DESAJUSTADOS (FK=1, subtipo!='en blanco') {len(a_arreglar)}")
        print(f"  subtipo 'en blanco' pero FK!=1 .......... {len(sub_sin_fk)}")

        print(f"\n{'-'*72}")
        print(f"LISTADO A ARREGLAR ({len(a_arreglar)}): tienen FK='En blanco' pero subtipo distinto")
        print(f"{'id':>5}  {'subtipo actual':<22}  nombre")
        print("-" * 72)
        for e in a_arreglar:
            nom = f"{e.apellido or ''} {e.nombre}".strip()
            print(f"{e.id:>5}  {str(e.subtipo)!r:<22}  {nom}")

        if sub_sin_fk:
            print(f"\n{'-'*72}")
            print(f"Tienen subtipo 'en blanco' pero FK != 1 (FK actual entre parentesis):")
            for e in sub_sin_fk:
                nom = f"{e.apellido or ''} {e.nombre}".strip()
                print(f"{e.id:>5}  (FK={e.tipo_empleado_id})  {nom}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
