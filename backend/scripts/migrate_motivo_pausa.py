# -*- coding: utf-8 -*-
"""
Agrega el POR QUE de un trabajo diferido: `reclamos.motivo_pausa` + `pausado_desde`.

El estado no cambia --`pospuesto` ya encuadra todo, "no lo pude resolver"--; lo
que faltaba era la razon, y tipificada. Hoy vive en prosa dentro del comentario
del historial ("se difiere hasta la proxima licitacion de materiales"): sirve
para leer UN reclamo y no sirve para contestar "cuantos estan frenados por
materiales" sin recorrer todos los reclamos en cada consulta. Con la columna
indexada, esa pregunta es un GROUP BY.

Es el mismo patron que ya existe para los rechazos (`rechazado` +
`motivo_rechazo`): no se inventa nada, se copia el que esta.

Uso:
    python scripts/migrate_motivo_pausa.py --env qa --aplicar
"""
import argparse
import asyncio
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

MOTIVOS = ["materiales", "clima", "tercero", "otra_obra",
           "personal", "sin_acceso", "presupuesto", "otro"]

COLUMNAS = [
    ("motivo_pausa", "ENUM(%s) NULL" % ",".join("'%s'" % m for m in MOTIVOS)),
    ("pausado_desde", "DATETIME NULL"),
]
INDICE = ("ix_reclamos_motivo_pausa", "motivo_pausa")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", required=True, choices=["qa", "prod"])
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    if args.env == "prod":
        print("ABORTA: contra produccion la migracion la promueve Infra.")
        return

    load_dotenv(".env")
    url = os.environ["DATABASE_URL"]
    if not url.rstrip("/").endswith("-qa"):
        print("ABORTA: --env qa pero DATABASE_URL no apunta a una base -qa.")
        return

    eng = create_async_engine(url)
    async with eng.begin() as c:
        existentes = {r[0] for r in (await c.execute(text("SHOW COLUMNS FROM reclamos"))).all()}
        for col, tipo in COLUMNAS:
            if col in existentes:
                print("  ya existe: %s" % col)
                continue
            print("  ALTER TABLE reclamos ADD COLUMN %s %s" % (col, tipo))
            if args.aplicar:
                await c.execute(text("ALTER TABLE reclamos ADD COLUMN `%s` %s" % (col, tipo)))

        idx = {r[2] for r in (await c.execute(text("SHOW INDEX FROM reclamos"))).all()}
        if INDICE[0] in idx:
            print("  ya existe el indice: %s" % INDICE[0])
        else:
            print("  CREATE INDEX %s ON reclamos(%s)" % INDICE)
            if args.aplicar:
                await c.execute(text("CREATE INDEX `%s` ON reclamos(`%s`)" % INDICE))

    if not args.aplicar:
        print("\nCORRIDA EN SECO. Para escribir: agregar --aplicar")
    else:
        async with eng.connect() as c:
            cols = {r[0]: r[1] for r in (await c.execute(text("SHOW COLUMNS FROM reclamos"))).all()}
            print("\nverificado:")
            for col, _ in COLUMNAS:
                print("   %-16s %s" % (col, cols.get(col, "NO EXISTE")))
    await eng.dispose()


asyncio.run(main())
