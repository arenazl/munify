"""Modulo Recursos, Etapa 2: PRESENTISMO.

Una sola tabla nueva: `empleado_jornadas`, lo que el empleado REALMENTE
trabajo. Las otras dos patas ya existian (`empleado_horarios` = lo que debia,
`empleado_ausencias` = lo justificado).

Uso:
    DATABASE_URL=... python scripts/migrate_presentismo.py            # PLAN
    DATABASE_URL=... python scripts/migrate_presentismo.py --apply
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
CREATE TABLE `empleado_jornadas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `empleado_id` int NOT NULL,
  `fecha` date NOT NULL,
  `entrada_at` datetime DEFAULT NULL,
  `entrada_lat` float DEFAULT NULL,
  `entrada_lng` float DEFAULT NULL,
  `salida_at` datetime DEFAULT NULL,
  `salida_lat` float DEFAULT NULL,
  `salida_lng` float DEFAULT NULL,
  `origen` varchar(10) NOT NULL DEFAULT 'app',
  `observaciones` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jornada_empleado_dia` (`empleado_id`, `fecha`),
  KEY `ix_jornadas_municipio` (`municipio_id`),
  KEY `ix_jornadas_fecha` (`fecha`),
  CONSTRAINT `fk_jornada_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jornada_empleado` FOREIGN KEY (`empleado_id`)
    REFERENCES `empleados` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""


async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")
        existe = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema=DATABASE() AND table_name='empleado_jornadas'"
        ))).scalar()

    if existe:
        print("Nada que hacer: `empleado_jornadas` ya existe.")
        await engine.dispose()
        return

    print("1 pieza faltante:\n  - CREATE TABLE empleado_jornadas")
    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        await conn.execute(text(TABLA))
        print("OK: CREATE TABLE empleado_jornadas")
    await engine.dispose()
    print("\nListo. Re-correrlo debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
