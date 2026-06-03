"""ABM del catalogo de Conceptos de Liquidacion (per-muni).

Reemplaza el texto libre del campo `concepto` en pagos programados. El
muni gestiona su lista (Sueldo, Presentismo, Profesional, etc.) y el form
de pago programado los muestra como combo.

Soft-delete: si se desactiva un concepto, los pagos historicos no se ven
afectados (el campo `concepto` del pago programado guarda el string).
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import TesoreriaConceptoLiquidacion, User, RolUsuario
from schemas.concepto_liquidacion import (
    ConceptoLiquidacionCreate, ConceptoLiquidacionUpdate, ConceptoLiquidacionResponse,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


@router.get("", response_model=List[ConceptoLiquidacionResponse])
async def list_conceptos(
    request: Request,
    activo: Optional[bool] = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(TesoreriaConceptoLiquidacion).where(
        TesoreriaConceptoLiquidacion.municipio_id == muni_id
    )
    if activo is not None:
        q = q.where(TesoreriaConceptoLiquidacion.activo == activo)
    q = q.order_by(
        TesoreriaConceptoLiquidacion.orden.asc(),
        TesoreriaConceptoLiquidacion.nombre.asc(),
    )
    return list((await db.execute(q)).scalars().all())


@router.post("", response_model=ConceptoLiquidacionResponse, status_code=201)
async def create_concepto(
    payload: ConceptoLiquidacionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    c = TesoreriaConceptoLiquidacion(municipio_id=muni_id, **payload.model_dump())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@router.put("/{concepto_id}", response_model=ConceptoLiquidacionResponse)
async def update_concepto(
    concepto_id: int,
    payload: ConceptoLiquidacionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    c = (await db.execute(
        select(TesoreriaConceptoLiquidacion).where(
            TesoreriaConceptoLiquidacion.id == concepto_id,
            TesoreriaConceptoLiquidacion.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Concepto no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    return c


@router.delete("/{concepto_id}")
async def delete_concepto(
    concepto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete: los pagos programados que usaban este concepto no se
    ven afectados (el string del concepto queda guardado en el propio
    pago programado)."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    c = (await db.execute(
        select(TesoreriaConceptoLiquidacion).where(
            TesoreriaConceptoLiquidacion.id == concepto_id,
            TesoreriaConceptoLiquidacion.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Concepto no encontrado")
    c.activo = False
    await db.commit()
    return {"ok": True, "id": concepto_id}
