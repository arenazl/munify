"""Migracion: agregar sub-flags `reclamos` y `tramites` a municipio_ia_config.

Espejo de `tesoreria`: permiten apagar el panel de IA de cada listado por
separado, sin tocar el resto de la IA del municipio. Default True (cuando la
IA general esta prendida, los paneles arrancan visibles, como hasta ahora).

Idempotente: chequea existencia de cada columna antes de agregarla.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


async def _col_existe(conn, col: str) -> bool:
    r = await conn.execute(text("""
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'municipio_ia_config'
          AND COLUMN_NAME = :col
    """), {"col": col})
    return r.fetchone() is not None


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for col in ("reclamos", "tramites"):
            if await _col_existe(conn, col):
                print(f"[SKIP] columna {col} ya existe")
                continue
            await conn.execute(text(f"""
                ALTER TABLE municipio_ia_config
                ADD COLUMN {col} TINYINT(1) NOT NULL DEFAULT 1
            """))
            print(f"[OK] columna {col} creada (default 1)")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
