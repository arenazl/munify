"""Servicio para enviar Web Push Notifications y Notificaciones In-App"""
from pywebpush import webpush, WebPushException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from models import PushSubscription, User
from models.notificacion import Notificacion
from models.user import DEFAULT_NOTIFICATION_PREFERENCES
from core.config import settings
from typing import Optional, List
import json
import logging

logger = logging.getLogger(__name__)


async def crear_notificacion_db(
    db: AsyncSession,
    usuario_id: int,
    titulo: str,
    mensaje: str,
    tipo: str = "info",
    reclamo_id: Optional[int] = None
) -> Optional[Notificacion]:
    """
    Crea una notificación en la base de datos para mostrar en la campanita.

    Args:
        db: Sesión de base de datos
        usuario_id: ID del usuario que recibirá la notificación
        titulo: Título de la notificación
        mensaje: Mensaje/cuerpo de la notificación
        tipo: Tipo de notificación ("info", "success", "warning", "error")
        reclamo_id: ID del reclamo relacionado (opcional)

    Returns:
        Notificacion creada o None si hubo error
    """
    try:
        notificacion = Notificacion(
            usuario_id=usuario_id,
            titulo=titulo,
            mensaje=mensaje,
            tipo=tipo,
            reclamo_id=reclamo_id,
            leida=False
        )
        db.add(notificacion)
        await db.commit()
        await db.refresh(notificacion)
        logger.info(f"Notificación creada en BD para usuario {usuario_id}: {titulo}")
        return notificacion
    except Exception as e:
        logger.error(f"Error creando notificación en BD: {e}")
        await db.rollback()
        return None


async def check_user_notification_preference(
    db: AsyncSession,
    user_id: int,
    notification_type: str
) -> bool:
    """
    Verifica si el usuario tiene habilitada una preferencia de notificación específica.

    Args:
        db: Sesión de base de datos
        user_id: ID del usuario
        notification_type: Tipo de notificación (ej: "reclamo_recibido", "cambio_estado")

    Returns:
        bool: True si la notificación está habilitada, False en caso contrario
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        return False

    # Obtener preferencias del usuario o usar defaults
    prefs = user.notificacion_preferencias or DEFAULT_NOTIFICATION_PREFERENCES

    # Si el tipo de notificación no existe en las preferencias, asumir habilitado
    return prefs.get(notification_type, True)


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
    """Notifica al vecino que su reclamo fue recibido.
    Crea notificación en BD + push al navegador."""
    if not await check_user_notification_preference(db, reclamo.creador_id, "reclamo_recibido"):
        logger.info(f"Usuario {reclamo.creador_id} tiene deshabilitada la notificación reclamo_recibido")
        return 0

    titulo = f"Reclamo #{reclamo.id} Generado"
    mensaje = f"Su reclamo #{reclamo.id} fue generado exitosamente y será atendido a la brevedad."

    # Crear notificación en BD
    await crear_notificacion_db(
        db=db,
        usuario_id=reclamo.creador_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo="success",
        reclamo_id=reclamo.id
    )

    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title=titulo,
        body=mensaje,
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_recibido", "reclamo_id": reclamo.id}
    )


async def notificar_reclamo_asignado(db: AsyncSession, reclamo, empleado_nombre: str) -> int:
    """Notifica al vecino que su reclamo fue asignado"""
    if not await check_user_notification_preference(db, reclamo.creador_id, "reclamo_asignado"):
        logger.info(f"Usuario {reclamo.creador_id} tiene deshabilitada la notificación reclamo_asignado")
        return 0

    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Reclamo Asignado",
        body=f"Tu reclamo #{reclamo.id} fue asignado a {empleado_nombre}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_asignado", "reclamo_id": reclamo.id}
    )


async def notificar_cambio_estado(db: AsyncSession, reclamo, estado_anterior: str, estado_nuevo: str) -> int:
    """Notifica al vecino el cambio de estado de su reclamo.
    Crea notificación en BD + push al navegador."""
    if not await check_user_notification_preference(db, reclamo.creador_id, "cambio_estado"):
        logger.info(f"Usuario {reclamo.creador_id} tiene deshabilitada la notificación cambio_estado")
        return 0

    titulo = "Estado Actualizado"
    mensaje = f"Tu reclamo #{reclamo.id} cambió de {estado_anterior} a {estado_nuevo}."

    # Crear notificación en BD
    await crear_notificacion_db(
        db=db,
        usuario_id=reclamo.creador_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo="info",
        reclamo_id=reclamo.id
    )

    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title=titulo,
        body=mensaje,
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "cambio_estado", "reclamo_id": reclamo.id}
    )


async def notificar_reclamo_resuelto(db: AsyncSession, reclamo) -> int:
    """Notifica al vecino que su reclamo fue resuelto.
    Crea notificación en BD + push al navegador."""
    if not await check_user_notification_preference(db, reclamo.creador_id, "reclamo_resuelto"):
        logger.info(f"Usuario {reclamo.creador_id} tiene deshabilitada la notificación reclamo_resuelto")
        return 0

    titulo = "Reclamo Resuelto"
    mensaje = f"Tu reclamo #{reclamo.id} ha sido resuelto. ¡Gracias por tu paciencia!"

    # Crear notificación en BD
    await crear_notificacion_db(
        db=db,
        usuario_id=reclamo.creador_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo="success",
        reclamo_id=reclamo.id
    )

    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title=titulo,
        body=mensaje,
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_resuelto", "reclamo_id": reclamo.id}
    )


async def notificar_nuevo_comentario_vecino(db: AsyncSession, reclamo, comentario: str) -> int:
    """Notifica al vecino que hay un nuevo comentario en su reclamo"""
    if not await check_user_notification_preference(db, reclamo.creador_id, "nuevo_comentario"):
        logger.info(f"Usuario {reclamo.creador_id} tiene deshabilitada la notificación nuevo_comentario")
        return 0

    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title="Nuevo Comentario",
        body=f"Hay un nuevo comentario en tu reclamo #{reclamo.id}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "nuevo_comentario", "reclamo_id": reclamo.id}
    )


async def notificar_nuevo_comentario(db: AsyncSession, reclamo, comentario_texto: str, autor_nombre: str) -> int:
    """
    Notifica sobre un nuevo comentario en el reclamo.
    Envía al creador del reclamo (vecino) con el texto del comentario.
    Crea notificación en BD para la campanita + envía push al navegador + envía email.
    """
    if not await check_user_notification_preference(db, reclamo.creador_id, "nuevo_comentario"):
        logger.info(f"Usuario {reclamo.creador_id} tiene deshabilitada la notificación nuevo_comentario")
        return 0

    # Truncar comentario si es muy largo
    comentario_preview = comentario_texto[:80] + "..." if len(comentario_texto) > 80 else comentario_texto

    titulo = f"Comentario de {autor_nombre}"
    mensaje = f"Reclamo #{reclamo.id}: {comentario_preview}"

    # Crear notificación en BD para la campanita
    await crear_notificacion_db(
        db=db,
        usuario_id=reclamo.creador_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo="info",
        reclamo_id=reclamo.id
    )

    # Obtener email del vecino
    result = await db.execute(select(User).where(User.id == reclamo.creador_id))
    vecino = result.scalar_one_or_none()
    if vecino and vecino.email:
        try:
            from services.email_service import email_service, EmailTemplates
            html_content = EmailTemplates.nuevo_comentario(
                reclamo.titulo,
                reclamo.id,
                autor_nombre,
                comentario_texto
            )
            await email_service.send_email(
                to_email=vecino.email,
                subject=f"Nuevo comentario en reclamo #{reclamo.id}",
                body_html=html_content
            )
            logger.info(f"Email de comentario enviado a {vecino.email}")
        except Exception as e:
            logger.error(f"Error enviando email de comentario: {e}")

    # Enviar push al navegador
    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title=f"💬 {titulo}",
        body=mensaje,
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "nuevo_comentario", "reclamo_id": reclamo.id}
    )


async def notificar_asignacion_empleado(db: AsyncSession, empleado_user_id: int, reclamo) -> int:
    """Notifica al empleado que le asignaron un reclamo"""
    if not await check_user_notification_preference(db, empleado_user_id, "asignacion_empleado"):
        logger.info(f"Usuario {empleado_user_id} tiene deshabilitada la notificación asignacion_empleado")
        return 0

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
    if not await check_user_notification_preference(db, empleado_user_id, "comentario_vecino"):
        logger.info(f"Usuario {empleado_user_id} tiene deshabilitada la notificación comentario_vecino")
        return 0

    return await send_push_to_user(
        db=db,
        user_id=empleado_user_id,
        title="Comentario del Vecino",
        body=f"El vecino comentó en el reclamo #{reclamo.id}.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "comentario_vecino", "reclamo_id": reclamo.id}
    )


async def notificar_comentario_vecino_a_dependencia(
    db: AsyncSession,
    reclamo,
    comentario: str,
    vecino_nombre: str
) -> int:
    """
    Notifica a todos los usuarios de la dependencia asignada cuando un vecino comenta.
    Crea notificación en BD para la campanita + envía push al navegador + envía email.
    """
    from models import MunicipioDependencia
    from models.enums import RolUsuario

    if not reclamo.municipio_dependencia_id:
        logger.info(f"Reclamo #{reclamo.id} no tiene dependencia asignada, no se envía notificación")
        return 0

    # Buscar usuarios de la dependencia (supervisores)
    result = await db.execute(
        select(User).where(
            User.municipio_dependencia_id == reclamo.municipio_dependencia_id,
            User.rol == RolUsuario.SUPERVISOR,
            User.activo == True
        )
    )
    usuarios_dependencia = result.scalars().all()

    if not usuarios_dependencia:
        logger.info(f"No hay usuarios en la dependencia {reclamo.municipio_dependencia_id}")
        return 0

    # Truncar comentario
    comentario_preview = comentario[:60] + "..." if len(comentario) > 60 else comentario
    titulo = f"Comentario de {vecino_nombre}"
    mensaje = f"Reclamo #{reclamo.id}: {comentario_preview}"

    total_enviados = 0
    for usuario in usuarios_dependencia:
        if await check_user_notification_preference(db, usuario.id, "comentario_vecino"):
            # Crear notificación en BD para la campanita
            await crear_notificacion_db(
                db=db,
                usuario_id=usuario.id,
                titulo=titulo,
                mensaje=mensaje,
                tipo="info",
                reclamo_id=reclamo.id
            )

            # Enviar email al supervisor
            if usuario.email:
                try:
                    from services.email_service import email_service, EmailTemplates
                    html_content = EmailTemplates.nuevo_comentario(
                        reclamo.titulo,
                        reclamo.id,
                        vecino_nombre,
                        comentario
                    )
                    await email_service.send_email(
                        to_email=usuario.email,
                        subject=f"Comentario de vecino en reclamo #{reclamo.id}",
                        body_html=html_content
                    )
                    logger.info(f"Email de comentario enviado a supervisor {usuario.email}")
                except Exception as e:
                    logger.error(f"Error enviando email a supervisor: {e}")

            # Enviar push al navegador
            enviados = await send_push_to_user(
                db=db,
                user_id=usuario.id,
                title=f"💬 {titulo}",
                body=mensaje,
                url=f"/gestion/reclamos/{reclamo.id}",
                data={"tipo": "comentario_vecino", "reclamo_id": reclamo.id}
            )
            total_enviados += enviados

    logger.info(f"Notificación de comentario enviada a {total_enviados} usuarios de la dependencia")
    return total_enviados


async def notificar_supervisor_reclamo_nuevo(db: AsyncSession, supervisor_user_id: int, reclamo) -> int:
    """Notifica al supervisor que hay un nuevo reclamo"""
    if not await check_user_notification_preference(db, supervisor_user_id, "reclamo_nuevo_supervisor"):
        logger.info(f"Usuario {supervisor_user_id} tiene deshabilitada la notificación reclamo_nuevo_supervisor")
        return 0

    return await send_push_to_user(
        db=db,
        user_id=supervisor_user_id,
        title="Nuevo Reclamo",
        body=f"Nuevo reclamo #{reclamo.id} pendiente de revisión.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "reclamo_nuevo_supervisor", "reclamo_id": reclamo.id}
    )


async def notificar_dependencia_reclamo_nuevo(
    db: AsyncSession,
    reclamo,
    categoria_nombre: str = None
) -> int:
    """
    Notifica a todos los usuarios de la dependencia asignada cuando llega un nuevo reclamo.
    Crea notificación en BD para la campanita + envía push al navegador + envía email.
    """
    from models import MunicipioDependencia
    from models.enums import RolUsuario

    if not reclamo.municipio_dependencia_id:
        logger.info(f"Reclamo #{reclamo.id} no tiene dependencia asignada, no se envía notificación")
        return 0

    # Buscar usuarios de la dependencia (supervisores)
    result = await db.execute(
        select(User).where(
            User.municipio_dependencia_id == reclamo.municipio_dependencia_id,
            User.rol == RolUsuario.SUPERVISOR,
            User.activo == True
        )
    )
    usuarios_dependencia = result.scalars().all()

    if not usuarios_dependencia:
        logger.info(f"No hay usuarios en la dependencia {reclamo.municipio_dependencia_id}")
        return 0

    # Obtener nombre de la dependencia
    dep_result = await db.execute(
        select(MunicipioDependencia).where(
            MunicipioDependencia.id == reclamo.municipio_dependencia_id
        ).options(selectinload(MunicipioDependencia.dependencia))
    )
    muni_dep = dep_result.scalar_one_or_none()
    dep_nombre = muni_dep.dependencia.nombre if muni_dep and muni_dep.dependencia else "tu dependencia"

    # Preparar mensaje
    titulo = "Nuevo Reclamo Asignado"
    cat_info = f" - {categoria_nombre}" if categoria_nombre else ""
    mensaje = f"Reclamo #{reclamo.id}{cat_info} fue asignado a {dep_nombre}."

    total_enviados = 0
    for usuario in usuarios_dependencia:
        if await check_user_notification_preference(db, usuario.id, "reclamo_nuevo_supervisor"):
            # Crear notificación en BD para la campanita
            await crear_notificacion_db(
                db=db,
                usuario_id=usuario.id,
                titulo=titulo,
                mensaje=mensaje,
                tipo="info",
                reclamo_id=reclamo.id
            )

            # Enviar email al supervisor
            if usuario.email:
                try:
                    from services.email_service import email_service, EmailTemplates
                    html_content = EmailTemplates.reclamo_creado(
                        reclamo.titulo,
                        reclamo.id,
                        categoria_nombre or "Sin categoría"
                    )
                    await email_service.send_email(
                        to_email=usuario.email,
                        subject=f"Nuevo reclamo #{reclamo.id} asignado a tu dependencia",
                        body_html=html_content
                    )
                    logger.info(f"Email de reclamo nuevo enviado a supervisor {usuario.email}")
                except Exception as e:
                    logger.error(f"Error enviando email a supervisor: {e}")

            # Enviar push al navegador
            enviados = await send_push_to_user(
                db=db,
                user_id=usuario.id,
                title=f"📋 {titulo}",
                body=mensaje,
                url=f"/gestion/reclamos/{reclamo.id}",
                data={"tipo": "reclamo_nuevo_supervisor", "reclamo_id": reclamo.id}
            )
            total_enviados += enviados

    logger.info(f"Notificación de reclamo nuevo enviada a {len(usuarios_dependencia)} usuarios ({total_enviados} push)")
    return total_enviados


async def notificar_supervisor_pendiente_confirmacion(db: AsyncSession, supervisor_user_id: int, reclamo) -> int:
    """Notifica al supervisor que hay un reclamo pendiente de confirmación"""
    if not await check_user_notification_preference(db, supervisor_user_id, "pendiente_confirmacion"):
        logger.info(f"Usuario {supervisor_user_id} tiene deshabilitada la notificación pendiente_confirmacion")
        return 0

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
    # Filtrar solo los usuarios que tienen habilitada la preferencia
    enabled_user_ids = []
    for user_id in supervisor_user_ids:
        if await check_user_notification_preference(db, user_id, "sla_vencido"):
            enabled_user_ids.append(user_id)
        else:
            logger.info(f"Usuario {user_id} tiene deshabilitada la notificación sla_vencido")

    if not enabled_user_ids:
        return 0

    return await send_push_to_users(
        db=db,
        user_ids=enabled_user_ids,
        title="SLA Vencido",
        body=f"El reclamo #{reclamo.id} ha superado el tiempo de SLA.",
        url=f"/reclamos/{reclamo.id}",
        data={"tipo": "sla_vencido", "reclamo_id": reclamo.id}
    )
