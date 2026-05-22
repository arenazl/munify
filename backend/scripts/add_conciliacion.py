"""
Migracion: agregar columnas para conciliacion bancaria a tesoreria_movimientos_caja.

Idempotente.
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
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tesoreria_movimientos_caja'
              AND COLUMN_NAME = 'conciliado'
        """))
        if check.fetchone():
            print("[SKIP] columnas de conciliacion ya existen")
        else:
            await conn.execute(text("""
                ALTER TABLE tesoreria_movimientos_caja
                ADD COLUMN conciliado BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN ref_extracto VARCHAR(120) NULL,
                ADD COLUMN fecha_conciliacion DATETIME NULL,
                ADD INDEX ix_mov_conciliado (conciliado)
            """))
            print("[OK] columnas conciliado + ref_extracto + fecha_conciliacion creadas")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
