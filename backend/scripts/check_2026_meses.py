import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        r = (await conn.execute(text("""
            SELECT MONTH(fecha) m, COUNT(*) c
            FROM gastos WHERE municipio_id=80 AND activo=1 AND YEAR(fecha)=2026
            GROUP BY MONTH(fecha) ORDER BY m
        """))).fetchall()
        print("Gastos San Pedro 2026 por mes:")
        for x in r: print(f"  {x.m:02d}: {x.c}")
    await engine.dispose()

asyncio.run(main())
