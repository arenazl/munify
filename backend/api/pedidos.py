from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime

from core.database import get_db
from core.security import get_current_user, require_roles
from models.pedido import Pedido
from models.user import User
from models.enums import RolUsuario
from schemas.pedido import PedidoCreate, PedidoUpdate, PedidoResponse

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


@router.get("", response_model=List[PedidoResponse])
async def get_pedidos(
    request: Request,
    activo: Optional[bool] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener pedidos del municipio con filtros opcionales de fecha"""
    municipio_id = get_effective_municipio_id(request, current_user)

    query = select(Pedido).where(Pedido.municipio_id == municipio_id)

    # Filtro por activo
    if activo is not None:
        query = query.where(Pedido.activo == activo)

    # Filtro por rango de fechas
    if fecha_desde:
        try:
            desde = datetime.fromisoformat(fecha_desde).date()
            query = query.where(Pedido.fecha >= desde)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha_desde inválido. Use formato ISO (YYYY-MM-DD)")

    if fecha_hasta:
        try:
            hasta = datetime.fromisoformat(fecha_hasta).date()
            query = query.where(Pedido.fecha <= hasta)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha_hasta inválido. Use formato ISO (YYYY-MM-DD)")

    query = query.order_by(Pedido.fecha.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{pedido_id}", response_model=PedidoResponse)
async def get_pedido(
    request: Request,
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener un pedido específico"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Pedido)
        .where(Pedido.id == pedido_id)
        .where(Pedido.municipio_id == municipio_id)
    )
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return pedido


@router.post("", response_model=PedidoResponse)
async def create_pedido(
    request: Request,
    data: PedidoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Crear un nuevo pedido"""
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validar que el municipio_id del pedido coincida con el del usuario
    if data.municipio_id != municipio_id:
        raise HTTPException(
            status_code=403,
            detail="No puede crear pedidos para otro municipio"
        )

    pedido = Pedido(**data.model_dump())
    db.add(pedido)
    await db.commit()
    await db.refresh(pedido)
    return pedido


@router.put("/{pedido_id}", response_model=PedidoResponse)
async def update_pedido(
    request: Request,
    pedido_id: int,
    data: PedidoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Actualizar un pedido"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Pedido)
        .where(Pedido.id == pedido_id)
        .where(Pedido.municipio_id == municipio_id)
    )
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pedido, key, value)

    await db.commit()
    await db.refresh(pedido)
    return pedido


@router.delete("/{pedido_id}")
async def delete_pedido(
    request: Request,
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Desactivar un pedido (soft delete)"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Pedido)
        .where(Pedido.id == pedido_id)
        .where(Pedido.municipio_id == municipio_id)
    )
    pedido = result.scalar_one_or_none()
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    pedido.activo = False
    await db.commit()
    return {"message": "Pedido desactivado"}
