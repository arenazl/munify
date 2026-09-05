# -*- coding: utf-8 -*-
"""
Rellena `motivo_pausa` en los reclamos pospuestos de un municipio DEMO.

El motivo NO se inventa: sale del texto que el propio historial ya tiene
escrito. Cuando alguien difirio el trabajo dejo dicho por que --"se difiere
hasta la proxima licitacion de materiales", "frenado por el temporal", "depende
de una obra de la empresa de agua"--, y eso es exactamente lo que la columna
viene a tipificar. Este script hace de una sola vez la traduccion que de ahora
en mas hace el que pospone eligiendo de la lista.

Lo que no tiene comentario que lo explique queda en NULL. Un motivo puesto al
azar seria peor que la ausencia del dato: el panel diria "12 frenados por
materiales" y nadie podria confiar en el numero.

Uso:
    python scripts/poblar_motivo_pausa_demo.py --env qa --muni 1000196 --aplicar
"""
import argparse
import asyncio
import os
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Cada motivo con las palabras que lo delatan en el texto libre. El orden
# importa: se toma el PRIMER motivo cuya palabra aparezca, asi que van de lo
# mas especifico a lo mas general.
PISTAS = [
    ("tercero",     ["empresa de agua", "cooperativa", "epec", "ecogas", "distribuidora",
                     "empresa de gas", "prestadora", "tercero"]),
    ("otra_obra",   ["otra obra", "bacheo del corredor", "romper dos veces", "hasta terminar",
                     "obra en curso", "repavimenta"]),
    ("presupuesto", ["licitacion", "licitación", "partida", "presupuesto", "compra mayor"]),
    ("materiales",  ["material", "insumo", "repuesto", "stock", "no llego", "no llegó",
                     "falta el", "sin materiales"]),
    ("clima",       ["temporal", "lluvia", "viento", "clima", "tormenta", "nieve", "helada"]),
    ("personal",    ["cuadrilla no", "sin personal", "falta personal", "licencia",
                     "no hay cuadrilla", "dotacion", "dotación"]),
    ("sin_acceso",  ["no se pudo entrar", "sin acceso", "porton cerrado", "portón cerrado",
                     "nadie atendio", "nadie atendió", "propietario ausente"]),
]


def normalizar(t):
    t = (t or "").lower()
    return "".join(c for c in unicodedata.normalize("NFD", t)
                   if unicodedata.category(c) != "Mn")


def motivo_de(texto):
    n = normalizar(texto)
    for motivo, palabras in PISTAS:
        for p in palabras:
            if normalizar(p) in n:
                return motivo
    return None


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", required=True, choices=["qa", "prod"])
    ap.add_argument("--muni", required=True, type=int)
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    if args.env == "prod":
        print("ABORTA: esto rellena datos de DEMO, no se corre contra produccion.")
        return

    load_dotenv(".env")
    url = os.environ["DATABASE_URL"]
    if not url.rstrip("/").endswith("-qa"):
        print("ABORTA: --env qa pero DATABASE_URL no apunta a una base -qa.")
        return

    eng = create_async_engine(url)
    async with eng.begin() as c:
        # Todo el texto que el reclamo tiene escrito sobre su pausa: lo que
        # dejo el historial mas su propia descripcion.
        filas = (await c.execute(text("""
            SELECT r.id, r.estado, r.created_at,
                   GROUP_CONCAT(COALESCE(h.comentario,'') SEPARATOR ' || ') AS dicho
            FROM reclamos r
            LEFT JOIN historial_reclamos h ON h.reclamo_id = r.id
            WHERE r.municipio_id = :m AND r.estado = 'pospuesto'
            GROUP BY r.id, r.estado, r.created_at
        """), {"m": args.muni})).mappings().all()

        print("pospuestos en el municipio %d: %d\n" % (args.muni, len(filas)))
        cambios, sin_pista = [], 0
        for f in filas:
            motivo = motivo_de(f["dicho"])
            if motivo is None:
                sin_pista += 1
                continue
            cambios.append((f["id"], motivo, f["created_at"]))
            print("   #%-9s -> %-12s  <- %s" % (
                f["id"], motivo, (f["dicho"] or "")[:78].replace("\n", " ")))

        print("\n   con motivo derivado : %d" % len(cambios))
        print("   sin pista (quedan NULL): %d" % sin_pista)

        if not args.aplicar:
            print("\nCORRIDA EN SECO. Para escribir: agregar --aplicar")
            return

        for rid, motivo, creado in cambios:
            # `pausado_desde` no se conoce con exactitud hacia atras. Se usa la
            # fecha del ultimo movimiento del reclamo, que es cuando dejo de
            # moverse: es lo mas cercano a la verdad que hay en la base, y no
            # una fecha inventada.
            await c.execute(text("""
                UPDATE reclamos r SET r.motivo_pausa = :mot,
                    r.pausado_desde = COALESCE(
                        (SELECT MAX(h.created_at) FROM historial_reclamos h WHERE h.reclamo_id = r.id),
                        r.created_at)
                WHERE r.id = :id
            """), {"mot": motivo, "id": rid})
        print("\nESCRITOS %d motivos." % len(cambios))

    async with eng.connect() as c:
        r = (await c.execute(text("""
            SELECT motivo_pausa, COUNT(*) n,
                   ROUND(AVG(DATEDIFF(NOW(), pausado_desde))) dias
            FROM reclamos WHERE municipio_id = :m AND motivo_pausa IS NOT NULL
            GROUP BY motivo_pausa ORDER BY n DESC
        """), {"m": args.muni})).all()
        print("\ncomo queda el desglose:")
        for x in r:
            print("   %-14s %-4s frenados, %s dias esperando" % (x[0], x[1], x[2]))
    await eng.dispose()


asyncio.run(main())
