"""Migracion Fase 8 — pago en efectivo en caja del muni.

Cambios:
  1. ENUM pago_sesiones.medio_pago: agregar 'efectivo_ventanilla'.
  2. pagos: foto_comprobante_url VARCHAR(500) NULL +
           registrado_por_operador_id INT NULL FK usuarios.

Ejecutar: python backend/scripts/migrate_efectivo_ventanilla.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


async def _column_exists(conn, table, column):
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    return (res.scalar() or 0) > 0


async def _enum_has_value(conn, table, column, value):
    res = await conn.execute(text(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    return f"'{value}'" in str(res.scalar() or "")


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        if await _enum_has_value(conn, "pago_sesiones", "medio_pago", "efectivo_ventanilla"):
            print("SKIP enum medio_pago ya incluye 'efectivo_ventanilla'")
        else:
            await conn.execute(text(
                "ALTER TABLE pago_sesiones MODIFY COLUMN medio_pago "
                "ENUM('tarjeta','qr','efectivo_cupon','transferencia','debito_automatico','efectivo_ventanilla') "
                "NULL"
            ))
            print("OK   enum pago_sesiones.medio_pago extendido con 'efectivo_ventanilla'")

    async with engine.begin() as conn:
        for col, tipo in [
            ("foto_comprobante_url", "VARCHAR(500) NULL"),
            ("registrado_por_operador_id", "INT NULL"),
        ]:
            if await _column_exists(conn, "tasas_pagos", col):
                print(f"SKIP columna tasas_pagos.{col}")
                continue
            await conn.execute(text(f"ALTER TABLE tasas_pagos ADD COLUMN {col} {tipo}"))
            print(f"OK   columna tasas_pagos.{col} agregada")

    await engine.dispose()
    print("\nMigracion Fase 8 completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
