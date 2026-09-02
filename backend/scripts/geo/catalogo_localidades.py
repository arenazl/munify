"""Completa `catalogo_zonas` con las localidades oficiales de cada municipio.

El padron es georef (datos.gob.ar / INDEC): 4.037 localidades, y es el unico que
distingue las del conurbano. La capa de localidades del IGN --- de donde salio la
carga anterior --- es de PLANTA URBANA, o sea mancha edificada: donde la ciudad
es continua entrega una sola pieza, y todo el AMBA viene como un unico poligono
"Gran Buenos Aires" adentro del cual Haedo o El Palomar no existen.

El contorno se busca en tres lugares, del mas barato al mas caro:

    1. lo que ya esta en `catalogo_zonas`
    2. `geo_administrative_unit`, la carga del IGN
    3. Nominatim (OSM), a un request por segundo

En los tres, el candidato se acepta solo si su nombre coincide y su contorno
CONTIENE al centroide oficial de la localidad. Sin esa validacion el catalogo se
llena de homonimos: el IGN tiene un "Castelar" en Entre Rios y una "Villa
Sarmiento" en San Luis, y Nominatim, preguntando por la zona "Sur" de Chivilcoy,
contesta "Parque Cielos del Sur" --- un parque, con su poligono listo para
dibujarse como un tercio del municipio.

Overpass no se usa: esta caido (504) y no es necesario, porque georef ya enumera.

    python scripts/geo/catalogo_localidades.py [--provincia X] [--limit N]
                                               [--dry-run] [--db NOMBRE]
"""
import argparse
import asyncio
import difflib
import json
import os
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
PAUSA = 1.1
GEOREF = "https://apis.datos.gob.ar/georef/api/localidades"
CACHE = os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs",
                     "georef_localidades.json")

# Lo unico que puede ser una localidad. Sin esto entra cualquier cosa que
# Nominatim tenga con ese nombre adentro del partido: un parque, un hospital.
CLASES = {
    "boundary": {"administrative"},
    "place": {"city", "town", "village", "hamlet", "suburb", "neighbourhood",
              "quarter", "borough", "municipality", "locality"},
}


def cod_canon(v):
    """El codigo INDEC sin ceros a la izquierda.

    `municipios_catalogo.id` es varchar con ceros ('060056') y
    `catalogo_zonas.municipio_catalogo_id` es int (60056): el mismo
    municipio escrito de dos formas. Sin unificarlo, el indice de lo ya
    cargado no reconoce nada y cada corrida vuelve a pedir lo que ya
    tenia --- hasta chocar contra la unique de la tabla.
    """
    try:
        return str(int(str(v).strip()))
    except (TypeError, ValueError):
        return str(v or "").strip()


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def anillos(g):
    if g is None:
        return []
    if isinstance(g, list):
        return [g]                       # ya guardado como anillo plano
    if g.get("type") == "Polygon":
        return [g["coordinates"][0]]
    if g.get("type") == "MultiPolygon":
        return [p[0] for p in g["coordinates"]]
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


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def bajar_georef():
    """Las 4.037 localidades, de a 1000. Se cachean: el padron no cambia seguido."""
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            datos = json.load(f)
        print(f"georef: {len(datos)} localidades (cache)")
        return datos
    todas = []
    for off in range(0, 6000, 1000):
        u = GEOREF + "?" + urllib.parse.urlencode(
            {"campos": "id,nombre,centroide,departamento,provincia,municipio",
             "max": 1000, "inicio": off})
        with urllib.request.urlopen(u, timeout=90) as r:
            lote = json.loads(r.read()).get("localidades", [])
        todas.extend(lote)
        if not lote:
            break
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(todas, f, ensure_ascii=False)
    print(f"georef: {len(todas)} localidades (bajadas)")
    return todas


def nominatim(q, viewbox=None):
    """Busca un asentamiento, acotado a la zona del municipio.

    Las dos cosas que hacen la diferencia son `featureType=settlement` y el
    `viewbox` con `bounded`. Sin eso, preguntar por "Don Orione" trae ocho
    resultados de todo el pais y el bueno queda tapado; preguntar por
    "Berazategui Oeste" devuelve "Blanqueria Oeste Berazategui" --- un comercio
    con su poligono de cinco puntos. Pidiendo asentamientos dentro del recuadro
    del municipio, la respuesta correcta suele ser la unica.
    """
    p = {"q": q, "format": "json", "polygon_geojson": 1, "limit": 8,
         "countrycodes": "ar", "featureType": "settlement"}
    if viewbox:
        p.update({"viewbox": viewbox, "bounded": 1})
    u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(p)
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def reverse(lat, lon, zoom):
    u = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "zoom": zoom, "format": "json",
         "polygon_geojson": 1})
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def parecido(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


async def rellenar(engine, args):
    """Segundo pase: le pregunta a OSM POR POSICION, no por nombre.

    Buscar "El Pato, Berazategui" por texto no devuelve nada, pero el centroide
    oficial del INDEC cae dentro de una relacion administrativa que OSM si tiene
    dibujada. Lo mismo con las variantes de escritura --- "Villa Bordeau" en el
    padron, "Villa Bordeu" en OSM. El nombre igual se compara: si el poligono que
    contiene al punto se llama distinto, es OTRO lugar (el centroide de Don
    Orione cae en el barrio San Francisco de Asis) y se descarta.
    """
    async with engine.connect() as c:
        filas = (await c.execute(text(
            "SELECT cz.id, cz.nombre, cz.lat, cz.lng, cz.municipio_catalogo_id mid "
            "FROM catalogo_zonas cz "
            "WHERE cz.poligono IS NULL AND cz.lat IS NOT NULL"))).mappings().all()
        # cuantas localidades tiene cada municipio, y que tan grande es
        cuenta = {cod_canon(r["mid"]): r["n"] for r in (await c.execute(text(
            "SELECT municipio_catalogo_id mid, COUNT(*) n FROM catalogo_zonas "
            "GROUP BY municipio_catalogo_id"))).mappings()}
        cajas = {}
        for r in (await c.execute(text(
                "SELECT id, poligono FROM municipios_catalogo "
                "WHERE poligono IS NOT NULL"))).mappings():
            rs = anillos(json.loads(r["poligono"]))
            if rs:
                cajas[cod_canon(r["id"])] = bbox(max(rs, key=len))
    print(f"sin contorno en el catalogo: {len(filas)}")

    def tapa_al_municipio(ring, mid):
        """True si el contorno es, en realidad, el del partido entero.

        Preguntando por posicion, la cabecera homonima devuelve el partido: el
        punto de la localidad Moreno cae en el partido de Moreno y el nombre
        coincide, asi que pasa todos los filtros. Si el dibujo ocupa casi todo
        el municipio y el municipio tiene mas de una localidad, no es la
        localidad --- es el partido, y taparia a las demas. Cuando el municipio
        tiene una sola localidad la pregunta no se hace: ahi son la misma cosa.
        """
        caja = cajas.get(cod_canon(mid))
        if not caja or cuenta.get(cod_canon(mid), 1) <= 1:
            return False
        x0, y0, x1, y1 = bbox(ring)
        mx0, my0, mx1, my1 = caja
        area = max((x1 - x0) * (y1 - y0), 1e-12)
        area_muni = max((mx1 - mx0) * (my1 - my0), 1e-12)
        return area / area_muni > 0.7

    async def volcar(lote):
        """Se escribe de a poco: el pase tarda minutos y la conexion ociosa se
        cae del otro lado. Guardando al final, un corte de red devuelve a cero
        todo el trabajo --- ya paso una vez."""
        if args.dry_run or not lote:
            return
        async with engine.begin() as c:
            for zid, ring, fuente in lote:
                await c.execute(text(
                    "UPDATE catalogo_zonas SET poligono=:g, osm_id=:o, "
                    "fuente='osm', updated_at=NOW() WHERE id=:id"),
                    {"g": json.dumps(ring), "o": fuente[:32], "id": zid})

    encontrados, descartados, pendientes = [], [], []
    for i, f in enumerate(filas, 1):
        if args.limit and i > args.limit:
            break
        hallado = None
        for zoom in (14, 13, 12):
            try:
                d = reverse(f["lat"], f["lng"], zoom)
            except Exception as ex:
                print(f"  [red] {f['nombre']}: {ex}", flush=True)
                time.sleep(PAUSA)
                continue
            time.sleep(PAUSA)
            rs = anillos(d.get("geojson"))
            if not rs:
                continue
            nombre = (d.get("name") or d.get("display_name", "")).split(",")[0]
            if parecido(nombre, f["nombre"]) < 0.82:
                descartados.append((f["nombre"], nombre))
                continue
            r = max(rs, key=len)
            if tapa_al_municipio(r, f["mid"]):
                descartados.append((f["nombre"], f"{nombre} (es el partido)"))
                continue
            hallado = (r, f"osm:{d.get('osm_type')}/{d.get('osm_id')}")
            break
        if hallado:
            encontrados.append((f["id"], f["nombre"], *hallado))
            pendientes.append((f["id"], hallado[0], hallado[1]))
            if len(pendientes) >= 25:
                await volcar(pendientes)
                pendientes = []
        if i % 50 == 0:
            print(f"  {i}/{len(filas)} | recuperadas {len(encontrados)}", flush=True)

    print(f"\nrecuperadas {len(encontrados)} de {len(filas)}")
    for _, nom, ring, fuente in encontrados[:15]:
        print(f"    {nom[:26]:26s} {len(ring):5d} vertices  {fuente}")
    if descartados:
        print(f"\n  descartadas por nombre distinto ({len(descartados)}), "
              f"las primeras 10:")
        for pedido, vino in descartados[:10]:
            print(f"    {pedido[:24]:24s} -> OSM devolvio '{vino[:24]}'")

    await volcar(pendientes)
    if not args.dry_run:
        print(f"grabadas {len(encontrados)}")
    await engine.dispose()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provincia", help="solo esta provincia")
    ap.add_argument("--limit", type=int, help="cortar despues de N localidades")
    ap.add_argument("--rellenar", action="store_true",
                    help="segundo pase: busca por posicion las que quedaron sin contorno")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--db")
    args = ap.parse_args()

    url = settings.DATABASE_URL
    if args.db:
        url = url.rsplit("/", 1)[0] + "/" + args.db
    engine = create_async_engine(url, pool_pre_ping=True)

    if args.rellenar:
        return await rellenar(engine, args)

    localidades = bajar_georef()
    if args.provincia:
        p = norm(args.provincia)
        localidades = [x for x in localidades if norm(x["provincia"]["nombre"]) == p]

    async with engine.connect() as c:
        munis = (await c.execute(text(
            "SELECT id, nombre, poligono FROM municipios_catalogo "
            "WHERE poligono IS NOT NULL"))).mappings().all()
        zonas = (await c.execute(text(
            "SELECT id, municipio_catalogo_id mid, nombre, poligono "
            "FROM catalogo_zonas"))).mappings().all()
        # SOLO localidades. El contorno de un municipio contiene al de su
        # cabecera homonima, asi que la validacion "contiene el centroide" lo
        # acepta sin chistar: la localidad Moron se quedaba con el dibujo del
        # partido entero y tapaba a Haedo, Castelar y El Palomar.
        geo = (await c.execute(text(
            "SELECT name, geometry FROM geo_administrative_unit "
            "WHERE geometry IS NOT NULL AND type = 'populated_place'"))).mappings().all()

    # --- indices ------------------------------------------------------------
    idx_muni = []
    for m in munis:
        try:
            rings = anillos(json.loads(m["poligono"]))
        except (TypeError, ValueError):
            continue
        for r in rings:
            if len(r) >= 3:
                idx_muni.append((m["id"], m["nombre"], *bbox(r), r))

    ya = {}                       # (mid, nombre) -> tiene contorno?
    contornos = {}                # nombre -> [anillos ya conocidos]
    for z in zonas:
        try:
            rings = anillos(json.loads(z["poligono"])) if z["poligono"] else []
        except (TypeError, ValueError):
            rings = []
        ya[(cod_canon(z["mid"]), norm(z["nombre"]))] = bool(rings)
        for r in rings:
            contornos.setdefault(norm(z["nombre"]), []).append(r)
    for g in geo:
        try:
            rings = anillos(json.loads(g["geometry"]))
        except (TypeError, ValueError):
            continue
        for r in rings:
            contornos.setdefault(norm(g["name"]), []).append(r)

    print(f"municipios con contorno: {len(idx_muni)} | contornos conocidos por nombre: "
          f"{len(contornos)} | zonas ya en catalogo: {len(zonas)}")

    # `municipios_catalogo.id` ES el codigo INDEC ('060568' = Moron), el mismo
    # que georef trae en `municipio.id`. La relacion localidad->municipio no se
    # infiere: se lee del padron oficial y se une por clave. El punto adentro
    # del poligono queda de reserva, para las localidades que en georef no
    # tienen municipio asignado (hay areas de Buenos Aires sin municipio).
    por_codigo = {cod_canon(m["id"]): m["nombre"] for m in munis}

    def municipio_de(loc, pt):
        cod = cod_canon((loc.get("municipio") or {}).get("id"))
        if cod and cod in por_codigo:
            return cod, por_codigo[cod]
        for mid, nom, x0, y0, x1, y1, r in idx_muni:
            if x0 <= pt[0] <= x1 and y0 <= pt[1] <= y1 and dentro(pt, r):
                return mid, nom
        return None, None

    async def grabar(nuevas, completadas):
        """Se graba de a lotes y no al final: son miles de consultas a un
        servicio ajeno, y un corte a mitad de camino no puede costar todo lo
        que ya se resolvio. Con las filas ya escritas, volver a correr retoma
        donde quedo."""
        if args.dry_run or not (nuevas or completadas):
            return
        async with engine.begin() as c:
            for f in nuevas:
                await c.execute(text("""
                    INSERT INTO catalogo_zonas
                      (municipio_catalogo_id, nombre, tipo, lat, lng, poligono,
                       osm_id, fuente, created_at)
                    VALUES (:mid, :nombre, 'localidad', :lat, :lng, :poligono,
                            :osm, :fuente, NOW())
                    ON DUPLICATE KEY UPDATE
                      poligono=COALESCE(VALUES(poligono), poligono),
                      lat=VALUES(lat), lng=VALUES(lng),
                      osm_id=VALUES(osm_id), fuente=VALUES(fuente),
                      updated_at=NOW()"""), f)
            for f in completadas:
                await c.execute(text("""
                    UPDATE catalogo_zonas
                       SET poligono=:poligono, lat=:lat, lng=:lng,
                           osm_id=:osm, fuente=:fuente, updated_at=NOW()
                     WHERE municipio_catalogo_id=:mid AND nombre=:nombre"""), f)

    pendientes_n, pendientes_c = [], []
    grabadas = 0
    nuevas, completadas, saltadas, sin_muni, sin_contorno = [], [], 0, 0, []
    de_local = de_osm = por_indec = por_punto = 0
    sin_municipio = []

    for i, loc in enumerate(localidades, 1):
        if args.limit and i > args.limit:
            break
        cen = loc.get("centroide") or {}
        if cen.get("lon") is None:
            sin_muni += 1
            continue
        pt = (float(cen["lon"]), float(cen["lat"]))
        mid, muni = municipio_de(loc, pt)
        if mid is None:
            sin_muni += 1
            sin_municipio.append((loc["provincia"]["nombre"], loc["nombre"],
                                  (loc.get("municipio") or {}).get("nombre")))
            continue
        if cod_canon((loc.get("municipio") or {}).get("id")) in por_codigo:
            por_indec += 1
        else:
            por_punto += 1
        n = norm(loc["nombre"])
        clave = (mid, n)
        if ya.get(clave):          # ya existe Y ya tiene contorno
            saltadas += 1
            continue

        # 1 y 2) un contorno que ya tenemos, si de verdad la contiene
        anillo = fuente = None
        for r in contornos.get(n, []):
            x0, y0, x1, y1 = bbox(r)
            if x0 <= pt[0] <= x1 and y0 <= pt[1] <= y1 and dentro(pt, r):
                anillo, fuente = r, "local"
                de_local += 1
                break

        # 3) OSM, buscando asentamientos dentro del recuadro de la localidad.
        #    El nombre NO se exige igual: el padron dice "Carlos Tomas
        #    Sourigues" y OSM "Sourigues", y es el mismo lugar. Quien decide es
        #    la geometria --- el contorno tiene que contener al centroide
        #    oficial del INDEC, y eso ningun homonimo lo cumple.
        if anillo is None:
            d = 0.11                                   # ~12 km de lado
            caja = (f"{pt[0] - d},{pt[1] + d},{pt[0] + d},{pt[1] - d}")
            try:
                for cand in nominatim(loc["nombre"], viewbox=caja):
                    rs = anillos(cand.get("geojson"))
                    if not rs:
                        continue
                    r = max(rs, key=len)
                    if dentro(pt, r):
                        anillo, fuente = r, f"osm:{cand['osm_type']}/{cand['osm_id']}"
                        de_osm += 1
                        break
            except Exception as ex:
                print(f"  [red] {loc['nombre']}: {ex}", flush=True)
            time.sleep(PAUSA)

        # Sin contorno la localidad entra igual, con su centroide oficial y
        # `poligono` NULL: existe en el padron del INDEC, y perderla del catalogo
        # por no saber dibujarla seria tirar un dato real. El mapa simplemente no
        # la pinta hasta que aparezca el borde.
        if anillo is None:
            sin_contorno.append((muni, loc["nombre"]))
        fila = {"mid": mid, "nombre": loc["nombre"][:120], "lat": cen["lat"],
                "lng": cen["lon"],
                "poligono": json.dumps(anillo) if anillo else None,
                "fuente": ("indec" if anillo is None else
                           "ign" if fuente == "local" else "osm")[:24],
                "osm": (fuente if fuente and fuente != "local" else "")[:32]}
        existia = clave in ya
        (completadas if existia else nuevas).append(fila)
        (pendientes_c if existia else pendientes_n).append(fila)
        ya[clave] = True
        if anillo is not None:      # las que entran sin contorno no indexan nada
            contornos.setdefault(n, []).append(anillo)

        if len(pendientes_n) + len(pendientes_c) >= 100:
            await grabar(pendientes_n, pendientes_c)
            grabadas += len(pendientes_n) + len(pendientes_c)
            pendientes_n, pendientes_c = [], []

        if i % 100 == 0:
            print(f"  {i}/{len(localidades)} | nuevas {len(nuevas)} | "
                  f"completadas {len(completadas)} | ya estaban {saltadas} | "
                  f"sin contorno {len(sin_contorno)}", flush=True)

    print(f"\nlocalidades procesadas : {min(len(localidades), args.limit or 10**9)}")
    print(f"  ya estaban completas : {saltadas}")
    print(f"  contorno reusado     : {de_local}")
    print(f"  contorno de OSM      : {de_osm}")
    print(f"  filas nuevas         : {len(nuevas)}")
    print(f"  filas completadas    : {len(completadas)}")
    print(f"  municipio por INDEC  : {por_indec}")
    print(f"  municipio por punto  : {por_punto}")
    print(f"  sin municipio        : {sin_muni}")
    print(f"  sin contorno         : {len(sin_contorno)}")

    if sin_municipio:
        print("\n  casos sin municipio (los primeros 15):")
        for pr, ln, mn in sin_municipio[:15]:
            print(f"    {pr[:18]:18s} {ln[:28]:28s} georef.municipio={mn}")
    if sin_contorno:
        print("\n  casos sin contorno (los primeros 15):")
        for mu, ln in sin_contorno[:15]:
            print(f"    {str(mu)[:22]:22s} {ln}")

    await grabar(pendientes_n, pendientes_c)          # el ultimo lote
    grabadas += len(pendientes_n) + len(pendientes_c)
    if not args.dry_run:
        print(f"grabadas: {grabadas} filas")

    await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
