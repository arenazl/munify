"""Admin del sidebar — el superadmin elige que items ver en cada muni.

Flow:
  - Superadmin (admin sin municipio_id) entra a la pantalla de config.
  - Elige un muni del selector.
  - Ve lista de items del sidebar con toggles (el catalogo lo arma el
    frontend desde navigation.ts).
  - Al togglear off un item -> se inserta fila con oculto=True.
  - Al togglear on un item -> se borra la fila.

Para que el sidebar del muni lo respete, hay un endpoint publico (auth
regular) que devuelve la lista de hrefs ocultos del muni del usuario:
  GET /navigation/hrefs-ocultos
"""
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.municipio_sidebar_item import MunicipioSidebarItem


admin_router = APIRouter(prefix="/admin/sidebar-items", tags=["Admin Sidebar"])
public_router = APIRouter(prefix="/navigation", tags=["Navegacion"])


# ============================================================
# Schemas
# ============================================================

class SidebarItemOculto(BaseModel):
    href: str
    updated_at: Optional[str] = None
    updated_by_nombre: Optional[str] = None


class SidebarItemsResponse(BaseModel):
    municipio_id: int
    ocultos: List[SidebarItemOculto]


class UpdateSidebarItemsRequest(BaseModel):
    """Reemplaza la lista completa de hrefs ocultos para el muni."""
    hrefs_ocultos: List[str]


# ============================================================
# Helpers
# ============================================================

def _asegurar_superadmin(user: User) -> None:
    """Solo admins sin municipio (cross-tenant) pueden editar."""
    if user.rol != RolUsuario.ADMIN or user.municipio_id is not None:
        raise HTTPException(
            status_code=403,
            detail="Solo superadmin (admin sin municipio) puede configurar el sidebar",
        )


# ============================================================
# Admin — CRUD (solo superadmin)
# ============================================================

@admin_router.get("/{municipio_id}", response_model=SidebarItemsResponse)
async def get_sidebar_items(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve los hrefs que el superadmin oculto para ese muni."""
    _asegurar_superadmin(current_user)

    from sqlalchemy.orm import selectinload
    q = await db.execute(
        select(MunicipioSidebarItem)
        .options(selectinload(MunicipioSidebarItem.updated_by))
        .where(
            MunicipioSidebarItem.municipio_id == municipio_id,
            MunicipioSidebarItem.oculto == True,  # noqa: E712
        )
    )
    rows = q.scalars().all()
    return SidebarItemsResponse(
        municipio_id=municipio_id,
        ocultos=[
            SidebarItemOculto(
                href=r.href,
                updated_at=r.updated_at.isoformat() if r.updated_at else None,
                updated_by_nombre=(
                    f"{r.updated_by.nombre or ''} {r.updated_by.apellido or ''}".strip()
                    or r.updated_by.email
                    if r.updated_by else None
                ),
            )
            for r in rows
        ],
    )


@admin_router.put("/{municipio_id}")
async def put_sidebar_items(
    municipio_id: int,
    body: UpdateSidebarItemsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reemplaza la lista completa de hrefs ocultos del muni."""
    _asegurar_superadmin(current_user)

    deseados = {h.strip() for h in body.hrefs_ocultos if h and h.strip()}

    # Cargar existentes
    q = await db.execute(
        select(MunicipioSidebarItem).where(MunicipioSidebarItem.municipio_id == municipio_id)
    )
    existentes = {r.href: r for r in q.scalars().all()}

    # A borrar: los que ya no estan en deseados
    to_delete = [h for h in existentes if h not in deseados]
    if to_delete:
        await db.execute(
            delete(MunicipioSidebarItem).where(
                and_(
                    MunicipioSidebarItem.municipio_id == municipio_id,
                    MunicipioSidebarItem.href.in_(to_delete),
                )
            )
        )

    # A insertar: los que no tenian fila
    for href in deseados:
        if href not in existentes:
            db.add(MunicipioSidebarItem(
                municipio_id=municipio_id,
                href=href,
                oculto=True,
                updated_by_user_id=current_user.id,
            ))
        else:
            # Actualizar timestamps + user (opcional pero util)
            existentes[href].updated_at = datetime.utcnow()
            existentes[href].updated_by_user_id = current_user.id

    await db.commit()
    return {"municipio_id": municipio_id, "count": len(deseados)}


# ============================================================
# Publico — el sidebar del usuario lee aca los hrefs ocultos
# ============================================================

@public_router.get("/hrefs-ocultos", response_model=List[str])
async def get_mis_hrefs_ocultos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista de hrefs ocultos para el muni del usuario actual.

    Superadmin (sin municipio) -> lista vacia (no hay config cross-tenant).
    """
    if not current_user.municipio_id:
        return []
    q = await db.execute(
        select(MunicipioSidebarItem.href).where(
            MunicipioSidebarItem.municipio_id == current_user.municipio_id,
            MunicipioSidebarItem.oculto == True,  # noqa: E712
        )
    )
    return [r for (r,) in q.all()]
