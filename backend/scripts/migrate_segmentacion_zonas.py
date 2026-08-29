"""Comunicacion: la segmentacion pasa de BARRIO a ZONA.

POR QUE EL CAMBIO (con los numeros que lo decidieron, 2026-08-29)
----------------------------------------------------------------
La Etapa 3 se hizo sobre barrios. Al mirar la base entera aparecio esto:

    80 municipios tienen zonas cargadas ....... 494 zonas
    barrios en toda la base ................... 963
    barrios con zona asignada ................. 0
    Trelew (municipio creado ese mismo dia) ... 12 zonas, 0 barrios

Dos consecuencias: no se puede llegar del vecino a la zona pasando por su
barrio (nadie tiene la relacion cargada), y los municipios NUEVOS nacen con
zonas pero sin barrios — o sea, un vecino de Trelew no podria declarar su
barrio ni aunque quisiera.

La zona es la unidad que SIEMPRE esta. El barrio no.

Que hace:
  1. DROP `noticia_barrios` y DROP `usuarios.barrio_id` — las dos son de este
     mismo dia y no llegaron a produccion. Se sacan en vez de dejarlas al
     lado de las de zona: dos caminos para lo mismo es la deuda que este
     modulo viene evitando.
  2. CREATE `noticia_zonas` (la puente) y `usuarios.zona_id`.

Uso:
    DATABASE_URL=... python scripts/migrate_segmentacion_zonas.py            # PLAN
    DATABASE_URL=... python scripts/migrate_segmentacion_zonas.py --apply
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

TABLA_ZONAS = """
CREATE TABLE `noticia_zonas` (
  `noticia_id` int NOT NULL,
  `zona_id` int NOT NULL,
  PRIMARY KEY (`noticia_id`, `zona_id`),
  KEY `ix_noticia_zonas_zona` (`zona_id`),
  CONSTRAINT `fk_nz_noticia` FOREIGN KEY (`noticia_id`)
    REFERENCES `noticias` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_nz_zona` FOREIGN KEY (`zona_id`)
    REFERENCES `zonas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""

COLUMNA_USUARIO = (
    "ALTER TABLE `usuarios` ADD COLUMN `zona_id` int NULL, "
    "ADD INDEX `ix_usuarios_zona` (`zona_id`), "
    "ADD CONSTRAINT `fk_usuario_zona` FOREIGN KEY (`zona_id`) "
    "REFERENCES `zonas` (`id`) ON DELETE SET NULL"
)


async def existe_tabla(conn, nombre):
    return (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema=DATABASE() AND table_name=:t"), {"t": nombre})).scalar()


async def existe_columna(conn, tabla, col):
    return (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() "
        "AND table_name=:t AND column_name=:c"), {"t": tabla, "c": col})).scalar()


async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")
        hay_nb = await existe_tabla(conn, "noticia_barrios")
        hay_nz = await existe_tabla(conn, "noticia_zonas")
        hay_ub = await existe_columna(conn, "usuarios", "barrio_id")
        hay_uz = await existe_columna(conn, "usuarios", "zona_id")

    if hay_nz and hay_uz and not hay_nb and not hay_ub:
        print("Nada que hacer: el schema ya esta al dia.")
        await engine.dispose()
        return

    if hay_nb:
        print("  - DROP noticia_barrios")
    if hay_ub:
        print("  - DROP usuarios.barrio_id")
    if not hay_nz:
        print("  - CREATE TABLE noticia_zonas")
    if not hay_uz:
        print("  - usuarios.zona_id (+ indice + FK)")

    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        if hay_nb:
            await conn.execute(text("DROP TABLE `noticia_barrios`"))
            print("OK: noticia_barrios eliminada")
        if hay_ub:
            fk = (await conn.execute(text(
                "SELECT constraint_name FROM information_schema.key_column_usage "
                "WHERE table_schema=DATABASE() AND table_name='usuarios' "
                "AND column_name='barrio_id' AND referenced_table_name IS NOT NULL"
            ))).scalar()
            if fk:
                await conn.execute(text(f"ALTER TABLE `usuarios` DROP FOREIGN KEY `{fk}`"))
            await conn.execute(text("ALTER TABLE `usuarios` DROP COLUMN `barrio_id`"))
            print("OK: usuarios.barrio_id eliminada")
        if not hay_nz:
            await conn.execute(text(TABLA_ZONAS))
            print("OK: noticia_zonas")
        if not hay_uz:
            await conn.execute(text(COLUMNA_USUARIO))
            print("OK: usuarios.zona_id")
    await engine.dispose()
    print("\nListo. Re-correrlo debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
