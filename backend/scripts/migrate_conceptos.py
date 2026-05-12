"""Migracion: crea las tablas tesoreria_tipos_concepto + tesoreria_conceptos.

Reemplaza el JSON estatico (data/conceptos_gasto.json) por un catalogo
editable per-muni.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


SQL_TIPOS = """
CREATE TABLE IF NOT EXISTS tesoreria_tipos_concepto (
    id INT NOT NULL AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    color VARCHAR(20) NULL,
    icono VARCHAR(60) NULL,
    orden INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX ix_tipos_concepto_muni (municipio_id),
    INDEX ix_tipos_concepto_nombre (nombre),
    CONSTRAINT fk_tipos_concepto_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

SQL_CONCEPTOS = """
CREATE TABLE IF NOT EXISTS tesoreria_conceptos (
    id INT NOT NULL AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    tipo_concepto_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    orden INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX ix_conceptos_muni (municipio_id),
    INDEX ix_conceptos_tipo (tipo_concepto_id),
    INDEX ix_conceptos_nombre (nombre),
    CONSTRAINT fk_conceptos_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id),
    CONSTRAINT fk_conceptos_tipo FOREIGN KEY (tipo_concepto_id) REFERENCES tesoreria_tipos_concepto(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(SQL_TIPOS))
        print("[OK] tabla 'tesoreria_tipos_concepto' creada o ya existia")
        await conn.execute(text(SQL_CONCEPTOS))
        print("[OK] tabla 'tesoreria_conceptos' creada o ya existia")
    await engine.dispose()


if __name__ == '__main__':
    asyncio.run(migrate())
