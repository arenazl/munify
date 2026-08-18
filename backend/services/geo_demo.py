# -*- coding: utf-8 -*-
"""Puntos REALES dentro de un municipio, para que la demo hable de SU ciudad.

EL PROBLEMA
-----------
Hasta hoy la semilla de demos inventaba las direcciones ("Calle Guemes al 400")
y las ubicaba con un offset fijo sobre el centro del municipio. En una demo de
Asuncion eso muestra calles que no existen y chinches en el rio Paraguay. Para
vender, la pantalla tiene que decir el nombre de una calle que el intendente
reconozca.

LA IDEA
-------
No hace falta ninguna base de calles de Latinoamerica. Ya conocemos el AREA del
municipio, asi que:

    sortear N coordenadas DENTRO del area  ->  N consultas de reverse geocoding

Son ~20 llamadas por demo contra un servicio que ya proxeamos, en vez de un
callejero gigante que habria que mantener.

LAS CUATRO SUTILEZAS QUE LO HACEN FUNCIONAR
-------------------------------------------
1. **Dentro del POLIGONO, no del rectangulo.** El bounding box de Asuncion es
   mitad rio y mitad Lambare. Se sortea sobre el bbox y se descarta lo que no
   pasa la prueba de punto-en-poligono.
2. **Repartido por distrito, no libre.** Veinte puntos al azar sobre la ciudad
   entera se apelotonan por casualidad y dejan distritos vacios --- justo lo que
   arruina el mapa. Se reparten proporcionalmente al area de cada uno.
3. **Sin calle cerca, se descarta.** Si el reverse cae en un descampado y no
   devuelve `road`, ese punto no sirve: se sortea otro. Nunca se inventa una
   direccion para rellenar (regla dura: dato real o NULL, jamas un plausible).
4. **El distrito sale gratis.** El punto ya cayo dentro de un poligono conocido,
   asi que el reclamo nace sabiendo su zona sin ningun post-proceso.

REPRODUCIBLE A PROPOSITO
------------------------
El sorteo va con semilla derivada del nombre del municipio: la demo de Asuncion
sale SIEMPRE igual. Si un vendedor la muestra dos veces, no cambia abajo de los
pies, y el cache en disco vale.

COSTO Y CACHE
-------------
Nominatim pide un pedido por segundo, asi que 20 puntos son ~22 segundos: eso NO
puede pasar dentro del request que crea la demo. Por eso se genera una vez por
municipio y se guarda en `scripts/semillas/datos/puntos_<muni>.json`. La segunda
demo de la misma ciudad es instantanea y no toca la red.

FUENTE / LICENCIA
-----------------
  https://nominatim.openstreetmap.org/reverse -- ODbL, (c) OpenStreetMap contributors
"""
from __future__ import annotations

import asyncio
import json
import math
import random
import re
import unicodedata
from pathlib import Path
from typing import Iterable, Optional

CACHE_DIR = Path(__file__).resolve().parent.parent / "scripts" / "semillas" / "datos"
INFONA = Path(__file__).resolve().parent.parent / "scripts" / "datos" / "infona_distritos_py.geojson"
NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
UA = "Munify/1.0 (semilla de demos municipales; https://munify.com.ar)"

# Nominatim exige 1 req/seg. Se respeta con margen: que nos bloqueen el User-Agent
# dejaria sin direcciones a TODAS las demos.
PAUSA_SEG = 1.1
# Tope de sorteos por punto util. Un poligono con mucho vacio (costa, reserva)
# gasta intentos; sin tope, un municipio raro colgaria la generacion.
INTENTOS_POR_PUNTO = 8


# ==========================================================================
# Geometria
# ==========================================================================

def dentro(punto: tuple[float, float], anillo: list) -> bool:
    """Punto-en-poligono por ray casting. `punto` y `anillo` en [lon, lat]."""
    x, y = punto
    adentro = False
    n = len(anillo)
    for i in range(n):
        x1, y1 = anillo[i][0], anillo[i][1]
        x2, y2 = anillo[(i + 1) % n][0], anillo[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1:
            adentro = not adentro
    return adentro


def _bbox(anillo: list) -> tuple[float, float, float, float]:
    xs = [p[0] for p in anillo]
    ys = [p[1] for p in anillo]
    return min(xs), min(ys), max(xs), max(ys)


def _area(anillo: list) -> float:
    """Area del anillo por la formula del agrimensor, corregida por latitud.

    En grados crudos un poligono cerca del ecuador y otro cerca del polo no son
    comparables; como esto solo se usa para REPARTIR puntos entre distritos de
    una misma ciudad, alcanza con el coseno de la latitud media.
    """
    if len(anillo) < 3:
        return 0.0
    s = 0.0
    for i in range(len(anillo)):
        x1, y1 = anillo[i][0], anillo[i][1]
        x2, y2 = anillo[(i + 1) % len(anillo)][0], anillo[(i + 1) % len(anillo)][1]
        s += x1 * y2 - x2 * y1
    lat_media = sum(p[1] for p in anillo) / len(anillo)
    return abs(s) / 2.0 * math.cos(math.radians(lat_media))


def circulo(lat: float, lon: float, radio_km: float = 3.0, lados: int = 48) -> list:
    """Area aproximada cuando NO hay poligono real.

    Es un fallback declarado: el llamador se entera por el nombre de la fuente y
    decide si le sirve. No se disfraza de limite oficial.
    """
    dlat = radio_km / 111.0
    dlon = radio_km / (111.0 * max(math.cos(math.radians(lat)), 0.1))
    return [[round(lon + dlon * math.cos(2 * math.pi * i / lados), 6),
             round(lat + dlat * math.sin(2 * math.pi * i / lados), 6)] for i in range(lados)]


# ==========================================================================
# De donde salen las areas
# ==========================================================================

def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace(".", " ").split())


def _slug(texto: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _norm(texto)).strip("-")[:60]


def _anillos(geom: dict) -> list[list]:
    t, c = geom.get("type"), geom.get("coordinates") or []
    if t == "Polygon":
        return [c[0]] if c else []
    if t == "MultiPolygon":
        return [p[0] for p in c if p]
    return []


def areas_infona(nombre_municipio: str, cod_dpto: Optional[str] = None) -> list[dict]:
    """Distritos oficiales paraguayos del municipio, desde el GeoJSON del INFONA.

    Se lee del archivo (38 MB) y por eso NO se llama desde un request: esto vive
    en el script de precalentado. Asuncion trae sus 6 distritos; una ciudad
    chica, uno solo con el nombre del municipio.
    """
    if not INFONA.exists():
        return []
    objetivo = _norm(nombre_municipio)
    fs = json.loads(INFONA.read_text(encoding="utf-8"))["features"]

    def coincide(nom: str) -> bool:
        # POR PALABRA COMPLETA, no por substring: 'Ita' es un municipio real y
        # con contencion cruda se llevaria puestos a Itaugua, Itakyry e Ita Corá.
        # Solo se acepta el nombre exacto o el nombre como palabra dentro del
        # distrito ('Sta. Maria de ASUNCION').
        return nom == objetivo or re.search(rf"\b{re.escape(objetivo)}\b", nom) is not None

    candidatos = []
    for f in fs:
        p = f.get("properties") or {}
        nom = _norm(p.get("nom_dist") or "")
        if cod_dpto:
            if (p.get("cod_dpto") or "").upper() != cod_dpto.upper():
                continue
        elif not coincide(nom):
            continue
        candidatos.append((nom == objetivo, p, f))

    # Si alguno se llama EXACTAMENTE como el municipio, es ese y no sus vecinos:
    # 'San Pedro' no tiene por que arrastrar a 'San Pedro del Parana'. Sin
    # exacto quedan los parciales, y ahi desambigua `cod_dpto`.
    exactos = [c for c in candidatos if c[0]]
    out: list[dict] = []
    for _, p, f in (exactos or candidatos):
        for anillo in _anillos(f.get("geometry") or {}):
            if len(anillo) >= 3:
                out.append({"nombre": (p.get("nom_dist") or "").title(), "anillo": anillo})
    return out


def areas_desde_zonas(zonas: Iterable[dict]) -> list[dict]:
    """Areas a partir de las zonas ya cargadas en la base del municipio.

    Es la fuente PREFERIDA en runtime: si el municipio ya tiene sus distritos
    con poligono (como Asuncion), no hace falta abrir ningun archivo ni salir a
    la red. `zonas` son dicts con `id`, `nombre` y `poligono` (JSON [lon, lat]).
    """
    out: list[dict] = []
    for z in zonas:
        poly = z.get("poligono")
        if isinstance(poly, str):
            try:
                poly = json.loads(poly)
            except (ValueError, TypeError):
                continue
        if isinstance(poly, list) and len(poly) >= 3:
            out.append({"nombre": z.get("nombre"), "zona_id": z.get("id"), "anillo": poly})
    return out


# ==========================================================================
# El sorteo
# ==========================================================================

def repartir(areas: list[dict], cantidad: int) -> list[int]:
    """Cuantos puntos le tocan a cada area, proporcional a su superficie.

    Con un minimo de 1 por area mientras alcancen los puntos: un distrito vacio
    en el mapa de la demo se lee como 'no hay datos', que es peor que uno flojo.
    """
    if not areas or cantidad <= 0:
        return [0] * len(areas)
    supers = [max(_area(a["anillo"]), 1e-12) for a in areas]
    total = sum(supers)
    if cantidad < len(areas):
        # Menos puntos que areas: se los quedan las mas grandes.
        cupos = [0] * len(areas)
        for i in sorted(range(len(areas)), key=lambda i: -supers[i])[:cantidad]:
            cupos[i] = 1
        return cupos
    cupos = [max(1, round(cantidad * s / total)) for s in supers]
    while sum(cupos) > cantidad:
        cupos[cupos.index(max(cupos))] -= 1
    while sum(cupos) < cantidad:
        cupos[cupos.index(min(cupos))] += 1
    return cupos


def _sortear_en(anillo: list, rnd: random.Random,
                tambien: Optional[list] = None) -> Optional[tuple[float, float]]:
    """Un punto al azar dentro del anillo, por rechazo sobre el bounding box.

    Con `tambien`, el punto ademas tiene que caer en ese segundo anillo: es como
    se pide "dentro del distrito Y dentro del nucleo urbano" sin calcular la
    interseccion de los dos poligonos.
    """
    x0, y0, x1, y1 = _bbox(anillo)
    if tambien:  # el rechazo se hace sobre el MENOR de los dos rectangulos
        a0, b0, a1, b1 = _bbox(tambien)
        x0, y0, x1, y1 = max(x0, a0), max(y0, b0), min(x1, a1), min(y1, b1)
        if x0 >= x1 or y0 >= y1:
            return None  # no se tocan
    for _ in range(400):  # el bbox de un area con costa es medio agua
        lon, lat = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if dentro((lon, lat), anillo) and (not tambien or dentro((lon, lat), tambien)):
            return round(lat, 6), round(lon, 6)
    return None


# Cuanto del sorteo se concentra en el nucleo urbano y hasta donde llega ese
# nucleo. Medido en Caacupe, que es el caso tipico de esta app (pueblo chico con
# mucho campo): sorteando uniforme sobre el distrito, 2 de 8 puntos daban calle
# y una era una ruta interurbana; sorteando dentro de 1,5 km del centro, 5 de 8
# y ninguna ruta --- calles con nombre que el intendente reconoce. El 30% que
# queda afuera es a proposito: la periferia tambien tiene reclamos y un mapa con
# todo apilado en el centro tampoco convence.
PROP_NUCLEO = 0.7
RADIO_NUCLEO_KM = 2.0


def sortear_puntos(areas: list[dict], cantidad: int, semilla: str,
                   nucleo: Optional[tuple[float, float]] = None,
                   radio_nucleo_km: float = RADIO_NUCLEO_KM,
                   prop_nucleo: float = PROP_NUCLEO) -> list[dict]:
    """Coordenadas al azar DENTRO de cada area, repartidas por superficie.

    Si se pasa el `nucleo` (lat, lon del centro de la ciudad), la mayoria de los
    puntos se sortea alrededor de el, que es donde estan las calles mapeadas.
    En una capital como Asuncion da casi igual --- todos sus distritos son
    urbanos ---; en un pueblo con mucho campo es la diferencia entre una demo
    con calles del centro y una con rutas provinciales.
    """
    rnd = random.Random(_slug(semilla))
    circ = circulo(nucleo[0], nucleo[1], radio_nucleo_km) if nucleo else None
    puntos: list[dict] = []
    for area, cupo in zip(areas, repartir(areas, cantidad)):
        en_nucleo = round(cupo * prop_nucleo) if circ else 0
        for i in range(cupo):
            # Si el area ni toca el nucleo (un distrito del otro extremo), el
            # sorteo acotado devuelve None y se cae al uniforme: nadie queda sin
            # su cupo por estar lejos del centro.
            par = _sortear_en(area["anillo"], rnd, tambien=circ) if i < en_nucleo else None
            par = par or _sortear_en(area["anillo"], rnd)
            if par:
                puntos.append({"lat": par[0], "lon": par[1],
                               "zona_nombre": area.get("nombre"),
                               "zona_id": area.get("zona_id")})
    return puntos


async def nucleo_urbano(nombre_municipio: str, pais: str = "") -> Optional[tuple[float, float]]:
    """Centro de la ciudad segun Nominatim. Una sola llamada por municipio.

    No sirve el centroide del poligono: en un distrito mayormente rural cae en
    el campo, que es justo donde no hay calles. El centro que devuelve la
    busqueda es el del casco urbano.
    """
    import httpx

    consulta = f"{nombre_municipio}, {pais}".strip().strip(",")
    try:
        async with httpx.AsyncClient(timeout=15.0,
                                     headers={"User-Agent": UA, "Accept-Language": "es"}) as cli:
            r = await cli.get("https://nominatim.openstreetmap.org/search",
                              params={"q": consulta, "format": "json", "limit": 1})
            r.raise_for_status()
            datos = r.json()
        await asyncio.sleep(PAUSA_SEG)
        return (float(datos[0]["lat"]), float(datos[0]["lon"])) if datos else None
    except Exception:  # noqa: BLE001 -- sin nucleo se sortea uniforme, que igual anda
        return None


# ==========================================================================
# La direccion real
# ==========================================================================

def direccion_de(datos: dict) -> Optional[dict]:
    """Del JSON de Nominatim a lo que la semilla necesita. None si no hay calle.

    Sin `road` no hay direccion que mostrar, y NO se rellena con la ciudad ni
    con un numero inventado: se descarta el punto y se sortea otro.
    """
    a = datos.get("address") or {}
    calle = a.get("road") or a.get("pedestrian") or a.get("footway")
    if not calle:
        return None
    altura = a.get("house_number")
    return {
        "direccion": f"{calle} {altura}" if altura else calle,
        "calle": calle,
        "altura": altura,
        "barrio": a.get("suburb") or a.get("neighbourhood") or a.get("quarter"),
        "ciudad": a.get("city") or a.get("town") or a.get("village"),
    }


async def resolver_direcciones(puntos: list[dict], areas: Optional[list[dict]] = None,
                               semilla: str = "munify", verbose: bool = False,
                               stats: Optional[dict] = None,
                               circ_nucleo: Optional[list] = None) -> list[dict]:
    """Reverse geocoding de cada punto, descartando los que no dan calle.

    Va de a uno y con pausa a proposito: Nominatim es un servicio publico y
    paralelizarlo es la forma mas rapida de que nos corten el User-Agent.
    """
    import httpx

    rnd = random.Random(_slug(semilla) + "-retry")
    por_nombre = {a.get("nombre"): a for a in (areas or [])}
    # Una calle repetida en dos reclamos de la demo se nota y se lee como dato
    # sintetico. Si ya salio, se descarta el punto y se sortea otro.
    calles_usadas: set[str] = set()
    resueltos: list[dict] = []
    llamadas = 0
    async with httpx.AsyncClient(timeout=10.0,
                                 headers={"User-Agent": UA, "Accept-Language": "es"}) as cli:
        for i, punto in enumerate(puntos):
            actual = punto
            for _ in range(INTENTOS_POR_PUNTO):
                try:
                    r = await cli.get(NOMINATIM, params={
                        "format": "json", "zoom": 18, "addressdetails": 1,
                        "lat": actual["lat"], "lon": actual["lon"]})
                    llamadas += 1
                    r.raise_for_status()
                    dir_ = direccion_de(r.json())
                except Exception as e:  # noqa: BLE001 -- red caida: se sigue con el resto
                    if verbose:
                        print(f"  [{i:2}] error {type(e).__name__}: {e}")
                    dir_ = None
                await asyncio.sleep(PAUSA_SEG)
                if dir_ and _norm(dir_["calle"]) not in calles_usadas:
                    calles_usadas.add(_norm(dir_["calle"]))
                    resueltos.append({**actual, **dir_, "fuente": "nominatim"})
                    if verbose:
                        print(f"  [{i:2}] {dir_['direccion']:44} {actual['zona_nombre']}")
                    break
                # Cayo en la nada (o en una calle repetida): se sortea otro punto
                # de la MISMA area, asi descartar no desbalancea el reparto.
                area = por_nombre.get(actual.get("zona_nombre"))
                if not area:
                    break
                # El reintento respeta el mismo sesgo que el sorteo original. Sin
                # esto el sesgo se evapora: con tasa de descarte alta, casi todos
                # los puntos finales salen de reintentos y volverian a ser
                # uniformes sobre el distrito entero.
                par = None
                if circ_nucleo is not None and rnd.random() < PROP_NUCLEO:
                    par = _sortear_en(area["anillo"], rnd, tambien=circ_nucleo)
                par = par or _sortear_en(area["anillo"], rnd)
                if not par:
                    break
                actual = {**actual, "lat": par[0], "lon": par[1]}
            else:
                if verbose:
                    print(f"  [{i:2}] sin calle nueva tras {INTENTOS_POR_PUNTO} intentos, se omite")
    # El costo real se informa hacia afuera: cada llamada es un segundo de
    # espera y un pedido a un servicio publico gratuito.
    if stats is not None:
        stats["llamadas"] = llamadas
    return resueltos


# ==========================================================================
# Cache por municipio
# ==========================================================================

def ruta_cache(nombre_municipio: str) -> Path:
    return CACHE_DIR / f"puntos_{_slug(nombre_municipio)}.json"


def leer_cache(nombre_municipio: str) -> Optional[dict]:
    ruta = ruta_cache(nombre_municipio)
    if not ruta.exists():
        return None
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def guardar_cache(nombre_municipio: str, datos: dict) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ruta = ruta_cache(nombre_municipio)
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    return ruta


async def generar(nombre_municipio: str, areas: list[dict], cantidad: int = 60,
                  verbose: bool = False, pais: str = "",
                  nucleo: Optional[tuple[float, float]] = None) -> dict:
    """Sortea, geocodea y devuelve el paquete listo para cachear."""
    if nucleo is None:
        nucleo = await nucleo_urbano(nombre_municipio, pais)
        if verbose:
            print(f"nucleo urbano: {nucleo or 'no resuelto, se sortea uniforme'}")
    puntos = sortear_puntos(areas, cantidad, semilla=nombre_municipio, nucleo=nucleo)
    circ = circulo(nucleo[0], nucleo[1], RADIO_NUCLEO_KM) if nucleo else None
    stats: dict = {}
    resueltos = await resolver_direcciones(puntos, areas=areas, semilla=nombre_municipio,
                                           verbose=verbose, stats=stats, circ_nucleo=circ)
    return {
        "municipio": nombre_municipio,
        "pedidos": cantidad,
        "resueltos": len(resueltos),
        "llamadas_nominatim": stats.get("llamadas", 0),
        "areas": [{"nombre": a.get("nombre"), "puntos_del_anillo": len(a["anillo"])}
                  for a in areas],
        "nucleo_urbano": list(nucleo) if nucleo else None,
        "puntos": resueltos,
        "fuente": "OpenStreetMap / Nominatim -- ODbL",
    }


def puntos_para_semilla(nombre_municipio: str, cantidad: int) -> list[dict]:
    """Lo que consume la semilla: puntos ya listos, o lista vacia.

    Devuelve vacio en vez de inventar: si no hay cache, el llamador se queda con
    su comportamiento actual y la demo no miente con direcciones falsas.
    """
    datos = leer_cache(nombre_municipio)
    if not datos:
        return []
    return (datos.get("puntos") or [])[:cantidad]
