"""
API para integración con WhatsApp Business API.
Permite recibir reclamos vía WhatsApp y enviar notificaciones.
Incluye configuración persistente por municipio.
"""
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
import json
import httpx
import re
import os
from datetime import datetime, timedelta

from core.database import get_db
from core.security import get_current_user
from core.config import settings

# Variables de entorno para WhatsApp (fallback cuando no hay config en DB)
WHATSAPP_PHONE_NUMBER_ID = settings.WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN = settings.WHATSAPP_ACCESS_TOKEN
WHATSAPP_BUSINESS_ACCOUNT_ID = settings.WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN = settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN
from models import User, Reclamo, Categoria, Zona, Notificacion
from models.enums import EstadoReclamo, RolUsuario
from models.whatsapp_config import WhatsAppConfig, WhatsAppLog, WhatsAppProvider
from schemas.whatsapp import (
    WhatsAppConfigCreate, WhatsAppConfigUpdate, WhatsAppConfigResponse, WhatsAppConfigPublic,
    WhatsAppTestMessage, WhatsAppTestResponse, WhatsAppLogResponse, WhatsAppStats
)

router = APIRouter()

# Token de verificación por defecto para webhooks
DEFAULT_VERIFY_TOKEN = "reclamos_municipales_2024"

# Estado de conversación por usuario (en memoria - considerar Redis para producción)
conversation_states = {}


class ConversationState:
    """Estado de una conversación en curso"""
    def __init__(self, phone: str):
        self.phone = phone
        self.step = "inicio"
        self.data = {
            "titulo": None,
            "descripcion": None,
            "categoria_id": None,
            "direccion": None,
            "latitud": None,
            "longitud": None,
        }


# ===========================================
# ENDPOINTS DE CONFIGURACIÓN
# ===========================================

@router.get("/config", response_model=WhatsAppConfigPublic)
async def get_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene la configuración de WhatsApp del municipio (vista pública sin credenciales)"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="No autorizado")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        # Retornar config vacía si no existe
        return WhatsAppConfigPublic(
            id=0,
            municipio_id=current_user.municipio_id,
            habilitado=False,
            provider=WhatsAppProvider.META,
            meta_configurado=False,
            twilio_configurado=False,
            notificar_reclamo_recibido=True,
            notificar_reclamo_asignado=True,
            notificar_cambio_estado=True,
            notificar_reclamo_resuelto=True,
            notificar_comentarios=False,
            created_at=datetime.utcnow(),
            updated_at=None
        )

    return WhatsAppConfigPublic(
        id=config.id,
        municipio_id=config.municipio_id,
        habilitado=config.habilitado,
        provider=config.provider,
        meta_configurado=bool(config.meta_phone_number_id and config.meta_access_token),
        twilio_configurado=bool(config.twilio_account_sid and config.twilio_auth_token),
        notificar_reclamo_recibido=config.notificar_reclamo_recibido,
        notificar_reclamo_asignado=config.notificar_reclamo_asignado,
        notificar_cambio_estado=config.notificar_cambio_estado,
        notificar_reclamo_resuelto=config.notificar_reclamo_resuelto,
        notificar_comentarios=config.notificar_comentarios,
        created_at=config.created_at,
        updated_at=config.updated_at
    )


@router.get("/config/full", response_model=WhatsAppConfigResponse)
async def get_config_full(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene la configuración completa de WhatsApp (admin o supervisor)"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="Solo administradores o supervisores")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    return config


@router.post("/config", response_model=WhatsAppConfigResponse)
async def create_config(
    config_data: WhatsAppConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea la configuración de WhatsApp para el municipio"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="Solo administradores o supervisores")

    # Verificar si ya existe
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe configuración. Use PUT para actualizar.")

    config = WhatsAppConfig(
        municipio_id=current_user.municipio_id,
        **config_data.model_dump()
    )

    db.add(config)
    await db.commit()
    await db.refresh(config)

    return config


@router.put("/config", response_model=WhatsAppConfigResponse)
async def update_config(
    config_data: WhatsAppConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza la configuración de WhatsApp"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="Solo administradores o supervisores")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        # Crear si no existe
        config = WhatsAppConfig(municipio_id=current_user.municipio_id)
        db.add(config)

    # Actualizar solo campos proporcionados
    update_data = config_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(config, field, value)

    config.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(config)

    return config


@router.delete("/config")
async def delete_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina la configuración de WhatsApp"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="Solo administradores o supervisores")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    await db.delete(config)
    await db.commit()

    return {"message": "Configuración eliminada"}


# ===========================================
# ENDPOINTS DE TEST
# ===========================================

@router.post("/test", response_model=WhatsAppTestResponse)
async def test_whatsapp(
    test_data: WhatsAppTestMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía un mensaje de prueba para verificar la configuración"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="Solo administradores o supervisores")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        return WhatsAppTestResponse(
            success=False,
            message="Configuración no encontrada",
            error="No hay configuración de WhatsApp para este municipio"
        )

    mensaje = test_data.mensaje or "🧪 Este es un mensaje de prueba del Sistema de Reclamos Municipales."

    try:
        message_id = await send_whatsapp_message_with_config(
            config=config,
            to=test_data.telefono,
            message=mensaje,
            db=db,
            tipo_mensaje="test"
        )

        return WhatsAppTestResponse(
            success=True,
            message="Mensaje enviado correctamente",
            message_id=message_id
        )
    except Exception as e:
        return WhatsAppTestResponse(
            success=False,
            message="Error al enviar mensaje",
            error=str(e)
        )


# ===========================================
# ENDPOINTS DE LOGS
# ===========================================

@router.get("/logs", response_model=List[WhatsAppLogResponse])
async def get_logs(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene los logs de mensajes de WhatsApp"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="No autorizado")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        return []

    result = await db.execute(
        select(WhatsAppLog)
        .where(WhatsAppLog.config_id == config.id)
        .order_by(WhatsAppLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    return result.scalars().all()


@router.get("/logs/reclamo/{reclamo_id}", response_model=List[WhatsAppLogResponse])
async def get_logs_by_reclamo(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene los logs de mensajes de WhatsApp para un reclamo específico"""
    # Verificar que el reclamo existe
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar permisos: admin/supervisor pueden ver todos, vecinos solo sus propios reclamos
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")

    # Obtener logs de WhatsApp para este reclamo
    result = await db.execute(
        select(WhatsAppLog)
        .where(WhatsAppLog.reclamo_id == reclamo_id)
        .order_by(WhatsAppLog.created_at.asc())
    )

    return result.scalars().all()


@router.get("/stats", response_model=WhatsAppStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene estadísticas de mensajes de WhatsApp"""
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        raise HTTPException(status_code=403, detail="No autorizado")

    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        return WhatsAppStats()

    # Total enviados
    result = await db.execute(
        select(func.count(WhatsAppLog.id))
        .where(WhatsAppLog.config_id == config.id, WhatsAppLog.enviado == True)
    )
    total_enviados = result.scalar() or 0

    # Total fallidos
    result = await db.execute(
        select(func.count(WhatsAppLog.id))
        .where(WhatsAppLog.config_id == config.id, WhatsAppLog.enviado == False)
    )
    total_fallidos = result.scalar() or 0

    # Enviados hoy
    hoy = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    result = await db.execute(
        select(func.count(WhatsAppLog.id))
        .where(
            WhatsAppLog.config_id == config.id,
            WhatsAppLog.enviado == True,
            WhatsAppLog.created_at >= hoy
        )
    )
    enviados_hoy = result.scalar() or 0

    # Enviados esta semana
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    result = await db.execute(
        select(func.count(WhatsAppLog.id))
        .where(
            WhatsAppLog.config_id == config.id,
            WhatsAppLog.enviado == True,
            WhatsAppLog.created_at >= inicio_semana
        )
    )
    enviados_semana = result.scalar() or 0

    # Por tipo
    result = await db.execute(
        select(WhatsAppLog.tipo_mensaje, func.count(WhatsAppLog.id))
        .where(WhatsAppLog.config_id == config.id, WhatsAppLog.enviado == True)
        .group_by(WhatsAppLog.tipo_mensaje)
    )
    por_tipo = {row[0]: row[1] for row in result.all()}

    return WhatsAppStats(
        total_enviados=total_enviados,
        total_fallidos=total_fallidos,
        enviados_hoy=enviados_hoy,
        enviados_semana=enviados_semana,
        por_tipo=por_tipo
    )


# ===========================================
# WEBHOOKS
# ===========================================

@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    municipio_id: int = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Verificación del webhook de WhatsApp."""
    if hub_mode != "subscribe":
        raise HTTPException(status_code=403, detail="Modo inválido")

    # Si se proporciona municipio_id, buscar su token
    verify_token = DEFAULT_VERIFY_TOKEN
    if municipio_id:
        result = await db.execute(
            select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == municipio_id)
        )
        config = result.scalar_one_or_none()
        if config and config.meta_webhook_verify_token:
            verify_token = config.meta_webhook_verify_token

    if hub_verify_token == verify_token:
        return int(hub_challenge)

    raise HTTPException(status_code=403, detail="Token de verificación inválido")


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Recibe mensajes de WhatsApp y los procesa."""
    try:
        body = await request.json()

        if "entry" not in body:
            return {"status": "ok"}

        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])

                for message in messages:
                    await process_message(message, db)

        return {"status": "ok"}

    except Exception as e:
        print(f"Error procesando webhook: {e}")
        return {"status": "error", "message": str(e)}


# ===========================================
# NOTIFICACIONES AUTOMÁTICAS
# ===========================================

@router.post("/notificar/reclamo-recibido/{reclamo_id}")
async def notificar_reclamo_recibido(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía notificación de reclamo recibido"""
    return await enviar_notificacion_reclamo(
        reclamo_id, db, current_user, "reclamo_recibido",
        "✅ *Reclamo Recibido*\n\n"
        "Tu reclamo *#{id}* ha sido registrado.\n\n"
        "📝 *{titulo}*\n"
        "_{descripcion}_\n\n"
        "🔗 Ver detalle: {url}\n\n"
        "Te notificaremos cuando haya actualizaciones."
    )


@router.post("/notificar/reclamo-asignado/{reclamo_id}")
async def notificar_reclamo_asignado(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía notificación de reclamo asignado"""
    return await enviar_notificacion_reclamo(
        reclamo_id, db, current_user, "reclamo_asignado",
        "👷 *Reclamo Asignado*\n\n"
        "Tu reclamo *#{id}* ha sido asignado a un técnico.\n\n"
        "📝 *{titulo}*\n"
        "_{descripcion}_\n\n"
        "🔗 Ver detalle y agregar comentarios: {url}\n\n"
        "Pronto comenzarán a trabajar en él."
    )


@router.post("/notificar/cambio-estado/{reclamo_id}")
async def notificar_cambio_estado(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía notificación de cambio de estado"""
    return await enviar_notificacion_reclamo(
        reclamo_id, db, current_user, "cambio_estado",
        "🔄 *Actualización de Reclamo*\n\n"
        "Tu reclamo *#{id}* ha cambiado a: *{estado}*\n\n"
        "📝 *{titulo}*\n"
        "_{descripcion}_\n\n"
        "🔗 Ver detalle y agregar comentarios: {url}"
    )


@router.post("/notificar/reclamo-resuelto/{reclamo_id}")
async def notificar_reclamo_resuelto(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía notificación de reclamo resuelto"""
    return await enviar_notificacion_reclamo(
        reclamo_id, db, current_user, "reclamo_resuelto",
        "✅ *¡Reclamo Resuelto!*\n\n"
        "Tu reclamo *#{id}* ha sido resuelto.\n\n"
        "📝 *{titulo}*\n"
        "_{descripcion}_\n\n"
        "🔗 Ver detalle y calificar: {url}\n\n"
        "¡Gracias por tu paciencia! Por favor califica la atención recibida."
    )


async def enviar_notificacion_reclamo(
    reclamo_id: int,
    db: AsyncSession,
    current_user: User,
    tipo: str,
    plantilla: str
):
    """Helper para enviar notificaciones de reclamo"""
    # Obtener reclamo
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Obtener config
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if not config or not config.habilitado:
        raise HTTPException(status_code=400, detail="WhatsApp no configurado o deshabilitado")

    # Obtener usuario creador
    result = await db.execute(
        select(User).where(User.id == reclamo.creador_id)
    )
    user = result.scalar_one_or_none()

    if not user or not user.telefono:
        raise HTTPException(status_code=400, detail="Usuario sin teléfono registrado")

    # Formatear mensaje
    estado_texto = reclamo.estado.value.replace('_', ' ').title() if reclamo.estado else "Desconocido"
    # Truncar descripción si es muy larga
    descripcion_corta = reclamo.descripcion[:150] + "..." if len(reclamo.descripcion) > 150 else reclamo.descripcion
    # Construir URL del reclamo
    reclamo_url = f"{settings.FRONTEND_URL}/reclamos/{reclamo.id}"

    mensaje = plantilla.format(
        id=reclamo.id,
        titulo=reclamo.titulo,
        estado=estado_texto,
        descripcion=descripcion_corta,
        url=reclamo_url
    )

    try:
        message_id = await send_whatsapp_message_with_config(
            config=config,
            to=user.telefono,
            message=mensaje,
            db=db,
            tipo_mensaje=tipo,
            usuario_id=user.id,
            reclamo_id=reclamo.id
        )
        return {"success": True, "message_id": message_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando mensaje: {str(e)}")


# Endpoint para enviar notificación manual (retrocompatibilidad)
@router.post("/send-notification/{reclamo_id}")
async def send_notification(
    reclamo_id: int,
    message: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envía notificación personalizada de WhatsApp al creador de un reclamo"""
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Obtener teléfono del creador
    result = await db.execute(
        select(User).where(User.id == reclamo.creador_id)
    )
    user = result.scalar_one_or_none()

    if not user or not user.telefono:
        raise HTTPException(status_code=400, detail="Usuario sin teléfono registrado")

    # Obtener config
    result = await db.execute(
        select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()

    if config and config.habilitado:
        message_id = await send_whatsapp_message_with_config(
            config=config,
            to=user.telefono,
            message=message,
            db=db,
            tipo_mensaje="manual",
            usuario_id=user.id,
            reclamo_id=reclamo.id
        )
        return {"status": "sent", "to": user.telefono, "message_id": message_id}
    else:
        # Fallback sin config
        await send_whatsapp_message(user.telefono, message)
        return {"status": "sent", "to": user.telefono}


# ===========================================
# FUNCIONES DE ENVÍO DE MENSAJES
# ===========================================

async def send_whatsapp_message_with_config(
    config: WhatsAppConfig,
    to: str,
    message: str,
    db: AsyncSession,
    tipo_mensaje: str = "general",
    usuario_id: int = None,
    reclamo_id: int = None
) -> Optional[str]:
    """Envía mensaje usando la configuración del municipio y registra en logs"""

    # Crear log
    log = WhatsAppLog(
        config_id=config.id,
        telefono=to,
        tipo_mensaje=tipo_mensaje,
        mensaje=message[:500] if message else None,
        usuario_id=usuario_id,
        reclamo_id=reclamo_id,
        enviado=False
    )
    db.add(log)

    try:
        message_id = None

        if config.provider == WhatsAppProvider.META:
            message_id = await send_via_meta(config, to, message)
        elif config.provider == WhatsAppProvider.TWILIO:
            message_id = await send_via_twilio(config, to, message)

        log.enviado = True
        log.message_id = message_id
        await db.commit()

        return message_id

    except Exception as e:
        log.error = str(e)[:500]
        await db.commit()
        raise


async def send_via_meta(config: WhatsAppConfig, to: str, message: str) -> Optional[str]:
    """Envía mensaje via Meta Cloud API"""
    # Usar config de DB o fallback a variables de entorno
    phone_number_id = config.meta_phone_number_id or WHATSAPP_PHONE_NUMBER_ID
    access_token = config.meta_access_token or WHATSAPP_ACCESS_TOKEN

    if not phone_number_id or not access_token:
        raise ValueError("Configuración de Meta incompleta. Configure en DB o variables de entorno.")

    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": message}
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            error_data = response.json() if response.text else {}
            raise ValueError(f"Error de Meta API: {error_data}")

        data = response.json()
        return data.get("messages", [{}])[0].get("id")


async def send_via_twilio(config: WhatsAppConfig, to: str, message: str) -> Optional[str]:
    """Envía mensaje via Twilio"""
    if not config.twilio_account_sid or not config.twilio_auth_token or not config.twilio_phone_number:
        raise ValueError("Configuración de Twilio incompleta")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{config.twilio_account_sid}/Messages.json"

    # Asegurar formato de número WhatsApp
    to_whatsapp = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
    from_whatsapp = config.twilio_phone_number if config.twilio_phone_number.startswith("whatsapp:") else f"whatsapp:{config.twilio_phone_number}"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            auth=(config.twilio_account_sid, config.twilio_auth_token),
            data={
                "To": to_whatsapp,
                "From": from_whatsapp,
                "Body": message
            }
        )

        if response.status_code not in [200, 201]:
            error_data = response.json() if response.text else {}
            raise ValueError(f"Error de Twilio: {error_data}")

        data = response.json()
        return data.get("sid")


async def send_whatsapp_message(to: str, message: str):
    """Envía un mensaje de WhatsApp usando variables de entorno (fallback sin config de DB)"""
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        print(f"[WhatsApp Mock] To: {to}\nMessage: {message}\n")
        return

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": message}
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                print(f"Error enviando WhatsApp: {response.text}")
            else:
                print(f"[WhatsApp] Mensaje enviado a {to}")
    except Exception as e:
        print(f"Error enviando WhatsApp: {e}")


# ===========================================
# FLUJO DE CONVERSACIÓN (CHATBOT)
# ===========================================

async def process_message(message: dict, db: AsyncSession):
    """Procesa un mensaje individual de WhatsApp"""
    msg_type = message.get("type")
    phone = message.get("from")

    if not phone:
        return

    # Obtener o crear estado de conversación
    if phone not in conversation_states:
        conversation_states[phone] = ConversationState(phone)

    state = conversation_states[phone]

    # Procesar según tipo de mensaje
    if msg_type == "text":
        text = message.get("text", {}).get("body", "").strip()
        await handle_text_message(phone, text, state, db)

    elif msg_type == "location":
        location = message.get("location", {})
        await handle_location_message(phone, location, state, db)

    elif msg_type == "image":
        await send_whatsapp_message(
            phone,
            "Recibimos tu imagen. Por ahora solo procesamos texto y ubicación."
        )


async def handle_text_message(phone: str, text: str, state: ConversationState, db: AsyncSession):
    """Maneja mensajes de texto según el paso de la conversación"""

    text_lower = text.lower()

    # Comandos especiales
    if text_lower in ["hola", "inicio", "empezar", "menu", "menú"]:
        state.step = "inicio"
        state.data = {k: None for k in state.data}
        await send_welcome_message(phone)
        return

    if text_lower in ["cancelar", "salir"]:
        state.step = "inicio"
        state.data = {k: None for k in state.data}
        await send_whatsapp_message(phone, "Operación cancelada. Escribe 'hola' para comenzar de nuevo.")
        return

    if text_lower in ["estado", "mis reclamos", "consultar"]:
        await send_user_reclamos(phone, db)
        return

    # Flujo de creación de reclamo
    if state.step == "inicio":
        if text_lower in ["1", "nuevo", "nuevo reclamo", "crear"]:
            state.step = "titulo"
            await send_whatsapp_message(
                phone,
                "📝 *Nuevo Reclamo*\n\n"
                "Por favor, escribe un *título breve* para tu reclamo.\n"
                "Ejemplo: 'Bache en la calle principal'"
            )
        elif text_lower in ["2", "consultar", "ver"]:
            await send_user_reclamos(phone, db)
        else:
            await send_welcome_message(phone)

    elif state.step == "titulo":
        if len(text) < 5:
            await send_whatsapp_message(phone, "El título debe tener al menos 5 caracteres. Intenta de nuevo:")
            return
        state.data["titulo"] = text
        state.step = "descripcion"
        await send_whatsapp_message(
            phone,
            "✅ Título guardado.\n\n"
            "Ahora escribe una *descripción detallada* del problema:"
        )

    elif state.step == "descripcion":
        if len(text) < 10:
            await send_whatsapp_message(phone, "La descripción debe ser más detallada. Intenta de nuevo:")
            return
        state.data["descripcion"] = text
        state.step = "categoria"
        await send_categorias(phone, db)

    elif state.step == "categoria":
        categoria = await find_categoria(text, db)
        if categoria:
            state.data["categoria_id"] = categoria.id
            state.step = "direccion"
            await send_whatsapp_message(
                phone,
                f"✅ Categoría: *{categoria.nombre}*\n\n"
                "Ahora escribe la *dirección* donde está el problema:\n"
                "Ejemplo: 'Av. San Martín 1234, entre Belgrano y Moreno'"
            )
        else:
            await send_whatsapp_message(phone, "No encontré esa categoría. Por favor elige un número de la lista:")
            await send_categorias(phone, db)

    elif state.step == "direccion":
        state.data["direccion"] = text
        state.step = "ubicacion"
        await send_whatsapp_message(
            phone,
            "✅ Dirección guardada.\n\n"
            "📍 *Opcional:* Comparte tu ubicación actual para mayor precisión.\n\n"
            "• Toca el clip 📎 → Ubicación → Enviar ubicación actual\n"
            "• O escribe *omitir* para continuar sin ubicación"
        )

    elif state.step == "ubicacion":
        if text_lower in ["omitir", "no", "siguiente", "continuar"]:
            state.step = "confirmar"
            await send_confirmation(phone, state, db)
        else:
            await send_whatsapp_message(
                phone,
                "Por favor comparte tu ubicación o escribe *omitir* para continuar."
            )

    elif state.step == "confirmar":
        if text_lower in ["si", "sí", "confirmar", "enviar", "1"]:
            await create_reclamo_from_whatsapp(phone, state, db)
        elif text_lower in ["no", "cancelar", "2"]:
            state.step = "inicio"
            state.data = {k: None for k in state.data}
            await send_whatsapp_message(phone, "Reclamo cancelado. Escribe 'hola' para comenzar de nuevo.")
        else:
            await send_whatsapp_message(phone, "Por favor responde *sí* para confirmar o *no* para cancelar.")


async def handle_location_message(phone: str, location: dict, state: ConversationState, db: AsyncSession):
    """Maneja mensajes de ubicación"""
    if state.step == "ubicacion":
        state.data["latitud"] = location.get("latitude")
        state.data["longitud"] = location.get("longitude")
        state.step = "confirmar"
        await send_whatsapp_message(phone, "✅ Ubicación recibida.")
        await send_confirmation(phone, state, db)
    else:
        await send_whatsapp_message(
            phone,
            "Gracias por la ubicación, pero no estamos en ese paso del proceso.\n"
            "Escribe 'hola' para comenzar."
        )


async def send_welcome_message(phone: str):
    """Envía mensaje de bienvenida"""
    await send_whatsapp_message(
        phone,
        "🏛️ *Sistema de Reclamos Municipales*\n\n"
        "¡Hola! Soy el asistente virtual para reclamos.\n\n"
        "¿Qué deseas hacer?\n\n"
        "*1.* 📝 Crear nuevo reclamo\n"
        "*2.* 🔍 Consultar mis reclamos\n\n"
        "Escribe el número de la opción o el nombre."
    )


async def send_categorias(phone: str, db: AsyncSession):
    """Envía lista de categorías disponibles"""
    result = await db.execute(
        select(Categoria).where(Categoria.activo == True).order_by(Categoria.nombre)
    )
    categorias = result.scalars().all()

    if not categorias:
        await send_whatsapp_message(phone, "No hay categorías disponibles. Contacta al municipio.")
        return

    msg = "📋 *Selecciona una categoría:*\n\n"
    for i, cat in enumerate(categorias, 1):
        emoji = get_categoria_emoji(cat.nombre)
        msg += f"*{i}.* {emoji} {cat.nombre}\n"

    msg += "\nEscribe el *número* de la categoría:"
    await send_whatsapp_message(phone, msg)


def get_categoria_emoji(nombre: str) -> str:
    """Retorna emoji según categoría"""
    nombre_lower = nombre.lower()
    emojis = {
        "bache": "🕳️",
        "alumbrado": "💡",
        "basura": "🗑️",
        "agua": "💧",
        "arbol": "🌳",
        "árbol": "🌳",
        "transito": "🚦",
        "tránsito": "🚦",
        "vereda": "🚶",
        "cloacas": "🚽",
        "electricidad": "⚡",
    }
    for key, emoji in emojis.items():
        if key in nombre_lower:
            return emoji
    return "📌"


async def find_categoria(text: str, db: AsyncSession) -> Optional[Categoria]:
    """Busca categoría por número o nombre"""
    result = await db.execute(
        select(Categoria).where(Categoria.activo == True).order_by(Categoria.nombre)
    )
    categorias = result.scalars().all()

    if text.isdigit():
        idx = int(text) - 1
        if 0 <= idx < len(categorias):
            return categorias[idx]

    text_lower = text.lower()
    for cat in categorias:
        if text_lower in cat.nombre.lower():
            return cat

    return None


async def send_confirmation(phone: str, state: ConversationState, db: AsyncSession):
    """Envía mensaje de confirmación antes de crear el reclamo"""
    cat_name = "No especificada"
    if state.data["categoria_id"]:
        result = await db.execute(
            select(Categoria).where(Categoria.id == state.data["categoria_id"])
        )
        cat = result.scalar_one_or_none()
        if cat:
            cat_name = cat.nombre

    ubicacion = "No proporcionada"
    if state.data["latitud"] and state.data["longitud"]:
        ubicacion = f"📍 {state.data['latitud']}, {state.data['longitud']}"

    msg = (
        "📋 *Resumen de tu reclamo:*\n\n"
        f"*Título:* {state.data['titulo']}\n"
        f"*Descripción:* {state.data['descripcion']}\n"
        f"*Categoría:* {cat_name}\n"
        f"*Dirección:* {state.data['direccion']}\n"
        f"*Ubicación:* {ubicacion}\n\n"
        "¿Confirmas el envío?\n"
        "*1.* ✅ Sí, enviar\n"
        "*2.* ❌ No, cancelar"
    )
    await send_whatsapp_message(phone, msg)


async def create_reclamo_from_whatsapp(phone: str, state: ConversationState, db: AsyncSession):
    """Crea el reclamo en la base de datos"""
    try:
        user = await get_or_create_user(phone, db)

        reclamo = Reclamo(
            titulo=state.data["titulo"],
            descripcion=state.data["descripcion"],
            categoria_id=state.data["categoria_id"],
            direccion=state.data["direccion"],
            latitud=state.data["latitud"],
            longitud=state.data["longitud"],
            estado=EstadoReclamo.nuevo,
            prioridad=2,
            creador_id=user.id,
        )

        db.add(reclamo)
        await db.commit()
        await db.refresh(reclamo)

        state.step = "inicio"
        state.data = {k: None for k in state.data}

        await send_whatsapp_message(
            phone,
            f"✅ *¡Reclamo creado exitosamente!*\n\n"
            f"*Número de reclamo:* #{reclamo.id}\n\n"
            f"Puedes consultar el estado escribiendo *estado* o *mis reclamos*.\n\n"
            f"Te notificaremos cuando haya novedades. ¡Gracias por reportar!"
        )

    except Exception as e:
        print(f"Error creando reclamo: {e}")
        await send_whatsapp_message(
            phone,
            "❌ Hubo un error al crear el reclamo. Por favor intenta de nuevo más tarde."
        )


async def get_or_create_user(phone: str, db: AsyncSession) -> User:
    """Obtiene o crea un usuario por número de teléfono"""
    phone_clean = re.sub(r'\D', '', phone)

    result = await db.execute(
        select(User).where(User.telefono == phone_clean)
    )
    user = result.scalar_one_or_none()

    if user:
        return user

    user = User(
        email=f"whatsapp_{phone_clean}@temporal.local",
        nombre="Usuario",
        apellido="WhatsApp",
        telefono=phone_clean,
        rol=RolUsuario.vecino,
        activo=True,
        password_hash="whatsapp_user_no_login",
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


async def send_user_reclamos(phone: str, db: AsyncSession):
    """Envía lista de reclamos del usuario"""
    phone_clean = re.sub(r'\D', '', phone)

    result = await db.execute(
        select(User).where(User.telefono == phone_clean)
    )
    user = result.scalar_one_or_none()

    if not user:
        await send_whatsapp_message(
            phone,
            "No encontré reclamos asociados a este número.\n"
            "Escribe *hola* para crear un nuevo reclamo."
        )
        return

    result = await db.execute(
        select(Reclamo)
        .where(Reclamo.creador_id == user.id)
        .order_by(Reclamo.created_at.desc())
        .limit(5)
    )
    reclamos = result.scalars().all()

    if not reclamos:
        await send_whatsapp_message(
            phone,
            "No tienes reclamos registrados.\n"
            "Escribe *hola* para crear uno nuevo."
        )
        return

    msg = "📋 *Tus últimos reclamos:*\n\n"
    for r in reclamos:
        estado_emoji = {
            "nuevo": "🆕",
            "asignado": "👤",
            "en_proceso": "🔧",
            "resuelto": "✅",
            "rechazado": "❌",
        }.get(r.estado.value, "❓")

        msg += f"*#{r.id}* - {estado_emoji} {r.estado.value.replace('_', ' ').title()}\n"
        msg += f"📝 {r.titulo[:30]}...\n\n"

    msg += "Escribe *hola* para crear un nuevo reclamo."
    await send_whatsapp_message(phone, msg)
