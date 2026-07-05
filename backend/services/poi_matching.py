"""Matching geográfico reclamo <-> Punto de Interés (F6 · Etapa B).

Sin PostGIS: haversine en memoria (decenas de POIs por muni -> trivial). Un
reclamo con coords que cae dentro del radio de uno o más POIs ACTIVOS de SU
municipio se vincula al POI MÁS CERCANO (`reclamo.poi_id`). Sin coords, o sin
POI en zona -> `poi_id = None` (queda fuera del circuito POI, por diseño §2.2).

Multi-tenant estricto: SOLO se consideran POIs y reclamos del municipio dado.
Ninguna de estas funciones commitea — el caller decide la transacción.
"""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PuntoInteres, Reclamo
from models.enums import EstadoReclamo
from utils.geo import haversine_distance

# Estados cerrados (blocklist resiliente, misma semántica que dashboard.py:320 y
# reclamos.py:750): un reclamo cuyo estado NO esté acá se considera ACTIVO y
# entra al recálculo. Que aparezca un estado nuevo/legacy no lo excluye por
# error (regla dura #3 — patrón con fallback, nada de switch exhaustivo).
ESTADOS_CERRADOS = (
    EstadoReclamo.FINALIZADO,
    EstadoReclamo.RESUELTO,
    EstadoReclamo.RECHAZADO,
)


async def _pois_activos(db: AsyncSession, municipio_id: int) -> List[PuntoInteres]:
    """POIs activos del municipio (multi-tenant)."""
    return list((await db.execute(
        select(PuntoInteres).where(
            PuntoInteres.municipio_id == municipio_id,
            PuntoInteres.activo == True,  # noqa: E712
        )
    )).scalars().all())


def _poi_mas_cercano(reclamo: Reclamo, pois: List[PuntoInteres]) -> Optional[int]:
    """Id del POI activo MÁS CERCANO cuyo radio contiene al reclamo, o None.

    Recorre los POIs; para cada uno calcula la distancia haversine (metros) y se
    queda con el más cercano entre los que cumplen `dist <= radio_metros`. Sin
    coords en el reclamo -> None."""
    if reclamo.latitud is None or reclamo.longitud is None:
        return None
    mejor_id: Optional[int] = None
    mejor_dist: Optional[float] = None
    for poi in pois:
        dist = haversine_distance(
            reclamo.latitud, reclamo.longitud, poi.latitud, poi.longitud
        )
        if dist <= (poi.radio_metros or 0):
            if mejor_dist is None or dist < mejor_dist:
                mejor_dist = dist
                mejor_id = poi.id
    return mejor_id


async def match_reclamo_a_poi(db: AsyncSession, reclamo: Reclamo) -> Optional[int]:
    """Setea `reclamo.poi_id` al POI activo más cercano que lo contiene (o None).

    Se llama al crear/editar un reclamo, ANTES del commit del caller. No commitea.
    Sin coords o sin POI en zona -> `poi_id = None`. Devuelve el poi_id resultante.
    Multi-tenant: sólo mira POIs del municipio del reclamo. Sin POIs activos el
    match es un no-op barato (query vacío -> None)."""
    if reclamo.latitud is None or reclamo.longitud is None:
        reclamo.poi_id = None
        return None
    pois = await _pois_activos(db, reclamo.municipio_id)
    reclamo.poi_id = _poi_mas_cercano(reclamo, pois)
    return reclamo.poi_id


async def recalcular_pois_municipio(db: AsyncSession, municipio_id: int) -> int:
    """Recalcula `poi_id` de TODOS los reclamos activos (no cerrados) del muni.

    Se dispara al crear/editar/borrar un POI o cambiar su radio. Un solo fetch de
    POIs activos + un solo fetch de reclamos activos; matching en memoria (sin
    N+1). No commitea (el caller decide). Devuelve cuántos reclamos quedaron
    DENTRO de alguna zona (con `poi_id` seteado)."""
    pois = await _pois_activos(db, municipio_id)
    reclamos = list((await db.execute(
        select(Reclamo).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.notin_(ESTADOS_CERRADOS),
        )
    )).scalars().all())
    en_zona = 0
    for reclamo in reclamos:
        reclamo.poi_id = _poi_mas_cercano(reclamo, pois)
        if reclamo.poi_id is not None:
            en_zona += 1
    return en_zona
