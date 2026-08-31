"""Le pone contorno a las zonas de cada municipio.

El mapa dibuja `zonas.poligono` (ver api/zonas.py::regiones_mapa). Este script lo
completa desde dos fuentes, en ese orden:

  1. `geo_administrative_unit` --- lo que ya bajamos del IGN. Gratis, sin red.
  2. Nominatim (OSM) --- para lo que el IGN no tiene. Su capa de localidades es
     de PLANTA URBANA (mancha edificada), asi que todo el conurbano viene como
     un unico poligono "Gran Buenos Aires": Haedo o El Palomar no existen ahi.
     OSM si los tiene, como limite administrativo.

Un candidato se acepta SOLO si su centro cae dentro del contorno del municipio.
El match por nombre a secas es una trampa: el IGN tiene un "Castelar" en Entre
Rios y una "Villa Sarmiento" en San Luis, y pegarlos por nombre dibujaria otra
provincia encima del partido de Moron. Lo que no valida se informa y se deja
NULL --- no se le inventa un contorno a nadie.

    python scripts/geo/vincular_zonas.py [--municipio ID] [--dry-run] [--db NOMBRE]
"""
import argparse
import asyncio
import json
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

sys.path.insert(0, __file__.rsplit("scripts", 1)[0])
from sqlalchemy import text                                    # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine         # noqa: E402
from core.config import settings                               # noqa: E402

UA = "munify-geo/1.0 (arenazl@gmail.com)"
PAUSA = 1.2          # politica de uso de Nominatim: 1 request por segundo

# Que se acepta de OSM. Caer dentro del partido NO alcanza: buscando la zona
# "Sur" de Chivilcoy, Nominatim contesta "Parque Cielos del Sur" --- un parque,
# dentro del partido, con su poligono. Sin este filtro el mapa dibujaria una
# plaza como si fuera un tercio del municipio.
CLASES = {
    "boundary": {"administrative"},
    "place": {"city", "town", "village", "hamlet", "suburb", "neighbourhood",
              "quarter", "borough", "municipality", "locality"},
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def anillos(geom):
    """Los anillos exteriores de un Polygon/MultiPolygon, en [lon, lat]."""
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


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


def centro(ring):
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "polygon_geojson": 1, "limit": 5})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", type=int, help="solo este municipio")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--db", help="nombre de base alternativo (ej: sugerenciasmun-ensayo)")
    args = ap.parse_args()

    url = settings.DATABASE_URL
    if args.db:
        url = url.rsplit("/", 1)[0] + "/" + args.db
    engine = create_async_engine(url)

    async with engine.connect() as c:
        q = """SELECT z.id, z.nombre, z.municipio_id, m.nombre muni, m.latitud, m.longitud,
                      m.radio_km, m.pais
               FROM zonas z JOIN municipios m ON m.id = z.municipio_id
               WHERE z.activo = 1 AND z.poligono IS NULL"""
        p = {}
        if args.municipio:
            q += " AND z.municipio_id = :mid"
            p["mid"] = args.municipio
        zonas = (await c.execute(text(q + " ORDER BY z.municipio_id, z.nombre"), p)).mappings().all()
        geo = (await c.execute(text(
            "SELECT id, name, type, lat, lng, geometry FROM geo_administrative_unit"
        ))).mappings().all()

    # indices de la carga del IGN
    unidades = []
    for g in geo:
        try:
            ring = json.loads(g["geometry"]) if g["geometry"] else None
        except (TypeError, ValueError):
            ring = None
        if ring:
            unidades.append({**dict(g), "ring": ring})
    por_nombre = {}
    for u in unidades:
        por_nombre.setdefault((norm(u["name"]), u["type"]), []).append(u)
    municipios_geo = [u for u in unidades if u["type"] == "municipality"]

    print(f"zonas sin contorno: {len(zonas)} | unidades geo con geometria: {len(unidades)}")

    contornos = {}          # municipio_id -> anillo del partido (o None)

    def contorno(z):
        mid = z["municipio_id"]
        if mid in contornos:
            return contornos[mid]
        ring = None
        if z["latitud"] is not None and z["longitud"] is not None:
            pt = (float(z["longitud"]), float(z["latitud"]))
            # el partido es el que CONTIENE al centro del municipio: asi no
            # importa que haya cinco homonimos repartidos por el pais
            for u in municipios_geo:
                if dentro(pt, u["ring"]):
                    ring = u["ring"]
                    break
        contornos[mid] = ring
        return ring

    def valida(z, pt):
        """El punto tiene que caer en el partido; si no lo tenemos, en el radio."""
        ring = contorno(z)
        if ring:
            return dentro(pt, ring)
        if z["latitud"] is None or z["longitud"] is None:
            return False
        radio = float(z["radio_km"] or 10) / 111.0
        return (abs(pt[0] - float(z["longitud"])) < radio * 1.4
                and abs(pt[1] - float(z["latitud"])) < radio)

    resueltas, fallidas, por_fuente = [], [], {"ign": 0, "osm": 0}

    for i, z in enumerate(zonas, 1):
        n = norm(z["nombre"])
        elegido = fuente = None

        # --- 1) lo que ya bajamos, validado por geometria ---------------------
        for tipo in ("populated_place", "municipality"):
            for u in por_nombre.get((n, tipo), []):
                pt = (float(u["lng"]), float(u["lat"])) if u["lat"] is not None else centro(u["ring"])
                if valida(z, pt):
                    elegido, fuente = u["ring"], f"ign#{u['id']}"
                    por_fuente["ign"] += 1
                    break
            if elegido:
                break

        # --- 2) OSM, para lo que el IGN no distingue --------------------------
        if not elegido and z["pais"] in (None, "AR"):
            try:
                for cand in nominatim(f"{z['nombre']}, {z['muni']}, Argentina"):
                    rs = anillos(cand.get("geojson"))
                    if not rs:
                        continue
                    if cand.get("type") not in CLASES.get(cand.get("class"), ()):
                        continue
                    # y tiene que llamarse como la zona: "Parque Cielos del Sur"
                    # contiene "Sur", pero no ES la zona Sur
                    if norm(cand["display_name"].split(",")[0]) != n:
                        continue
                    if valida(z, (float(cand["lon"]), float(cand["lat"]))):
                        elegido = max(rs, key=len)
                        fuente = f"{cand['osm_type']}/{cand['osm_id']}"
                        por_fuente["osm"] += 1
                        break
            except Exception as ex:
                print(f"  [red] {z['muni']}/{z['nombre']}: {ex}")
            time.sleep(PAUSA)

        if elegido:
            resueltas.append((z, elegido, fuente))
        else:
            fallidas.append(z)
        if i % 25 == 0:
            print(f"  {i}/{len(zonas)} | resueltas {len(resueltas)} | sin fuente {len(fallidas)}",
                  flush=True)

    print(f"\nresueltas {len(resueltas)} de {len(zonas)} "
          f"(IGN {por_fuente['ign']} - OSM {por_fuente['osm']})")

    if not args.dry_run and resueltas:
        async with engine.begin() as c:
            for z, ring, fuente in resueltas:
                lon, lat = centro(ring)
                await c.execute(text("""
                    UPDATE zonas SET poligono = :g, osm_id = :o,
                           latitud_centro = COALESCE(latitud_centro, :la),
                           longitud_centro = COALESCE(longitud_centro, :ln)
                    WHERE id = :id"""),
                    {"g": json.dumps(ring), "o": fuente[:40], "la": lat, "ln": lon, "id": z["id"]})
        print(f"grabadas {len(resueltas)} zonas")

    if fallidas:
        print(f"\nsin fuente real ({len(fallidas)}) --- quedan NULL, no se inventa contorno:")
        agrupado = {}
        for z in fallidas:
            agrupado.setdefault(z["muni"], []).append(z["nombre"])
        for muni, nombres in sorted(agrupado.items()):
            print(f"  {muni}: {', '.join(nombres)}")

    await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
