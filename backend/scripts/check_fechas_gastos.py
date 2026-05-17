"""Audita fechas de gastos por muni y año para entender qué se importó mal."""
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
        # Resumen general por anio
        rows = (await conn.execute(text("""
            SELECT YEAR(fecha) as anio, COUNT(*) as cant,
                   MIN(fecha) as min_f, MAX(fecha) as max_f,
                   SUM(monto_pesos) as total
            FROM gastos
            WHERE activo = 1
            GROUP BY YEAR(fecha)
            ORDER BY anio DESC
        """))).fetchall()
        print("=== TODOS LOS MUNIS ===")
        for r in rows:
            print(f"  {r.anio}: {r.cant} gastos · {r.min_f} → {r.max_f} · total ${float(r.total or 0):,.0f}")

        # Por muni
        munis = (await conn.execute(text("""
            SELECT m.id, m.codigo, m.nombre
            FROM municipios m
            ORDER BY m.id DESC
            LIMIT 10
        """))).fetchall()
        for m in munis:
            sub = (await conn.execute(text("""
                SELECT YEAR(fecha) as anio, COUNT(*) as cant,
                       MIN(fecha) as min_f, MAX(fecha) as max_f
                FROM gastos
                WHERE municipio_id = :mid AND activo = 1
                GROUP BY YEAR(fecha)
                ORDER BY anio DESC
            """), {"mid": m.id})).fetchall()
            if sub:
                print(f"\n=== MUNI {m.id} {m.codigo} ({m.nombre}) ===")
                for s in sub:
                    print(f"  {s.anio}: {s.cant} gastos · {s.min_f} → {s.max_f}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
