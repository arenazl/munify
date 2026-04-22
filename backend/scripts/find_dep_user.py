"""Buscar usuarios con municipio_dependencia_id asignado."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def find():
    e = create_async_engine(settings.DATABASE_URL)
    async with e.connect() as c:
        q = await c.execute(text(
            "SELECT email, rol, municipio_id, municipio_dependencia_id "
            "FROM usuarios "
            "WHERE municipio_id = 7 AND municipio_dependencia_id IS NOT NULL "
            "LIMIT 5"
        ))
        print("Chacabuco usuarios con dependencia:")
        for r in q.fetchall():
            print(" ", r)

        q = await c.execute(text(
            "SELECT email, rol, municipio_id, municipio_dependencia_id "
            "FROM usuarios "
            "WHERE municipio_id = 78 AND municipio_dependencia_id IS NOT NULL "
            "LIMIT 5"
        ))
        print("La Matanza usuarios con dependencia:")
        for r in q.fetchall():
            print(" ", r)

    await e.dispose()


if __name__ == "__main__":
    asyncio.run(find())
