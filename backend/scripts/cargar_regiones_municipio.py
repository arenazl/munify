# -*- coding: utf-8 -*-
"""Carga en la base las regiones ya bajadas de OSM para un municipio.

Este script NO sale a la red: lee lo que dejo `services/osm_regiones.py` en su
cache. Es a proposito — crear una demo tiene que ser instantaneo, y bajar de
Overpass tarda minutos y falla seguido. La bajada es un trabajo previo; esto
solo copia.

QUE HACE
--------
  - Empareja los barrios de OSM con los que ya existen en la base (por nombre
    normalizado) y les pone su `osm_id` y su `poligono`.
  - Los que estan en OSM y no en la base, los crea.
  - Deja el limite del municipio como poligono de referencia.

La geometria se SIMPLIFICA antes de guardar: el contorno de Asuncion viene con
974 puntos y para dibujarlo en un mapa alcanzan ~200. Multiplicado por cientos
de municipios es la diferencia entre una tabla manejable y uno lento.

Uso:
    python scripts/cargar_regiones_municipio.py --muni 146 --cache asuncion
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

CACHE_DIR = Path(__file__).resolve().parent / "semillas" / "datos"
MAX_PUNTOS = 200


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace("'", "").replace("-", " ").split())


def simplificar(puntos: list, maximo: int = MAX_PUNTOS) -> list:
    """Reduce el contorno quedandose con 1 de cada N puntos.

    No es Douglas-Peucker: para dibujar un barrio en pantalla, tomar uno cada N
    da un resultado visualmente identico y es predecible. Se conserva siempre el
    primero y el ultimo para que el anillo cierre.
    """
    if not puntos or len(puntos) <= maximo:
        return puntos
    paso = len(puntos) / maximo
    salida = [puntos[int(i * paso)] for i in range(maximo)]
    if salida[-1] != puntos[-1]:
        salida.append(puntos[-1])
    return salida


def url_destino() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit(f"ABORTO: no es QA (base '{re.sub(r'.*/', '', url)}')")
    return url


async def main(muni: int, slug_cache: str):
    archivo = CACHE_DIR / f"osm_{slug_cache}_regiones.json"
    if not archivo.exists():
        sys.exit(f"No existe {archivo}. Primero hay que bajar las regiones.")
    datos = json.loads(archivo.read_text(encoding="utf-8"))
    niveles = datos.get("niveles", {})

    internos = sorted((n for n, v in niveles.items() if v and n != "8"), key=int)
    barrios_osm = niveles[internos[-1]] if internos else []
    limite = (niveles.get("8") or [None])[0]
    print(f"cache: {len(barrios_osm)} regiones internas · "
          f"{sum(1 for b in barrios_osm if b['poligono'])} con contorno")

    engine = create_async_engine(url_destino())
    async with engine.begin() as conn:
        existentes = {norm(r[1]): r[0] for r in (await conn.execute(text(
            "SELECT id, nombre FROM barrios WHERE municipio_id = :m"), {"m": muni})).all()}

        act = alta = sin_geo = 0
        for b in barrios_osm:
            poly = simplificar(b["poligono"]) if b["poligono"] else None
            if not poly:
                sin_geo += 1
            payload = {
                "osm": b["osm_id"],
                "poly": json.dumps(poly) if poly else None,
                "lat": b["lat"], "lon": b["lon"],
                "nom": b["nombre"], "m": muni,
            }
            bid = existentes.get(norm(b["nombre"]))
            if bid:
                await conn.execute(text("""
                    UPDATE barrios SET osm_id = :osm, poligono = :poly,
                        latitud = COALESCE(latitud, :lat), longitud = COALESCE(longitud, :lon)
                    WHERE id = :id
                """), {**payload, "id": bid})
                act += 1
            else:
                await conn.execute(text("""
                    INSERT INTO barrios (municipio_id, nombre, latitud, longitud,
                                         osm_id, poligono, tipo, validado)
                    VALUES (:m, :nom, :lat, :lon, :osm, :poly, 'barrio', 1)
                """), payload)
                alta += 1

        print(f"barrios: {act} actualizados · {alta} nuevos · {sin_geo} sin contorno")

        if limite and limite["poligono"]:
            puntos = simplificar(limite["poligono"], 400)
            print(f"limite del municipio disponible: {len(puntos)} puntos "
                  "(sirve para encuadrar el mapa; falta la columna donde guardarlo)")

    await engine.dispose()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--muni", type=int, required=True)
    p.add_argument("--cache", required=True, help="slug del cache, ej: asuncion")
    a, _ = p.parse_known_args()
    asyncio.run(main(a.muni, a.cache))
