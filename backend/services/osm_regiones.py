# -*- coding: utf-8 -*-
"""Regiones geograficas de un municipio, desde OpenStreetMap.

QUE RESUELVE
------------
Que cualquier municipio pueda tener sus regiones REALES sin que nadie las cargue
a mano ni las invente. Lo consumen dos lugares: el boton del ABM de Zonas (uso
manual, y es parte de lo que se muestra en la demo) y la semilla de demos, para
que todo municipio demo nazca con su geografia.

LA JERARQUIA
------------
    municipio  ->  distritos  ->  barrios

Regla del modelo: **todo barrio tiene distrito**. Por eso se importan primero
los distritos y despues los barrios colgando de ellos; al reves quedan
huerfanos, que es el problema que tiene hoy la base.

En OSM esa jerarquia son niveles administrativos. No es igual en todos los
paises, asi que NO se asume un numero fijo: se pide el rango 8-10 y se ordena
por nivel. El nivel mas grueso que aparezca dentro del municipio son los
distritos, y el mas fino, los barrios.

POR QUE HAY CACHE Y NO ES OPCIONAL
----------------------------------
Overpass es un servicio publico con rate limit: durante el desarrollo de esto
devolvio un 504 y un 429 en veinte minutos. Si la semilla o el boton le pegan en
vivo, la demo se cae en el peor momento. Por eso: se baja UNA vez por municipio,
se guarda en `scripts/semillas/datos/osm_<municipio>.json`, y a partir de ahi
todo sale del archivo. El `osm_id` de cada region es lo que hace la operacion
reproducible: pedir la geometria de un id devuelve siempre lo mismo, mientras
que buscar por nombre no lo garantiza.

FUENTE / LICENCIA
-----------------
  https://overpass-api.de/api/interpreter -- ODbL, (c) OpenStreetMap contributors
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

CACHE_DIR = Path(__file__).resolve().parent.parent / "scripts" / "semillas" / "datos"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = "Munify/1.0 (regiones municipales; https://munify.com.ar)"


class OsmNoDisponible(RuntimeError):
    """Overpass no contesto. El llamador decide si sirve el cache o se corta."""


def _slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-")[:60]


def _consultar(query: str, timeout: int = 200) -> dict:
    ultimo = None
    for mirror in MIRRORS:
        try:
            datos = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(mirror, data=datos, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001 -- se reintenta con el otro mirror
            ultimo = f"{type(e).__name__}: {e}"
            time.sleep(5)
    raise OsmNoDisponible(ultimo or "sin respuesta")


def _anillo_exterior(el: dict) -> list[list[float]] | None:
    """Contorno de una relacion de OSM como lista [lon, lat].

    Se queda con los tramos `outer`. Los huecos (`inner`) se ignoran a
    proposito: para pintar un barrio en un mapa no aportan y complican el
    poligono. Si un dia hace falta precision catastral, hay que armarlos.
    """
    tramos = [m.get("geometry") or [] for m in el.get("members", [])
              if m.get("role") in ("outer", "") and m.get("geometry")]
    if not tramos:
        geo = el.get("geometry")
        if not geo:
            return None
        tramos = [geo]
    puntos: list[list[float]] = []
    for tramo in tramos:
        for p in tramo:
            puntos.append([round(p["lon"], 6), round(p["lat"], 6)])
    return puntos or None


def _centro(el: dict) -> tuple[float | None, float | None]:
    c = el.get("center") or {}
    return c.get("lat"), c.get("lon")


def descargar_regiones(osm_id_municipio: str, nombre_municipio: str,
                       forzar: bool = False) -> dict[str, Any]:
    """Baja las regiones del municipio y deja el resultado cacheado.

    `osm_id_municipio` viene como 'relation/3654543' (lo que guarda el catalogo).
    Devuelve {'niveles': {nivel: [regiones]}, 'fuente': ..., 'cacheado': bool}.
    """
    cache = CACHE_DIR / f"osm_{_slug(nombre_municipio)}_regiones.json"
    previo: dict[str, dict] = {}
    if cache.exists():
        datos = json.loads(cache.read_text(encoding="utf-8"))
        if not forzar:
            datos["cacheado"] = True
            return datos
        # Con `forzar`, lo ya bajado NO se tira: se usa para no volver a pedir
        # lo que ya tiene contorno. Overpass corta lotes al azar, asi que una
        # sola corrida rara vez trae las regiones completas; corriendo de nuevo
        # se completan las que faltan en vez de empezar de cero cada vez.
        for nivel_previo, regs in datos.get("niveles", {}).items():
            for r in regs:
                previo[r["osm_id"]] = {**r, "_nivel": nivel_previo}

    rel = osm_id_municipio.split("/")[-1]
    area = 3600000000 + int(rel)

    # UN NIVEL POR CONSULTA, a proposito. Pedir 8, 9 y 10 juntos con su
    # geometria hace timeout (504): son cientos de contornos en una sola
    # respuesta. Separado, cada consulta es liviana, y si un nivel falla los
    # otros igual sirven en vez de perderse todo.
    por_nivel: dict[str, list[dict]] = {}
    fallos: list[str] = []
    for nivel in ("9", "10", "8"):
        # SIEMPRE EN DOS PASOS, y no por prudencia: es la unica forma que
        # funciona. Con un filtro de area, Overpass devuelve la relacion pero
        # NO expande sus miembros, asi que el contorno llega vacio; y si se
        # fuerza la geometria en la misma consulta, un nivel con muchas
        # regiones (los 66 barrios de Asuncion) hace timeout. Separado anda:
        # primero la lista, que es liviana, y despues los contornos por lotes.
        if True:
            try:
                cruda = _consultar(f"""
                [out:json][timeout:180];
                area({area})->.muni;
                relation(area.muni)["boundary"="administrative"]["admin_level"="{nivel}"];
                out tags center;
                """)
                ids = [e["id"] for e in cruda.get("elements", [])
                       if not (previo.get(f"relation/{e['id']}") or {}).get("poligono")]
                geom: dict[int, dict] = {}
                for i in range(0, len(ids), 12):
                    lote = ",".join(str(x) for x in ids[i:i + 12])
                    try:
                        r = _consultar(f"[out:json][timeout:180];relation(id:{lote});out geom;")
                        for el in r.get("elements", []):
                            geom[el["id"]] = el
                    except OsmNoDisponible:
                        pass  # ese lote queda sin contorno; el resto sirve
                    time.sleep(2)
                for el in cruda.get("elements", []):
                    if el["id"] in geom:
                        el["members"] = geom[el["id"]].get("members", [])
                        el["geometry"] = geom[el["id"]].get("geometry")
            except OsmNoDisponible as e2:
                fallos.append(f"nivel {nivel}: {e2}")
                continue
        for el in cruda.get("elements", []):
            tags = el.get("tags", {})
            nombre = tags.get("name")
            if not nombre:
                continue
            lat, lon = _centro(el)
            osm_ref = f"relation/{el['id']}"
            # El contorno que ya se habia bajado antes vale igual: se conserva
            # en vez de volver a pedirlo (ver `previo`).
            poligono = _anillo_exterior(el) or (previo.get(osm_ref) or {}).get("poligono")
            por_nivel.setdefault(nivel, []).append({
                "nombre": nombre,
                "osm_id": osm_ref,
                "lat": lat,
                "lon": lon,
                "poligono": poligono,
            })
        time.sleep(2)  # cortesia con el servicio publico

    # NUNCA guardar menos de lo que ya se tenia. Overpass falla un nivel entero
    # cada tanto, y sin esto una corrida con suerte mala pisa el cache bueno y
    # se pierde todo lo bajado antes. Lo que no vino en ESTA corrida se conserva
    # de la anterior.
    vistos = {r["osm_id"] for regs in por_nivel.values() for r in regs}
    recuperadas = 0
    for osm_ref, r in previo.items():
        if osm_ref in vistos:
            continue
        nivel_previo = r.pop("_nivel", None)
        if not nivel_previo:
            continue
        por_nivel.setdefault(nivel_previo, []).append(r)
        recuperadas += 1
    if recuperadas:
        fallos.append(f"{recuperadas} regiones conservadas de la corrida anterior")

    if not por_nivel:
        raise OsmNoDisponible("; ".join(fallos) or "sin regiones")

    datos = {
        "municipio": nombre_municipio,
        "osm_id": osm_id_municipio,
        "niveles": por_nivel,
        "fuente": "OpenStreetMap (Overpass API) — ODbL",
        "niveles_fallidos": fallos,
        "cacheado": False,
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    return datos


def separar_jerarquia(niveles: dict[str, list[dict]]) -> tuple[list[dict], list[dict]]:
    """Del crudo por nivel a (distritos, barrios).

    El municipio mismo suele venir como el nivel mas grueso: se descarta, porque
    no es una region interna. De lo que queda, el nivel mas grueso son los
    distritos y el mas fino los barrios. Si hay un solo nivel, ese nivel son los
    distritos y no hay barrios — es el caso de una ciudad chica que solo tiene
    una division.
    """
    presentes = sorted((n for n, v in niveles.items() if v), key=int)
    if not presentes:
        return [], []
    if len(presentes) == 1:
        return niveles[presentes[0]], []
    return niveles[presentes[0]], niveles[presentes[-1]]
