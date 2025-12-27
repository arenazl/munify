"""Servicio para enviar Web Push Notifications"""
from pywebpush import webpush, WebPushException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import PushSubscription, User
from core.config import settings
from typing import Optional, List
import json
import logging

logger = logging.getLogger(__name__)


async def send_push_to_user(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str,
    url: Optional[str] = None,
    icon: Optional[str] = None,
    data: Optional[dict] = None
) -> int:
    """
    Envía una notificación push a todas las suscripciones activas de un usuario.

    Returns:
        int: Número de notificaciones enviadas exitosamente
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys no configuradas, no se pueden enviar push notifications")
        return 0

    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.activo == True
        )
    )
    subscriptions = result.scalars().all()

    if not subscriptions:
        logger.info(f"Usuario {user_id} no tiene suscripciones push activas")
        return 0

    payload = {
        "title": title,
        "body": body,
        "icon": icon or "/icon-notification.png",
        "url": url or "/",
        "data": data or {}
    }

    sent_count = 0
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key
                    }
                },
                data=json.dumps(payload),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_EMAIL}
            )
            sent_count += 1
            logger.info(f"Push enviado a usuario {user_id}")
        except WebPushException as e:
            logger.error(f"Error enviando push a usuario {user_id}: {e}")
            # Si el endpoint ya no es válido, desactivar la suscripción
            if e.response and e.response.status_code in [404, 410]:
                sub.activo = False
                await db.commit()
                logger.info(f"Suscripción {sub.id} desactivada por endpoint inválido")

    return sent_count


async def send_push_to_users(
    db: AsyncSession,
    user_ids: List[int],
    title: str,
    body: str,
    url: Optional[str] = None,
    icon: Optional[str] = None,
    data: Optional[dict] = None
) -> int:
    """
    Envía una notificación push a múltiples usuarios.

    Returns:
        int: Número total de notificaciones enviadas exitosamente
    """
    total_sent = 0
    for user_id in user_ids:
        total_sent += await send_push_to_user(db, user_id, title, body, url, icon, data)
    return total_sent


# ============================================
# Funciones específicas para eventos de reclamos
# (mismos eventos que WhatsApp)
# ============================================

async def notificar_reclamo_recibido(db: AsyncSession, reclamo) -> int:
    """Notifica al vecino que su reclamo fue recibido"""
    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Reclamo Recibido",
        body=f"Tu reclamo #{reclamo.id} ha sido registrado exitosamente.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_recibido", "reclamo_id": reclamo.id}
    )


async def notificar_reclamo_asignado(db: AsyncSession, reclamo, empleado_nombre: str) -> int:
    """Notifica al vecino que su reclamo fue asignado"""
    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Reclamo Asignado",
        body=f"Tu reclamo #{reclamo.id} fue asignado a {empleado_nombre}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_asignado", "reclamo_id": reclamo.id}
    )


async def notificar_cambio_estado(db: AsyncSession, reclamo, estado_anterior: str, estado_nuevo: str) -> int:
    """Notifica al vecino el cambio de estado de su reclamo"""
    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Estado Actualizado",
        body=f"Tu reclamo #{reclamo.id} cambió de {estado_anterior} a {estado_nuevo}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "cambio_estado", "reclamo_id": reclamo.id}
    )


async def notificar_reclamo_resuelto(db: AsyncSession, reclamo) -> int:
    """Notifica al vecino que su reclamo fue resuelto"""
    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Reclamo Resuelto",
        body=f"Tu reclamo #{reclamo.id} ha sido resuelto. ¡Gracias por tu paciencia!",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_resuelto", "reclamo_id": reclamo.id}
    )


async def notificar_nuevo_comentario_vecino(db: AsyncSession, reclamo, comentario: str) -> int:
    """Notifica al vecino que hay un nuevo comentario en su reclamo"""
    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Nuevo Comentario",
        body=f"Hay un nuevo comentario en tu reclamo #{reclamo.id}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "nuevo_comentario", "reclamo_id": reclamo.id}
    )


async def notificar_asignacion_empleado(db: AsyncSession, empleado_user_id: int, reclamo) -> int:
    """Notifica al empleado que le asignaron un reclamo"""
    return await send_push_to_user(
        db=db,
        user_id=empleado_user_id,
        title="Nueva Asignación",
        body=f"Se te asignó el reclamo #{reclamo.id}: {reclamo.descripcion[:50]}...",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "asignacion_empleado", "reclamo_id": reclamo.id}
    )


async def notificar_comentario_vecino_a_empleado(db: AsyncSession, empleado_user_id: int, reclamo, comentario: str) -> int:
    """Notifica al empleado que el vecino comentó en su reclamo"""
    return await send_push_to_user(
        db=db,
        user_id=empleado_user_id,
        title="Comentario del Vecino",
        body=f"El vecino comentó en el reclamo #{reclamo.id}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "comentario_vecino", "reclamo_id": reclamo.id}
    )


async def notificar_supervisor_reclamo_nuevo(db: AsyncSession, supervisor_user_id: int, reclamo) -> int:
    """Notifica al supervisor que hay un nuevo reclamo"""
    return await send_push_to_user(
        db=db,
        user_id=supervisor_user_id,
        title="Nuevo Reclamo",
        body=f"Nuevo reclamo #{reclamo.id} pendiente de revisión.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_nuevo_supervisor", "reclamo_id": reclamo.id}
    )


async def notificar_supervisor_pendiente_confirmacion(db: AsyncSession, supervisor_user_id: int, reclamo) -> int:
    """Notifica al supervisor que hay un reclamo pendiente de confirmación"""
    return await send_push_to_user(
        db=db,
        user_id=supervisor_user_id,
        title="Pendiente Confirmación",
        body=f"El reclamo #{reclamo.id} está esperando tu confirmación.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "pendiente_confirmacion", "reclamo_id": reclamo.id}
    )


async def notificar_sla_vencido(db: AsyncSession, supervisor_user_ids: List[int], reclamo) -> int:
    """Notifica a los supervisores que el SLA de un reclamo venció"""
    return await send_push_to_users(
        db=db,
        user_ids=supervisor_user_ids,
        title="SLA Vencido",
        body=f"El reclamo #{reclamo.id} ha superado el tiempo de SLA.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "sla_vencido", "reclamo_id": reclamo.id}
    )
