"""Modulo Comunicacion, Etapa 2: campos de OBRA PUBLICA sobre `proyectos`.

El proyecto ya existia como contenedor de gastos (puertas adentro). Esto es
lo que le falta para poder MOSTRARSELO al vecino: si se publica, como viene,
cuanto avanzo, su foto y donde queda.
Ver docs/comunicacion/01-modulo-comunicacion.md

ALTER ADITIVO e idempotente: todo nullable o con default, asi el backend
viejo sigue leyendo la tabla sin enterarse. Se puede correr ANTES del deploy.

Uso:
    DATABASE_URL=... python scripts/migrate_obras.py            # PLAN
    DATABASE_URL=... python scripts/migrate_obras.py --apply
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
    ("publico", "ALTER TABLE `proyectos` ADD COLUMN `publico` tinyint(1) NOT NULL DEFAULT 0"),
    ("estado_obra", "ALTER TABLE `proyectos` ADD COLUMN `estado_obra` varchar(20) NULL"),
    ("avance", "ALTER TABLE `proyectos` ADD COLUMN `avance` int NULL"),
    ("foto_url", "ALTER TABLE `proyectos` ADD COLUMN `foto_url` varchar(500) NULL"),
    ("latitud", "ALTER TABLE `proyectos` ADD COLUMN `latitud` float NULL"),
    ("longitud", "ALTER TABLE `proyectos` ADD COLUMN `longitud` float NULL"),
    ("mostrar_monto", "ALTER TABLE `proyectos` ADD COLUMN `mostrar_monto` tinyint(1) NOT NULL DEFAULT 0"),
]

# El feed del vecino pide las obras publicas de su muni en cada visita.
INDICES = [
    ("ix_proyectos_publicos",
     "ALTER TABLE `proyectos` ADD INDEX `ix_proyectos_publicos` (`municipio_id`, `publico`, `activo`)"),
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
                "WHERE table_schema=DATABASE() AND table_name='proyectos' AND column_name=:c"
            ), {"c": col})).scalar()
            if not existe:
                pendientes.append((f"proyectos.{col}", sql))

        for idx, sql in INDICES:
            existe = (await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema=DATABASE() AND table_name='proyectos' AND index_name=:i"
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
