# -*- coding: utf-8 -*-
"""Carga los GeoJSON normalizados a `geo_administrative_unit`. Agnostico del pais.

Lee lo que dejaron los importadores en `docs/geo/<PAIS>/*.geojson` —todos en el
formato canonico de `common.make_feature`— y los mete en la tabla. No sabe que
en Peru el nivel se llama distrito y en Chile comuna: sigue `level` y `parent`.

ORDEN
-----
Primero las unidades administrativas y despues las localidades, para que el
padre exista cuando se resuelve `parent_id`. Dentro de cada archivo, los niveles
se ordenan de mas grande a mas chico por la misma razon.

GEOMETRIA
---------
Se guarda el anillo exterior simplificado a 200 vertices, en WGS84. Los archivos
de origen pesan cientos de MB con la geometria completa; para decir "este
reclamo cae en esta zona" alcanza con eso, y la tabla queda manejable.

Idempotente: upsert por (country, type, code). Si un pais no trae codigo, se
genera uno estable a partir del padre y el nombre.

Uso:
    python scripts/geo/cargar.py --pais AR --dry-run
    python scripts/geo/cargar.py --pais AR
"""
import argparse
import asyncio
import glob
import json
import os
import re
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(AQUI)))

from shapely.geometry import shape  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

GEO_DIR = r"D:\Code\sugerenciasMun\docs\geo"
MAX_PUNTOS = 200

# De mas grande a mas chico. El orden importa: el padre tiene que existir antes.
ORDEN = ["country", "province", "department", "municipality", "district",
         "populated_place", "neighbourhood"]


def slug(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:32]


def simplificar(anillo, maximo=MAX_PUNTOS):
    if len(anillo) <= maximo:
        return anillo
    paso = len(anillo) / maximo
    return [anillo[int(i * paso)] for i in range(maximo)]


def anillo_y_centro(geometry):
    """(anillo [[lon,lat],...], lat, lng) o (None, lat, lng) si no es poligono."""
    try:
        g = shape(geometry)
    except Exception:
        return None, None, None
    try:
        c = g.representative_point()
        lat, lng = round(c.y, 6), round(c.x, 6)
    except Exception:
        lat = lng = None
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda x: x.area)
    if g.geom_type != "Polygon":
        return None, lat, lng
    anillo = simplificar([[round(x, 6), round(y, 6)] for x, y in g.exterior.coords])
    return anillo, lat, lng


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pais", required=True, help="AR, PY, BO, PE...")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    carpeta = os.path.join(GEO_DIR, args.pais.upper())
    archivos = sorted(glob.glob(os.path.join(carpeta, "*.geojson")))
    if not archivos:
        print(f"no hay geojson normalizados en {carpeta}")
        return 1

    # administrative primero, populated_places despues
    archivos.sort(key=lambda a: 0 if "administrative" in os.path.basename(a) else 1)

    features = []
    for a in archivos:
        with open(a, "r", encoding="utf-8") as f:
            fs = json.load(f).get("features", [])
        print(f"  {os.path.basename(a):<30} {len(fs):>6} features")
        features.extend(fs)

    features.sort(key=lambda f: ORDEN.index(f["properties"].get("level"))
                  if f["properties"].get("level") in ORDEN else 99)

    engine = create_async_engine(settings.DATABASE_URL)
    # (type, code) -> id, para resolver el padre sin volver a la base
    idx = {}
    guardados = huerfanos = sin_geom = 0

    async with engine.begin() as conn:
        r = await conn.execute(text(
            "SELECT id, type, code FROM geo_administrative_unit WHERE country = :c"),
            {"c": args.pais.upper()})
        for i, t, c in r.fetchall():
            idx[(t, c)] = i

    for f in features:
        p = f.get("properties") or {}
        nombre = (p.get("name") or "").strip()
        nivel = p.get("level")
        if not nombre or not nivel:
            continue

        padre = p.get("parent") or {}
        parent_id = None
        if padre.get("code"):
            parent_id = idx.get((padre.get("level"), str(padre["code"])))
            if parent_id is None and padre.get("level") is None:
                # el importador no dijo el nivel del padre: se prueba con todos
                for t in ORDEN:
                    parent_id = idx.get((t, str(padre["code"])))
                    if parent_id:
                        break
        if padre.get("code") and parent_id is None:
            huerfanos += 1

        anillo, lat, lng = anillo_y_centro(f.get("geometry"))
        if anillo is None:
            sin_geom += 1

        # sin codigo oficial, uno estable: nivel + padre + nombre
        code = str(p.get("code") or "").strip()
        if not code:
            code = f"{nivel[:3]}-{parent_id or 0}-{slug(nombre)}"

        if args.dry_run:
            guardados += 1
            idx.setdefault((nivel, code), -1)
            continue

        async with engine.begin() as conn:
            await conn.execute(text(
                """INSERT INTO geo_administrative_unit
                     (country, code, name, type, parent_id, source, source_code,
                      lat, lng, geometry)
                   VALUES (:pa, :co, :no, :ty, :pi, :so, :sc, :la, :ln, :ge)
                   ON DUPLICATE KEY UPDATE
                     name=VALUES(name), parent_id=COALESCE(VALUES(parent_id), parent_id),
                     source=VALUES(source), lat=VALUES(lat), lng=VALUES(lng),
                     geometry=COALESCE(VALUES(geometry), geometry)"""),
                {"pa": args.pais.upper(), "co": code, "no": nombre[:160], "ty": nivel,
                 "pi": parent_id, "so": p.get("source") or p.get("fuente"),
                 "sc": str(p.get("code") or "") or None,
                 "la": lat, "ln": lng,
                 "ge": json.dumps(anillo) if anillo else None})
            r = await conn.execute(text(
                "SELECT id FROM geo_administrative_unit "
                "WHERE country=:pa AND type=:ty AND code=:co"),
                {"pa": args.pais.upper(), "ty": nivel, "co": code})
            fila = r.fetchone()
            if fila:
                idx[(nivel, code)] = fila[0]
        guardados += 1
        if guardados % 250 == 0:
            print(f"    {guardados} ...", flush=True)

    print(f"\nRESULTADO{' (DRY RUN)' if args.dry_run else ''}: {guardados} unidades | "
          f"{huerfanos} con padre no encontrado | {sin_geom} sin poligono")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
