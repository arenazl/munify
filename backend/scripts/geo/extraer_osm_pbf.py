# -*- coding: utf-8 -*-
"""Curacion OFFLINE de la cartografia fina desde el EXTRACTO de OSM (Geofabrik).

Hace lo mismo que `curar_geo_catalogo.py` —llenar `catalogo_geo_osm` con
barrios + calles + direcciones por municipio— pero sin Overpass: lee el
`.osm.pbf` del pais de una sola pasada, asigna cada elemento al municipio del
catalogo cuyo contorno lo contiene y arma el paquete con EXACTAMENTE el mismo
parser que usa el camino Overpass (`geo_ciudad._parsear`), asi lo curado por
una via o por la otra es el mismo universo.

Por que existe: Overpass es un servicio publico compartido. La noche del
2026-09-02, con `overpass-api.de` caido y el resto saturado, dos workers
avanzaban a ~1,6 min por municipio: 55 horas para Argentina. El extracto se
baja una vez (AR: 430 MB) y la pasada entera tarda minutos, sin cupos ni
topes por salida (Overpass cortaba en 4.000 elementos geo + 2.000 direcciones
por ciudad; aca entra todo y recorta `recortar_para_catalogo`).

Que se extrae (mismos filtros que `geo_ciudad._consulta`):
  - places: nodos place in {city,town,village,hamlet,suburb,neighbourhood,quarter}
    con nombre; ways/relaciones place in {suburb,neighbourhood,quarter} con
    nombre; relaciones boundary=administrative admin_level 9|10 con nombre.
  - calles: ways highway in {primary,secondary,tertiary,residential} con nombre.
  - direcciones: nodos con addr:housenumber + addr:street. Y ADEMAS los ways
    (edificios) con esas etiquetas —Overpass solo pedia nodos por costo; en
    buena parte del interior las alturas estan sobre el edificio, no sobre un
    nodo, y son direcciones igual de reales.
Para ways y relaciones el punto es el centro del bounding box, como el
`out center` de Overpass.

Dos fases, con un sqlite intermedio para no tener millones de elementos en
memoria: (1) pasada por el PBF -> `elementos_<PAIS>.sqlite` (municipio,
elemento); (2) por municipio, `_parsear` + `guardar_catalogo_geo` con
`fuente = FUENTE_PBF`. La fase 1 se saltea si el sqlite ya existe (`--rehacer`
para forzarla).

    DATABASE_URL_QA="..." python scripts/geo/extraer_osm_pbf.py --env qa \
        --pais AR --pbf ruta/argentina-latest.osm.pbf --aplicar
    ... --refrescar      # pisar tambien lo que ya esta `ok` (de Overpass o de aca)
    ... --limite 20      # una tanda corta de la fase 2

Sin `--aplicar` hace la fase 1 (si falta) y muestra que escribiria.

Requiere `pyosmium` (`pip install osmium`) y `shapely`; ninguno es dependencia
del backend, son solo de este script.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
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

PLACES_NODO = frozenset(geo_ciudad.PLACES_ZONA + geo_ciudad.PLACES_BARRIO)
PLACES_AREA = frozenset(geo_ciudad.PLACES_BARRIO)
HIGHWAYS = frozenset({"primary", "secondary", "tertiary", "residential"})
ADMIN_BARRIO = frozenset({"9", "10"})
# Solo estas etiquetas viajan al sqlite, y solo las del rol que le toco al
# elemento: `_parsear` decide por la PRIMERA etiqueta que encuentra, y un nodo
# con altura que ademas trae `place=house` tiene que llegarle como direccion.
TAGS_POR_ROL = {
    "place": ("name", "place", "boundary", "admin_level"),
    "calle": ("name", "highway"),
    "dir": ("addr:street", "addr:housenumber"),
}
LOTE_PUNTOS = 50_000


def _args() -> argparse.Namespace:
    p = parser_base("Cura la cartografia OSM del catalogo desde el extracto PBF (offline).")
    p.add_argument("--pais", default="AR", help="ISO-2 del catalogo (default AR)")
    p.add_argument("--pbf", required=True, help="Ruta al <pais>-latest.osm.pbf de Geofabrik")
    p.add_argument("--sqlite", default="", help="Ruta del sqlite intermedio (default junto al pbf)")
    p.add_argument("--rehacer", action="store_true", help="Rehacer la pasada por el PBF aunque el sqlite exista")
    p.add_argument("--refrescar", action="store_true", help="Pisar tambien lo ya curado como ok")
    p.add_argument("--limite", type=int, default=0, help="Cuantos municipios escribir como maximo (0 = todos)")
    return p.parse_args()


# ==========================================================================
# Municipios del catalogo + indice espacial
# ==========================================================================

async def _municipios(conn, pais: str) -> list[dict]:
    filas = (await conn.execute(text("""
        SELECT c.id, c.nombre, c.provincia, c.poligono, g.estado, g.fuente
        FROM municipios_catalogo c
        LEFT JOIN catalogo_geo_osm g ON g.municipio_catalogo_id = c.id
        WHERE c.pais = :p AND c.poligono IS NOT NULL
        ORDER BY c.provincia, c.nombre
    """), {"p": pais})).fetchall()
    out = []
    for f in filas:
        try:
            anillo = json.loads(f[3])
        except (ValueError, TypeError):
            continue
        if not (isinstance(anillo, list) and len(anillo) >= 3):
            continue
        out.append({"id": f[0], "nombre": f[1], "provincia": f[2], "anillo": anillo,
                    "estado_previo": f[4], "fuente_previa": f[5]})
    return out


def _indice(municipios: list[dict]):
    """STRtree de shapely sobre los contornos. Devuelve (tree, poligonos)."""
    import shapely
    from shapely.geometry import Polygon

    polis = []
    for m in municipios:
        try:
            poli = Polygon([(float(c[0]), float(c[1])) for c in m["anillo"]])
            if not poli.is_valid:
                poli = poli.buffer(0)  # auto-intersecciones del simplificado
        except (ValueError, TypeError):
            poli = Polygon()
        polis.append(poli)
    return shapely.STRtree(polis), polis


# ==========================================================================
# Fase 1: pasada por el PBF -> sqlite (municipio, elemento)
# ==========================================================================

def _tags_utiles(tags: dict, rol: str) -> dict:
    return {k: tags[k] for k in TAGS_POR_ROL[rol] if tags.get(k)}


def _rol_nodo(tags: dict) -> str | None:
    if tags.get("place") in PLACES_NODO and tags.get("name"):
        return "place"
    if tags.get("addr:housenumber") and tags.get("addr:street"):
        return "dir"
    return None


def _rol_way(tags: dict) -> str | None:
    if tags.get("highway") in HIGHWAYS and tags.get("name"):
        return "calle"
    if tags.get("place") in PLACES_AREA and tags.get("name"):
        return "place"
    if tags.get("addr:housenumber") and tags.get("addr:street"):
        return "dir"
    return None


def _rol_relacion(tags: dict) -> str | None:
    if tags.get("place") in PLACES_AREA and tags.get("name"):
        return "place"
    if (tags.get("boundary") == "administrative"
            and tags.get("admin_level") in ADMIN_BARRIO and tags.get("name")):
        return "place"
    return None


def _bbox_way(way):
    lons = []
    lats = []
    for n in way.nodes:
        loc = n.location
        if not loc.valid():
            continue  # nodo fuera del extracto
        lons.append(loc.lon)
        lats.append(loc.lat)
    if not lons:
        return None
    return min(lons), min(lats), max(lons), max(lats)


def _relaciones(pbf: str) -> dict:
    """Pasada barata (solo relaciones): los barrios mapeados como relacion
    —limite administrativo 9/10 o place=* multipoligono— y los ways que los
    forman. Sus centros se calculan en la pasada principal, cuando pasan los
    ways con sus coordenadas; ensamblar areas de verdad (`with_areas`)
    obligaria a armar tambien cada edificio cerrado del pais."""
    import osmium

    quiero: dict[int, tuple[dict, list[int]]] = {}
    fp = (osmium.FileProcessor(pbf, osmium.osm.RELATION)
          .with_filter(osmium.filter.KeyFilter("place", "boundary")))
    for r in fp:
        tags = {t.k: t.v for t in r.tags}
        if not _rol_relacion(tags):
            continue
        miembros = [m.ref for m in r.members if m.type == "w"]
        if miembros:
            quiero[r.id] = (_tags_utiles(tags, "place"), miembros)
    return quiero


def extraer(pbf: str, sqlite_path: str, municipios: list[dict]) -> dict:
    import osmium
    import shapely

    tree, _ = _indice(municipios)
    ids = [m["id"] for m in municipios]

    t0 = time.time()
    relaciones = _relaciones(pbf)
    ways_de_relacion: set[int] = set()
    for _, miembros in relaciones.values():
        ways_de_relacion.update(miembros)
    bbox_ways: dict[int, tuple] = {}
    print(f"  relaciones-barrio: {len(relaciones):,} ({len(ways_de_relacion):,} ways miembro) "
          f"{time.time() - t0:.0f}s", flush=True)

    class _Miembros(osmium.SimpleHandler):
        """Recibe lo que el filtro de etiquetas descarto: ahi estan los ways
        sin tags que dibujan las relaciones-barrio."""

        def way(self, w):
            if w.id in ways_de_relacion:
                b = _bbox_way(w)
                if b:
                    bbox_ways[w.id] = b

    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)
    db = sqlite3.connect(sqlite_path)
    db.execute("PRAGMA journal_mode=OFF")
    db.execute("PRAGMA synchronous=OFF")
    db.execute("CREATE TABLE el (muni TEXT, tipo TEXT, rol TEXT, lat REAL, lon REAL, tags TEXT)")

    lote_lon: list[float] = []
    lote_lat: list[float] = []
    lote_pay: list[tuple] = []
    stats = {"vistos": 0, "asignados": 0, "sin_municipio": 0,
             "place": 0, "calle": 0, "dir": 0}

    def volcar() -> None:
        if not lote_pay:
            return
        pts = shapely.points(lote_lon, lote_lat)
        pares = tree.query(pts, predicate="within")  # [[idx_punto...], [idx_poli...]]
        filas = []
        con_muni = set()
        for pi, mi in zip(pares[0].tolist(), pares[1].tolist()):
            tipo, rol, tags = lote_pay[pi]
            filas.append((ids[mi], tipo, rol, lote_lat[pi], lote_lon[pi], tags))
            con_muni.add(pi)
        db.executemany("INSERT INTO el VALUES (?,?,?,?,?,?)", filas)
        stats["asignados"] += len(filas)
        stats["sin_municipio"] += len(lote_pay) - len(con_muni)
        lote_lon.clear()
        lote_lat.clear()
        lote_pay.clear()

    def sumar(tipo: str, rol: str, lon: float, lat: float, tags: dict) -> None:
        stats["vistos"] += 1
        stats[rol] += 1
        lote_lon.append(lon)
        lote_lat.append(lat)
        lote_pay.append((tipo, rol, json.dumps(tags, ensure_ascii=False)))
        if len(lote_pay) >= LOTE_PUNTOS:
            volcar()

    fp = (osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
          .with_locations()
          .with_filter(osmium.filter.KeyFilter("place", "highway", "addr:housenumber"))
          .handler_for_filtered(_Miembros()))
    n = 0
    for obj in fp:
        n += 1
        if n % 500_000 == 0:
            print(f"  ... {n:,} objetos con etiquetas de interes, {stats['asignados']:,} "
                  f"asignados, {time.time() - t0:.0f}s", flush=True)
        tags = {t.k: t.v for t in obj.tags}
        if obj.is_node():
            rol = _rol_nodo(tags)
            if not rol:
                continue
            loc = obj.location
            if loc.valid():
                sumar("node", rol, loc.lon, loc.lat, _tags_utiles(tags, rol))
            continue
        # way
        b = _bbox_way(obj)
        if not b:
            continue
        if obj.id in ways_de_relacion:
            bbox_ways[obj.id] = b
        rol = _rol_way(tags)
        if rol:
            sumar("way", rol, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, _tags_utiles(tags, rol))

    # Las relaciones-barrio: centro del bbox de sus ways, como el `out center`.
    sin_geometria = 0
    for tags, miembros in relaciones.values():
        cajas = [bbox_ways[w] for w in miembros if w in bbox_ways]
        if not cajas:
            sin_geometria += 1
            continue
        lon = (min(c[0] for c in cajas) + max(c[2] for c in cajas)) / 2
        lat = (min(c[1] for c in cajas) + max(c[3] for c in cajas)) / 2
        sumar("relation", "place", lon, lat, tags)
    if sin_geometria:
        print(f"  relaciones sin ningun way en el extracto: {sin_geometria}")
    volcar()
    db.execute("CREATE INDEX ix_el_muni ON el (muni)")
    db.execute("CREATE TABLE meta (k TEXT, v TEXT)")
    db.execute("INSERT INTO meta VALUES ('pbf', ?), ('municipios', ?), ('stats', ?)",
               (os.path.basename(pbf), str(len(municipios)), json.dumps(stats)))
    db.commit()
    db.close()
    stats["segundos"] = round(time.time() - t0)
    return stats


# ==========================================================================
# Fase 2: sqlite -> _parsear -> catalogo_geo_osm
# ==========================================================================

def _cruda(db: sqlite3.Connection, muni_id: str) -> dict:
    """Los elementos del municipio con la forma de una respuesta de Overpass,
    que es lo que `_parsear` sabe leer."""
    elementos = []
    for tipo, lat, lon, tags in db.execute(
            "SELECT tipo, lat, lon, tags FROM el WHERE muni = ?", (muni_id,)):
        el = {"type": tipo, "tags": json.loads(tags)}
        if tipo == "node":
            el["lat"], el["lon"] = lat, lon
        else:
            el["center"] = {"lat": lat, "lon": lon}
        elementos.append(el)
    return {"elements": elementos}


async def _resumen(conn, pais: str) -> str:
    total = (await conn.execute(text(
        "SELECT COUNT(*) FROM municipios_catalogo WHERE pais=:p AND poligono IS NOT NULL"),
        {"p": pais})).scalar()
    filas = (await conn.execute(text("""
        SELECT estado, COUNT(*), SUM(barrios > 0), SUM(calles > 0), SUM(fuente = :f)
        FROM catalogo_geo_osm WHERE pais = :p GROUP BY estado"""),
        {"p": pais, "f": geo_ciudad.FUENTE_PBF})).fetchall()
    curados = sum(int(f[1]) for f in filas if f[0] in ("ok", "sin_datos_osm"))
    partes = [f"{f[0]}={int(f[1])} (con_barrios={int(f[2] or 0)}, con_calles={int(f[3] or 0)}, "
              f"pbf={int(f[4] or 0)})" for f in filas]
    return (f"{pais}: {curados}/{total} curados ({100.0 * curados / max(total, 1):.1f}%) | "
            + "; ".join(partes))


async def main() -> None:
    args = _args()
    cfg = resolver_db(args)
    pais = args.pais.upper()
    if not os.path.exists(args.pbf):
        sys.exit(f"No existe el PBF: {args.pbf}")
    sqlite_path = args.sqlite or os.path.join(os.path.dirname(os.path.abspath(args.pbf)),
                                              f"elementos_{pais}.sqlite")
    engine = create_async_engine(cfg.url)
    inicio = time.time()
    try:
        async with engine.connect() as conn:
            municipios = await _municipios(conn, pais)
            print(await _resumen(conn, pais))
        print(f"Municipios con contorno en el catalogo ({pais}): {len(municipios)}")

        if args.rehacer or not os.path.exists(sqlite_path):
            print(f"Fase 1: pasada por {os.path.basename(args.pbf)} "
                  f"({os.path.getsize(args.pbf) / 1e6:.0f} MB) -> {sqlite_path}", flush=True)
            stats = extraer(args.pbf, sqlite_path, municipios)
            print(f"  elementos utiles {stats['vistos']:,}: places={stats['place']:,} "
                  f"calles={stats['calle']:,} direcciones={stats['dir']:,} | "
                  f"asignados a un municipio {stats['asignados']:,}, fuera de todo contorno "
                  f"{stats['sin_municipio']:,} | {stats['segundos']}s", flush=True)
        else:
            print(f"Fase 1: sqlite existente {sqlite_path} (--rehacer para repetirla)")

        pendientes = [m for m in municipios
                      if args.refrescar or m["estado_previo"] != "ok"
                      or m["fuente_previa"] != geo_ciudad.FUENTE_PBF]
        if args.limite:
            pendientes = pendientes[: args.limite]
        print(f"Fase 2: {len(pendientes)} municipios a escribir"
              + ("" if args.aplicar else "  (EN SECO: no se escribe nada)"), flush=True)

        sq = sqlite3.connect(sqlite_path)
        ok = vacios = 0
        for i, m in enumerate(pendientes, 1):
            t0 = time.time()
            datos = geo_ciudad._parsear(_cruda(sq, m["id"]), m["anillo"])  # noqa: SLF001
            estado = geo_ciudad.estado_de(datos)
            nb = sum(1 for p in datos["places"] if p["tipo"] in geo_ciudad.PLACES_BARRIO)
            if args.aplicar:
                async with engine.begin() as conn:
                    await geo_ciudad.guardar_catalogo_geo(
                        conn, {"id": m["id"], "nombre": m["nombre"], "provincia": m["provincia"]},
                        pais, datos, estado=estado, fuente=geo_ciudad.FUENTE_PBF)
            ok += estado == "ok"
            vacios += estado == "sin_datos_osm"
            if args.aplicar or i <= 40:
                print(f"[{i}/{len(pendientes)}] {m['nombre']} ({m['provincia']}) -> {estado} "
                      f"barrios={nb} calles={len(datos['calles'])} dir={len(datos['direcciones'])} "
                      f"{time.time() - t0:.1f}s", flush=True)
        sq.close()

        print(f"\nEscritos {ok + vacios}: ok={ok} sin_datos={vacios} "
              f"en {(time.time() - inicio) / 60:.1f} min")
        if args.aplicar:
            async with engine.connect() as conn:
                print(await _resumen(conn, pais))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
