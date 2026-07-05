"""Prioridad efectiva de un reclamo — leída de sus OTs (F6 · prioridad única).

La prioridad canónica del trabajo vive en la OT (`ordenes_trabajo.prioridad`,
enum baja/media/alta/urgente), NO en el campo legacy `reclamos.prioridad`
(Integer, deprecado en F6 — tenía doble semántica contradictoria; ver
docs/reclamos/08-fase-6-poi-prioridad-unica.md §2.1).

Un reclamo puede estar vinculado a varias OTs (N:M vía `orden_trabajo_reclamos`).
Su prioridad EFECTIVA = la más alta entre sus OTs NO canceladas
(urgente > alta > media > baja). Sin OT viva -> None (la UI cae a 'media').

Decisión de diseño: se excluyen solo las OTs CANCELADAS (trabajo anulado). Las
COMPLETADAS cuentan, para que un reclamo cerrado siga mostrando la prioridad con
la que efectivamente se trabajó.
"""
from typing import Iterable, Optional

from sqlalchemy import select, case, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
from models.enums import PrioridadOT, EstadoOrdenTrabajo

# Severidad para elegir la OT más prioritaria cuando un reclamo tiene varias.
_RANK: dict[PrioridadOT, int] = {
    PrioridadOT.BAJA: 1,
    PrioridadOT.MEDIA: 2,
    PrioridadOT.ALTA: 3,
    PrioridadOT.URGENTE: 4,
}
_RANK_INV: dict[int, PrioridadOT] = {v: k for k, v in _RANK.items()}


async def prioridad_ot_map(
    db: AsyncSession,
    reclamo_ids: Iterable[int],
    municipio_ids: Optional[Iterable[int]] = None,
) -> dict[int, str]:
    """{reclamo_id: valor_enum_prioridad} para los reclamos con OT viva.

    Un solo query (sin N+1): join pivot<->OT, excluye canceladas, toma el rank
    maximo por reclamo. Los reclamos sin OT viva NO aparecen en el dict.

    `municipio_ids`: defensa multi-tenant (regla dura). Aunque el join por
    reclamo_id ya acota (una OT solo se vincula a reclamos de su muni), cuando
    el caller lo pasa se filtra ademas por OrdenTrabajo.municipio_id, para no
    confiar ciegamente en ids ya scopeados. `set_prioridad_ot` lo deriva solo.
    """
    ids = [rid for rid in reclamo_ids if rid is not None]
    if not ids:
        return {}
    rank = case(
        (OrdenTrabajo.prioridad == PrioridadOT.URGENTE, 4),
        (OrdenTrabajo.prioridad == PrioridadOT.ALTA, 3),
        (OrdenTrabajo.prioridad == PrioridadOT.MEDIA, 2),
        (OrdenTrabajo.prioridad == PrioridadOT.BAJA, 1),
        else_=0,
    )
    query = (
        select(OrdenTrabajoReclamo.reclamo_id, func.max(rank))
        .join(OrdenTrabajo, OrdenTrabajo.id == OrdenTrabajoReclamo.orden_trabajo_id)
        .where(OrdenTrabajoReclamo.reclamo_id.in_(ids))
        .where(OrdenTrabajo.estado != EstadoOrdenTrabajo.CANCELADA)
    )
    munis = [m for m in (municipio_ids or []) if m is not None]
    if munis:
        query = query.where(OrdenTrabajo.municipio_id.in_(munis))
    query = query.group_by(OrdenTrabajoReclamo.reclamo_id)
    rows = (await db.execute(query)).all()
    out: dict[int, str] = {}
    for reclamo_id, max_rank in rows:
        prioridad = _RANK_INV.get(int(max_rank)) if max_rank else None
        if prioridad is not None:
            out[reclamo_id] = prioridad.value
    return out


async def set_prioridad_ot(db: AsyncSession, reclamos) -> None:
    """Inyecta `prioridad_ot` (atributo transitorio) en cada reclamo ORM.

    None si el reclamo no tiene OT viva. Llamar ANTES de serializar a
    ReclamoResponse en los endpoints de listado/detalle. El atributo NO es una
    columna mapeada: no se persiste, solo lo lee pydantic (`from_attributes`).
    """
    reclamos = list(reclamos)
    if not reclamos:
        return
    # Defensa multi-tenant: acotar a los municipios de los propios reclamos.
    munis = {getattr(r, "municipio_id", None) for r in reclamos}
    munis.discard(None)
    mapa = await prioridad_ot_map(
        db, [r.id for r in reclamos], municipio_ids=munis or None
    )
    for reclamo in reclamos:
        reclamo.prioridad_ot = mapa.get(reclamo.id)
