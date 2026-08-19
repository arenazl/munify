# -*- coding: utf-8 -*-
"""Lo que comparten los batch: rutas, conexion y normalizacion de nombres.

Todos los scripts de esta carpeta corren fuera del servidor, contra la base de
QA, y preparan datos que despues la app consume sin salir a la red. Lo que se
repetia en cada uno --- donde estan los datos, como se abre la base sin escribir
en produccion por accidente, como se compara un nombre entre dos fuentes ---
vive aca.
"""
from __future__ import annotations

import io
import os
import re
import sys
import unicodedata
from pathlib import Path

# scripts/batch/_comun.py -> backend/
BACKEND = Path(__file__).resolve().parent.parent.parent
DATOS = BACKEND / "scripts" / "datos"
SEMILLAS = BACKEND / "scripts" / "semillas" / "datos"
GEONAMES = DATOS / "geonames"
CONTORNOS = DATOS / "contornos"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


# El catalogo guarda el pais con dos letras, pero a Nominatim y a la linea de
# comandos se les habla en castellano, y geoBoundaries usa tres letras. Los tres
# nombres del mismo pais viven aca y no repartidos por los scripts.
PAISES = {
    "AR": {"nombre": "Argentina", "iso3": "ARG"},
    "PY": {"nombre": "Paraguay", "iso3": "PRY"},
    "UY": {"nombre": "Uruguay", "iso3": "URY"},
    "CL": {"nombre": "Chile", "iso3": "CHL"},
    "PE": {"nombre": "Peru", "iso3": "PER"},
    "BO": {"nombre": "Bolivia", "iso3": "BOL"},
}


def codigo_pais(algo: str) -> str:
    """'Argentina', 'ARG' o 'ar' -> 'AR'. Cadena vacia si no se reconoce."""
    if not algo:
        return ""
    x = norm(algo)
    for cod, d in PAISES.items():
        if x in (norm(cod), norm(d["nombre"]), norm(d["iso3"])):
            return cod
    return ""


def norm(s: str) -> str:
    """Nombre comparable entre fuentes: sin tildes, sin puntuacion, minusculas.

    Es lo que permite cruzar el catalogo con GeoNames o con un shapefile
    oficial, donde el mismo municipio aparece como "Yby Ya'u", "Yvy Ya´U" o
    "YBY YAU".
    """
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    for ch in ".-'’/":
        s = s.replace(ch, " ")
    return " ".join(s.lower().split())


def slug(texto: str, largo: int = 60) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(texto)).strip("-")[:largo]


def url_qa() -> str:
    """La base de QA, y sale gritando si apunta a otra cosa.

    Escribir en produccion es responsabilidad de Infraestructura, no de estos
    scripts: sin esta guarda alcanza con tener el .env de prod cargado para
    pisar datos de un cliente real.
    """
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        env = BACKEND / ".env"
        if env.exists():
            for linea in io.open(env, encoding="utf-8"):
                if linea.startswith("DATABASE_URL="):
                    url = linea.split("=", 1)[1].strip().strip('"')
                    break
    if not url:
        sys.exit("Sin DATABASE_URL: no hay base a la que conectarse.")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit("ABORTO: la base no es QA. Escribir en produccion lo hace Infraestructura.")
    return url


def motor():
    """Engine async contra QA, ya validado."""
    from sqlalchemy.ext.asyncio import create_async_engine
    return create_async_engine(url_qa())


# ==========================================================================
# Geometria compartida
# ==========================================================================

def anillos(geom: dict) -> list[list]:
    """Anillos exteriores de un GeoJSON, como listas [lon, lat]."""
    t, c = (geom or {}).get("type"), (geom or {}).get("coordinates") or []
    if t == "Polygon":
        return [c[0]] if c else []
    if t == "MultiPolygon":
        return [p[0] for p in c if p]
    return []


def simplificar(pts: list, maximo: int = 300) -> list:
    """Un contorno de 40.000 vertices no dibuja mejor que uno de 300.

    Se muestrea uno de cada N en vez de aplicar Douglas-Peucker: es una linea de
    codigo, conserva la forma para lo que se usa (dibujar el area y decidir si
    un punto cae adentro) y no agrega una dependencia geometrica al proyecto.
    """
    if len(pts) <= maximo:
        return pts
    paso = len(pts) / maximo
    out = [pts[int(i * paso)] for i in range(maximo)]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def dentro(punto: tuple[float, float], anillo: list) -> bool:
    """Punto-en-poligono por ray casting. Ambos en [lon, lat]."""
    x, y = punto
    adentro = False
    n = len(anillo)
    for i in range(n):
        x1, y1 = anillo[i][0], anillo[i][1]
        x2, y2 = anillo[(i + 1) % n][0], anillo[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            adentro = not adentro
    return adentro


async def contorno_catalogo(nombre_municipio: str, pais: str) -> list[dict]:
    """El limite oficial del municipio, si `contornos_municipios.py` ya lo cargo.

    Es la fuente correcta para un municipio SIN division interna --- casi todos ---:
    sortear dentro de su limite real en vez de un circulo evita plantar reclamos
    en el municipio vecino. Vacio si todavia no tiene contorno; ahi el llamador
    cae al circulo, que sigue funcionando.
    """
    import json

    from sqlalchemy import text

    cod = codigo_pais(pais)
    if not cod:
        return []
    engine = motor()
    try:
        async with engine.connect() as conn:
            fila = (await conn.execute(text(
                "SELECT nombre, poligono FROM municipios_catalogo "
                "WHERE pais = :p AND nombre = :n AND poligono IS NOT NULL LIMIT 1"),
                {"p": cod, "n": nombre_municipio})).first()
    finally:
        await engine.dispose()
    if not fila:
        return []
    try:
        anillo = json.loads(fila[1])
    except (ValueError, TypeError):
        return []
    return [{"nombre": fila[0], "anillo": anillo}] if len(anillo) >= 3 else []
