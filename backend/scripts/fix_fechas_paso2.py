"""Paso 2: los gastos que quedaron en 2026 de San Pedro tambien son del
Excel 2025 (oct-nov-dic). Les resto otro año mas para que queden en 2025."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        result = await conn.execute(text("""
            UPDATE gastos
            SET fecha = DATE_SUB(fecha, INTERVAL 1 YEAR)
            WHERE municipio_id = 80 AND activo = 1 AND fecha >= '2026-01-01'
        """))
        print(f"Actualizadas {result.rowcount} filas (2026 -> 2025)")

        check = (await conn.execute(text("""
            SELECT YEAR(fecha) y, COUNT(*) c
            FROM gastos WHERE municipio_id = 80 AND activo = 1
            GROUP BY YEAR(fecha) ORDER BY y
        """))).fetchall()
        for x in check:
            print(f"  {x.y}: {x.c} gastos")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
