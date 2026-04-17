"""Migracion: agrega tipo_pago + momento_pago a tramites y tipos_tasa.

Ejecutar: python -m scripts.migrate_tipo_pago
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import AsyncSessionLocal


async def column_exists(db, table: str, col: str) -> bool:
    r = await db.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": table, "c": col})
    return (r.scalar() or 0) > 0


async def add_col(db, table: str, col: str, definition: str):
    if await column_exists(db, table, col):
        print(f"  - {table}.{col} ya existe, skip")
        return
    print(f"  + ALTER TABLE {table} ADD COLUMN {col} {definition}")
    await db.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))


async def migrate():
    async with AsyncSessionLocal() as db:
        print("Agregando tipo_pago + momento_pago a tramites...")
        await add_col(db, "tramites", "tipo_pago", "VARCHAR(30) NULL")
        await add_col(db, "tramites", "momento_pago", "VARCHAR(10) NULL")

        print("\nAgregando tipo_pago + momento_pago a tipos_tasa...")
        await add_col(db, "tipos_tasa", "tipo_pago", "VARCHAR(30) NULL")
        await add_col(db, "tipos_tasa", "momento_pago", "VARCHAR(10) NULL")

        # Defaults razonables: tramites con costo > 0 → boton_pago + inicio
        print("\nSeteando defaults para tramites con costo > 0...")
        await db.execute(text(
            "UPDATE tramites SET tipo_pago='boton_pago', momento_pago='inicio' "
            "WHERE costo > 0 AND tipo_pago IS NULL"
        ))
        # Algunos trámites caros suelen cobrarse al final (certificados, libre deuda)
        await db.execute(text(
            "UPDATE tramites SET momento_pago='fin' "
            "WHERE momento_pago='inicio' AND ("
            "  LOWER(nombre) LIKE '%certificado%' OR "
            "  LOWER(nombre) LIKE '%libre deuda%' OR "
            "  LOWER(nombre) LIKE '%dominio%'"
            ")"
        ))
        # Tasas: default boton_pago + inicio
        await db.execute(text(
            "UPDATE tipos_tasa SET tipo_pago='boton_pago', momento_pago='inicio' "
            "WHERE tipo_pago IS NULL"
        ))
        await db.commit()
        print("OK")


if __name__ == "__main__":
    asyncio.run(migrate())
