from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
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
    db: AsyncSession,
    reclamo: Reclamo,
    tipo_notificacion: str,
    empleado_nombre: str = None,
    estado_anterior: str = None,
    estado_nuevo: str = None,
    comentario_texto: str = None,
    autor_nombre: str = None
):
    """
    Envía notificación push al creador del reclamo.
    tipo_notificacion: 'reclamo_recibido', 'reclamo_asignado', 'cambio_estado', 'reclamo_resuelto', 'nuevo_comentario'
    """
    try:
        from services.push_service import (
            notificar_reclamo_recibido,
            notificar_reclamo_asignado,
            notificar_cambio_estado,
            notificar_reclamo_resuelto,
            notificar_nuevo_comentario
        )

        if tipo_notificacion == 'reclamo_recibido':
            await notificar_reclamo_recibido(db, reclamo)
        elif tipo_notificacion == 'reclamo_asignado' and empleado_nombre:
            await notificar_reclamo_asignado(db, reclamo, empleado_nombre)
        elif tipo_notificacion == 'cambio_estado' and estado_anterior and estado_nuevo:
            await notificar_cambio_estado(db, reclamo, estado_anterior, estado_nuevo)
        elif tipo_notificacion == 'reclamo_resuelto':
            await notificar_reclamo_resuelto(db, reclamo)
        elif tipo_notificacion == 'nuevo_comentario':
            await notificar_nuevo_comentario(db, reclamo, comentario_texto, autor_nombre)

        print(f"[PUSH] Notificacion enviada: {tipo_notificacion}", flush=True)
    except Exception as e:
        print(f"[PUSH] Error enviando: {e}", flush=True)


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
        selectinload(Reclamo.creador),
        selectinload(Reclamo.empleado_asignado),
        selectinload(Reclamo.documentos)
    )

@router.get("", response_model=List[ReclamoResponse])
async def get_reclamos(
    request: Request,
    estado: Optional[EstadoReclamo] = None,
    categoria_id: Optional[int] = None,
    zona_id: Optional[int] = None,
    empleado_id: Optional[int] = None,
    search: Optional[str] = Query(None, description="Búsqueda en todos los campos"),
    skip: int = Query(0, ge=0, description="Número de registros a saltar"),
    limit: int = Query(20, ge=1, le=100, description="Número de registros a retornar"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models.categoria import Categoria
    from models.zona import Zona
    from models.empleado import Empleado
    from sqlalchemy import or_, cast, String
    from sqlalchemy.orm import joinedload

    # Si hay búsqueda, usar JOINs para poder filtrar en tablas relacionadas
    if search and search.strip():
        query = select(Reclamo).options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.zona),
            selectinload(Reclamo.creador),
            selectinload(Reclamo.empleado_asignado),
            selectinload(Reclamo.documentos)
        ).join(Reclamo.creador).outerjoin(Reclamo.categoria).outerjoin(Reclamo.zona).outerjoin(Reclamo.empleado_asignado)
    else:
        query = get_reclamos_query()

    # Filtrar por municipio (usa header para admins, o municipio del usuario)
    municipio_id = get_effective_municipio_id(request, current_user)
    query = query.where(Reclamo.municipio_id == municipio_id)

    # Filtrar según rol
    if current_user.rol == RolUsuario.VECINO:
        query = query.where(Reclamo.creador_id == current_user.id)
    elif current_user.rol == RolUsuario.EMPLEADO:
        # Empleado ve sus reclamos + los de su cuadrilla
        from models.empleado_cuadrilla import EmpleadoCuadrilla

        # Obtener IDs de cuadrillas del empleado
        cuadrillas_subq = select(EmpleadoCuadrilla.cuadrilla_id).where(
            EmpleadoCuadrilla.empleado_id == current_user.empleado_id,
            EmpleadoCuadrilla.activo == True
        )

        # Obtener IDs de compañeros de cuadrilla
        companeros_subq = select(EmpleadoCuadrilla.empleado_id).where(
            EmpleadoCuadrilla.cuadrilla_id.in_(cuadrillas_subq),
            EmpleadoCuadrilla.activo == True
        )

        # Filtrar: reclamos asignados al empleado O a compañeros de cuadrilla
        query = query.where(
            or_(
                Reclamo.empleado_id == current_user.empleado_id,
                Reclamo.empleado_id.in_(companeros_subq)
            )
        )

    # Filtros opcionales
    if estado:
        query = query.where(Reclamo.estado == estado)
    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)
    if zona_id:
        query = query.where(Reclamo.zona_id == zona_id)
    if empleado_id:
        query = query.where(Reclamo.empleado_id == empleado_id)

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
                # Empleado asignado
                func.lower(Empleado.nombre).like(search_term),
                func.lower(Empleado.apellido).like(search_term),
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
    transiciones_validas = {
        EstadoReclamo.NUEVO: [EstadoReclamo.ASIGNADO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.ASIGNADO: [EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.EN_PROCESO: [EstadoReclamo.RESUELTO, EstadoReclamo.PENDIENTE_CONFIRMACION, EstadoReclamo.ASIGNADO],
        EstadoReclamo.PENDIENTE_CONFIRMACION: [EstadoReclamo.RESUELTO, EstadoReclamo.EN_PROCESO],  # Supervisor confirma o devuelve
        EstadoReclamo.RESUELTO: [EstadoReclamo.EN_PROCESO],
        EstadoReclamo.RECHAZADO: [],
    }

    if estado_enum not in transiciones_validas.get(reclamo.estado, []):
        raise HTTPException(
            status_code=400,
            detail=f"No se puede cambiar de {reclamo.estado.value} a {estado_enum.value}"
        )

    # Verificar permisos de empleado
    if current_user.rol == RolUsuario.EMPLEADO:
        if reclamo.empleado_id != current_user.empleado_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para modificar este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = estado_enum

    if estado_enum == EstadoReclamo.RESUELTO:
        reclamo.fecha_resolucion = datetime.now(timezone.utc)

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_enum,
        accion="cambio_estado",
        comentario=f"Estado cambiado de {estado_anterior.value} a {estado_enum.value}"
    )
    db.add(historial)

    await db.commit()

    # Notificaciones en background (no bloquean respuesta)
    if estado_enum == EstadoReclamo.RESUELTO:
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
            EstadoReclamo.EN_PROCESO
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
            EstadoReclamo.EN_PROCESO
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
    """
    from sqlalchemy import case, extract
    from datetime import date as date_type

    empleado_id = current_user.empleado_id
    if not empleado_id:
        raise HTTPException(status_code=400, detail="No tenés un perfil de empleado asociado")

    query = select(
        func.count(Reclamo.id).label('total'),
        func.sum(case((Reclamo.estado == EstadoReclamo.RESUELTO, 1), else_=0)).label('resueltos'),
        func.sum(case((Reclamo.estado == EstadoReclamo.EN_PROCESO, 1), else_=0)).label('en_proceso'),
        func.sum(case((Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO]), 1), else_=0)).label('pendientes'),
    ).where(Reclamo.empleado_id == empleado_id)

    result = await db.execute(query)
    stats = result.first()

    primer_dia_mes = date_type.today().replace(day=1)
    query_mes = select(func.count(Reclamo.id)).where(
        Reclamo.empleado_id == empleado_id,
        Reclamo.estado == EstadoReclamo.RESUELTO,
        Reclamo.fecha_resolucion >= primer_dia_mes
    )
    result_mes = await db.execute(query_mes)
    resueltos_mes = result_mes.scalar() or 0

    query_tiempo = select(
        func.avg(
            extract('epoch', Reclamo.fecha_resolucion - Reclamo.created_at) / 86400
        )
    ).where(
        Reclamo.empleado_id == empleado_id,
        Reclamo.estado == EstadoReclamo.RESUELTO,
        Reclamo.fecha_resolucion.isnot(None)
    )
    result_tiempo = await db.execute(query_tiempo)
    tiempo_promedio = result_tiempo.scalar() or 0

    query_cats = select(
        Reclamo.categoria_id,
        func.count(Reclamo.id).label('cantidad')
    ).where(
        Reclamo.empleado_id == empleado_id
    ).group_by(Reclamo.categoria_id)

    result_cats = await db.execute(query_cats)
    cats_data = result_cats.all()

    from models.categoria import Categoria
    por_categoria = []
    for cat_id, cantidad in cats_data:
        if cat_id:
            cat_result = await db.execute(select(Categoria.nombre).where(Categoria.id == cat_id))
            cat_nombre = cat_result.scalar() or "Sin categoría"
            por_categoria.append({"categoria": cat_nombre, "cantidad": cantidad})

    por_categoria.sort(key=lambda x: x['cantidad'], reverse=True)

    query_ultimos = select(Reclamo).options(
        selectinload(Reclamo.categoria)
    ).where(
        Reclamo.empleado_id == empleado_id,
        Reclamo.estado == EstadoReclamo.RESUELTO
    ).order_by(Reclamo.fecha_resolucion.desc()).limit(10)

    result_ultimos = await db.execute(query_ultimos)
    ultimos = result_ultimos.scalars().all()

    ultimos_resueltos = [{
        "id": r.id,
        "titulo": r.titulo,
        "categoria": r.categoria.nombre if r.categoria else "Sin categoría",
        "fecha_resolucion": r.fecha_resolucion.strftime("%d/%m/%Y") if r.fecha_resolucion else ""
    } for r in ultimos]

    return {
        "total_asignados": stats.total or 0,
        "resueltos": stats.resueltos or 0,
        "en_proceso": stats.en_proceso or 0,
        "pendientes": stats.pendientes or 0,
        "resueltos_este_mes": resueltos_mes,
        "tiempo_promedio_resolucion": round(tiempo_promedio, 1) if tiempo_promedio else 0,
        "por_categoria": por_categoria,
        "ultimos_resueltos": ultimos_resueltos
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
    """
    empleado_id = current_user.empleado_id
    if not empleado_id:
        raise HTTPException(status_code=400, detail="No tenés un perfil de empleado asociado")

    query = select(Reclamo).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.zona),
        selectinload(Reclamo.creador),
        selectinload(Reclamo.calificacion)
    ).where(Reclamo.empleado_id == empleado_id)

    if estado:
        try:
            estado_enum = EstadoReclamo(estado.lower())
            query = query.where(Reclamo.estado == estado_enum)
        except ValueError:
            pass

    query = query.order_by(Reclamo.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    reclamos = result.scalars().all()

    historial = []
    for r in reclamos:
        tiempo_resolucion = None
        if r.fecha_resolucion and r.created_at:
            delta = r.fecha_resolucion - r.created_at
            tiempo_resolucion = round(delta.total_seconds() / 86400, 1)

        calificacion_data = None
        if r.calificacion:
            calificacion_data = {
                "puntuacion": r.calificacion.puntuacion,
                "comentario": r.calificacion.comentario,
                "fecha": r.calificacion.created_at.strftime("%d/%m/%Y") if r.calificacion.created_at else None
            }

        historial.append({
            "id": r.id,
            "titulo": r.titulo,
            "descripcion": r.descripcion[:100] + "..." if len(r.descripcion) > 100 else r.descripcion,
            "estado": r.estado.value if r.estado else None,
            "categoria": r.categoria.nombre if r.categoria else None,
            "zona": r.zona.nombre if r.zona else None,
            "direccion": r.direccion,
            "prioridad": r.prioridad,
            "fecha_creacion": r.created_at.strftime("%d/%m/%Y %H:%M") if r.created_at else None,
            "fecha_resolucion": r.fecha_resolucion.strftime("%d/%m/%Y %H:%M") if r.fecha_resolucion else None,
            "tiempo_resolucion_dias": tiempo_resolucion,
            "creador": f"{r.creador.nombre} {r.creador.apellido}" if r.creador else "Anónimo",
            "calificacion": calificacion_data
        })

    count_query = select(func.count(Reclamo.id)).where(Reclamo.empleado_id == empleado_id)
    if estado:
        try:
            estado_enum = EstadoReclamo(estado.lower())
            count_query = count_query.where(Reclamo.estado == estado_enum)
        except ValueError:
            pass

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    return {
        "data": historial,
        "total": total,
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

    # Notificaciones en background (no bloquean respuesta)
    # await enviar_notificacion_whatsapp(db, reclamo, 'reclamo_recibido', current_user.municipio_id)
    asyncio.create_task(enviar_notificacion_push(db, reclamo, 'reclamo_recibido'))

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
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado not in [EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO]:
        raise HTTPException(status_code=400, detail="El reclamo no puede ser asignado en su estado actual")

    estado_anterior = reclamo.estado
    reclamo.empleado_id = data.empleado_id
    reclamo.estado = EstadoReclamo.ASIGNADO

    # Programacion del trabajo
    if data.fecha_programada:
        reclamo.fecha_programada = data.fecha_programada
    if data.hora_inicio:
        reclamo.hora_inicio = data.hora_inicio
    if data.hora_fin:
        reclamo.hora_fin = data.hora_fin

    # Construir comentario del historial
    comentario_historial = data.comentario or f"Asignado a empleado #{data.empleado_id}"
    if data.fecha_programada:
        comentario_historial += f" - Programado para {data.fecha_programada}"
        if data.hora_inicio and data.hora_fin:
            comentario_historial += f" de {data.hora_inicio} a {data.hora_fin}"

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.ASIGNADO,
        accion="asignado",
        comentario=comentario_historial
    )
    db.add(historial)

    await db.commit()

    # Guardar IDs antes de cerrar la sesión para usar en background tasks
    reclamo_id_for_push = reclamo.id
    empleado_id_for_push = data.empleado_id
    creador_id_for_push = reclamo.creador_id

    # Notificación Push al EMPLEADO: nueva asignación
    # Buscar el user_id del empleado asignado (antes de cerrar la sesión)
    empleado_result = await db.execute(
        select(User).where(User.empleado_id == data.empleado_id)
    )
    empleado_user = empleado_result.scalar_one_or_none()
    empleado_user_id = empleado_user.id if empleado_user else None

    # Enviar notificaciones en background con nueva sesión
    async def enviar_push_asignacion():
        from core.database import AsyncSessionLocal
        from services.push_service import notificar_asignacion_empleado, send_push_to_user
        try:
            async with AsyncSessionLocal() as new_db:
                # Notificar al vecino
                await send_push_to_user(
                    new_db,
                    creador_id_for_push,
                    "Reclamo Asignado",
                    f"Tu reclamo #{reclamo_id_for_push} fue asignado a un empleado.",
                    f"/reclamos/{reclamo_id_for_push}",
                    data={"tipo": "reclamo_asignado", "reclamo_id": reclamo_id_for_push}
                )
                # Notificar al empleado
                if empleado_user_id:
                    # Recargar el reclamo en la nueva sesión
                    result = await new_db.execute(select(Reclamo).where(Reclamo.id == reclamo_id_for_push))
                    reclamo_fresh = result.scalar_one_or_none()
                    if reclamo_fresh:
                        await notificar_asignacion_empleado(new_db, empleado_user_id, reclamo_fresh)
                print(f"[PUSH] Notificaciones de asignación enviadas para reclamo #{reclamo_id_for_push}", flush=True)
        except Exception as e:
            print(f"[PUSH] Error en background task: {e}", flush=True)

    asyncio.create_task(enviar_push_asignacion())

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/iniciar", response_model=ReclamoResponse)
async def iniciar_reclamo(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.ASIGNADO:
        raise HTTPException(status_code=400, detail="El reclamo debe estar asignado para iniciarlo")

    # Verificar que el empleado del usuario sea el asignado
    if current_user.rol == RolUsuario.EMPLEADO and reclamo.empleado_id != current_user.empleado_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para iniciar este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.EN_PROCESO

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.EN_PROCESO,
        accion="en_proceso",
        comentario="Trabajo iniciado"
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

    if reclamo.estado != EstadoReclamo.EN_PROCESO:
        raise HTTPException(status_code=400, detail="El reclamo debe estar en proceso para resolverlo")

    if current_user.rol == RolUsuario.EMPLEADO and reclamo.empleado_id != current_user.empleado_id:
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

        # Obtener nombre del empleado
        result_emp = await db.execute(
            select(Empleado).where(Empleado.id == current_user.empleado_id)
        )
        empleado = result_emp.scalar_one_or_none()
        empleado_nombre = f"{empleado.nombre} {empleado.apellido or ''}".strip() if empleado else "Empleado"

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
        # Admin/Supervisor resuelve directamente
        reclamo.estado = EstadoReclamo.RESUELTO
        reclamo.fecha_resolucion = datetime.now(timezone.utc)

        historial = HistorialReclamo(
            reclamo_id=reclamo.id,
            usuario_id=current_user.id,
            estado_anterior=estado_anterior,
            estado_nuevo=EstadoReclamo.RESUELTO,
            accion="resuelto",
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
    Cambia el estado a EN_PROCESO y notifica al empleado.
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
    reclamo.estado = EstadoReclamo.EN_PROCESO

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.EN_PROCESO,
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
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar permisos: admin/supervisor pueden comentar en cualquiera,
    # vecinos solo en sus propios reclamos
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para comentar en este reclamo")

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

    # Enviar notificación push del comentario
    await enviar_notificacion_push(
        db, reclamo, 'nuevo_comentario',
        comentario_texto=data.comentario[:100],
        autor_nombre=f"{current_user.nombre} {current_user.apellido or ''}".strip()
    )

    return historial


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
    Devuelve los rangos horarios ya asignados y el próximo horario disponible.
    Si buscar_siguiente=True y el día está lleno, busca el próximo día con disponibilidad.
    """
    from datetime import date as date_type, time as time_type, timedelta, datetime as datetime_type

    # Parsear la fecha
    try:
        fecha_date = date_type.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    hora_inicio_jornada = time_type(9, 0)   # 9:00
    hora_fin_jornada = time_type(18, 0)     # 18:00
    hoy = date_type.today()
    hora_actual = datetime_type.now().time()

    # Función para obtener disponibilidad de un día específico
    async def get_disponibilidad_dia(fecha_check: date_type):
        result = await db.execute(
            select(Reclamo)
            .where(
                Reclamo.empleado_id == empleado_id,
                Reclamo.fecha_programada == fecha_check,
                Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
            )
            .order_by(Reclamo.hora_inicio)
        )
        reclamos = result.scalars().all()

        bloques_ocupados = []
        for r in reclamos:
            if r.hora_inicio and r.hora_fin:
                bloques_ocupados.append({
                    "reclamo_id": r.id,
                    "titulo": r.titulo,
                    "hora_inicio": r.hora_inicio.isoformat() if r.hora_inicio else None,
                    "hora_fin": r.hora_fin.isoformat() if r.hora_fin else None
                })

        # Calcular próximo horario disponible
        proximo_disponible = hora_inicio_jornada
        bloques_ocupados_sorted = sorted(bloques_ocupados, key=lambda x: x["hora_inicio"] or "00:00")

        for bloque in bloques_ocupados_sorted:
            if bloque["hora_fin"]:
                hora_fin_bloque = time_type.fromisoformat(bloque["hora_fin"])
                if hora_fin_bloque > proximo_disponible:
                    proximo_disponible = hora_fin_bloque

        # Si es el día de hoy y la hora actual es mayor al próximo disponible,
        # el próximo disponible debe ser la hora actual (redondeada al próximo bloque de 30 min)
        if fecha_check == hoy and hora_actual > proximo_disponible:
            # Redondear hora actual al próximo bloque de 30 minutos
            minutos = hora_actual.hour * 60 + hora_actual.minute
            minutos_redondeados = ((minutos + 29) // 30) * 30  # Redondear hacia arriba
            # Manejar caso donde pasa de las 24:00
            if minutos_redondeados >= 24 * 60:
                minutos_redondeados = 23 * 60 + 59
            hora_redondeada = time_type(minutos_redondeados // 60, minutos_redondeados % 60)
            proximo_disponible = hora_redondeada

        # Verificar si el día está lleno:
        # 1. Si próximo disponible >= hora fin jornada
        # 2. Si es hoy y ya pasaron las 17:00 (no alcanza para ni 1 hora de trabajo)
        dia_lleno = proximo_disponible >= hora_fin_jornada
        if fecha_check == hoy and hora_actual >= time_type(17, 0):
            dia_lleno = True

        return {
            "fecha": fecha_check.isoformat(),
            "bloques_ocupados": bloques_ocupados,
            "proximo_disponible": proximo_disponible.isoformat(),
            "hora_fin_jornada": hora_fin_jornada.isoformat(),
            "dia_lleno": dia_lleno
        }

    # Obtener disponibilidad del día solicitado
    disponibilidad = await get_disponibilidad_dia(fecha_date)

    # Si buscar_siguiente está activado y el día está lleno, buscar siguiente
    if buscar_siguiente and disponibilidad["dia_lleno"]:
        # Buscar hasta 30 días adelante
        for i in range(1, 31):
            siguiente_fecha = fecha_date + timedelta(days=i)
            # Saltar fines de semana
            if siguiente_fecha.weekday() >= 5:  # 5=Sábado, 6=Domingo
                continue

            disponibilidad_siguiente = await get_disponibilidad_dia(siguiente_fecha)
            if not disponibilidad_siguiente["dia_lleno"]:
                disponibilidad = disponibilidad_siguiente
                break

    return disponibilidad


@router.get("/{reclamo_id}/sugerencia-asignacion")
async def get_sugerencia_asignacion(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Algoritmo de asignación automática inteligente.
    Sugiere el mejor empleado para un reclamo basándose en:
    1. Especialidad/Categoría (peso: 40%)
    2. Zona geográfica (peso: 20%)
    3. Carga de trabajo actual (peso: 25%)
    4. Disponibilidad próxima (peso: 15%)
    """
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

    # Obtener todos los empleados activos del municipio
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.categorias),
            selectinload(Empleado.zona_asignada),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.activo == True, Empleado.municipio_id == current_user.municipio_id)
    )
    empleados = result.scalars().all()

    if not empleados:
        return {"sugerencias": [], "mensaje": "No hay empleados activos disponibles"}

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
        result_carga = await db.execute(
            select(func.count(Reclamo.id))
            .where(
                Reclamo.empleado_id == empleado.id,
                Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
            )
        )
        carga_actual = result_carga.scalar() or 0
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
        # Buscar disponibilidad en los próximos 5 días laborales
        disponibilidad_score = 0
        dias_hasta_disponible = None
        horas_disponibles_semana = 0

        for dias_offset in range(7):  # Buscar en los próximos 7 días
            fecha_check = hoy + timedelta(days=dias_offset)
            # Saltar fines de semana
            if fecha_check.weekday() >= 5:
                continue

            # Obtener reclamos programados para ese día
            result_dia = await db.execute(
                select(Reclamo)
                .where(
                    Reclamo.empleado_id == empleado.id,
                    Reclamo.fecha_programada == fecha_check,
                    Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
                )
            )
            reclamos_dia = result_dia.scalars().all()

            # Calcular horas ocupadas
            horas_ocupadas = 0
            for r in reclamos_dia:
                if r.hora_inicio and r.hora_fin:
                    inicio_min = r.hora_inicio.hour * 60 + r.hora_inicio.minute
                    fin_min = r.hora_fin.hour * 60 + r.hora_fin.minute
                    horas_ocupadas += (fin_min - inicio_min) / 60

            horas_jornada = 9  # 9:00 a 18:00
            horas_libres = max(0, horas_jornada - horas_ocupadas)
            horas_disponibles_semana += horas_libres

            # Si hoy y ya pasaron las 17:00, el día está lleno
            if dias_offset == 0:
                hora_actual = datetime_type.now().time()
                if hora_actual >= time_type(17, 0):
                    continue

            if dias_hasta_disponible is None and horas_libres >= 1:
                dias_hasta_disponible = dias_offset
                detalles["proximo_disponible"] = fecha_check.isoformat()

        detalles["disponibilidad_horas"] = round(horas_disponibles_semana, 1)

        # Disponible hoy = 15 pts, mañana = 12 pts, 2 días = 10 pts, etc.
        if dias_hasta_disponible is not None:
            if dias_hasta_disponible == 0:
                disponibilidad_score = 15
            elif dias_hasta_disponible == 1:
                disponibilidad_score = 12
            elif dias_hasta_disponible == 2:
                disponibilidad_score = 10
            elif dias_hasta_disponible <= 4:
                disponibilidad_score = 7
            else:
                disponibilidad_score = 5

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
