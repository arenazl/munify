"""API endpoints para Web Push Notifications"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional
from core.database import get_db
from core.security import get_current_user
from core.config import settings
from models import User, PushSubscription
from services.push_service import send_push_to_user

router = APIRouter(prefix="/push", tags=["Push Notifications"])


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: Optional[str] = None


class PushSubscriptionResponse(BaseModel):
    id: int
    endpoint: str
    activo: bool

    class Config:
        from_attributes = True


@router.get("/vapid-key")
async def get_vapid_public_key():
    """Obtiene la clave pública VAPID para el frontend"""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=500,
            detail="VAPID keys no configuradas. Genere las claves con: npx web-push generate-vapid-keys"
        )
    return {"publicKey": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe", response_model=PushSubscriptionResponse)
async def subscribe_to_push(
    subscription: PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Registra una nueva suscripción push para el usuario"""
    # Verificar si ya existe esta suscripción
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == subscription.endpoint)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Si existe pero está inactiva, reactivarla
        if not existing.activo:
            existing.activo = True
            existing.p256dh_key = subscription.p256dh
            existing.auth_key = subscription.auth
            existing.user_agent = subscription.user_agent
            await db.commit()
            await db.refresh(existing)
        return existing

    # Crear nueva suscripción
    new_subscription = PushSubscription(
        user_id=current_user.id,
        endpoint=subscription.endpoint,
        p256dh_key=subscription.p256dh,
        auth_key=subscription.auth,
        user_agent=subscription.user_agent
    )
    db.add(new_subscription)
    await db.commit()
    await db.refresh(new_subscription)

    return new_subscription


@router.post("/unsubscribe")
async def unsubscribe_from_push(
    subscription: PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Desactiva una suscripción push"""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == subscription.endpoint,
            PushSubscription.user_id == current_user.id
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.activo = False
        await db.commit()
        return {"message": "Suscripción desactivada"}

    return {"message": "Suscripción no encontrada"}


@router.get("/status")
async def get_push_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el estado de las suscripciones push del usuario"""
    result = await db.execute(
        select(func.count(PushSubscription.id)).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.activo == True
        )
    )
    subscriptions = result.scalar()

    return {
        "subscribed": subscriptions > 0,
        "count": subscriptions
    }


@router.post("/test")
async def test_push_notification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía una notificación push de prueba al usuario actual"""
    sent = await send_push_to_user(
        db=db,
        user_id=current_user.id,
        title="Notificación de Prueba",
        body="Si ves esto, las notificaciones push funcionan correctamente!",
        url="/",
        icon="/icon-notification.png"
    )

    if sent > 0:
        return {"success": True, "message": f"Notificación enviada a {sent} dispositivo(s)"}

    return {"success": False, "message": "No se pudo enviar. Asegurate de tener las notificaciones activadas."}
