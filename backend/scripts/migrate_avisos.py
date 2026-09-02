"""Modulo Comunicacion, Etapa 1: campos de aviso sobre `noticias`.

ALTER ADITIVO e idempotente: todo nullable o con default, asi el backend
viejo sigue leyendo la tabla sin enterarse. Se puede correr ANTES del deploy.

Uso:
    DATABASE_URL=... python scripts/migrate_avisos.py            # PLAN
    DATABASE_URL=... python scripts/migrate_avisos.py --apply
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
    ("tipo", "ALTER TABLE `noticias` ADD COLUMN `tipo` varchar(20) NOT NULL DEFAULT 'aviso'"),
    ("fecha_desde", "ALTER TABLE `noticias` ADD COLUMN `fecha_desde` date NULL"),
    ("fecha_hasta", "ALTER TABLE `noticias` ADD COLUMN `fecha_hasta` date NULL"),
    ("fijado", "ALTER TABLE `noticias` ADD COLUMN `fijado` tinyint(1) NOT NULL DEFAULT 0"),
    ("enviado_at", "ALTER TABLE `noticias` ADD COLUMN `enviado_at` datetime NULL"),
    ("enviados_count", "ALTER TABLE `noticias` ADD COLUMN `enviados_count` int NOT NULL DEFAULT 0"),
    ("creador_id", "ALTER TABLE `noticias` ADD COLUMN `creador_id` int NULL"),
]

# El feed filtra por municipio + activo + vigencia en cada visita del vecino.
INDICES = [
    ("ix_noticias_municipio", "ALTER TABLE `noticias` ADD INDEX `ix_noticias_municipio` (`municipio_id`)"),
    ("ix_noticias_vigencia", "ALTER TABLE `noticias` ADD INDEX `ix_noticias_vigencia` (`activo`, `fecha_hasta`)"),
]


async def main():
    engine = create_async_engine(DATABASE_URL)
    pendientes = []
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")

        for col, sql in COLUMNAS:
            existe = (await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema=DATABASE() AND table_name='noticias' AND column_name=:c"
            ), {"c": col})).scalar()
            if not existe:
                pendientes.append((f"noticias.{col}", sql))

        for idx, sql in INDICES:
            existe = (await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema=DATABASE() AND table_name='noticias' AND index_name=:i"
            ), {"i": idx})).scalar()
            if not existe:
                pendientes.append((f"INDEX {idx}", sql))

    if not pendientes:
        print("Nada que hacer: la tabla ya esta al dia.")
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
