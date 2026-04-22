"""Backfill: asigna municipio_dependencia_id a reclamos con NULL,
usando el pivote municipio_dependencia_categorias.

Por defecto corre para La Matanza (municipio_id=78) pero se puede pasar otro.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

MUNICIPIO_ID = int(sys.argv[1]) if len(sys.argv) > 1 else 78


async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        null_before = (await conn.execute(text(
            "SELECT COUNT(*) FROM reclamos "
            "WHERE municipio_id = :m AND municipio_dependencia_id IS NULL"
        ), {"m": MUNICIPIO_ID})).scalar()
        print(f"Reclamos NULL antes (muni={MUNICIPIO_ID}): {null_before}")

        sin_pivote = (await conn.execute(text("""
            SELECT COUNT(*) FROM reclamos r
             WHERE r.municipio_id = :m
               AND r.municipio_dependencia_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM municipio_dependencia_categorias mdc
                  WHERE mdc.municipio_id = r.municipio_id
                    AND mdc.categoria_id = r.categoria_id
                    AND mdc.activo = TRUE
               )
        """), {"m": MUNICIPIO_ID})).scalar()
        print(f"Reclamos NULL que no matchean pivote (quedaran NULL): {sin_pivote}")

        result = await conn.execute(text("""
            UPDATE reclamos r
              JOIN (
                SELECT mdc.categoria_id, MIN(mdc.municipio_dependencia_id) AS mdep_id
                  FROM municipio_dependencia_categorias mdc
                 WHERE mdc.municipio_id = :m AND mdc.activo = TRUE
                 GROUP BY mdc.categoria_id
              ) p ON p.categoria_id = r.categoria_id
               SET r.municipio_dependencia_id = p.mdep_id
             WHERE r.municipio_id = :m
               AND r.municipio_dependencia_id IS NULL
        """), {"m": MUNICIPIO_ID})
        print(f"Reclamos actualizados: {result.rowcount}")

        null_after = (await conn.execute(text(
            "SELECT COUNT(*) FROM reclamos "
            "WHERE municipio_id = :m AND municipio_dependencia_id IS NULL"
        ), {"m": MUNICIPIO_ID})).scalar()
        print(f"Reclamos NULL despues: {null_after}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
