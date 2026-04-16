"""Crea las tablas del modulo Tasas (3er pilar).

Tablas:
  - tipos_tasa (maestro global cross-muni)
  - tasas_partidas (padron por muni)
  - tasas_deudas (boletas emitidas)
  - tasas_pagos (pagos efectuados)

Idempotente: si alguna tabla ya existe, la saltea.
"""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text, inspect

from core.config import settings
# Import explicito para que SQLAlchemy registre las tablas en metadata.
from core.database import Base
from models.tasas import TipoTasa, Partida, Deuda, Pago  # noqa: F401


TABLAS = ["tipos_tasa", "tasas_partidas", "tasas_deudas", "tasas_pagos"]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        # Chequear cuales ya existen.
        existentes = set()
        for t in TABLAS:
            r = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.tables "
                    "WHERE table_schema = DATABASE() AND table_name = :t"
                ),
                {"t": t},
            )
            if r.scalar() > 0:
                existentes.add(t)

        if len(existentes) == len(TABLAS):
            print("OK - todas las tablas de tasas ya existen")
        else:
            faltantes = [t for t in TABLAS if t not in existentes]
            print(f"Creando tablas: {faltantes}")
            # create_all solo crea las que no existen.
            await conn.run_sync(Base.metadata.create_all)
            print("OK - tablas creadas")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
