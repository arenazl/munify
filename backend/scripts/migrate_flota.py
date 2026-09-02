"""Modulo Recursos, Etapa 1: FLOTA.

Dos cosas:
  1. Campos de flota sobre `inventario_items` (ALTER aditivo, todo nullable):
     un vehiculo del municipio ES un activo de inventario, no una tabla nueva.
  2. Tabla `flota_cargas`: la carga de combustible, que es un hecho y no un
     bien. De ahi sale el consumo cada 100 km.

Ver docs/recursos/01-modulo-recursos.md

Uso:
    DATABASE_URL=... python scripts/migrate_flota.py            # PLAN
    DATABASE_URL=... python scripts/migrate_flota.py --apply
"""
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.environ.get("DATABASE_URL") or sys.exit(
    "FALTA DATABASE_URL en el entorno (mysql+aiomysql://...). Sin fallback: corto aca."
)
APLICAR = "--apply" in sys.argv

COLUMNAS = [
    ("marca_modelo", "ALTER TABLE `inventario_items` ADD COLUMN `marca_modelo` varchar(120) NULL"),
    ("anio", "ALTER TABLE `inventario_items` ADD COLUMN `anio` int NULL"),
    ("km_actual", "ALTER TABLE `inventario_items` ADD COLUMN `km_actual` int NULL"),
    ("tipo_combustible", "ALTER TABLE `inventario_items` ADD COLUMN `tipo_combustible` varchar(20) NULL"),
    ("vencimiento_vtv", "ALTER TABLE `inventario_items` ADD COLUMN `vencimiento_vtv` date NULL"),
    ("vencimiento_seguro", "ALTER TABLE `inventario_items` ADD COLUMN `vencimiento_seguro` date NULL"),
    ("km_proximo_service", "ALTER TABLE `inventario_items` ADD COLUMN `km_proximo_service` int NULL"),
]

TABLA_CARGAS = """
CREATE TABLE `flota_cargas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `item_id` int NOT NULL,
  `fecha` date NOT NULL,
  `litros` float NOT NULL,
  `importe` decimal(15,2) DEFAULT NULL,
  `km` int DEFAULT NULL,
  `empleado_id` int DEFAULT NULL,
  `gasto_id` int DEFAULT NULL,
  `observaciones` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_flota_cargas_municipio` (`municipio_id`),
  KEY `ix_flota_cargas_item` (`item_id`),
  KEY `ix_flota_cargas_fecha` (`fecha`),
  CONSTRAINT `fk_flota_carga_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_flota_carga_item` FOREIGN KEY (`item_id`)
    REFERENCES `inventario_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_flota_carga_empleado` FOREIGN KEY (`empleado_id`)
    REFERENCES `empleados` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_flota_carga_gasto` FOREIGN KEY (`gasto_id`)
    REFERENCES `gastos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""


async def main():
    engine = create_async_engine(DATABASE_URL)
    pendientes = []
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")

        existe_tabla = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema=DATABASE() AND table_name='flota_cargas'"
        ))).scalar()
        if not existe_tabla:
            pendientes.append(("CREATE TABLE flota_cargas", TABLA_CARGAS))

        for col, sql in COLUMNAS:
            existe = (await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema=DATABASE() AND table_name='inventario_items' AND column_name=:c"
            ), {"c": col})).scalar()
            if not existe:
                pendientes.append((f"inventario_items.{col}", sql))

    if not pendientes:
        print("Nada que hacer: el schema ya esta al dia.")
        await engine.dispose()
        return

    print(f"{len(pendientes)} piezas faltantes:")
    for nombre, _ in pendientes:
        print(f"  - {nombre}")

    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        for nombre, sql in pendientes:
            await conn.execute(text(sql))
            print(f"OK: {nombre}")
    await engine.dispose()
    print("\nListo. Re-correrlo debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
