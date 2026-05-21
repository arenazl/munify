"""Migracion: agrega columnas nro_factura + factura_url a la tabla gastos.

Mismo patron que en ordenes_pago. Permite adjuntar la factura del
proveedor al gasto (PDF o imagen via Cloudinary).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def _column_exists(conn, table: str, column: str) -> bool:
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    row = r.fetchone()
    return bool(row and row[0])


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        if not await _column_exists(conn, "gastos", "nro_factura"):
            await conn.execute(text("ALTER TABLE gastos ADD COLUMN nro_factura VARCHAR(50) NULL"))
            await conn.execute(text("CREATE INDEX ix_gastos_nro_factura ON gastos(nro_factura)"))
            print("[OK] columna nro_factura agregada a gastos")
        else:
            print("[SKIP] gastos.nro_factura ya existe")
        if not await _column_exists(conn, "gastos", "factura_url"):
            await conn.execute(text("ALTER TABLE gastos ADD COLUMN factura_url VARCHAR(500) NULL"))
            print("[OK] columna factura_url agregada a gastos")
        else:
            print("[SKIP] gastos.factura_url ya existe")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
