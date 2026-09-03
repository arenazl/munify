"""Lo que le FALTA al catalogo de barrios, en un JSON para curar despues.

Lucas (2026-09-03): *"guardamos un JSON con los faltantes y lo vamos curando
con otras fuentes cuando se pueda"*. La regla de la semilla ya es que nada de
esto rompe una demo —sin polígono de barrio se dibuja el del municipio (la
zona única), y el listado de barrios se carga igual—, pero el hueco tiene que
quedar ESCRITO, no adivinado, para saber qué buscar en otra fuente (IGN,
catastros provinciales, INDEC, OSM a futuro).

Sólo LEE (`municipios_catalogo` + `catalogo_barrios`) y escribe un archivo
local. Tres listas, de más grave a más fina:

  1. `municipios_sin_barrios`        — ni un barrio en el catálogo (la demo
                                        nace con la zona única sola).
  2. `municipios_sin_ningun_contorno` — tienen barrios, pero todos como punto.
  3. `barrios_sin_poligono`           — el detalle: cada barrio que hoy es un
                                        punto, con su municipio, tipo y fuente.
                                        SÓLO para los países de `--detalle`
                                        (default AR, PY, UY: los de la grilla).
                                        Con los seis países el detalle son
                                        141.000 filas / 26 MB, y 128.000 de
                                        ellas son caseríos rurales de CL/BO/PE
                                        (`village`/`hamlet`), no barrios a curar.

Y un `resumen` por país y provincia con los mismos números que imprime
`catalogo_barrios_pbf.py`, para comparar corridas.

Uso (desde la raíz del repo; la URL viaja por entorno, nunca en el código):

    DATABASE_URL_QA="..." python backend/scripts/geo/faltantes_barrios.py --env qa
    # --pais AR         sólo un país (default: todos los que tengan contorno)
    # --detalle CL,BO   países con detalle barrio por barrio (default AR,PY,UY)
    # --salida ruta     default backend/scripts/datos/faltantes_barrios.json
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import bindparam, text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402

SALIDA_DEFAULT = os.path.join(BACKEND, "scripts", "datos", "faltantes_barrios.json")


def _args():
    p = parser_base("Escribe el JSON de faltantes del catálogo de barrios (sólo lectura).")
    p.add_argument("--pais", default="", help="ISO-2; vacío = todos los países con contorno")
    p.add_argument("--detalle", default="AR,PY,UY",
                   help="ISO-2 separados por coma con detalle barrio por barrio (default AR,PY,UY)")
    p.add_argument("--salida", default=SALIDA_DEFAULT, help="Ruta del JSON de salida")
    return p.parse_args()


async def main() -> None:
    args = _args()
    cfg = resolver_db(args)
    engine = create_async_engine(cfg.url)
    filtro_pais = " AND c.pais = :pais" if args.pais else ""
    params = {"pais": args.pais.upper()} if args.pais else {}
    detalle = sorted({x.strip().upper() for x in args.detalle.split(",") if x.strip()})
    if args.pais:
        detalle = [p for p in detalle if p == args.pais.upper()]
    filtro_detalle = " AND c.pais IN :detalle" if detalle else " AND 1 = 0"
    params_detalle = {**params, "detalle": tuple(detalle)} if detalle else params

    async with engine.connect() as conn:
        # Un renglón por municipio con contorno: cuántos barrios y cuántos con polígono.
        munis = (await conn.execute(text(f"""
            SELECT c.id, c.pais, c.provincia, c.nombre,
                   COUNT(b.id) AS barrios, SUM(b.poligono IS NOT NULL) AS con_poligono
            FROM municipios_catalogo c
            LEFT JOIN catalogo_barrios b ON b.municipio_catalogo_id = c.id
            WHERE c.poligono IS NOT NULL{filtro_pais}
            GROUP BY c.id, c.pais, c.provincia, c.nombre
            ORDER BY c.pais, c.provincia, c.nombre
        """), params)).mappings().all()

        consulta = text(f"""
            SELECT b.municipio_catalogo_id AS municipio_id, c.nombre AS municipio,
                   c.pais, c.provincia, b.nombre, b.tipo, b.fuente, b.lat, b.lon
            FROM catalogo_barrios b
            JOIN municipios_catalogo c ON c.id = b.municipio_catalogo_id
            WHERE b.poligono IS NULL{filtro_pais}{filtro_detalle}
            ORDER BY c.pais, c.provincia, c.nombre, b.nombre
        """)
        if detalle:
            consulta = consulta.bindparams(bindparam("detalle", expanding=True))
        barrios = (await conn.execute(consulta, params_detalle)).mappings().all()
    await engine.dispose()

    sin_barrios, sin_contorno = [], []
    resumen: dict[str, dict] = {}
    for m in munis:
        n, con = int(m["barrios"] or 0), int(m["con_poligono"] or 0)
        fila = {"id": m["id"], "pais": m["pais"], "provincia": m["provincia"], "nombre": m["nombre"]}
        if n == 0:
            sin_barrios.append(fila)
        elif con == 0:
            sin_contorno.append({**fila, "barrios": n})
        r = resumen.setdefault(m["pais"], {"municipios": 0, "con_barrios": 0, "con_algun_contorno": 0,
                                           "barrios": 0, "barrios_con_poligono": 0, "provincias": {}})
        p = r["provincias"].setdefault(m["provincia"] or "", {"municipios": 0, "con_barrios": 0,
                                                              "con_algun_contorno": 0, "barrios": 0,
                                                              "barrios_con_poligono": 0})
        for d in (r, p):
            d["municipios"] += 1
            d["con_barrios"] += 1 if n else 0
            d["con_algun_contorno"] += 1 if con else 0
            d["barrios"] += n
            d["barrios_con_poligono"] += con
            d["barrios_como_punto"] = d["barrios"] - d["barrios_con_poligono"]

    salida = {
        "generado": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "base": cfg.base,
        "que_es": ("Huecos del catálogo de barrios (catalogo_barrios vs municipios_catalogo con "
                   "contorno). Nada de esto rompe una demo: sin polígono de barrio se dibuja el "
                   "del municipio. Es la lista de qué buscar en otras fuentes."),
        "detalle_paises": detalle,
        "resumen": resumen,
        "municipios_sin_barrios": sin_barrios,
        "municipios_sin_ningun_contorno": sin_contorno,
        "barrios_sin_poligono": [dict(b) for b in barrios],
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.salida)), exist_ok=True)
    # Compacto a propósito: son miles de barrios y el archivo se versiona; lo
    # lee un script o un agente, no una persona en el editor.
    with open(args.salida, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"), default=str)

    print(f"\n{args.salida} ({os.path.getsize(args.salida) / 1e6:.1f} MB)")
    for pais, r in resumen.items():
        print(f"  {pais}: {r['con_barrios']}/{r['municipios']} municipios con barrios, "
              f"{r['con_algun_contorno']} con algún contorno | barrios {r['barrios']:,}, "
              f"con polígono {r['barrios_con_poligono']:,}")
    print(f"  sin barrios: {len(sin_barrios)} municipios · sin ningún contorno: {len(sin_contorno)} "
          f"· barrios como punto: {len(barrios):,}")


if __name__ == "__main__":
    asyncio.run(main())
