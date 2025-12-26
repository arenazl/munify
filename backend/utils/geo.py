"""
Utilidades para cálculos geoespaciales.
"""
import math
from typing import Tuple, Optional


def haversine_distance(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float
) -> float:
    """
    Calcula la distancia en metros entre dos puntos usando la fórmula de Haversine.

    Args:
        lat1: Latitud del punto 1
        lon1: Longitud del punto 1
        lat2: Latitud del punto 2
        lon2: Longitud del punto 2

    Returns:
        Distancia en metros
    """
    # Radio de la Tierra en metros
    R = 6371000

    # Convertir grados a radianes
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # Fórmula de Haversine
    a = (
        math.sin(delta_lat / 2) ** 2 +
        math.cos(lat1_rad) * math.cos(lat2_rad) *
        math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    # Distancia en metros
    distance = R * c

    return distance


def are_locations_close(
    lat1: Optional[float],
    lon1: Optional[float],
    lat2: Optional[float],
    lon2: Optional[float],
    radius_meters: int = 100
) -> bool:
    """
    Determina si dos ubicaciones están dentro de un radio específico.

    Args:
        lat1: Latitud del punto 1 (puede ser None)
        lon1: Longitud del punto 1 (puede ser None)
        lat2: Latitud del punto 2 (puede ser None)
        lon2: Longitud del punto 2 (puede ser None)
        radius_meters: Radio en metros (default: 100m)

    Returns:
        True si están dentro del radio, False si no o si faltan coordenadas
    """
    # Si alguna coordenada es None, no podemos comparar
    if any(coord is None for coord in [lat1, lon1, lat2, lon2]):
        return False

    distance = haversine_distance(lat1, lon1, lat2, lon2)
    return distance <= radius_meters
