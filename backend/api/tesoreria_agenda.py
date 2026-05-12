"""Agenda de pagos programados + ejecucion (crea Gasto real)."""
from datetime import date, timedelta
from calendar import monthrange
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    TesoreriaPagoProgramado, FrecuenciaPago, TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja,
    Contacto, Gasto, GastoCuota, User, RolUsuario,
)
from models.gasto import EstadoGastoCuota
from schemas.tesoreria_extra import (
    PagoProgramadoCreate, PagoProgramadoUpdate, PagoProgramadoResponse,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


def _add_dias(d: date, dias: int) -> date:
    return d + timedelta(days=dias)


def _calcular_proximo_pago(actual: date, frecuencia: FrecuenciaPago, dia_del_mes: int) -> date:
    """Avanza al siguiente periodo segun frecuencia."""
    if frecuencia == FrecuenciaPago.SEMANAL:
        return _add_dias(actual, 7)
    if frecuencia == FrecuenciaPago.QUINCENAL:
        return _add_dias(actual, 14)
    if frecuencia == FrecuenciaPago.MENSUAL:
        meses = 1
    elif frecuencia == FrecuenciaPago.BIMESTRAL:
        meses = 2
    elif frecuencia == FrecuenciaPago.TRIMESTRAL:
        meses = 3
    else:  # ANUAL
        meses = 12
    total = actual.month - 1 + meses
    year = actual.year + total // 12
    month = total % 12 + 1
    last_day = monthrange(year, month)[1]
    return date(year, month, min(dia_del_mes, last_day))


async def _enrich(db: AsyncSession, pp: TesoreriaPagoProgramado) -> PagoProgramadoResponse:
    resp = PagoProgramadoResponse.model_validate(pp)
    # Cargar nombres de contacto y caja
    c = (await db.execute(select(Contacto).where(Contacto.id == pp.contacto_id))).scalar_one_or_none()
    if c:
        resp.contacto_nombre = f"{c.nombre} {c.apellido or ''}".strip()
    if pp.caja_id:
        caja = (await db.execute(select(TesoreriaCaja).where(TesoreriaCaja.id == pp.caja_id))).scalar_one_or_none()
        if caja:
            resp.caja_nombre = caja.nombre
    return resp


@router.get("", response_model=List[PagoProgramadoResponse])
async def list_pagos(
    request: Request,
    activo: Optional[bool] = True,
    proximos_dias: Optional[int] = Query(None, ge=1, le=365, description="Filtra los que vencen en N dias"),
    contacto_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(TesoreriaPagoProgramado).where(TesoreriaPagoProgramado.municipio_id == muni_id)
    if activo is not None:
        q = q.where(TesoreriaPagoProgramado.activo == activo)
    if contacto_id:
        q = q.where(TesoreriaPagoProgramado.contacto_id == contacto_id)
    if proximos_dias:
        limite = date.today() + timedelta(days=proximos_dias)
        q = q.where(TesoreriaPagoProgramado.proximo_pago <= limite)
    q = q.order_by(TesoreriaPagoProgramado.proximo_pago.asc())
    pagos = (await db.execute(q)).scalars().all()
    return [await _enrich(db, p) for p in pagos]


@router.post("", response_model=PagoProgramadoResponse, status_code=201)
async def create_pago(
    payload: PagoProgramadoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    # Validar contacto
    c = (await db.execute(
        select(Contacto).where(Contacto.id == payload.contacto_id, Contacto.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(422, "Contacto invalido para este municipio")

    # Calcular proximo_pago inicial = primer dia_del_mes >= fecha_inicio
    proximo = payload.fecha_inicio
    last_day = monthrange(proximo.year, proximo.month)[1]
    proximo = date(proximo.year, proximo.month, min(payload.dia_del_mes, last_day))
    if proximo < payload.fecha_inicio:
        proximo = _calcular_proximo_pago(proximo, payload.frecuencia, payload.dia_del_mes)

    pp = TesoreriaPagoProgramado(
        municipio_id=muni_id,
        proximo_pago=proximo,
        **payload.model_dump(),
    )
    db.add(pp)
    await db.commit()
    await db.refresh(pp)
    return await _enrich(db, pp)


@router.put("/{pp_id}", response_model=PagoProgramadoResponse)
async def update_pago(
    pp_id: int,
    payload: PagoProgramadoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    pp = (await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.id == pp_id, TesoreriaPagoProgramado.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not pp:
        raise HTTPException(404, "No encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pp, k, v)
    await db.commit()
    await db.refresh(pp)
    return await _enrich(db, pp)


@router.delete("/{pp_id}")
async def delete_pago(
    pp_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    pp = (await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.id == pp_id, TesoreriaPagoProgramado.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not pp:
        raise HTTPException(404, "No encontrado")
    pp.activo = False
    await db.commit()
    return {"ok": True, "id": pp_id}


@router.post("/{pp_id}/ejecutar", response_model=dict)
async def ejecutar_pago(
    pp_id: int,
    request: Request,
    fecha_pago: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ejecuta un pago programado: crea un Gasto real, descuenta la caja
    si aplica, y avanza proximo_pago al siguiente periodo."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)

    pp = (await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.id == pp_id, TesoreriaPagoProgramado.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not pp:
        raise HTTPException(404, "No encontrado")

    fecha = fecha_pago or date.today()

    # Crear el Gasto contado
    gasto = Gasto(
        municipio_id=muni_id,
        creador_id=current_user.id,
        destino_tipo='contacto',
        destino_contacto_id=pp.contacto_id,
        destino_dependencia_id=None,
        concepto=pp.concepto,
        descripcion=pp.descripcion,
        monto_pesos=pp.monto_pesos,
        fecha=fecha,
        tipo_financiacion='contado',
        forma_pago=pp.forma_pago,
    )
    db.add(gasto)
    await db.flush()
    # Cuota unica pagada
    db.add(GastoCuota(
        gasto_id=gasto.id, numero=1, monto=pp.monto_pesos,
        fecha_vencimiento=fecha, fecha_pago=fecha, estado=EstadoGastoCuota.PAGADA,
        forma_pago=pp.forma_pago,
    ))

    # Movimiento de caja (egreso) si tiene caja asignada
    if pp.caja_id:
        db.add(TesoreriaMovimientoCaja(
            municipio_id=muni_id, caja_id=pp.caja_id, gasto_id=gasto.id,
            tipo=TipoMovimientoCaja.EGRESO, monto=pp.monto_pesos, fecha=fecha,
            concepto=pp.concepto,
        ))

    # Avanzar proximo_pago
    pp.ultimo_pago = fecha
    pp.proximo_pago = _calcular_proximo_pago(pp.proximo_pago, pp.frecuencia, pp.dia_del_mes)
    if pp.fecha_fin and pp.proximo_pago > pp.fecha_fin:
        pp.activo = False

    await db.commit()
    return {"ok": True, "gasto_id": gasto.id, "proximo_pago": pp.proximo_pago.isoformat() if pp.activo else None}
