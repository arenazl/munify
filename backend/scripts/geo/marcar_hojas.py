# -*- coding: utf-8 -*-
"""Marca en `catalogo_barrios` que filas se muestran (`hoja`=1) y cuales quedan
de respaldo (`hoja`=0 + `motivo_hoja`), municipio por municipio, con la regla
de `_hojas.py`. No borra ni inserta filas.

`catalogo_barrios_pbf.py` ya deja marcado cada municipio que escribe; este
script existe para (a) marcar lo que ya estaba cargado antes de la regla,
(b) re-marcar todo si la regla cambia, sin volver a pasar por el PBF, y
(c) agregar las columnas donde falten (prod, antes de copiar la tabla).

    DATABASE_URL_QA="..." python scripts/geo/marcar_hojas.py --env qa --pais AR --aplicar
    ... --pais AR,PY,UY,CL,BO,PE        # varios paises
    ... --muni 060434                   # un municipio (Lanus), para mirar de cerca
    ... --provincia "Buenos Aires"
Sin `--aplicar` calcula y muestra que cambiaria.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from collections import Counter, defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402
from _hojas import asegurar_columnas, columnas_faltantes, marcar_hojas  # noqa: E402

TANDA = 500


def _args() -> argparse.Namespace:
    p = parser_base("Marca las filas hoja de catalogo_barrios (regla de contencion, offline).")
    p.add_argument("--pais", default="AR", help="ISO-2 o lista separada por coma (default AR)")
    p.add_argument("--provincia", default="", help="Solo esta provincia (nombre exacto del catalogo)")
    p.add_argument("--muni", default="", help="Solo este municipio (id del catalogo)")
    p.add_argument("--detalle", action="store_true", help="Listar hojas y respaldo de cada municipio")
    return p.parse_args()


async def _cargar(conn, paises: list[str], provincia: str, muni: str, con_columnas: bool) -> tuple[dict, dict]:
    params: dict = {f"p{i}": p for i, p in enumerate(paises)}
    filtro_pais = ",".join(f":p{i}" for i in range(len(paises)))
    extra = ""
    if provincia:
        extra += " AND c.provincia = :prov"
        params["prov"] = provincia
    if muni:
        extra += " AND c.id = :muni"
        params["muni"] = muni
    munis = {str(f[0]): {"nombre": f[1], "provincia": f[2] or "", "pais": f[3]} for f in (await conn.execute(text(f"""
        SELECT c.id, c.nombre, c.provincia, c.pais FROM municipios_catalogo c
        WHERE c.pais IN ({filtro_pais}){extra}"""), params)).fetchall()}
    # Sin las columnas (en seco, antes de la primera corrida) todo cuenta como hoja sin motivo.
    actuales = "b.hoja, b.motivo_hoja" if con_columnas else "1, NULL"
    filas = (await conn.execute(text(f"""
        SELECT b.id, b.municipio_catalogo_id, b.nombre, b.tipo, b.lat, b.lon, b.poligono, b.fuente,
               {actuales}
        FROM catalogo_barrios b JOIN municipios_catalogo c ON c.id = b.municipio_catalogo_id
        WHERE b.pais IN ({filtro_pais}){extra}"""), params)).fetchall()
    por_muni: dict[str, list[dict]] = defaultdict(list)
    for f in filas:
        por_muni[str(f[1])].append({"id": f[0], "nombre": f[2], "tipo": f[3], "lat": f[4], "lon": f[5],
                                    "poligono": f[6], "fuente": f[7],
                                    "hoja_actual": bool(f[8]), "motivo_actual": f[9]})
    return munis, por_muni


async def _escribir_tanda(conn, tanda: list[dict]) -> None:
    """UN solo UPDATE para toda la tanda. Con executemany aiomysql manda un round trip por fila
    (~190 ms contra Aiven): 9.000 filas eran 30 min; asi son segundos."""
    params: dict = {}
    casos_hoja, casos_motivo = [], []
    for n, c in enumerate(tanda):
        params[f"i{n}"], params[f"h{n}"], params[f"m{n}"] = c["id"], c["hoja"], c["motivo"]
        casos_hoja.append(f"WHEN :i{n} THEN :h{n}")
        casos_motivo.append(f"WHEN :i{n} THEN :m{n}")
    await conn.execute(text(f"""
        UPDATE catalogo_barrios
        SET hoja = CASE id {' '.join(casos_hoja)} END,
            motivo_hoja = CASE id {' '.join(casos_motivo)} END
        WHERE id IN ({','.join(f':i{n}' for n in range(len(tanda)))})"""), params)


async def main() -> None:
    args = _args()
    cfg = resolver_db(args)
    paises = [p.strip().upper() for p in args.pais.split(",") if p.strip()]
    engine = create_async_engine(cfg.url)
    inicio = time.time()
    try:
        async with engine.begin() as conn:
            if args.aplicar:
                faltan = await asegurar_columnas(conn)
                if faltan:
                    print(f"Columnas agregadas a catalogo_barrios: {', '.join(faltan)}")
            else:
                faltan = await columnas_faltantes(conn)
                if faltan:
                    print(f"Faltan las columnas {', '.join(faltan)} (se agregan con --aplicar)")
            munis, por_muni = await _cargar(conn, paises, args.provincia, args.muni, not faltan or args.aplicar)
        print(f"{sum(len(v) for v in por_muni.values()):,} filas en {len(por_muni)} municipios "
              f"({', '.join(paises)}){'  (EN SECO: no se escribe nada)' if not args.aplicar else ''}",
              flush=True)

        por_pais: dict[str, Counter] = defaultdict(Counter)
        cambios: list[dict] = []
        for mid, rows in sorted(por_muni.items(), key=lambda kv: (munis.get(kv[0], {}).get("provincia", ""), kv[0])):
            m = munis.get(mid, {"nombre": mid, "provincia": "", "pais": "?"})
            res = marcar_hojas(rows)
            s = por_pais[m["pais"]]
            s.update(res)
            s["munis"] += 1
            s["filas"] += len(rows)
            if res.get("hojas"):
                s["C1"] += 1
                s["C2_alguna"] += int(res.get("hojas_poli", 0) > 0)
                s["C2_mitad"] += int(res.get("hojas_poli", 0) >= 0.5 * res["hojas"])
            for r in rows:
                if r["hoja"] != r["hoja_actual"] or (r["motivo_hoja"] or None) != (r["motivo_actual"] or None):
                    cambios.append({"id": r["id"], "hoja": int(r["hoja"]), "motivo": r["motivo_hoja"]})
            if args.detalle:
                hojas = [r for r in rows if r["hoja"]]
                print(f"\n### {m['nombre']} ({m['provincia']}) {mid}: {len(rows)} filas -> "
                      f"{len(hojas)} hojas, {res.get('hojas_poli', 0)} con contorno")
                print("  HOJAS: " + "; ".join(sorted(f"{r['nombre']} [{r['tipo']}"
                                                     f"{'' if r['poligono'] else ', punto'}]" for r in hojas)))
                fuera = [r for r in rows if not r["hoja"]]
                if fuera:
                    print("  RESPALDO: " + "; ".join(f"{r['nombre']} [{r['tipo']}] -> {r['motivo_hoja']}" for r in fuera))

        print(f"\n{'pais':4} {'munis':>5} {'filas':>7} {'hojas':>7} {'c/cont':>6} {'%':>4} | "
              f"{'C1':>5} {'C2 alg':>6} {'C2 1/2+':>7} | dup contenedor absorbido sin_coord anidados")
        for pais in sorted(por_pais):
            s = por_pais[pais]
            print(f"{pais:4} {s['munis']:5} {s['filas']:7,} {s['hojas']:7,} {s['hojas_poli']:6,} "
                  f"{100 * s['hojas_poli'] / max(1, s['hojas']):3.0f}% | {s['C1']:5} {s['C2_alguna']:6} "
                  f"{s['C2_mitad']:7} | {s['fuera_dup']} {s['fuera_contenedor']} {s['fuera_absorbido']} "
                  f"{s['fuera_sin_coord']} {s['anidados']}")
        print(f"\nFilas que cambian respecto de lo guardado: {len(cambios):,}")
        if not args.aplicar or not cambios:
            return
        escritas = 0
        for i in range(0, len(cambios), TANDA):
            async with engine.begin() as conn:
                await _escribir_tanda(conn, cambios[i:i + TANDA])
            escritas += len(cambios[i:i + TANDA])
            print(f"  escritas {escritas:,}/{len(cambios):,} ({time.time() - inicio:.0f}s)", flush=True)
        async with engine.connect() as conn:
            fila = (await conn.execute(text(f"""
                SELECT COUNT(*), SUM(hoja = 1), SUM(hoja = 1 AND poligono IS NOT NULL)
                FROM catalogo_barrios WHERE pais IN ({",".join(f":p{i}" for i in range(len(paises)))})"""),
                {f"p{i}": p for i, p in enumerate(paises)})).fetchone()
        print(f"Guardado: {int(fila[0]):,} filas, {int(fila[1] or 0):,} hoja, "
              f"{int(fila[2] or 0):,} hoja con contorno, en {(time.time() - inicio) / 60:.1f} min")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
