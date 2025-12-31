from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.empleado import Empleado
from models.categoria import Categoria
from models.user import User
from schemas.empleado import EmpleadoCreate, EmpleadoUpdate, EmpleadoResponse

router = APIRouter()

@router.get("", response_model=List[EmpleadoResponse])
async def get_empleados(
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    query = select(Empleado).options(
        selectinload(Empleado.miembros),
        selectinload(Empleado.categorias),
        selectinload(Empleado.categoria_principal)
    ).where(Empleado.municipio_id == current_user.municipio_id)
    if activo is not None:
        query = query.where(Empleado.activo == activo)
    query = query.order_by(Empleado.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{empleado_id}", response_model=EmpleadoResponse)
async def get_empleado(
    empleado_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado_id)
        .where(Empleado.municipio_id == current_user.municipio_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    return empleado

@router.post("", response_model=EmpleadoResponse)
async def create_empleado(
    data: EmpleadoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Extraer categoria_ids antes de crear el modelo
    categoria_ids = data.categoria_ids or []
    create_data = data.model_dump(exclude={'categoria_ids'})

    empleado = Empleado(**create_data, municipio_id=current_user.municipio_id)

    # Agregar categorias si se proporcionan (solo del mismo municipio)
    if categoria_ids:
        result = await db.execute(
            select(Categoria).where(
                Categoria.id.in_(categoria_ids),
                Categoria.municipio_id == current_user.municipio_id
            )
        )
        categorias = result.scalars().all()
        empleado.categorias = list(categorias)

    db.add(empleado)
    await db.commit()
    await db.refresh(empleado)

    # Recargar con relaciones
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado.id)
    )
    return result.scalar_one()

@router.put("/{empleado_id}", response_model=EmpleadoResponse)
async def update_empleado(
    empleado_id: int,
    data: EmpleadoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado_id)
        .where(Empleado.municipio_id == current_user.municipio_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # Manejar categoria_ids por separado (solo del mismo municipio)
    if 'categoria_ids' in update_data:
        categoria_ids = update_data.pop('categoria_ids')
        if categoria_ids is not None:
            if categoria_ids:
                result = await db.execute(
                    select(Categoria).where(
                        Categoria.id.in_(categoria_ids),
                        Categoria.municipio_id == current_user.municipio_id
                    )
                )
                categorias = result.scalars().all()
                empleado.categorias = list(categorias)
            else:
                # Si envían lista vacía, limpiar categorías
                empleado.categorias = []

    # Actualizar campos normales
    for key, value in update_data.items():
        setattr(empleado, key, value)

    await db.commit()
    await db.refresh(empleado)

    # Recargar con relaciones
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado_id)
    )
    return result.scalar_one()

@router.delete("/{empleado_id}")
async def delete_empleado(
    empleado_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Empleado)
        .where(Empleado.id == empleado_id)
        .where(Empleado.municipio_id == current_user.municipio_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    empleado.activo = False
    await db.commit()
    return {"message": "Empleado desactivado"}
