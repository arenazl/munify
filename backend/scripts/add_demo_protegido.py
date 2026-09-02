"""
Migracion: agregar columna demo_protegido al modelo Municipio.

Flag de demo protegida por PIN: la botonera de perfiles se muestra, pero el
quick-login pide la clave numerica del muni (que es la password real de sus
usuarios demo). Idempotente. Si la columna ya existe, no hace nada.
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
              AND TABLE_NAME = 'municipios'
              AND COLUMN_NAME = 'demo_protegido'
        """))
        if check.fetchone():
            print("[SKIP] columna demo_protegido ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE municipios
                ADD COLUMN demo_protegido BOOLEAN NOT NULL DEFAULT 0
                AFTER es_demo
            """))
            print("[OK] columna demo_protegido creada (default 0)")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
