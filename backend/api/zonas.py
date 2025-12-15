from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.zona import Zona
from models.user import User
from models.enums import RolUsuario
from schemas.zona import ZonaCreate, ZonaUpdate, ZonaResponse

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


@router.get("/", response_model=List[ZonaResponse])
async def get_zonas(
    request: Request,
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(Zona).where(Zona.municipio_id == municipio_id)
    if activo is not None:
        query = query.where(Zona.activo == activo)
    query = query.order_by(Zona.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{zona_id}", response_model=ZonaResponse)
async def get_zona(
    request: Request,
    zona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona)
        .where(Zona.id == zona_id)
        .where(Zona.municipio_id == municipio_id)
    )
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    return zona

@router.post("/", response_model=ZonaResponse)
async def create_zona(
    request: Request,
    data: ZonaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona).where(
            Zona.nombre == data.nombre,
            Zona.municipio_id == municipio_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una zona con ese nombre")

    zona = Zona(**data.model_dump(), municipio_id=municipio_id)
    db.add(zona)
    await db.commit()
    await db.refresh(zona)
    return zona

@router.put("/{zona_id}", response_model=ZonaResponse)
async def update_zona(
    request: Request,
    zona_id: int,
    data: ZonaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona)
        .where(Zona.id == zona_id)
        .where(Zona.municipio_id == municipio_id)
    )
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(zona, key, value)

    await db.commit()
    await db.refresh(zona)
    return zona

@router.delete("/{zona_id}")
async def delete_zona(
    request: Request,
    zona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    result = await db.execute(
        select(Zona)
        .where(Zona.id == zona_id)
        .where(Zona.municipio_id == municipio_id)
    )
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    zona.activo = False
    await db.commit()
    return {"message": "Zona desactivada"}
