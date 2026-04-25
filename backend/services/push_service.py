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
    reclamo_id: Optional[int] = None,
    solicitud_id: Optional[int] = None,
    accion_url: Optional[str] = None,
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
        solicitud_id: ID de la solicitud/trámite relacionado (opcional)

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
            solicitud_id=solicitud_id,
            accion_url=accion_url,
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
    mensaje = f"Tu reclamo #{reclamo.id} fue finalizado. Calificá la atención recibida."
    # URL a la pantalla de calificación (no al detalle) — el usuario llega
    # ahí, califica con estrellas + comentario y vuelve.
    url_calificar = f"/calificar/{reclamo.id}"

    # Crear notificación en BD con accion_url explícita
    await crear_notificacion_db(
        db=db,
        usuario_id=reclamo.creador_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo="success",
        reclamo_id=reclamo.id,
        accion_url=url_calificar,
    )

    return await send_push_to_user(
        db=db,
        user_id=reclamo.creador_id,
        title=titulo,
        body=mensaje,
        url=url_calificar,
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

    # Buscar TODOS los supervisores del municipio (no solo de la dependencia específica)
    result = await db.execute(
        select(User).where(
            User.municipio_id == reclamo.municipio_id,
            User.rol == RolUsuario.SUPERVISOR,
            User.activo == True
        )
    )
    usuarios_dependencia = result.scalars().all()

    if not usuarios_dependencia:
        logger.info(f"No hay supervisores en el municipio {reclamo.municipio_id}")
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

    # Buscar TODOS los supervisores del municipio (no solo de la dependencia específica)
    result = await db.execute(
        select(User).where(
            User.municipio_id == reclamo.municipio_id,
            User.rol == RolUsuario.SUPERVISOR,
            User.activo == True
        )
    )
    usuarios_dependencia = result.scalars().all()

    if not usuarios_dependencia:
        logger.info(f"No hay supervisores en el municipio {reclamo.municipio_id}")
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

                    # Obtener nombre del creador
                    creador_nombre = None
                    if reclamo.creador_id:
                        creador_result = await db.execute(select(User).where(User.id == reclamo.creador_id))
                        creador = creador_result.scalar_one_or_none()
                        if creador:
                            creador_nombre = f"{creador.nombre} {creador.apellido}".strip() or creador.email

                    html_content = EmailTemplates.reclamo_creado(
                        reclamo.titulo,
                        reclamo.id,
                        categoria_nombre or "Sin categoría",
                        descripcion=reclamo.descripcion,
                        creador_nombre=creador_nombre
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


# ============================================
# Funciones específicas para eventos de TRÁMITES/SOLICITUDES
# ============================================

async def notificar_solicitud_recibida(db: AsyncSession, solicitud, tramite_nombre: str = None) -> int:
    """Notifica al vecino que su solicitud fue creada.

    Si la solicitud cobra al inicio (estado=pendiente_pago), genera el
    cupon automaticamente y la notificacion lleva al checkout en lugar
    de al detalle del tramite.
    """
    if not solicitud.solicitante_id:
        logger.info(f"Solicitud #{solicitud.id} no tiene solicitante_id, no se envía notificación")
        return 0

    if not await check_user_notification_preference(db, solicitud.solicitante_id, "tramite_creado"):
        logger.info(f"Usuario {solicitud.solicitante_id} tiene deshabilitada la notificación tramite_creado")
        return 0

    from models.tramite import EstadoSolicitud
    pendiente_pago = solicitud.estado == EstadoSolicitud.PENDIENTE_PAGO

    tramite_info = f" ({tramite_nombre})" if tramite_nombre else ""
    if pendiente_pago:
        titulo = f"Trámite #{solicitud.numero_tramite} — Pagá para continuar"
        mensaje = f"Tu trámite{tramite_info} fue creado. Para que la dependencia lo tome, primero tenés que abonarlo."
    else:
        titulo = f"Trámite #{solicitud.numero_tramite} Generado"
        mensaje = f"Su trámite{tramite_info} fue generado exitosamente y será procesado a la brevedad."

    # Si está pendiente de pago, generamos el cupón ya y armamos el link al
    # checkout. La notificación lleva ahí directo (en vez del detalle).
    accion_url = f"/tramites/{solicitud.id}"
    if pendiente_pago:
        try:
            checkout_url = await _generar_cupon_y_link(db, solicitud)
            if checkout_url:
                accion_url = checkout_url
        except Exception as e:
            logger.warning(f"[CUPON] No se pudo pre-generar el cupón al notificar: {e}")

    # Crear notificación en BD con accion_url explicita
    await crear_notificacion_db(
        db=db,
        usuario_id=solicitud.solicitante_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo="warning" if pendiente_pago else "success",
        solicitud_id=solicitud.id,
        accion_url=accion_url,
    )

    return await send_push_to_user(
        db=db,
        user_id=solicitud.solicitante_id,
        title=titulo,
        body=mensaje,
        url=accion_url,
        data={
            "tipo": "tramite_pendiente_pago" if pendiente_pago else "tramite_creado",
            "solicitud_id": solicitud.id,
        },
    )


async def _generar_cupon_y_link(db: AsyncSession, solicitud) -> Optional[str]:
    """Crea (o reusa) la PagoSesion para una solicitud pendiente de pago y
    devuelve la URL absoluta del checkout. Retorna None si no se puede.
    """
    from models.pago_sesion import PagoSesion, EstadoSesionPago
    from models.tramite import HistorialSolicitud
    from services.pagos import get_provider_para_muni
    from sqlalchemy import select
    from decimal import Decimal
    from datetime import datetime, timedelta
    from secrets import token_hex
    from core.config import settings

    if not solicitud.tramite or not solicitud.tramite.costo or solicitud.tramite.costo <= 0:
        return None

    # Reusar PagoSesion PENDING si existe (idempotencia)
    q = await db.execute(
        select(PagoSesion)
        .where(
            PagoSesion.solicitud_id == solicitud.id,
            PagoSesion.estado.in_([EstadoSesionPago.PENDING, EstadoSesionPago.IN_CHECKOUT]),
        )
        .order_by(PagoSesion.created_at.desc())
        .limit(1)
    )
    sesion = q.scalar_one_or_none()

    if sesion is None:
        provider = await get_provider_para_muni(db, solicitud.municipio_id)
        sesion_id = f"PB-{token_hex(7).upper()}"
        # Mismo override de testing que /pagos/cupon-tramite-wa
        try:
            from api.pagos import CUPON_TEST_OVERRIDE_MONTO
        except Exception:
            CUPON_TEST_OVERRIDE_MONTO = None
        monto_real = Decimal(str(solicitud.tramite.costo))
        monto_a_cobrar = CUPON_TEST_OVERRIDE_MONTO or monto_real
        suffix_test = " (TEST $1)" if CUPON_TEST_OVERRIDE_MONTO else ""
        concepto = f"{solicitud.tramite.nombre} — Solicitud {solicitud.numero_tramite}{suffix_test}"

        sesion_ext = await provider.crear_sesion(
            concepto=concepto,
            monto=monto_a_cobrar,
            sesion_id=sesion_id,
            return_url="/gestion/mis-tramites",
        )
        expires_at = datetime.utcnow() + timedelta(seconds=sesion_ext.expires_in_seconds)
        sesion = PagoSesion(
            id=sesion_id,
            solicitud_id=solicitud.id,
            municipio_id=solicitud.municipio_id,
            vecino_user_id=solicitud.solicitante_id,
            concepto=concepto,
            monto=monto_a_cobrar,
            estado=EstadoSesionPago.PENDING,
            provider=provider.nombre,
            external_id=sesion_ext.external_id,
            checkout_url=sesion_ext.checkout_url,
            return_url="/gestion/mis-tramites",
            expires_at=expires_at,
            canal="app",
        )
        db.add(sesion)
        db.add(HistorialSolicitud(
            solicitud_id=solicitud.id,
            usuario_id=solicitud.solicitante_id,
            accion="Cupón de pago generado",
            comentario=f"Sesión {sesion_id} · ${monto_a_cobrar:.2f} · auto al notificar al vecino",
        ))
        await db.commit()
        await db.refresh(sesion)

    # URL absoluta para que el push/notif funcione fuera de la app
    raw = sesion.checkout_url or ""
    if raw.startswith("/"):
        base = settings.FRONTEND_URL.rstrip("/")
        return f"{base}{raw}"
    return raw


async def notificar_dependencia_solicitud_nueva(
    db: AsyncSession,
    solicitud,
    tramite_nombre: str = None
) -> int:
    """
    Notifica a todos los supervisores del municipio cuando llega una nueva solicitud.
    Crea notificación en BD para la campanita + envía push al navegador + envía email.
    """
    from models.enums import RolUsuario

    if not solicitud.municipio_id:
        logger.info(f"Solicitud #{solicitud.id} no tiene municipio_id, no se envía notificación")
        return 0

    # Buscar todos los supervisores del municipio
    result = await db.execute(
        select(User).where(
            User.municipio_id == solicitud.municipio_id,
            User.rol == RolUsuario.SUPERVISOR,
            User.activo == True
        )
    )
    supervisores = result.scalars().all()

    if not supervisores:
        logger.info(f"No hay supervisores en el municipio {solicitud.municipio_id}")
        return 0

    # Preparar mensaje
    titulo = "Nuevo Trámite Recibido"
    tramite_info = f" - {tramite_nombre}" if tramite_nombre else ""
    mensaje = f"Trámite #{solicitud.numero_tramite}{tramite_info}: {solicitud.asunto or 'Sin asunto'}"

    total_enviados = 0
    for usuario in supervisores:
        if await check_user_notification_preference(db, usuario.id, "tramite_nuevo_supervisor"):
            # Crear notificación en BD para la campanita
            await crear_notificacion_db(
                db=db,
                usuario_id=usuario.id,
                titulo=titulo,
                mensaje=mensaje,
                tipo="info",
                solicitud_id=solicitud.id
            )

            # Enviar email al supervisor
            if usuario.email:
                try:
                    from services.email_service import email_service, EmailTemplates

                    # Obtener nombre del solicitante
                    solicitante_nombre = None
                    if solicitud.nombre_solicitante:
                        solicitante_nombre = f"{solicitud.nombre_solicitante} {solicitud.apellido_solicitante or ''}".strip()
                    elif solicitud.solicitante_id:
                        sol_result = await db.execute(select(User).where(User.id == solicitud.solicitante_id))
                        solicitante = sol_result.scalar_one_or_none()
                        if solicitante:
                            solicitante_nombre = f"{solicitante.nombre} {solicitante.apellido}".strip() or solicitante.email

                    html_content = EmailTemplates.solicitud_creada(
                        numero_tramite=solicitud.numero_tramite,
                        tramite_nombre=tramite_nombre or "Trámite",
                        asunto=solicitud.asunto or "Sin asunto",
                        descripcion=solicitud.descripcion,
                        solicitante_nombre=solicitante_nombre
                    )
                    await email_service.send_email(
                        to_email=usuario.email,
                        subject=f"Nuevo trámite #{solicitud.numero_tramite} recibido",
                        body_html=html_content
                    )
                    logger.info(f"Email de trámite nuevo enviado a supervisor {usuario.email}")
                except Exception as e:
                    logger.error(f"Error enviando email a supervisor: {e}")

            # Enviar push al navegador
            enviados = await send_push_to_user(
                db=db,
                user_id=usuario.id,
                title=f"📄 {titulo}",
                body=mensaje,
                url=f"/gestion/tramites/{solicitud.id}",
                data={"tipo": "tramite_nuevo_supervisor", "solicitud_id": solicitud.id}
            )
            total_enviados += enviados

    logger.info(f"Notificación de trámite nuevo enviada a {len(supervisores)} supervisores ({total_enviados} push)")
    return total_enviados


async def notificar_cambio_estado_solicitud(
    db: AsyncSession,
    solicitud,
    estado_anterior: str,
    estado_nuevo: str
) -> int:
    """Notifica al vecino el cambio de estado de su solicitud.
    Crea notificación en BD + push al navegador."""
    if not solicitud.solicitante_id:
        logger.info(f"Solicitud #{solicitud.id} no tiene solicitante_id, no se envía notificación")
        return 0

    if not await check_user_notification_preference(db, solicitud.solicitante_id, "tramite_cambio_estado"):
        logger.info(f"Usuario {solicitud.solicitante_id} tiene deshabilitada la notificación tramite_cambio_estado")
        return 0

    # Determinar título según el estado
    estado_labels = {
        "recibido": "Recibido",
        "en_curso": "En Proceso",
        "finalizado": "Finalizado",
        "pospuesto": "Pospuesto",
        "rechazado": "Rechazado"
    }
    estado_label = estado_labels.get(estado_nuevo, estado_nuevo.replace("_", " ").title())

    if estado_nuevo == "finalizado":
        titulo = "Trámite Finalizado"
        mensaje = f"Su trámite #{solicitud.numero_tramite} ha sido completado exitosamente."
        tipo = "success"
    elif estado_nuevo == "rechazado":
        titulo = "Trámite Rechazado"
        mensaje = f"Su trámite #{solicitud.numero_tramite} ha sido rechazado."
        tipo = "error"
    elif estado_nuevo == "en_curso":
        titulo = "Trámite en Proceso"
        mensaje = f"Su trámite #{solicitud.numero_tramite} está siendo procesado."
        tipo = "info"
    else:
        titulo = "Estado Actualizado"
        mensaje = f"Su trámite #{solicitud.numero_tramite} cambió a {estado_label}."
        tipo = "info"

    # Crear notificación en BD
    await crear_notificacion_db(
        db=db,
        usuario_id=solicitud.solicitante_id,
        titulo=titulo,
        mensaje=mensaje,
        tipo=tipo,
        solicitud_id=solicitud.id
    )

    # Enviar email si es un estado importante
    if estado_nuevo in ["finalizado", "rechazado"]:
        result = await db.execute(select(User).where(User.id == solicitud.solicitante_id))
        vecino = result.scalar_one_or_none()
        if vecino and vecino.email:
            try:
                from services.email_service import email_service, EmailTemplates
                html_content = EmailTemplates.solicitud_cambio_estado(
                    numero_tramite=solicitud.numero_tramite,
                    estado_nuevo=estado_label,
                    mensaje=mensaje
                )
                await email_service.send_email(
                    to_email=vecino.email,
                    subject=f"Trámite #{solicitud.numero_tramite} - {titulo}",
                    body_html=html_content
                )
                logger.info(f"Email de cambio de estado enviado a {vecino.email}")
            except Exception as e:
                logger.error(f"Error enviando email de cambio de estado: {e}")

    return await send_push_to_user(
        db=db,
        user_id=solicitud.solicitante_id,
        title=titulo,
        body=mensaje,
        url=f"/tramites/{solicitud.id}",
        data={"tipo": "tramite_cambio_estado", "solicitud_id": solicitud.id}
    )
