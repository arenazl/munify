"""API de feature flags por municipio.

GET  /modulos/         -> lista los modulos del municipio actual (publico, sin auth)
GET  /modulos/{nombre} -> estado de un modulo puntual
PUT  /modulos/{nombre} -> activar/desactivar (solo admin)

El frontend usa esto para mostrar/ocultar items del sidebar y bloquear
rutas. Por default un modulo no listado se considera DESACTIVADO.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models import MunicipioModulo, User, RolUsuario
from schemas.tesoreria import ModuloBase, ModuloResponse
from core.tenancy import get_effective_municipio_id, resolve_municipio_id

router = APIRouter()


@router.get("/", response_model=List[ModuloResponse])
async def list_modulos(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todos los modulos configurados del municipio del usuario actual.

    En modo Global (superadmin sin muni resuelto) devuelve [] en lugar de 400
    para no romper el sidebar cross-tenant.
    """
    municipio_id = resolve_municipio_id(request, current_user)
    if not municipio_id:
        return []
    result = await db.execute(
        select(MunicipioModulo).where(MunicipioModulo.municipio_id == municipio_id)
    )
    return result.scalars().all()


@router.get("/{nombre}")
async def get_modulo(
    nombre: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve `{ activo: bool }` para el modulo pedido.
    Si no hay fila, devuelve activo=False (no configurado = desactivado).
    En modo Global devuelve activo=False sin levantar 400.
    """
    municipio_id = resolve_municipio_id(request, current_user)
    if not municipio_id:
        return {"activo": False, "modulo": nombre}
    result = await db.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == municipio_id,
            MunicipioModulo.modulo == nombre,
        )
    )
    row = result.scalar_one_or_none()
    return {"activo": bool(row and row.activo), "modulo": nombre}


@router.put("/{nombre}", response_model=ModuloResponse)
async def upsert_modulo(
    nombre: str,
    payload: ModuloBase,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activar / desactivar un modulo. Solo admin del municipio."""
    if current_user.rol != RolUsuario.ADMIN:
        raise HTTPException(status_code=403, detail="Solo admin puede modificar modulos")

    municipio_id = get_effective_municipio_id(request, current_user)
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Municipio no resuelto")

    result = await db.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == municipio_id,
            MunicipioModulo.modulo == nombre,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = MunicipioModulo(municipio_id=municipio_id, modulo=nombre, activo=payload.activo)
        db.add(row)
    else:
        row.activo = payload.activo
    await db.commit()
    await db.refresh(row)
    return row
