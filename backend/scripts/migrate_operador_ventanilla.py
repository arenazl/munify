"""Migracion Fase 6 — Operador de Ventanilla (modo kiosco).

Cambios:
  1. usuarios.rol ENUM: sumar 'operador_ventanilla' al set de valores.
  2. solicitudes:
       - canal VARCHAR(30) NULL default 'app'
       - operador_user_id INT NULL FK usuarios
       - validacion_presencial_at DATETIME NULL
       - dj_validacion_presencial TEXT NULL
  3. pago_sesiones:
       - canal VARCHAR(30) NULL default 'app'
       - operador_user_id INT NULL FK usuarios

Backfill: nada (todas las filas existentes quedan con canal=NULL, la UI
muestra 'app' como default).

Ejecutar: python backend/scripts/migrate_operador_ventanilla.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


async def _column_exists(conn, table: str, column: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    return (res.scalar() or 0) > 0


async def _enum_has_value(conn, table: str, column: str, value: str) -> bool:
    res = await conn.execute(text(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    col_type = res.scalar() or ""
    return f"'{value}'" in str(col_type)


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # 1) ENUM usuarios.rol
    async with engine.begin() as conn:
        if await _enum_has_value(conn, "usuarios", "rol", "operador_ventanilla"):
            print("SKIP enum usuarios.rol ya incluye 'operador_ventanilla'")
        else:
            await conn.execute(text(
                "ALTER TABLE usuarios MODIFY COLUMN rol "
                "ENUM('vecino','empleado','supervisor','admin','operador_ventanilla') "
                "NOT NULL DEFAULT 'vecino'"
            ))
            print("OK   usuarios.rol enum extendido con 'operador_ventanilla'")

    # 2) Columnas en solicitudes
    async with engine.begin() as conn:
        for col, tipo in [
            ("canal", "VARCHAR(30) NULL"),
            ("operador_user_id", "INT NULL"),
            ("validacion_presencial_at", "DATETIME NULL"),
            ("dj_validacion_presencial", "TEXT NULL"),
        ]:
            if await _column_exists(conn, "solicitudes", col):
                print(f"SKIP columna solicitudes.{col}")
                continue
            await conn.execute(text(f"ALTER TABLE solicitudes ADD COLUMN {col} {tipo}"))
            print(f"OK   columna solicitudes.{col} agregada")

    # 3) Columnas en pago_sesiones
    async with engine.begin() as conn:
        for col, tipo in [
            ("canal", "VARCHAR(30) NULL"),
            ("operador_user_id", "INT NULL"),
        ]:
            if await _column_exists(conn, "pago_sesiones", col):
                print(f"SKIP columna pago_sesiones.{col}")
                continue
            await conn.execute(text(f"ALTER TABLE pago_sesiones ADD COLUMN {col} {tipo}"))
            print(f"OK   columna pago_sesiones.{col} agregada")

    await engine.dispose()
    print("\nMigracion Fase 6 completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
