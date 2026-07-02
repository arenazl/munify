"""Inspeccion: cajas existentes + gastos relacionados a tarjeta (gastos CON
tarjeta y PAGOS de tarjeta tipo 'Visa'). Solo lectura, muni 80 (SPN)."""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402

MUNI = 80

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("=== Cajas del muni 80 ===")
        r = await conn.execute(text("""
            SELECT id, nombre, codigo, activo FROM tesoreria_cajas
            WHERE municipio_id = :m ORDER BY orden
        """), {"m": MUNI})
        for row in r.fetchall():
            print(f"  #{row[0]} {row[1]} [{row[2]}] activo={row[3]}")

        print("\n=== Gastos con forma_pago='tarjeta' (gastos HECHOS con tarjeta -> suman) ===")
        r = await conn.execute(text("""
            SELECT id, concepto, monto_pesos, fecha, caja_id, tarjeta_credito_id
            FROM gastos WHERE municipio_id=:m AND forma_pago='tarjeta' AND activo=1
            ORDER BY fecha DESC
        """), {"m": MUNI})
        for row in r.fetchall():
            print(f"  #{row[0]} | {row[1]} | ${row[2]} | {row[3]} | caja={row[4]} | tarj={row[5]}")

        print("\n=== Gastos con 'visa/tarjeta/master/credito' en el CONCEPTO (posible PAGO de tarjeta -> resta) ===")
        r = await conn.execute(text("""
            SELECT id, concepto, monto_pesos, fecha, forma_pago, caja_id, tarjeta_credito_id
            FROM gastos
            WHERE municipio_id=:m AND activo=1 AND (
                LOWER(concepto) LIKE '%visa%' OR LOWER(concepto) LIKE '%tarjeta%'
                OR LOWER(concepto) LIKE '%master%' OR LOWER(concepto) LIKE '%amex%'
                OR LOWER(concepto) LIKE '%credito%' OR LOWER(concepto) LIKE '%crédito%'
            )
            ORDER BY fecha DESC
        """), {"m": MUNI})
        rows = r.fetchall()
        if not rows:
            print("  (ninguno)")
        for row in rows:
            print(f"  #{row[0]} | {row[1]} | ${row[2]} | {row[3]} | fp={row[4]} | caja={row[5]} | tarj={row[6]}")
    await engine.dispose()
    print("\n[DONE]")

if __name__ == "__main__":
    asyncio.run(main())
