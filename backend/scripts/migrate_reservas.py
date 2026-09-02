"""Modulo Recursos, Etapa 3: RESERVAS.

Una tabla nueva (`reservas`) y un flag en el activo (`reservable`): un bien
prestable es un ACTIVO de inventario habilitado para prestarse, no una
entidad nueva.

Uso:
    DATABASE_URL=... python scripts/migrate_reservas.py            # PLAN
    DATABASE_URL=... python scripts/migrate_reservas.py --apply
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

TABLA = """
CREATE TABLE `reservas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `item_id` int NOT NULL,
  `solicitante_id` int DEFAULT NULL,
  `solicitante_nombre` varchar(150) NOT NULL,
  `solicitante_telefono` varchar(50) DEFAULT NULL,
  `fecha_desde` date NOT NULL,
  `fecha_hasta` date NOT NULL,
  `motivo` text,
  `estado` varchar(20) NOT NULL DEFAULT 'solicitada',
  `motivo_rechazo` text,
  `resuelto_por_id` int DEFAULT NULL,
  `resuelto_at` datetime DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_reservas_municipio` (`municipio_id`),
  KEY `ix_reservas_item` (`item_id`),
  KEY `ix_reservas_estado` (`estado`),
  KEY `ix_reservas_rango` (`item_id`, `fecha_desde`, `fecha_hasta`),
  CONSTRAINT `fk_reserva_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reserva_item` FOREIGN KEY (`item_id`)
    REFERENCES `inventario_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reserva_solicitante` FOREIGN KEY (`solicitante_id`)
    REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reserva_resuelto_por` FOREIGN KEY (`resuelto_por_id`)
    REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""

COLUMNA = ("reservable",
           "ALTER TABLE `inventario_items` ADD COLUMN `reservable` tinyint(1) NOT NULL DEFAULT 0")


async def main():
    engine = create_async_engine(DATABASE_URL)
    pendientes = []
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")

        if not (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema=DATABASE() AND table_name='reservas'"
        ))).scalar():
            pendientes.append(("CREATE TABLE reservas", TABLA))

        if not (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema=DATABASE() AND table_name='inventario_items' AND column_name='reservable'"
        ))).scalar():
            pendientes.append((f"inventario_items.{COLUMNA[0]}", COLUMNA[1]))

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
