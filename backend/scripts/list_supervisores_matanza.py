"""Lista supervisores demo de Matanza."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        rows = (await conn.execute(text("""
            SELECT u.email, u.rol, u.municipio_dependencia_id, d.nombre
              FROM usuarios u
              LEFT JOIN municipio_dependencias md ON md.id = u.municipio_dependencia_id
              LEFT JOIN dependencias d ON d.id = md.dependencia_id
             WHERE u.municipio_id = 78 AND u.rol IN ('supervisor','admin')
             ORDER BY u.rol, u.email
             LIMIT 20
        """))).all()
        for r in rows:
            print(r)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
