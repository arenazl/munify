"""Migracion: crea tabla municipio_proveedores_pago.

Ejecutar: python -m scripts.migrate_proveedores_pago
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import AsyncSessionLocal


SQL = """
CREATE TABLE IF NOT EXISTS municipio_proveedores_pago (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    proveedor VARCHAR(50) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 0,
    productos_activos JSON NULL,
    metadata_importada JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_muni_proveedor (municipio_id, proveedor),
    INDEX ix_muni (municipio_id),
    INDEX ix_prov (proveedor),
    CONSTRAINT fk_proveedor_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


async def migrate():
    async with AsyncSessionLocal() as db:
        print("Creando tabla municipio_proveedores_pago...")
        await db.execute(text(SQL))
        await db.commit()
        print("OK")


if __name__ == "__main__":
    asyncio.run(migrate())
