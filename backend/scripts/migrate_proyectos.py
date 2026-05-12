"""Migracion ad-hoc: crea las tablas proyectos y gasto_proyectos.

Modulo Tesoreria - feature de proyectos (control de obras / iniciativas
con varios gastos imputados N:M).

Idempotente: usa CREATE TABLE IF NOT EXISTS.
"""
import asyncio
import sys
from pathlib import Path

# Permitir ejecutar el script directamente desde la raiz del repo
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


SQL_PROYECTOS = """
CREATE TABLE IF NOT EXISTS proyectos (
    id INT NOT NULL AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    presupuesto DECIMAL(15, 2) NULL,
    fecha_inicio DATE NULL,
    fecha_fin DATE NULL,
    estado ENUM('activo', 'pausado', 'finalizado') NOT NULL DEFAULT 'activo',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX ix_proyectos_municipio_id (municipio_id),
    INDEX ix_proyectos_nombre (nombre),
    INDEX ix_proyectos_estado (estado),
    CONSTRAINT fk_proyectos_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

SQL_GASTO_PROYECTOS = """
CREATE TABLE IF NOT EXISTS gasto_proyectos (
    id INT NOT NULL AUTO_INCREMENT,
    gasto_id INT NOT NULL,
    proyecto_id INT NOT NULL,
    monto_asignado DECIMAL(15, 2) NOT NULL,
    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_gasto_proyecto (gasto_id, proyecto_id),
    INDEX ix_gp_gasto (gasto_id),
    INDEX ix_gp_proyecto (proyecto_id),
    CONSTRAINT fk_gp_gasto FOREIGN KEY (gasto_id) REFERENCES gastos(id) ON DELETE CASCADE,
    CONSTRAINT fk_gp_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(SQL_PROYECTOS))
        print("[OK] tabla 'proyectos' creada o ya existia")
        await conn.execute(text(SQL_GASTO_PROYECTOS))
        print("[OK] tabla 'gasto_proyectos' creada o ya existia")
    await engine.dispose()
    print("\nMigracion completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
