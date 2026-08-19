# -*- coding: utf-8 -*-
"""Los distritos de un municipio, desde la fuente OFICIAL paraguaya.

FUENTE
------
Visor del INFONA (Instituto Forestal Nacional), capa `sigi_limites/distritos`:
    https://visor.infona.gov.py/server/rest/services/sigi_limites/distritos/FeatureServer/0

Son 267 distritos de todo Paraguay con su geometria, codigo de departamento,
codigo distrital y area. Reemplaza a OpenStreetMap para Paraguay, y con ventaja:
  - es la division OFICIAL, no la que alguien mapeo;
  - una sola llamada trae el pais entero, sin rate limit ni 504;
  - los poligonos vienen armados, sin tramos sueltos que encadenar.

Para Asuncion trae los 6 distritos que NO existen en OSM (La Encarnacion, La
Catedral, San Roque, Sta. Maria, La Recoleta, Stma. Trinidad), sumando 126 km2:
la ciudad entera, sin huecos.

EL BARRIO SE ASIGNA POR GEOMETRIA
---------------------------------
Con los poligonos de distrito, cada barrio cae adentro de uno y punto. Se acabo
el mapeo a mano: no hay listas que completar, ni nombres que no coinciden, ni
barrios asignados por parecido. Si el centro de un barrio no cae en ningun
distrito, queda sin asignar y se avisa --- no se le busca el mas cercano.
"""
import argparse
import asyncio
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

FUENTE = Path(__file__).parent / "datos" / "infona_distritos_py.geojson"
MAX_PUNTOS = 300


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace(".", " ").split())


def titulo(s: str) -> str:
    """'STA. MARIA DE ASUNCION' -> 'Sta. Maria de Asuncion'."""
    menores = {"de", "del", "la", "las", "los", "y"}
    partes = (s or "").title().split()
    return " ".join(p if i == 0 or p.lower() not in menores else p.lower()
                    for i, p in enumerate(partes))


def anillos(geom: dict) -> list[list[list[float]]]:
    """Todos los anillos exteriores, como listas [lon, lat]."""
    t, c = geom.get("type"), geom.get("coordinates") or []
    if t == "Polygon":
        return [c[0]] if c else []
    if t == "MultiPolygon":
        return [p[0] for p in c if p]
    return []


def simplificar(pts: list, maximo: int = MAX_PUNTOS) -> list:
    if len(pts) <= maximo:
        return pts
    paso = len(pts) / maximo
    out = [pts[int(i * paso)] for i in range(maximo)]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def dentro(punto, poly) -> bool:
    x, y = punto
    d = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i][0], poly[i][1]
        x2, y2 = poly[(i + 1) % n][0], poly[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            d = not d
    return d


def url_destino() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit(f"ABORTO: no es QA (base '{re.sub(r'.*/', '', url)}')")
    return url


async def main(muni: int, cod_dpto: str):
    fs = json.loads(FUENTE.read_text(encoding="utf-8"))["features"]
    propios = [f for f in fs if (f["properties"].get("cod_dpto") or "").upper() == cod_dpto.upper()]
    if not propios:
        sys.exit(f"Sin distritos para cod_dpto={cod_dpto}")
    print(f"distritos oficiales encontrados: {len(propios)}")

    engine = create_async_engine(url_destino())
    async with engine.begin() as conn:
        # Las zonas que no estan en la fuente oficial se desactivan: eran las de
        # la semilla vieja, que eran barrios disfrazados de zona.
        nombres = [titulo(f["properties"]["nom_dist"]) for f in propios]
        await conn.execute(
            text("UPDATE zonas SET activo = 0 WHERE municipio_id = :m AND nombre NOT IN :n"
                 .replace(":n", "(" + ",".join(f"'{x}'" for x in nombres) + ")")), {"m": muni})

        ids, polys = {}, {}
        for f in propios:
            p = f["properties"]
            nombre = titulo(p["nom_dist"])
            ars = anillos(f.get("geometry") or {})
            if not ars:
                print(f"  {nombre}: sin geometria, se omite")
                continue
            mayor = simplificar(max(ars, key=len))
            polys[nombre] = mayor
            fila = (await conn.execute(text(
                "SELECT id FROM zonas WHERE municipio_id = :m AND nombre = :n"),
                {"m": muni, "n": nombre})).first()
            datos = {"m": muni, "n": nombre, "p": json.dumps(mayor),
                     "c": p.get("codigo"), "d": f"Distrito oficial · {p.get('area_km2')} km2"}
            if fila:
                await conn.execute(text(
                    "UPDATE zonas SET poligono = :p, codigo = :c, descripcion = :d, activo = 1 "
                    "WHERE id = :i"), {**datos, "i": fila[0]})
                ids[nombre] = fila[0]
            else:
                await conn.execute(text(
                    "INSERT INTO zonas (municipio_id, nombre, codigo, descripcion, poligono, activo) "
                    "VALUES (:m, :n, :c, :d, :p, 1)"), datos)
                ids[nombre] = (await conn.execute(text(
                    "SELECT id FROM zonas WHERE municipio_id = :m AND nombre = :n"),
                    {"m": muni, "n": nombre})).scalar()
            print(f"  {nombre:30} {len(mayor):5} pts")

        # ---- Cada barrio a su distrito, POR GEOMETRIA ----
        barrios = (await conn.execute(text(
            "SELECT id, nombre, latitud, longitud FROM barrios "
            "WHERE municipio_id = :m AND latitud IS NOT NULL"), {"m": muni})).all()
        asignados, huerfanos = 0, []
        for bid, bnom, la, lo in barrios:
            punto = (float(lo), float(la))
            destino = next((n for n, poly in polys.items() if dentro(punto, poly)), None)
            if not destino:
                huerfanos.append(bnom)
                continue
            await conn.execute(text("UPDATE barrios SET zona_id = :z WHERE id = :b"),
                               {"z": ids[destino], "b": bid})
            asignados += 1
        print(f"\nbarrios: {len(barrios)} · {asignados} asignados por geometria · "
              f"{len(huerfanos)} fuera de todo distrito")
        for h in huerfanos[:10]:
            print(f"   fuera: {h}")

        # ---- Y los reclamos heredan el distrito de su barrio ----
        r = await conn.execute(text(
            "UPDATE reclamos r JOIN barrios b ON b.id = r.barrio_id "
            "SET r.zona_id = b.zona_id "
            "WHERE r.municipio_id = :m AND b.zona_id IS NOT NULL"), {"m": muni})
        print(f"reclamos re-vinculados: {r.rowcount}")

    async with engine.connect() as conn:
        print("\nRECLAMOS POR DISTRITO")
        for row in (await conn.execute(text("""
            SELECT z.nombre, COUNT(r.id) n FROM zonas z
            LEFT JOIN reclamos r ON r.zona_id = z.id
            WHERE z.municipio_id = :m AND z.activo = 1
            GROUP BY z.id, z.nombre ORDER BY n DESC"""), {"m": muni})).all():
            print(f"  {row[1]:5}  {row[0]}")
    await engine.dispose()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--muni", type=int, required=True)
    ap.add_argument("--dpto", required=True, help="cod_dpto del INFONA (Asuncion = A)")
    a, _ = ap.parse_known_args()
    asyncio.run(main(a.muni, a.dpto))
