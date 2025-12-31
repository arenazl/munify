from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.categoria import Categoria
from models.user import User
from models.enums import RolUsuario
from schemas.categoria import CategoriaCreate, CategoriaUpdate, CategoriaResponse

router = APIRouter()


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


@router.get("", response_model=List[CategoriaResponse])
async def get_categorias(
    request: Request,
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(Categoria).where(Categoria.municipio_id == municipio_id)
    if activo is not None:
        query = query.where(Categoria.activo == activo)
    query = query.order_by(Categoria.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{categoria_id}", response_model=CategoriaResponse)
async def get_categoria(
    request: Request,
    categoria_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Categoria)
        .where(Categoria.id == categoria_id)
        .where(Categoria.municipio_id == municipio_id)
    )
    categoria = result.scalar_one_or_none()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return categoria

@router.post("", response_model=CategoriaResponse)
async def create_categoria(
    request: Request,
    data: CategoriaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    # Verificar nombre único en el municipio
    result = await db.execute(
        select(Categoria).where(
            Categoria.nombre == data.nombre,
            Categoria.municipio_id == municipio_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    categoria = Categoria(**data.model_dump(), municipio_id=municipio_id)
    db.add(categoria)
    await db.commit()
    await db.refresh(categoria)
    return categoria

@router.put("/{categoria_id}", response_model=CategoriaResponse)
async def update_categoria(
    request: Request,
    categoria_id: int,
    data: CategoriaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Categoria)
        .where(Categoria.id == categoria_id)
        .where(Categoria.municipio_id == municipio_id)
    )
    categoria = result.scalar_one_or_none()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(categoria, key, value)

    await db.commit()
    await db.refresh(categoria)
    return categoria

@router.delete("/{categoria_id}")
async def delete_categoria(
    request: Request,
    categoria_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Categoria)
        .where(Categoria.id == categoria_id)
        .where(Categoria.municipio_id == municipio_id)
    )
    categoria = result.scalar_one_or_none()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    categoria.activo = False
    await db.commit()
    return {"message": "Categoría desactivada"}
