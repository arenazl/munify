# -*- coding: utf-8 -*-
"""La geografia REAL de la ciudad elegida, para que la semilla hable de ELLA.

EL PROBLEMA QUE CIERRA
----------------------
La demo de Lujan salia con zonas "Centro / Norte / Sur / Este / Periferia" y
barrios "Villa Norte / Los Alamos". Puntos cardinales inventados, no la ciudad
del intendente que mira la pantalla. Pasaba porque la geografia real venia de un
JSON precalculado a mano (`geo_demo.puntos_para_semilla`) y, sin ese archivo, la
semilla caia a una lista generica hardcodeada.

Aca la cadena se dispara SOLA al elegir la ciudad, con TRES piezas y nada mas:

    1. poligono  <- tabla `municipios_catalogo` (ya esta en la base: 2.682 de
                    5.122 municipios de 6 paises lo tienen cargado por batch).
    2. barrios y calles  <- UNA consulta a Overpass, cacheada en disco.
    3. puntos  <- features REALES de esa consulta, filtradas por
                  punto-en-poligono contra el contorno del paso 1.

No hay servicio nuevo, ni cola, ni proceso aparte: son dos lecturas y un POST.

POR QUE LOS PUNTOS SON FEATURES REALES Y NO COORDENADAS AL AZAR
---------------------------------------------------------------
La idea original era sortear coordenadas dentro del poligono y despues
preguntarle a Nominatim que hay ahi (reverse geocoding). Funciona, pero cuesta
un pedido por segundo --- 60 puntos son 66 segundos, imposible dentro del alta ---
y la mitad de los sorteos cae en el campo y hay que descartarlos.

Dando vuelta el orden sale gratis y sale MEJOR: Overpass ya nos devuelve, en la
misma respuesta, nodos con `addr:street` + `addr:housenumber` (direcciones
completas y reales) y calles con nombre. Cada uno de esos elementos YA es un
punto de la ciudad con su direccion; solo hay que verificar que caiga dentro del
poligono. La prueba de punto-en-poligono sigue siendo la misma
(`geo_demo.dentro`, ray casting sobre el anillo COMPLETO, nunca el bounding
box), pero en vez de usarla para aceptar un sorteo se usa para filtrar features.
Resultado: cero chinches en el rio, cero calles inventadas, cero espera.

LA JERARQUIA SALE DE OSM, NO DE UNA SUPOSICION
----------------------------------------------
    zonas    <- places `city|town|village|hamlet`  (las LOCALIDADES del partido)
    barrios  <- places `suburb|neighbourhood|quarter`

En Lujan eso da zonas = Lujan, Olivera, Open Door, Torres, Carlos Keen,
Jauregui, Cortinez, Pueblo Nuevo, Lezica y Torrezuri --- exactamente las
localidades del partido --- y 60 barrios reales colgando de ellas. Si la ciudad
no tiene localidades (el caso de una ciudad sola, sin pueblos alrededor), los
barrios pasan a ser tambien las zonas: la division que exista, no una inventada.

DEGRADACION HONESTA (regla 11: dato real o NULL, jamas un plausible)
--------------------------------------------------------------------
    hay places            -> zonas y barrios reales
    no hay places, si calles -> las zonas se llaman como las calles PRINCIPALES
                                reales de la ciudad, y no hay barrios
    no hay nada           -> el municipio queda SIN zonas y SIN barrios, y el
                             llamador se entera por `degradacion` para decirlo

Lo que NO existe mas es el reparto generico Centro/Norte/Sur: mentia sobre la
ciudad del cliente, que es justo lo que esta demo tiene que vender.

DETERMINISTA A PROPOSITO
------------------------
Todo el sorteo va con `random.Random(slug(nombre_municipio))`. La demo de la
misma ciudad sale SIEMPRE igual: mismos barrios, mismas calles, mismas
coordenadas. Si un vendedor la muestra dos veces, no se le mueve abajo de los
pies.

LA CARTOGRAFIA ES OFFLINE (Lucas, 2026-09-03)
---------------------------------------------
Overpass en vivo durante el alta NUNCA funciono: delays de 75 s, caidas, demos
que nacian sin barrios segun el humor de un servicio publico. La regla nueva:

    1. Los barrios y calles de cada municipio viven PRECARGADOS en la tabla
       `catalogo_geo_osm`, una fila por municipio del catalogo, curada por el
       batch `scripts/geo/curar_geo_catalogo.py` (el UNICO que sale a la red).
    2. El alta LEE esa tabla y nada mas. Si el municipio no esta curado, la
       demo nace igual —localidades del padron, puntos dentro de ellas, mapa y
       heatmap— y la bitacora lo dice, para que se cure a mano despues.
    3. `settings.GEO_OSM_EN_VIVO` (False) es solo para el batch y para depurar.

Y "tiene barrios" / "no tiene" se distingue con UNA query: por eso los nombres
cardinales sueltos (Norte / Sur / Este / Oeste) se FILTRAN en la entrada y no
existe ningun fallback que los invente. Un municipio sin barrios queda en cero.

FUENTE / LICENCIA
-----------------
  https://overpass-api.de/api/interpreter -- ODbL, (c) OpenStreetMap contributors
"""
from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path
from typing import Any, Optional

from services.geo_demo import CACHE_DIR, _norm, _slug, dentro

# Instancias publicas con el planeta completo. El alta usa las dos primeras
# (INTENTOS); el batch offline recorre todas, porque la noche que se curo AR
# (2026-09-02) overpass-api.de no contestaba ni /api/status y kumi tiraba 504.
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
UA = "Munify/1.0 (semilla de demos municipales; https://munify.com.ar)"

# Overpass tarda ~12 s para un partido como Lujan (2.481 calles + 70 places).
# El timeout es del tamaño de lo que un CELULAR aguanta, no del de la buena
# voluntad: con 75s por intento, un Overpass caido costaba hasta 150s y el
# navegador del prospecto cortaba el fetch ANTES de que el alta terminara —
# la demo nacia igual (200 OK en 84s, caso real 2026-09-02) pero el le veia
# "No pudimos crear la demo" y reintentaba, duplicando municipios. Con 20s
# por mirror el peor caso de Overpass son 40s y el alta entera queda debajo
# del umbral de corte movil; si vence, se degrada IGUAL que antes (la demo
# se crea sin barrios) pero temprano, que es lo que hace la diferencia.
TIMEOUT_SEG = 20.0
# Un reintento y nada mas, contra el segundo mirror. Overpass devuelve 429/504
# seguido; insistir mas solo alarga el alta sin cambiar el resultado.
INTENTOS = 2

# El filtro `poly:` de Overpass recibe el contorno como texto. Los poligonos del
# catalogo llegan hasta ~400 vertices y mandarlos enteros hace la consulta lenta
# sin ganar nada: es un PREFILTRO. El recorte fino lo hace `dentro()` en Python
# contra el anillo COMPLETO, asi que simplificar aca no deja entrar nada de
# afuera del municipio.
VERTICES_FILTRO = 80

# Topes de la respuesta. Overpass corta por cantidad de elementos, no por bytes.
TOPE_GEO = 4000      # places + calles
TOPE_DIRECCIONES = 2000

# Cuantas zonas y barrios se cargan como maximo. Un partido grande tiene 60
# barrios en OSM y un selector con 60 items no se usa; se toman los mas cercanos
# al centro de la ciudad, que son los que el intendente nombra.
MAX_ZONAS = 12
# 40 y no 30: con 30, Lujan cortaba en 5 km y se quedaba afuera Ameghino, que es
# uno de los barrios que el dueño nombro como prueba de que la demo habla de SU
# ciudad. El corte es por cercania al centro, asi que subirlo suma barrios de
# verdad --- todos salen de OSM --- sin ensuciar con nada inventado.
MAX_BARRIOS = 40

# Distancia maxima para adjudicarle un barrio a un punto. Mas lejos que esto el
# punto no es "de" ese barrio y se deja sin barrio, que es la verdad.
MAX_KM_BARRIO = 3.0

PLACES_ZONA = ("city", "town", "village", "hamlet")
PLACES_BARRIO = ("suburb", "neighbourhood", "quarter")

# Un barrio que se llama "Norte" a secas no es un barrio: es el relleno que
# dejaban los seeds viejos y que hacia imposible contar que municipios tienen
# cartografia y cuales no. Se filtran donde entran (OSM, IA) y en la limpieza
# de la base. "Barrio Norte" o "Villa Sur" son nombres reales y pasan.
NOMBRES_CARDINALES = frozenset({"norte", "sur", "este", "oeste"})

# Cuanto se guarda por municipio en `catalogo_geo_osm`. El alta usa un pool
# deduplicado por calle (ver armar()), asi que guardar 2.400 tramos de Lujan
# no aporta: con 400 calles y 400 direcciones distintas sobra para 50 reclamos
# variados y la tabla entera del pais pesa decenas de MB, no GB.
TOPE_CATALOGO_CALLES = 400
TOPE_CATALOGO_DIRECCIONES = 400
FUENTE_OSM = "OpenStreetMap (Overpass API) -- ODbL"


def es_cardinal(nombre: str) -> bool:
    return _norm(nombre or "") in NOMBRES_CARDINALES


def sin_cardinales(nombres: list) -> list:
    """Filtra los cardinales sueltos de una lista de nombres o de places."""
    out = []
    for n in nombres or []:
        texto = n.get("nombre") if isinstance(n, dict) else n
        if not es_cardinal(texto):
            out.append(n)
    return out


class OsmNoDisponible(RuntimeError):
    """Overpass no contesto. El llamador degrada; nunca inventa."""


# ==========================================================================
# Utilidades
# ==========================================================================

def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distancia aproximada en km entre (lat, lon). Equirectangular alcanza:
    se usa para comparar candidatos dentro de una misma ciudad, no para navegar.
    """
    dlat = (a[0] - b[0]) * 111.0
    dlon = (a[1] - b[1]) * 111.0 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dlat, dlon)


# En Lujan el `name` de OSM viene como "1013 - Avenida Maria Unzue de Alvear":
# el numero de nomenclatura municipal pegado adelante. Mostrarlo asi delata que
# el dato salio crudo de un dump. Se saca SOLO cuando hay separador " - ", asi
# "12 de Octubre" o "9 de Julio" quedan intactas.
_PREFIJO_NOMENCLATURA = re.compile(r"^\s*\d+\s*(?:bis)?\s+-\s+(?=\S)", re.IGNORECASE)


def _limpiar_calle(nombre: str) -> str:
    return _PREFIJO_NOMENCLATURA.sub("", nombre or "").strip()


def _simplificar(anillo: list, maximo: int = VERTICES_FILTRO) -> list:
    """Decima el anillo dejando `maximo` vertices repartidos parejo."""
    if len(anillo) <= maximo:
        return anillo
    paso = len(anillo) / maximo
    return [anillo[int(i * paso)] for i in range(maximo)]


def ruta_cache(nombre_municipio: str) -> Path:
    # "osmgeo2": el sufijo de version invalida el cache cuando CAMBIA la
    # consulta (2026-09-02 se sumaron los limites administrativos 9/10) — sin
    # esto una ciudad cacheada seguia sirviendo el resultado del query viejo.
    return CACHE_DIR / f"osmgeo2_{_slug(nombre_municipio)}.json"


# ==========================================================================
# 1. El poligono: de la base, no de la red
# ==========================================================================

async def municipio_del_catalogo(db, nombre: str, pais: str,
                                 provincia: Optional[str] = None,
                                 lat: Optional[float] = None,
                                 lon: Optional[float] = None) -> Optional[dict]:
    """La fila de `municipios_catalogo` del municipio, con su contorno oficial.

    Se busca por nombre + pais (+ provincia si vino, que es lo que desambigua
    los homonimos: hay dos 'Lujan' en Argentina y seis 'San Martin'). Si el
    nombre no matchea --- el alta pudo normalizar tildes o el usuario escribio un
    alias --- se cae a la fila mas CERCANA a las coordenadas con las que se creo
    el municipio, que vinieron de este mismo catalogo y por lo tanto coinciden.

    Devuelve `{id, nombre, provincia, anillo}`: el `id` es la clave con la que
    `catalogo_geo_osm` guarda la cartografia curada de ESTE municipio, asi que
    se resuelve una sola vez aca y no se vuelve a buscar por texto.
    """
    from sqlalchemy import text

    filas = (await db.execute(text(
        "SELECT nombre, provincia, lat, lng, poligono, id FROM municipios_catalogo "
        "WHERE pais = :p AND poligono IS NOT NULL AND "
        "(nombre = :n OR alias LIKE :al)"),
        {"p": (pais or "AR").upper(), "n": nombre, "al": f"%{nombre}%"})).fetchall()

    if filas and provincia:
        exactas = [f for f in filas if (f[1] or "") == provincia]
        filas = exactas or filas

    if not filas and lat is not None and lon is not None:
        # Ultimo recurso dentro de la BASE (todavia sin salir a la red): la fila
        # del catalogo cuyo centro esta a menos de ~5 km del centro del muni.
        filas = (await db.execute(text(
            "SELECT nombre, provincia, lat, lng, poligono, id FROM municipios_catalogo "
            "WHERE pais = :p AND poligono IS NOT NULL "
            "AND ABS(lat - :la) < 0.06 AND ABS(lng - :lo) < 0.06 "
            "ORDER BY ABS(lat - :la) + ABS(lng - :lo) LIMIT 1"),
            {"p": (pais or "AR").upper(), "la": lat, "lo": lon})).fetchall()

    if not filas:
        return None
    if len(filas) > 1 and lat is not None and lon is not None:
        filas = sorted(filas, key=lambda f: _km((lat, lon), (float(f[2]), float(f[3]))))
    try:
        anillo = json.loads(filas[0][4])
    except (ValueError, TypeError):
        return None
    if not (isinstance(anillo, list) and len(anillo) >= 3):
        return None
    return {"id": filas[0][5], "nombre": filas[0][0], "provincia": filas[0][1],
            "anillo": anillo}


async def poligono_del_catalogo(db, nombre: str, pais: str,
                                provincia: Optional[str] = None,
                                lat: Optional[float] = None,
                                lon: Optional[float] = None) -> Optional[list]:
    """Solo el contorno. Azucar sobre `municipio_del_catalogo` para scripts."""
    fila = await municipio_del_catalogo(db, nombre, pais, provincia, lat, lon)
    return fila["anillo"] if fila else None


async def zonas_del_catalogo(db, anillo: list) -> list[dict]:
    """Las localidades del municipio, con su contorno, desde `catalogo_zonas`.

    Es el padron: georef dice que localidades tiene cada municipio y el contorno
    ya viene resuelto y validado. Overpass sigue haciendo falta para las CALLES
    --- las direcciones reales de los reclamos de la demo --- pero para las zonas
    no: pedirselas devolvia nodos, o sea puntos sin area, y encima dependia de
    que el servicio estuviera arriba. Un municipio nacia con los nombres de sus
    localidades y sin una sola division dibujada en el mapa.

    Se busca por GEOMETRIA --- la localidad cuyo centro cae dentro del contorno
    del municipio --- y no por el nombre del municipio: el nombre ya se resolvio
    un paso antes, al conseguir ese contorno, y repetir la busqueda por texto
    reabre el problema de los homonimos.
    """
    from sqlalchemy import text

    xs = [p[0] for p in anillo]
    ys = [p[1] for p in anillo]
    filas = (await db.execute(text(
        "SELECT nombre, lat, lng, poligono FROM catalogo_zonas "
        "WHERE lat BETWEEN :y0 AND :y1 AND lng BETWEEN :x0 AND :x1"),
        {"x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys)})).fetchall()

    zonas = []
    for nombre, la, ln, poly in filas:
        if la is None or ln is None:
            continue
        if not _dentro((float(ln), float(la)), anillo):
            continue
        zonas.append({"nombre": nombre, "lat": float(la), "lon": float(ln),
                      "poligono": poly})
    return zonas


def _dentro(pt, anillo) -> bool:
    x, y = pt
    dentro = False
    n = len(anillo)
    for i in range(n):
        x1, y1 = anillo[i][:2]
        x2, y2 = anillo[(i + 1) % n][:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            dentro = not dentro
    return dentro


# ==========================================================================
# 2. Barrios y calles: UNA consulta a Overpass, cacheada
# ==========================================================================

def _consulta(anillo: list, timeout: float = TIMEOUT_SEG) -> str:
    """La consulta Overpass. UNA sola, con dos salidas acotadas.

    Dos `out` en vez de uno porque los topes de Overpass son por salida: con un
    unico `out ... 4000` las direcciones de una ciudad grande se comerian el
    cupo y no quedarian calles. Separadas, cada conjunto tiene su tope propio.

    El filtro `poly:` toma el contorno en 'lat lon lat lon ...'.
    """
    p = " ".join(f"{c[1]:.5f} {c[0]:.5f}" for c in _simplificar(anillo))
    return f"""[out:json][timeout:{int(timeout)}];
(
  node(poly:"{p}")["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"]["name"];
  way(poly:"{p}")["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
  relation(poly:"{p}")["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
  relation(poly:"{p}")["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"];
  way(poly:"{p}")["highway"~"^(primary|secondary|tertiary|residential)$"]["name"];
)->.geo;
.geo out tags center {TOPE_GEO};
node(poly:"{p}")["addr:housenumber"]["addr:street"]->.dir;
.dir out tags center {TOPE_DIRECCIONES};"""


async def _pedir(query: str, timeout: float = TIMEOUT_SEG,
                 intentos: int = INTENTOS) -> dict:
    import httpx

    ultimo = ""
    for i in range(intentos):
        mirror = MIRRORS[i % len(MIRRORS)]
        try:
            async with httpx.AsyncClient(timeout=timeout,
                                         headers={"User-Agent": UA}) as cli:
                r = await cli.post(mirror, data={"data": query})
                r.raise_for_status()
                return r.json()
        except Exception as e:  # noqa: BLE001 -- se reintenta con el otro mirror
            ultimo = f"{type(e).__name__}: {' '.join(str(e).split())[:120]}"
    raise OsmNoDisponible(ultimo or "sin respuesta")


def _parsear(cruda: dict, anillo: list) -> dict:
    """De la respuesta de Overpass a places / calles / direcciones, ya filtrados
    por punto-en-poligono contra el anillo COMPLETO."""
    places: list[dict] = []
    calles: dict[str, dict] = {}
    direcciones: list[dict] = []

    for el in cruda.get("elements", []):
        tags = el.get("tags") or {}
        c = el.get("center") or el
        lat, lon = c.get("lat"), c.get("lon")
        if lat is None or lon is None:
            continue
        if not dentro((lon, lat), anillo):
            continue  # el filtro `poly:` va sobre el contorno simplificado
        if tags.get("place"):
            places.append({"nombre": tags["name"], "tipo": tags["place"],
                           "lat": round(lat, 6), "lon": round(lon, 6)})
        elif (tags.get("boundary") == "administrative"
              and tags.get("admin_level") in ("9", "10") and tags.get("name")):
            # Barrios mapeados como LIMITE ADMINISTRATIVO, sin tag `place`.
            # En Rafaela son 74 de los 86: la app "no traia" un dato que SI
            # esta en la fuente (reporte de Infra, 2026-09-02). Entran como
            # barrio; si el mismo barrio ademas existe como place, el dedup de
            # abajo se queda con uno.
            places.append({"nombre": tags["name"], "tipo": "neighbourhood",
                           "lat": round(lat, 6), "lon": round(lon, 6)})
        elif tags.get("highway"):
            nombre = _limpiar_calle(tags.get("name", ""))
            if not nombre:
                continue
            # Una calle son muchos `way`. Se guarda un tramo por nombre y se
            # cuenta el resto: la cantidad de tramos es el mejor proxy gratis de
            # "que tan principal es" para la degradacion por calles.
            reg = calles.setdefault(nombre, {"nombre": nombre, "lat": round(lat, 6),
                                             "lon": round(lon, 6),
                                             "tipo": tags["highway"], "tramos": 0})
            reg["tramos"] += 1
        elif tags.get("addr:street"):
            calle = _limpiar_calle(tags["addr:street"])
            altura = (tags.get("addr:housenumber") or "").strip()
            if not calle or not altura:
                continue
            direcciones.append({"calle": calle, "altura": altura,
                                "lat": round(lat, 6), "lon": round(lon, 6)})

    # Dedup por nombre dentro de cada clase (zona/barrio): el mismo barrio
    # puede venir como place=suburb Y como limite administrativo.
    vistos: set = set()
    unicos = []
    for p in places:
        if es_cardinal(p["nombre"]):
            continue
        clase = "z" if p["tipo"] in PLACES_ZONA else "b"
        clave = (_norm(p["nombre"]), clase)
        if clave in vistos:
            continue
        vistos.add(clave)
        unicos.append(p)

    return {"places": unicos, "calles": list(calles.values()),
            "direcciones": direcciones}


def recortar_para_catalogo(datos: dict) -> dict:
    """Lo que se GUARDA por municipio en `catalogo_geo_osm`.

    Places completos (son pocos y son la parte que importa). Calles: las mas
    principales primero (tipo, tramos), hasta el tope. Direcciones: UNA por
    calle —el pool del alta las deduplica igual— hasta el tope, en el orden
    determinista que ya usa la semilla, asi lo guardado y lo que se armaba en
    vivo es el mismo universo.
    """
    orden = {"primary": 0, "secondary": 1, "tertiary": 2, "residential": 3}
    calles = sorted(datos.get("calles") or [],
                    key=lambda c: (orden.get(c.get("tipo"), 9), -int(c.get("tramos") or 0)))
    por_calle: dict[str, dict] = {}
    for d in datos.get("direcciones") or []:
        por_calle.setdefault(d["calle"], d)
    return {
        "places": sin_cardinales(datos.get("places") or []),
        "calles": calles[:TOPE_CATALOGO_CALLES],
        "direcciones": list(por_calle.values())[:TOPE_CATALOGO_DIRECCIONES],
        "recortado": {"calles_totales": len(datos.get("calles") or []),
                      "direcciones_totales": len(datos.get("direcciones") or [])},
    }


def estado_de(datos: dict) -> str:
    """`ok` si OSM tiene algo de la ciudad; `sin_datos_osm` si respondio vacio.
    El vacio TAMBIEN se guarda: asi no se le vuelve a pedir a Overpass en cada
    corrida, y la cuenta "tenemos / no tenemos" sale de la tabla."""
    return "ok" if (datos.get("places") or datos.get("calles")) else "sin_datos_osm"


async def leer_catalogo_geo(db, catalogo_id: str) -> Optional[dict]:
    """La fila curada del municipio, o None si no esta (o la tabla no existe
    todavia en este ambiente: prod la recibe por el paquete de promocion)."""
    from sqlalchemy import text

    try:
        fila = (await db.execute(text(
            "SELECT estado, datos, barrios, calles, direcciones, curado_en "
            "FROM catalogo_geo_osm WHERE municipio_catalogo_id = :i"),
            {"i": catalogo_id})).fetchone()
    except Exception:  # noqa: BLE001 -- tabla ausente: se trata como no curado
        return None
    if not fila:
        return None
    estado, datos_json = fila[0], fila[1]
    datos: dict = {"places": [], "calles": [], "direcciones": []}
    if datos_json:
        try:
            datos = json.loads(datos_json)
        except (ValueError, TypeError):
            datos = {"places": [], "calles": [], "direcciones": []}
    datos.update({"estado": estado, "cacheado": "catalogo_geo_osm",
                  "fuente": FUENTE_OSM,
                  "curado_en": fila[5].isoformat() if fila[5] else None})
    return datos


async def guardar_catalogo_geo(db, fila_catalogo: dict, pais: str, datos: dict,
                               estado: Optional[str] = None,
                               detalle: Optional[str] = None) -> str:
    """Escribe (o pisa) la fila curada del municipio. Devuelve el estado."""
    from sqlalchemy import text

    estado = estado or estado_de(datos)
    recorte = recortar_para_catalogo(datos) if estado == "ok" else None
    barrios = sum(1 for p in (recorte or {}).get("places", []) if p["tipo"] in PLACES_BARRIO)
    await db.execute(text("""
        INSERT INTO catalogo_geo_osm
            (municipio_catalogo_id, pais, nombre, provincia, estado,
             barrios, calles, direcciones, datos, detalle, fuente, curado_en)
        VALUES (:i, :p, :n, :prov, :e, :b, :c, :d, :datos, :det, :f, NOW())
        ON DUPLICATE KEY UPDATE
            estado = VALUES(estado), barrios = VALUES(barrios),
            calles = VALUES(calles), direcciones = VALUES(direcciones),
            datos = VALUES(datos), detalle = VALUES(detalle),
            fuente = VALUES(fuente), curado_en = NOW()
    """), {
        "i": fila_catalogo["id"], "p": (pais or "AR").upper(),
        "n": fila_catalogo["nombre"], "prov": fila_catalogo.get("provincia"),
        "e": estado, "b": barrios,
        "c": len((recorte or {}).get("calles", [])),
        "d": len((recorte or {}).get("direcciones", [])),
        "datos": json.dumps(recorte, ensure_ascii=False) if recorte else None,
        "det": (detalle or "")[:300] or None, "f": FUENTE_OSM,
    })
    return estado


async def osm_en_vivo(nombre_municipio: str, anillo: list,
                      timeout: float = TIMEOUT_SEG,
                      intentos: int = INTENTOS) -> dict:
    """UNA consulta a Overpass, parseada. Es lo unico que sale a la red, y solo
    lo llaman el batch de curacion y `osm_de_ciudad` con GEO_OSM_EN_VIVO.

    `timeout` e `intentos`: los defaults son los del alta (lo que aguanta un
    celular: 20 s, dos mirrors). El batch offline pasa un timeout largo y todos
    los mirrors: un partido del conurbano tarda mas de 20 s y no hay nadie
    esperando."""
    datos = _parsear(await _pedir(_consulta(anillo, timeout), timeout, intentos), anillo)
    datos.update({"municipio": nombre_municipio, "cacheado": False,
                  "fuente": FUENTE_OSM})
    return datos


async def osm_de_ciudad(nombre_municipio: str, anillo: list,
                        refrescar: bool = False, *, db=None,
                        fila_catalogo: Optional[dict] = None,
                        pais: str = "AR",
                        en_vivo: Optional[bool] = None) -> Optional[dict]:
    """Places, calles y direcciones reales del municipio.

    Orden: tabla `catalogo_geo_osm` (lo curado offline) -> cache en disco (lo
    que quedo de las corridas locales) -> y SOLO si `en_vivo`, Overpass, con
    write-through a la tabla para que esa ciudad quede curada.

    Devuelve None cuando el municipio no esta curado y no se puede salir a la
    red: el llamador degrada y lo anota. Nunca inventa.
    """
    if en_vivo is None:
        try:
            from core.config import settings
            en_vivo = bool(settings.GEO_OSM_EN_VIVO)
        except Exception:  # noqa: BLE001 -- scripts sin settings
            en_vivo = False

    if db is not None and fila_catalogo and not refrescar:
        curado = await leer_catalogo_geo(db, fila_catalogo["id"])
        if curado is not None:
            return curado

    ruta = ruta_cache(nombre_municipio)
    if ruta.exists() and not refrescar:
        try:
            datos = json.loads(ruta.read_text(encoding="utf-8"))
            datos["cacheado"] = True
            return datos
        except (ValueError, OSError):
            pass  # cache corrupto: se sigue como si no existiera

    if not en_vivo:
        return None

    datos = await osm_en_vivo(nombre_municipio, anillo)
    if db is not None and fila_catalogo:
        try:
            await guardar_catalogo_geo(db, fila_catalogo, pais, datos)
        except Exception:  # noqa: BLE001 -- sin tabla la demo se crea igual
            pass
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        ruta.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass  # sin disco de escritura la demo se crea igual, solo sin cache
    return datos


# ==========================================================================
# 3. De lo real a lo que la semilla necesita
# ==========================================================================

def _cerca(punto: tuple[float, float], candidatos: list[dict],
           max_km: Optional[float] = None) -> Optional[dict]:
    if not candidatos:
        return None
    mejor = min(candidatos, key=lambda c: _km(punto, (c["lat"], c["lon"])))
    if max_km is not None and _km(punto, (mejor["lat"], mejor["lon"])) > max_km:
        return None
    return mejor


def _puntos_por_localidad(nombre_municipio: str, localidades: list[dict],
                          cantidad: int) -> list[dict]:
    """Reclamos con coordenada REAL a nivel LOCALIDAD, para cuando OSM no dio
    calles (Lucas, 2026-09-03: sin calles no se pierde el mapa). El punto cae
    DENTRO del poligono real de la localidad del padron —o en su centro exacto
    si no hay contorno— y la direccion textual es el nombre de la localidad:
    ni calle ni altura inventadas (regla 11), precision honesta de localidad.
    Deterministico: mismo municipio, mismos puntos."""
    rnd = random.Random(_slug(nombre_municipio) + "|puntos")
    puntos: list[dict] = []
    for i in range(cantidad):
        loc = localidades[i % len(localidades)]
        lat, lon = float(loc["lat"]), float(loc["lon"])
        anillo = loc.get("poligono")
        if isinstance(anillo, str):
            try:
                anillo = json.loads(anillo)
            except (ValueError, TypeError):
                anillo = None
        if not (isinstance(anillo, list) and len(anillo) >= 3):
            anillo = None
        jlat, jlon = lat, lon
        for _ in range(12):
            c_lat = lat + (rnd.random() - 0.5) * 0.008
            c_lon = lon + (rnd.random() - 0.5) * 0.008
            if anillo is None or dentro((c_lon, c_lat), anillo):
                jlat, jlon = c_lat, c_lon
                break
        puntos.append({
            "lat": round(jlat, 6), "lon": round(jlon, 6),
            "calle": None, "altura": None,
            "direccion": loc["nombre"], "fuente": "localidad_padron",
            "zona_nombre": loc["nombre"], "barrio": None,
        })
    return puntos


def armar(nombre_municipio: str, osm: dict, cantidad_puntos: int,
          centro: Optional[tuple[float, float]] = None,
          max_zonas: int = MAX_ZONAS,
          max_barrios: int = MAX_BARRIOS,
          zonas_padron: Optional[list[dict]] = None) -> dict:
    """Zonas, barrios y puntos listos para la semilla. Todo determinista.

    `cantidad_puntos` es un PARAMETRO a proposito: cuando la semilla suba de 13
    a 50 reclamos no hay que tocar nada aca, y el consumidor ademas recorre la
    lista con modulo, asi que pedir de menos degrada la variedad pero nunca
    rompe.
    """
    rnd = random.Random(_slug(nombre_municipio))
    # El filtro de cardinales tambien aca: un cache viejo o una fila curada
    # antes de la regla no puede volver a meter "Norte" como barrio.
    places = sin_cardinales(osm.get("places") or [])
    calles = osm.get("calles") or []
    direcciones = osm.get("direcciones") or []

    gruesas = [p for p in places if p["tipo"] in PLACES_ZONA]
    finas = [p for p in places if p["tipo"] in PLACES_BARRIO]
    # Ciudad sin localidades alrededor: si el unico place "grueso" es la ciudad
    # misma, una zona unica que abarca el 100% de los casos no divide nada
    # (Villa Carlos Paz: un solo `town` y 59 barrios --- salia UNA zona con los
    # 50 reclamos adentro). La division real son sus barrios, y esos pasan a
    # ser las zonas; si tampoco hay barrios, se cae mas abajo a las calles
    # principales. En un partido (Lujan, Merlo) hay varias localidades y este
    # caso no toca nada.
    zp = zonas_padron or []
    promovidas = False
    if len(gruesas) <= 1:
        if len(zp) > 1:
            # EL PADRON YA DIVIDE (bug Rafaela capa 1, 2026-09-02): promover
            # los barrios de OSM a zonas era COMERSELOS — el caller despues
            # impone el padron y los barrios quedaban en CERO teniendo el dato
            # en la fuente. Si el padron divide, los barrios quedan de barrios.
            gruesas = []
        elif finas:
            # Ciudad sin padron que divida: los barrios pasan a ser las zonas
            # (fix de Villa Carlos Paz) — pero SOLO los que entren en el corte
            # de max_zonas. Antes se vaciaba la lista entera y una ciudad con
            # 80 barrios quedaba con 12 zonas y CERO barrios (bug Rafaela capa
            # 2): el resto sigue siendo barrio, que es lo que es.
            gruesas = finas
            promovidas = True
        else:
            gruesas = []

    degradacion: Optional[str] = None
    if len(zp) > 1 and not gruesas:
        # Las zonas las pone el padron: sin division propia de OSM no hay nada
        # que degradar ni que inventar por calles.
        pass
    elif not gruesas and calles:
        # Sin ninguna division en OSM, las zonas toman el nombre de las calles
        # mas principales de la ciudad. Siguen siendo nombres REALES que el
        # intendente reconoce; lo que no se hace es llamarlas Norte/Sur.
        orden = {"primary": 0, "secondary": 1, "tertiary": 2, "residential": 3}
        top = sorted(calles, key=lambda c: (orden.get(c["tipo"], 9), -c["tramos"]))[:max_zonas]
        gruesas = [{"nombre": c["nombre"], "tipo": "calle",
                    "lat": c["lat"], "lon": c["lon"]} for c in top]
        degradacion = "sin_barrios_en_osm_zonas_por_calles_principales"
    elif not gruesas:
        degradacion = "sin_geografia_en_osm"

    # DESDE DONDE SE MIDE "CERCA DEL CENTRO". El punto del catalogo es el
    # centroide del PARTIDO, no el del casco urbano: en Lujan cae 4 km al oeste
    # de la ciudad y con el, ordenando por cercania, Ameghino quedaba 52° de 60 y
    # afuera del corte, mientras entraban barrios del otro extremo. El place
    # `town` que devuelve OSM con el nombre del municipio SI es el centro de la
    # ciudad, y ahi Ameghino sube al puesto 37 y entra --- junto con Zapiola,
    # Juan XXIII, Universidad y Villa del Parque.
    objetivo = _norm(nombre_municipio)
    propio = next((p for p in places
                   if p["tipo"] in PLACES_ZONA and _norm(p["nombre"]) == objetivo), None)
    centro_ciudad = (propio["lat"], propio["lon"]) if propio else centro

    def _recortar(items: list[dict], tope: int) -> list[dict]:
        if len(items) <= tope or not centro_ciudad:
            return items[:tope]
        return sorted(items,
                      key=lambda p: _km(centro_ciudad, (p["lat"], p["lon"])))[:tope]

    zonas = _recortar(gruesas, max_zonas)
    if promovidas:
        nombres_zona = {_norm(z["nombre"]) for z in zonas}
        finas = [f for f in finas if _norm(f["nombre"]) not in nombres_zona]
    barrios = _recortar(finas, max_barrios)

    # --- los puntos ---
    # Cada candidato YA es un elemento real de OSM dentro del poligono. Se
    # prefieren las direcciones completas (calle + altura REALES de OSM); las
    # calles sin altura entran despues para dar cobertura a los barrios donde
    # OSM no tiene numeracion cargada.
    #
    # NO se le pega una altura inventada a la calle: una direccion que parece
    # precisa y no lo es es exactamente lo que la regla 11 prohibe. Sin numero,
    # la direccion queda con la calle sola.
    pool: dict[str, dict] = {}
    for d in direcciones:
        pool.setdefault(d["calle"], {
            "lat": d["lat"], "lon": d["lon"], "calle": d["calle"],
            "altura": d["altura"], "direccion": f"{d['calle']} {d['altura']}",
            "fuente": "osm_addr"})
    for c in calles:
        pool.setdefault(c["nombre"], {
            "lat": c["lat"], "lon": c["lon"], "calle": c["nombre"],
            "altura": None, "direccion": c["nombre"], "fuente": "osm_highway"})

    # DOS CON ALTURA, UNA SIN, y asi. No es capricho: en Lujan OSM tiene 2.000
    # nodos con numero de puerta pero repartidos en solo 79 calles, todas del
    # casco. Barajando todo junto los primeros puntos salian casi sin altura
    # ("Entre Rios" a secas); poniendo las direcciones completas adelante, TODOS
    # los reclamos caian en el centro y las localidades del partido quedaban sin
    # un solo caso. Intercalado se queda con las dos cosas: la mayoria de las
    # direcciones completas, y reclamos repartidos por toda la ciudad.
    #
    # Una calle repetida en dos reclamos se lee como dato sintetico, asi que el
    # pool ya viene deduplicado por nombre de calle.
    con_altura = [p for p in pool.values() if p["altura"]]
    sin_altura = [p for p in pool.values() if not p["altura"]]
    rnd.shuffle(con_altura)
    rnd.shuffle(sin_altura)
    candidatos: list[dict] = []
    ia = ib = 0
    while ia < len(con_altura) or ib < len(sin_altura):
        for _ in range(2):
            if ia < len(con_altura):
                candidatos.append(con_altura[ia])
                ia += 1
        if ib < len(sin_altura):
            candidatos.append(sin_altura[ib])
            ib += 1

    # Los puntos se asignan contra las zonas que van a EXISTIR en la demo: si
    # el padron divide, contra el padron — asignar contra zonas del armado que
    # el caller despues descarta dejaba zona_nombre apuntando a nombres que no
    # existen como zona.
    zonas_asignables = zp if len(zp) > 1 else zonas
    puntos = []
    for p in candidatos[:cantidad_puntos]:
        zona = _cerca((p["lat"], p["lon"]), zonas_asignables)
        barrio = _cerca((p["lat"], p["lon"]), barrios, MAX_KM_BARRIO)
        puntos.append({**p,
                       "zona_nombre": zona["nombre"] if zona else None,
                       "barrio": barrio["nombre"] if barrio else None})

    return {
        "zonas": zonas,
        "barrios": barrios,
        "puntos": puntos,
        "degradacion": degradacion,
        "con_altura_real": sum(1 for p in puntos if p["altura"]),
        "calles_disponibles": len(calles),
        "direcciones_disponibles": len(direcciones),
        "places_disponibles": len(places),
    }


# ==========================================================================
# La puerta de entrada: una llamada y la ciudad queda resuelta
# ==========================================================================

async def geografia(db, nombre: str, pais: str, cantidad_puntos: int,
                    provincia: Optional[str] = None,
                    lat: Optional[float] = None, lon: Optional[float] = None,
                    log: Any = None) -> dict:
    """Toda la geografia de la ciudad, o la degradacion explicada.

    Nunca levanta: si algo falla devuelve zonas/barrios/puntos vacios y el
    motivo en `degradacion`. Crear la demo no puede romperse porque OSM
    devolvio un 504 --- pero tampoco puede disimularlo, asi que el motivo viaja
    hasta la respuesta del alta y hasta el log de seeding.
    """
    vacio = {"zonas": [], "barrios": [], "puntos": [], "poligono": None,
             "fuente_poligono": None, "degradacion": "sin_geografia_en_osm"}

    def _paso(nombre_paso: str):
        # El log es opcional: los scripts y los tests llaman sin el.
        class _Nulo:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def ok(self, **k):
                pass

            def degradado(self, motivo, **k):
                pass

            def fallo(self, motivo, **k):
                pass
        return log.paso(nombre_paso) if log is not None else _Nulo()

    # --- poligono ---
    with _paso("geo:poligono") as pz:
        fila = await municipio_del_catalogo(db, nombre, pais, provincia, lat, lon)
        anillo = fila["anillo"] if fila else None
        if anillo:
            pz.ok(vertices=len(anillo), fuente="municipios_catalogo",
                  catalogo_id=fila["id"])
        else:
            pz.degradado("el municipio no tiene contorno cargado en municipios_catalogo",
                         fuente=None)
    if not anillo:
        # Sin contorno no hay padron ni cartografia que buscar, pero el mapa
        # no se pierde: los reclamos caen alrededor del centro con el que se
        # creo el municipio (que salio del mismo catalogo), con el nombre del
        # municipio como direccion. Precision honesta de "centro del pueblo".
        puntos = []
        if lat is not None and lon is not None:
            puntos = _puntos_por_localidad(
                nombre, [{"nombre": nombre, "lat": lat, "lon": lon, "poligono": None}],
                cantidad_puntos)
        return {**vacio, "puntos": puntos, "degradacion": "sin_poligono_en_catalogo"}

    # --- zonas: del PADRON, no de la red ---
    # Estan en la base, con el contorno ya resuelto y validado. Overpass las
    # devolvia como nodos --- puntos sin area --- y ademas hay que estar
    # esperando que conteste.
    with _paso("geo:zonas") as pzz:
        zonas_padron = await zonas_del_catalogo(db, anillo)
        if zonas_padron:
            pzz.ok(zonas=len(zonas_padron),
                   con_contorno=sum(1 for z in zonas_padron if z["poligono"]),
                   fuente="catalogo_zonas")
        else:
            pzz.degradado("el municipio no tiene localidades en catalogo_zonas",
                          fuente=None)

    # --- barrios y calles: de la tabla curada, NUNCA de la red ---
    def _sin_cartografia(motivo: str) -> dict:
        # La demo nace igual: localidades del padron y reclamos con lat/lng
        # DENTRO de ellas (o del centro del municipio si el padron esta
        # vacio). Es DEGRADADO y no fallo: 'fallo' ponia la bitacora en rojo
        # y el 2026-09-02 se leyo como "las demos fallan" cuando no fallaban.
        base = zonas_padron or [{"nombre": nombre, "lat": lat, "lon": lon,
                                 "poligono": anillo}]
        puntos = _puntos_por_localidad(nombre, base, cantidad_puntos) \
            if (zonas_padron or (lat is not None and lon is not None)) else []
        return {**vacio, "zonas": zonas_padron, "puntos": puntos,
                "poligono": anillo, "fuente_poligono": "municipios_catalogo",
                "fuente_zonas": "catalogo_zonas", "degradacion": motivo}

    with _paso("geo:osm") as po:
        try:
            osm = await osm_de_ciudad(nombre, anillo, db=db, fila_catalogo=fila,
                                      pais=pais)
        except OsmNoDisponible as e:
            po.degradado(f"Overpass no respondio: {e}")
            return _sin_cartografia(f"overpass_no_disponible: {e}")
        if osm is None:
            po.degradado("municipio sin cartografia curada en catalogo_geo_osm: "
                         "encolar en scripts/geo/curar_geo_catalogo.py",
                         catalogo_id=fila["id"], fuente=None)
            return _sin_cartografia("sin_cartografia_curada")
        if osm.get("estado") == "sin_datos_osm":
            po.degradado("OSM no tiene barrios ni calles mapeados para este municipio "
                         "(curado: sin_datos_osm)", cacheado=osm.get("cacheado"),
                         curado_en=osm.get("curado_en"))
        else:
            po.ok(cacheado=osm.get("cacheado"), curado_en=osm.get("curado_en"),
                  places=len(osm.get("places") or []),
                  calles=len(osm.get("calles") or []),
                  direcciones=len(osm.get("direcciones") or []))

    # --- zonas, barrios y puntos ---
    with _paso("geo:puntos") as pp:
        centro = (lat, lon) if lat is not None and lon is not None else None
        armado = armar(nombre, osm, cantidad_puntos, centro=centro,
                       zonas_padron=zonas_padron)
        detalle = {
            "zonas": len(armado["zonas"]),
            "barrios": len(armado["barrios"]),
            "puntos": len(armado["puntos"]),
            "puntos_con_altura_real": armado["con_altura_real"],
            "nombres_zonas": [z["nombre"] for z in armado["zonas"]],
            "nombres_barrios": [b["nombre"] for b in armado["barrios"]][:15],
            "calles_ejemplo": [p["direccion"] for p in armado["puntos"][:8]],
        }
        if armado["degradacion"]:
            pp.degradado(armado["degradacion"], **detalle)
        else:
            pp.ok(**detalle)

    # QUIEN MANDA depende de que clase de municipio es, y esto ya estaba resuelto
    # aguas arriba: en un PARTIDO (Moron, La Matanza) la division son sus
    # localidades, y ahi el padron gana porque las trae con contorno. En una
    # CIUDAD sin padron que divida, la division real son sus barrios y `armar()`
    # los promueve a zonas (fix de Villa Carlos Paz). OJO con la combinacion que
    # fallaba (Rafaela, 2026-09-02): ciudad de UNA gruesa pero CON padron de 12
    # localidades — armar() promovia los 86 barrios a zonas, aca el padron las
    # pisaba, y la demo quedaba con 0 barrios teniendo el dato en OSM. Por eso
    # armar() recibe `zonas_padron` y NO promueve cuando el padron divide.
    #
    # Sin barrios en OSM queda la unica localidad del padron, que al menos trae
    # su contorno: peor es no dibujar nada.
    if len(zonas_padron) > 1:
        zonas, fuente_zonas = zonas_padron, "catalogo_zonas"
    elif armado["zonas"]:
        zonas, fuente_zonas = armado["zonas"], "osm_barrios_de_la_ciudad"
    else:
        zonas, fuente_zonas = zonas_padron, "catalogo_zonas"

    # SIN CALLES NO SE PIERDE EL MAPA (Lucas, 2026-09-03): si OSM no dio
    # calles ni direcciones, los reclamos igual llevan lat/lng dentro de las
    # localidades REALES del padron. NADA de esto bloquea la demo: nace con
    # puntos, mapa y heatmap; la precision de calle llega con la curacion
    # offline y queda avisado en la bitacora para curar a mano.
    if not armado["puntos"] and (zonas_padron or zonas):
        armado["puntos"] = _puntos_por_localidad(
            nombre, zonas_padron or zonas, cantidad_puntos)
        armado["degradacion"] = (armado["degradacion"]
                                 or "sin_calles_osm_reclamos_a_nivel_localidad")

    return {**armado, "zonas": zonas, "poligono": anillo,
            "fuente_poligono": "municipios_catalogo",
            "fuente_zonas": fuente_zonas}
