import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        # Total de gastos con factura por municipio
        print("== Gastos con factura_url por municipio ==")
        r = await conn.execute(text(
            "SELECT g.municipio_id, m.nombre, COUNT(*) n "
            "FROM gastos g JOIN municipios m ON m.id=g.municipio_id "
            "WHERE g.factura_url IS NOT NULL AND g.factura_url <> '' "
            "GROUP BY g.municipio_id, m.nombre ORDER BY n DESC"
        ))
        for row in r.fetchall():
            print(" ", dict(row._mapping))
        print()
        # Detalle SPN (muni 80)
        print("== Facturas adjuntas de SPN (muni 80) ==")
        r = await conn.execute(text(
            "SELECT id, fecha, concepto, nro_factura, factura_url "
            "FROM gastos WHERE municipio_id=80 AND factura_url IS NOT NULL AND factura_url <> '' "
            "ORDER BY id"
        ))
        rows = r.fetchall()
        print(f"total: {len(rows)}\n")
        for row in rows:
            m = row._mapping
            print(f"  gasto#{m['id']} | {m['fecha']} | {m['concepto'][:30]}")
            print(f"     url: {m['factura_url']}")
    await engine.dispose()

asyncio.run(main())
