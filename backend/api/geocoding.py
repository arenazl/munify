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
import time
from typing import Any

router = APIRouter()

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"

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
