"""Agenda de pagos programados + ejecucion (crea Gasto real)."""
from datetime import date, timedelta
from calendar import monthrange
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    TesoreriaPagoProgramado, FrecuenciaPago, TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja,
    Contacto, Gasto, GastoCuota, TesoreriaPremio, User, RolUsuario,
)
from models.gasto import EstadoGastoCuota
from schemas.tesoreria_extra import (
    PagoProgramadoCreate, PagoProgramadoUpdate, PagoProgramadoResponse,
    EjecutarPagoRequest, EjecutarPagoResponse, PremioAplicado,
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


@router.post("/{pp_id}/ejecutar", response_model=EjecutarPagoResponse)
async def ejecutar_pago(
    pp_id: int,
    payload: EjecutarPagoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ejecuta un pago programado: crea un Gasto real, descuenta la caja
    si aplica, y avanza proximo_pago al siguiente periodo.

    El monto total se compone de:
      - monto_base: viene en el payload o default al monto del programado.
        Permite ajustar el sueldo de este mes (varia entre meses).
      - premios: lista de TesoreriaPremio.id que se aplican este mes. Los
        montos se snapshotean en `premios_aplicados` para historico.

    El total se persiste como monto_pesos del Gasto + descuenta caja por
    el TOTAL (no solo el base).
    """
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)

    pp = (await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.id == pp_id, TesoreriaPagoProgramado.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not pp:
        raise HTTPException(404, "No encontrado")

    fecha = payload.fecha_pago or date.today()
    monto_base = Decimal(str(payload.monto_base)) if payload.monto_base is not None else Decimal(str(pp.monto_pesos))

    # Validar y cargar premios (deben ser del mismo muni, activos al momento
    # de ejecutar — pero si despues se desactivan, el historico no se ve
    # afectado porque snapshoteamos el monto).
    premios_aplicados: list[PremioAplicado] = []
    desglose: list[str] = []
    monto_premios = Decimal(0)
    # Soporte para los 2 formatos: nuevo (premios_aplicados con override)
    # y viejo (premio_ids). Si vienen ambos, gana premios_aplicados.
    items_premios = payload.premios_aplicados or [
        type('I', (), {'premio_id': pid, 'monto': None})() for pid in payload.premio_ids
    ]
    # Si el operador NO mando nada y el pago_programado tiene premios_default
    # cargados (el caso normal: se setean al editar la liquidacion y al pagar
    # vienen pre-aplicados), tomamos esos. Si quiere overrideerlos, el frontend
    # manda una lista (incluso vacia explicita seria un override a "ninguno").
    if not items_premios and pp.premios_default:
        items_premios = [
            type('I', (), {'premio_id': int(pid), 'monto': None})()
            for pid in pp.premios_default
        ]
    if items_premios:
        ids_a_cargar = [it.premio_id for it in items_premios]
        premios = list((await db.execute(
            select(TesoreriaPremio).where(
                TesoreriaPremio.id.in_(ids_a_cargar),
                TesoreriaPremio.municipio_id == muni_id,
            )
        )).scalars().all())
        if len(premios) != len(set(ids_a_cargar)):
            raise HTTPException(422, "Algun premio invalido para este municipio")
        premios_by_id = {p.id: p for p in premios}
        for it in items_premios:
            pr = premios_by_id[it.premio_id]
            # Si el operador puso un override del monto este mes, lo usamos.
            # Si no, usamos el del catalogo. >= 0 por si se quiere desmarcar
            # el efecto del premio sin desmarcarlo (raro pero valido).
            monto_pr = Decimal(str(it.monto)) if (getattr(it, 'monto', None) is not None) else Decimal(str(pr.monto))
            monto_premios += monto_pr
            premios_aplicados.append(PremioAplicado(premio_id=pr.id, monto=monto_pr))
            desglose.append(f"{pr.nombre}: ${monto_pr:,.0f}")

    monto_total = monto_base + monto_premios

    # Armar descripcion enriquecida con desglose y notas opcionales
    desc_lines = []
    if pp.descripcion:
        desc_lines.append(pp.descripcion)
    if desglose:
        desc_lines.append("Premios aplicados: " + ", ".join(desglose))
    if payload.notas:
        desc_lines.append(payload.notas)
    descripcion_final = "\n".join(desc_lines) or None

    # Crear el Gasto contado con el TOTAL
    gasto = Gasto(
        municipio_id=muni_id,
        creador_id=current_user.id,
        destino_tipo='contacto',
        destino_contacto_id=pp.contacto_id,
        destino_dependencia_id=None,
        concepto=pp.concepto,
        descripcion=descripcion_final,
        monto_pesos=monto_total,
        fecha=fecha,
        tipo_financiacion='contado',
        forma_pago=pp.forma_pago,
        caja_id=pp.caja_id,
        pago_programado_id=pp.id,
    )
    db.add(gasto)
    await db.flush()
    # Cuota unica pagada
    db.add(GastoCuota(
        gasto_id=gasto.id, numero=1, monto=monto_total,
        fecha_vencimiento=fecha, fecha_pago=fecha, estado=EstadoGastoCuota.PAGADA,
        forma_pago=pp.forma_pago,
    ))

    # Movimiento de caja (egreso) si tiene caja asignada
    if pp.caja_id:
        db.add(TesoreriaMovimientoCaja(
            municipio_id=muni_id, caja_id=pp.caja_id, gasto_id=gasto.id,
            tipo=TipoMovimientoCaja.EGRESO, monto=monto_total, fecha=fecha,
            concepto=pp.concepto,
        ))

    # Avanzar proximo_pago
    pp.ultimo_pago = fecha
    pp.proximo_pago = _calcular_proximo_pago(pp.proximo_pago, pp.frecuencia, pp.dia_del_mes)
    if pp.fecha_fin and pp.proximo_pago > pp.fecha_fin:
        pp.activo = False

    await db.commit()

    return EjecutarPagoResponse(
        ok=True,
        gasto_id=gasto.id,
        monto_total=monto_total,
        monto_base=monto_base,
        premios_aplicados=premios_aplicados,
        proximo_pago=pp.proximo_pago.isoformat() if pp.activo else None,
    )


@router.get("/historial")
async def historial_pagos(
    request: Request,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    contacto_id: Optional[int] = None,
    caja_id: Optional[int] = None,
    pago_programado_id: Optional[int] = None,
    limit: int = Query(200, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historial de pagos ejecutados a partir de una liquidacion (pago programado).

    Devuelve los Gastos creados por POST /agenda/{id}/ejecutar, enriquecidos
    con nombre de contacto, caja y concepto del pago programado original.

    Default: ultimos 90 dias si no se pasa desde.
    """
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    if not desde:
        desde = date.today() - timedelta(days=90)

    from models import Gasto, Contacto, TesoreriaCaja, TesoreriaPagoProgramado
    q = select(Gasto).where(
        Gasto.municipio_id == muni_id,
        Gasto.pago_programado_id.is_not(None),
        Gasto.fecha >= desde,
        Gasto.activo.is_(True),
    )
    if hasta:
        q = q.where(Gasto.fecha <= hasta)
    if contacto_id:
        q = q.where(Gasto.destino_contacto_id == contacto_id)
    if caja_id:
        q = q.where(Gasto.caja_id == caja_id)
    if pago_programado_id:
        q = q.where(Gasto.pago_programado_id == pago_programado_id)
    q = q.order_by(Gasto.fecha.desc(), Gasto.id.desc()).limit(limit)

    gastos = list((await db.execute(q)).scalars().all())

    # Enriquecer con nombres
    contacto_ids = {g.destino_contacto_id for g in gastos if g.destino_contacto_id}
    caja_ids = {g.caja_id for g in gastos if g.caja_id}
    pp_ids = {g.pago_programado_id for g in gastos if g.pago_programado_id}
    contactos_map = {}
    cajas_map = {}
    pp_map = {}
    if contacto_ids:
        rows = (await db.execute(select(Contacto).where(Contacto.id.in_(contacto_ids)))).scalars().all()
        contactos_map = {c.id: f"{c.nombre} {c.apellido or ''}".strip() for c in rows}
    if caja_ids:
        rows = (await db.execute(select(TesoreriaCaja).where(TesoreriaCaja.id.in_(caja_ids)))).scalars().all()
        cajas_map = {c.id: {"nombre": c.nombre, "color": c.color} for c in rows}
    if pp_ids:
        rows = (await db.execute(select(TesoreriaPagoProgramado).where(TesoreriaPagoProgramado.id.in_(pp_ids)))).scalars().all()
        pp_map = {p.id: {"concepto": p.concepto, "frecuencia": p.frecuencia.value if hasattr(p.frecuencia, "value") else str(p.frecuencia)} for p in rows}

    return [
        {
            "id": g.id,
            "fecha": g.fecha.isoformat(),
            "monto_pesos": str(g.monto_pesos),
            "concepto": g.concepto,
            "descripcion": g.descripcion,
            "forma_pago": g.forma_pago.value if hasattr(g.forma_pago, "value") else str(g.forma_pago),
            "contacto_id": g.destino_contacto_id,
            "contacto_nombre": contactos_map.get(g.destino_contacto_id),
            "caja_id": g.caja_id,
            "caja_nombre": cajas_map.get(g.caja_id, {}).get("nombre") if g.caja_id else None,
            "caja_color": cajas_map.get(g.caja_id, {}).get("color") if g.caja_id else None,
            "pago_programado_id": g.pago_programado_id,
            "pp_frecuencia": pp_map.get(g.pago_programado_id, {}).get("frecuencia"),
        }
        for g in gastos
    ]


@router.get("/reportes")
async def reportes_sueldos(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reportes de Sueldos / Liquidaciones:
      - masa_salarial: total mensual programado (suma de monto_pesos de activos).
      - cantidad_empleados: cuantos contactos tipo=empleado activos.
      - top_sueldos: top 10 empleados por sueldo base.
      - proximos_pagos: pagos programados que vencen en los proximos 30 dias.
      - frecuencias: cuantos pagos hay por cada frecuencia.
    """
    from datetime import timedelta
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    hoy = date.today()
    en_30 = hoy + timedelta(days=30)

    # Masa salarial total programada
    total_row = (await db.execute(
        select(
            func.count(TesoreriaPagoProgramado.id),
            func.coalesce(func.sum(TesoreriaPagoProgramado.monto_pesos), 0),
        )
        .where(
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.activo == True,  # noqa: E712
        )
    )).one()
    cantidad_pagos = int(total_row[0] or 0)
    masa_total = str(total_row[1] or 0)

    # Cantidad empleados activos
    cant_empleados = (await db.execute(
        select(func.count(Contacto.id))
        .where(
            Contacto.municipio_id == muni_id,
            Contacto.activo == True,  # noqa: E712
            Contacto.tipo == "empleado",
        )
    )).scalar_one()

    # Top sueldos
    top_rows = (await db.execute(
        select(
            Contacto.nombre, Contacto.apellido,
            TesoreriaPagoProgramado.monto_pesos,
            TesoreriaPagoProgramado.concepto,
            TesoreriaPagoProgramado.frecuencia,
        )
        .join(Contacto, TesoreriaPagoProgramado.contacto_id == Contacto.id)
        .where(
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.activo == True,  # noqa: E712
        )
        .order_by(TesoreriaPagoProgramado.monto_pesos.desc())
        .limit(10)
    )).all()
    top_sueldos = [
        {
            "nombre": f"{n} {a or ''}".strip(),
            "monto": str(m),
            "concepto": c,
            "frecuencia": f.value if hasattr(f, "value") else str(f),
        }
        for n, a, m, c, f in top_rows
    ]

    # Proximos pagos (30 dias)
    prox_rows = (await db.execute(
        select(TesoreriaPagoProgramado)
        .where(
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.activo == True,  # noqa: E712
            TesoreriaPagoProgramado.proximo_pago <= en_30,
        )
        .order_by(TesoreriaPagoProgramado.proximo_pago.asc())
        .limit(50)
    )).scalars().all()
    proximos_pagos = [await _enrich(db, p) for p in prox_rows]

    # Cantidad por frecuencia
    frec_rows = (await db.execute(
        select(
            TesoreriaPagoProgramado.frecuencia,
            func.count(TesoreriaPagoProgramado.id),
            func.coalesce(func.sum(TesoreriaPagoProgramado.monto_pesos), 0),
        )
        .where(
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.activo == True,  # noqa: E712
        )
        .group_by(TesoreriaPagoProgramado.frecuencia)
    )).all()
    frecuencias = [
        {
            "frecuencia": f.value if hasattr(f, "value") else str(f),
            "cantidad": int(c),
            "monto": str(m),
        }
        for f, c, m in frec_rows
    ]

    return {
        "masa_salarial_mes": masa_total,
        "cantidad_pagos_activos": cantidad_pagos,
        "cantidad_empleados": int(cant_empleados or 0),
        "top_sueldos": top_sueldos,
        "proximos_pagos": proximos_pagos,
        "frecuencias": frecuencias,
    }
