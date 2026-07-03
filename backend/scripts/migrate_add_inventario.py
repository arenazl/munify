"""Migración: módulo Inventario (categorías + ítems + recursos de OT).

100% ADITIVA: 3 tablas nuevas. No toca ninguna tabla existente.
  - inventario_categorias   (template configurable por muni, con naturaleza)
  - inventario_items        (activos + consumibles)
  - orden_trabajo_recursos  (pivot OT ↔ ítem: reserva / consumo)

Opt-in por `municipio_modulos.modulo = 'inventario'`.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402


DDL_CATEGORIAS = """
CREATE TABLE IF NOT EXISTS inventario_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    icono VARCHAR(50) NULL,
    color VARCHAR(20) NULL,
    naturaleza ENUM('activo','consumible') NOT NULL DEFAULT 'consumible',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inv_cat_muni_nombre (municipio_id, nombre),
    KEY ix_inv_cat_municipio (municipio_id),
    KEY ix_inv_cat_naturaleza (naturaleza),
    CONSTRAINT fk_inv_cat_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_ITEMS = """
CREATE TABLE IF NOT EXISTS inventario_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    categoria_id INT NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT NULL,
    naturaleza ENUM('activo','consumible') NOT NULL,
    stock_actual FLOAT NULL,
    stock_minimo FLOAT NULL,
    unidad VARCHAR(30) NULL,
    identificador VARCHAR(100) NULL,
    estado_activo ENUM('disponible','en_uso','mantenimiento','baja') NULL,
    ocupado_por_ot_id INT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    KEY ix_inv_item_municipio (municipio_id),
    KEY ix_inv_item_categoria (categoria_id),
    KEY ix_inv_item_naturaleza (naturaleza),
    KEY ix_inv_item_estado (estado_activo),
    KEY ix_inv_item_ocupado (ocupado_por_ot_id),
    CONSTRAINT fk_inv_item_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_item_categoria FOREIGN KEY (categoria_id) REFERENCES inventario_categorias(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_item_ot FOREIGN KEY (ocupado_por_ot_id) REFERENCES ordenes_trabajo(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_RECURSOS = """
CREATE TABLE IF NOT EXISTS orden_trabajo_recursos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_trabajo_id INT NOT NULL,
    item_id INT NOT NULL,
    tipo ENUM('reserva','consumo') NOT NULL,
    cantidad FLOAT NULL,
    item_nombre VARCHAR(200) NULL,
    aplicado TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ot_recurso (orden_trabajo_id, item_id),
    KEY ix_otr_rec_ot (orden_trabajo_id),
    KEY ix_otr_rec_item (item_id),
    CONSTRAINT fk_otr_rec_ot FOREIGN KEY (orden_trabajo_id) REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    CONSTRAINT fk_otr_rec_item FOREIGN KEY (item_id) REFERENCES inventario_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text(DDL_CATEGORIAS))
        print("OK: tabla inventario_categorias")
        await conn.execute(text(DDL_ITEMS))
        print("OK: tabla inventario_items")
        await conn.execute(text(DDL_RECURSOS))
        print("OK: tabla orden_trabajo_recursos")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
