"""Endpoints agregados del vecino — resumen cross-modulo para sidebar badges."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, and_

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.reclamo import Reclamo
from models.tramite import Solicitud, EstadoSolicitud
from models.tasas import Partida, Deuda, EstadoDeuda, EstadoPartida


router = APIRouter(prefix="/vecino", tags=["Vecino"])


class ResumenBadges(BaseModel):
    """Contadores para mostrar badges en sidebar/nav del vecino."""
    reclamos_pendientes: int
    tramites_pendientes: int
    tasas_pendientes: int  # boletas pendientes + vencidas


@router.get("/resumen-badges", response_model=ResumenBadges)
async def resumen_badges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve contadores cross-modulo para mostrar al vecino en sidebar.

    Se llama una vez al loguear + se refresca periódicamente (frontend decide).
    Rápido — solo 3 COUNTs paralelos.
    """
    # Solo tiene sentido para vecinos. Admin/supervisor recibe 0s.
    if current_user.rol != RolUsuario.VECINO or not current_user.municipio_id:
        return ResumenBadges(
            reclamos_pendientes=0,
            tramites_pendientes=0,
            tasas_pendientes=0,
        )

    # Reclamos pendientes — estados no terminados.
    # Los estados "activos" son: recibido, en_curso, pospuesto, pendiente_confirmacion
    # Terminados: finalizado, rechazado, resuelto
    estados_reclamo_pendientes = (
        "recibido", "en_curso", "pospuesto", "pendiente_confirmacion",
        "nuevo", "asignado", "en_proceso",  # legacy
    )
    rec_q = await db.execute(
        select(func.count(Reclamo.id)).where(
            Reclamo.creador_id == current_user.id,
            Reclamo.estado.in_(estados_reclamo_pendientes),
        )
    )
    reclamos_count = rec_q.scalar() or 0

    # Tramites pendientes — RECIBIDO o EN_CURSO o POSPUESTO.
    estados_tramite_pendientes = [
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.EN_CURSO,
        EstadoSolicitud.POSPUESTO,
    ]
    tram_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.solicitante_id == current_user.id,
            Solicitud.estado.in_(estados_tramite_pendientes),
        )
    )
    tramites_count = tram_q.scalar() or 0

    # Tasas pendientes — partidas del vecino (por user_id o dni) con deudas
    # pendientes/vencidas.
    partida_match = [Partida.titular_user_id == current_user.id]
    if current_user.dni:
        partida_match.append(Partida.titular_dni == current_user.dni)

    tasas_q = await db.execute(
        select(func.count(Deuda.id))
        .join(Partida, Deuda.partida_id == Partida.id)
        .where(
            Partida.municipio_id == current_user.municipio_id,
            or_(*partida_match),
            Partida.estado == EstadoPartida.ACTIVA,
            Deuda.estado.in_([EstadoDeuda.PENDIENTE, EstadoDeuda.VENCIDA]),
        )
    )
    tasas_count = tasas_q.scalar() or 0

    return ResumenBadges(
        reclamos_pendientes=reclamos_count,
        tramites_pendientes=tramites_count,
        tasas_pendientes=tasas_count,
    )
