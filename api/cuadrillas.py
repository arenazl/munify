from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.cuadrilla import Cuadrilla
from models.categoria import Categoria
from models.user import User
from schemas.cuadrilla import CuadrillaCreate, CuadrillaUpdate, CuadrillaResponse

router = APIRouter()

@router.get("/", response_model=List[CuadrillaResponse])
async def get_cuadrillas(
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    query = select(Cuadrilla).options(
        selectinload(Cuadrilla.miembros),
        selectinload(Cuadrilla.categorias),
        selectinload(Cuadrilla.categoria_principal)
    ).where(Cuadrilla.municipio_id == current_user.municipio_id)
    if activo is not None:
        query = query.where(Cuadrilla.activo == activo)
    query = query.order_by(Cuadrilla.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{cuadrilla_id}", response_model=CuadrillaResponse)
async def get_cuadrilla(
    cuadrilla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla_id)
    )
    cuadrilla = result.scalar_one_or_none()
    if not cuadrilla:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")
    return cuadrilla

@router.post("/", response_model=CuadrillaResponse)
async def create_cuadrilla(
    data: CuadrillaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Extraer categoria_ids antes de crear el modelo
    categoria_ids = data.categoria_ids or []
    create_data = data.model_dump(exclude={'categoria_ids'})

    cuadrilla = Cuadrilla(**create_data, municipio_id=current_user.municipio_id)

    # Agregar categorias si se proporcionan
    if categoria_ids:
        result = await db.execute(
            select(Categoria).where(Categoria.id.in_(categoria_ids))
        )
        categorias = result.scalars().all()
        cuadrilla.categorias = list(categorias)

    db.add(cuadrilla)
    await db.commit()

    # Recargar con relaciones
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla.id)
    )
    return result.scalar_one()

@router.put("/{cuadrilla_id}", response_model=CuadrillaResponse)
async def update_cuadrilla(
    cuadrilla_id: int,
    data: CuadrillaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla_id)
    )
    cuadrilla = result.scalar_one_or_none()
    if not cuadrilla:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")

    update_data = data.model_dump(exclude_unset=True)

    # Manejar categoria_ids por separado
    if 'categoria_ids' in update_data:
        categoria_ids = update_data.pop('categoria_ids')
        if categoria_ids is not None:
            result = await db.execute(
                select(Categoria).where(Categoria.id.in_(categoria_ids))
            )
            categorias = result.scalars().all()
            cuadrilla.categorias = list(categorias)

    # Actualizar campos normales
    for key, value in update_data.items():
        setattr(cuadrilla, key, value)

    await db.commit()

    # Recargar con relaciones
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla_id)
    )
    return result.scalar_one()

@router.delete("/{cuadrilla_id}")
async def delete_cuadrilla(
    cuadrilla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(select(Cuadrilla).where(Cuadrilla.id == cuadrilla_id))
    cuadrilla = result.scalar_one_or_none()
    if not cuadrilla:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")

    cuadrilla.activo = False
    await db.commit()
    return {"message": "Cuadrilla desactivada"}
