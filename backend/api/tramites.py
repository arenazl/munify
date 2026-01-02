from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, date
import logging
import cloudinary
import cloudinary.uploader

from core.database import get_db
from core.security import get_current_user, get_current_user_optional, require_roles
from core.config import settings
from models.tramite import TipoTramite, Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud
from models.user import User
from models.enums import RolUsuario
from models.notificacion import Notificacion
from schemas.tramite import (
    TipoTramiteCreate, TipoTramiteUpdate, TipoTramiteResponse, TipoTramiteConTramites,
    TramiteCreate, TramiteUpdate, TramiteResponse,
    SolicitudCreate, SolicitudUpdate, SolicitudResponse, SolicitudGestionResponse, SolicitudAsignar,
    HistorialSolicitudResponse
)
from models.empleado import Empleado
from models.documento_solicitud import DocumentoSolicitud
from services.notificacion_service import NotificacionService, get_plantilla, formatear_mensaje

# Configurar Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== TIPOS DE TRAMITE (Categorías) ====================

@router.get("/tipos", response_model=List[TipoTramiteResponse])
async def listar_tipos_tramite(
    municipio_id: int = Query(..., description="ID del municipio"),
    solo_activos: bool = Query(True, description="Solo tipos activos"),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los tipos de trámites (categorías) de un municipio"""
    query = select(TipoTramite).where(TipoTramite.municipio_id == municipio_id)

    if solo_activos:
        query = query.where(TipoTramite.activo == True)

    query = query.order_by(TipoTramite.orden, TipoTramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/tipos/{tipo_id}", response_model=TipoTramiteConTramites)
async def obtener_tipo_tramite(
    tipo_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Obtiene un tipo de trámite con sus trámites específicos"""
    result = await db.execute(
        select(TipoTramite)
        .options(selectinload(TipoTramite.tramites))
        .where(TipoTramite.id == tipo_id)
    )
    tipo = result.scalar_one_or_none()

    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de trámite no encontrado")

    return tipo


@router.post("/tipos", response_model=TipoTramiteResponse)
async def crear_tipo_tramite(
    tipo_data: TipoTramiteCreate,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo tipo de trámite (solo admin/supervisor)"""
    tipo = TipoTramite(
        municipio_id=municipio_id,
        **tipo_data.model_dump()
    )

    db.add(tipo)
    await db.commit()
    await db.refresh(tipo)

    return tipo


@router.put("/tipos/{tipo_id}", response_model=TipoTramiteResponse)
async def actualizar_tipo_tramite(
    tipo_id: int,
    tipo_data: TipoTramiteUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un tipo de trámite"""
    result = await db.execute(
        select(TipoTramite).where(TipoTramite.id == tipo_id)
    )
    tipo = result.scalar_one_or_none()

    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de trámite no encontrado")

    for field, value in tipo_data.model_dump(exclude_unset=True).items():
        setattr(tipo, field, value)

    await db.commit()
    await db.refresh(tipo)

    return tipo


# ==================== TRAMITES (Específicos) ====================

@router.get("/catalogo", response_model=List[TramiteResponse])
async def listar_tramites_catalogo(
    tipo_id: Optional[int] = Query(None, description="ID del tipo de trámite (opcional)"),
    tipo_tramite_id: Optional[int] = Query(None, description="Alias de tipo_id"),
    solo_activos: bool = Query(True, description="Solo trámites activos"),
    db: AsyncSession = Depends(get_db)
):
    """Lista trámites del catálogo. Si no se especifica tipo_id, devuelve todos."""
    query = select(Tramite).options(selectinload(Tramite.tipo_tramite))

    # Filtrar por tipo si se especifica
    tipo = tipo_id or tipo_tramite_id
    if tipo:
        query = query.where(Tramite.tipo_tramite_id == tipo)

    if solo_activos:
        query = query.where(Tramite.activo == True)

    query = query.order_by(Tramite.orden, Tramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/catalogo/{tramite_id}", response_model=TramiteResponse)
async def obtener_tramite_catalogo(
    tramite_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Obtiene un trámite del catálogo por ID"""
    result = await db.execute(
        select(Tramite).where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    return tramite


@router.post("/catalogo", response_model=TramiteResponse)
async def crear_tramite_catalogo(
    tramite_data: TramiteCreate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo trámite en el catálogo (solo admin/supervisor)"""
    # Verificar que el tipo existe
    result = await db.execute(
        select(TipoTramite).where(TipoTramite.id == tramite_data.tipo_tramite_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tipo de trámite no encontrado")

    tramite = Tramite(**tramite_data.model_dump())

    db.add(tramite)
    await db.commit()
    await db.refresh(tramite)

    return tramite


@router.put("/catalogo/{tramite_id}", response_model=TramiteResponse)
async def actualizar_tramite_catalogo(
    tramite_id: int,
    tramite_data: TramiteUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un trámite del catálogo"""
    result = await db.execute(
        select(Tramite).where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    for field, value in tramite_data.model_dump(exclude_unset=True).items():
        setattr(tramite, field, value)

    await db.commit()
    await db.refresh(tramite)

    return tramite


# ==================== SOLICITUDES (Pedidos diarios) ====================

@router.get("/solicitudes", response_model=List[SolicitudResponse])
async def listar_solicitudes(
    municipio_id: int = Query(..., description="ID del municipio"),
    estado: Optional[EstadoSolicitud] = Query(None, description="Filtrar por estado"),
    tramite_id: Optional[int] = Query(None, description="Filtrar por trámite"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Lista solicitudes. Vecino ve las suyas, gestor ve todas."""
    query = select(Solicitud).where(Solicitud.municipio_id == municipio_id)

    # Vecino solo ve sus propias solicitudes
    if current_user and current_user.rol == RolUsuario.VECINO:
        query = query.where(Solicitud.solicitante_id == current_user.id)
    elif not current_user:
        raise HTTPException(status_code=401, detail="Debe iniciar sesión para ver sus solicitudes")

    if estado:
        query = query.where(Solicitud.estado == estado)

    if tramite_id:
        query = query.where(Solicitud.tramite_id == tramite_id)

    query = query.options(
        selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite),
        selectinload(Solicitud.empleado_asignado),
        selectinload(Solicitud.solicitante)
    )
    query = query.order_by(Solicitud.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/solicitudes/consultar/{numero_tramite}", response_model=SolicitudResponse)
async def consultar_solicitud_por_numero(
    numero_tramite: str,
    db: AsyncSession = Depends(get_db)
):
    """Consulta una solicitud por su número (público, para seguimiento)"""
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite),
            selectinload(Solicitud.empleado_asignado),
            selectinload(Solicitud.solicitante)
        )
        .where(Solicitud.numero_tramite == numero_tramite)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    return solicitud


@router.get("/solicitudes/{solicitud_id}", response_model=SolicitudResponse)
async def obtener_solicitud(
    solicitud_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene una solicitud por ID"""
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite),
            selectinload(Solicitud.empleado_asignado),
            selectinload(Solicitud.solicitante)
        )
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Vecino solo puede ver sus propias solicitudes
    if current_user and current_user.rol == RolUsuario.VECINO:
        if solicitud.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso para ver esta solicitud")

    return solicitud


@router.post("/solicitudes", response_model=SolicitudResponse)
async def crear_solicitud(
    solicitud_data: SolicitudCreate,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Crea una nueva solicitud de trámite"""
    # Verificar que el trámite existe y está activo
    result = await db.execute(
        select(Tramite)
        .options(selectinload(Tramite.tipo_tramite))
        .where(
            and_(
                Tramite.id == solicitud_data.tramite_id,
                Tramite.activo == True
            )
        )
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado o no disponible")

    # Generar número de solicitud único
    year = datetime.now().year
    result = await db.execute(
        select(func.count(Solicitud.id)).where(
            and_(
                Solicitud.municipio_id == municipio_id,
                func.extract('year', Solicitud.created_at) == year
            )
        )
    )
    count = result.scalar() or 0
    numero_tramite = f"SOL-{year}-{str(count + 1).zfill(5)}"

    # Preparar datos
    solicitud_dict = solicitud_data.model_dump()

    solicitud = Solicitud(
        municipio_id=municipio_id,
        numero_tramite=numero_tramite,
        estado=EstadoSolicitud.INICIADO,
        **solicitud_dict
    )

    # Si hay usuario logueado, asociar datos usando reflexión
    if current_user:
        solicitud.solicitante_id = current_user.id
        # Campos que se copian de User a Solicitud (user_field -> solicitud tiene sufijo _solicitante)
        for campo in ["nombre", "apellido", "email", "telefono", "dni", "direccion"]:
            campo_solicitud = f"{campo}_solicitante"
            if not getattr(solicitud, campo_solicitud, None):
                setattr(solicitud, campo_solicitud, getattr(current_user, campo, None))
    else:
        # Anónimo: verificar datos de contacto
        if not solicitud_data.email_solicitante and not solicitud_data.telefono_solicitante:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar al menos email o teléfono para seguimiento"
            )

    db.add(solicitud)
    await db.commit()
    await db.refresh(solicitud)

    # Historial
    historial = HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id if current_user else None,
        estado_nuevo=EstadoSolicitud.INICIADO,
        accion="Solicitud creada",
        comentario=f"Trámite: {tramite.nombre}"
    )
    db.add(historial)
    await db.commit()

    await db.refresh(solicitud, ["tramite"])

    # Notificaciones
    try:
        if current_user:
            variables = {
                "numero_tramite": solicitud.numero_tramite,
                "tramite": tramite.nombre,
                "asunto": solicitud.asunto or "Sin asunto",
                "nombre": solicitud.nombre_solicitante or "Vecino",
            }
            plantilla = get_plantilla("tramite_creado")
            if plantilla:
                push_config = plantilla.get("push", {})
                titulo = formatear_mensaje(push_config.get("titulo", "Solicitud Registrada"), variables)
                cuerpo = formatear_mensaje(push_config.get("cuerpo", ""), variables)

                notif = Notificacion(
                    usuario_id=current_user.id,
                    titulo=titulo,
                    mensaje=cuerpo,
                    tipo="tramite"
                )
                db.add(notif)
                await db.commit()

        # Notificar supervisores
        await NotificacionService.notificar_supervisores(
            db=db,
            municipio_id=municipio_id,
            titulo=f"Nueva Solicitud: {solicitud.numero_tramite}",
            mensaje=f"Nueva solicitud de {tramite.nombre}: {solicitud.asunto or 'Sin asunto'}",
            tipo="tramite",
            enviar_whatsapp=False
        )
    except Exception as e:
        logger.error(f"Error enviando notificaciones: {e}")

    return solicitud


@router.put("/solicitudes/{solicitud_id}", response_model=SolicitudResponse)
async def actualizar_solicitud(
    solicitud_id: int,
    solicitud_data: SolicitudUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR, RolUsuario.EMPLEADO])),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza una solicitud (solo personal municipal)"""
    result = await db.execute(
        select(Solicitud)
        .options(selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite))
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    estado_anterior = solicitud.estado

    for field, value in solicitud_data.model_dump(exclude_unset=True).items():
        setattr(solicitud, field, value)

    # Si cambió el estado
    cambio_estado = solicitud_data.estado and solicitud_data.estado != estado_anterior
    if cambio_estado:
        if solicitud_data.estado in [EstadoSolicitud.APROBADO, EstadoSolicitud.RECHAZADO, EstadoSolicitud.FINALIZADO]:
            solicitud.fecha_resolucion = datetime.utcnow()

        historial = HistorialSolicitud(
            solicitud_id=solicitud.id,
            usuario_id=current_user.id,
            estado_anterior=estado_anterior,
            estado_nuevo=solicitud_data.estado,
            accion=f"Estado cambiado a {solicitud_data.estado.value}",
            comentario=solicitud_data.observaciones
        )
        db.add(historial)

    await db.commit()
    await db.refresh(solicitud)

    # Notificaciones por cambio de estado
    if cambio_estado and solicitud.solicitante_id:
        try:
            variables = {
                "numero_tramite": solicitud.numero_tramite,
                "tramite": solicitud.tramite.nombre if solicitud.tramite else "Trámite",
                "estado_nuevo": solicitud_data.estado.value.replace("_", " ").title(),
                "nombre": solicitud.nombre_solicitante or "Vecino",
            }

            if solicitud_data.estado == EstadoSolicitud.APROBADO:
                tipo_notif = "tramite_aprobado"
            elif solicitud_data.estado == EstadoSolicitud.RECHAZADO:
                tipo_notif = "tramite_rechazado"
            else:
                tipo_notif = "tramite_cambio_estado"

            plantilla = get_plantilla(tipo_notif)
            if plantilla:
                push_config = plantilla.get("push", {})
                titulo = formatear_mensaje(push_config.get("titulo", "Estado Actualizado"), variables)
                cuerpo = formatear_mensaje(push_config.get("cuerpo", ""), variables)

                notif = Notificacion(
                    usuario_id=solicitud.solicitante_id,
                    titulo=titulo,
                    mensaje=cuerpo,
                    tipo="tramite"
                )
                db.add(notif)
                await db.commit()
        except Exception as e:
            logger.error(f"Error notificación cambio estado: {e}")

    return solicitud


@router.get("/solicitudes/{solicitud_id}/historial", response_model=List[HistorialSolicitudResponse])
async def obtener_historial_solicitud(
    solicitud_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene el historial de una solicitud"""
    result = await db.execute(
        select(Solicitud).where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    if current_user and current_user.rol == RolUsuario.VECINO:
        if solicitud.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso")

    result = await db.execute(
        select(HistorialSolicitud)
        .where(HistorialSolicitud.solicitud_id == solicitud_id)
        .order_by(HistorialSolicitud.created_at.desc())
    )

    return result.scalars().all()


# ==================== ASIGNACIÓN ====================

@router.post("/solicitudes/{solicitud_id}/asignar", response_model=SolicitudResponse)
async def asignar_solicitud(
    solicitud_id: int,
    asignacion: SolicitudAsignar,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Asigna un empleado a una solicitud"""
    result = await db.execute(
        select(Solicitud)
        .options(
            selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite),
            selectinload(Solicitud.empleado_asignado),
            selectinload(Solicitud.solicitante)
        )
        .where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Verificar empleado
    result = await db.execute(
        select(Empleado).where(
            and_(
                Empleado.id == asignacion.empleado_id,
                Empleado.municipio_id == solicitud.municipio_id,
                Empleado.activo == True
            )
        )
    )
    empleado = result.scalar_one_or_none()

    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    empleado_anterior_id = solicitud.empleado_id
    estado_anterior = solicitud.estado

    solicitud.empleado_id = asignacion.empleado_id

    if solicitud.estado == EstadoSolicitud.INICIADO:
        solicitud.estado = EstadoSolicitud.EN_REVISION

    accion = "Empleado asignado" if not empleado_anterior_id else "Empleado reasignado"
    historial = HistorialSolicitud(
        solicitud_id=solicitud.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=solicitud.estado,
        accion=f"{accion}: {empleado.nombre} {empleado.apellido or ''}",
        comentario=asignacion.comentario
    )
    db.add(historial)

    await db.commit()
    await db.refresh(solicitud)

    return solicitud


# ==================== ESTADÍSTICAS ====================

@router.get("/stats/resumen")
async def resumen_solicitudes(
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Resumen de solicitudes para dashboard"""
    # Contar por estado
    result = await db.execute(
        select(Solicitud.estado, func.count(Solicitud.id))
        .where(Solicitud.municipio_id == municipio_id)
        .group_by(Solicitud.estado)
    )
    por_estado = {row[0].value.lower(): row[1] for row in result.all()}

    # Total
    total_result = await db.execute(
        select(func.count(Solicitud.id)).where(Solicitud.municipio_id == municipio_id)
    )
    total = total_result.scalar() or 0

    # Hoy
    hoy_result = await db.execute(
        select(func.count(Solicitud.id)).where(
            and_(
                Solicitud.municipio_id == municipio_id,
                func.date(Solicitud.created_at) == date.today()
            )
        )
    )
    hoy = hoy_result.scalar() or 0

    return {
        "total": total,
        "hoy": hoy,
        "por_estado": por_estado
    }


# ==================== CONTEOS PARA FILTROS ====================

@router.get("/stats/conteo-estados")
async def conteo_estados_solicitudes(
    municipio_id: int = Query(None, description="ID del municipio (opcional, usa el del usuario)"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR, RolUsuario.EMPLEADO])),
    db: AsyncSession = Depends(get_db)
):
    """Conteo de solicitudes por estado (optimizado para filtros)"""
    muni_id = municipio_id or current_user.municipio_id
    query = select(Solicitud.estado, func.count(Solicitud.id)).where(
        Solicitud.municipio_id == muni_id
    )

    # Empleado solo ve los suyos
    if current_user.rol == RolUsuario.EMPLEADO:
        query = query.where(Solicitud.empleado_id == current_user.empleado_id)

    query = query.group_by(Solicitud.estado)
    result = await db.execute(query)

    return {row[0].value.lower(): row[1] for row in result.all()}


@router.get("/stats/conteo-tipos")
async def conteo_tipos_solicitudes(
    municipio_id: int = Query(None, description="ID del municipio (opcional, usa el del usuario)"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR, RolUsuario.EMPLEADO])),
    db: AsyncSession = Depends(get_db)
):
    """Conteo de solicitudes por tipo de trámite (optimizado para filtros)"""
    muni_id = municipio_id or current_user.municipio_id
    query = select(
        TipoTramite.id,
        TipoTramite.nombre,
        TipoTramite.icono,
        TipoTramite.color,
        func.count(Solicitud.id).label('cantidad')
    ).select_from(Solicitud).join(
        Tramite, Solicitud.tramite_id == Tramite.id
    ).join(
        TipoTramite, Tramite.tipo_tramite_id == TipoTramite.id
    ).where(
        Solicitud.municipio_id == muni_id
    )

    # Empleado solo ve los suyos
    if current_user.rol == RolUsuario.EMPLEADO:
        query = query.where(Solicitud.empleado_id == current_user.empleado_id)

    query = query.group_by(TipoTramite.id, TipoTramite.nombre, TipoTramite.icono, TipoTramite.color)
    query = query.order_by(func.count(Solicitud.id).desc())

    result = await db.execute(query)

    return [
        {
            "id": row[0],
            "nombre": row[1],
            "icono": row[2],
            "color": row[3],
            "cantidad": row[4]
        }
        for row in result.all()
    ]


# ==================== GESTIÓN ====================

@router.get("/gestion/solicitudes", response_model=List[SolicitudGestionResponse])
async def listar_solicitudes_gestion(
    municipio_id: int = Query(..., description="ID del municipio"),
    estado: Optional[EstadoSolicitud] = Query(None),
    tramite_id: Optional[int] = Query(None),
    tipo_tramite_id: Optional[int] = Query(None, description="Filtrar por tipo/categoría de trámite"),
    empleado_id: Optional[int] = Query(None),
    sin_asignar: bool = Query(False),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR, RolUsuario.EMPLEADO])),
    db: AsyncSession = Depends(get_db)
):
    """Lista solicitudes para gestión con paginación"""
    query = select(Solicitud).where(Solicitud.municipio_id == municipio_id)

    if estado:
        query = query.where(Solicitud.estado == estado)

    if tramite_id:
        query = query.where(Solicitud.tramite_id == tramite_id)

    # Filtro por tipo de trámite (categoría)
    if tipo_tramite_id:
        query = query.join(Tramite, Solicitud.tramite_id == Tramite.id).where(
            Tramite.tipo_tramite_id == tipo_tramite_id
        )

    if empleado_id:
        query = query.where(Solicitud.empleado_id == empleado_id)

    if sin_asignar:
        query = query.where(Solicitud.empleado_id == None)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Solicitud.numero_tramite.ilike(search_term)) |
            (Solicitud.asunto.ilike(search_term)) |
            (Solicitud.nombre_solicitante.ilike(search_term)) |
            (Solicitud.apellido_solicitante.ilike(search_term)) |
            (Solicitud.dni_solicitante.ilike(search_term))
        )

    # Empleado solo ve los suyos
    if current_user.rol == RolUsuario.EMPLEADO:
        query = query.where(Solicitud.empleado_id == current_user.empleado_id)

    # Optimización: solo cargar relaciones necesarias para la lista
    query = query.options(
        selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite),
        selectinload(Solicitud.empleado_asignado)
        # No cargar solicitante completo, ya tenemos nombre_solicitante, apellido_solicitante, etc.
    )
    query = query.order_by(Solicitud.prioridad, Solicitud.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


# ==================== DOCUMENTOS ====================

# Tipos de archivo permitidos y tamaño máximo
ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/gif", "application/pdf"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/solicitudes/{solicitud_id}/documentos")
async def upload_documento_solicitud(
    solicitud_id: int,
    file: UploadFile = File(...),
    tipo_documento: str = Query(None, description="Tipo de documento: dni, comprobante, formulario, etc."),
    descripcion: str = Query(None, description="Descripción del documento"),
    etapa: str = Query("creacion", description="Etapa: creacion, proceso, resolucion"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sube un documento/imagen a una solicitud de trámite"""
    # Verificar tipo de archivo
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no permitido. Permitidos: {', '.join(ALLOWED_FILE_TYPES)}"
        )

    # Verificar tamaño
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="El archivo excede el tamaño máximo de 10MB")
    await file.seek(0)

    # Verificar que la solicitud existe
    result = await db.execute(
        select(Solicitud).where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Verificar permisos: el solicitante o personal municipal
    if current_user.rol == RolUsuario.VECINO:
        if solicitud.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso para subir documentos a esta solicitud")

    # Subir a Cloudinary
    try:
        # Determinar resource_type basado en el content_type
        resource_type = "image" if file.content_type.startswith("image/") else "raw"

        upload_result = cloudinary.uploader.upload(
            file.file,
            folder=f"solicitudes/{solicitud_id}",
            resource_type=resource_type
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir archivo: {str(e)}")

    # Determinar tipo
    tipo = "imagen" if file.content_type.startswith("image/") else "documento"

    documento = DocumentoSolicitud(
        solicitud_id=solicitud_id,
        usuario_id=current_user.id,
        nombre_original=file.filename,
        url=upload_result["secure_url"],
        public_id=upload_result["public_id"],
        tipo=tipo,
        mime_type=file.content_type,
        tamanio=upload_result.get("bytes"),
        tipo_documento=tipo_documento,
        descripcion=descripcion,
        etapa=etapa
    )
    db.add(documento)
    await db.commit()
    await db.refresh(documento)

    return {
        "message": "Archivo subido correctamente",
        "id": documento.id,
        "url": documento.url,
        "nombre": documento.nombre_original,
        "tipo": documento.tipo
    }


@router.get("/solicitudes/{solicitud_id}/documentos")
async def listar_documentos_solicitud(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos los documentos de una solicitud"""
    # Verificar que la solicitud existe
    result = await db.execute(
        select(Solicitud).where(Solicitud.id == solicitud_id)
    )
    solicitud = result.scalar_one_or_none()

    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    # Verificar permisos
    if current_user.rol == RolUsuario.VECINO:
        if solicitud.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso para ver los documentos de esta solicitud")

    # Obtener documentos
    result = await db.execute(
        select(DocumentoSolicitud)
        .where(DocumentoSolicitud.solicitud_id == solicitud_id)
        .order_by(DocumentoSolicitud.created_at.desc())
    )
    documentos = result.scalars().all()

    return [
        {
            "id": doc.id,
            "nombre_original": doc.nombre_original,
            "url": doc.url,
            "tipo": doc.tipo,
            "tipo_documento": doc.tipo_documento,
            "descripcion": doc.descripcion,
            "etapa": doc.etapa,
            "mime_type": doc.mime_type,
            "tamanio": doc.tamanio,
            "created_at": doc.created_at
        }
        for doc in documentos
    ]


@router.delete("/solicitudes/{solicitud_id}/documentos/{documento_id}")
async def eliminar_documento_solicitud(
    solicitud_id: int,
    documento_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un documento de una solicitud"""
    # Verificar que el documento existe y pertenece a la solicitud
    result = await db.execute(
        select(DocumentoSolicitud)
        .where(
            DocumentoSolicitud.id == documento_id,
            DocumentoSolicitud.solicitud_id == solicitud_id
        )
    )
    documento = result.scalar_one_or_none()

    if not documento:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    # Verificar permisos: solo el que subió el documento o admin/supervisor
    if current_user.rol == RolUsuario.VECINO:
        if documento.usuario_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso para eliminar este documento")

    # Eliminar de Cloudinary
    if documento.public_id:
        try:
            cloudinary.uploader.destroy(documento.public_id)
        except Exception as e:
            logger.error(f"Error eliminando de Cloudinary: {e}")

    # Eliminar de la base de datos
    await db.delete(documento)
    await db.commit()

    return {"message": "Documento eliminado correctamente"}


# ==================== CLASIFICACIÓN DE TRÁMITES CON IA ====================

from pydantic import BaseModel
from services import chat_service


class ClasificarTramiteRequest(BaseModel):
    texto: str
    municipio_id: int
    usar_ia: bool = True


# Palabras clave para clasificación local de trámites
TRAMITE_KEYWORDS = {
    'comercio': [
        'habilitacion', 'habilitación', 'comercial', 'comercio', 'local', 'negocio',
        'kiosco', 'almacen', 'almacén', 'restaurante', 'bar', 'panaderia', 'panadería',
        'carniceria', 'carnicería', 'verduleria', 'verdulería', 'farmacia', 'libreria',
        'librería', 'ferreteria', 'ferretería', 'peluqueria', 'peluquería', 'barberia',
        'barbería', 'gimnasio', 'supermercado', 'minimercado', 'despensa', 'rotiseria',
        'rotisería', 'heladeria', 'heladería', 'pizzeria', 'pizzería', 'cafeteria',
        'cafetería', 'pub', 'boliche', 'discoteca', 'salon', 'salón', 'eventos',
        'fiesta', 'emprendimiento', 'monotributo', 'autónomo', 'autonomo', 'vender',
        'venta', 'abrir', 'apertura', 'habilitar'
    ],
    'obras': [
        'obra', 'construccion', 'construcción', 'edificar', 'edificacion', 'edificación',
        'plano', 'planos', 'permiso', 'demoler', 'demolicion', 'demolición', 'refaccion',
        'refacción', 'ampliacion', 'ampliación', 'remodelar', 'remodelacion', 'remodelación',
        'albañil', 'albanil', 'arquitecto', 'ingeniero', 'pileta', 'piscina', 'techo',
        'medianera', 'cerco', 'vereda', 'garage', 'cochera', 'terraza', 'balcon',
        'balcón', 'losa', 'columna', 'viga', 'cimiento', 'final de obra', 'inicio de obra',
        'aprobacion', 'aprobación', 'visado', 'mensura', 'catastro'
    ],
    'vehiculos': [
        'vehiculo', 'vehículo', 'auto', 'automovil', 'automóvil', 'moto', 'motocicleta',
        'camion', 'camión', 'camioneta', 'utilitario', 'patente', 'licencia', 'conducir',
        'registro', 'carnet', 'libre deuda', 'multa', 'multas', 'infraccion', 'infracción',
        'estacionamiento', 'remis', 'taxi', 'uber', 'transfer', 'transporte', 'escolar',
        'traslado', 'grua', 'grúa', 'acarreo', 'secuestro', 'radar', 'fotomulta'
    ],
    'social': [
        'social', 'subsidio', 'ayuda', 'beneficio', 'pension', 'pensión', 'jubilacion',
        'jubilación', 'discapacidad', 'certificado', 'cud', 'vivienda', 'terreno',
        'lote', 'plan', 'procrear', 'anses', 'asignacion', 'asignación', 'tarjeta',
        'alimentar', 'bolson', 'bolsón', 'comedor', 'merendero', 'emergencia',
        'indigencia', 'pobreza', 'vulnerable', 'familia', 'niño', 'niña', 'anciano',
        'mayor', 'tercera edad', 'inclusion', 'inclusión'
    ],
    'salud': [
        'salud', 'hospital', 'clinica', 'clínica', 'medico', 'médico', 'turno',
        'vacuna', 'vacunacion', 'vacunación', 'sanitario', 'bromatologia', 'bromatología',
        'habilitacion sanitaria', 'libreta', 'manipulador', 'alimentos', 'carnet sanitario',
        'analisis', 'análisis', 'laboratorio', 'certificado medico', 'certificado médico',
        'defuncion', 'defunción', 'nacimiento', 'partida'
    ],
    'ambiente': [
        'ambiente', 'ambiental', 'arbol', 'árbol', 'poda', 'plantacion', 'plantación',
        'fumigacion', 'fumigación', 'plaga', 'dengue', 'descacharrado', 'residuo',
        'basura', 'reciclaje', 'reciclar', 'verde', 'espacio verde', 'plaza', 'parque',
        'contaminacion', 'contaminación', 'ruido', 'molestia', 'humo', 'quema'
    ],
    'tramites_generales': [
        'certificado', 'constancia', 'libre deuda', 'deuda', 'impuesto', 'tasa',
        'tributo', 'pago', 'factura', 'boleta', 'mora', 'plan de pago', 'moratoria',
        'exencion', 'exención', 'reduccion', 'reducción', 'bonificacion', 'bonificación',
        'domicilio', 'residencia', 'domiciliario', 'avaluo', 'avalúo', 'valuacion',
        'valuación', 'escribano', 'escribania', 'escribanía', 'notarial'
    ],
    'eventos': [
        'evento', 'eventos', 'espectaculo', 'espectáculo', 'recital', 'show', 'concierto',
        'feria', 'exposicion', 'exposición', 'muestra', 'festival', 'fiesta', 'cumpleaños',
        'casamiento', 'boda', 'quince', '15', 'salon', 'salón', 'club', 'cancha',
        'predio', 'permiso evento', 'autorizacion', 'autorización', 'via publica',
        'vía pública', 'corte', 'calle', 'marcha', 'manifestacion', 'manifestación'
    ],
    'empleo': [
        'empleo', 'trabajo', 'trabajar', 'cv', 'curriculum', 'currículum', 'bolsa',
        'postulacion', 'postulación', 'vacante', 'puesto', 'oferta', 'laboral',
        'capacitacion', 'capacitación', 'curso', 'taller', 'formacion', 'formación',
        'oficio', 'pasantia', 'pasantía', 'practica', 'práctica'
    ]
}


def normalize_text_tramite(text: str) -> str:
    """Normaliza texto para comparación"""
    import unicodedata
    text = text.lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return text


def clasificar_tramite_local(texto: str, tramites: list) -> list:
    """Clasificación local de trámites usando palabras clave"""
    if not texto or len(texto) < 3:
        return []

    normalized_text = normalize_text_tramite(texto)
    scores = []

    for tramite in tramites:
        tramite_name = normalize_text_tramite(tramite['nombre'])
        tramite_desc = normalize_text_tramite(tramite.get('descripcion', '') or '')
        score = 0

        # Buscar coincidencias con palabras clave
        for category, keywords in TRAMITE_KEYWORDS.items():
            # Verificar si esta categoría aplica al trámite
            category_match = False
            for keyword in keywords[:10]:  # Top keywords de la categoría
                if keyword in tramite_name or keyword in tramite_desc:
                    category_match = True
                    break

            if category_match:
                for keyword in keywords:
                    normalized_keyword = normalize_text_tramite(keyword)
                    if normalized_keyword in normalized_text:
                        score += 1 + (len(keyword) // 4)

        # Bonus si palabras del nombre del trámite están en el texto
        tramite_words = tramite_name.split()
        for word in tramite_words:
            if len(word) > 3 and word in normalized_text:
                score += 5

        # Bonus si palabras de la descripción están en el texto
        desc_words = tramite_desc.split()
        for word in desc_words:
            if len(word) > 4 and word in normalized_text:
                score += 2

        if score > 0:
            scores.append({
                'tramite_id': tramite['id'],
                'tramite_nombre': tramite['nombre'],
                'tipo_tramite_id': tramite.get('tipo_tramite_id'),
                'tipo_tramite_nombre': tramite.get('tipo_tramite_nombre', ''),
                'score': score,
                'confianza': min(score * 5, 100),
                'metodo': 'local'
            })

    # Ordenar por score y retornar top 5
    scores.sort(key=lambda x: x['score'], reverse=True)
    return scores[:5]


async def clasificar_tramite_con_ia(texto: str, tramites: list) -> Optional[list]:
    """Clasificación de trámites usando IA"""
    if not chat_service.is_available():
        return None

    # Construir lista de trámites para el prompt
    tramites_list = "\n".join([
        f"- ID {t['id']}: {t['nombre']} (Categoría: {t.get('tipo_tramite_nombre', 'General')})"
        for t in tramites[:50]  # Limitar para no exceder tokens
    ])

    prompt = f"""Eres un asistente municipal que clasifica solicitudes de trámites.

TEXTO DEL USUARIO:
"{texto}"

TRÁMITES DISPONIBLES:
{tramites_list}

Analiza qué trámite necesita el usuario y devuelve los 3 más probables en formato JSON.
Responde SOLO con un JSON válido:
[
  {{"tramite_id": <id>, "tramite_nombre": "<nombre>", "confianza": <0-100>}},
  {{"tramite_id": <id>, "tramite_nombre": "<nombre>", "confianza": <0-100>}},
  {{"tramite_id": <id>, "tramite_nombre": "<nombre>", "confianza": <0-100>}}
]

Si no hay trámites relevantes, devuelve: []"""

    try:
        response = await chat_service.chat(prompt, max_tokens=500)
        if response:
            import re
            import json
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                result = json.loads(json_match.group())
                for item in result:
                    item['metodo'] = 'ia'
                    item['score'] = item.get('confianza', 50)
                return result
    except Exception as e:
        logger.error(f"Error en clasificación IA de trámites: {e}")

    return None


@router.post("/clasificar")
async def clasificar_tramite_endpoint(
    data: ClasificarTramiteRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Clasifica un texto para sugerir trámites relevantes.
    Usa IA si está disponible, sino clasificación local por palabras clave.
    """
    # Obtener trámites del municipio
    query = (
        select(Tramite, TipoTramite.nombre.label('tipo_nombre'))
        .join(TipoTramite, Tramite.tipo_tramite_id == TipoTramite.id)
        .where(
            TipoTramite.municipio_id == data.municipio_id,
            Tramite.activo == True
        )
    )
    result = await db.execute(query)
    rows = result.all()

    tramites = [
        {
            'id': row.Tramite.id,
            'nombre': row.Tramite.nombre,
            'descripcion': row.Tramite.descripcion,
            'tipo_tramite_id': row.Tramite.tipo_tramite_id,
            'tipo_tramite_nombre': row.tipo_nombre
        }
        for row in rows
    ]

    if not tramites:
        return {
            'sugerencias': [],
            'metodo_principal': 'none',
            'mensaje': 'No hay trámites configurados para este municipio'
        }

    # Clasificación local como backup
    local_results = clasificar_tramite_local(data.texto, tramites)

    # Intentar IA si está habilitado
    ia_results = None
    if data.usar_ia:
        ia_results = await clasificar_tramite_con_ia(data.texto, tramites)

    if ia_results:
        # Enriquecer resultados de IA con info del tipo
        for item in ia_results:
            tramite = next((t for t in tramites if t['id'] == item.get('tramite_id')), None)
            if tramite:
                item['tipo_tramite_id'] = tramite['tipo_tramite_id']
                item['tipo_tramite_nombre'] = tramite['tipo_tramite_nombre']

        return {
            'sugerencias': ia_results,
            'metodo_principal': 'ia',
            'local_backup': local_results
        }

    return {
        'sugerencias': local_results,
        'metodo_principal': 'local',
        'ia_disponible': chat_service.is_available()
    }
