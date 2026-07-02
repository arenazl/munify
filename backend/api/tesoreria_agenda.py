"""Agenda de pagos programados + ejecucion (crea Gasto real)."""
from datetime import date, timedelta
from calendar import monthrange
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func, update, or_
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
    EjecutarMasivoRequest, EjecutarMasivoResponse, EjecutarMasivoItem,
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


def _proximo_dia_semana(desde: date, dia_semana: int) -> date:
    """Devuelve el proximo dia_semana >= desde. 0=lunes..6=domingo."""
    actual_dow = desde.weekday()
    delta = (dia_semana - actual_dow) % 7
    return desde + timedelta(days=delta)


def _calcular_fecha_inicio_premio(hoy: date, frecuencia: FrecuenciaPago, dia_semana, dia_del_mes) -> date:
    """Calcula la fecha del proximo pago para un premio recien creado.

    Semanal: proximo dia_semana >= hoy (ej. viernes que viene).
    Mensual/etc: dia_del_mes en el mes actual si todavia no paso, sino mes siguiente.
    """
    if frecuencia == FrecuenciaPago.SEMANAL:
        return _proximo_dia_semana(hoy, dia_semana if dia_semana is not None else 4)
    # Mensual/quincenal/etc → usar dia_del_mes
    dia = dia_del_mes if dia_del_mes else 1
    last_day = monthrange(hoy.year, hoy.month)[1]
    candidato = date(hoy.year, hoy.month, min(dia, last_day))
    if candidato >= hoy:
        return candidato
    return _calcular_proximo_pago(candidato, frecuencia, dia)


async def _enrich(db: AsyncSession, pp: TesoreriaPagoProgramado) -> PagoProgramadoResponse:
    """Enrich de UN solo PagoProgramado. Para listas usar _enrich_bulk (evita N+1)."""
    resp = PagoProgramadoResponse.model_validate(pp)
    c = (await db.execute(select(Contacto).where(Contacto.id == pp.contacto_id))).scalar_one_or_none()
    if c:
        resp.contacto_nombre = f"{c.nombre} {c.apellido or ''}".strip()
    if pp.caja_id:
        caja = (await db.execute(select(TesoreriaCaja).where(TesoreriaCaja.id == pp.caja_id))).scalar_one_or_none()
        if caja:
            resp.caja_nombre = caja.nombre
    return resp


async def _enrich_bulk(
    db: AsyncSession, pagos: list[TesoreriaPagoProgramado]
) -> list[PagoProgramadoResponse]:
    """Enrich de varios pagos programados en 2 queries fijas (no N+1)."""
    if not pagos:
        return []
    contacto_ids = {p.contacto_id for p in pagos if p.contacto_id}
    caja_ids = {p.caja_id for p in pagos if p.caja_id}

    contactos_map: dict[int, str] = {}
    if contacto_ids:
        rows = (await db.execute(
            select(Contacto.id, Contacto.nombre, Contacto.apellido).where(Contacto.id.in_(contacto_ids))
        )).all()
        contactos_map = {cid: f"{nom} {ape or ''}".strip() for cid, nom, ape in rows}

    cajas_map: dict[int, str] = {}
    if caja_ids:
        rows = (await db.execute(
            select(TesoreriaCaja.id, TesoreriaCaja.nombre).where(TesoreriaCaja.id.in_(caja_ids))
        )).all()
        cajas_map = {cid: nom for cid, nom in rows}

    out: list[PagoProgramadoResponse] = []
    for p in pagos:
        resp = PagoProgramadoResponse.model_validate(p)
        resp.contacto_nombre = contactos_map.get(p.contacto_id)
        if p.caja_id:
            resp.caja_nombre = cajas_map.get(p.caja_id)
        out.append(resp)
    return out


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
    pagos = list((await db.execute(q)).scalars().all())
    return await _enrich_bulk(db, pagos)


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
    await db.flush()

    # NOTA: la auto-generacion de "premios" (presentismo, incentivo) fue
    # deprecada. Ahora todo es un pago programado de CONCEPTO; el muni carga
    # cada uno individualmente. El metodo _auto_crear_premios_para_contacto
    # queda definido por compat con el endpoint /regenerar-premios pero ya
    # no se invoca al crear pagos.

    await db.commit()
    await db.refresh(pp)
    return await _enrich(db, pp)


async def _auto_crear_premios_para_contacto(
    db: AsyncSession, muni_id: int, contacto_id: int, caja_id: Optional[int]
) -> int:
    """Crea un pago programado por cada premio activo del catalogo para el
    contacto dado. Si ya existe un pago programado con `notas` que empieza
    con [auto-premio][premio_id=X], no se duplica.

    Devuelve la cantidad creada.
    """
    premios = list((await db.execute(
        select(TesoreriaPremio).where(
            TesoreriaPremio.municipio_id == muni_id,
            TesoreriaPremio.activo.is_(True),
        )
    )).scalars().all())
    if not premios:
        return 0

    # Existentes para este contacto (notas matcheando [auto-premio][premio_id=X])
    existentes = list((await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.contacto_id == contacto_id,
            TesoreriaPagoProgramado.activo.is_(True),
        )
    )).scalars().all())
    ya_creados = set()
    for pp_ex in existentes:
        notas = pp_ex.notas or ""
        if notas.startswith("[auto-premio]"):
            # extraer premio_id del marker [auto-premio][premio_id=N]
            import re
            m = re.search(r"\[premio_id=(\d+)\]", notas)
            if m:
                ya_creados.add(int(m.group(1)))

    hoy = date.today()
    creados = 0
    for pr in premios:
        if pr.id in ya_creados:
            continue
        # Defaults por si el premio no tiene dia configurado
        dia_semana = pr.dia_semana
        dia_del_mes = pr.dia_del_mes or 1
        if pr.frecuencia == FrecuenciaPago.SEMANAL and dia_semana is None:
            dia_semana = 4  # viernes default
        fecha_ini = _calcular_fecha_inicio_premio(hoy, pr.frecuencia, dia_semana, dia_del_mes)
        marker = f"[auto-premio][premio_id={pr.id}] Generado automaticamente desde catalogo de premios"
        nuevo = TesoreriaPagoProgramado(
            municipio_id=muni_id,
            contacto_id=contacto_id,
            caja_id=caja_id,
            concepto=pr.nombre,
            descripcion=pr.descripcion or None,
            monto_pesos=pr.monto,
            forma_pago="transferencia",
            frecuencia=pr.frecuencia,
            dia_del_mes=dia_del_mes if pr.frecuencia != FrecuenciaPago.SEMANAL else 1,
            dia_semana=dia_semana if pr.frecuencia == FrecuenciaPago.SEMANAL else None,
            fecha_inicio=fecha_ini,
            proximo_pago=fecha_ini,
            notas=marker,
            activo=True,
        )
        db.add(nuevo)
        creados += 1
    return creados


@router.post("/regenerar-premios")
async def regenerar_premios(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backfill retroactivo: para cada contacto que YA tiene un pago programado
    de sueldo cargado, generar los pagos programados de cada premio activo del
    catalogo que aun no tenga. Util cuando se carga un premio nuevo despues
    de tener empleados creados.
    """
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)

    # Contactos que ya tienen al menos un pago programado de sueldo
    # (lo identificamos como pago activo no marcado como auto-premio)
    rows = (await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.activo.is_(True),
        )
    )).scalars().all()
    # Map contacto_id -> caja_id de su primer sueldo (no auto-premio)
    contacto_caja: dict[int, Optional[int]] = {}
    for pp in rows:
        if (pp.notas or "").startswith("[auto-premio]"):
            continue
        if pp.contacto_id not in contacto_caja:
            contacto_caja[pp.contacto_id] = pp.caja_id

    total_creados = 0
    for contacto_id, caja_id in contacto_caja.items():
        total_creados += await _auto_crear_premios_para_contacto(db, muni_id, contacto_id, caja_id)
    await db.commit()
    return {
        "ok": True,
        "contactos_afectados": len(contacto_caja),
        "pagos_premios_creados": total_creados,
    }


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

    data = payload.model_dump(exclude_unset=True)
    # Detectar si cambian campos que afectan al proximo_pago. Solo recalculamos
    # cuando la liquidacion todavia NO se ejecuto (ultimo_pago IS NULL). Si ya
    # hubo pagos previos respetamos la secuencia que el sistema vino llevando
    # (sino podria saltarse meses pagados).
    campos_recalculo = {"fecha_inicio", "frecuencia", "dia_del_mes"}
    recalcular = (pp.ultimo_pago is None) and bool(campos_recalculo & data.keys())

    for k, v in data.items():
        # No permitimos pisar proximo_pago manualmente; lo derivamos abajo
        if k == "proximo_pago" and recalcular:
            continue
        setattr(pp, k, v)

    if recalcular:
        proximo = pp.fecha_inicio
        last_day = monthrange(proximo.year, proximo.month)[1]
        proximo = date(proximo.year, proximo.month, min(pp.dia_del_mes, last_day))
        if proximo < pp.fecha_inicio:
            proximo = _calcular_proximo_pago(proximo, pp.frecuencia, pp.dia_del_mes)
        pp.proximo_pago = proximo

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

    # Fecha de IMPACTO contable = fecha del programado (proximo_pago),
    # NO el dia en que el operador apreta "Pagar". Asi en historial figura
    # con la fecha planificada (ej. el dia 4 aunque se haya pagado el 1).
    # El frontend puede pasar override si justificadamente quiere otra.
    fecha = payload.fecha_pago or pp.proximo_pago or date.today()

    # Anti doble-ejecución (retry de red / doble click / dos tabs): claim
    # atómico del período. El UPDATE condicional solo pasa si nadie pagó ya
    # esta fecha; la request concurrente espera el row-lock de InnoDB y al
    # ver rowcount=0 recibe 409 en lugar de duplicar gasto + egreso de caja.
    claim = await db.execute(
        update(TesoreriaPagoProgramado)
        .where(
            TesoreriaPagoProgramado.id == pp.id,
            or_(
                TesoreriaPagoProgramado.ultimo_pago.is_(None),
                TesoreriaPagoProgramado.ultimo_pago < fecha,
            ),
        )
        .values(ultimo_pago=fecha)
    )
    if claim.rowcount == 0:
        raise HTTPException(
            409,
            f"Este período ya fue pagado (último pago: {pp.ultimo_pago}). "
            "Si es un pago extra del mismo día, usá una fecha de pago posterior.",
        )

    monto_base = Decimal(str(payload.monto_base)) if payload.monto_base is not None else Decimal(str(pp.monto_pesos))

    # Validar y cargar premios (deben ser del mismo muni, activos al momento
    # de ejecutar — pero si despues se desactivan, el historico no se ve
    # afectado porque snapshoteamos el monto).
    premios_aplicados: list[PremioAplicado] = []
    desglose: list[str] = []
    monto_premios = Decimal(0)
    # Soporte para los 2 formatos: nuevo (premios_aplicados con override)
    # y viejo (premio_ids). Si vienen ambos, gana premios_aplicados.
    #
    # DISTINCIÓN CRÍTICA None vs []: una lista vacía explícita es un override
    # a "ningún premio" (es lo que manda SIEMPRE la UI actual). El fallback a
    # pp.premios_default corre SOLO si el campo no vino (clientes viejos).
    # Antes `[] or ...` era falsy y aplicaba premios_default silenciosos:
    # el operador confirmaba $286.000 en pantalla y la caja debitaba $311.000.
    if payload.premios_aplicados is not None:
        items_premios = list(payload.premios_aplicados)
    elif payload.premio_ids:
        items_premios = [
            type('I', (), {'premio_id': pid, 'monto': None})() for pid in payload.premio_ids
        ]
    elif pp.premios_default:
        items_premios = [
            type('I', (), {'premio_id': int(pid), 'monto': None})()
            for pid in pp.premios_default
        ]
    else:
        items_premios = []
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

    # Avanzar proximo_pago (ultimo_pago ya quedó claimeado arriba)
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


@router.post("/ejecutar-masivo", response_model=EjecutarMasivoResponse)
async def ejecutar_pagos_masivo(
    payload: EjecutarMasivoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ejecuta varios pagos programados de una (pago masivo). Cada uno se
    paga con sus valores POR DEFECTO: monto = monto_pesos del programado,
    fecha de impacto = su proximo_pago, sin premios. Equivale a llamar
    /ejecutar uno por uno con payload vacio, pero en una sola request y
    una sola transaccion. Espeja el nucleo de ejecutar_pago (sin premios)."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)

    ids = list(dict.fromkeys(payload.pago_ids))  # dedup preservando orden
    if not ids:
        raise HTTPException(400, "Sin pagos para ejecutar")

    pps = list((await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.id.in_(ids),
            TesoreriaPagoProgramado.municipio_id == muni_id,
            TesoreriaPagoProgramado.activo.is_(True),
        )
    )).scalars().all())
    pp_by_id = {p.id: p for p in pps}

    items: list[EjecutarMasivoItem] = []
    monto_total_acum = Decimal(0)
    exitosos = 0
    for pid in ids:
        pp = pp_by_id.get(pid)
        if not pp:
            items.append(EjecutarMasivoItem(pago_id=pid, ok=False, error="No encontrado o inactivo"))
            continue
        fecha = pp.proximo_pago or date.today()

        # Mismo claim atómico anti doble-ejecución que en /ejecutar
        claim = await db.execute(
            update(TesoreriaPagoProgramado)
            .where(
                TesoreriaPagoProgramado.id == pp.id,
                or_(
                    TesoreriaPagoProgramado.ultimo_pago.is_(None),
                    TesoreriaPagoProgramado.ultimo_pago < fecha,
                ),
            )
            .values(ultimo_pago=fecha)
        )
        if claim.rowcount == 0:
            items.append(EjecutarMasivoItem(
                pago_id=pid, ok=False,
                error=f"Período ya pagado (último pago: {pp.ultimo_pago})",
            ))
            continue

        monto = Decimal(str(pp.monto_pesos))
        gasto = Gasto(
            municipio_id=muni_id,
            creador_id=current_user.id,
            destino_tipo='contacto',
            destino_contacto_id=pp.contacto_id,
            destino_dependencia_id=None,
            concepto=pp.concepto,
            descripcion=pp.descripcion or None,
            monto_pesos=monto,
            fecha=fecha,
            tipo_financiacion='contado',
            forma_pago=pp.forma_pago,
            caja_id=pp.caja_id,
            pago_programado_id=pp.id,
        )
        db.add(gasto)
        await db.flush()
        db.add(GastoCuota(
            gasto_id=gasto.id, numero=1, monto=monto,
            fecha_vencimiento=fecha, fecha_pago=fecha, estado=EstadoGastoCuota.PAGADA,
            forma_pago=pp.forma_pago,
        ))
        if pp.caja_id:
            db.add(TesoreriaMovimientoCaja(
                municipio_id=muni_id, caja_id=pp.caja_id, gasto_id=gasto.id,
                tipo=TipoMovimientoCaja.EGRESO, monto=monto, fecha=fecha,
                concepto=pp.concepto,
            ))
        # ultimo_pago ya quedó claimeado arriba
        pp.proximo_pago = _calcular_proximo_pago(pp.proximo_pago, pp.frecuencia, pp.dia_del_mes)
        if pp.fecha_fin and pp.proximo_pago > pp.fecha_fin:
            pp.activo = False
        items.append(EjecutarMasivoItem(pago_id=pid, ok=True, gasto_id=gasto.id))
        monto_total_acum += monto
        exitosos += 1

    await db.commit()
    return EjecutarMasivoResponse(
        total=len(ids),
        exitosos=exitosos,
        fallidos=len(ids) - exitosos,
        monto_total=monto_total_acum,
        items=items,
    )


@router.post("/{pp_id}/omitir")
async def omitir_pago(
    pp_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Omite el pago de este periodo: NO crea gasto, NO descuenta caja,
    pero avanza proximo_pago al siguiente periodo segun la frecuencia.

    Util cuando un pago programado no aplica en este periodo puntual
    (ej. el empleado no se gano el premio, hubo licencia, etc.) pero
    debe volver a recordarse al periodo siguiente.
    """
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    pp = (await db.execute(
        select(TesoreriaPagoProgramado).where(
            TesoreriaPagoProgramado.id == pp_id,
            TesoreriaPagoProgramado.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not pp:
        raise HTTPException(404, "No encontrado")
    if not pp.activo:
        raise HTTPException(409, "Pago programado inactivo")

    omitido = pp.proximo_pago
    pp.proximo_pago = _calcular_proximo_pago(pp.proximo_pago, pp.frecuencia, pp.dia_del_mes)
    if pp.fecha_fin and pp.proximo_pago > pp.fecha_fin:
        pp.activo = False
    await db.commit()
    return {
        "ok": True,
        "omitido": omitido.isoformat() if omitido else None,
        "proximo_pago": pp.proximo_pago.isoformat() if pp.activo else None,
        "activo": pp.activo,
    }


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
