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
    MunicipioTramite,
    MunicipioTipoTramite,
)
from models.dependencia import TipoGestionDependencia
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
        # Incluir también las dependencias con tipo_gestion='AMBOS'
        tipo_upper = tipo_gestion.upper()
        query = query.where(
            (Dependencia.tipo_gestion == tipo_upper) |
            (Dependencia.tipo_gestion == TipoGestionDependencia.AMBOS)
        )

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
    # Log de parámetros recibidos
    logger.info(f"[Dependencias] GET /municipio - activo={activo}, tipo_gestion={tipo_gestion}, include_assignments={include_assignments}, user={current_user.email}")

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
    logger.info(f"[Dependencias] Total dependencias encontradas: {len(municipio_deps)}, include_assignments={include_assignments}, tipo_gestion={tipo_gestion}")
    for md in municipio_deps:
        dep = md.dependencia
        # Log para debug
        cats_count = len(md.categorias_asignadas or [])
        logger.info(f"[Dependencias] {dep.nombre} (tipo={dep.tipo_gestion.value if hasattr(dep.tipo_gestion, 'value') else dep.tipo_gestion}): {cats_count} categorías asignadas")

        # Filtrar por tipo_gestion: incluir también las que tienen 'AMBOS'
        if tipo_gestion:
            tipo_upper = tipo_gestion.upper()
            dep_tipo = dep.tipo_gestion.value if hasattr(dep.tipo_gestion, 'value') else str(dep.tipo_gestion)
            if dep_tipo != tipo_upper and dep_tipo != 'AMBOS':
                logger.info(f"[Dependencias] Filtrada: {dep.nombre} (tipo={dep_tipo} != {tipo_upper})")
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
            color=getattr(dep, 'color', None) or "#6366f1",
            icono=getattr(dep, 'icono', None) or "Building2",
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


@router.delete("/municipio/categorias/limpiar")
async def limpiar_asignaciones_categorias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Elimina TODAS las asignaciones de categorías a dependencias del municipio actual.
    Útil para empezar de cero con las asignaciones.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    # Contar cuántas hay antes de eliminar
    result = await db.execute(
        select(MunicipioDependenciaCategoria)
        .where(MunicipioDependenciaCategoria.municipio_id == municipio_id)
    )
    count = len(result.scalars().all())

    # Eliminar todas las asignaciones del municipio
    await db.execute(
        delete(MunicipioDependenciaCategoria)
        .where(MunicipioDependenciaCategoria.municipio_id == municipio_id)
    )

    await db.commit()

    logger.info(f"[Dependencias] Limpiadas {count} asignaciones de categorías para municipio {municipio_id}")

    return {"message": f"Se eliminaron {count} asignaciones de categorías", "eliminadas": count}


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
    También habilita automáticamente los tipos y trámites en las tablas municipio_tipos_tramites y municipio_tramites.
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

    tipos_habilitados = 0
    tramites_habilitados = 0

    # Crear nuevas asignaciones y habilitar tipos/trámites
    for tt_id in data.tipo_tramite_ids:
        # Asignar tipo a la dependencia
        asignacion = MunicipioDependenciaTipoTramite(
            municipio_id=municipio_id,
            dependencia_id=dependencia_id,
            tipo_tramite_id=tt_id,
            municipio_dependencia_id=municipio_dependencia_id,
            activo=True,
        )
        db.add(asignacion)

        # Habilitar el tipo en municipio_tipos_tramites si no existe
        result = await db.execute(
            select(MunicipioTipoTramite).where(
                MunicipioTipoTramite.municipio_id == municipio_id,
                MunicipioTipoTramite.tipo_tramite_id == tt_id
            )
        )
        tipo_existente = result.scalar_one_or_none()
        if not tipo_existente:
            mtt = MunicipioTipoTramite(
                municipio_id=municipio_id,
                tipo_tramite_id=tt_id,
                activo=True,
                orden=0
            )
            db.add(mtt)
            tipos_habilitados += 1
        elif not tipo_existente.activo:
            tipo_existente.activo = True
            tipos_habilitados += 1

        # Obtener trámites de este tipo y habilitarlos
        result = await db.execute(
            select(Tramite).where(
                Tramite.tipo_tramite_id == tt_id,
                Tramite.activo == True
            )
        )
        tramites_del_tipo = result.scalars().all()

        for tramite in tramites_del_tipo:
            # Habilitar en municipio_tramites si no existe
            result = await db.execute(
                select(MunicipioTramite).where(
                    MunicipioTramite.municipio_id == municipio_id,
                    MunicipioTramite.tramite_id == tramite.id
                )
            )
            tramite_existente = result.scalar_one_or_none()
            if not tramite_existente:
                mt = MunicipioTramite(
                    municipio_id=municipio_id,
                    tramite_id=tramite.id,
                    activo=True,
                    orden=tramite.orden or 0
                )
                db.add(mt)
                tramites_habilitados += 1
            elif not tramite_existente.activo:
                tramite_existente.activo = True
                tramites_habilitados += 1

    await db.commit()

    logger.info(f"[Dependencias] Asignados {len(data.tipo_tramite_ids)} tipos de trámite a dependencia {municipio_dependencia_id}. Habilitados: {tipos_habilitados} tipos, {tramites_habilitados} trámites")

    return {
        "message": f"Asignados {len(data.tipo_tramite_ids)} tipos de trámite",
        "tipos_habilitados": tipos_habilitados,
        "tramites_habilitados": tramites_habilitados
    }


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


@router.delete("/municipio/tipos-tramite/limpiar")
async def limpiar_asignaciones_tipos_tramite(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina TODAS las asignaciones de tipos de trámite a dependencias del municipio actual."""
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    result = await db.execute(
        select(MunicipioDependenciaTipoTramite)
        .where(MunicipioDependenciaTipoTramite.municipio_id == municipio_id)
    )
    count = len(result.scalars().all())

    await db.execute(
        delete(MunicipioDependenciaTipoTramite)
        .where(MunicipioDependenciaTipoTramite.municipio_id == municipio_id)
    )
    await db.commit()

    logger.info(f"[Dependencias] Limpiadas {count} asignaciones de tipos de trámite para municipio {municipio_id}")
    return {"message": f"Se eliminaron {count} asignaciones de tipos de trámite", "eliminadas": count}


# ============ AUTO-ASIGNACIÓN CON IA ============

from pydantic import BaseModel
from core.config import settings
import httpx
import json
import re


class CategoriaSimple(BaseModel):
    id: int
    nombre: str


class DependenciaSimple(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None


class AutoAsignarCategoriasRequest(BaseModel):
    categorias: List[CategoriaSimple]
    dependencias: List[DependenciaSimple]


class TipoTramiteSimple(BaseModel):
    id: int
    nombre: str


class AutoAsignarTiposTramiteRequest(BaseModel):
    tipos_tramite: List[TipoTramiteSimple]
    dependencias: List[DependenciaSimple]


async def asignar_con_ia(items: List[dict], dependencias: List[dict], tipo: str) -> dict:
    """Usa IA (Groq/Gemini) para asignar items (categorías o tipos) a dependencias."""
    tipo_label = "categorías de reclamos" if tipo == "categorias" else "tipos de trámite"

    deps_list = "\n".join([
        f"- ID {d['id']}: {d['nombre']}" + (f" - {d['descripcion']}" if d.get('descripcion') else "")
        for d in dependencias
    ])
    items_list = "\n".join([f"- ID {i['id']}: {i['nombre']}" for i in items])

    prompt = f"""Eres un asistente de administración municipal argentina.
Asigna cada {tipo_label} a la dependencia municipal más apropiada.

DEPENDENCIAS DISPONIBLES:
{deps_list}

{tipo_label.upper()} A ASIGNAR:
{items_list}

INSTRUCCIONES:
1. Cada item va a UNA sola dependencia.
2. Todas deben ser asignadas.
3. Si no hay dependencia clara, asigna a "Atención al Vecino" o similar.

Responde SOLO con JSON válido: {{"<dependencia_id>": [<lista de IDs>]}}"""

    result = None

    if settings.GROQ_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}", "Content-Type": "application/json"},
                    json={"model": settings.GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1, "max_tokens": 2000}
                )
                if response.status_code == 200:
                    data = response.json()
                    text_response = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                    json_match = re.search(r'\{[\s\S]*\}', text_response)
                    if json_match:
                        result = json.loads(json_match.group())
                        logger.info(f"[IA] Auto-asignación con Groq exitosa para {tipo}")
        except Exception as e:
            logger.error(f"[IA] Error en Groq: {e}")

    if not result and settings.GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                    headers={"Content-Type": "application/json"},
                    json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2000}}
                )
                if response.status_code == 200:
                    data = response.json()
                    text_response = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    json_match = re.search(r'\{[\s\S]*\}', text_response)
                    if json_match:
                        result = json.loads(json_match.group())
                        logger.info(f"[IA] Auto-asignación con Gemini exitosa para {tipo}")
        except Exception as e:
            logger.error(f"[IA] Error en Gemini: {e}")

    return result or {}


@router.post("/municipio/categorias/auto-asignar")
async def auto_asignar_categorias_ia(
    data: AutoAsignarCategoriasRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Usa IA para asignar categorías de reclamos a dependencias automáticamente."""
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    if not data.categorias or not data.dependencias:
        raise HTTPException(status_code=400, detail="Se requieren categorías y dependencias")

    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Servicio de IA no configurado")

    categorias_dict = [{"id": c.id, "nombre": c.nombre} for c in data.categorias]
    dependencias_dict = [{"id": d.id, "nombre": d.nombre, "descripcion": d.descripcion} for d in data.dependencias]

    asignaciones_ia = await asignar_con_ia(categorias_dict, dependencias_dict, "categorias")

    if not asignaciones_ia:
        raise HTTPException(status_code=500, detail="La IA no pudo generar asignaciones")

    await db.execute(delete(MunicipioDependenciaCategoria).where(MunicipioDependenciaCategoria.municipio_id == municipio_id))

    result = await db.execute(select(MunicipioDependencia).where(MunicipioDependencia.municipio_id == municipio_id))
    muni_deps = {md.dependencia_id: md for md in result.scalars().all()}

    total_asignadas = 0
    asignaciones_resultado = {}

    for dep_id_str, cat_ids in asignaciones_ia.items():
        try:
            dep_id = int(dep_id_str)
            md = muni_deps.get(dep_id)
            if not md:
                continue
            for cat_id in cat_ids:
                db.add(MunicipioDependenciaCategoria(municipio_id=municipio_id, dependencia_id=dep_id, categoria_id=int(cat_id), municipio_dependencia_id=md.id, activo=True))
                total_asignadas += 1
            asignaciones_resultado[dep_id] = cat_ids
        except (ValueError, TypeError) as e:
            logger.warning(f"[IA] Error procesando asignación: {e}")

    await db.commit()
    logger.info(f"[IA] Auto-asignación de {total_asignadas} categorías para municipio {municipio_id}")
    return {"message": f"Se asignaron {total_asignadas} categorías automáticamente", "asignaciones": asignaciones_resultado, "total": total_asignadas}


@router.post("/municipio/tipos-tramite/auto-asignar")
async def auto_asignar_tipos_tramite_ia(
    data: AutoAsignarTiposTramiteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Usa IA para asignar tipos de trámite a dependencias automáticamente.
    También habilita automáticamente los tipos y trámites en municipio_tipos_tramites y municipio_tramites.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    if not data.tipos_tramite or not data.dependencias:
        raise HTTPException(status_code=400, detail="Se requieren tipos de trámite y dependencias")

    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Servicio de IA no configurado")

    tipos_dict = [{"id": t.id, "nombre": t.nombre} for t in data.tipos_tramite]
    dependencias_dict = [{"id": d.id, "nombre": d.nombre, "descripcion": d.descripcion} for d in data.dependencias]

    asignaciones_ia = await asignar_con_ia(tipos_dict, dependencias_dict, "tipos_tramite")

    if not asignaciones_ia:
        raise HTTPException(status_code=500, detail="La IA no pudo generar asignaciones")

    await db.execute(delete(MunicipioDependenciaTipoTramite).where(MunicipioDependenciaTipoTramite.municipio_id == municipio_id))

    result = await db.execute(select(MunicipioDependencia).where(MunicipioDependencia.municipio_id == municipio_id))
    muni_deps = {md.dependencia_id: md for md in result.scalars().all()}

    total_asignadas = 0
    tipos_habilitados = 0
    tramites_habilitados = 0
    asignaciones_resultado = {}
    tipos_procesados = set()

    for dep_id_str, tipo_ids in asignaciones_ia.items():
        try:
            dep_id = int(dep_id_str)
            md = muni_deps.get(dep_id)
            if not md:
                continue
            for tipo_id in tipo_ids:
                tipo_id = int(tipo_id)
                db.add(MunicipioDependenciaTipoTramite(municipio_id=municipio_id, dependencia_id=dep_id, tipo_tramite_id=tipo_id, municipio_dependencia_id=md.id, activo=True))
                total_asignadas += 1

                # Habilitar tipo y trámites solo una vez por tipo
                if tipo_id not in tipos_procesados:
                    tipos_procesados.add(tipo_id)

                    # Habilitar el tipo en municipio_tipos_tramites
                    result = await db.execute(
                        select(MunicipioTipoTramite).where(
                            MunicipioTipoTramite.municipio_id == municipio_id,
                            MunicipioTipoTramite.tipo_tramite_id == tipo_id
                        )
                    )
                    tipo_existente = result.scalar_one_or_none()
                    if not tipo_existente:
                        db.add(MunicipioTipoTramite(municipio_id=municipio_id, tipo_tramite_id=tipo_id, activo=True, orden=0))
                        tipos_habilitados += 1
                    elif not tipo_existente.activo:
                        tipo_existente.activo = True
                        tipos_habilitados += 1

                    # Habilitar trámites de este tipo
                    result = await db.execute(
                        select(Tramite).where(Tramite.tipo_tramite_id == tipo_id, Tramite.activo == True)
                    )
                    for tramite in result.scalars().all():
                        result2 = await db.execute(
                            select(MunicipioTramite).where(
                                MunicipioTramite.municipio_id == municipio_id,
                                MunicipioTramite.tramite_id == tramite.id
                            )
                        )
                        tramite_existente = result2.scalar_one_or_none()
                        if not tramite_existente:
                            db.add(MunicipioTramite(municipio_id=municipio_id, tramite_id=tramite.id, activo=True, orden=tramite.orden or 0))
                            tramites_habilitados += 1
                        elif not tramite_existente.activo:
                            tramite_existente.activo = True
                            tramites_habilitados += 1

            asignaciones_resultado[dep_id] = tipo_ids
        except (ValueError, TypeError) as e:
            logger.warning(f"[IA] Error procesando asignación: {e}")

    await db.commit()
    logger.info(f"[IA] Auto-asignación de {total_asignadas} tipos de trámite para municipio {municipio_id}. Habilitados: {tipos_habilitados} tipos, {tramites_habilitados} trámites")
    return {
        "message": f"Se asignaron {total_asignadas} tipos de trámite automáticamente",
        "asignaciones": asignaciones_resultado,
        "total": total_asignadas,
        "tipos_habilitados": tipos_habilitados,
        "tramites_habilitados": tramites_habilitados
    }
