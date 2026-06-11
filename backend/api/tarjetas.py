"""ABM de Tarjetas de Credito (Tesoreria). Entidad de catalogo, analoga a Cajas.
Auth JWT admin|supervisor, scopeado por el municipio del current_user.
Los pagos se asocian a la tarjeta desde el modulo de Pagos (no aca)."""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import User, RolUsuario, TarjetaCredito

router = APIRouter()

MARCAS = ("Visa", "Mastercard", "American Express", "Otra")


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


class TarjetaIn(BaseModel):
    denominacion: str
    marca: str = "Visa"
    ultimos_4: Optional[str] = None
    dia_cierre: Optional[int] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: int = 0
    activo: bool = True


class TarjetaOut(BaseModel):
    id: int
    denominacion: str
    marca: str
    ultimos_4: Optional[str] = None
    dia_cierre: Optional[int] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    orden: int
    activo: bool

    class Config:
        from_attributes = True


def _validar(p: TarjetaIn):
    if not (p.denominacion or "").strip():
        raise HTTPException(400, "La denominacion es obligatoria")
    if p.marca not in MARCAS:
        raise HTTPException(400, f"Marca invalida (use: {', '.join(MARCAS)})")
    if p.dia_cierre is not None and not (1 <= p.dia_cierre <= 31):
        raise HTTPException(400, "El dia de cierre debe ser entre 1 y 31")
    if p.ultimos_4 and (len(p.ultimos_4) > 4 or not p.ultimos_4.isdigit()):
        raise HTTPException(400, "Los ultimos 4 deben ser hasta 4 digitos")


@router.get("/tarjetas", response_model=List[TarjetaOut])
async def listar_tarjetas(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    rows = (await db.execute(
        select(TarjetaCredito)
        .where(TarjetaCredito.municipio_id == muni_id)
        .order_by(TarjetaCredito.orden, TarjetaCredito.denominacion)
    )).scalars().all()
    return rows


@router.post("/tarjetas", response_model=TarjetaOut)
async def crear_tarjeta(
    payload: TarjetaIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    _validar(payload)
    t = TarjetaCredito(municipio_id=muni_id, **payload.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.put("/tarjetas/{tarjeta_id}", response_model=TarjetaOut)
async def editar_tarjeta(
    tarjeta_id: int,
    payload: TarjetaIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    _validar(payload)
    t = (await db.execute(
        select(TarjetaCredito).where(
            TarjetaCredito.id == tarjeta_id,
            TarjetaCredito.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarjeta no encontrada")
    for k, v in payload.model_dump().items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/tarjetas/{tarjeta_id}")
async def borrar_tarjeta(
    tarjeta_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    t = (await db.execute(
        select(TarjetaCredito).where(
            TarjetaCredito.id == tarjeta_id,
            TarjetaCredito.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarjeta no encontrada")
    await db.delete(t)
    await db.commit()
    return {"ok": True}
