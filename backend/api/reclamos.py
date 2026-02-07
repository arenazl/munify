from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import cloudinary
import cloudinary.uploader
import asyncio

from core.database import get_db
from core.security import get_current_user, get_current_user_optional, require_roles
from core.config import settings
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.documento import Documento
from models.user import User
from models.enums import EstadoReclamo, RolUsuario
from models.whatsapp_config import WhatsAppConfig
from models.municipio_dependencia_categoria import MunicipioDependenciaCategoria
from models.municipio_dependencia import MunicipioDependencia
from schemas.reclamo import (
    ReclamoCreate, ReclamoUpdate, ReclamoResponse,
    ReclamoAsignar, ReclamoRechazar, ReclamoResolver, ReclamoComentario
)
from schemas.historial import HistorialResponse
from services.gamificacion_service import GamificacionService

router = APIRouter()


# ===========================================
# HELPER: NOTIFICACIONES WHATSAPP AUTOMÁTICAS
# ===========================================

async def enviar_notificacion_whatsapp(
    db: AsyncSession,
    reclamo: Reclamo,
    tipo_notificacion: str,
    municipio_id: int
):
    """
    Envía notificación WhatsApp si está configurado y el usuario tiene teléfono.
    tipo_notificacion: 'reclamo_recibido', 'reclamo_asignado', 'cambio_estado', 'reclamo_resuelto'
    """
    print(f"\n{'='*50}", flush=True)
    print(f"📱 WHATSAPP NOTIFICATION", flush=True)
    print(f"{'='*50}", flush=True)
    print(f"   Tipo:      {tipo_notificacion}", flush=True)
    print(f"   Reclamo:   #{reclamo.id} - {reclamo.titulo[:30]}...", flush=True)
    print(f"   Municipio: {municipio_id}", flush=True)

    try:
        # Obtener configuración WhatsApp del municipio
        result = await db.execute(
            select(WhatsAppConfig).where(WhatsAppConfig.municipio_id == municipio_id)
        )
        config = result.scalar_one_or_none()

        if not config:
            print(f"   ❌ SKIP: No hay config WhatsApp para este municipio", flush=True)
            print(f"{'='*50}\n", flush=True)
            return

        if not config.habilitado:
            print(f"   ❌ SKIP: WhatsApp está deshabilitado", flush=True)
            print(f"{'='*50}\n", flush=True)
            return

        # Verificar si este tipo de notificación está habilitado
        notif_habilitada = {
            'reclamo_recibido': config.notificar_reclamo_recibido,
            'reclamo_asignado': config.notificar_reclamo_asignado,
            'cambio_estado': config.notificar_cambio_estado,
            'reclamo_resuelto': config.notificar_reclamo_resuelto,
        }.get(tipo_notificacion, False)

        if not notif_habilitada:
            print(f"   ❌ SKIP: Notificacion '{tipo_notificacion}' deshabilitada", flush=True)
            print(f"{'='*50}\n", flush=True)
            return

        # Obtener usuario creador del reclamo
        result = await db.execute(
            select(User).where(User.id == reclamo.creador_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            print(f"   ❌ SKIP: Usuario creador no encontrado (id={reclamo.creador_id})", flush=True)
            print(f"{'='*50}\n", flush=True)
            return

        if not user.telefono:
            print(f"   ❌ SKIP: Usuario {user.email} sin teléfono", flush=True)
            print(f"{'='*50}\n", flush=True)
            return

        print(f"   Usuario:   {user.nombre} {user.apellido} ({user.email})", flush=True)
        print(f"   Teléfono:  {user.telefono}", flush=True)

        # Importar función de envío (evitar import circular)
        from api.whatsapp import send_whatsapp_message_with_config

        # Preparar mensaje según tipo
        estado_texto = reclamo.estado.value.replace('_', ' ').title() if reclamo.estado else "Desconocido"

        # URL del reclamo para que el usuario pueda verlo
        reclamo_url = f"{settings.FRONTEND_URL}/reclamos/{reclamo.id}"

        # Truncar descripción si es muy larga
        descripcion_corta = reclamo.descripcion[:150] + "..." if len(reclamo.descripcion) > 150 else reclamo.descripcion

        plantillas = {
            'reclamo_recibido': (
                f"✅ *Reclamo Recibido*\n\n"
                f"Hola {user.nombre}! Tu reclamo ha sido registrado correctamente.\n\n"
                f"📋 *Número:* #{reclamo.id}\n"
                f"📝 *Asunto:* {reclamo.titulo}\n"
                f"_{descripcion_corta}_\n\n"
                f"📍 *Ubicación:* {reclamo.direccion or 'No especificada'}\n\n"
                f"Te notificaremos cuando haya novedades.\n\n"
                f"🔗 *Ver detalle:* {reclamo_url}"
            ),
            'reclamo_asignado': (
                f"👷 *Reclamo Asignado*\n\n"
                f"Hola {user.nombre}! Tu reclamo ha sido asignado a un técnico.\n\n"
                f"📋 *Número:* #{reclamo.id}\n"
                f"📝 *Asunto:* {reclamo.titulo}\n"
                f"_{descripcion_corta}_\n\n"
                f"Pronto comenzarán a trabajar en él.\n\n"
                f"💬 Puedes agregar comentarios o información adicional desde el siguiente enlace:\n"
                f"🔗 *Ver detalle:* {reclamo_url}"
            ),
            'cambio_estado': (
                f"🔄 *Actualización de Reclamo*\n\n"
                f"Hola {user.nombre}! Tu reclamo ha cambiado de estado.\n\n"
                f"📋 *Número:* #{reclamo.id}\n"
                f"📝 *Asunto:* {reclamo.titulo}\n"
                f"_{descripcion_corta}_\n\n"
                f"🚦 *Nuevo estado:* {estado_texto}\n\n"
                f"💬 Puedes agregar comentarios desde:\n"
                f"🔗 *Ver detalle:* {reclamo_url}"
            ),
            'reclamo_resuelto': (
                f"✅ *¡Reclamo Resuelto!*\n\n"
                f"Hola {user.nombre}! Tu reclamo ha sido resuelto.\n\n"
                f"📋 *Número:* #{reclamo.id}\n"
                f"📝 *Asunto:* {reclamo.titulo}\n"
                f"_{descripcion_corta}_\n\n"
                f"¡Gracias por tu paciencia!\n\n"
                f"⭐ *Por favor califica la atención recibida:*\n"
                f"🔗 {reclamo_url}"
            ),
        }

        mensaje = plantillas.get(tipo_notificacion, "")
        if not mensaje:
            return

        print(f"   Enviando mensaje...", flush=True)

        # Enviar mensaje
        message_id = await send_whatsapp_message_with_config(
            config=config,
            to=user.telefono,
            message=mensaje,
            db=db,
            tipo_mensaje=tipo_notificacion,
            usuario_id=user.id,
            reclamo_id=reclamo.id
        )
        print(f"   ✅ ENVIADO! Message ID: {message_id}", flush=True)
        print(f"{'='*50}\n", flush=True)

    except Exception as e:
        # No fallar si hay error en WhatsApp, solo loguear
        print(f"   ❌ ERROR: {e}", flush=True)
        print(f"{'='*50}\n", flush=True)


# ===========================================
# HELPER: NOTIFICACIONES PUSH AUTOMÁTICAS
# ===========================================

async def enviar_notificacion_push(
    reclamo_id: int,
    tipo_notificacion: str,
    empleado_nombre: str = None,
    estado_anterior: str = None,
    estado_nuevo: str = None,
    comentario_texto: str = None,
    autor_nombre: str = None
):
    """
    Envía notificación push al creador del reclamo.
    Usa su propia sesión de DB para evitar problemas con tasks async.
    tipo_notificacion: 'reclamo_recibido', 'reclamo_asignado', 'cambio_estado', 'reclamo_resuelto', 'nuevo_comentario'
    """
    from core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as new_db:
        try:
            # Recargar el reclamo en la nueva sesión
            result = await new_db.execute(
                select(Reclamo).where(Reclamo.id == reclamo_id)
            )
            reclamo = result.scalar_one_or_none()
            if not reclamo:
                print(f"[PUSH] Reclamo #{reclamo_id} no encontrado", flush=True)
                return

            from services.push_service import (
                notificar_reclamo_recibido,
                notificar_reclamo_asignado,
                notificar_cambio_estado,
                notificar_reclamo_resuelto,
                notificar_nuevo_comentario
            )

            if tipo_notificacion == 'reclamo_recibido':
                await notificar_reclamo_recibido(new_db, reclamo)
            elif tipo_notificacion == 'reclamo_asignado' and empleado_nombre:
                await notificar_reclamo_asignado(new_db, reclamo, empleado_nombre)
            elif tipo_notificacion == 'cambio_estado' and estado_anterior and estado_nuevo:
                await notificar_cambio_estado(new_db, reclamo, estado_anterior, estado_nuevo)
            elif tipo_notificacion == 'reclamo_resuelto':
                await notificar_reclamo_resuelto(new_db, reclamo)
            elif tipo_notificacion == 'nuevo_comentario':
                await notificar_nuevo_comentario(new_db, reclamo, comentario_texto, autor_nombre)

            print(f"[PUSH] Notificacion enviada: {tipo_notificacion}", flush=True)
        except Exception as e:
            print(f"[PUSH] Error enviando: {e}", flush=True)
            import traceback
            traceback.print_exc()


async def enviar_notificacion_dependencia(
    reclamo_id: int,
    municipio_dependencia_id: int,
    categoria_nombre: str = None
):
    """
    Envía notificación a los supervisores de la dependencia asignada.
    Usa su propia sesión de DB para evitar problemas con tasks async.
    """
    from core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as new_db:
        try:
            # Recargar el reclamo en la nueva sesión
            result = await new_db.execute(
                select(Reclamo).where(Reclamo.id == reclamo_id)
            )
            reclamo = result.scalar_one_or_none()
            if not reclamo:
                print(f"[PUSH] Reclamo #{reclamo_id} no encontrado", flush=True)
                return

            from services.push_service import notificar_dependencia_reclamo_nuevo
            count = await notificar_dependencia_reclamo_nuevo(new_db, reclamo, categoria_nombre)
            print(f"[PUSH] Notificacion enviada a dependencia: {count} usuarios", flush=True)
        except Exception as e:
            print(f"[PUSH] Error notificando dependencia: {e}", flush=True)
            import traceback
            traceback.print_exc()


async def enviar_email_reclamo_creado(
    reclamo_id: int,
    usuario_id: int,
    usuario_email: str,
    reclamo_titulo: str,
    categoria_nombre: str = None,
    reclamo_descripcion: str = None,
    creador_nombre: str = None
):
    """
    Envía email al vecino confirmando la creación del reclamo.
    Registra el intento en el historial del reclamo.
    """
    # Crear nueva sesión para operaciones en background
    from core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as new_db:
        try:
            from services.email_service import email_service, EmailTemplates

            # Solo enviar si el usuario tiene email
            if not usuario_email:
                print(f"[EMAIL] Usuario sin email, no se envía", flush=True)
                # Registrar en historial
                historial = HistorialReclamo(
                    reclamo_id=reclamo_id,
                    usuario_id=usuario_id,
                    accion="email_fallido",
                    comentario="❌ No se envió email de confirmación: usuario sin email configurado"
                )
                new_db.add(historial)
                await new_db.commit()
                return

            # Generar HTML del email
            html_content = EmailTemplates.reclamo_creado(
                reclamo_titulo=reclamo_titulo,
                reclamo_id=reclamo_id,
                categoria=categoria_nombre or "Sin categoría",
                descripcion=reclamo_descripcion,
                creador_nombre=creador_nombre
            )

            # Enviar email
            success = await email_service.send_email(
                to_email=usuario_email,
                subject=f"Reclamo #{reclamo_id} generado exitosamente",
                body_html=html_content,
                body_text=f"Su reclamo #{reclamo_id} '{reclamo_titulo}' fue generado exitosamente. Le notificaremos cuando haya actualizaciones."
            )

            # Registrar resultado en historial
            if success:
                print(f"[EMAIL] Email enviado a {usuario_email}", flush=True)
                historial = HistorialReclamo(
                    reclamo_id=reclamo_id,
                    usuario_id=usuario_id,
                    accion="email_enviado",
                    comentario=f"✅ Email de confirmación enviado a {usuario_email}"
                )
            else:
                print(f"[EMAIL] No se pudo enviar email (SMTP no configurado)", flush=True)
                historial = HistorialReclamo(
                    reclamo_id=reclamo_id,
                    usuario_id=usuario_id,
                    accion="email_fallido",
                    comentario=f"⚠️ No se pudo enviar email a {usuario_email} (SMTP no configurado o credenciales inválidas)"
                )

            new_db.add(historial)
            await new_db.commit()

        except Exception as e:
            print(f"[EMAIL] Error enviando email: {e}", flush=True)
            # Registrar error en historial
            try:
                historial = HistorialReclamo(
                    reclamo_id=reclamo_id,
                    usuario_id=usuario_id,
                    accion="email_fallido",
                    comentario=f"❌ Error al enviar email a {usuario_email}: {str(e)[:100]}"
                )
                new_db.add(historial)
                await new_db.commit()
            except:
                pass  # Si falla el registro del error, no hacer nada


def get_effective_municipio_id(request: Request, current_user: User) -> int:
    """Obtiene el municipio_id efectivo (del header X-Municipio-ID si es admin/supervisor)"""
    if current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        header_municipio_id = request.headers.get('X-Municipio-ID')
        if header_municipio_id:
            try:
                return int(header_municipio_id)
            except (ValueError, TypeError):
                pass
    return current_user.municipio_id

# Configurar Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

def get_reclamos_query():
    return select(Reclamo).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.zona),
        selectinload(Reclamo.barrio),
        selectinload(Reclamo.creador),
        selectinload(Reclamo.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
        selectinload(Reclamo.documentos)
    )

@router.get("", response_model=List[ReclamoResponse])
async def get_reclamos(
    request: Request,
    estado: Optional[EstadoReclamo] = None,
    categoria_id: Optional[int] = None,
    zona_id: Optional[int] = None,
    municipio_dependencia_id: Optional[int] = None,
    search: Optional[str] = Query(None, description="Búsqueda en todos los campos"),
    skip: int = Query(0, ge=0, description="Número de registros a saltar"),
    limit: int = Query(20, ge=1, le=100, description="Número de registros a retornar"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models.categoria import Categoria
    from models.zona import Zona
    from sqlalchemy import or_, cast, String
    from sqlalchemy.orm import joinedload

    # Si hay búsqueda, usar JOINs para poder filtrar en tablas relacionadas
    if search and search.strip():
        query = select(Reclamo).options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.zona),
            selectinload(Reclamo.barrio),
            selectinload(Reclamo.creador),
            selectinload(Reclamo.dependencia_asignada).selectinload(MunicipioDependencia.dependencia),
            selectinload(Reclamo.documentos)
        ).join(Reclamo.creador).outerjoin(Reclamo.categoria).outerjoin(Reclamo.zona).outerjoin(Reclamo.dependencia_asignada)
    else:
        query = get_reclamos_query()

    # Filtrar por municipio (usa header para admins, o municipio del usuario)
    municipio_id = get_effective_municipio_id(request, current_user)
    query = query.where(Reclamo.municipio_id == municipio_id)

    # Filtrar según rol
    if current_user.rol == RolUsuario.VECINO:
        query = query.where(Reclamo.creador_id == current_user.id)
    elif current_user.rol == RolUsuario.EMPLEADO:
        # Filtrar por dependencia si el usuario tiene una asignada
        if current_user.municipio_dependencia_id:
            query = query.where(Reclamo.municipio_dependencia_id == current_user.municipio_dependencia_id)
        # Si no tiene dependencia asignada, ve todos los reclamos del municipio

    # Filtros opcionales
    if estado:
        query = query.where(Reclamo.estado == estado)
    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)
    if zona_id:
        query = query.where(Reclamo.zona_id == zona_id)
    if municipio_dependencia_id:
        query = query.where(Reclamo.municipio_dependencia_id == municipio_dependencia_id)

    # Búsqueda en todos los campos
    if search and search.strip():
        search_term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                # Campos del reclamo
                func.lower(Reclamo.titulo).like(search_term),
                func.lower(Reclamo.descripcion).like(search_term),
                func.lower(Reclamo.direccion).like(search_term),
                func.lower(Reclamo.referencia).like(search_term),
                func.lower(Reclamo.resolucion).like(search_term),
                cast(Reclamo.id, String).like(search_term),
                # Creador
                func.lower(User.nombre).like(search_term),
                func.lower(User.apellido).like(search_term),
                func.lower(User.email).like(search_term),
                User.telefono.like(search_term),
                User.dni.like(search_term),
                # Categoría
                func.lower(Categoria.nombre).like(search_term),
                # Zona
                func.lower(Zona.nombre).like(search_term),
                func.lower(Zona.codigo).like(search_term),
            )
        )

    query = query.order_by(Reclamo.created_at.desc())
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.unique().scalars().all()

@router.get("/mis-reclamos", response_model=List[ReclamoResponse])
async def get_mis_reclamos(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = get_reclamos_query().where(Reclamo.creador_id == current_user.id)
    query = query.order_by(Reclamo.created_at.desc())
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{reclamo_id}", response_model=ReclamoResponse)
async def cambiar_estado_reclamo_drag(
    reclamo_id: int,
    nuevo_estado: str = Query(..., description="Nuevo estado del reclamo"),
    comentario: Optional[str] = Query(None, description="Observación del cambio de estado"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    """Cambiar el estado de un reclamo (usado por drag & drop en tablero Kanban)."""
    from datetime import datetime

    # Convertir string a enum
    try:
        estado_enum = EstadoReclamo(nuevo_estado.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {nuevo_estado}")

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Validar transiciones permitidas
    # Flujo: nuevo → recibido → en_curso → (finalizado | pospuesto | rechazado)
    transiciones_validas = {
        EstadoReclamo.NUEVO: [EstadoReclamo.RECIBIDO, EstadoReclamo.ASIGNADO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.RECIBIDO: [EstadoReclamo.EN_CURSO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.ASIGNADO: [EstadoReclamo.EN_CURSO, EstadoReclamo.FINALIZADO, EstadoReclamo.RECHAZADO],  # Legacy
        EstadoReclamo.EN_CURSO: [EstadoReclamo.FINALIZADO, EstadoReclamo.POSPUESTO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.PENDIENTE_CONFIRMACION: [EstadoReclamo.FINALIZADO, EstadoReclamo.EN_CURSO],  # Legacy
        EstadoReclamo.RESUELTO: [EstadoReclamo.EN_CURSO],  # Legacy
        EstadoReclamo.FINALIZADO: [],  # Estado final
        EstadoReclamo.POSPUESTO: [EstadoReclamo.EN_CURSO, EstadoReclamo.FINALIZADO, EstadoReclamo.RECHAZADO],  # Puede retomar
        EstadoReclamo.RECHAZADO: [],  # Estado final
    }

    if estado_enum not in transiciones_validas.get(reclamo.estado, []):
        raise HTTPException(
            status_code=400,
            detail=f"No se puede cambiar de {reclamo.estado.value} a {estado_enum.value}"
        )

    # Verificar permisos de empleado/dependencia
    if current_user.rol == RolUsuario.EMPLEADO and current_user.municipio_dependencia_id:
        if reclamo.municipio_dependencia_id != current_user.municipio_dependencia_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para modificar este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = estado_enum

    # Manejar fechas según el estado
    if estado_enum in [EstadoReclamo.RESUELTO, EstadoReclamo.FINALIZADO]:
        reclamo.fecha_resolucion = datetime.now(timezone.utc)

    # Generar comentario para historial
    comentario_historial = comentario if comentario else f"Estado cambiado de {estado_anterior.value} a {estado_enum.value}"

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_enum,
        accion="cambio_estado",
        comentario=comentario_historial
    )
    db.add(historial)

    await db.commit()

    # Notificaciones en background (no bloquean respuesta)
    if estado_enum in [EstadoReclamo.RESUELTO, EstadoReclamo.FINALIZADO]:
        # await enviar_notificacion_whatsapp(db, reclamo, 'reclamo_resuelto', current_user.municipio_id)
        asyncio.create_task(enviar_notificacion_push(db, reclamo, 'reclamo_resuelto'))
    else:
        # await enviar_notificacion_whatsapp(db, reclamo, 'cambio_estado', current_user.municipio_id)
        asyncio.create_task(enviar_notificacion_push(db, reclamo, 'cambio_estado',
                                  estado_anterior=estado_anterior.value,
                                  estado_nuevo=estado_enum.value))

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


# ===========================================
# RECLAMOS RECURRENTES (PÚBLICO - solo municipio_id)
# IMPORTANTE: Este endpoint debe estar ANTES de /{reclamo_id}
# ===========================================
@router.get("/recurrentes")
async def get_reclamos_recurrentes(
    request: Request,
    limit: int = Query(10, description="Máximo de resultados"),
    dias_atras: int = Query(30, description="Buscar reclamos de los últimos N días"),
    min_similares: int = Query(3, description="Mínimo de reclamos similares para considerarlo recurrente"),
    municipio_id: Optional[int] = Query(None, description="ID del municipio (requerido si no está autenticado)"),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user_optional)
):
    """
    Devuelve reclamos con alta recurrencia (muchos reportes similares).
    Útil para identificar problemas críticos que afectan a muchos vecinos.
    Público: requiere municipio_id como parámetro.
    Autenticado: usa el municipio del usuario.
    """
    from datetime import datetime, timedelta
    from utils.geo import are_locations_close

    # Determinar municipio_id
    if current_user:
        muni_id = current_user.municipio_id
    elif municipio_id:
        muni_id = municipio_id
    else:
        raise HTTPException(status_code=400, detail="Se requiere municipio_id")

    # Fecha límite
    fecha_limite = datetime.now(timezone.utc) - timedelta(days=dias_atras)

    # Obtener todos los reclamos activos recientes
    query = select(Reclamo).where(
        Reclamo.created_at >= fecha_limite,
        Reclamo.estado.in_([
            EstadoReclamo.NUEVO,
            EstadoReclamo.ASIGNADO,
            EstadoReclamo.EN_CURSO
        ]),
        Reclamo.municipio_id == muni_id
    ).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.zona)
    )

    result = await db.execute(query)
    todos_reclamos = result.scalars().all()

    # Agrupar por categoría y proximidad
    grupos = []
    procesados = set()

    for reclamo_base in todos_reclamos:
        if reclamo_base.id in procesados:
            continue

        # Buscar similares a este reclamo
        similares = [reclamo_base]
        procesados.add(reclamo_base.id)

        for reclamo_comp in todos_reclamos:
            if reclamo_comp.id in procesados:
                continue

            # Mismo criterio que el endpoint de similares
            if (reclamo_comp.categoria_id == reclamo_base.categoria_id and
                are_locations_close(
                    reclamo_base.latitud, reclamo_base.longitud,
                    reclamo_comp.latitud, reclamo_comp.longitud,
                    radius_meters=100
                )):
                similares.append(reclamo_comp)
                procesados.add(reclamo_comp.id)

        # Si tiene suficientes similares, agregar al resultado
        if len(similares) >= min_similares:
            # Ordenar por fecha (más reciente primero)
            similares.sort(key=lambda r: r.created_at, reverse=True)
            reclamo_principal = similares[0]

            grupos.append({
                "id": reclamo_principal.id,
                "titulo": reclamo_principal.titulo,
                "descripcion": reclamo_principal.descripcion,
                "direccion": reclamo_principal.direccion,
                "estado": reclamo_principal.estado.value,
                "categoria": {
                    "id": reclamo_principal.categoria.id,
                    "nombre": reclamo_principal.categoria.nombre
                } if reclamo_principal.categoria else None,
                "zona": reclamo_principal.zona.nombre if reclamo_principal.zona else None,
                "cantidad_reportes": len(similares),
                "reclamos_relacionados": [r.id for r in similares],
                "created_at": reclamo_principal.created_at.isoformat(),
                "prioridad_sugerida": "alta" if len(similares) >= 5 else "media"
            })

    # Ordenar por cantidad de reportes (más reportes primero)
    grupos.sort(key=lambda g: g["cantidad_reportes"], reverse=True)

    return grupos[:limit]


# ===========================================
# RUTAS ESPECÍFICAS (deben ir ANTES de /{reclamo_id})
# ===========================================

@router.get("/similares")
async def buscar_reclamos_similares(
    categoria_id: int = Query(..., description="ID de la categoría"),
    latitud: Optional[float] = Query(None, description="Latitud del reclamo"),
    longitud: Optional[float] = Query(None, description="Longitud del reclamo"),
    radio_metros: int = Query(100, description="Radio de búsqueda en metros"),
    dias_atras: int = Query(30, description="Buscar reclamos de los últimos N días"),
    limit: int = Query(10, description="Máximo de resultados"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Busca reclamos similares basándose en:
    - Misma categoría
    - Ubicación cercana (radio configurable)
    - Creados recientemente (últimos N días)
    - Estados activos (no resueltos ni rechazados)
    """
    from datetime import datetime, timedelta
    from utils.geo import are_locations_close

    fecha_limite = datetime.now(timezone.utc) - timedelta(days=dias_atras)

    query = select(Reclamo).where(
        Reclamo.categoria_id == categoria_id,
        Reclamo.created_at >= fecha_limite,
        Reclamo.estado.in_([
            EstadoReclamo.NUEVO,
            EstadoReclamo.ASIGNADO,
            EstadoReclamo.EN_CURSO
        ]),
        Reclamo.municipio_id == current_user.municipio_id
    ).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.zona),
        selectinload(Reclamo.creador)
    ).order_by(Reclamo.created_at.desc())

    result = await db.execute(query)
    reclamos_candidatos = result.scalars().all()

    reclamos_similares = []
    if latitud and longitud:
        for reclamo in reclamos_candidatos:
            if are_locations_close(
                latitud, longitud,
                reclamo.latitud, reclamo.longitud,
                radius_meters=radio_metros
            ):
                reclamos_similares.append(reclamo)
                if len(reclamos_similares) >= limit:
                    break
    else:
        reclamos_similares = reclamos_candidatos[:limit]

    return [
        {
            "id": r.id,
            "titulo": r.titulo,
            "descripcion": r.descripcion,
            "direccion": r.direccion,
            "estado": r.estado.value,
            "categoria": r.categoria.nombre if r.categoria else None,
            "zona": r.zona.nombre if r.zona else None,
            "created_at": r.created_at.isoformat(),
            "creador": {
                "nombre": r.creador.nombre,
                "apellido": r.creador.apellido
            } if r.creador else None,
            "distancia_metros": round(
                __import__('utils.geo', fromlist=['haversine_distance']).haversine_distance(
                    latitud, longitud, r.latitud, r.longitud
                )
            ) if (latitud and longitud and r.latitud and r.longitud) else None
        }
        for r in reclamos_similares
    ]


@router.get("/mis-estadisticas")
async def get_mis_estadisticas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["empleado"]))
):
    """
    Obtiene estadísticas de rendimiento del empleado logueado.
    TODO: Migrar a dependencia cuando se implemente asignación por IA
    """
    # Por ahora retorna 0s ya que no hay empleado_id en reclamos
    return {
        "total_asignados": 0,
        "resueltos": 0,
        "en_curso": 0,
        "pendientes": 0,
        "resueltos_este_mes": 0,
        "tiempo_promedio_resolucion": 0,
        "por_categoria": [],
        "ultimos_resueltos": [],
        "mensaje": "Pendiente migración a dependencias"
    }


@router.get("/mi-historial")
async def get_mi_historial(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=50),
    estado: Optional[str] = Query(None, description="Filtrar por estado"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["empleado"]))
):
    """
    Obtiene el historial completo de trabajos del empleado.
    TODO: Migrar a dependencia cuando se implemente asignación por IA
    """
    # Por ahora retorna lista vacía ya que no hay empleado_id en reclamos
    return {
        "data": [],
        "total": 0,
        "skip": skip,
        "limit": limit
    }


# ===========================================
# RUTAS CON PARÁMETRO {reclamo_id}
# ===========================================

@router.get("/{reclamo_id}", response_model=ReclamoResponse)
async def get_reclamo(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar permisos
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este reclamo")

    return reclamo

@router.get("/{reclamo_id}/historial", response_model=List[HistorialResponse])
async def get_reclamo_historial(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(HistorialReclamo)
        .options(selectinload(HistorialReclamo.usuario))
        .where(HistorialReclamo.reclamo_id == reclamo_id)
        .order_by(HistorialReclamo.created_at.desc())
    )
    return result.scalars().all()

@router.post("", response_model=ReclamoResponse)
async def create_reclamo(
    data: ReclamoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    print(f"\n{'='*80}", flush=True)
    print(f"🆕 CREANDO NUEVO RECLAMO", flush=True)
    print(f"{'='*80}", flush=True)
    print(f"Usuario: {current_user.email} (ID: {current_user.id})", flush=True)
    print(f"Título: {data.titulo}", flush=True)
    print(f"Categoría ID: {data.categoria_id}", flush=True)
    print(f"Municipio ID: {current_user.municipio_id}", flush=True)
    print(f"{'='*80}\n", flush=True)

    # Validar que el usuario tenga un municipio válido
    if not current_user.municipio_id:
        raise HTTPException(
            status_code=400,
            detail="Tu cuenta no tiene un municipio asignado. Contactá al administrador."
        )

    # Verificar que el municipio existe
    from models.municipio import Municipio
    municipio_check = await db.execute(
        select(Municipio).where(Municipio.id == current_user.municipio_id)
    )
    if not municipio_check.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"El municipio asignado a tu cuenta (ID: {current_user.municipio_id}) no existe. Contactá al administrador."
        )

    # Actualizar datos de contacto del usuario si se proporcionan
    if data.nombre_contacto or data.telefono_contacto or data.email_contacto:
        if data.nombre_contacto:
            # Separar nombre y apellido si viene con espacio
            partes = data.nombre_contacto.strip().split(' ', 1)
            current_user.nombre = partes[0]
            if len(partes) > 1:
                current_user.apellido = partes[1]
        if data.telefono_contacto:
            current_user.telefono = data.telefono_contacto
        if data.email_contacto and data.email_contacto != current_user.email:
            # Solo actualizar email si es diferente (y válido)
            # El email es unique, así que verificamos que no exista otro usuario con ese email
            existing = await db.execute(
                select(User).where(User.email == data.email_contacto, User.id != current_user.id)
            )
            if not existing.scalar_one_or_none():
                current_user.email = data.email_contacto

    # Extraer solo los campos del reclamo (excluyendo datos de contacto)
    reclamo_data = data.model_dump(exclude={
        'nombre_contacto', 'telefono_contacto', 'email_contacto', 'recibir_notificaciones'
    })

    reclamo = Reclamo(
        **reclamo_data,
        creador_id=current_user.id,
        municipio_id=current_user.municipio_id,
        estado=EstadoReclamo.NUEVO
    )

    # Detectar barrio automáticamente desde la dirección
    try:
        from services.barrio_detector import detectar_barrio
        barrio_id = await detectar_barrio(
            db=db,
            municipio_id=current_user.municipio_id,
            direccion=data.direccion,
            latitud=data.latitud,
            longitud=data.longitud
        )
        if barrio_id:
            reclamo.barrio_id = barrio_id
            print(f"[BARRIO] Detectado barrio_id={barrio_id} para dirección: {data.direccion}", flush=True)
        else:
            print(f"[BARRIO] No se detectó barrio para dirección: {data.direccion}", flush=True)
    except Exception as e:
        print(f"[BARRIO] Error detectando barrio: {e}", flush=True)

    # Auto-asignar a dependencia basándose en la categoría
    try:
        asignacion = await db.execute(
            select(MunicipioDependenciaCategoria)
            .where(
                MunicipioDependenciaCategoria.municipio_id == current_user.municipio_id,
                MunicipioDependenciaCategoria.categoria_id == data.categoria_id,
                MunicipioDependenciaCategoria.activo == True
            )
        )
        mdc = asignacion.scalar_one_or_none()
        if mdc:
            reclamo.municipio_dependencia_id = mdc.municipio_dependencia_id
            print(f"[DEPENDENCIA] Auto-asignado a dependencia_id={mdc.municipio_dependencia_id} por categoría", flush=True)
        else:
            print(f"[DEPENDENCIA] No hay dependencia configurada para categoría {data.categoria_id} en municipio {current_user.municipio_id}", flush=True)
    except Exception as e:
        print(f"[DEPENDENCIA] Error auto-asignando dependencia: {e}", flush=True)

    db.add(reclamo)
    await db.flush()

    # Crear historial
    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_nuevo=EstadoReclamo.NUEVO,
        accion="creado",
        comentario="Reclamo creado"
    )
    db.add(historial)

    await db.commit()
    print(f"✅ Reclamo #{reclamo.id} creado exitosamente en BD", flush=True)

    # Gamificación: otorgar puntos por crear reclamo
    try:
        print(f"🎮 Procesando gamificación...", flush=True)
        puntos, badges = await GamificacionService.procesar_reclamo_creado(
            db, reclamo, current_user
        )
        print(f"✅ Gamificación procesada: {puntos} puntos, {len(badges)} badges", flush=True)
    except Exception as e:
        print(f"⚠️ Error en gamificación: {e}", flush=True)
        # No fallar si hay error en gamificación
        pass

    # Obtener nombre de categoría para las notificaciones
    categoria_nombre = None
    try:
        from models.categoria import Categoria
        cat_result = await db.execute(
            select(Categoria).where(Categoria.id == data.categoria_id)
        )
        cat = cat_result.scalar_one_or_none()
        if cat:
            categoria_nombre = cat.nombre
    except Exception as e:
        print(f"⚠️ Error obteniendo categoría: {e}", flush=True)

    # Notificaciones en background (no bloquean respuesta)
    # await enviar_notificacion_whatsapp(db, reclamo, 'reclamo_recibido', current_user.municipio_id)

    # 1. Notificar al vecino (push + in-app)
    asyncio.create_task(enviar_notificacion_push(
        reclamo_id=reclamo.id,
        tipo_notificacion='reclamo_recibido'
    ))

    # 2. Notificar a la dependencia asignada (push + in-app)
    if reclamo.municipio_dependencia_id:
        asyncio.create_task(enviar_notificacion_dependencia(
            reclamo_id=reclamo.id,
            municipio_dependencia_id=reclamo.municipio_dependencia_id,
            categoria_nombre=categoria_nombre
        ))

    # 3. Enviar email al vecino
    asyncio.create_task(enviar_email_reclamo_creado(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        usuario_email=current_user.email,
        reclamo_titulo=reclamo.titulo,
        categoria_nombre=categoria_nombre,
        reclamo_descripcion=reclamo.descripcion,
        creador_nombre=f"{current_user.nombre} {current_user.apellido}".strip()
    ))

    # Recargar con relaciones
    print(f"🔄 Recargando reclamo con relaciones...", flush=True)
    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo.id))
    reclamo_final = result.scalar_one()
    print(f"✅ Reclamo #{reclamo_final.id} listo para retornar", flush=True)
    print(f"{'='*80}\n", flush=True)
    return reclamo_final

@router.put("/{reclamo_id}", response_model=ReclamoResponse)
async def update_reclamo(
    reclamo_id: int,
    data: ReclamoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Solo el creador o admin/supervisor pueden editar
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este reclamo")

    # Solo se puede editar si está en estado NUEVO
    if reclamo.estado != EstadoReclamo.NUEVO:
        raise HTTPException(status_code=400, detail="Solo se pueden editar reclamos nuevos")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(reclamo, key, value)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/asignar", response_model=ReclamoResponse)
async def asignar_reclamo(
    reclamo_id: int,
    data: ReclamoAsignar,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Asignar o reasignar un reclamo a una dependencia.

    Permisos:
    - Admin/Supervisor: puede asignar a cualquier dependencia
    - Empleado: solo puede aceptar reclamos ya asignados a su propia dependencia
    """
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado not in [EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO]:
        raise HTTPException(status_code=400, detail="El reclamo no puede ser asignado en su estado actual")

    # Verificar permisos
    is_admin_or_supervisor = current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]

    if not is_admin_or_supervisor:
        # Empleados solo pueden aceptar reclamos ya asignados a su dependencia
        if current_user.rol != RolUsuario.EMPLEADO:
            raise HTTPException(status_code=403, detail="No tienes permiso para asignar reclamos")

        # Verificar que el reclamo ya está asignado a la dependencia del empleado
        if reclamo.municipio_dependencia_id != current_user.municipio_dependencia_id:
            raise HTTPException(status_code=403, detail="Solo puedes aceptar reclamos asignados a tu dependencia")

        # Verificar que no está intentando reasignar a otra dependencia
        if data.dependencia_id != current_user.municipio_dependencia_id:
            raise HTTPException(status_code=403, detail="No puedes reasignar a otra dependencia")

    # Verificar que la dependencia existe y pertenece al municipio
    from models.municipio_dependencia import MunicipioDependencia
    from sqlalchemy.orm import selectinload
    result_dep = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(
            MunicipioDependencia.id == data.dependencia_id,
            MunicipioDependencia.municipio_id == reclamo.municipio_id,
            MunicipioDependencia.activo == True
        )
    )
    dependencia = result_dep.scalar_one_or_none()
    if not dependencia:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada o no pertenece a este municipio")

    from datetime import datetime as dt, timedelta

    estado_anterior = reclamo.estado
    reclamo.municipio_dependencia_id = data.dependencia_id
    reclamo.estado = EstadoReclamo.RECIBIDO  # Usar RECIBIDO en vez de ASIGNADO

    # Tiempo estimado de resolución
    reclamo.tiempo_estimado_dias = data.tiempo_estimado_dias or 0
    reclamo.tiempo_estimado_horas = data.tiempo_estimado_horas or 0
    reclamo.fecha_recibido = dt.now()

    # Calcular fecha estimada de resolución
    if data.tiempo_estimado_dias or data.tiempo_estimado_horas:
        tiempo_total = timedelta(
            days=data.tiempo_estimado_dias or 0,
            hours=data.tiempo_estimado_horas or 0
        )
        reclamo.fecha_estimada_resolucion = dt.now() + tiempo_total

    # Programacion del trabajo
    if data.fecha_programada:
        reclamo.fecha_programada = data.fecha_programada
    if data.hora_inicio:
        reclamo.hora_inicio = data.hora_inicio
    if data.hora_fin:
        reclamo.hora_fin = data.hora_fin

    # Obtener nombre de la dependencia para el historial
    dependencia_nombre = dependencia.dependencia.nombre if dependencia.dependencia else f"Dependencia #{data.dependencia_id}"

    # Construir comentario del historial
    tiempo_estimado_str = ""
    if data.tiempo_estimado_dias or data.tiempo_estimado_horas:
        partes = []
        if data.tiempo_estimado_dias:
            partes.append(f"{data.tiempo_estimado_dias} día{'s' if data.tiempo_estimado_dias > 1 else ''}")
        if data.tiempo_estimado_horas:
            partes.append(f"{data.tiempo_estimado_horas} hora{'s' if data.tiempo_estimado_horas > 1 else ''}")
        tiempo_estimado_str = f" - Tiempo estimado: {' y '.join(partes)}"

    comentario_historial = data.comentario or f"Recibido por {dependencia_nombre}{tiempo_estimado_str}"
    if data.fecha_programada:
        comentario_historial += f" - Programado para {data.fecha_programada}"
        if data.hora_inicio and data.hora_fin:
            comentario_historial += f" de {data.hora_inicio} a {data.hora_fin}"

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.RECIBIDO,
        accion="recibido",
        comentario=comentario_historial
    )
    db.add(historial)

    await db.commit()

    # Guardar IDs antes de cerrar la sesión para usar en background tasks
    reclamo_id_for_push = reclamo.id
    dependencia_id_for_push = data.dependencia_id
    creador_id_for_push = reclamo.creador_id

    # Buscar usuarios de la dependencia para notificarles
    dependencia_users_result = await db.execute(
        select(User).where(User.municipio_dependencia_id == data.dependencia_id)
    )
    dependencia_users = dependencia_users_result.scalars().all()
    dependencia_user_ids = [u.id for u in dependencia_users]

    # Enviar notificaciones en background con nueva sesión
    async def enviar_push_asignacion():
        from core.database import AsyncSessionLocal
        from services.push_service import send_push_to_user
        try:
            async with AsyncSessionLocal() as new_db:
                # Notificar al vecino
                await send_push_to_user(
                    new_db,
                    creador_id_for_push,
                    "Reclamo Asignado",
                    f"Tu reclamo #{reclamo_id_for_push} fue asignado a {dependencia_nombre}.",
                    f"/reclamos/{reclamo_id_for_push}",
                    data={"tipo": "reclamo_asignado", "reclamo_id": reclamo_id_for_push}
                )
                # Notificar a los usuarios de la dependencia
                for user_id in dependencia_user_ids:
                    await send_push_to_user(
                        new_db,
                        user_id,
                        "Nuevo Reclamo Asignado",
                        f"Se asignó el reclamo #{reclamo_id_for_push} a tu dependencia.",
                        f"/reclamos/{reclamo_id_for_push}",
                        data={"tipo": "asignacion_empleado", "reclamo_id": reclamo_id_for_push}
                    )
                print(f"[PUSH] Notificaciones de asignación enviadas para reclamo #{reclamo_id_for_push}", flush=True)
        except Exception as e:
            print(f"[PUSH] Error en background task: {e}", flush=True)

    asyncio.create_task(enviar_push_asignacion())

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/iniciar", response_model=ReclamoResponse)
async def iniciar_reclamo(
    reclamo_id: int,
    descripcion: str = Query(..., min_length=1, description="Descripción del inicio del trabajo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Permitir iniciar desde recibido o asignado (legacy)
    if reclamo.estado not in [EstadoReclamo.RECIBIDO, EstadoReclamo.ASIGNADO]:
        raise HTTPException(status_code=400, detail="El reclamo debe estar recibido para iniciarlo")

    # Verificar que el usuario pertenezca a la dependencia asignada
    if current_user.municipio_dependencia_id:
        if reclamo.municipio_dependencia_id != current_user.municipio_dependencia_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para iniciar este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.EN_CURSO

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.EN_CURSO,
        accion="en_curso",
        comentario=descripcion
    )
    db.add(historial)

    await db.commit()

    # Guardar datos para notificación en background
    reclamo_id_for_push = reclamo.id
    creador_id_for_push = reclamo.creador_id
    estado_anterior_str = estado_anterior.value

    # Notificación al vecino en background con nueva sesión
    async def enviar_push_inicio():
        from core.database import AsyncSessionLocal
        from services.push_service import send_push_to_user
        try:
            async with AsyncSessionLocal() as new_db:
                await send_push_to_user(
                    new_db,
                    creador_id_for_push,
                    "Trabajo Iniciado",
                    f"El empleado comenzó a trabajar en tu reclamo #{reclamo_id_for_push}.",
                    f"/gestion/reclamos/{reclamo_id_for_push}",
                    data={"tipo": "cambio_estado", "reclamo_id": reclamo_id_for_push}
                )
                print(f"[PUSH] Notificación de inicio enviada para reclamo #{reclamo_id_for_push}", flush=True)
        except Exception as e:
            print(f"[PUSH] Error en background task inicio: {e}", flush=True)

    asyncio.create_task(enviar_push_inicio())

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/resolver", response_model=ReclamoResponse)
async def resolver_reclamo(
    reclamo_id: int,
    data: ReclamoResolver,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    """
    Resolver un reclamo.
    - Empleado: cambia a 'pendiente_confirmacion' y notifica al supervisor
    - Admin/Supervisor: resuelve directamente
    """
    from datetime import datetime
    from services.notificacion_service import NotificacionService
    from models.empleado import Empleado

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.EN_CURSO:
        raise HTTPException(status_code=400, detail="El reclamo debe estar en proceso para resolverlo")

    if current_user.rol == RolUsuario.EMPLEADO and current_user.municipio_dependencia_id:
        if reclamo.municipio_dependencia_id != current_user.municipio_dependencia_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para resolver este reclamo")

    estado_anterior = reclamo.estado
    reclamo.resolucion = data.resolucion

    # Si es empleado, va a pendiente_confirmacion y notifica al supervisor
    if current_user.rol == RolUsuario.EMPLEADO:
        reclamo.estado = EstadoReclamo.PENDIENTE_CONFIRMACION

        historial = HistorialReclamo(
            reclamo_id=reclamo.id,
            usuario_id=current_user.id,
            estado_anterior=estado_anterior,
            estado_nuevo=EstadoReclamo.PENDIENTE_CONFIRMACION,
            accion="pendiente_confirmacion",
            comentario=f"Trabajo terminado por empleado. Resolución: {data.resolucion}"
        )
        db.add(historial)

        await db.commit()

        # Usar el nombre del usuario directamente (funciona para dependencia y empleado)
        empleado_nombre = f"{current_user.nombre} {current_user.apellido or ''}".strip()

        # Notificar a supervisores (in-app + WhatsApp)
        mensaje_supervisor = NotificacionService.generar_mensaje_pendiente_confirmacion(
            reclamo_id=reclamo.id,
            titulo_reclamo=reclamo.titulo,
            empleado_nombre=empleado_nombre,
            resolucion=data.resolucion
        )

        await NotificacionService.notificar_supervisores(
            db=db,
            municipio_id=current_user.municipio_id,
            titulo="Trabajo pendiente de confirmación",
            mensaje=mensaje_supervisor,
            tipo="warning",
            reclamo_id=reclamo.id,
            enviar_whatsapp=True
        )

        # Notificar al vecino que está en revisión
        await NotificacionService.notificar_vecino(
            db=db,
            reclamo=reclamo,
            titulo="Tu reclamo está en revisión",
            mensaje=f"El trabajo sobre tu reclamo #{reclamo.id} ha sido completado y está siendo revisado por un supervisor.",
            tipo="info",
            tipo_whatsapp="cambio_estado",
            enviar_whatsapp=True
        )

    else:
        # Admin/Supervisor finaliza directamente
        reclamo.estado = EstadoReclamo.FINALIZADO
        reclamo.fecha_resolucion = datetime.now(timezone.utc)

        historial = HistorialReclamo(
            reclamo_id=reclamo.id,
            usuario_id=current_user.id,
            estado_anterior=estado_anterior,
            estado_nuevo=EstadoReclamo.FINALIZADO,
            accion="finalizado",
            comentario=data.resolucion
        )
        db.add(historial)

        await db.commit()

        # Gamificación: otorgar puntos al creador por reclamo resuelto
        try:
            await GamificacionService.procesar_reclamo_resuelto(db, reclamo)
        except Exception as e:
            pass

        # Guardar datos para notificación
        reclamo_id_for_push = reclamo.id
        creador_id_for_push = reclamo.creador_id

        # Notificación al vecino en background con nueva sesión
        async def enviar_push_resuelto():
            from core.database import AsyncSessionLocal
            from services.push_service import send_push_to_user
            try:
                async with AsyncSessionLocal() as new_db:
                    await send_push_to_user(
                        new_db,
                        creador_id_for_push,
                        "Reclamo Resuelto",
                        f"Tu reclamo #{reclamo_id_for_push} ha sido resuelto. ¡Gracias por tu paciencia!",
                        f"/gestion/reclamos/{reclamo_id_for_push}",
                        data={"tipo": "reclamo_resuelto", "reclamo_id": reclamo_id_for_push}
                    )
                    print(f"[PUSH] Notificación de resuelto enviada para reclamo #{reclamo_id_for_push}", flush=True)
            except Exception as e:
                print(f"[PUSH] Error en background task resuelto: {e}", flush=True)

        asyncio.create_task(enviar_push_resuelto())

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


@router.post("/{reclamo_id}/confirmar", response_model=ReclamoResponse)
async def confirmar_reclamo(
    reclamo_id: int,
    comentario: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Confirmar un reclamo pendiente de confirmación.
    Solo supervisores/admins pueden confirmar.
    Cambia el estado a RESUELTO y notifica al vecino con link de calificación.
    """
    from datetime import datetime
    from services.notificacion_service import NotificacionService

    result = await db.execute(
        select(Reclamo).options(
            selectinload(Reclamo.creador)
        ).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.PENDIENTE_CONFIRMACION:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden confirmar reclamos en estado 'pendiente_confirmacion'"
        )

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.RESUELTO
    reclamo.fecha_resolucion = datetime.now(timezone.utc)

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.RESUELTO,
        accion="confirmado",
        comentario=comentario or "Trabajo confirmado por supervisor"
    )
    db.add(historial)

    await db.commit()

    # Gamificación: otorgar puntos al creador por reclamo resuelto
    try:
        await GamificacionService.procesar_reclamo_resuelto(db, reclamo)
    except Exception as e:
        pass

    # Notificar al vecino con link de calificación
    link_calificacion = NotificacionService.generar_link_calificacion(reclamo.id)
    user = reclamo.creador

    if user and not user.es_anonimo:
        mensaje_resuelto = NotificacionService.generar_mensaje_resuelto(
            nombre_usuario=user.nombre,
            reclamo_id=reclamo.id,
            titulo_reclamo=reclamo.titulo,
            descripcion=reclamo.descripcion,
            incluir_link_calificacion=True
        )

        await NotificacionService.notificar_vecino(
            db=db,
            reclamo=reclamo,
            titulo="¡Tu reclamo fue resuelto!",
            mensaje=mensaje_resuelto,
            tipo="success",
            tipo_whatsapp="reclamo_resuelto",
            enviar_whatsapp=True
        )

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


@router.post("/{reclamo_id}/devolver", response_model=ReclamoResponse)
async def devolver_reclamo(
    reclamo_id: int,
    motivo: str = Query(..., description="Motivo por el que se devuelve al empleado"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Devolver un reclamo pendiente de confirmación al empleado.
    Cambia el estado a EN_CURSO y notifica al empleado.
    """
    from services.notificacion_service import NotificacionService

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.PENDIENTE_CONFIRMACION:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden devolver reclamos en estado 'pendiente_confirmacion'"
        )

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.EN_CURSO

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.EN_CURSO,
        accion="devuelto",
        comentario=f"Devuelto por supervisor: {motivo}"
    )
    db.add(historial)

    await db.commit()

    # Notificar al empleado asignado
    if reclamo.empleado_id:
        await NotificacionService.notificar_empleado(
            db=db,
            empleado_id=reclamo.empleado_id,
            titulo="Trabajo devuelto",
            mensaje=f"El reclamo #{reclamo.id} '{reclamo.titulo}' fue devuelto.\n\nMotivo: {motivo}",
            tipo="warning",
            reclamo_id=reclamo.id,
            enviar_whatsapp=True
        )

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


@router.post("/{reclamo_id}/rechazar", response_model=ReclamoResponse)
async def rechazar_reclamo(
    reclamo_id: int,
    data: ReclamoRechazar,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado == EstadoReclamo.RESUELTO:
        raise HTTPException(status_code=400, detail="No se puede rechazar un reclamo resuelto")

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.RECHAZADO
    reclamo.motivo_rechazo = data.motivo
    reclamo.descripcion_rechazo = data.descripcion
    reclamo.fecha_resolucion = datetime.now(timezone.utc)

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.RECHAZADO,
        accion="rechazado",
        comentario=f"Motivo: {data.motivo.value}. {data.descripcion or ''}"
    )
    db.add(historial)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


@router.post("/{reclamo_id}/comentario", response_model=HistorialResponse)
async def agregar_comentario(
    reclamo_id: int,
    data: ReclamoComentario,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Agrega un comentario a un reclamo (disponible para vecinos en sus propios reclamos)"""
    from datetime import datetime
    from services.push_service import notificar_comentario_vecino_a_dependencia

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar permisos: admin/supervisor pueden comentar en cualquiera,
    # vecinos solo en sus propios reclamos
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para comentar en este reclamo")

    # Actualizar updated_at del reclamo para que suba en la lista
    reclamo.updated_at = datetime.utcnow()

    # Crear entrada en el historial
    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=reclamo.estado,
        estado_nuevo=reclamo.estado,  # El estado no cambia
        accion="comentario",
        comentario=data.comentario
    )
    db.add(historial)
    await db.commit()
    await db.refresh(historial)

    autor_nombre = f"{current_user.nombre} {current_user.apellido or ''}".strip()

    # Enviar notificación según quién comenta
    if current_user.rol == RolUsuario.VECINO:
        # Vecino comenta → notificar a la dependencia
        await notificar_comentario_vecino_a_dependencia(
            db, reclamo, data.comentario, autor_nombre
        )
    else:
        # Admin/Supervisor comenta → notificar al vecino
        await enviar_notificacion_push(
            reclamo.id, 'nuevo_comentario',
            comentario_texto=data.comentario,
            autor_nombre=autor_nombre
        )

    # Notificar a TODOS los sumados (personas que se unieron al reclamo)
    # El creador original ya fue notificado si es un supervisor
    # Pero también notificamos a otros vecinos sumados
    from services.notificacion_service import notificar_comentario_a_personas_sumadas
    await notificar_comentario_a_personas_sumadas(db, reclamo_id, current_user)

    # Retornar historial con datos del usuario que comenta
    return {
        "id": historial.id,
        "comentario": historial.comentario,
        "usuario": {
            "id": current_user.id,
            "nombre": current_user.nombre,
            "apellido": current_user.apellido
        },
        "created_at": historial.created_at,
        "accion": historial.accion
    }


# Tipos de archivo permitidos y tamaño máximo
ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/gif"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/{reclamo_id}/upload")
async def upload_documento(
    reclamo_id: int,
    file: UploadFile = File(...),
    etapa: str = Query("creacion"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Validar tipo de archivo
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no permitido. Usa: jpg, png, webp, gif"
        )

    # Validar extensión (doble check de seguridad)
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
        raise HTTPException(status_code=400, detail="Extensión de archivo no permitida")

    # Leer contenido para validar tamaño
    file_content = await file.read()
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo muy grande. Máximo: {MAX_FILE_SIZE // 1024 // 1024}MB"
        )

    # Volver al inicio del archivo para Cloudinary
    await file.seek(0)

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Subir a Cloudinary con tipos permitidos
    try:
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder=f"reclamos/{reclamo_id}",
            resource_type="image",
            allowed_formats=["jpg", "png", "jpeg", "webp", "gif"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir archivo: {str(e)}")

    # Determinar tipo
    tipo = "imagen" if file.content_type.startswith("image/") else "documento"

    documento = Documento(
        reclamo_id=reclamo_id,
        usuario_id=current_user.id,
        nombre_original=file.filename,
        url=upload_result["secure_url"],
        public_id=upload_result["public_id"],
        tipo=tipo,
        mime_type=file.content_type,
        tamanio=upload_result.get("bytes"),
        etapa=etapa
    )
    db.add(documento)
    await db.commit()
    await db.refresh(documento)

    return {"message": "Archivo subido", "url": documento.url, "id": documento.id}


@router.get("/empleado/{empleado_id}/disponibilidad/{fecha}")
async def get_disponibilidad_empleado(
    empleado_id: int,
    fecha: str,
    buscar_siguiente: bool = Query(False, description="Buscar siguiente día si el actual está lleno"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtiene los bloques horarios ocupados de un empleado para una fecha específica.
    TODO: Migrar a dependencia cuando se implemente asignación por IA
    """
    # Por ahora retorna disponibilidad completa ya que no hay empleado_id en reclamos
    return {
        "fecha": fecha,
        "bloques_ocupados": [],
        "proximo_disponible": "09:00:00",
        "hora_fin_jornada": "18:00:00",
        "dia_lleno": False,
        "mensaje": "Pendiente migración a dependencias"
    }


@router.get("/{reclamo_id}/sugerencia-asignacion")
async def get_sugerencia_asignacion(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Algoritmo de asignación automática inteligente.
    Sugiere el mejor empleado para un reclamo basándose en:
    1. Especialidad/Categoría (peso: 40%)
    2. Zona geográfica (peso: 20%)
    3. Carga de trabajo actual (peso: 25%)
    4. Disponibilidad próxima (peso: 15%)

    Solo disponible para admin/supervisor. Empleados reciben respuesta vacía.
    """
    # Empleados no necesitan sugerencias (no pueden reasignar)
    if current_user.rol not in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        return {
            "sugerencias": [],
            "mensaje": "Las sugerencias de asignación solo están disponibles para supervisores"
        }
    from datetime import date as date_type, time as time_type, timedelta, datetime as datetime_type
    from models.empleado import Empleado
    from models.categoria import Categoria
    from models.empleado_categoria import empleado_categoria
    import math

    # Obtener el reclamo
    result = await db.execute(
        get_reclamos_query().where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.NUEVO:
        raise HTTPException(status_code=400, detail="Solo se pueden sugerir asignaciones para reclamos nuevos")

    # Obtener todos los empleados OPERARIOS activos del municipio
    # (los reclamos son atendidos por operarios, no administrativos)
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.categorias),
            selectinload(Empleado.zona_asignada),
            selectinload(Empleado.categoria_principal)
        )
        .where(
            Empleado.activo == True,
            Empleado.municipio_id == current_user.municipio_id,
            Empleado.tipo == "operario"  # Solo operarios para reclamos
        )
    )
    empleados = result.scalars().all()

    if not empleados:
        return {"sugerencias": [], "mensaje": "No hay empleados operarios activos disponibles"}

    sugerencias = []
    hoy = date_type.today()
    hora_inicio_jornada = time_type(9, 0)
    hora_fin_jornada = time_type(18, 0)

    for empleado in empleados:
        score = 0
        detalles = {
            "categoria_match": False,
            "zona_match": False,
            "carga_trabajo": 0,
            "disponibilidad_horas": 0,
            "proximo_disponible": None
        }

        # 1. ESPECIALIDAD/CATEGORÍA (40 puntos máx)
        categoria_score = 0
        categoria_ids = [cat.id for cat in (empleado.categorias or [])]

        # Normalizar nombre de categoría del reclamo para comparación
        cat_reclamo_nombre = reclamo.categoria.nombre.lower().strip() if reclamo.categoria else ""
        emp_especialidad = (empleado.especialidad or "").lower().strip()

        # Categoría principal por ID = 40 puntos
        if empleado.categoria_principal_id and empleado.categoria_principal_id == reclamo.categoria_id:
            categoria_score = 40
            detalles["categoria_match"] = True
        # Tiene la categoría en su lista de IDs = 30 puntos
        elif reclamo.categoria_id in categoria_ids:
            categoria_score = 30
            detalles["categoria_match"] = True
        # Match por nombre de especialidad (texto) = 35 puntos
        elif emp_especialidad and cat_reclamo_nombre and (
            emp_especialidad in cat_reclamo_nombre or
            cat_reclamo_nombre in emp_especialidad or
            emp_especialidad == cat_reclamo_nombre
        ):
            categoria_score = 35
            detalles["categoria_match"] = True
        # No tiene la categoría = 0 puntos

        score += categoria_score

        # 2. ZONA GEOGRÁFICA (20 puntos máx)
        zona_score = 0
        if reclamo.zona_id and empleado.zona_id:
            if empleado.zona_id == reclamo.zona_id:
                zona_score = 20
                detalles["zona_match"] = True
        elif reclamo.latitud and reclamo.longitud and empleado.zona_asignada:
            # Calcular distancia si hay coordenadas
            if empleado.zona_asignada.latitud_centro and empleado.zona_asignada.longitud_centro:
                dist = math.sqrt(
                    (reclamo.latitud - empleado.zona_asignada.latitud_centro) ** 2 +
                    (reclamo.longitud - empleado.zona_asignada.longitud_centro) ** 2
                )
                # Si está a menos de 0.01 grados (~1km) = 15 puntos
                if dist < 0.01:
                    zona_score = 15
                elif dist < 0.02:
                    zona_score = 10

        score += zona_score

        # 3. CARGA DE TRABAJO (25 puntos máx - menos carga = más puntos)
        # TODO: Migrar a dependencia cuando se implemente IA
        # Por ahora asumimos carga 0 ya que no hay empleado_id en reclamos
        carga_actual = 0
        detalles["carga_trabajo"] = carga_actual

        # 0 reclamos = 25 pts, 1-2 = 20 pts, 3-4 = 15 pts, 5-6 = 10 pts, 7+ = 5 pts
        if carga_actual == 0:
            carga_score = 25
        elif carga_actual <= 2:
            carga_score = 20
        elif carga_actual <= 4:
            carga_score = 15
        elif carga_actual <= 6:
            carga_score = 10
        else:
            carga_score = 5

        score += carga_score

        # 4. DISPONIBILIDAD PRÓXIMA (15 puntos máx)
        # TODO: Migrar a dependencia cuando se implemente IA
        # Por ahora asumimos disponibilidad completa ya que no hay empleado_id en reclamos
        disponibilidad_score = 15  # Máximo por defecto
        dias_hasta_disponible = 0
        detalles["proximo_disponible"] = hoy.isoformat()
        detalles["disponibilidad_horas"] = 45.0  # 5 días * 9 horas

        # disponibilidad_score ya está seteado arriba como 15

        score += disponibilidad_score

        # Incluir todos los empleados activos, priorizando los que tienen la categoría
        sugerencias.append({
            "empleado_id": empleado.id,
            "empleado_nombre": f"{empleado.nombre} {empleado.apellido or ''}".strip(),
            "categoria_principal": empleado.categoria_principal.nombre if empleado.categoria_principal else None,
            "zona": empleado.zona_asignada.nombre if empleado.zona_asignada else None,
            "score": score,
            "score_porcentaje": round(score),  # Ya está en escala 0-100
            "detalles": detalles,
            "razon_principal": _get_razon_principal(detalles, categoria_score, zona_score, carga_score, disponibilidad_score)
        })

    # Ordenar por score descendente
    sugerencias.sort(key=lambda x: x["score"], reverse=True)

    return {
        "reclamo_id": reclamo_id,
        "categoria": reclamo.categoria.nombre,
        "zona": reclamo.zona.nombre if reclamo.zona else None,
        "sugerencias": sugerencias[:5],  # Top 5
        "total_empleados_evaluados": len(empleados)
    }


def _get_razon_principal(detalles: dict, cat_score: int, zona_score: int, carga_score: int, disp_score: int) -> str:
    """Genera una explicación de por qué se sugiere este empleado."""
    razones = []

    if detalles["categoria_match"] and cat_score >= 30:
        razones.append("especialista en la categoría")

    if detalles["zona_match"]:
        razones.append("trabaja en la zona")

    if detalles["carga_trabajo"] == 0:
        razones.append("sin reclamos pendientes")
    elif detalles["carga_trabajo"] <= 2:
        razones.append("baja carga de trabajo")

    if detalles["proximo_disponible"]:
        from datetime import date as date_type
        fecha_disp = date_type.fromisoformat(detalles["proximo_disponible"])
        if fecha_disp == date_type.today():
            razones.append("disponible hoy")
        elif (fecha_disp - date_type.today()).days == 1:
            razones.append("disponible mañana")

    if not razones:
        razones.append("disponible")

    return ", ".join(razones).capitalize()


# ============ CONFIRMACIÓN DEL VECINO ============

class ConfirmacionVecinoRequest(BaseModel):
    """Request para que el vecino confirme si el problema fue solucionado."""
    solucionado: bool  # True = solucionado, False = sigue el problema
    comentario: Optional[str] = None


@router.post("/{reclamo_id}/confirmar-vecino")
async def confirmar_reclamo_vecino(
    reclamo_id: int,
    data: ConfirmacionVecinoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permite al vecino confirmar si el reclamo fue solucionado o sigue el problema.
    Solo el creador del reclamo puede confirmar.
    Solo se puede confirmar cuando el reclamo está en estado FINALIZADO o RESUELTO.
    """
    # Obtener reclamo
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar que el usuario es el creador
    if reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el creador del reclamo puede confirmar")

    # Verificar que el reclamo está en estado finalizado
    if reclamo.estado not in [EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]:
        raise HTTPException(
            status_code=400,
            detail=f"El reclamo debe estar finalizado para confirmar. Estado actual: {reclamo.estado.value}"
        )

    # Verificar que no fue confirmado antes
    if reclamo.confirmado_vecino is not None:
        raise HTTPException(
            status_code=400,
            detail="Este reclamo ya fue confirmado anteriormente"
        )

    # Guardar confirmación
    from datetime import datetime
    reclamo.confirmado_vecino = data.solucionado
    reclamo.fecha_confirmacion_vecino = datetime.now()
    reclamo.comentario_confirmacion_vecino = data.comentario

    # Registrar en historial
    accion = "confirmado_solucionado" if data.solucionado else "confirmado_sigue_problema"
    comentario_historial = f"El vecino {'confirmó que el problema fue solucionado' if data.solucionado else 'indica que el problema sigue sin resolverse'}"
    if data.comentario:
        comentario_historial += f": {data.comentario}"

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=reclamo.estado,
        estado_nuevo=reclamo.estado,  # No cambia el estado
        accion=accion,
        comentario=comentario_historial
    )
    db.add(historial)

    await db.commit()

    return {
        "success": True,
        "message": "Gracias por tu confirmación" if data.solucionado else "Lamentamos que el problema persista. Tu feedback fue registrado.",
        "confirmado_vecino": data.solucionado,
        "fecha_confirmacion": reclamo.fecha_confirmacion_vecino.isoformat()
    }


# ===========================================
# SISTEMA DE "SUMARSE" A RECLAMOS DUPLICADOS
# ===========================================

class SumarseRequest(BaseModel):
    comentario: Optional[str] = None

@router.post("/{reclamo_id}/sumarse")
async def sumarse_a_reclamo(
    reclamo_id: int,
    data: Optional[SumarseRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Usuario actual (vecino) se suma a un reclamo existente.
    Permite que múltiples usuarios se unan a un mismo reclamo en lugar de crear duplicados.
    """
    # Solo vecinos pueden sumarse
    if current_user.rol != RolUsuario.VECINO:
        raise HTTPException(
            status_code=403,
            detail="Solo los vecinos pueden sumarse a reclamos"
        )

    # Validar que el reclamo existe
    reclamo = await db.get(Reclamo, reclamo_id)
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Validar que el usuario no sea el creador original
    if reclamo.creador_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Ya eres el creador de este reclamo"
        )

    # Validar que no se haya sumado ya
    from models.reclamo_persona import ReclamoPersona
    result = await db.execute(
        select(ReclamoPersona).where(
            (ReclamoPersona.reclamo_id == reclamo_id) &
            (ReclamoPersona.usuario_id == current_user.id)
        )
    )
    if result.scalar():
        raise HTTPException(
            status_code=400,
            detail="Ya te has sumado a este reclamo"
        )

    # Crear registro en reclamo_personas
    nueva_persona = ReclamoPersona(
        reclamo_id=reclamo_id,
        usuario_id=current_user.id,
        es_creador_original=False
    )
    db.add(nueva_persona)

    # Agregar entrada en historial
    comentario_historial = f"{current_user.nombre} {current_user.apellido} se sumó al reclamo"
    if data and data.comentario:
        comentario_historial += f": {data.comentario}"

    historial = HistorialReclamo(
        reclamo_id=reclamo_id,
        usuario_id=current_user.id,
        accion="persona_sumada",
        comentario=comentario_historial
    )
    db.add(historial)

    # Actualizar updated_at del reclamo
    reclamo.updated_at = func.now()

    await db.commit()

    # TODO: Enviar notificación a todos los que se sumaron
    # await notificar_persona_sumada(reclamo_id, current_user, db)

    return {
        "success": True,
        "message": "Te has sumado al reclamo exitosamente",
        "reclamo_id": reclamo_id
    }
