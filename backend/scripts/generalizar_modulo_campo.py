"""Fase 4 — generaliza el módulo de campo (inventario + formato de OT) a todos
los municipios.

Para cada muni:
  - Siembra el template de categorías de inventario (SIN ítems demo — solo los
    rubros, para que arranque con la estructura y cargue sus propios ítems).
  - Siembra el template de tipos de trabajo.
  - Activa el flag `inventario`.

100% ADITIVO e idempotente. NO siembra ítems demo (eso es solo para las demos).
Ejecutar con `--activar` para que efectivamente prenda el flag; sin flag hace
un dry-run que solo lista qué haría.

Uso:
  python scripts/generalizar_modulo_campo.py            # dry-run
  python scripts/generalizar_modulo_campo.py --activar  # aplica
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal  # noqa: E402
from models import Municipio  # noqa: E402
from services.inventario_seed import seed_inventario, activar_modulo_inventario  # noqa: E402
from services.ot_tipos_seed import seed_tipos_trabajo  # noqa: E402


async def run(aplicar: bool):
    async with AsyncSessionLocal() as db:
        munis = (await db.execute(select(Municipio.id, Municipio.nombre).order_by(Municipio.id))).all()
        print(f"Municipios: {len(munis)} | modo: {'APLICAR' if aplicar else 'DRY-RUN'}\n")

        total_cats = total_tipos = 0
        for mid, nombre in munis:
            if not aplicar:
                print(f"  [dry] {mid}: {nombre}")
                continue
            cats = (await seed_inventario(db, mid, incluir_demo=False))["categorias"]
            tipos = await seed_tipos_trabajo(db, mid)
            await activar_modulo_inventario(db, mid)
            await db.commit()
            total_cats += cats
            total_tipos += tipos
            print(f"  OK {mid}: {nombre} — +{cats} categorías, +{tipos} tipos, flag inventario activo")

        if aplicar:
            print(f"\nListo. Categorías creadas: {total_cats}, tipos creados: {total_tipos}.")
        else:
            print("\nDry-run: no se tocó nada. Corré con --activar para aplicar.")


if __name__ == "__main__":
    asyncio.run(run(aplicar="--activar" in sys.argv))
