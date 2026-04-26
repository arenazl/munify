"""
Migracion idempotente: agrega `tipo_jerarquico` a `dependencias` + indice.

Pensado para correr local y en Heroku (heroku run python -m scripts.migrate_dependencia_jerarquia).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


SQL_ADD_COLUMN = """
ALTER TABLE dependencias
ADD COLUMN tipo_jerarquico ENUM('SECRETARIA','DIRECCION') NOT NULL DEFAULT 'SECRETARIA'
AFTER tipo_gestion
"""

SQL_CREATE_INDEX = "CREATE INDEX idx_dep_tipo_jerarquico ON dependencias (tipo_jerarquico)"


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        col_exists = (await conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'dependencias'
              AND column_name = 'tipo_jerarquico'
        """))).scalar()

        if col_exists:
            print("OK: columna tipo_jerarquico ya existe")
        else:
            await conn.execute(text(SQL_ADD_COLUMN))
            print("OK: columna tipo_jerarquico creada (default SECRETARIA)")

        idx_exists = (await conn.execute(text("""
            SELECT COUNT(*) FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = 'dependencias'
              AND index_name = 'idx_dep_tipo_jerarquico'
        """))).scalar()

        if idx_exists:
            print("OK: indice idx_dep_tipo_jerarquico ya existe")
        else:
            await conn.execute(text(SQL_CREATE_INDEX))
            print("OK: indice idx_dep_tipo_jerarquico creado")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
