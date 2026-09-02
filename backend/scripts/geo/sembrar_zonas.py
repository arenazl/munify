"""Copia las localidades del catalogo a las zonas de un municipio.

El catalogo (`municipios_catalogo` + `catalogo_zonas`) es el padron: sabe que
Moron tiene cinco localidades y como es el contorno de cada una. Las `zonas` son
lo que el municipio usa y edita, y es lo que el mapa dibuja
(api/zonas.py::regiones_mapa). Este script es el puente entre los dos, el mismo
que deberia correr el alta de un municipio.

Se copia, no se referencia: a partir de la siembra el municipio es duenio de sus
zonas y puede renombrarlas o redibujarlas sin que se le mueva el catalogo. Las
zonas que ya existan con ese nombre no se duplican --- si les falta el contorno,
se les completa.

    python scripts/geo/sembrar_zonas.py --municipio 1000155 [--catalogo 060568]
                                        [--dry-run] [--db NOMBRE]
"""
import argparse
import asyncio
import json
import sys
import unicodedata

sys.path.insert(0, __file__.rsplit("scripts", 1)[0])
from sqlalchemy import text                                    # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine         # noqa: E402
from core.config import settings                               # noqa: E402


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def anillos(g):
    if g is None:
        return []
    if isinstance(g, list):
        return [g]
    if g.get("type") == "Polygon":
        return [g["coordinates"][0]]
    if g.get("type") == "MultiPolygon":
        return [p[0] for p in g["coordinates"]]
    return []


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def dentro(pt, ring):
    x, y = pt
    c = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][:2]
        x2, y2 = ring[(i + 1) % n][:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", type=int, required=True, help="id del municipio (tenant)")
    ap.add_argument("--catalogo", help="codigo INDEC; si falta se deduce por ubicacion")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--db")
    args = ap.parse_args()

    url = settings.DATABASE_URL
    if args.db:
        url = url.rsplit("/", 1)[0] + "/" + args.db
    engine = create_async_engine(url, pool_pre_ping=True)

    async with engine.connect() as c:
        m = (await c.execute(text(
            "SELECT id, nombre, latitud, longitud FROM municipios WHERE id=:i"),
            {"i": args.municipio})).mappings().first()
        if not m:
            print(f"no existe el municipio {args.municipio}")
            return 1

        cod = args.catalogo
        if not cod:
            # sin codigo a mano, el municipio del catalogo es el que contiene su
            # ubicacion. Se avisa cual salio: si la ficha tiene mal las
            # coordenadas (La Matanza las tenia en Chaco) hay que verlo antes de
            # sembrarle las zonas de otro lado.
            if m["latitud"] is None:
                print("el municipio no tiene coordenadas y no se paso --catalogo")
                return 1
            pt = (float(m["longitud"]), float(m["latitud"]))
            for mc in (await c.execute(text(
                "SELECT id, nombre, poligono FROM municipios_catalogo "
                "WHERE poligono IS NOT NULL"))).mappings():
                for r in anillos(json.loads(mc["poligono"])):
                    if dentro(pt, r):
                        cod = mc["id"]
                        print(f"catalogo deducido por ubicacion: {mc['nombre']} ({cod})")
                        break
                if cod:
                    break
        if not cod:
            print("no se pudo ubicar el municipio en el catalogo; pasar --catalogo")
            return 1

        fila_cat = (await c.execute(text(
            "SELECT nombre, poligono FROM municipios_catalogo WHERE id=:i"),
            {"i": cod})).mappings().first()
        cat = fila_cat["nombre"] if fila_cat else None
        mpoly = fila_cat["poligono"] if fila_cat else None
        locs = (await c.execute(text(
            "SELECT nombre, lat, lng, poligono, osm_id FROM catalogo_zonas "
            "WHERE municipio_catalogo_id=:i ORDER BY nombre"),
            {"i": cod})).mappings().all()
        actuales = (await c.execute(text(
            "SELECT id, nombre, poligono FROM zonas WHERE municipio_id=:m"),
            {"m": args.municipio})).mappings().all()

    print(f"municipio {m['nombre']} (id {m['id']}) <- catalogo {cat} ({cod})")
    print(f"  localidades en el catalogo: {len(locs)} "
          f"({sum(1 for x in locs if x['poligono'])} con contorno)")
    print(f"  zonas actuales del municipio: {len(actuales)}")

    # Un contorno mas grande que el municipio no es una localidad: es un
    # aglomerado. La capa del IGN los trae como si fueran uno mas --- "Gran
    # Buenos Aires" son 89 x 90 km colgando de La Matanza --- y sembrado tapa
    # el mapa entero con una sola mancha.
    caja_muni = None
    if mpoly:
        rs = anillos(json.loads(mpoly))
        if rs:
            caja_muni = bbox(max(rs, key=len))

    def desmedida(loc):
        if not (loc["poligono"] and caja_muni):
            return False
        rs = anillos(json.loads(loc["poligono"]))
        if not rs:
            return False
        x0, y0, x1, y1 = bbox(max(rs, key=len))
        mx0, my0, mx1, my1 = caja_muni
        area_muni = (mx1 - mx0) * (my1 - my0)
        return area_muni > 0 and ((x1 - x0) * (y1 - y0)) / area_muni > 1.2

    por_nombre = {norm(z["nombre"]): z for z in actuales}
    nuevas, completar, descartadas = [], [], []
    for loc in locs:
        if desmedida(loc):
            descartadas.append(loc["nombre"])
            continue
        z = por_nombre.get(norm(loc["nombre"]))
        if z is None:
            nuevas.append(loc)
        elif not z["poligono"] and loc["poligono"]:
            completar.append((z["id"], loc))
    if descartadas:
        print(f"  descartadas por ser mas grandes que el municipio: "
              f"{', '.join(descartadas)}")

    print(f"  a crear: {len(nuevas)} | a completar el contorno: {len(completar)}")
    for loc in nuevas:
        print(f"    + {loc['nombre'][:30]:30s} {'con contorno' if loc['poligono'] else 'sin contorno'}")
    for _, loc in completar:
        print(f"    ~ {loc['nombre'][:30]:30s} se le carga el contorno")

    if args.dry_run or not (nuevas or completar):
        await engine.dispose()
        return 0

    async with engine.begin() as c:
        for loc in nuevas:
            await c.execute(text("""
                INSERT INTO zonas (municipio_id, nombre, poligono, osm_id,
                                   latitud_centro, longitud_centro, activo, created_at)
                VALUES (:m, :n, :g, :o, :la, :ln, 1, NOW())"""),
                {"m": args.municipio, "n": loc["nombre"][:100],
                 "g": loc["poligono"], "o": (loc["osm_id"] or "")[:40] or None,
                 "la": loc["lat"], "ln": loc["lng"]})
        for zid, loc in completar:
            await c.execute(text("""
                UPDATE zonas SET poligono=:g, osm_id=:o,
                       latitud_centro=COALESCE(latitud_centro, :la),
                       longitud_centro=COALESCE(longitud_centro, :ln),
                       updated_at=NOW()
                 WHERE id=:id"""),
                {"g": loc["poligono"], "o": (loc["osm_id"] or "")[:40] or None,
                 "la": loc["lat"], "ln": loc["lng"], "id": zid})
    print(f"  sembradas {len(nuevas)} zonas nuevas, completadas {len(completar)}")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
