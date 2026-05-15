"""
Migracion: agregar columna estado_pago al modelo Gasto.

Idempotente. Si la columna ya existe, no hace nada.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # Chequear si la columna existe
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'gastos'
              AND COLUMN_NAME = 'estado_pago'
        """))
        exists = check.fetchone()
        if exists:
            print("[SKIP] columna estado_pago ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE gastos
                ADD COLUMN estado_pago ENUM('concretado','pendiente')
                NOT NULL DEFAULT 'concretado'
                AFTER forma_pago
            """))
            print("[OK] columna estado_pago creada (default 'concretado')")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
