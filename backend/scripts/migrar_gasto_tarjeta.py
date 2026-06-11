"""Agrega gastos.tarjeta_credito_id (FK a tarjetas_credito). Idempotente."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        exists = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema=DATABASE() AND table_name='gastos' "
            "AND column_name='tarjeta_credito_id'"
        ))).scalar()
        if exists:
            print("= gastos.tarjeta_credito_id ya existe")
            return
        await conn.execute(text("ALTER TABLE gastos ADD COLUMN tarjeta_credito_id INT NULL"))
        await conn.execute(text(
            "ALTER TABLE gastos ADD CONSTRAINT fk_gasto_tarjeta "
            "FOREIGN KEY (tarjeta_credito_id) REFERENCES tarjetas_credito(id) ON DELETE SET NULL"
        ))
        await conn.execute(text("CREATE INDEX idx_gasto_tarjeta ON gastos(tarjeta_credito_id)"))
        print("+ gastos.tarjeta_credito_id creada")
    await engine.dispose()
    print("OK")


if __name__ == "__main__":
    asyncio.run(migrate())
