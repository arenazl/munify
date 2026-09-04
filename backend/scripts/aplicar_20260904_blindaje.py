"""
Aplica la migración 20260904_blindaje SIN Alembic (alembic_version está vacía
en QA y prod): agrega `municipios.provincia`, la rellena desde las bitácoras
de la semilla y crea el trigger de blindaje. Idempotente.

Uso:  python scripts/aplicar_20260904_blindaje.py          (usa DATABASE_URL del .env)
      DATABASE_URL="..." python scripts/aplicar_20260904_blindaje.py   (Infra, contra prod)
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(AQUI)
sys.path.insert(0, BACKEND)

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402

RUTA_MIGRACION = os.path.join(BACKEND, "alembic", "versions", "20260904_provincia_blindaje.py")
spec = importlib.util.spec_from_file_location("mig_blindaje", RUTA_MIGRACION)
mig = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mig)


async def main() -> None:
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print("Base:", db)
        existe = (await conn.execute(text("SHOW COLUMNS FROM municipios LIKE 'provincia'"))).fetchall()
        if existe:
            print("municipios.provincia: ya existía")
        else:
            await conn.execute(text("ALTER TABLE municipios ADD COLUMN provincia VARCHAR(150) NULL"))
            print("municipios.provincia: creada")
        r = await conn.execute(text(mig.SQL_BACKFILL_PROVINCIA))
        print("provincias rellenadas desde demo_seed_logs:", r.rowcount)
        await conn.execute(text(mig.SQL_DROP_TRIGGER))
        await conn.execute(text(mig.SQL_CREATE_TRIGGER))
        print("trigger municipios_blindaje: creado")
        print("triggers en municipios:",
              [t[0] for t in (await conn.execute(text("SHOW TRIGGERS LIKE 'municipios'"))).fetchall()])
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
