"""ABM de cajas/fondos + endpoints de movimientos (ingresos/egresos)."""
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja, User, RolUsuario,
)
from schemas.tesoreria_extra import (
    CajaCreate, CajaUpdate, CajaResponse,
    MovimientoCajaCreate, MovimientoCajaResponse,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


async def _enrich_caja_response(db: AsyncSession, caja: TesoreriaCaja) -> CajaResponse:
    """Carga totales de ingresos/egresos y calcula saldo actual."""
    rows = (await db.execute(
        select(TesoreriaMovimientoCaja.tipo, func.coalesce(func.sum(TesoreriaMovimientoCaja.monto), 0))
        .where(TesoreriaMovimientoCaja.caja_id == caja.id)
        .group_by(TesoreriaMovimientoCaja.tipo)
    )).all()
    ingresos = Decimal(0)
    egresos = Decimal(0)
    for tipo, total in rows:
        tipo_val = tipo.value if hasattr(tipo, 'value') else tipo
        if tipo_val == 'ingreso':
            ingresos = Decimal(total)
        else:
            egresos = Decimal(total)
    saldo = Decimal(caja.saldo_inicial or 0) + ingresos - egresos
    resp = CajaResponse.model_validate(caja)
    resp.total_ingresos = ingresos
    resp.total_egresos = egresos
    resp.saldo_actual = saldo
    return resp


@router.get("", response_model=List[CajaResponse])
async def list_cajas(
    request: Request,
    activo: Optional[bool] = True,
    include_saldos: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(TesoreriaCaja).where(TesoreriaCaja.municipio_id == muni_id)
    if activo is not None:
        q = q.where(TesoreriaCaja.activo == activo)
    q = q.order_by(TesoreriaCaja.orden, TesoreriaCaja.nombre)
    cajas = (await db.execute(q)).scalars().all()
    if include_saldos:
        return [await _enrich_caja_response(db, c) for c in cajas]
    return [CajaResponse.model_validate(c) for c in cajas]


@router.post("", response_model=CajaResponse, status_code=201)
async def create_caja(
    payload: CajaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    caja = TesoreriaCaja(municipio_id=muni_id, **payload.model_dump())
    db.add(caja)
    await db.commit()
    await db.refresh(caja)
    return await _enrich_caja_response(db, caja)


@router.put("/{caja_id}", response_model=CajaResponse)
async def update_caja(
    caja_id: int,
    payload: CajaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    caja = (await db.execute(
        select(TesoreriaCaja).where(TesoreriaCaja.id == caja_id, TesoreriaCaja.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(caja, k, v)
    await db.commit()
    await db.refresh(caja)
    return await _enrich_caja_response(db, caja)


@router.delete("/{caja_id}")
async def delete_caja(
    caja_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    caja = (await db.execute(
        select(TesoreriaCaja).where(TesoreriaCaja.id == caja_id, TesoreriaCaja.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not caja:
        raise HTTPException(404, "Caja no encontrada")
    caja.activo = False
    await db.commit()
    return {"ok": True, "id": caja_id}


# ============================================================
# Movimientos (ingresos / egresos manuales)
# ============================================================

@router.get("/{caja_id}/movimientos", response_model=List[MovimientoCajaResponse])
async def list_movimientos(
    caja_id: int,
    request: Request,
    tipo: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = (
        select(TesoreriaMovimientoCaja, TesoreriaCaja.nombre)
        .join(TesoreriaCaja, TesoreriaCaja.id == TesoreriaMovimientoCaja.caja_id)
        .where(
            TesoreriaMovimientoCaja.municipio_id == muni_id,
            TesoreriaMovimientoCaja.caja_id == caja_id,
        )
    )
    if tipo:
        q = q.where(TesoreriaMovimientoCaja.tipo == tipo)
    q = q.order_by(TesoreriaMovimientoCaja.fecha.desc()).limit(limit)
    rows = (await db.execute(q)).all()
    out = []
    for mov, caja_nombre in rows:
        r = MovimientoCajaResponse.model_validate(mov)
        r.caja_nombre = caja_nombre
        out.append(r)
    return out


@router.post("/movimientos", response_model=MovimientoCajaResponse, status_code=201)
async def create_movimiento(
    payload: MovimientoCajaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea un movimiento manual (ingreso o egreso no vinculado a un gasto)."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    # Validar que la caja sea del muni
    caja = (await db.execute(
        select(TesoreriaCaja).where(
            TesoreriaCaja.id == payload.caja_id, TesoreriaCaja.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not caja:
        raise HTTPException(422, "Caja invalida")

    mov = TesoreriaMovimientoCaja(municipio_id=muni_id, **payload.model_dump())
    db.add(mov)
    await db.commit()
    await db.refresh(mov)
    resp = MovimientoCajaResponse.model_validate(mov)
    resp.caja_nombre = caja.nombre
    return resp


@router.delete("/movimientos/{mov_id}")
async def delete_movimiento(
    mov_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    mov = (await db.execute(
        select(TesoreriaMovimientoCaja).where(
            TesoreriaMovimientoCaja.id == mov_id,
            TesoreriaMovimientoCaja.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not mov:
        raise HTTPException(404, "Movimiento no encontrado")
    await db.delete(mov)
    await db.commit()
    return {"ok": True, "id": mov_id}
