"""Cuenta gastos de SPN (muni 80) marcados como pagados con tarjeta/visa por
Bartolo (obs 'modo=visa'/'modo=tarjeta') o desc 'Visa'. Desglose por caja y mes.
Solo lectura."""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402

MUNI = 80
COND = """(LOWER(COALESCE(observaciones,'')) LIKE '%modo=visa%'
        OR LOWER(COALESCE(observaciones,'')) LIKE '%modo=tarjeta%'
        OR LOWER(COALESCE(descripcion,'')) = 'visa'
        OR forma_pago='tarjeta')"""

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        r = await conn.execute(text(f"""
            SELECT COUNT(*) n, COALESCE(SUM(monto_pesos),0) tot
            FROM gastos WHERE municipio_id=:m AND activo=1 AND {COND}
        """), {"m": MUNI})
        x = r.fetchone()
        print(f"TOTAL gastos con tarjeta/visa: {x[0]} pagos | ${x[1]:,.2f}")

        print("\n=== Desglose por caja asignada actual ===")
        r = await conn.execute(text(f"""
            SELECT caja_id, COUNT(*) n, COALESCE(SUM(monto_pesos),0) tot
            FROM gastos WHERE municipio_id=:m AND activo=1 AND {COND}
            GROUP BY caja_id ORDER BY n DESC
        """), {"m": MUNI})
        for row in r.fetchall():
            print(f"  caja_id={row[0]}: {row[1]} pagos | ${row[2]:,.2f}")

        print("\n=== Por mes (YYYY-MM) ===")
        r = await conn.execute(text(f"""
            SELECT DATE_FORMAT(fecha,'%Y-%m') ym, COUNT(*) n, COALESCE(SUM(monto_pesos),0) tot
            FROM gastos WHERE municipio_id=:m AND activo=1 AND {COND}
            GROUP BY ym ORDER BY ym DESC LIMIT 24
        """), {"m": MUNI})
        for row in r.fetchall():
            print(f"  {row[0]}: {row[1]} | ${row[2]:,.2f}")
    await engine.dispose()
    print("\n[DONE]")

if __name__ == "__main__":
    asyncio.run(main())
