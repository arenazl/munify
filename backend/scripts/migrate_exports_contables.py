"""Migracion Fase 4 — historial de exportaciones contables.

Crea la tabla `exportaciones_imputacion` para dejar audit trail de cada
archivo batch generado (quien lo pidio, rango de fechas, formato, cuantos
pagos incluia). NO almacenamos el archivo — se regenera on-demand a partir
de `session_ids`.

Ejecutar: python backend/scripts/migrate_exports_contables.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


async def _table_exists(conn, table: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
    ), {"t": table})
    return (res.scalar() or 0) > 0


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        if await _table_exists(conn, "exportaciones_imputacion"):
            print("SKIP tabla exportaciones_imputacion (ya existe)")
        else:
            await conn.execute(text(
                """
                CREATE TABLE exportaciones_imputacion (
                    id                 INT AUTO_INCREMENT PRIMARY KEY,
                    municipio_id       INT          NOT NULL,
                    formato            VARCHAR(40)  NOT NULL,
                    fecha_desde        DATE         NULL,
                    fecha_hasta        DATE         NULL,
                    cantidad_pagos     INT          NOT NULL DEFAULT 0,
                    monto_total        DECIMAL(14, 2) NOT NULL DEFAULT 0,
                    session_ids        JSON         NULL,
                    generado_por_usuario_id INT     NULL,
                    filtros            JSON         NULL,
                    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX ix_ei_muni_fecha (municipio_id, created_at),
                    CONSTRAINT fk_ei_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
                    CONSTRAINT fk_ei_user FOREIGN KEY (generado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            ))
            print("OK   tabla exportaciones_imputacion creada")
    await engine.dispose()
    print("\nMigracion Fase 4 completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
