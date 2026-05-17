"""Verifica años en bartolo_raw (staging) vs gastos (final)."""
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
        # Tablas relevantes
        existe = (await conn.execute(text("""
            SELECT TABLE_NAME FROM information_schema.tables
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'bartolo%'
        """))).fetchall()
        print("Tablas bartolo:", [r[0] for r in existe])

        if any(r[0] == 'bartolo_raw' for r in existe):
            r = (await conn.execute(text("""
                SELECT anio, COUNT(*) cant, MIN(mes) min_m, MAX(mes) max_m
                FROM bartolo_raw GROUP BY anio ORDER BY anio
            """))).fetchall()
            print("\n=== bartolo_raw (staging) ===")
            for x in r:
                print(f"  {x.anio}: {x.cant} regs · meses {x.min_m}-{x.max_m}")

        # Verifico el detalle de gastos por origen
        print("\n=== gastos San Pedro Norte (80) — agrupado por año y mes ===")
        r = (await conn.execute(text("""
            SELECT YEAR(fecha) y, MONTH(fecha) m, COUNT(*) cant
            FROM gastos WHERE municipio_id = 80 AND activo = 1
            GROUP BY YEAR(fecha), MONTH(fecha)
            ORDER BY y, m
        """))).fetchall()
        for x in r:
            print(f"  {x.y}-{x.m:02d}: {x.cant}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
