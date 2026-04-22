"""Find admin de La Matanza y partida con deuda para smoke test de pagos."""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def find():
    e = create_async_engine(settings.DATABASE_URL)
    async with e.connect() as c:
        q = await c.execute(text(
            "SELECT email, rol, municipio_id FROM usuarios "
            "WHERE municipio_id = 78 AND rol = 'admin' LIMIT 5"
        ))
        print("Admins LM:")
        for r in q.fetchall():
            print(" ", r)

        q = await c.execute(text(
            "SELECT p.id, p.identificador, p.titular_user_id, d.id as deuda_id, "
            "d.estado "
            "FROM tasas_partidas p "
            "JOIN tasas_deudas d ON d.partida_id = p.id "
            "WHERE p.municipio_id = 78 AND d.estado IN ('pendiente','vencida') "
            "LIMIT 3"
        ))
        print("Partidas con deuda LM:")
        for r in q.fetchall():
            print(" ", r)

        q = await c.execute(text(
            "SELECT u.email, u.id, p.id as partida_id, d.id as deuda_id "
            "FROM usuarios u "
            "JOIN tasas_partidas p ON p.titular_user_id = u.id "
            "JOIN tasas_deudas d ON d.partida_id = p.id "
            "WHERE p.municipio_id = 78 AND d.estado IN ('pendiente','vencida') "
            "LIMIT 5"
        ))
        print("Vecinos con deuda (email/user_id/partida_id/deuda_id):")
        for r in q.fetchall():
            print(" ", r)

    await e.dispose()


if __name__ == "__main__":
    asyncio.run(find())
