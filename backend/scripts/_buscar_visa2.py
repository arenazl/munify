"""Busqueda exhaustiva de pagos relacionados a tarjeta/Visa en SPN (muni 80).
Mira gastos (activos e inactivos), pagos programados y catalogo de conceptos.
Solo lectura."""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402

MUNI = 80
PAT = "(visa|tarjeta|mastercard|amex)"

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== TODOS los conceptos distintos de gastos muni 80 (con conteo) ===")
        r = await conn.execute(text("""
            SELECT concepto, COUNT(*) n, SUM(monto_pesos) tot,
                   SUM(CASE WHEN activo=1 THEN 1 ELSE 0 END) activos
            FROM gastos WHERE municipio_id=:m
            GROUP BY concepto ORDER BY n DESC LIMIT 60
        """), {"m": MUNI})
        for x in r.fetchall():
            print(f"  {x[0]!r}: {x[1]} (activos={x[3]}) ${x[2]}")

        print("\n=== Gastos con patron tarjeta/visa en concepto/desc/obs (incl. inactivos) ===")
        r = await conn.execute(text("""
            SELECT id, concepto, monto_pesos, fecha, forma_pago, caja_id, activo
            FROM gastos WHERE municipio_id=:m AND (
                LOWER(concepto) REGEXP :p OR LOWER(COALESCE(descripcion,'')) REGEXP :p
                OR LOWER(COALESCE(observaciones,'')) REGEXP :p)
            ORDER BY fecha DESC LIMIT 50
        """), {"m": MUNI, "p": PAT})
        rows = r.fetchall()
        print(f"  ({len(rows)} encontrados)")
        for x in rows:
            print(f"  #{x[0]} | concepto={x[1]!r} | ${x[2]} | {x[3]} | fp={x[4]} | activo={x[6]}")

        print("\n=== Detalle desc/obs de los matches estrictos ===")
        r = await conn.execute(text("""
            SELECT id, concepto, descripcion, observaciones
            FROM gastos WHERE municipio_id=:m AND (
                LOWER(concepto) REGEXP :p OR LOWER(COALESCE(descripcion,'')) REGEXP :p
                OR LOWER(COALESCE(observaciones,'')) REGEXP :p)
            ORDER BY fecha DESC LIMIT 50
        """), {"m": MUNI, "p": PAT})
        for x in r.fetchall():
            print(f"  #{x[0]} concepto={x[1]!r} desc={x[2]!r} obs={x[3]!r}")

        print("\n=== Pagos programados (liquidaciones) con patron ===")
        try:
            r = await conn.execute(text("""
                SELECT id, concepto, monto_pesos, activo FROM tesoreria_pagos_programados
                WHERE municipio_id=:m AND LOWER(concepto) REGEXP :p LIMIT 30
            """), {"m": MUNI, "p": PAT})
            pp = r.fetchall()
            print(f"  ({len(pp)})")
            for x in pp:
                print(f"  #{x[0]} | {x[1]} | ${x[2]} | activo={x[3]}")
        except Exception as e:
            print(f"  (error: {e})")

        print("\n=== Catalogo de conceptos (tesoreria_conceptos) con patron ===")
        try:
            r = await conn.execute(text("""
                SELECT id, nombre, activo FROM tesoreria_conceptos
                WHERE municipio_id=:m AND LOWER(nombre) REGEXP :p
            """), {"m": MUNI, "p": PAT})
            for x in r.fetchall():
                print(f"  #{x[0]} | {x[1]} | activo={x[2]}")
        except Exception as e:
            print(f"  (error: {e})")
    await engine.dispose()
    print("\n[DONE]")

if __name__ == "__main__":
    asyncio.run(main())
