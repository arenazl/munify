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
    MunicipioDependenciaTramite,
    Tramite,
)
from models.categoria_reclamo import CategoriaReclamo as Categoria
from models.categoria_tramite import CategoriaTramite
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
    AsignarTramitesRequest,
    HabilitarDependenciasRequest,
    TipoGestionLiteral,
    TipoJerarquicoLiteral,
)

router = APIRouter(prefix="/dependencias", tags=["Dependencias"])
logger = logging.getLogger(__name__)


# ============ CATÁLOGO GLOBAL DE DEPENDENCIAS ============

@router.get("/catalogo", response_model=List[DependenciaResponse])
async def listar_catalogo_dependencias(
    activo: Optional[bool] = None,
    tipo_gestion: Optional[str] = None,
    tipo_jerarquico: Optional[str] = None,
    dependencia_padre_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista el catálogo global de dependencias.
    Accesible para admin/supervisor para ver qué dependencias pueden habilitar.
    Filtros opcionales: tipo_jerarquico (SECRETARIA/DIRECCION) y dependencia_padre_id
    para listar Direcciones de una Secretaria especifica.
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

    if tipo_jerarquico:
        query = query.where(Dependencia.tipo_jerarquico == tipo_jerarquico.upper())

    if dependencia_padre_id is not None:
        query = query.where(Dependencia.dependencia_padre_id == dependencia_padre_id)

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

    # Si es DIRECCION, validar que el padre exista y sea SECRETARIA.
    if data.tipo_jerarquico == "DIRECCION":
        if not data.dependencia_padre_id:
            raise HTTPException(status_code=400, detail="Una Direccion requiere indicar la Secretaria padre")
        padre_q = await db.execute(select(Dependencia).where(Dependencia.id == data.dependencia_padre_id))
        padre = padre_q.scalar_one_or_none()
        if not padre:
            raise HTTPException(status_code=400, detail="La Secretaria padre indicada no existe")
        padre_tj = padre.tipo_jerarquico.value if hasattr(padre.tipo_jerarquico, "value") else padre.tipo_jerarquico
        if padre_tj != "SECRETARIA":
            raise HTTPException(status_code=400, detail="El padre debe ser una Secretaria")

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
        tipo_jerarquico=data.tipo_jerarquico,
        dependencia_padre_id=data.dependencia_padre_id,
        color=data.color or "#6366f1",
        icono=data.icono or ("Landmark" if data.tipo_jerarquico == "SECRETARIA" else "Building2"),
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
    tipo_jerarquico: Optional[str] = None,
    dependencia_padre_id: Optional[int] = None,
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
                selectinload(MunicipioDependencia.tramites_asignados)
                    .selectinload(MunicipioDependenciaTramite.tramite)
                    .selectinload(Tramite.categoria_tramite),
            )
        )
    else:
        query = (
            select(MunicipioDependencia)
            .options(
                selectinload(MunicipioDependencia.dependencia),
                selectinload(MunicipioDependencia.categorias_asignadas),
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

    # Pre-calcular cuantas Direcciones (hijos) tiene cada Secretaria del municipio,
    # contando solo las que efectivamente estan habilitadas para este municipio.
    direcciones_por_padre: dict[int, int] = {}
    if municipio_deps:
        from sqlalchemy import func as sa_func
        muni_ids_for_count = {md.municipio_id for md in municipio_deps}
        dep_padre_alias = Dependencia
        count_q = (
            select(dep_padre_alias.dependencia_padre_id, sa_func.count(MunicipioDependencia.id))
            .join(MunicipioDependencia, MunicipioDependencia.dependencia_id == dep_padre_alias.id)
            .where(
                MunicipioDependencia.municipio_id.in_(muni_ids_for_count),
                dep_padre_alias.dependencia_padre_id.is_not(None),
            )
            .group_by(dep_padre_alias.dependencia_padre_id)
        )
        cnt_res = await db.execute(count_q)
        direcciones_por_padre = {row[0]: row[1] for row in cnt_res.all()}

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

        # Filtrar por nivel jerarquico (SECRETARIA / DIRECCION).
        if tipo_jerarquico:
            dep_tj = dep.tipo_jerarquico.value if hasattr(dep.tipo_jerarquico, 'value') else (dep.tipo_jerarquico or "SECRETARIA")
            if dep_tj != tipo_jerarquico.upper():
                continue

        # Filtrar por padre (para listar Direcciones de una Secretaria).
        if dependencia_padre_id is not None and dep.dependencia_padre_id != dependencia_padre_id:
            continue

        tj = dep.tipo_jerarquico.value if hasattr(dep.tipo_jerarquico, 'value') else (dep.tipo_jerarquico or "SECRETARIA")
        item = MunicipioDependenciaListResponse(
            id=md.id,
            municipio_id=md.municipio_id,
            dependencia_id=md.dependencia_id,
            nombre=dep.nombre,
            codigo=dep.codigo,
            tipo_gestion=dep.tipo_gestion.value if hasattr(dep.tipo_gestion, 'value') else str(dep.tipo_gestion),
            tipo_jerarquico=tj,
            dependencia_padre_id=dep.dependencia_padre_id,
            activo=md.activo,
            orden=md.orden,
            color=getattr(dep, 'color', None) or "#6366f1",
            icono=getattr(dep, 'icono', None) or ("Landmark" if tj == "SECRETARIA" else "Building2"),
            categorias_count=len(md.categorias_asignadas or []),
            tramites_count=len(md.tramites_asignados or []),
            direcciones_count=direcciones_por_padre.get(dep.id, 0),
        )

        # Si se pidieron las asignaciones completas, incluirlas
        if include_assignments:
            item.categorias = [
                {"id": a.categoria.id, "nombre": a.categoria.nombre, "icono": a.categoria.icono, "color": a.categoria.color}
                for a in (md.categorias_asignadas or []) if a.categoria
            ]
            item.tramites = [
                {
                    "id": a.tramite.id,
                    "nombre": a.tramite.nombre,
                    "categoria_tramite_id": a.tramite.categoria_tramite_id,
                    "icono": a.tramite.icono,
                    "color": a.tramite.categoria_tramite.color if a.tramite.categoria_tramite else None
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
            selectinload(MunicipioDependencia.tramites_asignados).selectinload(MunicipioDependenciaTramite.tramite),
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


# ============ ENDPOINT PÚBLICO ============

@router.get("/public/dependencia-categoria/{municipio_id}/{categoria_id}")
async def obtener_dependencia_por_categoria_public(
    municipio_id: int,
    categoria_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint PÚBLICO para obtener la dependencia encargada de una categoría.
    No requiere autenticación. Usado por el wizard de nuevo reclamo para usuarios anónimos.
    """
    # Buscar asignación de categoría a dependencia
    result = await db.execute(
        select(MunicipioDependenciaCategoria)
        .options(
            selectinload(MunicipioDependenciaCategoria.municipio_dependencia)
            .selectinload(MunicipioDependencia.dependencia)
        )
        .where(
            MunicipioDependenciaCategoria.municipio_id == municipio_id,
            MunicipioDependenciaCategoria.categoria_id == categoria_id
        )
    )
    asignacion = result.scalar_one_or_none()

    if not asignacion or not asignacion.municipio_dependencia or not asignacion.municipio_dependencia.dependencia:
        return None

    dep = asignacion.municipio_dependencia.dependencia
    return {
        "id": asignacion.municipio_dependencia.id,
        "nombre": dep.nombre,
        "codigo": dep.codigo,
        "color": dep.color,
        "icono": dep.icono
    }


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
            .selectinload(Tramite.categoria_tramite)
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
                "categoria_tramite_id": a.tramite.categoria_tramite_id,
                "icono": a.tramite.icono,
                "color": a.tramite.categoria_tramite.color if a.tramite.categoria_tramite else None,
            } if a.tramite else None,
            "activo": a.activo,
        }
        for a in asignaciones
    ]


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


class CategoriaTramiteSimple(BaseModel):
    id: int
    nombre: str


class AutoAsignarCategoriasTramiteRequest(BaseModel):
    categorias_tramite: List[CategoriaTramiteSimple]
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


@router.post("/municipio/categorias-tramite/auto-asignar")
async def auto_asignar_categorias_tramite_ia(
    data: AutoAsignarCategoriasTramiteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Usa IA para asignar categorías de trámite a dependencias.
    Para cada categoría asignada, todos sus trámites quedan vinculados a la
    misma dependencia automáticamente (vía MunicipioDependenciaTramite).
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")

    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    if not data.categorias_tramite or not data.dependencias:
        raise HTTPException(status_code=400, detail="Se requieren categorías de trámite y dependencias")

    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Servicio de IA no configurado")

    cats_dict = [{"id": c.id, "nombre": c.nombre} for c in data.categorias_tramite]
    deps_dict = [{"id": d.id, "nombre": d.nombre, "descripcion": d.descripcion} for d in data.dependencias]

    asignaciones_ia = await asignar_con_ia(cats_dict, deps_dict, "categorias_tramite")

    if not asignaciones_ia:
        raise HTTPException(status_code=500, detail="La IA no pudo generar asignaciones")

    # Limpiar asignaciones previas de trámites del municipio
    md_q = await db.execute(
        select(MunicipioDependencia).where(MunicipioDependencia.municipio_id == municipio_id)
    )
    muni_deps = {md.dependencia_id: md for md in md_q.scalars().all()}

    for md in muni_deps.values():
        await db.execute(
            delete(MunicipioDependenciaTramite).where(
                MunicipioDependenciaTramite.municipio_dependencia_id == md.id
            )
        )

    total_categorias = 0
    total_tramites = 0
    asignaciones_resultado = {}

    for dep_id_str, cat_ids in asignaciones_ia.items():
        try:
            dep_id = int(dep_id_str)
            md = muni_deps.get(dep_id)
            if not md:
                continue

            for cat_id in cat_ids:
                cat_id = int(cat_id)
                # Trámites de esta categoría en este municipio
                tramites_q = await db.execute(
                    select(Tramite).where(
                        Tramite.categoria_tramite_id == cat_id,
                        Tramite.municipio_id == municipio_id,
                        Tramite.activo == True,
                    )
                )
                for tramite in tramites_q.scalars().all():
                    db.add(MunicipioDependenciaTramite(
                        municipio_dependencia_id=md.id,
                        tramite_id=tramite.id,
                        activo=True,
                    ))
                    total_tramites += 1
                total_categorias += 1

            asignaciones_resultado[dep_id] = cat_ids
        except (ValueError, TypeError) as e:
            logger.warning(f"[IA] Error procesando asignación: {e}")

    await db.commit()
    logger.info(f"[IA] Auto-asignación: {total_categorias} categorías → {total_tramites} trámites para municipio {municipio_id}")
    return {
        "message": f"Se asignaron {total_categorias} categorías de trámite ({total_tramites} trámites) automáticamente",
        "asignaciones": asignaciones_resultado,
        "total_categorias": total_categorias,
        "total_tramites": total_tramites,
    }


# ============ JERARQUIA: ARBOL SECRETARIA -> DIRECCIONES ============

@router.get("/municipio-arbol")
async def listar_arbol_jerarquico(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve las dependencias del municipio del usuario armadas como arbol:
    cada Secretaria con sus Direcciones colgando.

    Las Direcciones huerfanas (no enganchadas a una Secretaria habilitada en el
    municipio) se devuelven al final bajo la clave `direcciones_huerfanas`.
    """
    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    q = (
        select(MunicipioDependencia)
        .options(
            selectinload(MunicipioDependencia.dependencia),
            selectinload(MunicipioDependencia.categorias_asignadas),
            selectinload(MunicipioDependencia.tramites_asignados),
        )
        .where(MunicipioDependencia.municipio_id == municipio_id)
        .order_by(MunicipioDependencia.orden)
    )
    res = await db.execute(q)
    todas = res.scalars().all()

    secretarias_por_dep_id: dict[int, dict] = {}
    direcciones: list[dict] = []

    def serialize(md, *, incluir_padre=True):
        dep = md.dependencia
        tj = dep.tipo_jerarquico.value if hasattr(dep.tipo_jerarquico, 'value') else (dep.tipo_jerarquico or "SECRETARIA")
        tg = dep.tipo_gestion.value if hasattr(dep.tipo_gestion, 'value') else str(dep.tipo_gestion)
        item = {
            "id": md.id,
            "dependencia_id": dep.id,
            "nombre": dep.nombre,
            "codigo": dep.codigo,
            "tipo_gestion": tg,
            "tipo_jerarquico": tj,
            "color": dep.color or "#6366f1",
            "icono": dep.icono or ("Landmark" if tj == "SECRETARIA" else "Building2"),
            "activo": md.activo,
            "orden": md.orden,
            "categorias_count": len(md.categorias_asignadas or []),
            "tramites_count": len(md.tramites_asignados or []),
        }
        if incluir_padre:
            item["dependencia_padre_id"] = dep.dependencia_padre_id
        return item

    for md in todas:
        dep = md.dependencia
        tj = dep.tipo_jerarquico.value if hasattr(dep.tipo_jerarquico, 'value') else (dep.tipo_jerarquico or "SECRETARIA")
        if tj == "SECRETARIA":
            payload = serialize(md)
            payload["direcciones"] = []
            secretarias_por_dep_id[dep.id] = payload
        else:
            direcciones.append((md, dep.dependencia_padre_id))

    direcciones_huerfanas: list[dict] = []
    for md, padre_id in direcciones:
        item = serialize(md)
        if padre_id and padre_id in secretarias_por_dep_id:
            secretarias_por_dep_id[padre_id]["direcciones"].append(item)
        else:
            direcciones_huerfanas.append(item)

    return {
        "secretarias": list(secretarias_por_dep_id.values()),
        "direcciones_huerfanas": direcciones_huerfanas,
    }


# ============ SUGERENCIAS IA: SECRETARIAS / DIRECCIONES ============

class SugerenciaJerarquicaItem(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None


class SugerenciasJerarquicasResponse(BaseModel):
    items: List[SugerenciaJerarquicaItem]
    fuente: str  # "template" | "ia" | "fallback"


# Template estatico que sirve cuando no hay IA configurada o cuando se quiere
# arrancar rapido. Es el "catalogo de organigramas tipicos" municipal argentino.
SECRETARIAS_TEMPLATE: list[SugerenciaJerarquicaItem] = [
    SugerenciaJerarquicaItem(nombre="Secretaria de Gobierno", descripcion="Coordinacion politica e institucional", icono="Landmark", color="#6366f1"),
    SugerenciaJerarquicaItem(nombre="Secretaria de Hacienda", descripcion="Recaudacion, presupuesto y tesoreria", icono="Wallet", color="#10b981"),
    SugerenciaJerarquicaItem(nombre="Secretaria de Obras y Servicios Publicos", descripcion="Infraestructura urbana y servicios", icono="HardHat", color="#f59e0b"),
    SugerenciaJerarquicaItem(nombre="Secretaria de Salud", descripcion="Atencion sanitaria del vecino", icono="HeartPulse", color="#ef4444"),
    SugerenciaJerarquicaItem(nombre="Secretaria de Desarrollo Social", descripcion="Asistencia y politicas sociales", icono="Users", color="#a855f7"),
    SugerenciaJerarquicaItem(nombre="Secretaria de Seguridad", descripcion="Transito, defensa civil, monitoreo", icono="Shield", color="#0ea5e9"),
    SugerenciaJerarquicaItem(nombre="Secretaria de Medio Ambiente", descripcion="Higiene urbana, arbolado, ambiente", icono="Leaf", color="#22c55e"),
]

DIRECCIONES_TEMPLATE_POR_SECRETARIA: dict[str, list[SugerenciaJerarquicaItem]] = {
    "gobierno": [
        SugerenciaJerarquicaItem(nombre="Direccion de Mesa de Entradas", icono="Inbox"),
        SugerenciaJerarquicaItem(nombre="Direccion de Entidades de Bien Publico", icono="HandHeart"),
        SugerenciaJerarquicaItem(nombre="Direccion de Culto", icono="Church"),
        SugerenciaJerarquicaItem(nombre="Direccion de Instituciones Intermedias", icono="Network"),
    ],
    "hacienda": [
        SugerenciaJerarquicaItem(nombre="Direccion de Ingresos Publicos", icono="Receipt"),
        SugerenciaJerarquicaItem(nombre="Direccion de Compras y Suministros", icono="ShoppingCart"),
        SugerenciaJerarquicaItem(nombre="Direccion de Presupuesto", icono="Calculator"),
        SugerenciaJerarquicaItem(nombre="Direccion de Tesoreria", icono="Banknote"),
    ],
    "obras": [
        SugerenciaJerarquicaItem(nombre="Direccion de Catastro", icono="Map"),
        SugerenciaJerarquicaItem(nombre="Direccion de Obras Particulares", icono="HardHat"),
        SugerenciaJerarquicaItem(nombre="Direccion de Redes Pluviales", icono="Droplets"),
        SugerenciaJerarquicaItem(nombre="Direccion de Pavimentacion", icono="Construction"),
    ],
    "salud": [
        SugerenciaJerarquicaItem(nombre="Direccion de Atencion Primaria", icono="Stethoscope"),
        SugerenciaJerarquicaItem(nombre="Direccion de Discapacidad", icono="Accessibility"),
        SugerenciaJerarquicaItem(nombre="Direccion de Epidemiologia", icono="Activity"),
        SugerenciaJerarquicaItem(nombre="Direccion de Zoonosis", icono="Dog"),
    ],
    "desarrollo": [
        SugerenciaJerarquicaItem(nombre="Direccion de Ninez y Adolescencia", icono="Baby"),
        SugerenciaJerarquicaItem(nombre="Direccion de Politicas de Genero", icono="Heart"),
        SugerenciaJerarquicaItem(nombre="Direccion de Asistencia Directa", icono="HandHeart"),
    ],
    "seguridad": [
        SugerenciaJerarquicaItem(nombre="Direccion de Defensa Civil", icono="ShieldAlert"),
        SugerenciaJerarquicaItem(nombre="Direccion de Transito", icono="TrafficCone"),
        SugerenciaJerarquicaItem(nombre="Direccion de Transporte", icono="Bus"),
        SugerenciaJerarquicaItem(nombre="Direccion de Monitoreo", icono="Camera"),
    ],
    "ambiente": [
        SugerenciaJerarquicaItem(nombre="Direccion de Higiene Urbana", icono="Trash2"),
        SugerenciaJerarquicaItem(nombre="Direccion de Arbolado Publico", icono="Trees"),
        SugerenciaJerarquicaItem(nombre="Direccion de Educacion Ambiental", icono="BookOpen"),
    ],
}


def _matchear_template_secretaria(nombre_secretaria: str) -> list[SugerenciaJerarquicaItem]:
    """Mapea el nombre de una secretaria a su set de Direcciones tipicas."""
    n = (nombre_secretaria or "").lower()
    if "obras" in n or "servic" in n or "publ" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["obras"]
    if "hacienda" in n or "econom" in n or "finan" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["hacienda"]
    if "salud" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["salud"]
    if "social" in n or "desarrollo" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["desarrollo"]
    if "segur" in n or "transit" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["seguridad"]
    if "ambient" in n or "ecolog" in n or "verde" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["ambiente"]
    if "gobier" in n or "institu" in n:
        return DIRECCIONES_TEMPLATE_POR_SECRETARIA["gobierno"]
    return []


class SugerirJerarquicasRequest(BaseModel):
    """
    Pide sugerencias para Secretarias o Direcciones.
    Si nivel=DIRECCION, hay que mandar `secretaria_nombre` para contextualizar.
    """
    nivel: TipoJerarquicoLiteral
    secretaria_nombre: Optional[str] = None
    municipio_nombre: Optional[str] = None
    excluir_nombres: List[str] = []  # ya cargados, no sugerir duplicados


@router.post("/sugerir-jerarquicas", response_model=SugerenciasJerarquicasResponse)
async def sugerir_jerarquicas(
    data: SugerirJerarquicasRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve sugerencias de Secretarias o Direcciones para precargar la pantalla
    de configuracion. Usa IA si esta configurada (Groq/Gemini), sino cae al
    template estatico de organigrama municipal tipico.
    """
    excluir_lower = {n.strip().lower() for n in (data.excluir_nombres or [])}

    def filtrar(items: list[SugerenciaJerarquicaItem]) -> list[SugerenciaJerarquicaItem]:
        return [i for i in items if i.nombre.lower() not in excluir_lower]

    # 1) Intento IA primero (si hay clave) — pero con timeout corto y fallback al template.
    if (settings.GROQ_API_KEY or settings.GEMINI_API_KEY):
        if data.nivel == "SECRETARIA":
            ya_cargadas = ", ".join(data.excluir_nombres) if data.excluir_nombres else "ninguna"
            prompt = f"""Sos un experto en organigramas municipales argentinos.
Sugerí entre 5 y 8 SECRETARIAS tipicas para un municipio argentino{f' como {data.municipio_nombre}' if data.municipio_nombre else ''}.
Ya estan cargadas: {ya_cargadas}. NO repitas ninguna.

Respondé SOLO con JSON valido en este formato exacto:
{{"items": [{{"nombre": "Secretaria de ...", "descripcion": "..."}}]}}"""
        else:
            if not data.secretaria_nombre:
                raise HTTPException(status_code=400, detail="Para sugerir Direcciones se requiere `secretaria_nombre`")
            ya_cargadas = ", ".join(data.excluir_nombres) if data.excluir_nombres else "ninguna"
            prompt = f"""Sos un experto en organigramas municipales argentinos.
Para la "{data.secretaria_nombre}", sugeri entre 3 y 6 DIRECCIONES tipicas que dependan de ella.
Ya estan cargadas: {ya_cargadas}. NO repitas ninguna.

Respondé SOLO con JSON valido en este formato exacto:
{{"items": [{{"nombre": "Direccion de ...", "descripcion": "..."}}]}}"""

        ia_items: Optional[list[SugerenciaJerarquicaItem]] = None
        try:
            if settings.GROQ_API_KEY:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    r = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}", "Content-Type": "application/json"},
                        json={"model": settings.GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 800},
                    )
                    if r.status_code == 200:
                        body = r.json()
                        text_resp = body.get('choices', [{}])[0].get('message', {}).get('content', '')
                        m = re.search(r'\{[\s\S]*\}', text_resp)
                        if m:
                            parsed = json.loads(m.group())
                            ia_items = [SugerenciaJerarquicaItem(**it) for it in parsed.get("items", []) if it.get("nombre")]
        except Exception as e:
            logger.warning(f"[Sugerencias IA] Groq fallo: {e}")

        if not ia_items and settings.GEMINI_API_KEY:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    r = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                        headers={"Content-Type": "application/json"},
                        json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.3, "maxOutputTokens": 800}},
                    )
                    if r.status_code == 200:
                        body = r.json()
                        text_resp = body.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                        m = re.search(r'\{[\s\S]*\}', text_resp)
                        if m:
                            parsed = json.loads(m.group())
                            ia_items = [SugerenciaJerarquicaItem(**it) for it in parsed.get("items", []) if it.get("nombre")]
            except Exception as e:
                logger.warning(f"[Sugerencias IA] Gemini fallo: {e}")

        if ia_items:
            return SugerenciasJerarquicasResponse(items=filtrar(ia_items), fuente="ia")

    # 2) Fallback al template estatico
    if data.nivel == "SECRETARIA":
        return SugerenciasJerarquicasResponse(items=filtrar(SECRETARIAS_TEMPLATE), fuente="template")

    if not data.secretaria_nombre:
        raise HTTPException(status_code=400, detail="Para sugerir Direcciones se requiere `secretaria_nombre`")
    matched = _matchear_template_secretaria(data.secretaria_nombre)
    return SugerenciasJerarquicasResponse(items=filtrar(matched), fuente="template")


# ============ HABILITAR DIRECCION DE UNA SECRETARIA YA HABILITADA ============

class CrearDireccionMunicipioRequest(BaseModel):
    """
    Crea una Direccion (en el catalogo global, si no existe) y la habilita
    para el municipio del usuario, colgando de la Secretaria indicada (que ya
    debe estar habilitada para el municipio).
    """
    municipio_dependencia_padre_id: int  # ID de la fila MunicipioDependencia de la Secretaria padre
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = "Building2"
    color: Optional[str] = None
    tipo_gestion: TipoGestionLiteral = "AMBOS"


@router.post("/municipio-direcciones", response_model=MunicipioDependenciaListResponse, status_code=status.HTTP_201_CREATED)
async def crear_direccion_para_municipio(
    data: CrearDireccionMunicipioRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Crea una Direccion bajo una Secretaria ya habilitada en el municipio.
    Si una Direccion con ese nombre ya existe en el catalogo, la reutiliza.
    """
    if current_user.rol not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    if not current_user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    municipio_id = current_user.municipio_id

    # 1) Validar que la Secretaria padre exista para este municipio.
    padre_q = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(
            MunicipioDependencia.id == data.municipio_dependencia_padre_id,
            MunicipioDependencia.municipio_id == municipio_id,
        )
    )
    md_padre = padre_q.scalar_one_or_none()
    if not md_padre:
        raise HTTPException(status_code=404, detail="Secretaria padre no encontrada para tu municipio")

    padre_tj = md_padre.dependencia.tipo_jerarquico.value if hasattr(md_padre.dependencia.tipo_jerarquico, 'value') else md_padre.dependencia.tipo_jerarquico
    if padre_tj != "SECRETARIA":
        raise HTTPException(status_code=400, detail="La dependencia padre no es una Secretaria")

    # 2) Buscar/crear la Direccion en el catalogo global.
    dep_q = await db.execute(select(Dependencia).where(Dependencia.nombre == data.nombre))
    dep_existente = dep_q.scalar_one_or_none()

    if dep_existente:
        dependencia = dep_existente
        # Si existe pero su padre no coincide, lo dejamos tal cual: es template global.
        # El vinculo per-municipio lo va a manejar MunicipioDependencia.
    else:
        codigo = (data.nombre.upper()
                  .replace(" ", "_")
                  .replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
                  .replace("Ñ", "N"))[:50]
        dependencia = Dependencia(
            nombre=data.nombre,
            codigo=codigo,
            descripcion=data.descripcion,
            tipo_gestion=data.tipo_gestion,
            tipo_jerarquico="DIRECCION",
            dependencia_padre_id=md_padre.dependencia_id,
            color=data.color or md_padre.dependencia.color or "#6366f1",
            icono=data.icono or "Building2",
            orden=0,
        )
        db.add(dependencia)
        await db.flush()

    # 3) Habilitarla para el municipio si todavia no esta.
    md_q = await db.execute(
        select(MunicipioDependencia).where(
            MunicipioDependencia.municipio_id == municipio_id,
            MunicipioDependencia.dependencia_id == dependencia.id,
        )
    )
    md = md_q.scalar_one_or_none()
    if not md:
        md = MunicipioDependencia(
            municipio_id=municipio_id,
            dependencia_id=dependencia.id,
            activo=True,
            orden=0,
        )
        db.add(md)
        await db.flush()

    await db.commit()
    await db.refresh(md)

    return MunicipioDependenciaListResponse(
        id=md.id,
        municipio_id=md.municipio_id,
        dependencia_id=dependencia.id,
        nombre=dependencia.nombre,
        codigo=dependencia.codigo,
        tipo_gestion=dependencia.tipo_gestion.value if hasattr(dependencia.tipo_gestion, 'value') else str(dependencia.tipo_gestion),
        tipo_jerarquico="DIRECCION",
        dependencia_padre_id=dependencia.dependencia_padre_id,
        activo=md.activo,
        orden=md.orden,
        color=dependencia.color or "#6366f1",
        icono=dependencia.icono or "Building2",
    )
