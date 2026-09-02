"""
Migracion: agregar columna ubicacion_origen al modelo Reclamo.

De donde salio la coordenada del reclamo: direccion | gps | geocodificada |
ip | municipio. NULL = legacy (previo a la regla; se trata como preciso).
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
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'reclamos'
              AND COLUMN_NAME = 'ubicacion_origen'
        """))
        if check.fetchone():
            print("[SKIP] columna ubicacion_origen ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE reclamos
                ADD COLUMN ubicacion_origen VARCHAR(15) NULL
                AFTER longitud
            """))
            print("[OK] columna ubicacion_origen creada")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
