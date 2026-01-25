from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
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
from models.tramite import TipoTramite, Tramite, Solicitud, HistorialSolicitud, EstadoSolicitud, MunicipioTipoTramite, MunicipioTramite
from models.user import User
from models.enums import RolUsuario
from models.notificacion import Notificacion
from schemas.tramite import (
    TipoTramiteCreate, TipoTramiteUpdate, TipoTramiteResponse, TipoTramiteConTramites,
    TramiteCreate, TramiteUpdate, TramiteResponse,
    SolicitudCreate, SolicitudUpdate, SolicitudResponse, SolicitudGestionResponse, SolicitudAsignar,
    HistorialSolicitudResponse,
    MunicipioTipoTramiteCreate, MunicipioTipoTramiteResponse,
    MunicipioTramiteCreate, MunicipioTramiteResponse,
    CheckDuplicadosRequest, CheckDuplicadosResponse, DuplicadoSugerido
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
    """Lista todos los tipos de trámites habilitados para un municipio (vía tabla intermedia)"""
    # Obtener tipos habilitados para este municipio
    query = (
        select(TipoTramite)
        .join(MunicipioTipoTramite, TipoTramite.id == MunicipioTipoTramite.tipo_tramite_id)
        .where(MunicipioTipoTramite.municipio_id == municipio_id)
    )

    if solo_activos:
        query = query.where(
            and_(TipoTramite.activo == True, MunicipioTipoTramite.activo == True)
        )

    query = query.order_by(MunicipioTipoTramite.orden, TipoTramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/tipos/catalogo", response_model=List[TipoTramiteResponse])
async def listar_tipos_tramite_catalogo(
    solo_activos: bool = Query(True, description="Solo tipos activos"),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los tipos de trámites del catálogo genérico (para admins)"""
    query = select(TipoTramite)

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


@router.post("/tipos/check-duplicados", response_model=CheckDuplicadosResponse)
async def check_duplicados_tipo_tramite(
    data: CheckDuplicadosRequest,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Verifica si existe un tipo de trámite similar usando IA y coincidencia de texto"""
    duplicados = await buscar_duplicados_tipo_tramite(db, data.nombre, data.descripcion)

    return CheckDuplicadosResponse(
        hay_duplicados=len(duplicados) > 0,
        duplicados=duplicados,
        mensaje="Se encontraron tipos de trámite similares" if duplicados else None
    )


@router.post("/tipos", response_model=TipoTramiteResponse)
async def crear_tipo_tramite(
    tipo_data: TipoTramiteCreate,
    municipio_id: Optional[int] = Query(None, description="ID del municipio (opcional para superadmin)"),
    forzar_creacion: bool = Query(False, description="Crear aunque existan duplicados"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """
    Crea un nuevo tipo de trámite en el catálogo genérico.

    - Si ya existe un tipo con nombre similar, sugiere usar el existente
    - Si forzar_creacion=True, crea de todos modos
    - Si se pasa municipio_id, también crea la asociación en municipio_tipos_tramites
    - Superadmin (sin municipio_id): solo crea en el catálogo global
    """
    # Verificar duplicados
    if not forzar_creacion:
        duplicados = await buscar_duplicados_tipo_tramite(db, tipo_data.nombre, tipo_data.descripcion)
        if duplicados:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Se encontraron tipos de trámite similares. Use forzar_creacion=true para crear de todos modos.",
                    "duplicados": [d.model_dump() for d in duplicados]
                }
            )

    # Crear el tipo en el catálogo genérico
    tipo = TipoTramite(**tipo_data.model_dump())
    db.add(tipo)
    await db.commit()
    await db.refresh(tipo)

    # Si se pasa municipio_id, crear asociación con el municipio
    if municipio_id:
        municipio_tipo = MunicipioTipoTramite(
            municipio_id=municipio_id,
            tipo_tramite_id=tipo.id,
            activo=True,
            orden=tipo_data.orden
        )
        db.add(municipio_tipo)
        await db.commit()
        logger.info(f"Tipo de trámite '{tipo.nombre}' creado y habilitado para municipio {municipio_id}")
    else:
        logger.info(f"Tipo de trámite '{tipo.nombre}' creado en catálogo global (superadmin)")

    return tipo


@router.post("/tipos/{tipo_id}/habilitar")
async def habilitar_tipo_tramite_municipio(
    tipo_id: int,
    municipio_id: int = Query(..., description="ID del municipio"),
    orden: int = Query(0, description="Orden de visualización"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Habilita un tipo de trámite existente del catálogo para un municipio"""
    # Verificar que el tipo existe
    result = await db.execute(select(TipoTramite).where(TipoTramite.id == tipo_id))
    tipo = result.scalar_one_or_none()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de trámite no encontrado")

    # Verificar si ya está habilitado
    result = await db.execute(
        select(MunicipioTipoTramite).where(
            and_(
                MunicipioTipoTramite.municipio_id == municipio_id,
                MunicipioTipoTramite.tipo_tramite_id == tipo_id
            )
        )
    )
    existente = result.scalar_one_or_none()

    if existente:
        # Reactivar si estaba deshabilitado
        existente.activo = True
        existente.orden = orden
        await db.commit()
        return {"message": "Tipo de trámite reactivado para el municipio", "id": existente.id}

    # Crear nueva asociación
    municipio_tipo = MunicipioTipoTramite(
        municipio_id=municipio_id,
        tipo_tramite_id=tipo_id,
        activo=True,
        orden=orden
    )
    db.add(municipio_tipo)
    await db.commit()
    await db.refresh(municipio_tipo)

    return {"message": "Tipo de trámite habilitado para el municipio", "id": municipio_tipo.id}


@router.post("/tipos/habilitar-todos")
async def habilitar_todos_tipos_tramite_municipio(
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Habilita TODOS los tipos de trámite del catálogo para un municipio"""
    # Obtener todos los tipos activos del catálogo
    result = await db.execute(select(TipoTramite).where(TipoTramite.activo == True))
    todos_tipos = result.scalars().all()

    habilitados = 0
    reactivados = 0

    for tipo in todos_tipos:
        # Verificar si ya existe la asociación
        result = await db.execute(
            select(MunicipioTipoTramite).where(
                and_(
                    MunicipioTipoTramite.municipio_id == municipio_id,
                    MunicipioTipoTramite.tipo_tramite_id == tipo.id
                )
            )
        )
        existente = result.scalar_one_or_none()

        if existente:
            if not existente.activo:
                existente.activo = True
                reactivados += 1
        else:
            # Crear nueva asociación
            municipio_tipo = MunicipioTipoTramite(
                municipio_id=municipio_id,
                tipo_tramite_id=tipo.id,
                activo=True,
                orden=tipo.orden
            )
            db.add(municipio_tipo)
            habilitados += 1

    await db.commit()

    return {
        "message": f"Tipos de trámite configurados para municipio {municipio_id}",
        "habilitados": habilitados,
        "reactivados": reactivados,
        "total_tipos": len(todos_tipos)
    }


@router.post("/tramites/habilitar-todos")
async def habilitar_todos_tramites_municipio(
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Habilita TODOS los trámites (subtramites) del catálogo para un municipio"""
    # Obtener todos los trámites activos del catálogo
    result = await db.execute(select(Tramite).where(Tramite.activo == True))
    todos_tramites = result.scalars().all()

    habilitados = 0
    reactivados = 0

    for tramite in todos_tramites:
        # Verificar si ya existe la asociación
        result = await db.execute(
            select(MunicipioTramite).where(
                and_(
                    MunicipioTramite.municipio_id == municipio_id,
                    MunicipioTramite.tramite_id == tramite.id
                )
            )
        )
        existente = result.scalar_one_or_none()

        if existente:
            if not existente.activo:
                existente.activo = True
                reactivados += 1
        else:
            # Crear nueva asociación
            municipio_tramite = MunicipioTramite(
                municipio_id=municipio_id,
                tramite_id=tramite.id,
                activo=True,
                orden=tramite.orden
            )
            db.add(municipio_tramite)
            habilitados += 1

    await db.commit()

    return {
        "message": f"Trámites configurados para municipio {municipio_id}",
        "habilitados": habilitados,
        "reactivados": reactivados,
        "total_tramites": len(todos_tramites)
    }


@router.delete("/tipos/{tipo_id}/deshabilitar")
async def deshabilitar_tipo_tramite_municipio(
    tipo_id: int,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Deshabilita un tipo de trámite para un municipio (no lo elimina del catálogo)"""
    result = await db.execute(
        select(MunicipioTipoTramite).where(
            and_(
                MunicipioTipoTramite.municipio_id == municipio_id,
                MunicipioTipoTramite.tipo_tramite_id == tipo_id
            )
        )
    )
    asociacion = result.scalar_one_or_none()

    if not asociacion:
        raise HTTPException(status_code=404, detail="El tipo de trámite no está habilitado para este municipio")

    asociacion.activo = False
    await db.commit()

    return {"message": "Tipo de trámite deshabilitado para el municipio"}


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
        select(Tramite)
        .options(selectinload(Tramite.tipo_tramite))
        .where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    return tramite


@router.post("/catalogo/check-duplicados", response_model=CheckDuplicadosResponse)
async def check_duplicados_tramite(
    data: CheckDuplicadosRequest,
    tipo_tramite_id: Optional[int] = Query(None, description="ID del tipo para buscar duplicados en el mismo tipo"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Verifica si existe un trámite similar usando IA y coincidencia de texto"""
    duplicados = await buscar_duplicados_tramite(db, data.nombre, data.descripcion, tipo_tramite_id)

    return CheckDuplicadosResponse(
        hay_duplicados=len(duplicados) > 0,
        duplicados=duplicados,
        mensaje="Se encontraron trámites similares" if duplicados else None
    )


@router.post("/catalogo", response_model=TramiteResponse)
async def crear_tramite_catalogo(
    tramite_data: TramiteCreate,
    municipio_id: Optional[int] = Query(None, description="ID del municipio (opcional para superadmin)"),
    forzar_creacion: bool = Query(False, description="Crear aunque existan duplicados"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """
    Crea un nuevo trámite en el catálogo genérico.

    - Si ya existe un trámite con nombre similar, sugiere usar el existente
    - Si forzar_creacion=True, crea de todos modos
    - Si se pasa municipio_id, también crea la asociación en municipio_tramites
    - Superadmin (sin municipio_id): solo crea en el catálogo global
    """
    # Verificar que el tipo existe
    result = await db.execute(
        select(TipoTramite).where(TipoTramite.id == tramite_data.tipo_tramite_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Tipo de trámite no encontrado")

    # Verificar duplicados
    if not forzar_creacion:
        duplicados = await buscar_duplicados_tramite(
            db, tramite_data.nombre, tramite_data.descripcion, tramite_data.tipo_tramite_id
        )
        if duplicados:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Se encontraron trámites similares. Use forzar_creacion=true para crear de todos modos.",
                    "duplicados": [d.model_dump() for d in duplicados]
                }
            )

    # Crear el trámite en el catálogo genérico
    tramite = Tramite(**tramite_data.model_dump())
    db.add(tramite)
    await db.commit()
    await db.refresh(tramite)

    # Si se pasa municipio_id, crear asociación con el municipio
    if municipio_id:
        municipio_tramite = MunicipioTramite(
            municipio_id=municipio_id,
            tramite_id=tramite.id,
            activo=True,
            orden=tramite_data.orden,
            tiempo_estimado_dias=tramite_data.tiempo_estimado_dias,
            costo=tramite_data.costo,
            requisitos=tramite_data.requisitos,
            documentos_requeridos=tramite_data.documentos_requeridos
        )
        db.add(municipio_tramite)
        await db.commit()
        logger.info(f"Trámite '{tramite.nombre}' creado y habilitado para municipio {municipio_id}")
    else:
        logger.info(f"Trámite '{tramite.nombre}' creado en catálogo global (superadmin)")

    return tramite


@router.post("/catalogo/{tramite_id}/habilitar")
async def habilitar_tramite_municipio(
    tramite_id: int,
    municipio_id: int = Query(..., description="ID del municipio"),
    data: Optional[MunicipioTramiteCreate] = None,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Habilita un trámite existente del catálogo para un municipio con personalizaciones opcionales"""
    # Verificar que el trámite existe
    result = await db.execute(select(Tramite).where(Tramite.id == tramite_id))
    tramite = result.scalar_one_or_none()
    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    # Verificar si ya está habilitado
    result = await db.execute(
        select(MunicipioTramite).where(
            and_(
                MunicipioTramite.municipio_id == municipio_id,
                MunicipioTramite.tramite_id == tramite_id
            )
        )
    )
    existente = result.scalar_one_or_none()

    if existente:
        # Reactivar y actualizar si estaba deshabilitado
        existente.activo = True
        if data:
            for field, value in data.model_dump(exclude_unset=True, exclude={'tramite_id'}).items():
                setattr(existente, field, value)
        await db.commit()
        return {"message": "Trámite reactivado para el municipio", "id": existente.id}

    # Crear nueva asociación
    municipio_tramite = MunicipioTramite(
        municipio_id=municipio_id,
        tramite_id=tramite_id,
        activo=True,
        **(data.model_dump(exclude={'tramite_id'}) if data else {})
    )
    db.add(municipio_tramite)
    await db.commit()
    await db.refresh(municipio_tramite)

    return {"message": "Trámite habilitado para el municipio", "id": municipio_tramite.id}


@router.delete("/catalogo/{tramite_id}/deshabilitar")
async def deshabilitar_tramite_municipio(
    tramite_id: int,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Deshabilita un trámite para un municipio (no lo elimina del catálogo)"""
    result = await db.execute(
        select(MunicipioTramite).where(
            and_(
                MunicipioTramite.municipio_id == municipio_id,
                MunicipioTramite.tramite_id == tramite_id
            )
        )
    )
    asociacion = result.scalar_one_or_none()

    if not asociacion:
        raise HTTPException(status_code=404, detail="El trámite no está habilitado para este municipio")

    asociacion.activo = False
    await db.commit()

    return {"message": "Trámite deshabilitado para el municipio"}


@router.get("/municipio/{municipio_id}/tramites", response_model=List[TramiteResponse])
async def listar_tramites_municipio(
    municipio_id: int,
    tipo_tramite_id: Optional[int] = Query(None, description="Filtrar por tipo de trámite"),
    solo_activos: bool = Query(True, description="Solo trámites activos"),
    db: AsyncSession = Depends(get_db)
):
    """Lista los trámites habilitados para un municipio específico"""
    query = (
        select(Tramite)
        .join(MunicipioTramite, Tramite.id == MunicipioTramite.tramite_id)
        .options(selectinload(Tramite.tipo_tramite))
        .where(MunicipioTramite.municipio_id == municipio_id)
    )

    if tipo_tramite_id:
        query = query.where(Tramite.tipo_tramite_id == tipo_tramite_id)

    if solo_activos:
        query = query.where(
            and_(Tramite.activo == True, MunicipioTramite.activo == True)
        )

    query = query.order_by(MunicipioTramite.orden, Tramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/municipio/habilitados")
async def get_tramites_municipio_habilitados(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtener IDs de trámites habilitados para el municipio actual.
    Usa el header X-Municipio-ID o el municipio del usuario.
    """
    # Obtener municipio_id efectivo
    municipio_id = current_user.municipio_id
    if current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        header_id = request.headers.get('X-Municipio-ID')
        if header_id:
            try:
                municipio_id = int(header_id)
            except (ValueError, TypeError):
                pass

    if not municipio_id:
        return []

    result = await db.execute(
        select(MunicipioTramite.tramite_id)
        .where(MunicipioTramite.municipio_id == municipio_id)
        .where(MunicipioTramite.activo == True)
    )
    return [row[0] for row in result.fetchall()]


@router.put("/catalogo/{tramite_id}", response_model=TramiteResponse)
async def actualizar_tramite_catalogo(
    tramite_id: int,
    tramite_data: TramiteUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un trámite del catálogo"""
    result = await db.execute(
        select(Tramite)
        .options(selectinload(Tramite.tipo_tramite))
        .where(Tramite.id == tramite_id)
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

    # Verificar empleado (debe ser administrativo para trámites)
    result = await db.execute(
        select(Empleado).where(
            and_(
                Empleado.id == asignacion.empleado_id,
                Empleado.municipio_id == solicitud.municipio_id,
                Empleado.activo == True,
                Empleado.tipo == "administrativo"  # Solo administrativos para trámites
            )
        )
    )
    empleado = result.scalar_one_or_none()

    if not empleado:
        # Verificar si existe pero es del tipo incorrecto
        result_check = await db.execute(
            select(Empleado).where(Empleado.id == asignacion.empleado_id)
        )
        emp_check = result_check.scalar_one_or_none()
        if emp_check and emp_check.tipo != "administrativo":
            raise HTTPException(
                status_code=400,
                detail=f"El empleado {emp_check.nombre} es de tipo '{emp_check.tipo}'. Los trámites solo pueden ser asignados a empleados administrativos."
            )
        raise HTTPException(status_code=404, detail="Empleado no encontrado o no disponible")

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

    # TODO: Empleado filtro por dependencia cuando se implemente IA
    # if current_user.rol == RolUsuario.EMPLEADO:
    #     query = query.where(Solicitud.municipio_dependencia_id == current_user.dependencia_id)

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

    # TODO: Empleado filtro por dependencia cuando se implemente IA
    # if current_user.rol == RolUsuario.EMPLEADO:
    #     query = query.where(Solicitud.municipio_dependencia_id == current_user.dependencia_id)

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

    # TODO: Filtro por dependencia cuando se implemente IA
    # if empleado_id:
    #     query = query.where(Solicitud.municipio_dependencia_id == empleado_id)

    if sin_asignar:
        query = query.where(Solicitud.municipio_dependencia_id == None)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Solicitud.numero_tramite.ilike(search_term)) |
            (Solicitud.asunto.ilike(search_term)) |
            (Solicitud.nombre_solicitante.ilike(search_term)) |
            (Solicitud.apellido_solicitante.ilike(search_term)) |
            (Solicitud.dni_solicitante.ilike(search_term))
        )

    # TODO: Empleado filtro por dependencia cuando se implemente IA
    # if current_user.rol == RolUsuario.EMPLEADO:
    #     query = query.where(Solicitud.municipio_dependencia_id == current_user.dependencia_id)

    # Optimización: solo cargar relaciones necesarias para la lista
    query = query.options(
        selectinload(Solicitud.tramite).selectinload(Tramite.tipo_tramite),
        selectinload(Solicitud.dependencia_asignada)
        # No cargar solicitante completo, ya tenemos nombre_solicitante, apellido_solicitante, etc.
    )
    query = query.order_by(Solicitud.created_at.desc(), Solicitud.prioridad)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    solicitudes = result.scalars().all()
    return solicitudes


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
    # Obtener trámites habilitados para el municipio (vía tabla intermedia)
    query = (
        select(Tramite, TipoTramite.nombre.label('tipo_nombre'))
        .join(TipoTramite, Tramite.tipo_tramite_id == TipoTramite.id)
        .join(MunicipioTramite, Tramite.id == MunicipioTramite.tramite_id)
        .where(
            and_(
                MunicipioTramite.municipio_id == data.municipio_id,
                MunicipioTramite.activo == True,
                Tramite.activo == True
            )
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


# ==================== FUNCIONES DE DETECCIÓN DE DUPLICADOS ====================

def calcular_similitud_texto(texto1: str, texto2: str) -> float:
    """Calcula similitud entre dos textos usando coeficiente de Jaccard"""
    if not texto1 or not texto2:
        return 0.0

    # Normalizar
    t1 = normalize_text_tramite(texto1).lower()
    t2 = normalize_text_tramite(texto2).lower()

    # Tokenizar
    palabras1 = set(t1.split())
    palabras2 = set(t2.split())

    # Filtrar palabras muy cortas
    palabras1 = {p for p in palabras1 if len(p) > 2}
    palabras2 = {p for p in palabras2 if len(p) > 2}

    if not palabras1 or not palabras2:
        return 0.0

    # Jaccard
    interseccion = palabras1 & palabras2
    union = palabras1 | palabras2

    return (len(interseccion) / len(union)) * 100 if union else 0.0


async def buscar_duplicados_tipo_tramite(
    db: AsyncSession,
    nombre: str,
    descripcion: Optional[str] = None
) -> List[DuplicadoSugerido]:
    """Busca tipos de trámite similares en el catálogo genérico"""
    duplicados = []

    # Obtener todos los tipos existentes
    result = await db.execute(select(TipoTramite))
    tipos_existentes = result.scalars().all()

    for tipo in tipos_existentes:
        # Similitud por nombre
        similitud_nombre = calcular_similitud_texto(nombre, tipo.nombre)

        # Similitud por descripción (si existe)
        similitud_desc = 0.0
        if descripcion and tipo.descripcion:
            similitud_desc = calcular_similitud_texto(descripcion, tipo.descripcion)

        # Combinar (nombre tiene más peso)
        similitud_total = (similitud_nombre * 0.7) + (similitud_desc * 0.3)

        # Umbral de similitud: 50%
        if similitud_total >= 50:
            duplicados.append(DuplicadoSugerido(
                id=tipo.id,
                nombre=tipo.nombre,
                descripcion=tipo.descripcion,
                similitud=round(similitud_total, 1)
            ))

    # Intentar con IA si está disponible y hay poca coincidencia textual
    if not duplicados and chat_service.is_available():
        ia_duplicados = await buscar_duplicados_con_ia(
            db, nombre, descripcion, "tipo_tramite"
        )
        duplicados.extend(ia_duplicados)

    # Ordenar por similitud descendente
    duplicados.sort(key=lambda x: x.similitud, reverse=True)
    return duplicados[:5]


async def buscar_duplicados_tramite(
    db: AsyncSession,
    nombre: str,
    descripcion: Optional[str] = None,
    tipo_tramite_id: Optional[int] = None
) -> List[DuplicadoSugerido]:
    """Busca trámites similares en el catálogo genérico"""
    duplicados = []

    # Obtener todos los trámites existentes
    query = select(Tramite)
    if tipo_tramite_id:
        # Buscar primero en el mismo tipo
        query = query.where(Tramite.tipo_tramite_id == tipo_tramite_id)

    result = await db.execute(query)
    tramites_existentes = result.scalars().all()

    for tramite in tramites_existentes:
        # Similitud por nombre
        similitud_nombre = calcular_similitud_texto(nombre, tramite.nombre)

        # Similitud por descripción
        similitud_desc = 0.0
        if descripcion and tramite.descripcion:
            similitud_desc = calcular_similitud_texto(descripcion, tramite.descripcion)

        # Combinar
        similitud_total = (similitud_nombre * 0.7) + (similitud_desc * 0.3)

        if similitud_total >= 50:
            duplicados.append(DuplicadoSugerido(
                id=tramite.id,
                nombre=tramite.nombre,
                descripcion=tramite.descripcion,
                similitud=round(similitud_total, 1)
            ))

    # Si no hay coincidencia textual, intentar IA
    if not duplicados and chat_service.is_available():
        ia_duplicados = await buscar_duplicados_con_ia(
            db, nombre, descripcion, "tramite"
        )
        duplicados.extend(ia_duplicados)

    duplicados.sort(key=lambda x: x.similitud, reverse=True)
    return duplicados[:5]


async def buscar_duplicados_con_ia(
    db: AsyncSession,
    nombre: str,
    descripcion: Optional[str],
    tipo: str  # "tipo_tramite" o "tramite"
) -> List[DuplicadoSugerido]:
    """Usa IA para encontrar duplicados semánticos"""
    try:
        # Obtener elementos existentes
        if tipo == "tipo_tramite":
            result = await db.execute(select(TipoTramite).limit(100))
            items = result.scalars().all()
            items_list = "\n".join([
                f"- ID {t.id}: {t.nombre} - {t.descripcion or 'Sin descripción'}"
                for t in items
            ])
        else:
            result = await db.execute(select(Tramite).limit(100))
            items = result.scalars().all()
            items_list = "\n".join([
                f"- ID {t.id}: {t.nombre} - {t.descripcion or 'Sin descripción'}"
                for t in items
            ])

        prompt = f"""Eres un asistente que detecta trámites duplicados o muy similares.

NUEVO TRÁMITE A CREAR:
Nombre: "{nombre}"
Descripción: "{descripcion or 'Sin descripción'}"

TRÁMITES EXISTENTES:
{items_list}

Analiza si el nuevo trámite es similar o duplicado de alguno existente.
Considera sinónimos, variaciones de nombre y significados equivalentes.

Responde SOLO con un JSON válido:
[
  {{"id": <id>, "nombre": "<nombre>", "similitud": <0-100>}},
  ...
]

Si no hay similares, devuelve: []
Solo incluye los que tengan similitud >= 60%."""

        response = await chat_service.chat(prompt, max_tokens=500)
        if response:
            import re
            import json
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                result_data = json.loads(json_match.group())
                duplicados = []
                for item in result_data:
                    if item.get('similitud', 0) >= 60:
                        # Obtener descripción del item
                        if tipo == "tipo_tramite":
                            db_result = await db.execute(
                                select(TipoTramite).where(TipoTramite.id == item['id'])
                            )
                            obj = db_result.scalar_one_or_none()
                        else:
                            db_result = await db.execute(
                                select(Tramite).where(Tramite.id == item['id'])
                            )
                            obj = db_result.scalar_one_or_none()

                        if obj:
                            duplicados.append(DuplicadoSugerido(
                                id=obj.id,
                                nombre=obj.nombre,
                                descripcion=obj.descripcion,
                                similitud=item.get('similitud', 60)
                            ))
                return duplicados
    except Exception as e:
        logger.error(f"Error buscando duplicados con IA: {e}")

    return []


# ==================== HABILITAR TODOS PARA MUNICIPIO ====================

@router.post("/tipos/habilitar-todos")
async def habilitar_todos_tipos_tramite_municipio(
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """
    Habilita TODOS los tipos de trámite del catálogo para un municipio.
    Crea entradas en municipio_tipo_tramite para cada tipo activo.
    """
    # Obtener todos los tipos de trámite activos del catálogo
    result = await db.execute(
        select(TipoTramite).where(TipoTramite.activo == True)
    )
    tipos = result.scalars().all()

    if not tipos:
        return {"message": "No hay tipos de trámite en el catálogo", "creados": 0}

    creados = 0
    ya_existentes = 0

    for tipo in tipos:
        # Verificar si ya existe la asociación
        existe = await db.execute(
            select(MunicipioTipoTramite)
            .where(
                MunicipioTipoTramite.municipio_id == municipio_id,
                MunicipioTipoTramite.tipo_tramite_id == tipo.id
            )
        )
        if existe.scalar_one_or_none():
            ya_existentes += 1
            continue

        # Crear la asociación
        asociacion = MunicipioTipoTramite(
            municipio_id=municipio_id,
            tipo_tramite_id=tipo.id,
            activo=True,
            orden=tipo.orden or 0
        )
        db.add(asociacion)
        creados += 1

    await db.commit()

    return {
        "message": f"Tipos de trámite habilitados para municipio {municipio_id}",
        "creados": creados,
        "ya_existentes": ya_existentes,
        "total_catalogo": len(tipos)
    }


@router.post("/tramites/habilitar-todos")
async def habilitar_todos_tramites_municipio(
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """
    Habilita TODOS los trámites (subtramites/nivel 2) del catálogo para un municipio.
    Crea entradas en municipio_tramite para cada trámite activo.
    Nota: Los trámites son el segundo nivel, debajo de los tipos de trámite.
    """
    # Obtener todos los trámites activos del catálogo
    result = await db.execute(
        select(Tramite).where(Tramite.activo == True)
    )
    tramites = result.scalars().all()

    if not tramites:
        return {"message": "No hay trámites en el catálogo", "creados": 0}

    creados = 0
    ya_existentes = 0

    for tramite in tramites:
        # Verificar si ya existe la asociación
        existe = await db.execute(
            select(MunicipioTramite)
            .where(
                MunicipioTramite.municipio_id == municipio_id,
                MunicipioTramite.tramite_id == tramite.id
            )
        )
        if existe.scalar_one_or_none():
            ya_existentes += 1
            continue

        # Crear la asociación
        asociacion = MunicipioTramite(
            municipio_id=municipio_id,
            tramite_id=tramite.id,
            activo=True
        )
        db.add(asociacion)
        creados += 1

    await db.commit()

    return {
        "message": f"Trámites habilitados para municipio {municipio_id}",
        "creados": creados,
        "ya_existentes": ya_existentes,
        "total_catalogo": len(tramites)
    }
