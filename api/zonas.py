from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.zona import Zona
from models.user import User
from schemas.zona import ZonaCreate, ZonaUpdate, ZonaResponse

router = APIRouter()

@router.get("/", response_model=List[ZonaResponse])
async def get_zonas(
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Zona).where(Zona.municipio_id == current_user.municipio_id)
    if activo is not None:
        query = query.where(Zona.activo == activo)
    query = query.order_by(Zona.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{zona_id}", response_model=ZonaResponse)
async def get_zona(
    zona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Zona).where(Zona.id == zona_id))
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    return zona

@router.post("/", response_model=ZonaResponse)
async def create_zona(
    data: ZonaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(
        select(Zona).where(
            Zona.nombre == data.nombre,
            Zona.municipio_id == current_user.municipio_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una zona con ese nombre")

    zona = Zona(**data.model_dump(), municipio_id=current_user.municipio_id)
    db.add(zona)
    await db.commit()
    await db.refresh(zona)
    return zona

@router.put("/{zona_id}", response_model=ZonaResponse)
async def update_zona(
    zona_id: int,
    data: ZonaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(select(Zona).where(Zona.id == zona_id))
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
    zona_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(select(Zona).where(Zona.id == zona_id))
    zona = result.scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=404, detail="Zona no encontrada")

    zona.activo = False
    await db.commit()
    return {"message": "Zona desactivada"}
