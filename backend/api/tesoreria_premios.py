"""ABM del catalogo de premios (plus/bonificaciones variables) que se
pueden aplicar al ejecutar un pago programado. Multi-tenant.

Ejemplos de premio:
  - Presentismo: $50.000
  - Trabajo extra fin de semana: $30.000
  - Bonus puntualidad: $15.000

El monto del premio se snapshotea en cada pago (TesoreriaMovimientoCaja
historico). Editar un premio NO afecta gastos historicos.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import TesoreriaPremio, User, RolUsuario
from schemas.tesoreria_extra import PremioCreate, PremioUpdate, PremioResponse

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


@router.get("", response_model=List[PremioResponse])
async def list_premios(
    request: Request,
    activo: Optional[bool] = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(TesoreriaPremio).where(TesoreriaPremio.municipio_id == muni_id)
    if activo is not None:
        q = q.where(TesoreriaPremio.activo == activo)
    q = q.order_by(TesoreriaPremio.orden.asc(), TesoreriaPremio.nombre.asc())
    return list((await db.execute(q)).scalars().all())


@router.post("", response_model=PremioResponse, status_code=201)
async def create_premio(
    payload: PremioCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = TesoreriaPremio(municipio_id=muni_id, **payload.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.put("/{premio_id}", response_model=PremioResponse)
async def update_premio(
    premio_id: int,
    payload: PremioUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = (await db.execute(
        select(TesoreriaPremio).where(
            TesoreriaPremio.id == premio_id,
            TesoreriaPremio.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Premio no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{premio_id}")
async def delete_premio(
    premio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete (marca activo=false). Los pagos historicos que aplicaron
    este premio no se ven afectados — el monto ya quedo snapshoteado en
    el gasto."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = (await db.execute(
        select(TesoreriaPremio).where(
            TesoreriaPremio.id == premio_id,
            TesoreriaPremio.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Premio no encontrado")
    p.activo = False
    await db.commit()
    return {"ok": True, "id": premio_id}
