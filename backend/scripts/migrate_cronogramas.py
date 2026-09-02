"""Modulo Comunicacion, Etapa 3: CRONOGRAMAS Y SEGMENTACION.

Tres columnas, todas nullable (ALTER aditivo e idempotente):
  usuarios.barrio_id     -> el vecino declara su barrio; sin esto no se puede
                            segmentar (la direccion es texto libre)
  noticias.barrio_id     -> a quien va el aviso; NULL = a todo el municipio
  noticias.recurrencia   -> cada cuanto se repite; NULL = una sola vez
  noticias.dias_semana   -> para la semanal: "1,4" = martes y viernes

Uso:
    DATABASE_URL=... python scripts/migrate_cronogramas.py            # PLAN
    DATABASE_URL=... python scripts/migrate_cronogramas.py --apply
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

# (tabla, columna, sql)
COLUMNAS = [
    ("usuarios", "barrio_id",
     "ALTER TABLE `usuarios` ADD COLUMN `barrio_id` int NULL, "
     "ADD INDEX `ix_usuarios_barrio` (`barrio_id`), "
     "ADD CONSTRAINT `fk_usuario_barrio` FOREIGN KEY (`barrio_id`) "
     "REFERENCES `barrios` (`id`) ON DELETE SET NULL"),
    ("noticias", "barrio_id",
     "ALTER TABLE `noticias` ADD COLUMN `barrio_id` int NULL, "
     "ADD INDEX `ix_noticias_barrio` (`barrio_id`), "
     "ADD CONSTRAINT `fk_noticia_barrio` FOREIGN KEY (`barrio_id`) "
     "REFERENCES `barrios` (`id`) ON DELETE SET NULL"),
    ("noticias", "recurrencia",
     "ALTER TABLE `noticias` ADD COLUMN `recurrencia` varchar(20) NULL"),
    ("noticias", "dias_semana",
     "ALTER TABLE `noticias` ADD COLUMN `dias_semana` varchar(20) NULL"),
]


async def main():
    engine = create_async_engine(DATABASE_URL)
    pendientes = []
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")
        for tabla, col, sql in COLUMNAS:
            existe = (await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c"
            ), {"t": tabla, "c": col})).scalar()
            if not existe:
                pendientes.append((f"{tabla}.{col}", sql))

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
