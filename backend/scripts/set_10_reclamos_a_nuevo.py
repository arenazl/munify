"""Pasa 10 reclamos de La Matanza (municipio_id=78) de 'recibido' a 'nuevo'.

Sirve para probar el flujo de 'tomar el caso' desde el dashboard del supervisor.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text, bindparam
from core.config import settings

MUNICIPIO_ID = 78  # La Matanza
CANTIDAD = 10


async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        total_recibido = (await conn.execute(
            text("SELECT COUNT(*) FROM reclamos WHERE municipio_id = :m AND estado = 'recibido'"),
            {"m": MUNICIPIO_ID}
        )).scalar()
        print(f"Reclamos 'recibido' en La Matanza (m_id={MUNICIPIO_ID}): {total_recibido}")

        ids = [row[0] for row in (await conn.execute(
            text(
                "SELECT id FROM reclamos "
                "WHERE municipio_id = :m AND estado = 'recibido' "
                "ORDER BY created_at DESC LIMIT :n"
            ),
            {"m": MUNICIPIO_ID, "n": CANTIDAD}
        )).all()]
        print(f"IDs seleccionados ({len(ids)}): {ids}")

        if not ids:
            print("No hay reclamos 'recibido' para ese municipio. Nada que hacer.")
            return

        stmt = text(
            "UPDATE reclamos SET estado = 'nuevo' WHERE id IN :ids AND municipio_id = :m"
        ).bindparams(bindparam("ids", expanding=True))
        result = await conn.execute(stmt, {"ids": ids, "m": MUNICIPIO_ID})
        print(f"Reclamos actualizados a 'nuevo': {result.rowcount}")

        nuevo_count = (await conn.execute(
            text("SELECT COUNT(*) FROM reclamos WHERE municipio_id = :m AND estado = 'nuevo'"),
            {"m": MUNICIPIO_ID}
        )).scalar()
        recibido_count = (await conn.execute(
            text("SELECT COUNT(*) FROM reclamos WHERE municipio_id = :m AND estado = 'recibido'"),
            {"m": MUNICIPIO_ID}
        )).scalar()
        print(f"Conteos finales La Matanza -- nuevo: {nuevo_count} | recibido: {recibido_count}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
