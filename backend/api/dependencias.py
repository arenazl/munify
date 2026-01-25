"""
API para gestión de Dependencias (nuevo modelo desacoplado).

Endpoints:
- /dependencias - CRUD del catálogo global de dependencias (solo superadmin)
- /municipio-dependencias - Dependencias habilitadas por municipio
- /municipio-dependencias/{id}/categorias - Asignación de categorías
- /municipio-dependencias/{id}/tipos-tramite - Asignación de tipos de trámite
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
import logging

from core.database import get_db
from core.security import get_current_user
from models import (
    User,
    Dependencia,
    MunicipioDependencia,
    MunicipioDependenciaCategoria,
    MunicipioDependenciaTipoTramite,
    MunicipioDependenciaTramite,
    Categoria,
    TipoTramite,
    Tramite,
)
from schemas.dependencia import (
    DependenciaCreate,
    DependenciaUpdate,
    DependenciaResponse,
    MunicipioDependenciaCreate,
    MunicipioDependenciaUpdate,
    MunicipioDependenciaResponse,
    MunicipioDependenciaListResponse,
    AsignarCategoriasRequest,
    AsignarTiposTramiteRequest,
    AsignarTramitesRequest,
    HabilitarDependenciasRequest,
)

router = APIRouter(prefix="/dependencias", tags=["Dependencias"])
logger = logging.getLogger(__name__)


# ============ CATÁLOGO GLOBAL DE DEPENDENCIAS ============

@router.get("/catalogo", response_model=List[DependenciaResponse])
async def listar_catalogo_dependencias(
    activo: Optional[bool] = None,
    tipo_gestion: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista el catálogo global de dependencias.
    Accesible para admin/supervisor para ver qué dependencias pueden habilitar.
    """
    query = select(Dependencia).order_by(Dependencia.orden, Dependencia.nombre)

    if activo is not None:
        query = query.where(Dependencia.activo == activo)

    if tipo_gestion:
        query = query.where(Dependencia.tipo_gestion == tipo_gestion.upper())

    result = await db.execute(query)
    dependencias = result.scalars().all()
    return dependencias


@router.post("/catalogo", response_model=DependenciaResponse, status_code=status.HTTP_201_CREATED)
async def crear_dependencia_catalogo(
    data: DependenciaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Crea una nueva dependencia en el catálogo global.
    Solo superadmin puede crear dependencias en el catálogo.
    """
    # TODO: Verificar que sea superadmin
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para crear dependencias")

    # Verificar que no exista una con el mismo nombre
    existing = await db.execute(
        select(Dependencia).where(Dependencia.nombre == data.nombre)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una dependencia con ese nombre")

    # Generar código si no se proporcionó
    codigo = data.codigo
    if not codigo:
        codigo = data.nombre.upper().replace(" ", "_").replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")[:50]

    dependencia = Dependencia(
        nombre=data.nombre,
        codigo=codigo,
        descripcion=data.descripcion,
        direccion=data.direccion,
        localidad=data.localidad,
        ciudad=data.ciudad,
        codigo_postal=data.codigo_postal,
        telefono=data.telefono,
        email=data.email,
        horario_atencion=data.horario_atencion,
        tipo_gestion=data.tipo_gestion,
        dependencia_padre_id=data.dependencia_padre_id,
        latitud=data.latitud,
        longitud=data.longitud,
        orden=data.orden,
    )

    db.add(dependencia)
    await db.commit()
    await db.refresh(dependencia)

    logger.info(f"[Dependencias] Creada dependencia '{dependencia.nombre}' (ID: {dependencia.id})")
    return dependencia


@router.put("/catalogo/{dependencia_id}", response_model=DependenciaResponse)
async def actualizar_dependencia_catalogo(
    dependencia_id: int,
    data: DependenciaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza una dependencia del catálogo global."""
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    result = await db.execute(select(Dependencia).where(Dependencia.id == dependencia_id))
    dependencia = result.scalar_one_or_none()

    if not dependencia:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    # Actualizar campos
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dependencia, field, value)

    await db.commit()
    await db.refresh(dependencia)
    return dependencia


# ============ DEPENDENCIAS POR MUNICIPIO ============

@router.get("/municipio", response_model=List[MunicipioDependenciaListResponse])
async def listar_dependencias_municipio(
    request: Request,
    activo: Optional[bool] = None,
    tipo_gestion: Optional[str] = None,
    include_assignments: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista las dependencias habilitadas para el municipio del usuario actual.
    Superadmin (sin municipio_id) ve TODAS las dependencias habilitadas de todos los municipios.

    Con include_assignments=true, incluye todas las asignaciones (categorías, tipos, trámites)
    en una sola respuesta, evitando múltiples llamadas.
    """
    # Obtener municipio_id del usuario (superadmin no tiene)
    municipio_id = current_user.municipio_id

    # Construir query con selectinload según lo que necesitemos
    if include_assignments:
        query = (
            select(MunicipioDependencia)
            .options(
                selectinload(MunicipioDependencia.dependencia),
                selectinload(MunicipioDependencia.categorias_asignadas)
                    .selectinload(MunicipioDependenciaCategoria.categoria),
                selectinload(MunicipioDependencia.tipos_tramite_asignados)
                    .selectinload(MunicipioDependenciaTipoTramite.tipo_tramite),
                selectinload(MunicipioDependencia.tramites_asignados)
                    .selectinload(MunicipioDependenciaTramite.tramite)
                    .selectinload(Tramite.tipo_tramite),
            )
        )
    else:
        query = (
            select(MunicipioDependencia)
            .options(
                selectinload(MunicipioDependencia.dependencia),
                selectinload(MunicipioDependencia.categorias_asignadas),
                selectinload(MunicipioDependencia.tipos_tramite_asignados),
                selectinload(MunicipioDependencia.tramites_asignados),
            )
        )

    # Si tiene municipio_id, filtrar por ese municipio
    # Si no (superadmin), mostrar todas las habilitaciones
    if municipio_id:
        query = query.where(MunicipioDependencia.municipio_id == municipio_id)
    else:
        logger.info(f"[Dependencias] Superadmin {current_user.email} - mostrando todas las dependencias")

    query = query.order_by(MunicipioDependencia.orden)

    if activo is not None:
        query = query.where(MunicipioDependencia.activo == activo)

    result = await db.execute(query)
    municipio_deps = result.scalars().all()

    # Transformar a response
    response = []
    for md in municipio_deps:
        dep = md.dependencia
        if tipo_gestion and dep.tipo_gestion.value != tipo_gestion.upper():
            continue

        item = MunicipioDependenciaListResponse(
            id=md.id,
            municipio_id=md.municipio_id,
            dependencia_id=md.dependencia_id,
            nombre=dep.nombre,
            codigo=dep.codigo,
            tipo_gestion=dep.tipo_gestion.value if hasattr(dep.tipo_gestion, 'value') else str(dep.tipo_gestion),
            activo=md.activo,
            orden=md.orden,
            categorias_count=len(md.categorias_asignadas or []),
            tipos_tramite_count=len(md.tipos_tramite_asignados or []),
            tramites_count=len(md.tramites_asignados or []),
        )

        # Si se pidieron las asignaciones completas, incluirlas
        if include_assignments:
            item.categorias = [
                {"id": a.categoria.id, "nombre": a.categoria.nombre, "icono": a.categoria.icono, "color": a.categoria.color}
                for a in (md.categorias_asignadas or []) if a.categoria
            ]
            item.tipos_tramite = [
                {"id": a.tipo_tramite.id, "nombre": a.tipo_tramite.nombre, "icono": a.tipo_tramite.icono, "color": a.tipo_tramite.color}
                for a in (md.tipos_tramite_asignados or []) if a.tipo_tramite
            ]
            item.tramites = [
                {
                    "id": a.tramite.id,
                    "nombre": a.tramite.nombre,
                    "tipo_tramite_id": a.tramite.tipo_tramite_id,
                    "icono": a.tramite.icono,
                    "color": a.tramite.tipo_tramite.color if a.tramite.tipo_tramite else None
                }
                for a in (md.tramites_asignados or []) if a.tramite
            ]

        response.append(item)

    return response


@router.get("/municipio/{municipio_dependencia_id}", response_model=MunicipioDependenciaResponse)
async def obtener_dependencia_municipio(
    municipio_dependencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el detalle de una dependencia habilitada."""
    query = (
        select(MunicipioDependencia)
        .options(
            selectinload(MunicipioDependencia.dependencia),
            selectinload(MunicipioDependencia.categorias_asignadas).selectinload(MunicipioDependenciaCategoria.categoria),
            selectinload(MunicipioDependencia.tipos_tramite_asignados).selectinload(MunicipioDependenciaTipoTramite.tipo_tramite),
        )
        .where(MunicipioDependencia.id == municipio_dependencia_id)
    )

    result = await db.execute(query)
    md = result.scalar_one_or_none()

    if not md:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    # Verificar que pertenece al municipio del usuario
    if md.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta dependencia")

    return md


@router.post("/municipio/habilitar", response_model=List[MunicipioDependenciaListResponse])
async def habilitar_dependencias(
    data: HabilitarDependenciasRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Habilita una o más dependencias del catálogo para el municipio actual.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    municipio_id = current_user.municipio_id
    habilitadas = []

    for dep_id in data.dependencia_ids:
        # Verificar que la dependencia existe
        result = await db.execute(select(Dependencia).where(Dependencia.id == dep_id))
        dependencia = result.scalar_one_or_none()
        if not dependencia:
            continue

        # Verificar si ya está habilitada
        existing = await db.execute(
            select(MunicipioDependencia).where(
                MunicipioDependencia.municipio_id == municipio_id,
                MunicipioDependencia.dependencia_id == dep_id
            )
        )
        if existing.scalar_one_or_none():
            continue

        # Crear la habilitación
        md = MunicipioDependencia(
            municipio_id=municipio_id,
            dependencia_id=dep_id,
            activo=True,
            orden=dependencia.orden,
        )
        db.add(md)
        habilitadas.append(md)

    await db.commit()

    # Refrescar y retornar
    for md in habilitadas:
        await db.refresh(md)

    logger.info(f"[Dependencias] Municipio {municipio_id} habilitó {len(habilitadas)} dependencias")

    return await listar_dependencias_municipio(request=None, db=db, current_user=current_user)


@router.put("/municipio/{municipio_dependencia_id}", response_model=MunicipioDependenciaResponse)
async def actualizar_dependencia_municipio(
    municipio_dependencia_id: int,
    data: MunicipioDependenciaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza una dependencia habilitada (personalizaciones locales)."""
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    result = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(MunicipioDependencia.id == municipio_dependencia_id)
    )
    md = result.scalar_one_or_none()

    if not md:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    if md.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="No tiene acceso")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(md, field, value)

    await db.commit()
    await db.refresh(md)
    return md


@router.delete("/municipio/{municipio_dependencia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deshabilitar_dependencia(
    municipio_dependencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deshabilita (elimina) una dependencia del municipio."""
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    result = await db.execute(
        select(MunicipioDependencia).where(MunicipioDependencia.id == municipio_dependencia_id)
    )
    md = result.scalar_one_or_none()

    if not md:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    if md.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="No tiene acceso")

    await db.delete(md)
    await db.commit()

    logger.info(f"[Dependencias] Deshabilitada dependencia {municipio_dependencia_id}")


# ============ ASIGNACIÓN DE CATEGORÍAS ============

@router.post("/municipio/{municipio_dependencia_id}/categorias")
async def asignar_categorias(
    municipio_dependencia_id: int,
    data: AsignarCategoriasRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Asigna categorías de reclamos a una dependencia.
    Reemplaza las asignaciones existentes.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    # Obtener la dependencia del municipio
    result = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(MunicipioDependencia.id == municipio_dependencia_id)
    )
    md = result.scalar_one_or_none()

    if not md:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    if md.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="No tiene acceso")

    municipio_id = md.municipio_id
    dependencia_id = md.dependencia_id

    # Eliminar asignaciones existentes
    await db.execute(
        delete(MunicipioDependenciaCategoria).where(
            MunicipioDependenciaCategoria.municipio_dependencia_id == municipio_dependencia_id
        )
    )

    # Crear nuevas asignaciones
    for cat_id in data.categoria_ids:
        asignacion = MunicipioDependenciaCategoria(
            municipio_id=municipio_id,
            dependencia_id=dependencia_id,
            categoria_id=cat_id,
            municipio_dependencia_id=municipio_dependencia_id,
            activo=True,
        )
        db.add(asignacion)

    await db.commit()

    logger.info(f"[Dependencias] Asignadas {len(data.categoria_ids)} categorías a dependencia {municipio_dependencia_id}")

    return {"message": f"Asignadas {len(data.categoria_ids)} categorías"}


@router.get("/municipio/{municipio_dependencia_id}/categorias")
async def listar_categorias_asignadas(
    municipio_dependencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista las categorías asignadas a una dependencia."""
    result = await db.execute(
        select(MunicipioDependenciaCategoria)
        .options(selectinload(MunicipioDependenciaCategoria.categoria))
        .where(MunicipioDependenciaCategoria.municipio_dependencia_id == municipio_dependencia_id)
    )
    asignaciones = result.scalars().all()

    return [
        {
            "id": a.id,
            "categoria_id": a.categoria_id,
            "categoria": {
                "id": a.categoria.id,
                "nombre": a.categoria.nombre,
                "icono": a.categoria.icono,
                "color": a.categoria.color,
            },
            "tiempo_resolucion_estimado": a.tiempo_resolucion_estimado,
            "prioridad_default": a.prioridad_default,
            "activo": a.activo,
        }
        for a in asignaciones
    ]


# ============ ASIGNACIÓN DE TIPOS DE TRÁMITE ============

@router.post("/municipio/{municipio_dependencia_id}/tipos-tramite")
async def asignar_tipos_tramite(
    municipio_dependencia_id: int,
    data: AsignarTiposTramiteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Asigna tipos de trámite a una dependencia.
    Reemplaza las asignaciones existentes.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    result = await db.execute(
        select(MunicipioDependencia)
        .where(MunicipioDependencia.id == municipio_dependencia_id)
    )
    md = result.scalar_one_or_none()

    if not md:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    if md.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="No tiene acceso")

    municipio_id = md.municipio_id
    dependencia_id = md.dependencia_id

    # Eliminar asignaciones existentes
    await db.execute(
        delete(MunicipioDependenciaTipoTramite).where(
            MunicipioDependenciaTipoTramite.municipio_dependencia_id == municipio_dependencia_id
        )
    )

    # Crear nuevas asignaciones
    for tt_id in data.tipo_tramite_ids:
        asignacion = MunicipioDependenciaTipoTramite(
            municipio_id=municipio_id,
            dependencia_id=dependencia_id,
            tipo_tramite_id=tt_id,
            municipio_dependencia_id=municipio_dependencia_id,
            activo=True,
        )
        db.add(asignacion)

    await db.commit()

    logger.info(f"[Dependencias] Asignados {len(data.tipo_tramite_ids)} tipos de trámite a dependencia {municipio_dependencia_id}")

    return {"message": f"Asignados {len(data.tipo_tramite_ids)} tipos de trámite"}


@router.get("/municipio/{municipio_dependencia_id}/tipos-tramite")
async def listar_tipos_tramite_asignados(
    municipio_dependencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista los tipos de trámite asignados a una dependencia."""
    result = await db.execute(
        select(MunicipioDependenciaTipoTramite)
        .options(selectinload(MunicipioDependenciaTipoTramite.tipo_tramite))
        .where(MunicipioDependenciaTipoTramite.municipio_dependencia_id == municipio_dependencia_id)
    )
    asignaciones = result.scalars().all()

    return [
        {
            "id": a.id,
            "tipo_tramite_id": a.tipo_tramite_id,
            "tipo_tramite": {
                "id": a.tipo_tramite.id,
                "nombre": a.tipo_tramite.nombre,
                "icono": a.tipo_tramite.icono,
                "color": a.tipo_tramite.color,
            },
            "activo": a.activo,
        }
        for a in asignaciones
    ]


# ============ ASIGNACIÓN DE TRÁMITES ESPECÍFICOS ============

@router.post("/municipio/{municipio_dependencia_id}/tramites")
async def asignar_tramites(
    municipio_dependencia_id: int,
    data: AsignarTramitesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Asigna trámites específicos a una dependencia.
    Reemplaza las asignaciones existentes.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    result = await db.execute(
        select(MunicipioDependencia)
        .where(MunicipioDependencia.id == municipio_dependencia_id)
    )
    md = result.scalar_one_or_none()

    if not md:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    if current_user.municipio_id and md.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=403, detail="No tiene acceso")

    # Eliminar asignaciones existentes
    await db.execute(
        delete(MunicipioDependenciaTramite).where(
            MunicipioDependenciaTramite.municipio_dependencia_id == municipio_dependencia_id
        )
    )

    # Crear nuevas asignaciones
    for tramite_id in data.tramite_ids:
        asignacion = MunicipioDependenciaTramite(
            municipio_dependencia_id=municipio_dependencia_id,
            tramite_id=tramite_id,
            activo=True,
        )
        db.add(asignacion)

    await db.commit()

    logger.info(f"[Dependencias] Asignados {len(data.tramite_ids)} trámites a dependencia {municipio_dependencia_id}")

    return {"message": f"Asignados {len(data.tramite_ids)} trámites"}


@router.get("/municipio/{municipio_dependencia_id}/tramites")
async def listar_tramites_asignados(
    municipio_dependencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista los trámites específicos asignados a una dependencia."""
    result = await db.execute(
        select(MunicipioDependenciaTramite)
        .options(
            selectinload(MunicipioDependenciaTramite.tramite)
            .selectinload(Tramite.tipo_tramite)
        )
        .where(MunicipioDependenciaTramite.municipio_dependencia_id == municipio_dependencia_id)
        .where(MunicipioDependenciaTramite.activo == True)
    )
    asignaciones = result.scalars().all()

    return [
        {
            "id": a.id,
            "tramite_id": a.tramite_id,
            "tramite": {
                "id": a.tramite.id,
                "nombre": a.tramite.nombre,
                "tipo_tramite_id": a.tramite.tipo_tramite_id,
                "icono": a.tramite.icono,
                "color": a.tramite.tipo_tramite.color if a.tramite.tipo_tramite else None,
            } if a.tramite else None,
            "activo": a.activo,
        }
        for a in asignaciones
    ]
