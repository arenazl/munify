"""
Servicio centralizado de notificaciones.
Maneja notificaciones in-app, WhatsApp y Push de forma unificada.
Las plantillas se cargan desde config/notificaciones.json
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List, Dict, Any
from pathlib import Path
import json
import logging

from models.notificacion import Notificacion
from models.user import User
from models.reclamo import Reclamo
from models.empleado import Empleado
from models.whatsapp_config import WhatsAppConfig
from models.enums import RolUsuario
from core.config import settings

logger = logging.getLogger(__name__)

# ============================================
# SISTEMA DE PLANTILLAS JSON
# ============================================

CONFIG_PATH = Path(__file__).parent.parent / "config" / "notificaciones.json"
_plantillas_cache: Optional[dict] = None


def get_plantillas() -> dict:
    """Obtiene las plantillas de notificaciones (con cache)"""
    global _plantillas_cache
    if _plantillas_cache is None:
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                _plantillas_cache = json.load(f)
        except FileNotFoundError:
            logger.warning(f"Archivo de plantillas no encontrado: {CONFIG_PATH}")
            _plantillas_cache = {"tipos": {}, "variables": {}}
    return _plantillas_cache


def reload_plantillas():
    """Recarga las plantillas desde el archivo"""
    global _plantillas_cache
    _plantillas_cache = None
    return get_plantillas()


def get_plantilla(tipo: str) -> Optional[dict]:
    """Obtiene la plantilla de un tipo de notificación"""
    config = get_plantillas()
    return config.get("tipos", {}).get(tipo)


def formatear_mensaje(plantilla: str, variables: Dict[str, Any]) -> str:
    """
    Reemplaza las variables en una plantilla.
    Ejemplo: "Hola {nombre}" + {"nombre": "Juan"} = "Hola Juan"
    """
    mensaje = plantilla
    for key, value in variables.items():
        mensaje = mensaje.replace(f"{{{key}}}", str(value) if value else "")
    return mensaje


def preparar_variables_reclamo(reclamo, usuario=None, **extras) -> Dict[str, Any]:
    """Prepara las variables comunes de un reclamo para las plantillas."""
    descripcion_corta = ""
    if reclamo.descripcion:
        descripcion_corta = reclamo.descripcion[:50] + "..." if len(reclamo.descripcion) > 50 else reclamo.descripcion

    descripcion_wp = ""
    if reclamo.descripcion:
        descripcion_wp = reclamo.descripcion[:150] + "..." if len(reclamo.descripcion) > 150 else reclamo.descripcion

    variables = {
        "reclamo_id": reclamo.id,
        "titulo": reclamo.titulo or "",
        "descripcion": descripcion_wp,
        "descripcion_corta": descripcion_corta,
        "direccion": reclamo.direccion or "No especificada",
        "url": f"{settings.FRONTEND_URL}/reclamos/{reclamo.id}",
    }

    if hasattr(reclamo, 'estado') and reclamo.estado:
        variables["estado_nuevo"] = reclamo.estado.value.replace('_', ' ').title()

    if hasattr(reclamo, 'categoria') and reclamo.categoria:
        variables["categoria"] = reclamo.categoria.nombre

    if hasattr(reclamo, 'zona') and reclamo.zona:
        variables["zona"] = reclamo.zona.nombre

    if usuario:
        variables["nombre"] = usuario.nombre

    variables.update(extras)
    return variables


def listar_tipos_notificacion() -> list:
    """Lista todos los tipos de notificación disponibles"""
    config = get_plantillas()
    return [
        {"id": key, "nombre": v.get("nombre"), "descripcion": v.get("descripcion"), "destinatario": v.get("destinatario")}
        for key, v in config.get("tipos", {}).items()
    ]


def listar_variables_disponibles() -> dict:
    """Lista las variables disponibles para las plantillas"""
    config = get_plantillas()
    return config.get("variables", {})


class NotificacionService:
    """Servicio para enviar notificaciones in-app y WhatsApp"""

    @staticmethod
    async def crear_notificacion_inapp(
        db: AsyncSession,
        usuario_id: int,
        titulo: str,
        mensaje: str,
        tipo: str = "info",
        reclamo_id: Optional[int] = None
    ) -> Notificacion:
        """Crea una notificación in-app para un usuario"""
        notificacion = Notificacion(
            usuario_id=usuario_id,
            titulo=titulo,
            mensaje=mensaje,
            tipo=tipo,
            reclamo_id=reclamo_id
        )
        db.add(notificacion)
        await db.flush()
        return notificacion

    @staticmethod
    async def notificar_supervisores(
        db: AsyncSession,
        municipio_id: int,
        titulo: str,
        mensaje: str,
        tipo: str = "info",
        reclamo_id: Optional[int] = None,
        enviar_whatsapp: bool = True
    ) -> List[int]:
        """
        Notifica a todos los supervisores y admins de un municipio.
        Envía notificación in-app y opcionalmente WhatsApp.
        Retorna lista de IDs de usuarios notificados.
        """
        # Buscar supervisores y admins del municipio
        result = await db.execute(
            select(User).where(
                User.municipio_id == municipio_id,
                User.activo == True,
                User.rol.in_([RolUsuario.SUPERVISOR, RolUsuario.ADMIN])
            )
        )
        supervisores = result.scalars().all()

        notificados = []
        for supervisor in supervisores:
            # Notificación in-app
            await NotificacionService.crear_notificacion_inapp(
                db=db,
                usuario_id=supervisor.id,
                titulo=titulo,
                mensaje=mensaje,
                tipo=tipo,
                reclamo_id=reclamo_id
            )
            notificados.append(supervisor.id)

            # WhatsApp si está habilitado y tiene teléfono
            if enviar_whatsapp and supervisor.telefono:
                try:
                    await NotificacionService._enviar_whatsapp(
                        db=db,
                        municipio_id=municipio_id,
                        telefono=supervisor.telefono,
                        mensaje=mensaje,
                        usuario_id=supervisor.id,
                        reclamo_id=reclamo_id,
                        tipo_mensaje="notificacion_supervisor"
                    )
                except Exception as e:
                    print(f"Error enviando WhatsApp a supervisor {supervisor.id}: {e}")

        return notificados

    @staticmethod
    async def notificar_vecino(
        db: AsyncSession,
        reclamo: Reclamo,
        titulo: str,
        mensaje: str,
        tipo: str = "info",
        tipo_whatsapp: str = "cambio_estado",
        enviar_whatsapp: bool = True
    ):
        """
        Notifica al creador del reclamo.
        Envía notificación in-app y opcionalmente WhatsApp.
        NO notifica a usuarios anónimos.
        """
        # Obtener el usuario creador
        result = await db.execute(
            select(User).where(User.id == reclamo.creador_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            return

        # No notificar a usuarios anónimos
        if user.es_anonimo:
            print(f"   Notificación omitida: usuario {user.id} es anónimo")
            return

        # Notificación in-app
        await NotificacionService.crear_notificacion_inapp(
            db=db,
            usuario_id=user.id,
            titulo=titulo,
            mensaje=mensaje,
            tipo=tipo,
            reclamo_id=reclamo.id
        )

        # WhatsApp si está habilitado
        if enviar_whatsapp and user.telefono:
            # Obtener configuración WhatsApp
            result = await db.execute(
                select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == reclamo.municipio_id)
            )
            config = result.scalar_one_or_none()

            if config and config.habilitado:
                # Verificar si el tipo de notificación está habilitado
                notif_habilitada = {
                    'reclamo_recibido': config.notificar_reclamo_recibido,
                    'reclamo_asignado': config.notificar_reclamo_asignado,
                    'cambio_estado': config.notificar_cambio_estado,
                    'reclamo_resuelto': config.notificar_reclamo_resuelto,
                }.get(tipo_whatsapp, True)

                if notif_habilitada:
                    try:
                        await NotificacionService._enviar_whatsapp(
                            db=db,
                            municipio_id=reclamo.municipio_id,
                            telefono=user.telefono,
                            mensaje=mensaje,
                            usuario_id=user.id,
                            reclamo_id=reclamo.id,
                            tipo_mensaje=tipo_whatsapp
                        )
                    except Exception as e:
                        print(f"Error enviando WhatsApp a vecino {user.id}: {e}")

    @staticmethod
    async def notificar_empleado(
        db: AsyncSession,
        empleado_id: int,
        titulo: str,
        mensaje: str,
        tipo: str = "info",
        reclamo_id: Optional[int] = None,
        enviar_whatsapp: bool = True
    ):
        """
        Notifica a un empleado específico.
        """
        # Obtener el empleado y su usuario asociado
        result = await db.execute(
            select(Empleado).where(Empleado.id == empleado_id)
        )
        empleado = result.scalar_one_or_none()

        if not empleado:
            return

        # Buscar usuario asociado al empleado
        result = await db.execute(
            select(User).where(User.empleado_id == empleado_id)
        )
        user = result.scalar_one_or_none()

        if user:
            # Notificación in-app
            await NotificacionService.crear_notificacion_inapp(
                db=db,
                usuario_id=user.id,
                titulo=titulo,
                mensaje=mensaje,
                tipo=tipo,
                reclamo_id=reclamo_id
            )

        # WhatsApp al teléfono del empleado
        if enviar_whatsapp and empleado.telefono:
            try:
                await NotificacionService._enviar_whatsapp(
                    db=db,
                    municipio_id=empleado.municipio_id,
                    telefono=empleado.telefono,
                    mensaje=mensaje,
                    usuario_id=user.id if user else None,
                    reclamo_id=reclamo_id,
                    tipo_mensaje="notificacion_empleado"
                )
            except Exception as e:
                print(f"Error enviando WhatsApp a empleado {empleado_id}: {e}")

    @staticmethod
    async def _enviar_whatsapp(
        db: AsyncSession,
        municipio_id: int,
        telefono: str,
        mensaje: str,
        usuario_id: Optional[int],
        reclamo_id: Optional[int],
        tipo_mensaje: str
    ):
        """Envía un mensaje WhatsApp usando la configuración del municipio"""
        from api.whatsapp import send_whatsapp_message_with_config

        # Obtener config
        result = await db.execute(
            select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == municipio_id)
        )
        config = result.scalar_one_or_none()

        if not config or not config.habilitado:
            return

        await send_whatsapp_message_with_config(
            config=config,
            to=telefono,
            message=mensaje,
            db=db,
            tipo_mensaje=tipo_mensaje,
            usuario_id=usuario_id,
            reclamo_id=reclamo_id
        )

    @staticmethod
    def generar_link_calificacion(reclamo_id: int) -> str:
        """Genera un link directo para calificar un reclamo"""
        return f"{settings.FRONTEND_URL}/calificar/{reclamo_id}"

    @staticmethod
    def generar_mensaje_resuelto(
        nombre_usuario: str,
        reclamo_id: int,
        titulo_reclamo: str,
        descripcion: str,
        incluir_link_calificacion: bool = True
    ) -> str:
        """Genera el mensaje de reclamo resuelto con link de calificación"""
        descripcion_corta = descripcion[:150] + "..." if len(descripcion) > 150 else descripcion
        link_calificacion = NotificacionService.generar_link_calificacion(reclamo_id)
        reclamo_url = f"{settings.FRONTEND_URL}/reclamos/{reclamo_id}"

        mensaje = (
            f"*Reclamo Resuelto*\n\n"
            f"Hola {nombre_usuario}! Tu reclamo ha sido resuelto.\n\n"
            f"*Numero:* #{reclamo_id}\n"
            f"*Asunto:* {titulo_reclamo}\n"
            f"_{descripcion_corta}_\n\n"
            f"Gracias por tu paciencia!\n\n"
        )

        if incluir_link_calificacion:
            mensaje += (
                f"*Por favor califica la atencion recibida:*\n"
                f"{link_calificacion}\n\n"
                f"Tu opinion nos ayuda a mejorar!"
            )
        else:
            mensaje += f"*Ver detalle:* {reclamo_url}"

        return mensaje

    @staticmethod
    def generar_mensaje_pendiente_confirmacion(
        reclamo_id: int,
        titulo_reclamo: str,
        empleado_nombre: str,
        resolucion: str
    ) -> str:
        """Genera mensaje para supervisores cuando un empleado marca trabajo como terminado"""
        resolucion_corta = resolucion[:200] + "..." if len(resolucion) > 200 else resolucion
        link_reclamo = f"{settings.FRONTEND_URL}/gestion/reclamos/{reclamo_id}"

        return (
            f"*Trabajo Pendiente de Confirmacion*\n\n"
            f"El empleado *{empleado_nombre}* ha marcado como terminado el reclamo:\n\n"
            f"*Numero:* #{reclamo_id}\n"
            f"*Asunto:* {titulo_reclamo}\n\n"
            f"*Resolucion:*\n_{resolucion_corta}_\n\n"
            f"Por favor revisa y confirma el trabajo:\n"
            f"{link_reclamo}"
        )

    # ============================================
    # MÉTODOS CON PLANTILLAS JSON
    # ============================================

    @staticmethod
    async def enviar_con_plantilla(
        db: AsyncSession,
        tipo: str,
        reclamo,
        usuario_destino,
        enviar_push: bool = True,
        enviar_whatsapp: bool = False,
        **variables_extra
    ) -> Dict[str, bool]:
        """
        Envía notificaciones usando las plantillas del JSON.

        Args:
            db: Sesión de base de datos
            tipo: Tipo de notificación (ej: 'reclamo_recibido')
            reclamo: Objeto Reclamo
            usuario_destino: Usuario que recibirá la notificación
            enviar_push: Si enviar notificación push
            enviar_whatsapp: Si enviar WhatsApp
            **variables_extra: Variables adicionales

        Returns:
            Dict con el resultado de cada canal
        """
        resultado = {"push": False, "whatsapp": False, "inapp": False}

        plantilla = get_plantilla(tipo)
        if not plantilla:
            logger.warning(f"Plantilla no encontrada: {tipo}")
            return resultado

        # Preparar variables
        variables = preparar_variables_reclamo(reclamo, usuario_destino, **variables_extra)

        # Push notification
        if enviar_push and usuario_destino:
            try:
                from services.push_service import send_push_to_user

                push_config = plantilla.get("push", {})
                titulo = formatear_mensaje(push_config.get("titulo", "Notificación"), variables)
                cuerpo = formatear_mensaje(push_config.get("cuerpo", ""), variables)

                # Usar sync_session si es AsyncSession
                sync_db = db.sync_session if hasattr(db, 'sync_session') else db

                enviados = send_push_to_user(
                    db=sync_db,
                    user_id=usuario_destino.id,
                    title=titulo,
                    body=cuerpo,
                    url=variables.get("url", "/"),
                    icon=push_config.get("icono", "/favicon.svg"),
                    data={"tipo": tipo, "reclamo_id": reclamo.id}
                )
                resultado["push"] = enviados > 0
                if enviados > 0:
                    logger.info(f"Push '{tipo}' enviado a {usuario_destino.id}: {enviados} dispositivos")
            except Exception as e:
                logger.error(f"Error push '{tipo}': {e}")

        # Notificación in-app
        if usuario_destino:
            try:
                push_config = plantilla.get("push", {})
                titulo = formatear_mensaje(push_config.get("titulo", "Notificación"), variables)
                cuerpo = formatear_mensaje(push_config.get("cuerpo", ""), variables)

                await NotificacionService.crear_notificacion_inapp(
                    db=db,
                    usuario_id=usuario_destino.id,
                    titulo=titulo,
                    mensaje=cuerpo,
                    tipo="info",
                    reclamo_id=reclamo.id
                )
                resultado["inapp"] = True
            except Exception as e:
                logger.error(f"Error inapp '{tipo}': {e}")

        # WhatsApp
        if enviar_whatsapp and usuario_destino and usuario_destino.telefono:
            try:
                wp_config = plantilla.get("whatsapp", {})
                mensaje = formatear_mensaje(wp_config.get("plantilla", ""), variables)

                await NotificacionService._enviar_whatsapp(
                    db=db,
                    municipio_id=reclamo.municipio_id,
                    telefono=usuario_destino.telefono,
                    mensaje=mensaje,
                    usuario_id=usuario_destino.id,
                    reclamo_id=reclamo.id,
                    tipo_mensaje=tipo
                )
                resultado["whatsapp"] = True
            except Exception as e:
                logger.error(f"Error whatsapp '{tipo}': {e}")

        return resultado

    @staticmethod
    async def notificar_reclamo_con_plantilla(
        db: AsyncSession,
        tipo: str,
        reclamo,
        enviar_push: bool = True,
        enviar_whatsapp: bool = True,
        **variables_extra
    ) -> Dict[str, bool]:
        """
        Notifica al creador de un reclamo usando plantillas.
        Atajo para enviar_con_plantilla con el creador del reclamo.
        """
        # Obtener usuario creador
        result = await db.execute(
            select(User).where(User.id == reclamo.creador_id)
        )
        usuario = result.scalar_one_or_none()

        if not usuario:
            return {"push": False, "whatsapp": False, "inapp": False}

        # No notificar a usuarios anónimos
        if usuario.es_anonimo:
            logger.info(f"Notificación omitida: usuario {usuario.id} es anónimo")
            return {"push": False, "whatsapp": False, "inapp": False}

        return await NotificacionService.enviar_con_plantilla(
            db=db,
            tipo=tipo,
            reclamo=reclamo,
            usuario_destino=usuario,
            enviar_push=enviar_push,
            enviar_whatsapp=enviar_whatsapp,
            **variables_extra
        )
