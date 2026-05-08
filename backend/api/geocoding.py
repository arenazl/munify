"""
Proxy server-side para Nominatim (OpenStreetMap).

Existe porque Nominatim devolvió bloquear requests cross-origin desde algunos
orígenes (incluyendo localhost), así que hacer `fetch('https://nominatim...')`
directamente desde el navegador explota con CORS. La solución es que el
backend haga el request server-to-server y devuelva el JSON tal cual al
frontend, sin problemas de CORS.

Dos endpoints:
 - GET /geocoding/search      → forward de /search con todos los query params
 - GET /geocoding/reverse     → forward de /reverse con lat/lon

Uso típico del frontend:
    fetch('/api/geocoding/search?q=San+Martín+1234&viewbox=...&bounded=1')

No se cachea por ahora. Nominatim recomienda ≤1 request/seg — el frontend ya
hace debounce de 400ms, así que en el caso peor (un usuario escribiendo muy
rápido) está en el límite. Si se vuelve un problema podemos:
 - Cachear por query en Redis por unos minutos
 - Meter rate limiting explícito
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
import httpx
import math
import re
import time
import unicodedata
from typing import Any

router = APIRouter()

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
OVERPASS_BASE = "https://overpass-api.de/api/interpreter"

# User-Agent requerido oficialmente por la policy de uso de Nominatim.
# Sin esto pueden bloquearnos.
USER_AGENT = "MunicipalidadReclamosApp/1.0 (sugerenciasMun)"

# Cache en memoria {cache_key: (timestamp, data)}. TTL de 10 minutos. El
# objetivo es no pegarle a Nominatim por cada tecla cuando el usuario escribe
# "cocha", "cochab", "cochaba", etc — muchas van a compartir resultados, o al
# menos las idénticas repetidas caen en el cache. Nominatim tiene policy de
# 1 req/seg y si la violamos nos banean (429). Sin este cache, escribir rápido
# 6 letras = 6 requests → ban temporal.
_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_SEC = 600  # 10 minutos


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > CACHE_TTL_SEC:
        _cache.pop(key, None)
        return None
    return data


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = (time.time(), data)
    # Limpieza lazy: si el cache crece mucho, borrar las 20 entradas más viejas
    if len(_cache) > 500:
        oldest = sorted(_cache.items(), key=lambda kv: kv[1][0])[:20]
        for k, _ in oldest:
            _cache.pop(k, None)


@router.get("/search")
async def geocoding_search(
    q: str = Query(..., min_length=2, description="Query de búsqueda"),
    countrycodes: str = Query("ar"),
    limit: int = Query(15, ge=1, le=50),
    viewbox: str | None = Query(None, description="Viewbox lon_izq,lat_sup,lon_der,lat_inf"),
    bounded: int | None = Query(None, ge=0, le=1),
    street: str | None = Query(None, description="Búsqueda estructurada por calle"),
    state: str | None = Query(None),
    country: str | None = Query(None),
):
    """
    Proxy de `GET https://nominatim.openstreetmap.org/search`.

    Acepta los mismos parámetros que usa nuestro frontend (q, countrycodes,
    limit, viewbox, bounded, street, state, country) y devuelve el array de
    resultados tal cual lo entrega Nominatim.

    Si Nominatim responde con error o timeout, devolvemos 502 para que el
    frontend pueda mostrar un mensaje adecuado. Devolver array vacío en lugar
    de error haría que el usuario no sepa que hay un problema de red.
    """
    params: dict[str, str | int] = {
        "format": "json",
        "q": q,
        "countrycodes": countrycodes,
        "limit": limit,
        "addressdetails": 1,
    }
    if viewbox:
        params["viewbox"] = viewbox
    if bounded is not None:
        params["bounded"] = bounded
    if street:
        params["street"] = street
    if state:
        params["state"] = state
    if country:
        params["country"] = country

    # Cache key estable para esta combinación de parámetros
    cache_key = "search:" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    cached = _cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                f"{NOMINATIM_BASE}/search",
                params=params,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Language": "es",
                },
            )
            response.raise_for_status()
            data = response.json()
            _cache_set(cache_key, data)
            return JSONResponse(content=data)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout contactando Nominatim")
    except httpx.HTTPStatusError as exc:
        # Si Nominatim nos rate-limita (429), devolvemos array vacío en lugar
        # de 502. Así el frontend simplemente muestra "sin resultados" en vez
        # de un error raro. El cache ayuda a que la próxima request con la
        # misma query no vuelva a pegarle.
        if exc.response.status_code == 429:
            return JSONResponse(content=[])
        raise HTTPException(
            status_code=502,
            detail=f"Nominatim devolvió {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Error contactando Nominatim: {exc}")


def _strip_accents(s: str) -> str:
    """Quita tildes para que el regex de Overpass matchee 'centenario' con
    'Centenário' o 'CENTENARIO' indistinto."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def _street_regex(nombre: str) -> str:
    """Genera un regex para matchear nombres de calle en Overpass.

    Acepta variaciones comunes (Av., Avenida, etc) y es case-insensitive.
    Sanitizamos para evitar inyección en la query QL.
    """
    base = _strip_accents(nombre.strip().lower())
    # Permitimos solo letras, espacios y números en el nombre — todo lo demás
    # se descarta para que no se cuele un caracter regex peligroso.
    base = re.sub(r"[^a-z0-9 ]", "", base)
    # Cada palabra del nombre debe aparecer en la calle, en cualquier orden no,
    # mejor: matcheamos el nombre como substring (.*nombre.*).
    return f".*{re.escape(base)}.*"


@router.get("/intersection")
async def geocoding_intersection(
    calle1: str = Query(..., min_length=2, description="Primer nombre de calle"),
    calle2: str = Query(..., min_length=2, description="Segundo nombre de calle"),
    lat: float = Query(..., description="Lat del centro del municipio"),
    lon: float = Query(..., description="Lon del centro del municipio"),
    radius_km: float = Query(15.0, gt=0, le=50),
):
    """Resuelve la intersección de dos calles usando Overpass API.

    Estrategia:
      1. Bounding box de `radius_km` alrededor del centro del municipio.
      2. Query Overpass que devuelve los nodos compartidos por ambas calles
         (`node.na.nb`) — esos nodos son la esquina real en OSM.
      3. Si no hay nodos compartidos, fallback: traer las geometrías de ambas
         y devolver el punto medio entre los dos puntos más cercanos. Esto
         cubre el caso donde OSM tiene las calles cargadas pero sin un nodo
         compartido en la intersección.

    Devuelve `{ lat, lon, display_name }` con la coord de la esquina, o 404
    si no se pudo resolver.
    """
    delta_lat = radius_km / 111.0
    cos_lat = max(0.001, abs(math.cos(math.radians(lat))))
    delta_lon = radius_km / (111.0 * cos_lat)
    south = lat - delta_lat
    north = lat + delta_lat
    west = lon - delta_lon
    east = lon + delta_lon
    bbox = f"{south},{west},{north},{east}"

    n1 = _street_regex(calle1)
    n2 = _street_regex(calle2)

    cache_key = f"intersection:{n1}|{n2}|{bbox}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return JSONResponse(content=cached)

    # Query 1: nodos compartidos (intersección directa en OSM)
    query_shared = (
        "[out:json][timeout:20];"
        f'way["highway"]["name"~"{n1}",i]({bbox});'
        "node(w)->.na;"
        f'way["highway"]["name"~"{n2}",i]({bbox});'
        "node(w)->.nb;"
        "node.na.nb;"
        "out;"
    )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(
                OVERPASS_BASE,
                content=query_shared,
                headers={"User-Agent": USER_AGENT, "Content-Type": "text/plain"},
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])

            if elements:
                # Tomar el nodo más cercano al centro del municipio
                best = min(
                    elements,
                    key=lambda n: (n.get("lat", 0) - lat) ** 2 + (n.get("lon", 0) - lon) ** 2,
                )
                result = {
                    "lat": float(best["lat"]),
                    "lon": float(best["lon"]),
                    "display_name": f"{calle1.strip()} y {calle2.strip()}",
                    "fuente": "overpass_shared_node",
                }
                _cache_set(cache_key, result)
                return JSONResponse(content=result)

            # Fallback: traer geometrías y calcular el punto medio entre los
            # dos puntos más cercanos de cada calle.
            query_geom = (
                "[out:json][timeout:25];"
                f'(way["highway"]["name"~"{n1}",i]({bbox});); out geom;'
                f'(way["highway"]["name"~"{n2}",i]({bbox});); out geom;'
            )
            resp2 = await client.post(
                OVERPASS_BASE,
                content=query_geom,
                headers={"User-Agent": USER_AGENT, "Content-Type": "text/plain"},
            )
            resp2.raise_for_status()
            data2 = resp2.json().get("elements", [])

            # Separar puntos por nombre matcheado
            puntos_a: list[tuple[float, float]] = []
            puntos_b: list[tuple[float, float]] = []
            re1 = re.compile(n1, re.IGNORECASE)
            re2 = re.compile(n2, re.IGNORECASE)
            for el in data2:
                if el.get("type") != "way":
                    continue
                nombre = _strip_accents(el.get("tags", {}).get("name", "").lower())
                geom = el.get("geometry", []) or []
                pts = [(g["lat"], g["lon"]) for g in geom if "lat" in g and "lon" in g]
                if re1.match(nombre):
                    puntos_a.extend(pts)
                if re2.match(nombre):
                    puntos_b.extend(pts)

            if not puntos_a or not puntos_b:
                raise HTTPException(
                    status_code=404,
                    detail="No se encontraron las calles en el área del municipio",
                )

            # Buscar el par (a, b) más cercano entre las dos calles
            mejor_par: tuple[tuple[float, float], tuple[float, float]] | None = None
            mejor_dist = float("inf")
            for a in puntos_a:
                for b in puntos_b:
                    d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
                    if d < mejor_dist:
                        mejor_dist = d
                        mejor_par = (a, b)

            if mejor_par is None:
                raise HTTPException(status_code=404, detail="Sin intersección detectable")

            mid_lat = (mejor_par[0][0] + mejor_par[1][0]) / 2
            mid_lon = (mejor_par[0][1] + mejor_par[1][1]) / 2
            result = {
                "lat": mid_lat,
                "lon": mid_lon,
                "display_name": f"{calle1.strip()} y {calle2.strip()}",
                "fuente": "overpass_closest_pair",
            }
            _cache_set(cache_key, result)
            return JSONResponse(content=result)
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout contactando Overpass")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Overpass devolvió {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Error contactando Overpass: {exc}")


@router.get("/reverse")
async def geocoding_reverse(
    lat: float = Query(..., description="Latitud"),
    lon: float = Query(..., description="Longitud"),
):
    """
    Proxy de `GET https://nominatim.openstreetmap.org/reverse`. Se usa cuando
    el frontend obtiene coords del navegador (geolocalización) y necesita
    convertirlas a una dirección humana.
    """
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                f"{NOMINATIM_BASE}/reverse",
                params={
                    "format": "json",
                    "lat": lat,
                    "lon": lon,
                    "addressdetails": 1,
                },
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Language": "es",
                },
            )
            response.raise_for_status()
            return JSONResponse(content=response.json())
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout contactando Nominatim")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Nominatim devolvió {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Error contactando Nominatim: {exc}")
