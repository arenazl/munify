"""Comunicacion: una publicacion puede ir a VARIOS barrios.

Hasta ahora `noticias.barrio_id` permitia UNO solo. El primer corte de agua
que toca tres barrios obligaba a cargar la misma publicacion tres veces, y a
bajarla tres veces. Eso se rompe apenas lo usen en serio.

Que hace:
  1. CREATE TABLE `noticia_barrios` (la tabla puente).
  2. Migra las filas que ya tenian `barrio_id` a la puente.
  3. DROP de `noticias.barrio_id` (con su FK y su indice).

EL DROP ES SEGURO ACA Y SOLO ACA: produccion todavia no tiene ninguna de las
columnas del modulo Comunicacion (la promocion no se hizo), asi que esa
columna no existe fuera de qa. Se saca ahora, antes de que llegue a prod, para
no dejar dos caminos que hacen lo mismo. El paso 2 corre ANTES del 3: si algo
falla, la transaccion vuelve atras y no se pierde a quien iba dirigida cada
publicacion.

Uso:
    DATABASE_URL=... python scripts/migrate_noticia_barrios.py            # PLAN
    DATABASE_URL=... python scripts/migrate_noticia_barrios.py --apply
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
CREATE TABLE `noticia_barrios` (
  `noticia_id` int NOT NULL,
  `barrio_id` int NOT NULL,
  PRIMARY KEY (`noticia_id`, `barrio_id`),
  KEY `ix_noticia_barrios_barrio` (`barrio_id`),
  CONSTRAINT `fk_nb_noticia` FOREIGN KEY (`noticia_id`)
    REFERENCES `noticias` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_nb_barrio` FOREIGN KEY (`barrio_id`)
    REFERENCES `barrios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
"""

COPIAR = (
    "INSERT IGNORE INTO `noticia_barrios` (`noticia_id`, `barrio_id`) "
    "SELECT `id`, `barrio_id` FROM `noticias` WHERE `barrio_id` IS NOT NULL"
)


async def main():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")

        hay_tabla = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema=DATABASE() AND table_name='noticia_barrios'"
        ))).scalar()
        hay_columna = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() "
            "AND table_name='noticias' AND column_name='barrio_id'"
        ))).scalar()
        a_migrar = 0
        if hay_columna:
            a_migrar = (await conn.execute(text(
                "SELECT COUNT(*) FROM `noticias` WHERE `barrio_id` IS NOT NULL"
            ))).scalar()

    if hay_tabla and not hay_columna:
        print("Nada que hacer: el schema ya esta al dia.")
        await engine.dispose()
        return

    if not hay_tabla:
        print("  - CREATE TABLE noticia_barrios")
    if hay_columna:
        print(f"  - migrar {a_migrar} publicaciones que hoy apuntan a un barrio")
        print("  - DROP noticias.barrio_id (con su FK e indice)")

    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        if not hay_tabla:
            await conn.execute(text(TABLA))
            print("OK: noticia_barrios")
        if hay_columna:
            r = await conn.execute(text(COPIAR))
            print(f"OK: {r.rowcount} publicaciones migradas a la puente")
            # La FK primero: MySQL no deja soltar una columna con FK encima.
            fk = (await conn.execute(text(
                "SELECT constraint_name FROM information_schema.key_column_usage "
                "WHERE table_schema=DATABASE() AND table_name='noticias' "
                "AND column_name='barrio_id' AND referenced_table_name IS NOT NULL"
            ))).scalar()
            if fk:
                await conn.execute(text(f"ALTER TABLE `noticias` DROP FOREIGN KEY `{fk}`"))
                print(f"OK: FK {fk} soltada")
            await conn.execute(text("ALTER TABLE `noticias` DROP COLUMN `barrio_id`"))
            print("OK: noticias.barrio_id eliminada")
    await engine.dispose()
    print("\nListo. Re-correrlo debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
