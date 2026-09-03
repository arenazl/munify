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
import logging
import math
import random
import re
from pathlib import Path
from typing import Any, Optional

from services.geo_demo import CACHE_DIR, _norm, _slug, dentro

logger = logging.getLogger(__name__)

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

# Distancia maxima para adjudicarle un barrio a un punto que no cae dentro del
# contorno de ninguno. Mas lejos que esto el punto no es "de" ese barrio y se
# deja sin barrio, que es la verdad.
MAX_KM_BARRIO = 3.0

PLACES_ZONA = ("city", "town", "village", "hamlet")
PLACES_BARRIO = ("suburb", "neighbourhood", "quarter")

# LA ZONA ES DEL NEGOCIO, NO DE LA CARTOGRAFIA. Decision de producto (dueño,
# 2026-09-02, cerrada el 2026-09-03): la zona es una unidad OPERATIVA —a que
# cuadrilla le toca, que supervisor mira que— y ese reparto no esta en ninguna
# fuente externa: lo decide cada municipio a su criterio. Por eso la cadena de
# una demo es SIEMPRE municipio -> Zona unica -> barrios: una zona que abarca
# el municipio entero, con su contorno, y todos los barrios cuelgan de ella;
# el ABM explica como dividirla. Nada asciende a zona: ni "Norte/Sur", ni las
# calles principales, ni los barrios de OSM, ni las localidades del padron
# (2026-09-02 esas eran zonas y metian un nivel que no existe: Merlo tenia 5
# "zonas" y Libertad, que es un barrio, no aparecia como tal).
# El nombre no repite el del municipio para no confundir los dos niveles, y se
# descarto "Sin zonificar" porque eso nombra la FALTA de zonas y esto ES una.
ZONA_UNICA = "Zona única"

# LOS BARRIOS SE LEEN, NO SE FABRICAN. La semilla toma los barrios del
# municipio —nombre, tipo, centro y contorno cuando lo hay— de
# `catalogo_barrios`, curada offline desde el extracto de OSM y el padron
# (`scripts/geo/catalogo_barrios_pbf.py`). Todos, sin tope: un partido con 200
# barrios tiene 200 barrios. Un municipio sin filas ahi nace sin barrios, y la
# bitacora dice por que; el remedio es curar el catalogo, no inventar.
FUENTE_BARRIOS = "catalogo_barrios"

# Un barrio que se llama "Norte" a secas no es un barrio: es el relleno que
# dejaban los seeds viejos y que hacia imposible contar que municipios tienen
# cartografia y cuales no. Se filtran donde entran (OSM, IA) y en la limpieza
# de la base. "Barrio Norte" o "Villa Sur" son nombres reales y pasan; "Distrito
# Norte" o "Zona Suroeste" (los distritos descentralizados de Rosario y afines)
# son un reparto administrativo con nombre cardinal, no un barrio, y no pasan.
NOMBRES_CARDINALES = frozenset({
    "norte", "sur", "este", "oeste",
    "noreste", "noroeste", "sureste", "suroeste", "sudeste", "sudoeste",
})
PREFIJOS_REPARTO = ("distrito ", "zona ", "region ", "sector ", "area ")

# Cuanto se guarda por municipio en `catalogo_geo_osm`. El alta usa un pool
# deduplicado por calle (ver armar()), asi que guardar 2.400 tramos de Lujan
# no aporta: con 400 calles y 400 direcciones distintas sobra para 50 reclamos
# variados y la tabla entera del pais pesa decenas de MB, no GB.
TOPE_CATALOGO_CALLES = 400
TOPE_CATALOGO_DIRECCIONES = 400
FUENTE_OSM = "OpenStreetMap (Overpass API) -- ODbL"
# La misma data, leida del extracto por pais de Geofabrik en vez de pedirla a
# Overpass (`scripts/geo/extraer_osm_pbf.py`): sin cupos, sin mirrors caidos,
# sin topes por salida. Se distingue en la columna `fuente` para saber que
# camino curo cada fila.
FUENTE_PBF = "OpenStreetMap (extracto Geofabrik) -- ODbL"


def es_cardinal(nombre: str) -> bool:
    n = _norm(nombre or "")
    for prefijo in PREFIJOS_REPARTO:
        if n.startswith(prefijo):
            # "Centro" solo es un barrio real; "Distrito Centro" es el reparto.
            resto = n[len(prefijo):].strip()
            return resto in NOMBRES_CARDINALES or resto == "centro"
    return n in NOMBRES_CARDINALES


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


async def barrios_del_catalogo(db, catalogo_id: str) -> list[dict]:
    """Los barrios del municipio, con su contorno cuando lo tienen, desde
    `catalogo_barrios` (ver FUENTE_BARRIOS).

    Se busca por el id del catalogo de municipios —ya resuelto un paso antes,
    junto con el contorno— y no por geometria ni por nombre: el script que
    llena la tabla ya asigno cada barrio al municipio cuyo contorno lo
    contiene, y repetir la busqueda aca reabriria los homonimos.

    Solo las filas `hoja = 1`: la tabla guarda tambien las grafias repetidas,
    los contenedores cubiertos por sus barrios y los puntos que caen adentro
    de un contorno dibujado (`hoja = 0`, con su `motivo_hoja`), pero el mapa
    de la demo muestra una capa sola. Quien decide que es hoja es
    `scripts/geo/_hojas.py`, offline; aca solo se lee la marca.

    Si la tabla todavia no existe en el ambiente (prod antes de la promocion)
    devuelve la lista vacia: la demo nace sin barrios y la bitacora lo dice;
    crear una demo no puede romperse por una tabla de catalogo. Si existe la
    tabla pero no la columna `hoja` (prod entre la copia y el ALTER) se leen
    todas las filas, como antes de la regla.
    """
    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError

    consulta = ("SELECT nombre, tipo, lat, lon, poligono, fuente FROM catalogo_barrios "
                "WHERE municipio_catalogo_id = :id{filtro} ORDER BY nombre")
    try:
        try:
            filas = (await db.execute(text(consulta.format(filtro=" AND hoja = 1")),
                                      {"id": catalogo_id})).fetchall()
        except SQLAlchemyError as e:
            if "hoja" not in str(e):
                raise
            logger.warning("catalogo_barrios sin la columna hoja: se leen todas las filas")
            filas = (await db.execute(text(consulta.format(filtro="")),
                                      {"id": catalogo_id})).fetchall()
    except SQLAlchemyError as e:
        logger.warning("catalogo_barrios no disponible (%s): la demo nace sin barrios", e)
        return []

    barrios = []
    for nombre, tipo, la, ln, poly, fuente in filas:
        if es_cardinal(nombre):
            continue
        anillo = _anillo(poly)
        if (la is None or ln is None) and anillo:
            la, ln = _centroide(anillo)
        if la is None or ln is None:
            continue
        barrios.append({"nombre": nombre, "tipo": tipo or "suburb",
                        "lat": float(la), "lon": float(ln),
                        "poligono": json.dumps(anillo) if anillo else None,
                        "fuente": fuente})
    return barrios


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
        if tags.get("place") and tags.get("name"):
            # `and name`: por la salida `.dir` entran nodos con altura que ademas
            # traen un `place` sin nombre (place=house, locality...). Sin el
            # chequeo, uno solo de esos tiraba abajo el parseo de toda la ciudad.
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
            "SELECT estado, datos, barrios, calles, direcciones, curado_en, fuente "
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
                  "fuente": fila[6] or FUENTE_OSM,
                  "curado_en": fila[5].isoformat() if fila[5] else None})
    return datos


async def guardar_catalogo_geo(db, fila_catalogo: dict, pais: str, datos: dict,
                               estado: Optional[str] = None,
                               detalle: Optional[str] = None,
                               fuente: str = FUENTE_OSM) -> str:
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
        "det": (detalle or "")[:300] or None, "f": fuente,
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


def _anillo(poligono) -> Optional[list]:
    """El contorno como lista de [lon, lat], venga como lista o como JSON."""
    if isinstance(poligono, str):
        try:
            poligono = json.loads(poligono)
        except (ValueError, TypeError):
            return None
    if isinstance(poligono, list) and len(poligono) >= 3:
        return poligono
    return None


def _centroide(anillo: list) -> tuple[float, float]:
    """(lat, lon) del promedio de los vertices: alcanza para el marcador del
    centro de una zona, que es lo unico que se hace con el."""
    n = len(anillo)
    return (sum(float(p[1]) for p in anillo) / n, sum(float(p[0]) for p in anillo) / n)


def zona_unica(lat: Optional[float], lon: Optional[float], poligono=None) -> dict:
    """La unica zona de un municipio sin division: el contorno entero (ver
    ZONA_UNICA). Sin centro explicito se usa el centroide del contorno."""
    anillo = _anillo(poligono)
    if (lat is None or lon is None) and anillo:
        lat, lon = _centroide(anillo)
    return {"nombre": ZONA_UNICA, "tipo": "zona_unica", "lat": lat, "lon": lon,
            "poligono": json.dumps(anillo) if anillo else None}


def zona_de(punto: tuple[float, float], zonas: list[dict],
            anillos: Optional[list] = None) -> Optional[dict]:
    """A que zona pertenece un punto: la que lo CONTIENE si tiene contorno; si
    ninguna lo contiene, la mas cercana por centro. Con una sola zona no hay
    nada que medir. Es la misma regla para reclamos y para barrios: asi el
    barrio y los reclamos que caen en el quedan en la misma zona.

    `anillos` son los contornos ya parseados, uno por zona (ver
    `anillos_de`): el padron los trae como JSON de hasta 150 KB y parsearlos
    por cada uno de los 90 puntos de una demo es trabajo tirado."""
    if not zonas:
        return None
    if len(zonas) == 1:
        return zonas[0]
    if anillos is None:
        anillos = anillos_de(zonas)
    for z, anillo in zip(zonas, anillos):
        if anillo and _dentro((punto[1], punto[0]), anillo):
            return z
    con_centro = [z for z in zonas if z.get("lat") is not None and z.get("lon") is not None]
    return _cerca(punto, con_centro)


def anillos_de(zonas: list[dict]) -> list:
    return [_anillo(z.get("poligono")) for z in zonas]


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
        anillo = _anillo(loc.get("poligono"))
        jlat, jlon = lat, lon
        for _ in range(12):
            c_lat = lat + (rnd.random() - 0.5) * 0.008
            c_lon = lon + (rnd.random() - 0.5) * 0.008
            if anillo is None or dentro((c_lon, c_lat), anillo):
                jlat, jlon = c_lat, c_lon
                break
        # Con la zona unica la "localidad" es el municipio entero: la
        # direccion textual es el nombre del municipio, no el de la zona.
        puntos.append({
            "lat": round(jlat, 6), "lon": round(jlon, 6),
            "calle": None, "altura": None,
            "direccion": loc.get("direccion") or loc["nombre"],
            "fuente": "localidad_padron",
            "zona_nombre": loc["nombre"], "barrio": None,
        })
    return puntos


def barrio_de(punto: tuple[float, float], barrios: list[dict],
              anillos: Optional[list] = None) -> Optional[dict]:
    """A que barrio pertenece un punto: el que lo CONTIENE si tiene contorno;
    si ninguno lo contiene, el mas cercano por centro a MAX_KM_BARRIO o menos;
    mas lejos, ninguno (el punto no es "de" ese barrio, y se dice)."""
    if not barrios:
        return None
    if anillos is None:
        anillos = anillos_de(barrios)
    # Si lo contienen varios (una localidad de georef que envuelve a un barrio
    # de OSM), gana el MAS CHICO: es el mas especifico.
    contienen = [(b, anillo) for b, anillo in zip(barrios, anillos)
                 if anillo and _dentro((punto[1], punto[0]), anillo)]
    if contienen:
        return min(contienen, key=lambda ba: _area(ba[1]))[0]
    return _cerca(punto, barrios, MAX_KM_BARRIO)


def _area(anillo) -> float:
    """Area (en grados cuadrados, solo para comparar) por la formula del
    zapatero. No hace falta proyectar: se compara entre anillos vecinos."""
    n = len(anillo)
    if n < 3:
        return 0.0
    s = 0.0
    for i in range(n):
        x1, y1 = anillo[i][0], anillo[i][1]
        x2, y2 = anillo[(i + 1) % n][0], anillo[(i + 1) % n][1]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def armar(nombre_municipio: str, osm: dict, cantidad_puntos: int,
          centro: Optional[tuple[float, float]] = None,
          barrios_catalogo: Optional[list[dict]] = None,
          poligono=None) -> dict:
    """Zona unica, barrios y puntos listos para la semilla. Todo determinista.

    Aca NO se fabrica geografia (Lucas, 2026-09-03): la zona es la unica
    (ZONA_UNICA, con el contorno del municipio), los barrios son los de
    `barrios_catalogo` tal cual vienen —todos, con su contorno— y lo unico
    que se GENERA son los puntos de los reclamos: direcciones reales de OSM,
    cada una colgada del barrio que la contiene.

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

    # EL CENTRO DE LA ZONA UNICA ES EL CASCO. El punto del catalogo es el
    # centroide del PARTIDO, no el del casco urbano: en Lujan cae 4 km al oeste
    # de la ciudad. El place `town` de OSM con el nombre del municipio SI es el
    # centro de la ciudad; si no esta, el centro del alta; si tampoco, el
    # centroide del contorno (lo resuelve zona_unica).
    objetivo = _norm(nombre_municipio)
    propio = next((p for p in places
                   if p["tipo"] in PLACES_ZONA and _norm(p["nombre"]) == objetivo), None)
    c = (propio["lat"], propio["lon"]) if propio else (centro or (None, None))
    zonas = [zona_unica(c[0], c[1], poligono)]

    degradacion: Optional[str] = None
    if not (places or calles or direcciones):
        degradacion = "sin_geografia_en_osm"

    # Los barrios, del catalogo y completos. Todos cuelgan de la zona unica:
    # es la jerarquia municipio -> zona -> barrio que el mapa y el ABM de
    # zonas necesitan, y el municipio despues reparte los barrios entre las
    # zonas que el defina.
    barrios = [{**b, "zona_nombre": ZONA_UNICA}
               for b in sin_cardinales(barrios_catalogo or [])]
    anillos_barrios = anillos_de(barrios)

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

    # Cada punto cuelga de la zona unica y del barrio que lo CONTIENE (por
    # contorno); si el barrio no tiene contorno, el mas cercano a 3 km; mas
    # lejos, sin barrio. Nunca se le inventa uno.
    puntos = []
    for p in candidatos[:cantidad_puntos]:
        barrio = barrio_de((p["lat"], p["lon"]), barrios, anillos_barrios)
        puntos.append({**p,
                       "zona_nombre": ZONA_UNICA,
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
        "barrios_en_fuente": len(barrios_catalogo or []),
        "barrios_con_contorno": sum(1 for a in anillos_barrios if a),
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
    # --- zona: UNA, siempre, con el contorno del municipio ---
    # La zona es un criterio del NEGOCIO (define la cuadrilla, la arma el
    # municipio), no de la georreferencia (Lucas, 2026-09-03). La cadena es
    # municipio -> Zona unica -> barrios, y la semilla no inventa una division
    # que el municipio no tiene. No es degradacion: es el diseno.
    with _paso("geo:zonas") as pzz:
        zonas_oficiales = [zona_unica(lat, lon, anillo)]
        fuente_zonas = "zona_unica"
        pzz.ok(zonas=1, fuente=fuente_zonas, con_contorno=1 if anillo else 0,
               nota="una zona con el contorno del municipio; el municipio "
                    "reparte los barrios en las suyas desde Zonas")

    # --- barrios: de la tabla curada offline, NUNCA de la red ---
    # `catalogo_barrios` se llena con scripts/geo/catalogo_barrios_pbf.py
    # (PBF de Geofabrik + localidades de georef). Aca se LEEN, todos, con su
    # contorno cuando lo tienen. Sin filas, la demo nace con la zona unica y
    # sin barrios: se avisa, no se rellena.
    with _paso("geo:barrios") as pb:
        barrios_catalogo = (await barrios_del_catalogo(db, fila["id"])) if fila else []
        con_contorno = sum(1 for b in barrios_catalogo if b["poligono"])
        if barrios_catalogo:
            pb.ok(barrios=len(barrios_catalogo), con_contorno=con_contorno,
                  fuente=FUENTE_BARRIOS,
                  nombres=[b["nombre"] for b in barrios_catalogo][:15])
        else:
            pb.degradado("municipio sin barrios en catalogo_barrios: correr "
                         "scripts/geo/catalogo_barrios_pbf.py para su provincia",
                         catalogo_id=fila["id"] if fila else None, fuente=None)
    barrios_oficiales = [{**b, "zona_nombre": ZONA_UNICA}
                         for b in sin_cardinales(barrios_catalogo)]

    def _puntos_sin_calles() -> list[dict]:
        # Reclamos con lat/lng REAL aunque no haya calles: dentro de los
        # contornos de los barrios (o en su centro) cuando el catalogo los
        # tiene, y si no, dentro del contorno del municipio alrededor del
        # centro del alta. Cada punto sabe de que barrio es.
        if barrios_oficiales:
            puntos = _puntos_por_localidad(nombre, barrios_oficiales, cantidad_puntos)
            for p in puntos:
                p["barrio"], p["zona_nombre"] = p["zona_nombre"], ZONA_UNICA
                p["direccion"] = f"{nombre} - {p['barrio']}"
            return puntos
        if lat is None or lon is None:
            return []
        puntos = _puntos_por_localidad(
            nombre, [{"nombre": nombre, "lat": lat, "lon": lon, "poligono": anillo}],
            cantidad_puntos)
        for p in puntos:
            p["zona_nombre"] = ZONA_UNICA
        return puntos

    def _sin_cartografia(motivo: str) -> dict:
        # La demo nace igual: zona unica, los barrios del catalogo y reclamos
        # con lat/lng dentro de ellos. Es DEGRADADO y no fallo: 'fallo' ponia
        # la bitacora en rojo y el 2026-09-02 se leyo como "las demos fallan"
        # cuando no fallaban.
        return {**vacio, "zonas": zonas_oficiales, "barrios": barrios_oficiales,
                "puntos": _puntos_sin_calles(),
                "poligono": anillo,
                "fuente_poligono": "municipios_catalogo" if anillo else None,
                "fuente_zonas": fuente_zonas, "fuente_barrios": FUENTE_BARRIOS,
                "barrios_en_fuente": len(barrios_catalogo),
                "barrios_con_contorno": con_contorno,
                "degradacion": motivo}

    if not anillo:
        # Sin contorno no hay cartografia de calles que buscar, pero el mapa
        # no se pierde: zona unica sin contorno (la jerarquia la necesita),
        # los barrios que el catalogo tenga, y los reclamos dentro de ellos o
        # alrededor del centro del alta. Precision honesta de "centro del pueblo".
        return _sin_cartografia("sin_poligono_en_catalogo")

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

    # --- los puntos: lo UNICO que se genera ---
    with _paso("geo:puntos") as pp:
        centro = (lat, lon) if lat is not None and lon is not None else None
        armado = armar(nombre, osm, cantidad_puntos, centro=centro,
                       barrios_catalogo=barrios_catalogo, poligono=anillo)
        detalle = {
            "zonas": len(armado["zonas"]),
            "barrios": len(armado["barrios"]),
            "puntos": len(armado["puntos"]),
            "puntos_con_altura_real": armado["con_altura_real"],
            "puntos_con_barrio": sum(1 for p in armado["puntos"] if p["barrio"]),
            "calles_ejemplo": [p["direccion"] for p in armado["puntos"][:8]],
        }
        if armado["degradacion"]:
            pp.degradado(armado["degradacion"], **detalle)
        else:
            pp.ok(**detalle)

    # SIN CALLES NO SE PIERDE EL MAPA (Lucas, 2026-09-03): si OSM no dio
    # calles ni direcciones, los reclamos igual llevan lat/lng dentro de los
    # barrios REALES del catalogo. NADA de esto bloquea la demo: nace con
    # puntos, mapa y heatmap; la precision de calle llega con la curacion
    # offline y queda avisado en la bitacora para curar a mano.
    if not armado["puntos"]:
        armado["puntos"] = _puntos_sin_calles()
        armado["degradacion"] = (armado["degradacion"]
                                 or "sin_calles_osm_reclamos_a_nivel_barrio")

    return {**armado, "poligono": anillo,
            "fuente_poligono": "municipios_catalogo",
            "fuente_zonas": fuente_zonas,
            "fuente_barrios": FUENTE_BARRIOS}
