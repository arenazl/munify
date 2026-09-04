# -*- coding: utf-8 -*-
"""Catalogo de BARRIOS con contorno, por municipio, desde el extracto de OSM.

Decision de producto (Lucas, 2026-09-03): la semilla de una demo NO fabrica
geografia. Lee el municipio del catalogo, la Zona unica (registro estandar) y
los barrios del catalogo —nombre + poligono— y lo unico que genera son los
puntos de los reclamos. Para que eso sea posible los barrios tienen que estar
curados ANTES, en una tabla propia: `catalogo_barrios`.

Que es un barrio aca: TODO nombre externo que cae dentro del contorno del
municipio, en una lista plana (sin niveles intermedios):
  - nodos `place` city/town/village/hamlet/suburb/neighbourhood/quarter (punto);
  - ways cerrados y relaciones `place` suburb/neighbourhood/quarter (AREA);
  - relaciones `boundary=administrative` admin_level 9|10 (AREA);
  - ways cerrados y relaciones `landuse=residential` CON nombre (AREA): los
    loteos y barrios que OSM dibuja como uso del suelo y no como `place`.
    Es lo que llena los pueblos del interior (Cordoba, Santa Fe, Entre Rios),
    donde el municipio ES el pueblo y no hay `place=suburb` (Lucas, 2026-09-03:
    "barrio y localidad son sinonimos: lo que mejor consiga poligonos");
  - las localidades del padron (`catalogo_zonas`) que ya tienen contorno: entran
    como barrio con poligono, o le prestan el poligono al nodo homonimo de OSM.
Se excluyen: los cardinales sueltos ("Norte"), el homonimo del municipio (la
ciudad no es un barrio de si misma) y toda area que cubra mas del 60% del
municipio (es la ciudad con otro nombre).

`extraer_osm_pbf.py` guarda de cada area solo el centro (como el `out center`
de Overpass); este script guarda el ANILLO EXTERIOR. Las relaciones se
ensamblan encadenando sus ways —`osm_regiones._anillo_exterior`, el mismo que
dibujo Asuncion— y NO con el ensamblador de areas de pyosmium, que armaria
ademas cada edificio cerrado del pais. Un anillo que no cierra (falta un way
en el extracto) se degrada a punto, nunca se guarda un contorno partido.

Dos fases, como el extractor:
  (1) pasada por el PBF -> `barrios_<PAIS>.sqlite` (junto al pbf);
  (2) sqlite (+ padron) -> `catalogo_barrios`, POR PROVINCIA, en tandas de 10
      municipios con commit y avance impreso (pedido de Lucas: que nada se
      pierda a mitad de camino). Reescribe el municipio completo (DELETE +
      INSERT), asi correrlo dos veces da lo mismo. Antes de insertar, cada
      municipio pasa por `_hojas.marcar_hojas`: la lista plana guarda TODO,
      pero solo las filas `hoja = 1` se muestran (las localidades cubiertas
      por sus barrios, las grafias repetidas y los puntos adentro de un
      contorno dibujado quedan de respaldo con su `motivo_hoja`).

    DATABASE_URL_QA="..." python scripts/geo/catalogo_barrios_pbf.py --env qa \
        --pais AR --pbf ruta/argentina-latest.osm.pbf --provincia "Buenos Aires" --aplicar
    ... --muni 820210      # un solo municipio (Rosario), para mirar de cerca
    ... --rehacer          # repetir la fase 1 aunque el sqlite exista
Sin `--aplicar` hace la fase 1 (si falta) y muestra que escribiria.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402
from _hojas import asegurar_columnas, marcar_hojas  # noqa: E402
from services import geo_ciudad  # noqa: E402
from services.geo_demo import _norm  # noqa: E402
from services.osm_regiones import _anillo_exterior  # noqa: E402

PLACES_NODO = frozenset(geo_ciudad.PLACES_ZONA + geo_ciudad.PLACES_BARRIO)
PLACES_AREA = frozenset(geo_ciudad.PLACES_BARRIO)
ADMIN_BARRIO = frozenset({"9", "10"})
# Uso del suelo que cuenta como barrio si tiene nombre (tipo `residential`).
LANDUSE_BARRIO = frozenset({"residential"})
FUENTE_PBF = "osm_pbf"
FUENTE_PADRON = "georef"
# Un area que cubre mas que esto del municipio no es un barrio: es la ciudad.
MAX_FRACCION_MUNICIPIO = 0.60
# Simplificacion del anillo: ~5 m de tolerancia y un tope de vertices para que
# el JSON de un municipio con 150 barrios no pese megas.
TOLERANCIA_GRADOS = 0.00005
MAX_VERTICES = 300
TANDA = 10

DDL = """
CREATE TABLE IF NOT EXISTS catalogo_barrios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  municipio_catalogo_id VARCHAR(20) NOT NULL,
  pais VARCHAR(2) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  nombre_norm VARCHAR(120) NOT NULL,
  -- suburb | neighbourhood | quarter | city | town | village | hamlet |
  -- admin9 | admin10 | localidad | residential (landuse con nombre)
  tipo VARCHAR(20) NOT NULL,
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  -- anillo exterior [[lon, lat], ...] cerrado, o NULL si OSM solo tiene el punto
  poligono MEDIUMTEXT NULL,
  vertices SMALLINT NULL,
  fuente VARCHAR(20) NOT NULL,
  osm_id VARCHAR(30) NULL,
  -- 1 = se muestra; 0 = respaldo (localidad cubierta por sus barrios, grafia
  -- repetida, punto adentro de un contorno dibujado). Regla en `_hojas.py`.
  hoja TINYINT(1) NOT NULL DEFAULT 1,
  motivo_hoja VARCHAR(120) NULL,
  actualizado_en DATETIME NOT NULL,
  UNIQUE KEY uq_cat_barrio (municipio_catalogo_id, nombre_norm),
  KEY ix_cat_barrio_pais (pais)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""
# La collation es la de `municipios_catalogo` (general_ci), como en
# `catalogo_geo_osm`: con la default de la base el JOIN por id mezcla collations.


def _args() -> argparse.Namespace:
    p = parser_base("Catalogo de barrios con contorno desde el extracto PBF (offline).")
    p.add_argument("--pais", default="AR", help="ISO-2 del catalogo (default AR)")
    p.add_argument("--pbf", required=True, help="Ruta al <pais>-latest.osm.pbf de Geofabrik")
    p.add_argument("--sqlite", default="", help="Ruta del sqlite intermedio (default junto al pbf)")
    p.add_argument("--provincia", default="", help="Escribir solo esta provincia (nombre exacto del catalogo)")
    p.add_argument("--muni", default="", help="Escribir solo este municipio (id del catalogo)")
    p.add_argument("--rehacer", action="store_true", help="Rehacer la pasada por el PBF aunque el sqlite exista")
    p.add_argument("--limite", type=int, default=0, help="Cuantos municipios escribir como maximo (0 = todos)")
    return p.parse_args()


# ==========================================================================
# Municipios del catalogo + indice espacial
# ==========================================================================

async def _municipios(conn, pais: str) -> list[dict]:
    filas = (await conn.execute(text("""
        SELECT id, nombre, provincia, poligono
        FROM municipios_catalogo
        WHERE pais = :p AND poligono IS NOT NULL
        ORDER BY provincia, nombre
    """), {"p": pais})).fetchall()
    out = []
    for f in filas:
        try:
            anillo = json.loads(f[3])
        except (ValueError, TypeError):
            continue
        if isinstance(anillo, list) and len(anillo) >= 3:
            out.append({"id": f[0], "nombre": f[1], "provincia": f[2], "anillo": anillo})
    return out


def _poligono(anillo) -> "object":
    """Polygon de shapely a partir de [[lon, lat], ...]; vacio si no se puede."""
    from shapely.geometry import MultiPolygon, Polygon

    try:
        poli = Polygon([(float(c[0]), float(c[1])) for c in anillo])
    except (ValueError, TypeError, IndexError):
        return Polygon()
    if not poli.is_valid:
        poli = poli.buffer(0)
    if isinstance(poli, MultiPolygon):
        poli = max(poli.geoms, key=lambda g: g.area) if poli.geoms else Polygon()
    return poli


def _indice(municipios: list[dict]):
    import shapely

    polis = [_poligono(m["anillo"]) for m in municipios]
    return shapely.STRtree(polis), polis


# ==========================================================================
# Fase 1: pasada por el PBF -> sqlite de barrios (con anillo si lo hay)
# ==========================================================================

def _rol_relacion(tags: dict) -> str | None:
    if not tags.get("name"):
        return None
    if tags.get("place") in PLACES_AREA:
        return tags["place"]
    if tags.get("boundary") == "administrative" and tags.get("admin_level") in ADMIN_BARRIO:
        return "admin" + tags["admin_level"]
    if tags.get("landuse") in LANDUSE_BARRIO:
        return "residential"
    return None


def _relaciones(pbf: str) -> dict:
    """Pasada barata (solo relaciones): id -> (nombre, tipo, [(way, rol)])."""
    import osmium

    quiero: dict[int, tuple[str, str, list[tuple[int, str]]]] = {}
    fp = (osmium.FileProcessor(pbf, osmium.osm.RELATION)
          .with_filter(osmium.filter.KeyFilter("place", "boundary", "landuse")))
    for r in fp:
        tags = {t.k: t.v for t in r.tags}
        tipo = _rol_relacion(tags)
        if not tipo:
            continue
        miembros = [(m.ref, m.role) for m in r.members if m.type == "w"]
        if miembros:
            quiero[r.id] = (tags["name"], tipo, miembros)
    return quiero


def _coords(way) -> list[tuple[float, float]]:
    out = []
    for n in way.nodes:
        loc = n.location
        if loc.valid():
            out.append((loc.lon, loc.lat))
    return out


def _simplificar(anillo: list[list[float]]):
    """(anillo simplificado cerrado, Polygon) o (None, None) si no es un area."""
    poli = _poligono(anillo)
    if poli.is_empty or poli.area <= 0:
        return None, None
    tol = TOLERANCIA_GRADOS
    simple = poli.simplify(tol, preserve_topology=True)
    intentos = 0
    while len(simple.exterior.coords) > MAX_VERTICES and intentos < 6:
        tol *= 2
        simple = poli.simplify(tol, preserve_topology=True)
        intentos += 1
    if simple.is_empty:
        return None, None
    pts = [[round(x, 6), round(y, 6)] for x, y in simple.exterior.coords]
    return pts, poli


def extraer(pbf: str, sqlite_path: str, municipios: list[dict]) -> dict:
    import osmium
    import shapely

    tree, _ = _indice(municipios)
    ids = [m["id"] for m in municipios]

    t0 = time.time()
    relaciones = _relaciones(pbf)
    ways_de_relacion: set[int] = set()
    for _, _, miembros in relaciones.values():
        ways_de_relacion.update(w for w, _ in miembros)
    coords_ways: dict[int, list[tuple[float, float]]] = {}
    print(f"  relaciones-barrio: {len(relaciones):,} ({len(ways_de_relacion):,} ways miembro) "
          f"{time.time() - t0:.0f}s", flush=True)

    class _Miembros(osmium.SimpleHandler):
        """Los ways sin `place` que dibujan las relaciones-barrio (el filtro de
        etiquetas los descarta; aca se rescatan con sus coordenadas)."""

        def way(self, w):
            if w.id in ways_de_relacion:
                coords_ways[w.id] = _coords(w)

    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)
    db = sqlite3.connect(sqlite_path)
    db.execute("PRAGMA journal_mode=OFF")
    db.execute("PRAGMA synchronous=OFF")
    db.execute("CREATE TABLE barrio (muni TEXT, osm_tipo TEXT, osm_id INTEGER, nombre TEXT, "
               "tipo TEXT, lat REAL, lon REAL, poligono TEXT, vertices INTEGER)")

    # Candidatos en memoria: (osm_tipo, osm_id, nombre, tipo, lon, lat, anillo|None).
    # Son decenas de miles, no millones: entran sin sqlite intermedio.
    candidatos: list[tuple] = []
    stats = {"nodos": 0, "areas_way": 0, "areas_rel": 0, "rel_abiertas": 0,
             "rel_sin_ways": 0, "asignados": 0, "sin_municipio": 0}

    fp = (osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
          .with_locations()
          .with_filter(osmium.filter.KeyFilter("place", "landuse"))
          .handler_for_filtered(_Miembros()))
    n = 0
    for obj in fp:
        n += 1
        if n % 200_000 == 0:
            print(f"  ... {n:,} objetos place, {len(candidatos):,} candidatos, "
                  f"{time.time() - t0:.0f}s", flush=True)
        tags = {t.k: t.v for t in obj.tags}
        nombre = tags.get("name")
        place = tags.get("place")
        if obj.is_node():
            if nombre and place in PLACES_NODO:
                loc = obj.location
                if loc.valid():
                    candidatos.append(("node", obj.id, nombre, place, loc.lon, loc.lat, None))
                    stats["nodos"] += 1
            continue
        # way: `place` de area, o `landuse=residential` con nombre (tipo
        # `residential`). Un residential SIN nombre no es un barrio, es suelo:
        # se descarta ANTES de leer sus coordenadas (el filtro `landuse` deja
        # pasar cientos de miles de ways de campo/monte sin nombre).
        tipo_way = place if place in PLACES_AREA else (
            "residential" if tags.get("landuse") in LANDUSE_BARRIO else None)
        en_relacion = obj.id in ways_de_relacion
        if not en_relacion and not (nombre and tipo_way):
            continue
        pts = _coords(obj)
        if en_relacion:
            coords_ways[obj.id] = pts
        if not (nombre and tipo_way) or not pts:
            continue
        if obj.is_closed() and len(pts) >= 4:
            candidatos.append(("way", obj.id, nombre, tipo_way, None, None,
                               [[x, y] for x, y in pts]))
            stats["areas_way"] += 1
            if tipo_way == "residential":
                stats["residential"] = stats.get("residential", 0) + 1
        else:
            lon = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
            lat = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
            candidatos.append(("way", obj.id, nombre, tipo_way, lon, lat, None))
            stats["nodos"] += 1

    # Las relaciones: se encadenan sus ways; si el anillo no cierra, punto.
    for rid, (nombre, tipo, miembros) in relaciones.items():
        members = [{"role": rol, "geometry": [{"lon": x, "lat": y} for x, y in coords_ways[w]]}
                   for w, rol in miembros if coords_ways.get(w)]
        if not members:
            stats["rel_sin_ways"] += 1
            continue
        anillo = _anillo_exterior({"members": members})
        if anillo and len(anillo) >= 4 and anillo[0] == anillo[-1]:
            candidatos.append(("relation", rid, nombre, tipo, None, None, anillo))
            stats["areas_rel"] += 1
        else:
            todos = [p for m in members for p in m["geometry"]]
            lon = (min(p["lon"] for p in todos) + max(p["lon"] for p in todos)) / 2
            lat = (min(p["lat"] for p in todos) + max(p["lat"] for p in todos)) / 2
            candidatos.append(("relation", rid, nombre, tipo, lon, lat, None))
            stats["rel_abiertas"] += 1
    coords_ways.clear()
    print(f"  candidatos {len(candidatos):,}: nodos={stats['nodos']:,} areas_way={stats['areas_way']:,} "
          f"areas_rel={stats['areas_rel']:,} (abiertas {stats['rel_abiertas']}, sin ways "
          f"{stats['rel_sin_ways']}) {time.time() - t0:.0f}s", flush=True)

    # Simplificar y asignar municipio por el punto representativo del area (o
    # el nodo). Un barrio a caballo de dos municipios queda en uno solo.
    filas: list[tuple] = []
    puntos = []
    for osm_tipo, osm_id, nombre, tipo, lon, lat, anillo in candidatos:
        poligono_json = vertices = None
        if anillo is not None:
            pts, poli = _simplificar(anillo)
            if pts:
                rp = poli.representative_point()
                lon, lat = rp.x, rp.y
                poligono_json = json.dumps(pts)
                vertices = len(pts)
            else:
                # Degenerado (todos los puntos en linea): al menos el centro.
                lon = sum(p[0] for p in anillo) / len(anillo)
                lat = sum(p[1] for p in anillo) / len(anillo)
        puntos.append((lon, lat))
        filas.append((osm_tipo, osm_id, nombre, tipo, lat, lon, poligono_json, vertices))
    pts = shapely.points([p[0] for p in puntos], [p[1] for p in puntos])
    pares = tree.query(pts, predicate="within")
    con_muni = set()
    for pi, mi in zip(pares[0].tolist(), pares[1].tolist()):
        f = filas[pi]
        db.execute("INSERT INTO barrio VALUES (?,?,?,?,?,?,?,?,?)", (ids[mi],) + f)
        con_muni.add(pi)
    stats["asignados"] = len(con_muni)
    stats["sin_municipio"] = len(filas) - len(con_muni)
    db.execute("CREATE INDEX ix_barrio_muni ON barrio (muni)")
    db.execute("CREATE TABLE meta (k TEXT, v TEXT)")
    db.execute("INSERT INTO meta VALUES ('pbf', ?), ('municipios', ?), ('stats', ?)",
               (os.path.basename(pbf), str(len(municipios)), json.dumps(stats)))
    db.commit()
    db.close()
    stats["segundos"] = round(time.time() - t0)
    return stats


# ==========================================================================
# Fase 2: sqlite + padron -> catalogo_barrios
# ==========================================================================

# A igual nombre gana el que tiene contorno; entre contornos, el oficial.
PRIORIDAD = {"admin10": 0, "admin9": 1, "suburb": 2, "quarter": 3, "neighbourhood": 4,
             "residential": 4.5,  # el uso del suelo pierde contra un `place` homonimo
             "localidad": 5, "city": 6, "town": 7, "village": 8, "hamlet": 9}

# `landuse=residential` con nombre trae barrios de verdad, pero tambien la
# grilla de manzanas/lotes que algunos municipios cargaron en OSM con el MISMO
# tag (Rawson SJ solo aporta 2.231 filas "B X - Mza N"). Medido sobre el PBF de
# 2026-09: 53,5% de las 10.584 filas `residential` era ruido de este tipo.
# Se compara contra `_norm(nombre)` (minusculas, sin acentos, sin puntuacion).
RUIDO_RESIDENTIAL = (
    # manzana / lote / parcela, sola o como sufijo: "Manzana 38", "Mz.1057a",
    # "B Solidaridad - Mza 416 A", "B Limache - Et 03 - Mza 03".
    r"\b(mz|mza|mzna|manz|manzana|lote|lotes|parcela|parcelas)\b",
    # unidad de vivienda con su codigo: "casa L", "Torre 3", "Sector 15".
    r"\b(casa|casas|torre|torres|tira|tiras|bloque|bloques|sector|etapa)\s*\d+\b",
    r"\b(casa|casas|torre|torres|tira|tiras|bloque|bloques|sector|etapa)\s+[a-z]\b",
    # planes de vivienda contados: "80 viviendas", "Comunidad Indigena 15 Viviendas".
    r"\b\d+\s*viviendas?\b",
    # el nombre entero es un codigo: "1201A", "C5", "S-12", "34", "D".
    r"^[a-z]{0,3}[\s\-]?\d+\s*[a-z]?$",
    r"^[a-z]{1,2}$",
    r"^[\W\d_]+$",
    # generico SOLO (no "Arminda Residencial", que es un barrio real).
    r"^(barrio|barrios|residencial|loteo|country|municipal|zona urbana|zona|sector|crear)\s*\d*$",
)
_RUIDO_RESIDENTIAL_RE = tuple(re.compile(p) for p in RUIDO_RESIDENTIAL)


def _es_ruido_residential(nombre: str) -> bool:
    """True si un `landuse=residential` con este nombre es una manzana/lote/codigo
    y no un barrio. Funcion pura: solo mira el nombre normalizado."""
    clave = _norm(nombre or "")
    if not clave:
        return True
    return any(rx.search(clave) for rx in _RUIDO_RESIDENTIAL_RE)


def _padron(conn_rows: list) -> list[dict]:
    out = []
    for nombre, lat, lng, poligono in conn_rows:
        try:
            anillo = json.loads(poligono) if poligono else None
        except (ValueError, TypeError):
            anillo = None
        out.append({"nombre": nombre, "lat": float(lat) if lat is not None else None,
                    "lon": float(lng) if lng is not None else None, "anillo": anillo})
    return out


def _barrios_de(m: dict, sq: sqlite3.Connection, padron: list[dict], area_muni: float) -> list[dict]:
    """La lista plana y deduplicada de barrios del municipio, lista para insertar."""
    objetivo = _norm(m["nombre"])
    por_nombre: dict[str, dict] = {}

    def _considerar(b: dict) -> None:
        clave = _norm(b["nombre"])
        if not clave or clave == objetivo or geo_ciudad.es_cardinal(b["nombre"]):
            return
        # El `landuse` trae la grilla de manzanas mezclada con los barrios.
        if b["tipo"] == "residential" and _es_ruido_residential(b["nombre"]):
            return
        if b.get("poligono"):
            poli = _poligono(json.loads(b["poligono"]))
            if area_muni and poli.area / area_muni > MAX_FRACCION_MUNICIPIO:
                return
        previo = por_nombre.get(clave)
        if previo is None:
            por_nombre[clave] = b
            return
        # Empate de nombre: contorno le gana a punto; entre iguales, prioridad.
        mejor = sorted([previo, b], key=lambda x: (0 if x.get("poligono") else 1,
                                                    PRIORIDAD.get(x["tipo"], 99)))[0]
        if mejor is b and previo.get("poligono") and not b.get("poligono"):
            mejor = previo
        por_nombre[clave] = mejor

    for osm_tipo, osm_id, nombre, tipo, lat, lon, poligono, vertices in sq.execute(
            "SELECT osm_tipo, osm_id, nombre, tipo, lat, lon, poligono, vertices "
            "FROM barrio WHERE muni = ?", (m["id"],)):
        _considerar({"nombre": nombre.strip()[:120], "tipo": tipo, "lat": lat, "lon": lon,
                     "poligono": poligono, "vertices": vertices, "fuente": FUENTE_PBF,
                     "osm_id": f"{osm_tipo[0]}{osm_id}"})

    # El padron: localidades con contorno. Si OSM ya tiene el nombre pero solo
    # como punto, el contorno del padron se lo presta; si no lo tiene, entra.
    for loc in padron:
        clave = _norm(loc["nombre"])
        if not clave or clave == objetivo or geo_ciudad.es_cardinal(loc["nombre"]):
            continue
        pts = poli = None
        if loc["anillo"]:
            pts, poli = _simplificar(loc["anillo"])
            if pts and area_muni and poli.area / area_muni > MAX_FRACCION_MUNICIPIO:
                pts = None
        previo = por_nombre.get(clave)
        if previo is not None:
            if pts and not previo.get("poligono"):
                previo.update(poligono=json.dumps(pts), vertices=len(pts), fuente=FUENTE_PADRON)
            continue
        if pts:
            rp = poli.representative_point()
            por_nombre[clave] = {"nombre": loc["nombre"].strip()[:120], "tipo": "localidad",
                                 "lat": rp.y, "lon": rp.x, "poligono": json.dumps(pts),
                                 "vertices": len(pts), "fuente": FUENTE_PADRON, "osm_id": None}
        elif loc["lat"] is not None:
            por_nombre[clave] = {"nombre": loc["nombre"].strip()[:120], "tipo": "localidad",
                                 "lat": loc["lat"], "lon": loc["lon"], "poligono": None,
                                 "vertices": None, "fuente": FUENTE_PADRON, "osm_id": None}

    barrios = sorted(por_nombre.values(), key=lambda b: _norm(b["nombre"]))
    # Que se muestra y que queda de respaldo (deja `hoja` / `motivo_hoja` en cada dict).
    marcar_hojas(barrios)
    return barrios


async def _escribir(conn, m: dict, pais: str, barrios: list[dict]) -> None:
    await conn.execute(text("DELETE FROM catalogo_barrios WHERE municipio_catalogo_id = :id"),
                       {"id": m["id"]})
    if not barrios:
        return
    ahora = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    await conn.execute(text("""
        INSERT INTO catalogo_barrios
          (municipio_catalogo_id, pais, nombre, nombre_norm, tipo, lat, lon, poligono,
           vertices, fuente, osm_id, hoja, motivo_hoja, actualizado_en)
        VALUES (:muni, :pais, :nombre, :norm, :tipo, :lat, :lon, :poligono,
                :vertices, :fuente, :osm_id, :hoja, :motivo_hoja, :ahora)
    """), [{"muni": m["id"], "pais": pais, "nombre": b["nombre"], "norm": _norm(b["nombre"])[:120],
            "tipo": b["tipo"], "lat": b["lat"], "lon": b["lon"], "poligono": b.get("poligono"),
            "vertices": b.get("vertices"), "fuente": b["fuente"], "osm_id": b.get("osm_id"),
            "hoja": int(b.get("hoja", True)), "motivo_hoja": b.get("motivo_hoja"),
            "ahora": ahora} for b in barrios])


async def _resumen(conn, pais: str, provincia: str = "") -> str:
    filtro = " AND c.provincia = :prov" if provincia else ""
    params = {"p": pais, **({"prov": provincia} if provincia else {})}
    res = await conn.execute(text(f"""
        SELECT COUNT(DISTINCT c.id), COUNT(DISTINCT b.municipio_catalogo_id),
               COUNT(b.id), SUM(b.poligono IS NOT NULL),
               COUNT(DISTINCT CASE WHEN b.poligono IS NOT NULL THEN b.municipio_catalogo_id END)
        FROM municipios_catalogo c
        LEFT JOIN catalogo_barrios b ON b.municipio_catalogo_id = c.id
        WHERE c.pais = :p AND c.poligono IS NOT NULL{filtro}
    """), params)
    fila = res.fetchone()
    munis, con_barrios, barrios, con_poli, munis_poli = (int(x or 0) for x in fila)
    return (f"{pais}{' / ' + provincia if provincia else ''}: {con_barrios}/{munis} municipios con "
            f"barrios ({munis_poli} con al menos un contorno) | barrios {barrios:,}, con contorno "
            f"{con_poli:,} ({100.0 * con_poli / max(barrios, 1):.0f}%)")


async def main() -> None:
    args = _args()
    cfg = resolver_db(args)
    pais = args.pais.upper()
    if not os.path.exists(args.pbf):
        sys.exit(f"No existe el PBF: {args.pbf}")
    sqlite_path = args.sqlite or os.path.join(os.path.dirname(os.path.abspath(args.pbf)),
                                              f"barrios_{pais}.sqlite")
    engine = create_async_engine(cfg.url)
    inicio = time.time()
    try:
        async with engine.begin() as conn:
            await conn.execute(text(DDL))
            if args.aplicar:
                # La tabla puede venir de antes de la regla "hoja": se le agregan las columnas.
                await asegurar_columnas(conn)
            municipios = await _municipios(conn, pais)
        print(f"Municipios con contorno en el catalogo ({pais}): {len(municipios)}")

        if args.rehacer or not os.path.exists(sqlite_path):
            print(f"Fase 1: pasada por {os.path.basename(args.pbf)} "
                  f"({os.path.getsize(args.pbf) / 1e6:.0f} MB) -> {sqlite_path}", flush=True)
            stats = extraer(args.pbf, sqlite_path, municipios)
            print(f"  asignados a un municipio {stats['asignados']:,}, fuera de todo contorno "
                  f"{stats['sin_municipio']:,} | {stats['segundos']}s", flush=True)
        else:
            print(f"Fase 1: sqlite existente {sqlite_path} (--rehacer para repetirla)")

        pendientes = municipios
        if args.muni:
            pendientes = [m for m in pendientes if m["id"] == args.muni]
        if args.provincia:
            pendientes = [m for m in pendientes if (m["provincia"] or "") == args.provincia]
        if args.limite:
            pendientes = pendientes[: args.limite]
        print(f"Fase 2: {len(pendientes)} municipios a escribir"
              + ("" if args.aplicar else "  (EN SECO: no se escribe nada)"), flush=True)

        sq = sqlite3.connect(sqlite_path)
        tot_b = tot_p = munis_con = 0
        tanda: list[tuple[dict, list[dict]]] = []

        async def _volcar() -> None:
            if not tanda:
                return
            async with engine.begin() as conn:
                for m, barrios in tanda:
                    await _escribir(conn, m, pais, barrios)
            tanda.clear()

        for i, m in enumerate(pendientes, 1):
            # El padron (georef) existe solo para Argentina: ids INDEC numericos.
            # Afuera (py-1704, uy-3443756, ...) no hay padron y la columna es INT.
            padron: list[dict] = []
            if str(m["id"]).isdigit():
                async with engine.connect() as conn:
                    padron = _padron((await conn.execute(text("""
                        SELECT nombre, lat, lng, poligono FROM catalogo_zonas
                        WHERE municipio_catalogo_id = :id"""), {"id": int(m["id"])})).fetchall())
            barrios = _barrios_de(m, sq, padron, _poligono(m["anillo"]).area)
            con_poli = sum(1 for b in barrios if b.get("poligono"))
            tot_b += len(barrios)
            tot_p += con_poli
            munis_con += bool(barrios)
            if args.aplicar:
                tanda.append((m, barrios))
                if len(tanda) >= TANDA:
                    await _volcar()
                    print(f"  [{i}/{len(pendientes)}] {m['provincia']}: escritos hasta {m['nombre']} "
                          f"| acumulado barrios {tot_b:,}, con contorno {tot_p:,} "
                          f"({time.time() - inicio:.0f}s)", flush=True)
            elif i <= 60 or con_poli:
                print(f"[{i}/{len(pendientes)}] {m['nombre']} ({m['provincia']}): {len(barrios)} barrios, "
                      f"{con_poli} con contorno", flush=True)
        await _volcar()
        sq.close()

        print(f"\n{len(pendientes)} municipios: {munis_con} con barrios | barrios {tot_b:,}, "
              f"con contorno {tot_p:,} ({100.0 * tot_p / max(tot_b, 1):.0f}%) en "
              f"{(time.time() - inicio) / 60:.1f} min")
        if args.aplicar:
            async with engine.connect() as conn:
                print(await _resumen(conn, pais, args.provincia))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
