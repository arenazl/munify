"""Fetcher de geografia REAL de Asuncion desde OpenStreetMap (Overpass API).

Genera/actualiza el cache `datos/osm_asuncion.json` que consume la semilla de
volumen del mapa (`m_60_mapa_volumen.py`).

POR QUE UN CACHE Y NO UNA LLAMADA EN VIVO
-----------------------------------------
Regla dura del proyecto: **jamas simular datos como reales**. Nada de
`random.uniform()` para coordenadas ni direcciones inventadas. La geografia sale
de OSM, que es dato publico real y verificable. Pero la semilla tiene que ser
*reproducible y deterministica*, y Overpass es un servicio publico con rate
limit (429/504 son frecuentes). Por eso el flujo es:

    Overpass  --(este script, se corre a mano cuando hace falta)-->  datos/osm_asuncion.json
    datos/osm_asuncion.json  --(lo lee la semilla, siempre)-->  reclamos

La semilla NUNCA sale a la red: lee el JSON cacheado. Este script es el unico
que habla con Overpass, y se corre solo para regenerar el cache.

QUE TRAE
--------
  - `esquinas`   : cruces REALES de calles. Se calculan de OSM: un nodo compartido
                   por dos ways con `name` distinto ES una esquina, y de ahi salen
                   los dos nombres de calle ("Palma c/ Chile"). Nada inventado.
  - `equipamiento`: hospitales, escuelas, mercados, bomberos, comisarias, plazas
                   y universidades con nombre real y coordenada real.
  - `barrios`    : limites administrativos `admin_level=10` de Asuncion (+ nodos
                   `place=neighbourhood`), con su centroide.

FUENTE / LICENCIA
-----------------
  API      : https://overpass-api.de/api/interpreter
  Area OSM : relation 3654543 -- "Asuncion", Paraguay, admin_level 8
             (area id de Overpass = 3600000000 + 3654543 = 3603654543)
  Licencia : ODbL -- (c) OpenStreetMap contributors. https://www.openstreetmap.org/copyright

Uso:
    cd backend/scripts/semillas
    python osm_asuncion_fetch.py            # regenera datos/osm_asuncion.json
    python osm_asuncion_fetch.py --crudo    # ademas deja los .json crudos de Overpass
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import time
from datetime import date
from pathlib import Path

import requests

CARPETA = Path(__file__).resolve().parent
DESTINO = CARPETA / "datos" / "osm_asuncion.json"

ENDPOINT = "https://overpass-api.de/api/interpreter"
# Overpass rechaza con 406 si no mandas User-Agent identificable.
UA = {"User-Agent": "munify-seed/1.0 (semilla de demo QA; contacto arenazl@gmail.com)"}
AREA = 3603654543  # relation 3654543 = Asuncion (PY), admin_level 8
RELACION_OSM = "relation/3654543"

# Cuantas esquinas guardar en el cache. 7.400+ cruces reales es mas de lo que
# necesita la semilla y engorda el repo; con ~3.000 bien repartidas sobra para
# ~900 reclamos sin repetir direccion mas de un par de veces.
MAX_ESQUINAS = 3000
# Dos nodos OSM a menos de esto son la MISMA esquina (calzadas dobles, isletas).
DEDUP_METROS = 30.0
# Lado de la celda del muestreo estratificado. El recorte a MAX_ESQUINAS NO puede
# ser "las primeras N ordenadas": eso deja media ciudad afuera y solo avenidas.
# Se toma por ronda una esquina de cada celda, asi el cache cubre TODA Asuncion y
# mezcla corredores con calles de barrio.
CELDA_MUESTREO_METROS = 400.0

TIPOS_VIA_CORREDOR = "trunk|primary|secondary|tertiary"


# ---------------------------------------------------------------------------
# HTTP con backoff (Overpass tira 429/504 seguido)
# ---------------------------------------------------------------------------
def _overpass(query: str, intentos: int = 6) -> dict:
    for i in range(intentos):
        resp = requests.post(ENDPOINT, data=query.encode("utf-8"), headers=UA, timeout=300)
        if resp.status_code == 200:
            print(f"    HTTP 200  {len(resp.content) / 1024:.0f} KB")
            return resp.json()
        espera = 20 * (i + 1)
        print(f"    HTTP {resp.status_code} — reintento en {espera}s")
        time.sleep(espera)
    raise SystemExit("[osm] Overpass no responde tras varios reintentos. Reintentar mas tarde.")


def _metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine en metros (mismo criterio que `frontend/src/lib/mapaUtils.ts`)."""
    r = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# 1) Esquinas reales (nodo compartido por dos calles con nombre distinto)
# ---------------------------------------------------------------------------
def traer_esquinas(guardar_crudo: bool) -> list[dict]:
    print("[osm] calles con nombre — corredores (trunk/primary/secondary/tertiary)")
    d_corr = _overpass(f"""[out:json][timeout:240];
way(area:{AREA})["highway"~"^({TIPOS_VIA_CORREDOR})$"]["name"];
out body;
>;
out skel qt;""")
    time.sleep(10)
    print("[osm] calles con nombre — residenciales")
    d_res = _overpass(f"""[out:json][timeout:240];
way(area:{AREA})["highway"="residential"]["name"];
out body;
>;
out skel qt;""")

    if guardar_crudo:
        json.dump(d_corr, open(CARPETA / "_crudo_corredores.json", "w", encoding="utf-8"))
        json.dump(d_res, open(CARPETA / "_crudo_residenciales.json", "w", encoding="utf-8"))

    coords: dict[int, tuple[float, float]] = {}
    # nodo -> nombres de calle que pasan por el / si alguna es corredor
    nombres: dict[int, set[str]] = collections.defaultdict(set)
    es_corredor: set[int] = set()

    for datos, corredor in ((d_corr, True), (d_res, False)):
        for e in datos["elements"]:
            if e["type"] == "node":
                coords[e["id"]] = (e["lat"], e["lon"])
            elif e["type"] == "way" and (e.get("tags") or {}).get("name"):
                nombre = e["tags"]["name"]
                for nid in e.get("nodes", []):
                    nombres[nid].add(nombre)
                    if corredor:
                        es_corredor.add(nid)

    crudas = []
    for nid, calles in nombres.items():
        if len(calles) < 2 or nid not in coords:
            continue
        lat, lon = coords[nid]
        a, b = sorted(calles)[:2]
        crudas.append({
            "lat": round(lat, 6), "lon": round(lon, 6),
            "a": a, "b": b, "corr": nid in es_corredor,
        })
    print(f"[osm] cruces detectados: {len(crudas)} "
          f"({sum(1 for c in crudas if c['corr'])} tocan un corredor)")

    # Orden determinista (corredores primero, despues por coordenada): el cache
    # sale identico en cada corrida.
    crudas.sort(key=lambda c: (not c["corr"], c["lat"], c["lon"]))

    def _celda(c: dict, lado_m: float) -> tuple[int, int]:
        paso_lat = lado_m / 111_320.0
        paso_lon = paso_lat / max(0.1, math.cos(math.radians(c["lat"])))
        return (int(c["lat"] / paso_lat), int(c["lon"] / paso_lon))

    # a) Dedup espacial (~30 m): 4 nodos de la misma esquina (calzada doble,
    #    isleta) son UNA esquina.
    vistos: set[tuple[int, int]] = set()
    unicas: list[dict] = []
    for c in crudas:
        celda = _celda(c, DEDUP_METROS)
        if celda in vistos:
            continue
        vistos.add(celda)
        unicas.append(c)
    print(f"[osm] esquinas unicas tras dedup {DEDUP_METROS:.0f} m: {len(unicas)}")

    # b) Muestreo estratificado: round-robin por celda de ~400 m. Garantiza que
    #    el recorte cubra toda la ciudad (no solo el sur) y mezcle avenidas con
    #    calles de barrio (no solo corredores).
    por_celda: dict[tuple[int, int], list[dict]] = collections.defaultdict(list)
    for c in unicas:
        por_celda[_celda(c, CELDA_MUESTREO_METROS)].append(c)
    celdas = [por_celda[k] for k in sorted(por_celda)]
    esquinas: list[dict] = []
    ronda = 0
    while len(esquinas) < MAX_ESQUINAS and any(len(g) > ronda for g in celdas):
        for grupo in celdas:
            if ronda < len(grupo):
                esquinas.append(grupo[ronda])
                if len(esquinas) >= MAX_ESQUINAS:
                    break
        ronda += 1
    esquinas.sort(key=lambda c: (c["lat"], c["lon"]))
    print(f"[osm] esquinas cacheadas: {len(esquinas)} sobre {len(celdas)} celdas de "
          f"{CELDA_MUESTREO_METROS:.0f} m ({sum(1 for c in esquinas if c['corr'])} en corredor)")
    return esquinas


# ---------------------------------------------------------------------------
# 2) Equipamiento urbano (los futuros POIs)
# ---------------------------------------------------------------------------
def traer_equipamiento(guardar_crudo: bool) -> list[dict]:
    print("[osm] equipamiento (hospitales, escuelas, mercados, bomberos, plazas...)")
    d = _overpass(f"""[out:json][timeout:240];
(
  nwr(area:{AREA})["amenity"~"^(hospital|clinic|school|kindergarten|fire_station|police|marketplace|university|college)$"]["name"];
  nwr(area:{AREA})["leisure"~"^(park|garden)$"]["name"];
);
out tags center;""")
    if guardar_crudo:
        json.dump(d, open(CARPETA / "_crudo_equipamiento.json", "w", encoding="utf-8"))

    salida = []
    for e in d["elements"]:
        t = e.get("tags") or {}
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lon = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        clave = "amenity" if t.get("amenity") else "leisure"
        salida.append({
            "nombre": t["name"],
            "lat": round(lat, 6), "lon": round(lon, 6),
            "osm": f"{clave}={t[clave]}",
            "id": f"{e['type']}/{e['id']}",
        })
    salida.sort(key=lambda x: (x["osm"], x["nombre"]))
    print(f"[osm] equipamiento cacheado: {len(salida)}")
    return salida


# ---------------------------------------------------------------------------
# 3) Barrios (admin_level 10 + place=neighbourhood)
# ---------------------------------------------------------------------------
def traer_barrios(guardar_crudo: bool) -> list[dict]:
    print("[osm] barrios (admin_level 9/10/11 + place=neighbourhood)")
    d = _overpass(f"""[out:json][timeout:240];
(
  nwr(area:{AREA})["boundary"="administrative"]["admin_level"~"^(9|10|11)$"];
  node(area:{AREA})["place"~"^(suburb|neighbourhood|quarter)$"];
);
out tags center;""")
    if guardar_crudo:
        json.dump(d, open(CARPETA / "_crudo_barrios.json", "w", encoding="utf-8"))

    por_nombre: dict[str, dict] = {}
    for e in d["elements"]:
        t = e.get("tags") or {}
        nombre = t.get("name")
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lon = e.get("lon") or (e.get("center") or {}).get("lon")
        if not nombre or lat is None or lon is None:
            continue
        # Preferimos el limite administrativo al nodo `place` suelto.
        peso = 0 if t.get("boundary") == "administrative" else 1
        previo = por_nombre.get(nombre)
        if previo is None or peso < previo["_peso"]:
            por_nombre[nombre] = {
                "nombre": nombre, "lat": round(lat, 6), "lon": round(lon, 6),
                "id": f"{e['type']}/{e['id']}", "_peso": peso,
            }
    salida = sorted((({k: v for k, v in b.items() if k != "_peso"}) for b in por_nombre.values()),
                    key=lambda b: b["nombre"])
    print(f"[osm] barrios cacheados: {len(salida)}")
    return salida


def main() -> int:
    ap = argparse.ArgumentParser(description="Regenera el cache de geografia real de Asuncion (OSM)")
    ap.add_argument("--crudo", action="store_true", help="ademas deja los JSON crudos de Overpass")
    args = ap.parse_args()

    DESTINO.parent.mkdir(parents=True, exist_ok=True)

    esquinas = traer_esquinas(args.crudo)
    time.sleep(10)
    equipamiento = traer_equipamiento(args.crudo)
    time.sleep(10)
    barrios = traer_barrios(args.crudo)

    doc = {
        "_fuente": "OpenStreetMap — Overpass API (https://overpass-api.de/api/interpreter)",
        "_licencia": "ODbL — (c) OpenStreetMap contributors (https://www.openstreetmap.org/copyright)",
        "_area_osm": f"{RELACION_OSM} — Asuncion, Paraguay (admin_level 8); area Overpass {AREA}",
        "_generado": date.today().isoformat(),
        "_regenerar": "python osm_asuncion_fetch.py  (desde backend/scripts/semillas)",
        "_nota": ("Coordenadas y nombres son dato publico REAL de OSM. Las 'esquinas' se derivan "
                  "de nodos compartidos por dos ways con `name` distinto: son cruces reales, no "
                  "puntos generados. NADA de esto es inventado ni aleatorio."),
        "esquinas": esquinas,
        "equipamiento": equipamiento,
        "barrios": barrios,
    }
    with open(DESTINO, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"\n[osm] escrito {DESTINO} — {DESTINO.stat().st_size / 1024:.0f} KB "
          f"({len(esquinas)} esquinas, {len(equipamiento)} equipamientos, {len(barrios)} barrios)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
