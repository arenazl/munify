"""ABM del catalogo de Retenciones impositivas que aplicar a las OPs.

Multi-tenant: cada muni configura sus propias retenciones (porcentaje y
nombre dependen de convenios locales y la jurisdiccion provincial).

Ejemplos:
  - Tasa Municipal de Comercio: 1.0%
  - Ganancias (AFIP): 2.0%
  - IIBB Provincial: 3.0%
  - SUSS (Sistema Unico de Seguridad Social): 1.0%

Al aplicar una retencion a una OP, el porcentaje se snapshotea en
ordenes_pago.retenciones (JSON). Editar el catalogo despues NO altera
las OPs historicas.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import ContaduriaRetencion, User, RolUsuario
from schemas.retencion import RetencionCreate, RetencionUpdate, RetencionResponse

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


@router.get("", response_model=List[RetencionResponse])
async def list_retenciones(
    request: Request,
    activo: Optional[bool] = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(ContaduriaRetencion).where(ContaduriaRetencion.municipio_id == muni_id)
    if activo is not None:
        q = q.where(ContaduriaRetencion.activo == activo)
    q = q.order_by(ContaduriaRetencion.orden.asc(), ContaduriaRetencion.nombre.asc())
    return list((await db.execute(q)).scalars().all())


@router.post("", response_model=RetencionResponse, status_code=201)
async def create_retencion(
    payload: RetencionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    r = ContaduriaRetencion(municipio_id=muni_id, **payload.model_dump())
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


@router.put("/{retencion_id}", response_model=RetencionResponse)
async def update_retencion(
    retencion_id: int,
    payload: RetencionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    r = (await db.execute(
        select(ContaduriaRetencion).where(
            ContaduriaRetencion.id == retencion_id,
            ContaduriaRetencion.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Retencion no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    await db.commit()
    await db.refresh(r)
    return r


@router.delete("/{retencion_id}")
async def delete_retencion(
    retencion_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete. Las OPs historicas que aplicaron esta retencion no
    se ven afectadas — el porcentaje y monto ya quedaron snapshoteados."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    r = (await db.execute(
        select(ContaduriaRetencion).where(
            ContaduriaRetencion.id == retencion_id,
            ContaduriaRetencion.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Retencion no encontrada")
    r.activo = False
    await db.commit()
    return {"ok": True, "id": retencion_id}
