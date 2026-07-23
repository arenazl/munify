"""ABM de cajas/fondos + endpoints de movimientos (ingresos/egresos).

Las cajas con `codigo == 'TARJETA'` representan una TARJETA DE CREDITO (mismo
contenedor, distinta presentacion): ahi `saldo_inicial` es el LIMITE y el saldo
actual es el credito DISPONIBLE. Ver models/tesoreria_extra.CODIGO_CAJA_TARJETA.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja, User, RolUsuario,
)
from models.tesoreria_extra import es_caja_tarjeta
from schemas.tesoreria_extra import (
    CajaCreate, CajaUpdate, CajaResponse,
    MovimientoCajaCreate, MovimientoCajaResponse,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


def _aplicar_flags_tarjeta(resp: CajaResponse, caja: TesoreriaCaja) -> None:
    """Si la caja es una tarjeta de credito, expone limite/deuda calculados.

    `saldo_inicial` es el LIMITE y `saldo_actual` el credito DISPONIBLE, asi que
    la deuda es la diferencia. No se toca el modelo: son campos del response.
    """
    if not es_caja_tarjeta(caja):
        return
    resp.es_tarjeta = True
    limite = Decimal(caja.saldo_inicial or 0)
    resp.limite = limite
    if resp.saldo_actual is not None:
        resp.deuda_actual = limite - Decimal(resp.saldo_actual)


async def _enrich_caja_response(db: AsyncSession, caja: TesoreriaCaja) -> CajaResponse:
    """Carga totales de ingresos/egresos y calcula saldo actual.

    NOTA: Para listas grandes usar `_build_caja_responses_bulk` que hace una sola
    query agregada en vez de N+1.
    """
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
    _aplicar_flags_tarjeta(resp, caja)
    return resp


async def _build_caja_responses_bulk(
    db: AsyncSession, cajas: list[TesoreriaCaja]
) -> list[CajaResponse]:
    """Calcula saldos de TODAS las cajas en 1 query (no N+1).

    Antes: por cada caja, un GROUP BY tipo → N+1.
    Ahora: 1 GROUP BY (caja_id, tipo) que devuelve todos los totales de una.
    """
    if not cajas:
        return []
    caja_ids = [c.id for c in cajas]
    rows = (await db.execute(
        select(
            TesoreriaMovimientoCaja.caja_id,
            TesoreriaMovimientoCaja.tipo,
            func.coalesce(func.sum(TesoreriaMovimientoCaja.monto), 0),
        )
        .where(TesoreriaMovimientoCaja.caja_id.in_(caja_ids))
        .group_by(TesoreriaMovimientoCaja.caja_id, TesoreriaMovimientoCaja.tipo)
    )).all()
    # totales[caja_id] = {'ingreso': Decimal, 'egreso': Decimal}
    totales: dict[int, dict[str, Decimal]] = {}
    for cid, tipo, total in rows:
        tipo_val = tipo.value if hasattr(tipo, 'value') else tipo
        totales.setdefault(cid, {})[tipo_val] = Decimal(total)
    out: list[CajaResponse] = []
    for caja in cajas:
        t = totales.get(caja.id, {})
        ingresos = t.get('ingreso', Decimal(0))
        egresos = t.get('egreso', Decimal(0))
        resp = CajaResponse.model_validate(caja)
        resp.total_ingresos = ingresos
        resp.total_egresos = egresos
        resp.saldo_actual = Decimal(caja.saldo_inicial or 0) + ingresos - egresos
        _aplicar_flags_tarjeta(resp, caja)
        out.append(resp)
    return out


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
    cajas = list((await db.execute(q)).scalars().all())
    if include_saldos:
        return await _build_caja_responses_bulk(db, cajas)
    out = []
    for c in cajas:
        r = CajaResponse.model_validate(c)
        _aplicar_flags_tarjeta(r, c)
        out.append(r)
    return out


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
    # Los movimientos generados por un gasto NO se borran sueltos: dejan el
    # gasto concretado sin descontar caja (desync silencioso) y, peor, si el
    # gasto se edita después la sincronización lo recrea "solo". El camino
    # correcto es editar/eliminar el gasto, que gestiona sus movimientos.
    if mov.gasto_id is not None:
        raise HTTPException(
            400,
            "Este movimiento pertenece a un gasto. Editá o eliminá el gasto "
            "para que la caja quede consistente.",
        )
    await db.delete(mov)
    await db.commit()
    return {"ok": True, "id": mov_id}


# ============================================================
# Pago de tarjeta de credito
# ============================================================

class PagoTarjetaRequest(BaseModel):
    tarjeta_caja_id: int                      # caja tipo TARJETA que se paga
    caja_origen_id: int                       # caja real de donde sale la plata
    monto: Decimal = Field(..., gt=0)
    fecha: date
    concepto: Optional[str] = None
    descripcion: Optional[str] = None


@router.post("/pagar-tarjeta", status_code=201)
async def pagar_tarjeta(
    payload: PagoTarjetaRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Registra el pago de una tarjeta de credito.

    Es la operacion INVERSA al gasto con tarjeta: DOS movimientos en la misma
    transaccion.
      - INGRESO en la caja-tarjeta   -> cancela deuda (sube el disponible).
      - EGRESO  en la caja de origen -> sale la plata real (ej. Coparticipacion).

    NO crea un Gasto: el gasto ya se registro al comprar con la tarjeta. Esto
    solo cancela (total o parcialmente) la deuda acumulada, sin duplicar el gasto.
    """
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)

    if payload.tarjeta_caja_id == payload.caja_origen_id:
        raise HTTPException(422, "La tarjeta y la caja de origen no pueden ser la misma")

    cajas = {c.id: c for c in (await db.execute(
        select(TesoreriaCaja).where(
            TesoreriaCaja.id.in_([payload.tarjeta_caja_id, payload.caja_origen_id]),
            TesoreriaCaja.municipio_id == muni_id,
        )
    )).scalars().all()}

    tarjeta = cajas.get(payload.tarjeta_caja_id)
    origen = cajas.get(payload.caja_origen_id)
    if not tarjeta:
        raise HTTPException(404, "Tarjeta no encontrada")
    if not origen:
        raise HTTPException(404, "Caja de origen no encontrada")
    if not es_caja_tarjeta(tarjeta):
        raise HTTPException(422, f"'{tarjeta.nombre}' no es una tarjeta de credito")
    if es_caja_tarjeta(origen):
        raise HTTPException(422, "No se puede pagar una tarjeta con otra tarjeta")

    concepto = (payload.concepto or f"Pago de tarjeta {tarjeta.nombre}").strip()[:150]

    # INGRESO en la tarjeta: cancela deuda -> sube el credito disponible.
    db.add(TesoreriaMovimientoCaja(
        municipio_id=muni_id,
        caja_id=tarjeta.id,
        tipo=TipoMovimientoCaja.INGRESO,
        monto=payload.monto,
        fecha=payload.fecha,
        concepto=concepto,
        descripcion=payload.descripcion or f"Pago desde {origen.nombre}",
    ))
    # EGRESO en la caja real: de ahi sale efectivamente la plata.
    db.add(TesoreriaMovimientoCaja(
        municipio_id=muni_id,
        caja_id=origen.id,
        tipo=TipoMovimientoCaja.EGRESO,
        monto=payload.monto,
        fecha=payload.fecha,
        concepto=concepto,
        descripcion=payload.descripcion or f"Pago de {tarjeta.nombre}",
    ))
    await db.commit()

    return {
        "ok": True,
        "monto": str(payload.monto),
        "tarjeta": await _enrich_caja_response(db, tarjeta),
        "caja_origen": await _enrich_caja_response(db, origen),
    }
