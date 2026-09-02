"""Migración: depósitos, movimientos de stock y órdenes de compra.

Cierra el agujero que el dueño marcó el 2026-08-31: la pantalla de
Configuración prometía "entradas, salidas y ajustes de stock", "órdenes de
compra y reposición" y "depósitos: central, corralón y vivero", y ninguna de
las tres existía. El stock sólo se movía como efecto colateral de completar
una orden de trabajo.

ADITIVA salvo una columna:
  + inventario_depositos             (dónde está guardada cada cosa)
  + inventario_movimientos           (el libro del depósito: TODO cambio deja renglón)
  + inventario_ordenes_compra        (reposición)
  + inventario_orden_compra_lineas   (sus renglones)
  ~ inventario_items.deposito_id     (NULL para lo que ya existía)

Idempotente: se puede correr las veces que haga falta.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402


DDL_DEPOSITOS = """
CREATE TABLE IF NOT EXISTS inventario_depositos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    direccion VARCHAR(200) NULL,
    responsable VARCHAR(120) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deposito_muni_nombre (municipio_id, nombre),
    KEY ix_inv_dep_municipio (municipio_id),
    CONSTRAINT fk_inv_dep_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_ORDENES_COMPRA = """
CREATE TABLE IF NOT EXISTS inventario_ordenes_compra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    numero VARCHAR(30) NOT NULL,
    proveedor VARCHAR(200) NULL,
    estado ENUM('borrador','enviada','recibida_parcial','recibida','cancelada')
        NOT NULL DEFAULT 'borrador',
    deposito_id INT NULL,
    fecha DATE NULL,
    fecha_esperada DATE NULL,
    total_estimado DOUBLE NULL,
    notas TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    KEY ix_inv_oc_municipio (municipio_id),
    KEY ix_inv_oc_numero (numero),
    KEY ix_inv_oc_estado (estado),
    CONSTRAINT fk_inv_oc_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_oc_deposito FOREIGN KEY (deposito_id) REFERENCES inventario_depositos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_OC_LINEAS = """
CREATE TABLE IF NOT EXISTS inventario_orden_compra_lineas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_compra_id INT NOT NULL,
    item_id INT NOT NULL,
    item_nombre VARCHAR(200) NULL,
    cantidad DOUBLE NOT NULL DEFAULT 0,
    cantidad_recibida DOUBLE NOT NULL DEFAULT 0,
    precio_unitario DOUBLE NULL,
    KEY ix_inv_ocl_orden (orden_compra_id),
    KEY ix_inv_ocl_item (item_id),
    CONSTRAINT fk_inv_ocl_orden FOREIGN KEY (orden_compra_id) REFERENCES inventario_ordenes_compra(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_ocl_item FOREIGN KEY (item_id) REFERENCES inventario_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_MOVIMIENTOS = """
CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    item_id INT NOT NULL,
    tipo ENUM('entrada','salida','ajuste','consumo_ot','reserva_ot','devolucion_ot') NOT NULL,
    cantidad DOUBLE NOT NULL DEFAULT 0,
    stock_resultante DOUBLE NULL,
    deposito_id INT NULL,
    contraparte VARCHAR(160) NULL,
    motivo TEXT NULL,
    orden_trabajo_id INT NULL,
    orden_compra_id INT NULL,
    usuario_id INT NULL,
    usuario_nombre VARCHAR(160) NULL,
    item_nombre VARCHAR(200) NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY ix_inv_mov_municipio (municipio_id),
    KEY ix_inv_mov_item (item_id),
    KEY ix_inv_mov_tipo (tipo),
    KEY ix_inv_mov_fecha (fecha),
    KEY ix_inv_mov_ot (orden_trabajo_id),
    KEY ix_inv_mov_oc (orden_compra_id),
    CONSTRAINT fk_inv_mov_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_mov_item FOREIGN KEY (item_id) REFERENCES inventario_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_mov_deposito FOREIGN KEY (deposito_id) REFERENCES inventario_depositos(id) ON DELETE SET NULL,
    CONSTRAINT fk_inv_mov_ot FOREIGN KEY (orden_trabajo_id) REFERENCES ordenes_trabajo(id) ON DELETE SET NULL,
    CONSTRAINT fk_inv_mov_oc FOREIGN KEY (orden_compra_id) REFERENCES inventario_ordenes_compra(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


async def _existe_columna(conn, tabla: str, columna: str) -> bool:
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": columna})
    return (r.scalar() or 0) > 0


async def migrate():
    async with engine.begin() as conn:
        # El orden importa: las FK apuntan hacia atrás.
        for nombre, ddl in (
            ("inventario_depositos", DDL_DEPOSITOS),
            ("inventario_ordenes_compra", DDL_ORDENES_COMPRA),
            ("inventario_orden_compra_lineas", DDL_OC_LINEAS),
            ("inventario_movimientos", DDL_MOVIMIENTOS),
        ):
            await conn.execute(text(ddl))
            print(f"  OK  tabla {nombre}")

        if await _existe_columna(conn, "inventario_items", "deposito_id"):
            print("  --  inventario_items.deposito_id ya existía")
        else:
            await conn.execute(text(
                "ALTER TABLE inventario_items ADD COLUMN deposito_id INT NULL, "
                "ADD KEY ix_inv_item_deposito (deposito_id), "
                "ADD CONSTRAINT fk_inv_item_deposito FOREIGN KEY (deposito_id) "
                "REFERENCES inventario_depositos(id) ON DELETE SET NULL"
            ))
            print("  OK  inventario_items.deposito_id")

    await engine.dispose()
    print("\nMigración completa.")


if __name__ == "__main__":
    asyncio.run(migrate())
