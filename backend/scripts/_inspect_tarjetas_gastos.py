"""Inspeccion: estado de tarjetas y gastos pagados con tarjeta, por municipio.
Solo lectura. Para dimensionar el feature de descuento de tarjeta + curacion
de pagos previos.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== Tarjetas por municipio (activas) ===")
        r = await conn.execute(text("""
            SELECT municipio_id, COUNT(*) AS n
            FROM tarjetas_credito WHERE activo = 1
            GROUP BY municipio_id ORDER BY n DESC
        """))
        for row in r.fetchall():
            print(f"  muni {row[0]}: {row[1]} tarjetas")

        print("\n=== Gastos con forma_pago='tarjeta' por municipio ===")
        r = await conn.execute(text("""
            SELECT municipio_id,
                   COUNT(*) AS total,
                   SUM(CASE WHEN tarjeta_credito_id IS NOT NULL THEN 1 ELSE 0 END) AS con_tarjeta,
                   SUM(CASE WHEN tarjeta_credito_id IS NULL THEN 1 ELSE 0 END) AS sin_tarjeta,
                   COALESCE(SUM(monto_pesos),0) AS monto_total
            FROM gastos
            WHERE forma_pago = 'tarjeta' AND activo = 1
            GROUP BY municipio_id ORDER BY total DESC
        """))
        rows = r.fetchall()
        if not rows:
            print("  (no hay gastos con forma_pago='tarjeta')")
        for row in rows:
            print(f"  muni {row[0]}: total={row[1]} | con_tarjeta_id={row[2]} | SIN tarjeta_id={row[3]} | $={row[4]}")

        print("\n=== Muestra de gastos tarjeta SIN tarjeta_credito_id (a curar) ===")
        r = await conn.execute(text("""
            SELECT id, municipio_id, concepto, monto_pesos, fecha, observaciones
            FROM gastos
            WHERE forma_pago = 'tarjeta' AND activo = 1 AND tarjeta_credito_id IS NULL
            ORDER BY fecha DESC LIMIT 10
        """))
        for row in r.fetchall():
            print(f"  #{row[0]} muni{row[1]} | {row[2]} | ${row[3]} | {row[4]} | obs={row[5]}")
    await engine.dispose()
    print("\n[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
