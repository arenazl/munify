# -*- coding: utf-8 -*-
"""Curacion OFFLINE de la cartografia fina: llena `catalogo_geo_osm`.

Es el UNICO proceso que sale a Overpass. Recorre `municipios_catalogo` (los
que tienen contorno), pide barrios + calles + direcciones reales de cada uno
con la misma consulta que usaba el alta, y guarda el paquete recortado en la
tabla. El alta despues solo lee (Lucas, 2026-09-03: "la cartografia no se hace
online nunca").

Reentrante: lo curado (ok / sin_datos_osm) se saltea; los `error` (Overpass
caido en ese momento) se reintentan en la corrida siguiente. Cada municipio
se commitea solo, asi cortar el proceso a la mitad no pierde nada.

Orden: primero los municipios que YA son tenants en esta base (demos hechas,
clientes), despues el resto del pais por provincia. Con `--primero` se puede
adelantar una lista a mano ("Rafaela,Merlo").

    DATABASE_URL_QA="..." python scripts/geo/curar_geo_catalogo.py --env qa --aplicar
    ... --pais AR --limite 50           # una tanda corta
    ... --refrescar                     # pisar lo ya curado (cambio la consulta)
    ... --primero "Rafaela,General Cabrera"

Sin `--aplicar` lista lo que haria y no toca la red.

Ritmo: una consulta por vez y una pausa entre municipios. Overpass es un
servicio publico compartido; ir de a uno es lo que hace que la corrida
entera termine, no lo que la frena.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402
from services import geo_ciudad  # noqa: E402

# Tras esta cantidad de errores seguidos Overpass esta caido, no "ocupado":
# se espera un rato largo antes de seguir, y si persiste se corta la corrida
# para no dejar 2.000 filas en `error`.
ERRORES_PARA_PAUSAR = 4
ERRORES_PARA_CORTAR = 12
PAUSA_CAIDA_SEG = 120
# Offline no espera nadie: un partido del conurbano o una capital tarda mas de
# los 20 s que aguanta el alta, y acá se le da el tiempo que necesite.
TIMEOUT_BATCH_SEG = 120.0


def _args() -> argparse.Namespace:
    p = parser_base("Cura la cartografia OSM de los municipios del catalogo (offline).")
    p.add_argument("--pais", default="AR", help="ISO-2 del catalogo (default AR)")
    p.add_argument("--limite", type=int, default=0, help="Cuantos municipios como maximo (0 = todos)")
    p.add_argument("--refrescar", action="store_true", help="Pisar lo ya curado")
    p.add_argument("--primero", default="", help="Nombres a curar primero, separados por coma")
    p.add_argument("--pausa", type=float, default=1.5, help="Segundos entre municipios")
    p.add_argument("--parte", default="", help="k/n: este proceso toma los pendientes i %% n == k "
                                                "(para correr n workers en paralelo sin pisarse)")
    return p.parse_args()


async def _pendientes(conn, pais: str, refrescar: bool, primero: list[str]) -> list[dict]:
    filas = (await conn.execute(text("""
        SELECT c.id, c.nombre, c.provincia, c.poligono, g.estado
        FROM municipios_catalogo c
        LEFT JOIN catalogo_geo_osm g ON g.municipio_catalogo_id = c.id
        WHERE c.pais = :p AND c.poligono IS NOT NULL
        ORDER BY c.provincia, c.nombre
    """), {"p": pais})).fetchall()

    # Tenants de esta base: demos ya creadas y clientes. Van primero porque
    # son los que alguien va a abrir manana.
    tenants = {r[0] for r in (await conn.execute(text(
        "SELECT LOWER(nombre) FROM municipios"))).fetchall()}
    adelantados = {n.strip().lower() for n in primero if n.strip()}

    def prioridad(f) -> tuple:
        n = (f[1] or "").lower()
        return (0 if n in adelantados else 1 if n in tenants else 2, f[2] or "", n)

    out = []
    for f in sorted(filas, key=prioridad):
        estado = f[4]
        if estado in ("ok", "sin_datos_osm") and not refrescar:
            continue
        try:
            anillo = json.loads(f[3])
        except (ValueError, TypeError):
            continue
        if not (isinstance(anillo, list) and len(anillo) >= 3):
            continue
        out.append({"id": f[0], "nombre": f[1], "provincia": f[2],
                    "anillo": anillo, "estado_previo": estado})
    return out


async def _resumen(conn, pais: str) -> str:
    total = (await conn.execute(text(
        "SELECT COUNT(*) FROM municipios_catalogo WHERE pais=:p AND poligono IS NOT NULL"),
        {"p": pais})).scalar()
    filas = (await conn.execute(text("""
        SELECT estado, COUNT(*), SUM(barrios > 0), SUM(calles > 0)
        FROM catalogo_geo_osm WHERE pais = :p GROUP BY estado"""), {"p": pais})).fetchall()
    curados = sum(int(f[1]) for f in filas if f[0] in ("ok", "sin_datos_osm"))
    partes = [f"{f[0]}={int(f[1])} (con_barrios={int(f[2] or 0)}, con_calles={int(f[3] or 0)})"
              for f in filas]
    return (f"{pais}: {curados}/{total} curados ({100.0 * curados / max(total, 1):.1f}%) | "
            + "; ".join(partes))


async def main() -> None:
    args = _args()
    cfg = resolver_db(args)
    engine = create_async_engine(cfg.url)
    inicio = time.time()
    try:
        async with engine.connect() as conn:
            pendientes = await _pendientes(conn, args.pais.upper(), args.refrescar,
                                           args.primero.split(","))
            print(await _resumen(conn, args.pais.upper()))
        if args.parte:
            k, n = (int(x) for x in args.parte.split("/"))
            pendientes = [m for i, m in enumerate(pendientes) if i % n == k]
        if args.limite:
            pendientes = pendientes[: args.limite]
        print(f"Pendientes: {len(pendientes)}" + (f" (parte {args.parte})" if args.parte else "")
              + ("" if args.aplicar else "  (EN SECO: no se consulta nada)"))
        if not args.aplicar:
            for m in pendientes[:40]:
                print(f"  - {m['nombre']} ({m['provincia']}) id={m['id']} previo={m['estado_previo']}")
            return

        seguidos = 0
        hechos = ok = vacios = errores = 0
        for i, m in enumerate(pendientes, 1):
            t0 = time.time()
            try:
                datos = await geo_ciudad.osm_en_vivo(m["nombre"], m["anillo"],
                                                     timeout=TIMEOUT_BATCH_SEG)
                estado, detalle = geo_ciudad.estado_de(datos), None
                seguidos = 0
            except geo_ciudad.OsmNoDisponible as e:
                datos, estado, detalle = {"places": [], "calles": [], "direcciones": []}, "error", str(e)
                seguidos += 1

            async with engine.begin() as conn:
                await geo_ciudad.guardar_catalogo_geo(
                    conn, {"id": m["id"], "nombre": m["nombre"], "provincia": m["provincia"]},
                    args.pais, datos, estado=estado, detalle=detalle)

            hechos += 1
            ok += estado == "ok"
            vacios += estado == "sin_datos_osm"
            errores += estado == "error"
            nb = sum(1 for p in datos.get("places", []) if p["tipo"] in geo_ciudad.PLACES_BARRIO)
            print(f"[{i}/{len(pendientes)}] {m['nombre']} ({m['provincia']}) -> {estado} "
                  f"barrios={nb} calles={len(datos.get('calles', []))} "
                  f"dir={len(datos.get('direcciones', []))} {time.time() - t0:.1f}s"
                  + (f" | {detalle}" if detalle else ""), flush=True)

            if seguidos >= ERRORES_PARA_CORTAR:
                print(f"CORTE: {seguidos} errores seguidos, Overpass caido. Se retoma con la proxima corrida.")
                break
            if seguidos and seguidos % ERRORES_PARA_PAUSAR == 0:
                print(f"  ... {seguidos} errores seguidos: pausa de {PAUSA_CAIDA_SEG}s", flush=True)
                await asyncio.sleep(PAUSA_CAIDA_SEG)
            else:
                await asyncio.sleep(args.pausa)

        async with engine.connect() as conn:
            print(f"\nHechos {hechos}: ok={ok} sin_datos={vacios} error={errores} "
                  f"en {(time.time() - inicio) / 60:.1f} min")
            print(await _resumen(conn, args.pais.upper()))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
