"""Verifica pivote municipio_dependencia_categorias + sample reclamos de Matanza."""
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
        pivote_count = (await conn.execute(
            text("SELECT COUNT(*) FROM municipio_dependencia_categorias WHERE municipio_id = :m"),
            {"m": MUNICIPIO_ID}
        )).scalar()
        print(f"Pivote municipio_dependencia_categorias para Matanza: {pivote_count}")

        rows = (await conn.execute(
            text(
                "SELECT id, categoria_id, municipio_dependencia_id, estado "
                "FROM reclamos WHERE municipio_id = :m AND estado = 'nuevo' "
                "ORDER BY id DESC LIMIT 15"
            ),
            {"m": MUNICIPIO_ID}
        )).all()
        print("\nReclamos 'nuevo' en Matanza (id, categoria_id, dep_id, estado):")
        for r in rows:
            print(f"  {r}")

        null_count = (await conn.execute(
            text(
                "SELECT COUNT(*) FROM reclamos "
                "WHERE municipio_id = :m AND municipio_dependencia_id IS NULL"
            ),
            {"m": MUNICIPIO_ID}
        )).scalar()
        total = (await conn.execute(
            text("SELECT COUNT(*) FROM reclamos WHERE municipio_id = :m"),
            {"m": MUNICIPIO_ID}
        )).scalar()
        print(f"\nReclamos Matanza con dep_id NULL: {null_count} / {total}")

        # dependencias habilitadas para matanza
        deps_muni = (await conn.execute(
            text(
                "SELECT md.id, d.nombre FROM municipio_dependencias md "
                "JOIN dependencias d ON d.id = md.dependencia_id "
                "WHERE md.municipio_id = :m AND md.activo = TRUE"
            ),
            {"m": MUNICIPIO_ID}
        )).all()
        print(f"\nDependencias habilitadas Matanza: {len(deps_muni)}")
        for d in deps_muni[:20]:
            print(f"  muni_dep_id={d[0]} nombre={d[1]}")

        # categorias habilitadas
        cats_count = (await conn.execute(
            text("SELECT COUNT(*) FROM municipio_categorias WHERE municipio_id = :m AND activo = TRUE"),
            {"m": MUNICIPIO_ID}
        )).scalar()
        print(f"\nCategorias habilitadas Matanza: {cats_count}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
