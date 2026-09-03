# -*- coding: utf-8 -*-
"""Contornos de municipio desde los limites administrativos de OSM (extracto PBF).

Segunda fuente de contornos para `municipios_catalogo.poligono`, offline, para
dos huecos que la primera (IGN para AR, `contornos_municipios.py`) deja:

  1. Municipios SIN contorno: en el catalogo LATAM quedaron 316 (PE 232, BO 56,
     PY 19, CL 9) y sin contorno no hay curacion posible — el extractor PBF
     asigna cada elemento al municipio cuyo poligono lo contiene.
  2. Contornos que NO contienen a su propia ciudad. Medido en AR el 2026-09-02:
     el poligono de Centenario (Neuquen) cae 19 km al noroeste del casco, el
     de Inriville (Cordoba) 5 km al este; la curacion daba `sin_datos_osm` con
     la ciudad entera mapeada en OSM. En total 121 municipios cuya cabecera
     homonima de OSM (place=city/town/village/hamlet) queda fuera del contorno.

Como decide: arma las areas `boundary=administrative` (admin_level 6/7/8, los
niveles donde vive el municipio en AR/BO/CL/PE/PY/UY) del `.osm.pbf`, y para
cada municipio candidato busca el area con el MISMO nombre normalizado (sin
"Municipio de", "Partido de", "Comuna de", "Distrito de"...) que CONTENGA su
punto de referencia: la cabecera homonima de OSM mas cercana al centro del
catalogo (hasta `--radio-cabecera` km) o, si no la hay, el centro del catalogo.
Si hay varias, la mas chica (el nivel mas fino). Sin nombre igual no hay
match: un municipio no se emparenta "por cercania".

Que escribe (solo con `--aplicar`): `poligono` = anillo exterior del area que
contiene la referencia (muestreado a `--puntos` vertices, mismo criterio que
`contornos_municipios.py`, orden [lon, lat]) y `osm_id` = `relation/<id>` o
`way/<id>` para saber de donde salio. El contorno oficial (IGN) NO se toca
cuando contiene a su ciudad: esto solo rellena o corrige.

Despues de aplicar hay que re-curar esos municipios con el extractor:

    python scripts/geo/extraer_osm_pbf.py --env qa --pais AR --pbf ... \
        --aplicar --rehacer --refrescar --ids <los ids que imprime este script>

Uso:
    DATABASE_URL_QA="..." python scripts/geo/contornos_osm_pbf.py --env qa \
        --pais PE --pbf ruta/peru-latest.osm.pbf            # en seco
    ... --aplicar                                             # escribe
    ... --solo sin_poligono | ciudad_afuera                   # un hueco solo

Requiere `pyosmium` y `shapely` (solo del script, no del backend).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
import unicodedata
from math import asin, cos, radians, sin, sqrt

AQUI = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.join(BACKEND, "scripts"))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import parser_base, resolver_db  # noqa: E402

NIVELES_MUNICIPIO = ("6", "7", "8")
CABECERA = frozenset({"city", "town", "village", "hamlet"})
# Prefijos que OSM le pone al nombre del limite y el catalogo no.
PREFIJOS = re.compile(
    r"^(municipio|municipalidad|partido|comuna|distrito|departamento|canton|"
    r"comision municipal|comision de fomento|junta de gobierno|junta vecinal|"
    r"comuna rural|municipio de la ciudad|ciudad)\s+(de\s+|del\s+|de la\s+|de los\s+|de las\s+)?", re.I)


def _args() -> argparse.Namespace:
    p = parser_base("Rellena/corrige contornos del catalogo con los limites administrativos de OSM.")
    p.add_argument("--pais", required=True, help="ISO-2 del catalogo")
    p.add_argument("--pbf", required=True, help="Ruta al <pais>-latest.osm.pbf de Geofabrik")
    p.add_argument("--solo", choices=("sin_poligono", "ciudad_afuera"), default=None,
                   help="Atender un solo hueco (default: los dos)")
    p.add_argument("--radio-cabecera", type=float, default=30.0,
                   help="Km maximos entre el centro del catalogo y su cabecera homonima en OSM")
    p.add_argument("--puntos", type=int, default=300, help="Vertices por contorno")
    p.add_argument("--niveles", default=",".join(NIVELES_MUNICIPIO),
                   help="admin_level que cuentan como municipio (default 6,7,8)")
    return p.parse_args()


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("-", " ").replace("'", "").replace(".", " ")
    s = PREFIJOS.sub("", s.strip())
    return " ".join(s.split())


def km(a: tuple, b: tuple) -> float:
    la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def simplificar(pts: list, maximo: int) -> list:
    """Uno de cada N, como `contornos_municipios.py`: conserva la forma para
    dibujar y para punto-en-poligono sin sumar dependencias."""
    if len(pts) <= maximo:
        return pts
    paso = len(pts) / maximo
    out = [pts[int(i * paso)] for i in range(maximo)]
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


# ==========================================================================
# Catalogo
# ==========================================================================

async def _catalogo(conn, pais: str) -> list[dict]:
    filas = (await conn.execute(text("""
        SELECT c.id, c.nombre, c.provincia, c.lat, c.lng, c.poligono, c.alias, g.estado, g.barrios, g.calles
        FROM municipios_catalogo c
        LEFT JOIN catalogo_geo_osm g ON g.municipio_catalogo_id = c.id
        WHERE c.pais = :p ORDER BY c.provincia, c.nombre"""), {"p": pais})).fetchall()
    out = []
    for f in filas:
        anillo = None
        if f[5]:
            try:
                anillo = json.loads(f[5])
            except (ValueError, TypeError):
                anillo = None
        out.append({"id": f[0], "nombre": f[1], "provincia": f[2],
                    "centro": (float(f[3]), float(f[4])) if f[3] is not None else None,
                    "anillo": anillo, "alias": f[6] or "",
                    "geo": (f[7], f[8] or 0, f[9] or 0)})
    return out


# ==========================================================================
# PBF: cabeceras (nodos place) y areas administrativas
# ==========================================================================

def _cabeceras(pbf: str) -> dict[str, list[tuple]]:
    """Nodos place=city/town/village/hamlet con nombre, por nombre normalizado."""
    import osmium

    por_nombre: dict[str, list[tuple]] = {}
    fp = (osmium.FileProcessor(pbf, osmium.osm.NODE)
          .with_filter(osmium.filter.KeyFilter("place")))
    for n in fp:
        tags = {t.k: t.v for t in n.tags}
        if tags.get("place") in CABECERA and tags.get("name") and n.location.valid():
            por_nombre.setdefault(norm(tags["name"]), []).append(
                (tags["place"], n.location.lat, n.location.lon))
    return por_nombre


def _areas_admin(pbf: str, niveles: frozenset[str]) -> list[dict]:
    """Areas boundary=administrative con nombre en los niveles pedidos, con su
    geometria (multipoligono de anillos exteriores; los huecos no importan
    para decidir contencion de una ciudad)."""
    import osmium
    from shapely.geometry import MultiPolygon, Polygon

    areas = []
    fp = (osmium.FileProcessor(pbf)
          .with_locations()
          .with_areas(osmium.filter.KeyFilter("boundary"))
          .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)))
    for a in fp:
        tags = {t.k: t.v for t in a.tags}
        if tags.get("boundary") != "administrative" or tags.get("admin_level") not in niveles:
            continue
        if not tags.get("name"):
            continue
        anillos = []
        for ring in a.outer_rings():
            pts = [(nr.lon, nr.lat) for nr in ring]
            if len(pts) >= 4:
                anillos.append(pts)
        if not anillos:
            continue
        try:
            geom = MultiPolygon([Polygon(r) for r in anillos])
            if not geom.is_valid:
                geom = geom.buffer(0)
        except (ValueError, TypeError):
            continue
        areas.append({"osm": f"{'way' if a.from_way() else 'relation'}/{a.orig_id()}",
                      "nombre": tags["name"], "nivel": tags["admin_level"],
                      "norm": norm(tags["name"]), "anillos": anillos, "geom": geom,
                      "area": geom.area})
    return areas


# ==========================================================================
# Emparejar
# ==========================================================================

def _referencia(m: dict, cabeceras: dict, radio: float) -> tuple[tuple, str]:
    """(lat, lon) de la cabecera homonima mas cercana al centro del catalogo,
    o el centro mismo. Devuelve tambien de donde salio."""
    centro = m["centro"]
    cands = cabeceras.get(norm(m["nombre"])) or []
    if centro and cands:
        place, lat, lon = min(cands, key=lambda c: km(centro, (c[1], c[2])))
        if km(centro, (lat, lon)) <= radio:
            return (lat, lon), f"cabecera:{place}"
    return centro, "centro_catalogo"


def _contiene(anillo: list | None, punto: tuple) -> bool:
    from shapely.geometry import Point, Polygon
    if not anillo or len(anillo) < 3:
        return False
    try:
        poli = Polygon([(float(c[0]), float(c[1])) for c in anillo])
        if not poli.is_valid:
            poli = poli.buffer(0)
        return poli.contains(Point(punto[1], punto[0]))
    except (ValueError, TypeError):
        return False


def _anillo_que_contiene(area: dict, punto: tuple) -> list:
    from shapely.geometry import Point, Polygon
    p = Point(punto[1], punto[0])
    for r in area["anillos"]:
        if Polygon(r).contains(p):
            return r
    return max(area["anillos"], key=len)


def emparejar(municipios: list[dict], areas: list[dict], cabeceras: dict,
              radio: float, solo: str | None) -> dict:
    from shapely import STRtree
    from shapely.geometry import Point

    tree = STRtree([a["geom"] for a in areas])
    nombres_catalogo = {}
    res = {"sin_poligono": [], "ciudad_afuera": [], "ok": 0, "sin_match": [], "ambiguo": []}
    for m in municipios:
        if m["centro"] is None:
            continue
        ref, origen = _referencia(m, cabeceras, radio)
        if m["anillo"]:
            if origen == "centro_catalogo":
                res["ok"] += 1  # sin cabecera homonima no se puede juzgar el contorno
                continue
            if _contiene(m["anillo"], ref):
                res["ok"] += 1
                continue
            hueco = "ciudad_afuera"
        else:
            hueco = "sin_poligono"
        if solo and hueco != solo:
            continue
        objetivo = {norm(m["nombre"])}
        objetivo.update(norm(a) for a in m["alias"].split("|") if a.strip())
        idx = tree.query(Point(ref[1], ref[0]), predicate="contains").tolist()
        con_nombre = [areas[i] for i in idx if areas[i]["norm"] in objetivo]
        if not con_nombre:
            contienen = sorted((areas[i] for i in idx), key=lambda a: a["area"])
            res["sin_match"].append((hueco, m, origen, [f"{a['nombre']} (L{a['nivel']})" for a in contienen[:3]]))
            continue
        elegida = min(con_nombre, key=lambda a: a["area"])
        nombres_catalogo.setdefault(elegida["osm"], []).append(m["id"])
        res[hueco].append((m, origen, elegida, ref))
    # Un mismo limite OSM para dos municipios del catalogo es sospechoso
    for osm, ids in nombres_catalogo.items():
        if len(ids) > 1:
            res["ambiguo"].append((osm, ids))
    return res


# ==========================================================================
# Main
# ==========================================================================

async def main() -> None:
    a = _args()
    cfg = resolver_db(a)
    niveles = frozenset(x.strip() for x in a.niveles.split(",") if x.strip())
    engine = create_async_engine(cfg.url)
    async with engine.connect() as conn:
        municipios = await _catalogo(conn, a.pais)
    print(f"{a.pais}: {len(municipios)} municipios en el catalogo, "
          f"{sum(1 for m in municipios if m['anillo'])} con contorno", flush=True)

    t0 = time.time()
    cabeceras = _cabeceras(a.pbf)
    print(f"  cabeceras (place nodes) en el extracto: {sum(len(v) for v in cabeceras.values()):,} "
          f"{time.time() - t0:.0f}s", flush=True)
    areas = _areas_admin(a.pbf, niveles)
    por_nivel = {}
    for ar in areas:
        por_nivel[ar["nivel"]] = por_nivel.get(ar["nivel"], 0) + 1
    print(f"  areas administrativas con nombre: {len(areas):,} {por_nivel} {time.time() - t0:.0f}s", flush=True)

    res = emparejar(municipios, areas, cabeceras, a.radio_cabecera, a.solo)
    print(f"\n  contorno actual contiene a su ciudad (o no se puede juzgar): {res['ok']}")
    for hueco in ("sin_poligono", "ciudad_afuera"):
        filas = res[hueco]
        print(f"\n== {hueco}: {len(filas)} con match en OSM")
        for m, origen, ar, ref in filas:
            print(f"   {m['id']:>14} {m['nombre'][:34]:34} ({(m['provincia'] or '')[:14]:14}) "
                  f"<- {ar['osm']:>18} '{ar['nombre'][:30]}' L{ar['nivel']} ref={origen} "
                  f"antes={m['geo'][0] or '-'}/{m['geo'][1]}b/{m['geo'][2]}c")
    print(f"\n== sin match por nombre: {len(res['sin_match'])}")
    for hueco, m, origen, contienen in res["sin_match"][:200]:
        print(f"   [{hueco}] {m['id']:>14} {m['nombre'][:34]:34} ({(m['provincia'] or '')[:14]:14}) "
              f"ref={origen} lo contienen: {contienen}")
    if res["ambiguo"]:
        print(f"\n== OJO, un mismo limite OSM para varios municipios (no se escriben): {res['ambiguo']}")

    repetidos = {osm for osm, _ in res["ambiguo"]}
    cambios = [(m, ar, ref) for h in ("sin_poligono", "ciudad_afuera") for m, _o, ar, ref in res[h]
               if ar["osm"] not in repetidos]
    ids = [m["id"] for m, _, _ in cambios]
    print(f"\n== a escribir: {len(cambios)} contornos")
    if not a.aplicar:
        print("  (en seco: nada escrito; --aplicar para grabar)")
    elif cambios:
        params = []
        for m, ar, ref in cambios:
            anillo = simplificar(_anillo_que_contiene(ar, ref), a.puntos)
            params.append({"id": m["id"], "poly": json.dumps([[round(x, 6), round(y, 6)] for x, y in anillo]),
                           "osm": ar["osm"]})
        async with engine.begin() as conn:
            for i in range(0, len(params), 200):
                await conn.execute(text(
                    "UPDATE municipios_catalogo SET poligono = :poly, osm_id = :osm WHERE id = :id"),
                    params[i:i + 200])
        print(f"  escritos {len(params)} en {cfg.base}")
    if ids:
        print("\n  para re-curar con el extractor:\n  --ids " + ",".join(ids))
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
