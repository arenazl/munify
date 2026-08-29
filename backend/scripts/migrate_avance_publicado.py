"""Comunicacion: separar el avance REAL del avance PUBLICADO.

Una sola columna, nullable (ALTER aditivo e idempotente):
  proyectos.avance_publicado -> el % que ve el vecino

POR QUE DOS CAMPOS Y NO UNO
---------------------------
Hasta ahora la pantalla de Comunicacion editaba `proyectos.avance`, que es el
avance real que lleva Tesoreria. Consecuencia: publicar la obra con otro
numero PISABA el dato interno del municipio.

Y ese caso no es hipotetico, es el habitual: lo que la obra lleva de verdad y
lo que el intendente decide comunicar no tienen por que coincidir. Con un solo
campo, cada vez que el municipio quiere decir menos afuera, pierde el numero
con el que se maneja adentro.

Ahora son dos: `avance` (Tesoreria, interno, nunca sale) y `avance_publicado`
(Comunicacion, lo unico que viaja al vecino). NULL en el publicado = la
tarjeta no muestra barra; la obra igual se ve con su estado.

Uso:
    DATABASE_URL=... python scripts/migrate_avance_publicado.py            # PLAN
    DATABASE_URL=... python scripts/migrate_avance_publicado.py --apply
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

COLUMNA = (
    "proyectos", "avance_publicado",
    "ALTER TABLE `proyectos` ADD COLUMN `avance_publicado` int NULL",
)

# Las obras que YA estaban publicadas venian mostrando `avance`. Si la columna
# nueva naciera vacia, a esas obras se les caeria la barra sin que nadie tocara
# nada. Se copia el valor una sola vez, y solo para las publicadas: es lo que
# el vecino ya estaba viendo, no un dato nuevo.
BACKFILL = (
    "UPDATE `proyectos` SET `avance_publicado` = `avance` "
    "WHERE `publico` = 1 AND `avance` IS NOT NULL AND `avance_publicado` IS NULL"
)


async def main():
    engine = create_async_engine(DATABASE_URL)
    tabla, col, sql = COLUMNA
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")
        existe = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c"
        ), {"t": tabla, "c": col})).scalar()
        a_copiar = 0
        if existe:
            a_copiar = (await conn.execute(text(
                "SELECT COUNT(*) FROM `proyectos` WHERE `publico`=1 "
                "AND `avance` IS NOT NULL AND `avance_publicado` IS NULL"
            ))).scalar()

    if existe and not a_copiar:
        print("Nada que hacer: el schema ya esta al dia.")
        await engine.dispose()
        return

    if not existe:
        print(f"  - falta {tabla}.{col}")
    if not existe or a_copiar:
        print(f"  - backfill: obras publicadas que heredan su avance actual "
              f"({a_copiar if existe else 'a contar tras el ALTER'})")

    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        if not existe:
            await conn.execute(text(sql))
            print(f"OK: {tabla}.{col}")
        r = await conn.execute(text(BACKFILL))
        print(f"OK: backfill, {r.rowcount} obras publicadas heredaron su avance")
    await engine.dispose()
    print("\nListo. Re-correrlo debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
