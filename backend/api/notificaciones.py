from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List

from core.database import get_db
from core.security import get_current_user
from models.notificacion import Notificacion
from models.user import User
from schemas.notificacion import NotificacionResponse

router = APIRouter()

@router.get("/", response_model=List[NotificacionResponse])
async def get_notificaciones(
    leidas: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Notificacion).where(Notificacion.usuario_id == current_user.id)
    if leidas is not None:
        query = query.where(Notificacion.leida == leidas)
    query = query.order_by(Notificacion.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/count")
async def get_notificaciones_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy import func
    result = await db.execute(
        select(func.count(Notificacion.id))
        .where(Notificacion.usuario_id == current_user.id)
        .where(Notificacion.leida == False)
    )
    count = result.scalar()
    return {"count": count}

@router.put("/{notificacion_id}/leer")
async def marcar_leida(
    notificacion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notificacion)
        .where(Notificacion.id == notificacion_id)
        .where(Notificacion.usuario_id == current_user.id)
    )
    notificacion = result.scalar_one_or_none()
    if not notificacion:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")

    notificacion.leida = True
    await db.commit()
    return {"message": "Notificación marcada como leída"}

@router.put("/leer-todas")
async def marcar_todas_leidas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        update(Notificacion)
        .where(Notificacion.usuario_id == current_user.id)
        .where(Notificacion.leida == False)
        .values(leida=True)
    )
    await db.commit()
    return {"message": "Todas las notificaciones marcadas como leídas"}
