"""
Servicio para detectar/matchear barrio desde una dirección.
Cuando un vecino ingresa una dirección, extraemos el barrio y lo matcheamos
con los barrios guardados del municipio.
"""
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models.barrio import Barrio


async def detectar_barrio_desde_direccion(
    db: AsyncSession,
    municipio_id: int,
    direccion: str
) -> Optional[int]:
    """
    Detecta el barrio de una dirección buscando coincidencias con los barrios guardados.

    Estrategia:
    1. Buscar coincidencia exacta del nombre del barrio en la dirección
    2. Buscar coincidencia parcial (el barrio aparece en alguna parte de la dirección)
    3. Si no hay match, retornar None

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio
        direccion: String de dirección ingresada por el usuario

    Returns:
        barrio_id si se encuentra coincidencia, None si no
    """
    if not direccion or not municipio_id:
        return None

    # Normalizar dirección (minúsculas, sin acentos comunes)
    direccion_normalizada = normalizar_texto(direccion)

    # Obtener todos los barrios del municipio
    result = await db.execute(
        select(Barrio)
        .where(Barrio.municipio_id == municipio_id)
        .order_by(func.length(Barrio.nombre).desc())  # Primero los nombres más largos
    )
    barrios = result.scalars().all()

    if not barrios:
        return None

    # Buscar match
    for barrio in barrios:
        nombre_normalizado = normalizar_texto(barrio.nombre)

        # Coincidencia exacta como palabra completa
        if f" {nombre_normalizado} " in f" {direccion_normalizada} ":
            return barrio.id

        # El nombre del barrio aparece al final de la dirección
        if direccion_normalizada.endswith(f" {nombre_normalizado}"):
            return barrio.id

        # El nombre del barrio aparece al principio
        if direccion_normalizada.startswith(f"{nombre_normalizado} "):
            return barrio.id

        # Coincidencia con coma (ej: "Calle 123, Centro")
        if f", {nombre_normalizado}" in direccion_normalizada:
            return barrio.id

        # Coincidencia con guion (ej: "Calle 123 - Centro")
        if f"- {nombre_normalizado}" in direccion_normalizada:
            return barrio.id

    # Segunda pasada: buscar coincidencias parciales más flexibles
    for barrio in barrios:
        nombre_normalizado = normalizar_texto(barrio.nombre)

        # Si el nombre del barrio tiene más de 4 caracteres, buscar como substring
        if len(nombre_normalizado) > 4 and nombre_normalizado in direccion_normalizada:
            return barrio.id

    return None


async def detectar_barrio_con_coordenadas(
    db: AsyncSession,
    municipio_id: int,
    latitud: float,
    longitud: float
) -> Optional[int]:
    """
    Detecta el barrio más cercano a unas coordenadas dadas.

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio
        latitud: Latitud del punto
        longitud: Longitud del punto

    Returns:
        barrio_id del barrio más cercano con coordenadas, None si no hay
    """
    if not latitud or not longitud or not municipio_id:
        return None

    # Obtener barrios con coordenadas válidas
    result = await db.execute(
        select(Barrio)
        .where(
            Barrio.municipio_id == municipio_id,
            Barrio.latitud.isnot(None),
            Barrio.longitud.isnot(None),
            Barrio.validado == True
        )
    )
    barrios = result.scalars().all()

    if not barrios:
        return None

    # Encontrar el barrio más cercano
    barrio_cercano = None
    menor_distancia = float('inf')

    for barrio in barrios:
        distancia = calcular_distancia(latitud, longitud, barrio.latitud, barrio.longitud)
        if distancia < menor_distancia:
            menor_distancia = distancia
            barrio_cercano = barrio

    # Si hay un barrio dentro de 5km, retornarlo
    if barrio_cercano and menor_distancia <= 5.0:
        return barrio_cercano.id

    return None


async def detectar_barrio(
    db: AsyncSession,
    municipio_id: int,
    direccion: str,
    latitud: Optional[float] = None,
    longitud: Optional[float] = None
) -> Optional[int]:
    """
    Función principal que combina detección por texto y coordenadas.

    Estrategia:
    1. Primero intenta detectar por texto de dirección (más preciso si hay match)
    2. Si no hay match por texto y hay coordenadas, usa proximidad geográfica

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio
        direccion: String de dirección
        latitud: Latitud opcional
        longitud: Longitud opcional

    Returns:
        barrio_id si se detecta, None si no
    """
    # Primero intentar por texto
    barrio_id = await detectar_barrio_desde_direccion(db, municipio_id, direccion)

    if barrio_id:
        return barrio_id

    # Si hay coordenadas, intentar por proximidad
    if latitud and longitud:
        barrio_id = await detectar_barrio_con_coordenadas(db, municipio_id, latitud, longitud)

    return barrio_id


def normalizar_texto(texto: str) -> str:
    """
    Normaliza un texto para comparación:
    - Convierte a minúsculas
    - Reemplaza acentos comunes
    - Elimina caracteres especiales
    """
    if not texto:
        return ""

    texto = texto.lower().strip()

    # Reemplazar acentos
    reemplazos = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ü': 'u', 'ñ': 'n',
        'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u',
        'Ü': 'u', 'Ñ': 'n'
    }

    for orig, reempl in reemplazos.items():
        texto = texto.replace(orig, reempl)

    return texto


def calcular_distancia(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calcula la distancia en km entre dos puntos usando la fórmula de Haversine.
    """
    from math import radians, cos, sin, asin, sqrt

    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radio de la Tierra en km
    return c * r


async def obtener_barrio_info(db: AsyncSession, barrio_id: int) -> Optional[dict]:
    """
    Obtiene información de un barrio por ID.
    """
    result = await db.execute(
        select(Barrio).where(Barrio.id == barrio_id)
    )
    barrio = result.scalar_one_or_none()

    if not barrio:
        return None

    return {
        "id": barrio.id,
        "nombre": barrio.nombre,
        "latitud": barrio.latitud,
        "longitud": barrio.longitud,
        "validado": barrio.validado
    }
