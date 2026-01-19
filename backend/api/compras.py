from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime

from core.database import get_db
from core.security import get_current_user, require_roles
from models.compra import Compra
from models.user import User
from models.enums import RolUsuario
from schemas.compra import CompraCreate, CompraUpdate, CompraResponse

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


@router.get("", response_model=List[CompraResponse])
async def get_compras(
    request: Request,
    activo: Optional[bool] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener compras del municipio con filtros opcionales de fecha"""
    municipio_id = get_effective_municipio_id(request, current_user)

    query = select(Compra).where(Compra.municipio_id == municipio_id)

    # Filtro por activo
    if activo is not None:
        query = query.where(Compra.activo == activo)

    # Filtro por rango de fechas
    if fecha_desde:
        try:
            desde = datetime.fromisoformat(fecha_desde).date()
            query = query.where(Compra.fecha >= desde)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido. Use formato ISO (YYYY-MM-DD)")

    if fecha_hasta:
        try:
            hasta = datetime.fromisoformat(fecha_hasta).date()
            query = query.where(Compra.fecha <= hasta)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha_hasta inválido. Use formato ISO (YYYY-MM-DD)")

    query = query.order_by(Compra.fecha.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{compra_id}", response_model=CompraResponse)
async def get_compra(
    request: Request,
    compra_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener una compra específica"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Compra)
        .where(Compra.id == compra_id)
        .where(Compra.municipio_id == municipio_id)
    )
    compra = result.scalar_one_or_none()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return compra


@router.post("", response_model=CompraResponse)
async def create_compra(
    request: Request,
    data: CompraCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Crear una nueva compra"""
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validar que el municipio_id de la compra coincida con el del usuario
    if data.municipio_id != municipio_id:
        raise HTTPException(
            status_code=403,
            detail="No puede crear compras para otro municipio"
        )

    compra = Compra(**data.model_dump())
    db.add(compra)
    await db.commit()
    await db.refresh(compra)
    return compra


@router.put("/{compra_id}", response_model=CompraResponse)
async def update_compra(
    request: Request,
    compra_id: int,
    data: CompraUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Actualizar una compra"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Compra)
        .where(Compra.id == compra_id)
        .where(Compra.municipio_id == municipio_id)
    )
    compra = result.scalar_one_or_none()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(compra, key, value)

    await db.commit()
    await db.refresh(compra)
    return compra


@router.delete("/{compra_id}")
async def delete_compra(
    request: Request,
    compra_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Desactivar una compra (soft delete)"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Compra)
        .where(Compra.id == compra_id)
        .where(Compra.municipio_id == municipio_id)
    )
    compra = result.scalar_one_or_none()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")

    compra.activo = False
    await db.commit()
    return {"message": "Compra desactivada"}
