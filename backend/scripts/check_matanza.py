"""Chequea La Matanza: municipio id y reclamos en recibido."""
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
        munis = (await conn.execute(
            text("SELECT id, codigo, nombre FROM municipios WHERE nombre LIKE '%atanza%' OR codigo LIKE '%atanza%'")
        )).all()
        print("Municipios que matchean 'matanza':")
        for m in munis:
            print(f"  id={m[0]} codigo={m[1]} nombre={m[2]}")

        if not munis:
            print("  (ninguno)")
            # mostrar todos para debug
            todos = (await conn.execute(text("SELECT id, codigo, nombre FROM municipios ORDER BY id"))).all()
            print("\nTodos los municipios:")
            for m in todos:
                print(f"  id={m[0]} codigo={m[1]} nombre={m[2]}")
            return

        for m in munis:
            muni_id = m[0]
            conteo = (await conn.execute(
                text("SELECT COUNT(*) FROM reclamos WHERE municipio_id = :mid AND estado = 'recibido'"),
                {"mid": muni_id}
            )).scalar()
            print(f"\nReclamos en 'recibido' para municipio_id={muni_id}: {conteo}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
