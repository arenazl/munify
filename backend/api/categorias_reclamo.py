"""
API CRUD per-municipio para Categorías de Reclamo.

Cada municipio es dueño de sus categorías. No hay catálogo global ni
endpoints de "habilitar/deshabilitar". El admin las crea/edita/borra
libremente. Al crear el municipio se siembran 10 categorías default
(ver `services/categorias_seed.py`).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.categoria_reclamo import CategoriaReclamo
from models.reclamo import Reclamo
from models.user import User
from models.enums import RolUsuario
from schemas.categoria_reclamo import (
    CategoriaReclamoCreate,
    CategoriaReclamoUpdate,
    CategoriaReclamoResponse,
)

from core.tenancy import get_effective_municipio_id, resolve_municipio_id  # noqa: E402

router = APIRouter()


@router.get("", response_model=List[CategoriaReclamoResponse])
async def listar_categorias_reclamo(
    request: Request,
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista las categorías de reclamo del municipio actual.
    En modo Global (superadmin sin muni) devuelve [] sin 400.

    Catálogo único (OT + reclamos): las categorías `interna=True` (Preventivo,
    Mantenimiento, Obra) clasifican trabajo del municipio pero NO se le ofrecen
    al vecino. Este endpoint es de doble uso — lo consume el ABM de admin y el
    formulario del vecino logueado — así que bifurca por rol: el VECINO recibe
    solo las públicas; gestión (admin/supervisor/empleado) las ve todas, que es
    lo que necesita el Sheet de la OT para clasificar trabajo interno.
    """
    municipio_id = resolve_municipio_id(request, current_user)
    if not municipio_id:
        return []

    query = select(CategoriaReclamo).where(
        CategoriaReclamo.municipio_id == municipio_id
    )
    if current_user.rol == RolUsuario.VECINO:
        query = query.where(CategoriaReclamo.interna == False)  # noqa: E712
    if activo is not None:
        query = query.where(CategoriaReclamo.activo == activo)
    query = query.order_by(CategoriaReclamo.orden, CategoriaReclamo.nombre)

    result = await db.execute(query)
    categorias = result.scalars().all()

    # Uso de cada categoría (cuántos reclamos la referencian). UNA sola query
    # agrupada para todas, no una por fila: con 17 categorías, la versión
    # ingenua son 17 viajes a una base que está en otro continente.
    #
    # Lo consume la pantalla de Configuración: es lo que dice si una categoría
    # se puede borrar y cuál concentra el trabajo. Sin este dato, la pantalla
    # muestra "—" en vez de estimar (un número inventado ahí termina en
    # alguien borrando algo que sí se usaba).
    if categorias:
        conteo = await db.execute(
            select(Reclamo.categoria_id, func.count(Reclamo.id))
            .where(Reclamo.categoria_id.in_([c.id for c in categorias]))
            .group_by(Reclamo.categoria_id)
        )
        usos = dict(conteo.all())
        for cat in categorias:
            # Atributo suelto: el schema lo lee con from_attributes y el modelo
            # no necesita una columna que no existe en la base.
            cat.en_uso = usos.get(cat.id, 0)

    return categorias


@router.get("/{categoria_id}", response_model=CategoriaReclamoResponse)
async def get_categoria_reclamo(
    request: Request,
    categoria_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(CategoriaReclamo).where(
            CategoriaReclamo.id == categoria_id,
            CategoriaReclamo.municipio_id == municipio_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return cat


@router.post("", response_model=CategoriaReclamoResponse, status_code=201)
async def crear_categoria_reclamo(
    request: Request,
    data: CategoriaReclamoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validar nombre único por municipio
    dupe = await db.execute(
        select(CategoriaReclamo).where(
            CategoriaReclamo.municipio_id == municipio_id,
            func.lower(CategoriaReclamo.nombre) == data.nombre.lower(),
        )
    )
    if dupe.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una categoría con el nombre '{data.nombre}'",
        )

    nueva = CategoriaReclamo(
        municipio_id=municipio_id,
        nombre=data.nombre,
        descripcion=data.descripcion,
        icono=data.icono,
        color=data.color,
        tiempo_resolucion_estimado=data.tiempo_resolucion_estimado,
        prioridad_default=data.prioridad_default,
        orden=data.orden,
        interna=data.interna,
        activo=True,
    )
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva


@router.put("/{categoria_id}", response_model=CategoriaReclamoResponse)
async def actualizar_categoria_reclamo(
    request: Request,
    categoria_id: int,
    data: CategoriaReclamoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(CategoriaReclamo).where(
            CategoriaReclamo.id == categoria_id,
            CategoriaReclamo.municipio_id == municipio_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    update_data = data.model_dump(exclude_unset=True)

    # Validar duplicado de nombre si cambió
    if "nombre" in update_data and update_data["nombre"].lower() != cat.nombre.lower():
        dupe = await db.execute(
            select(CategoriaReclamo).where(
                CategoriaReclamo.municipio_id == municipio_id,
                func.lower(CategoriaReclamo.nombre) == update_data["nombre"].lower(),
                CategoriaReclamo.id != categoria_id,
            )
        )
        if dupe.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe otra categoría con el nombre '{update_data['nombre']}'",
            )

    for k, v in update_data.items():
        setattr(cat, k, v)

    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/{categoria_id}", status_code=204)
async def eliminar_categoria_reclamo(
    request: Request,
    categoria_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Elimina una categoría de reclamo. Si tiene reclamos asociados, hace
    soft delete (activo=false) en lugar de hard delete para no romper FK.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(CategoriaReclamo).where(
            CategoriaReclamo.id == categoria_id,
            CategoriaReclamo.municipio_id == municipio_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    # ¿Tiene reclamos asociados?
    count_q = await db.execute(
        select(func.count(Reclamo.id)).where(Reclamo.categoria_id == categoria_id)
    )
    cnt = count_q.scalar() or 0

    if cnt > 0:
        cat.activo = False
        await db.commit()
        return  # 204
    else:
        await db.delete(cat)
        await db.commit()
        return
