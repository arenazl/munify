"""Resolución INVISIBLE de la ubicación de un reclamo (regla del dueño).

Todo reclamo tiene que nacer con coordenadas, pero sin frenarle el flujo al
vecino: si no llegaron del front (sugerencia elegida o GPS silencioso), el
backend las resuelve solo, de mejor a peor:

    direccion / gps   -> vinieron del front (payload) — no se toca nada
    geocodificada     -> Nominatim sobre la dirección tipeada, acotado al
                         país y al radio del municipio
    ip                -> geolocalización aproximada por IP del request
    municipio         -> centroide del municipio (último recurso)

El ORIGEN queda guardado en `reclamos.ubicacion_origen`: la analítica fina
(heatmap, focos) usa solo ubicaciones precisas; `ip` y `municipio` son
aproximadas y se tratan aparte. Así ningún reclamo queda geográficamente
ciego y tampoco se inventan esquinas calientes (regla 11: dato real o nada
presentado como tal).

Todo best-effort con timeouts cortos: una falla externa JAMÁS impide crear
el reclamo.
"""
import logging
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Orígenes de ubicación (de mejor a peor precisión).
ORIGEN_DIRECCION = "direccion"        # sugerencia verificada elegida en el front
ORIGEN_GPS = "gps"                    # geolocalización del dispositivo
ORIGEN_GEOCODIFICADA = "geocodificada"  # Nominatim server-side sobre lo tipeado
ORIGEN_IP = "ip"                      # aproximada por IP del request
ORIGEN_MUNICIPIO = "municipio"        # centroide del muni (último recurso)

# Los orígenes APROXIMADOS no entran a la analítica geográfica fina.
ORIGENES_APROXIMADOS = (ORIGEN_IP, ORIGEN_MUNICIPIO)

_UA = {"User-Agent": "munify-backend/1.0 (geocodificacion de reclamos)"}


async def _geocodificar_direccion(direccion: str, municipio) -> Optional[Tuple[float, float]]:
    """Nominatim search acotado al país y a la caja del municipio."""
    if not (direccion or "").strip():
        return None
    # Caja de busqueda: el radio del muni alrededor de su centro (1 grado
    # de latitud ~ 111 km; alcanza como sesgo, no hace falta precisión).
    delta = max((municipio.radio_km or 10.0), 5.0) / 111.0
    params = {
        "q": f"{direccion}, {municipio.nombre}",
        "format": "json",
        "limit": 1,
        "countrycodes": (municipio.pais or "AR").lower(),
        "viewbox": f"{municipio.longitud - delta},{municipio.latitud + delta},"
                   f"{municipio.longitud + delta},{municipio.latitud - delta}",
        "bounded": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=4.0, headers=_UA) as hc:
            r = await hc.get("https://nominatim.openstreetmap.org/search", params=params)
        if r.status_code == 200 and (data := r.json()):
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        logger.info("[UBICACION] geocodificacion fallo para %r: %s", direccion, e)
    return None


async def _ubicacion_por_ip(ip: Optional[str]) -> Optional[Tuple[float, float]]:
    """Geolocalización aproximada por IP (nivel ciudad). Best-effort."""
    if not ip or ip in ("127.0.0.1", "::1"):
        return None
    try:
        async with httpx.AsyncClient(timeout=3.0, headers=_UA) as hc:
            r = await hc.get(f"http://ip-api.com/json/{ip}", params={"fields": "status,lat,lon"})
        if r.status_code == 200:
            data = r.json()
            if data.get("status") == "success":
                return float(data["lat"]), float(data["lon"])
    except Exception as e:
        logger.info("[UBICACION] ip-api fallo para %s: %s", ip, e)
    return None


async def resolver_ubicacion(
    *,
    municipio,
    direccion: str,
    latitud: Optional[float],
    longitud: Optional[float],
    origen_declarado: Optional[str],
    client_ip: Optional[str],
) -> Tuple[Optional[float], Optional[float], str]:
    """Devuelve (lat, lng, origen). Nunca lanza: el peor caso es el centroide."""
    # 1-2. El front ya trajo coordenadas (sugerencia elegida o GPS silencioso).
    if latitud is not None and longitud is not None:
        origen = origen_declarado if origen_declarado in (ORIGEN_DIRECCION, ORIGEN_GPS) else ORIGEN_DIRECCION
        return latitud, longitud, origen

    # 3. Geocodificar lo tipeado, acotado al municipio.
    coords = await _geocodificar_direccion(direccion, municipio)
    if coords:
        return coords[0], coords[1], ORIGEN_GEOCODIFICADA

    # 4. Aproximada por IP (solo tiene sentido para requests del vecino:
    #    los canales server-to-server pasan client_ip=None).
    coords = await _ubicacion_por_ip(client_ip)
    if coords:
        return coords[0], coords[1], ORIGEN_IP

    # 5. Centroide del municipio: aproximado y marcado como tal.
    return municipio.latitud, municipio.longitud, ORIGEN_MUNICIPIO
