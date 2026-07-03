"""Migración: formato de OT (Fase 3).

ADITIVA:
  - tabla nueva `ot_tipos_trabajo` (catálogo configurable por muni).
  - columnas nuevas en `ordenes_trabajo`: `prioridad`, `tipo_trabajo_id`.

Idempotente: crea la tabla con IF NOT EXISTS y agrega las columnas solo si
no existen (chequeo en information_schema).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402


DDL_TIPOS = """
CREATE TABLE IF NOT EXISTS ot_tipos_trabajo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(50) NULL,
    color VARCHAR(20) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ot_tipo_muni_nombre (municipio_id, nombre),
    KEY ix_ot_tipo_municipio (municipio_id),
    CONSTRAINT fk_ot_tipo_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


async def _col_existe(conn, tabla: str, col: str) -> bool:
    row = (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})).scalar()
    return bool(row)


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text(DDL_TIPOS))
        print("OK: tabla ot_tipos_trabajo")

        if not await _col_existe(conn, "ordenes_trabajo", "prioridad"):
            await conn.execute(text(
                "ALTER TABLE ordenes_trabajo ADD COLUMN prioridad "
                "ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media' AFTER descripcion"
            ))
            print("OK: columna ordenes_trabajo.prioridad")
        else:
            print("SKIP: ordenes_trabajo.prioridad ya existe")

        if not await _col_existe(conn, "ordenes_trabajo", "tipo_trabajo_id"):
            await conn.execute(text(
                "ALTER TABLE ordenes_trabajo ADD COLUMN tipo_trabajo_id INT NULL AFTER prioridad, "
                "ADD KEY ix_ot_tipo_trabajo (tipo_trabajo_id), "
                "ADD CONSTRAINT fk_ot_tipo_trabajo FOREIGN KEY (tipo_trabajo_id) "
                "REFERENCES ot_tipos_trabajo(id) ON DELETE SET NULL"
            ))
            print("OK: columna ordenes_trabajo.tipo_trabajo_id")
        else:
            print("SKIP: ordenes_trabajo.tipo_trabajo_id ya existe")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
