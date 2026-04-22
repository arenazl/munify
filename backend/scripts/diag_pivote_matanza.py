"""Diagnostico: que cobertura tiene el pivote de Matanza."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

MUNICIPIO_ID = 78


async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== Entradas del pivote para Matanza ===")
        rows = (await conn.execute(text("""
            SELECT mdc.categoria_id, c.nombre AS cat_nombre,
                   d.nombre AS dep_nombre, mdc.municipio_dependencia_id
              FROM municipio_dependencia_categorias mdc
              JOIN categorias_reclamo c ON c.id = mdc.categoria_id
              JOIN dependencias d ON d.id = mdc.dependencia_id
             WHERE mdc.municipio_id = :m AND mdc.activo = TRUE
             ORDER BY cat_nombre
        """), {"m": MUNICIPIO_ID})).all()
        for r in rows:
            print(f"  cat_id={r[0]:4} | {r[1][:30]:30} -> {r[2][:40]}  (muni_dep_id={r[3]})")

        print("\n=== Categorias de reclamos 'nuevo' en Matanza ===")
        rows = (await conn.execute(text("""
            SELECT r.categoria_id, c.nombre, COUNT(*) AS n
              FROM reclamos r
              JOIN categorias_reclamo c ON c.id = r.categoria_id
             WHERE r.municipio_id = :m AND r.estado = 'nuevo'
             GROUP BY r.categoria_id, c.nombre
             ORDER BY n DESC
        """), {"m": MUNICIPIO_ID})).all()
        for r in rows:
            print(f"  cat_id={r[0]:4} | {r[1][:40]:40} n={r[2]}")

        print("\n=== Categorias de reclamos NULL dep_id en Matanza ===")
        rows = (await conn.execute(text("""
            SELECT r.categoria_id, c.nombre, COUNT(*) AS n
              FROM reclamos r
              JOIN categorias_reclamo c ON c.id = r.categoria_id
             WHERE r.municipio_id = :m AND r.municipio_dependencia_id IS NULL
             GROUP BY r.categoria_id, c.nombre
             ORDER BY n DESC
        """), {"m": MUNICIPIO_ID})).all()
        for r in rows:
            print(f"  cat_id={r[0]:4} | {r[1][:40]:40} n={r[2]}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
