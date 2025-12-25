from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from core.database import get_db
from core.security import get_current_user, require_roles
from models.user import User
from models.noticia import Noticia
from schemas.noticia import NoticiaCreate, NoticiaUpdate, NoticiaResponse

router = APIRouter()

@router.get("/publico", response_model=List[NoticiaResponse])
async def get_noticias_publico(
    municipio_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Obtener noticias activas del municipio (público)"""
    result = await db.execute(
        select(Noticia)
        .where(Noticia.municipio_id == municipio_id, Noticia.activo == True)
        .order_by(Noticia.created_at.desc())
        .limit(5)
    )
    noticias = result.scalars().all()
    return noticias

@router.get("/", response_model=List[NoticiaResponse])
async def get_noticias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener todas las noticias del municipio (admin)"""
    result = await db.execute(
        select(Noticia)
        .where(Noticia.municipio_id == current_user.municipio_id)
        .order_by(Noticia.created_at.desc())
    )
    noticias = result.scalars().all()
    return noticias

@router.post("/", response_model=NoticiaResponse)
async def create_noticia(
    data: NoticiaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Crear nueva noticia"""
    noticia = Noticia(**data.model_dump())
    db.add(noticia)
    await db.commit()
    await db.refresh(noticia)
    return noticia

@router.patch("/{noticia_id}", response_model=NoticiaResponse)
async def update_noticia(
    noticia_id: int,
    data: NoticiaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Actualizar noticia"""
    result = await db.execute(select(Noticia).where(Noticia.id == noticia_id))
    noticia = result.scalar_one_or_none()

    if not noticia:
        raise HTTPException(status_code=404, detail="Noticia no encontrada")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(noticia, field, value)

    await db.commit()
    await db.refresh(noticia)
    return noticia

@router.delete("/{noticia_id}")
async def delete_noticia(
    noticia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Eliminar noticia"""
    result = await db.execute(select(Noticia).where(Noticia.id == noticia_id))
    noticia = result.scalar_one_or_none()

    if not noticia:
        raise HTTPException(status_code=404, detail="Noticia no encontrada")

    await db.delete(noticia)
    await db.commit()
    return {"message": "Noticia eliminada"}
