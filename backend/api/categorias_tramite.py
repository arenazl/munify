"""
API CRUD per-municipio para Categorías de Trámite.

Cada municipio es dueño de sus categorías. Reemplaza al modelo viejo
`TipoTramite` (catálogo global). Al crear el municipio se siembran 10
categorías default (ver `services/categorias_seed.py`).
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.categoria_tramite import CategoriaTramite
from models.tramite import Tramite
from models.user import User
from models.enums import RolUsuario
from schemas.categoria_tramite import (
    CategoriaTramiteCreate,
    CategoriaTramiteUpdate,
    CategoriaTramiteResponse,
)

from core.tenancy import get_effective_municipio_id  # noqa: E402

router = APIRouter()


@router.get("", response_model=List[CategoriaTramiteResponse])
async def listar_categorias_tramite(
    request: Request,
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista las categorías de trámite del municipio actual."""
    municipio_id = get_effective_municipio_id(request, current_user)

    query = select(CategoriaTramite).where(
        CategoriaTramite.municipio_id == municipio_id
    )
    if activo is not None:
        query = query.where(CategoriaTramite.activo == activo)
    query = query.order_by(CategoriaTramite.orden, CategoriaTramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{categoria_id}", response_model=CategoriaTramiteResponse)
async def get_categoria_tramite(
    request: Request,
    categoria_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(CategoriaTramite).where(
            CategoriaTramite.id == categoria_id,
            CategoriaTramite.municipio_id == municipio_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return cat


@router.post("", response_model=CategoriaTramiteResponse, status_code=201)
async def crear_categoria_tramite(
    request: Request,
    data: CategoriaTramiteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    dupe = await db.execute(
        select(CategoriaTramite).where(
            CategoriaTramite.municipio_id == municipio_id,
            func.lower(CategoriaTramite.nombre) == data.nombre.lower(),
        )
    )
    if dupe.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una categoría con el nombre '{data.nombre}'",
        )

    nueva = CategoriaTramite(
        municipio_id=municipio_id,
        nombre=data.nombre,
        descripcion=data.descripcion,
        icono=data.icono,
        color=data.color,
        orden=data.orden,
        activo=True,
    )
    db.add(nueva)
    await db.commit()
    await db.refresh(nueva)
    return nueva


@router.put("/{categoria_id}", response_model=CategoriaTramiteResponse)
async def actualizar_categoria_tramite(
    request: Request,
    categoria_id: int,
    data: CategoriaTramiteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(CategoriaTramite).where(
            CategoriaTramite.id == categoria_id,
            CategoriaTramite.municipio_id == municipio_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    update_data = data.model_dump(exclude_unset=True)

    if "nombre" in update_data and update_data["nombre"].lower() != cat.nombre.lower():
        dupe = await db.execute(
            select(CategoriaTramite).where(
                CategoriaTramite.municipio_id == municipio_id,
                func.lower(CategoriaTramite.nombre) == update_data["nombre"].lower(),
                CategoriaTramite.id != categoria_id,
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
async def eliminar_categoria_tramite(
    request: Request,
    categoria_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
):
    """
    Elimina una categoría de trámite. Si tiene trámites asociados, hace
    soft delete (activo=false) para no romper FK.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(CategoriaTramite).where(
            CategoriaTramite.id == categoria_id,
            CategoriaTramite.municipio_id == municipio_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    count_q = await db.execute(
        select(func.count(Tramite.id)).where(Tramite.categoria_tramite_id == categoria_id)
    )
    cnt = count_q.scalar() or 0

    if cnt > 0:
        cat.activo = False
        await db.commit()
        return
    else:
        await db.delete(cat)
        await db.commit()
        return
