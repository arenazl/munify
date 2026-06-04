"""API de Gastos del modulo Tesoreria.

Cada gasto se asocia a una dependencia (Secretaria X) o a un contacto
(persona fisica). Al crear el gasto se generan automaticamente las
cuotas segun el tipo_financiacion:
  - contado:    1 cuota marcada como pagada
  - cuotas:     N cuotas mensuales (cuotas_total)
  - prestamo:   igual a cuotas, semantica distinta
  - recurrente: cuotas segun frecuencia, hasta fecha_fin_recurrencia
                (default 12 meses si fecha_fin es null)

Solo admin del municipio gestiona gastos.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional
from calendar import monthrange

import cloudinary.uploader
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Response, UploadFile, File
from sqlalchemy import select, and_, or_, func, extract, case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    Gasto, GastoCuota, Contacto, MunicipioDependencia, User, RolUsuario,
    EstadoGastoCuota, Proyecto, GastoProyecto,
    TesoreriaMovimientoCaja, TipoMovimientoCaja,
)
from models.gasto import TipoFinanciacion, EstadoPagoGasto
from models.dependencia import Dependencia
from schemas.tesoreria import (
    GastoCreate, GastoUpdate, GastoResponse, GastoProyectoResponse,
    GastoProyectoAssignment,
    GastoCuotaPagarPayload,
    ProyeccionResponse, ProyeccionMes, DesgloseTipoFinanciacion,
    CuotaProyeccionResponse,
)

router = APIRouter()


def _require_admin(user: User):
    # Admin del muni o supervisor del muni (no dependencia) pueden gestionar
    # gastos. Los supervisores de dependencia y vecinos no.
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar gastos")


async def _sincronizar_movimiento_caja(db: AsyncSession, gasto: Gasto, municipio_id: int) -> None:
    """Sincroniza TesoreriaMovimientoCaja del gasto con su estado actual.

    Reglas:
      - Solo aplica para gastos tipo CONTADO. Para cuotas/prestamo/recurrente,
        cada cuota al pagarse crea su propio movimiento (ver `pagar_cuota`).
      - Borra movimientos previos del gasto.
      - Si el gasto tiene caja_id y esta CONCRETADO, crea movimiento de
        egreso por el monto total. Si no (sin caja o pendiente), no crea
        nada — la caja queda intacta hasta que se concrete el pago.
    """
    from sqlalchemy import delete as sa_delete
    if gasto.tipo_financiacion != TipoFinanciacion.CONTADO:
        return
    await db.execute(
        sa_delete(TesoreriaMovimientoCaja).where(TesoreriaMovimientoCaja.gasto_id == gasto.id)
    )
    if gasto.caja_id and gasto.estado_pago == EstadoPagoGasto.CONCRETADO:
        db.add(TesoreriaMovimientoCaja(
            municipio_id=municipio_id,
            caja_id=gasto.caja_id,
            gasto_id=gasto.id,
            tipo=TipoMovimientoCaja.EGRESO,
            monto=gasto.monto_pesos,
            fecha=gasto.fecha,
            concepto=gasto.concepto,
        ))


def _gasto_to_response(gasto: Gasto) -> GastoResponse:
    """Serializa un gasto a su response (con cuotas y proyectos imputados).

    Requiere que el gasto se haya cargado con selectinload de cuotas,
    proyectos_asignados y GastoProyecto.proyecto. Caso contrario lanza
    MissingGreenlet al acceder a las relaciones.
    """
    resp = GastoResponse.model_validate(gasto)
    resp.proyectos = [
        GastoProyectoResponse(
            proyecto_id=gp.proyecto_id,
            proyecto_nombre=gp.proyecto.nombre if gp.proyecto else "",
            monto_asignado=gp.monto_asignado,
        )
        for gp in (gasto.proyectos_asignados or [])
    ]
    return resp


async def _validar_imputaciones(
    db: AsyncSession,
    gasto: Gasto,
    asignaciones: List[GastoProyectoAssignment],
    municipio_id: int,
):
    """Valida la lista de imputaciones sin tocar la DB.

    - SUM(monto_asignado) <= gasto.monto_pesos
    - No se repite el mismo proyecto_id
    - Cada proyecto_id existe y es del muni correcto
    """
    if not asignaciones:
        return
    proyecto_ids = [a.proyecto_id for a in asignaciones]
    if len(set(proyecto_ids)) != len(proyecto_ids):
        raise HTTPException(status_code=422, detail="No se puede imputar el mismo proyecto dos veces")

    total_asignado = sum((Decimal(a.monto_asignado) for a in asignaciones), Decimal(0))
    if total_asignado > Decimal(gasto.monto_pesos):
        raise HTTPException(
            status_code=422,
            detail=f"La suma imputada (${total_asignado}) supera el monto del gasto (${gasto.monto_pesos})",
        )

    found = (await db.execute(
        select(Proyecto.id).where(
            Proyecto.id.in_(proyecto_ids),
            Proyecto.municipio_id == municipio_id,
        )
    )).scalars().all()
    faltantes = set(proyecto_ids) - set(found)
    if faltantes:
        raise HTTPException(status_code=422, detail=f"Proyectos no encontrados: {sorted(faltantes)}")


async def _crear_imputaciones(
    db: AsyncSession,
    gasto: Gasto,
    asignaciones: List[GastoProyectoAssignment],
    municipio_id: int,
):
    """Crea las imputaciones de un gasto nuevo (asume gasto.id ya seteado)."""
    await _validar_imputaciones(db, gasto, asignaciones, municipio_id)
    for a in asignaciones:
        db.add(GastoProyecto(
            gasto_id=gasto.id,
            proyecto_id=a.proyecto_id,
            monto_asignado=a.monto_asignado,
        ))


async def _reemplazar_imputaciones(
    db: AsyncSession,
    gasto: Gasto,
    asignaciones: List[GastoProyectoAssignment],
    municipio_id: int,
):
    """Reemplaza las imputaciones existentes (asume relacion ya cargada con selectinload)."""
    await _validar_imputaciones(db, gasto, asignaciones, municipio_id)
    # Borrar las viejas (ya cargadas eagerly) y FLUSHEAR antes de insertar
    # las nuevas, sino SQLAlchemy puede reordenar el INSERT antes del DELETE
    # y caemos en UNIQUE (gasto_id, proyecto_id) si la imputacion era la misma.
    for old in list(gasto.proyectos_asignados or []):
        await db.delete(old)
    await db.flush()
    # Insertar las nuevas
    for a in asignaciones:
        db.add(GastoProyecto(
            gasto_id=gasto.id,
            proyecto_id=a.proyecto_id,
            monto_asignado=a.monto_asignado,
        ))


def _add_months(d: date, months: int) -> date:
    """Suma N meses preservando el dia (clamp al ultimo dia del mes)."""
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    last_day = monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


def _delta_frecuencia(frecuencia: str) -> int:
    """Cantidad de meses entre cuotas segun frecuencia."""
    return {
        "semanal": 0,        # caso especial, se maneja con dias
        "quincenal": 0,
        "mensual": 1,
        "bimestral": 2,
        "trimestral": 3,
        "anual": 12,
    }.get(frecuencia, 1)


def _generar_cuotas(gasto: Gasto) -> List[GastoCuota]:
    """Genera la lista de cuotas planificadas para un gasto recien creado.

    NO las inserta en la DB — el caller hace `db.add_all(cuotas)`.
    """
    cuotas: List[GastoCuota] = []

    if gasto.tipo_financiacion == "contado":
        cuotas.append(GastoCuota(
            gasto_id=gasto.id,
            numero=1,
            monto=gasto.monto_pesos,
            fecha_vencimiento=gasto.fecha,
            fecha_pago=gasto.fecha,
            estado=EstadoGastoCuota.PAGADA,
            forma_pago=gasto.forma_pago,
        ))
        return cuotas

    if gasto.tipo_financiacion in ("cuotas", "prestamo"):
        total = gasto.cuotas_total or 1
        monto_cuota = (Decimal(gasto.monto_pesos) / Decimal(total)).quantize(Decimal("0.01"))
        for i in range(total):
            fecha_venc = _add_months(gasto.fecha, i)
            cuotas.append(GastoCuota(
                gasto_id=gasto.id,
                numero=i + 1,
                monto=monto_cuota,
                fecha_vencimiento=fecha_venc,
                estado=EstadoGastoCuota.PENDIENTE,
            ))
        return cuotas

    if gasto.tipo_financiacion == "recurrente":
        frecuencia = gasto.frecuencia or "mensual"
        # Hasta fecha_fin_recurrencia, o 12 ocurrencias por default.
        fecha_fin = gasto.fecha_fin_recurrencia or _add_months(gasto.fecha, 12)
        delta_meses = _delta_frecuencia(frecuencia)
        delta_dias = 7 if frecuencia == "semanal" else (15 if frecuencia == "quincenal" else 0)

        fecha_actual = gasto.fecha
        numero = 1
        while fecha_actual <= fecha_fin and numero <= 120:
            cuotas.append(GastoCuota(
                gasto_id=gasto.id,
                numero=numero,
                monto=gasto.monto_pesos,
                fecha_vencimiento=fecha_actual,
                estado=EstadoGastoCuota.PENDIENTE,
            ))
            if delta_dias:
                fecha_actual = fecha_actual + timedelta(days=delta_dias)
            else:
                fecha_actual = _add_months(fecha_actual, delta_meses)
            numero += 1
        return cuotas

    # fallback: 1 cuota contado
    cuotas.append(GastoCuota(
        gasto_id=gasto.id,
        numero=1,
        monto=gasto.monto_pesos,
        fecha_vencimiento=gasto.fecha,
        estado=EstadoGastoCuota.PENDIENTE,
    ))
    return cuotas


# ============================================================
# CRUD
# ============================================================

def _build_gastos_filter_query(municipio_id, destino_tipo, contacto_id, dependencia_id,
                                concepto, search, desde, hasta, estado_pago):
    """Construye query con filtros (sin offset/limit/order_by/options).
    Reutilizable para list paginado + count."""
    query = select(Gasto).where(
        Gasto.municipio_id == municipio_id,
        Gasto.activo == True,  # noqa: E712
    )
    if destino_tipo:
        query = query.where(Gasto.destino_tipo == destino_tipo)
    if contacto_id:
        query = query.where(Gasto.destino_contacto_id == contacto_id)
    if dependencia_id:
        query = query.where(Gasto.destino_dependencia_id == dependencia_id)
    if concepto:
        query = query.where(Gasto.concepto == concepto)
    if search and search.strip():
        s = f"%{search.strip()}%"
        # outerjoin a Contacto para poder matchear nombre/apellido del destinatario.
        query = query.outerjoin(Contacto, Gasto.destino_contacto_id == Contacto.id).where(or_(
            Gasto.concepto.ilike(s),
            Gasto.descripcion.ilike(s),
            Gasto.observaciones.ilike(s),
            Contacto.nombre.ilike(s),
            Contacto.apellido.ilike(s),
        ))
    if desde:
        query = query.where(Gasto.fecha >= desde)
    if hasta:
        query = query.where(Gasto.fecha <= hasta)
    if estado_pago:
        query = query.where(Gasto.estado_pago == estado_pago)
    return query


# Dashboard IA (declarado ANTES de /{gasto_id} para que no caiga en esa ruta).
@router.get("/dashboard-ia")
async def tesoreria_dashboard_ia_top(
    request: Request,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    from core.tenancy import get_effective_municipio_id
    municipio_id = get_effective_municipio_id(request, current_user)
    if not municipio_id:
        return {"urgentes": [], "recomendaciones": [], "secciones": [], "generadoEn": None}
    from core.ia_config import get_ia_config
    _cfg = await get_ia_config(db, municipio_id)
    if not (_cfg.habilitada and _cfg.tesoreria):
        return {"urgentes": [], "recomendaciones": [], "secciones": [], "generadoEn": None}
    from services.dashboard_ia import build_tesoreria_dashboard
    return await build_tesoreria_dashboard(db, municipio_id, force=force)


@router.get("", response_model=List[GastoResponse])
async def list_gastos(
    response: Response,
    request: Request,
    destino_tipo: Optional[str] = None,
    contacto_id: Optional[int] = None,
    dependencia_id: Optional[int] = None,
    concepto: Optional[str] = None,
    search: Optional[str] = Query(None, description="Busca en concepto/descripcion/observaciones"),
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    estado_pago: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    base = _build_gastos_filter_query(municipio_id, destino_tipo, contacto_id, dependencia_id,
                                       concepto, search, desde, hasta, estado_pago)

    # Total filtrado (sin paginar) para que el frontend calcule paginas
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    # Items paginados con relaciones cargadas
    items_q = (
        base.options(
            selectinload(Gasto.cuotas),
            selectinload(Gasto.contacto),
            selectinload(Gasto.proyectos_asignados).selectinload(GastoProyecto.proyecto),
        )
        .order_by(Gasto.fecha.desc(), Gasto.id.desc())
        .offset(skip).limit(limit)
    )
    result = await db.execute(items_q)
    gastos = result.scalars().unique().all()
    return [_gasto_to_response(g) for g in gastos]


@router.post("", response_model=GastoResponse, status_code=201)
async def create_gasto(
    payload: GastoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validacion del destino: solo uno de los dos FK debe estar
    if payload.destino_tipo == "dependencia":
        if not payload.destino_dependencia_id:
            raise HTTPException(status_code=422, detail="destino_dependencia_id requerido")
        payload_dict = payload.model_dump(exclude={"proyectos"})
        payload_dict["destino_contacto_id"] = None
    elif payload.destino_tipo == "contacto":
        if not payload.destino_contacto_id:
            raise HTTPException(status_code=422, detail="destino_contacto_id requerido")
        payload_dict = payload.model_dump(exclude={"proyectos"})
        payload_dict["destino_dependencia_id"] = None
    else:
        raise HTTPException(status_code=422, detail="destino_tipo invalido")

    # Validar caja_id si viene (debe pertenecer al muni del user)
    if payload.caja_id is not None:
        from models import TesoreriaCaja
        caja = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.id == payload.caja_id,
                TesoreriaCaja.municipio_id == municipio_id,
            )
        )).scalar_one_or_none()
        if not caja:
            raise HTTPException(status_code=422, detail="caja_id invalido para este municipio")

    # Calcular monto_usd si hay cotizacion
    monto_usd = None
    if payload.cotizacion_usd and payload.cotizacion_usd > 0:
        monto_usd = (Decimal(payload.monto_pesos) / Decimal(payload.cotizacion_usd)).quantize(Decimal("0.01"))

    gasto = Gasto(
        municipio_id=municipio_id,
        creador_id=current_user.id,
        monto_usd=monto_usd,
        **payload_dict,
    )
    db.add(gasto)
    await db.flush()  # asignar id

    # Generar cuotas
    cuotas = _generar_cuotas(gasto)
    db.add_all(cuotas)

    # Imputaciones a proyectos (opcional)
    if payload.proyectos:
        await _crear_imputaciones(db, gasto, payload.proyectos, municipio_id)

    # Movimiento de caja (descuenta la caja si es contado + concretado).
    await _sincronizar_movimiento_caja(db, gasto, municipio_id)

    await db.commit()

    # Re-cargar el gasto con todas las relaciones eagerly, para evitar
    # MissingGreenlet al serializar la respuesta.
    result = await db.execute(
        select(Gasto)
        .options(
            selectinload(Gasto.cuotas),
            selectinload(Gasto.contacto),
            selectinload(Gasto.proyectos_asignados).selectinload(GastoProyecto.proyecto),
        )
        .where(Gasto.id == gasto.id)
    )
    return _gasto_to_response(result.scalar_one())


@router.get("/{gasto_id}", response_model=GastoResponse)
async def get_gasto(
    gasto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Gasto)
        .options(
            selectinload(Gasto.cuotas),
            selectinload(Gasto.contacto),
            selectinload(Gasto.proyectos_asignados).selectinload(GastoProyecto.proyecto),
        )
        .where(Gasto.id == gasto_id, Gasto.municipio_id == municipio_id)
    )
    gasto = result.scalar_one_or_none()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    return _gasto_to_response(gasto)


@router.put("/{gasto_id}", response_model=GastoResponse)
async def update_gasto(
    gasto_id: int,
    payload: GastoUpdate,
    request: Request,
    force_regenerate: bool = Query(
        False,
        description=(
            "Si true, regenera cuotas aunque haya cuotas pagadas. Se usa cuando "
            "el frontend ya le pidio confirmacion al user. Para gastos contado "
            "no hace falta — la unica cuota se actualiza in-place sin perder data."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Gasto)
        .options(
            selectinload(Gasto.cuotas),
            selectinload(Gasto.proyectos_asignados).selectinload(GastoProyecto.proyecto),
        )
        .where(Gasto.id == gasto_id, Gasto.municipio_id == municipio_id)
    )
    gasto = result.scalar_one_or_none()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    # Validar caja_id si viene en el update (pertenece al mismo muni)
    if payload.caja_id is not None:
        from models import TesoreriaCaja
        caja = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.id == payload.caja_id,
                TesoreriaCaja.municipio_id == municipio_id,
            )
        )).scalar_one_or_none()
        if not caja:
            raise HTTPException(status_code=422, detail="caja_id invalido para este municipio")

    payload_data = payload.model_dump(exclude_unset=True)
    payload_data.pop("proyectos", None)  # se procesa aparte

    # Detectar si cambian campos que regeneran las cuotas.
    # Comparacion robusta: Decimal y date no se comparan con str().
    CAMPOS_REGEN = ("monto_pesos", "fecha", "tipo_financiacion",
                    "cuotas_total", "frecuencia", "fecha_fin_recurrencia")

    def _campo_cambio(field: str) -> bool:
        if field not in payload_data:
            return False
        actual = getattr(gasto, field)
        nuevo = payload_data[field]
        if actual is None and nuevo is None:
            return False
        if actual is None or nuevo is None:
            return True
        # Decimal: comparar como Decimal
        if field == "monto_pesos":
            try:
                return Decimal(str(actual)) != Decimal(str(nuevo))
            except Exception:
                return True
        # date: comparar como date (puede venir como str ISO)
        if field in ("fecha", "fecha_fin_recurrencia"):
            actual_s = actual.isoformat() if hasattr(actual, "isoformat") else str(actual)
            nuevo_s = nuevo.isoformat() if hasattr(nuevo, "isoformat") else str(nuevo)
            return actual_s != nuevo_s
        # enums: comparar por value
        actual_v = actual.value if hasattr(actual, "value") else actual
        nuevo_v = nuevo.value if hasattr(nuevo, "value") else nuevo
        return actual_v != nuevo_v

    requiere_regen = any(_campo_cambio(f) for f in CAMPOS_REGEN)

    # Tipo de financiacion FINAL del gasto despues del update. Si no cambia,
    # mantiene el actual.
    tipo_fin_final = (
        payload_data.get("tipo_financiacion")
        or (gasto.tipo_financiacion.value if hasattr(gasto.tipo_financiacion, "value") else gasto.tipo_financiacion)
    )

    # Caso especial CONTADO: la unica "cuota pagada" no es un plan de pago
    # real, es un reflejo del gasto en si. Si el tipo era contado y sigue
    # siendo contado, NO regeneramos cuotas — solo actualizamos la unica
    # cuota in-place con el nuevo monto/fecha (mas abajo). No chequeamos
    # cuotas pagadas, no hay 409.
    es_contado_puro = (
        tipo_fin_final == "contado"
        and (gasto.tipo_financiacion.value if hasattr(gasto.tipo_financiacion, "value") else gasto.tipo_financiacion) == "contado"
    )

    # Si regenera cuotas Y NO es contado puro Y hay cuotas pagadas reales:
    # bloquear con 409 a menos que el frontend pase force_regenerate=true
    # (lo va a hacer despues de que el user confirme en el ConfirmModal).
    if requiere_regen and not es_contado_puro and not force_regenerate:
        cuotas_pagadas = [c for c in (gasto.cuotas or []) if c.estado == EstadoGastoCuota.PAGADA]
        if cuotas_pagadas:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "cuotas_pagadas_existentes",
                    "cuotas_pagadas": len(cuotas_pagadas),
                    "message": (
                        f"Hay {len(cuotas_pagadas)} cuota(s) pagada(s). Regenerar "
                        "el plan de pagos las va a borrar. Confirma para continuar."
                    ),
                },
            )

    # Si cambian destino_tipo, limpiar el FK del otro lado para evitar
    # gastos con destino_tipo=contacto pero destino_dependencia_id seteado.
    if "destino_tipo" in payload_data:
        if payload_data["destino_tipo"] == "contacto":
            payload_data.setdefault("destino_dependencia_id", None)
            if not payload_data.get("destino_contacto_id") and not gasto.destino_contacto_id:
                raise HTTPException(422, "destino_contacto_id requerido")
        elif payload_data["destino_tipo"] == "dependencia":
            payload_data.setdefault("destino_contacto_id", None)
            if not payload_data.get("destino_dependencia_id") and not gasto.destino_dependencia_id:
                raise HTTPException(422, "destino_dependencia_id requerido")

    # Aplicar cambios
    for k, v in payload_data.items():
        setattr(gasto, k, v)

    # Recalcular monto_usd si cambio monto o cotizacion
    if "monto_pesos" in payload_data or "cotizacion_usd" in payload_data:
        if gasto.cotizacion_usd and Decimal(gasto.cotizacion_usd) > 0:
            gasto.monto_usd = (Decimal(gasto.monto_pesos) / Decimal(gasto.cotizacion_usd)).quantize(Decimal("0.01"))
        else:
            gasto.monto_usd = None

    # Ajuste de cuotas tras los cambios:
    #   - Contado puro: la cuota unica es reflejo del gasto. Solo updateamos
    #     monto/fecha de esa cuota, sin borrar nada. Si por algun motivo
    #     no hay cuota (raro), la creamos.
    #   - Otros tipos: si requiere regen, borrar todas las cuotas (incluso
    #     las pagadas si force_regenerate=true) y crear el plan nuevo.
    if requiere_regen and es_contado_puro:
        cuotas = list(gasto.cuotas or [])
        if cuotas:
            unica = cuotas[0]
            unica.monto = gasto.monto_pesos
            unica.fecha_vencimiento = gasto.fecha
            unica.fecha_pago = gasto.fecha
            unica.estado = EstadoGastoCuota.PAGADA
            unica.forma_pago = gasto.forma_pago
            # Borrar cuotas extra (si hubiera mas de 1 por alguna migracion)
            for extra in cuotas[1:]:
                await db.delete(extra)
        else:
            db.add_all(_generar_cuotas(gasto))
    elif requiere_regen:
        for c in list(gasto.cuotas or []):
            await db.delete(c)
        await db.flush()
        gasto.cuotas = []
        nuevas = _generar_cuotas(gasto)
        db.add_all(nuevas)

    # Si vinieron proyectos en el payload (incluso lista vacia), reasignar.
    if payload.proyectos is not None:
        await _reemplazar_imputaciones(db, gasto, payload.proyectos, municipio_id)

    # Sincronizar movimiento de caja con el nuevo estado del gasto.
    # Maneja cambios de caja_id, monto, estado_pago (pendiente <-> concretado).
    await _sincronizar_movimiento_caja(db, gasto, municipio_id)

    await db.commit()

    # Expirar la cache de la session para que el re-query no devuelva
    # collections viejas (las imputaciones se reemplazaron pero el objeto
    # cacheado en memoria todavia tiene las anteriores).
    db.expire_all()

    # Re-cargar para devolver con relaciones frescas
    result = await db.execute(
        select(Gasto)
        .options(
            selectinload(Gasto.cuotas),
            selectinload(Gasto.contacto),
            selectinload(Gasto.proyectos_asignados).selectinload(GastoProyecto.proyecto),
        )
        .where(Gasto.id == gasto_id)
    )
    return _gasto_to_response(result.scalar_one())


@router.delete("/{gasto_id}")
async def delete_gasto(
    gasto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Gasto).where(Gasto.id == gasto_id, Gasto.municipio_id == municipio_id)
    )
    gasto = result.scalar_one_or_none()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    gasto.activo = False
    # Borrar movimientos de caja asociados — el gasto eliminado ya no
    # debe seguir descontando la caja.
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(TesoreriaMovimientoCaja).where(TesoreriaMovimientoCaja.gasto_id == gasto.id)
    )
    await db.commit()
    return {"ok": True, "id": gasto_id}


# ============================================================
# Cuotas
# ============================================================

@router.post("/cuotas/{cuota_id}/pagar")
async def pagar_cuota(
    cuota_id: int,
    payload: GastoCuotaPagarPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(GastoCuota)
        .join(Gasto, GastoCuota.gasto_id == Gasto.id)
        .options(selectinload(GastoCuota.gasto))
        .where(GastoCuota.id == cuota_id, Gasto.municipio_id == municipio_id)
    )
    cuota = result.scalar_one_or_none()
    if not cuota:
        raise HTTPException(status_code=404, detail="Cuota no encontrada")

    cuota.estado = EstadoGastoCuota.PAGADA
    cuota.fecha_pago = payload.fecha_pago or date.today()
    if payload.forma_pago:
        cuota.forma_pago = payload.forma_pago
    if payload.comprobante:
        cuota.comprobante = payload.comprobante
    if payload.notas:
        cuota.notas = payload.notas

    # Si el gasto madre tiene caja_id, descontamos el monto de la cuota
    # individual de esa caja. Solo aplica para gastos a cuotas/prestamo/
    # recurrente — el contado ya tuvo su movimiento al crearse.
    gasto = cuota.gasto
    if gasto and gasto.caja_id and gasto.tipo_financiacion != TipoFinanciacion.CONTADO:
        db.add(TesoreriaMovimientoCaja(
            municipio_id=municipio_id,
            caja_id=gasto.caja_id,
            gasto_id=gasto.id,
            tipo=TipoMovimientoCaja.EGRESO,
            monto=cuota.monto,
            fecha=cuota.fecha_pago,
            concepto=f"{gasto.concepto} · Cuota {cuota.numero}/{gasto.cuotas_total or '?'}",
        ))

    await db.commit()
    return {"ok": True, "cuota_id": cuota_id, "estado": "pagada"}


# ============================================================
# Proyecciones
# ============================================================

def _filtros_proyeccion(
    municipio_id: int,
    desde: date,
    hasta: date,
    destino_dependencia_id: Optional[int],
    destino_contacto_id: Optional[int],
    tipo_financiacion: Optional[str],
    concepto: Optional[str],
) -> list:
    """Construye la lista de WHEREs comunes para queries de proyeccion.

    Centralizada asi el endpoint padre y el de drill-down filtran identico.
    """
    wheres: list = [
        Gasto.municipio_id == municipio_id,
        Gasto.activo == True,  # noqa: E712
        GastoCuota.estado.in_([EstadoGastoCuota.PENDIENTE, EstadoGastoCuota.VENCIDA]),
        GastoCuota.fecha_vencimiento >= desde,
        GastoCuota.fecha_vencimiento <= hasta,
    ]
    if destino_dependencia_id is not None:
        wheres.append(Gasto.destino_dependencia_id == destino_dependencia_id)
    if destino_contacto_id is not None:
        wheres.append(Gasto.destino_contacto_id == destino_contacto_id)
    if tipo_financiacion:
        try:
            tf_enum = TipoFinanciacion(tipo_financiacion)
            wheres.append(Gasto.tipo_financiacion == tf_enum)
        except ValueError:
            raise HTTPException(400, f"tipo_financiacion invalido: {tipo_financiacion}")
    if concepto:
        wheres.append(Gasto.concepto.ilike(f"%{concepto}%"))
    return wheres


@router.get("/proyecciones/cobros", response_model=ProyeccionResponse)
async def proyecciones_cobros(
    request: Request,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    destino_dependencia_id: Optional[int] = None,
    destino_contacto_id: Optional[int] = None,
    tipo_financiacion: Optional[str] = None,
    concepto: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suma cuotas pendientes agrupadas por mes en un rango.

    Filtros opcionales:
      - destino_dependencia_id: solo cuotas de gastos a esa dependencia
      - destino_contacto_id: solo cuotas de gastos a ese contacto
      - tipo_financiacion: cuotas | prestamo | recurrente (contado no aplica)
      - concepto: ILIKE substring search en el concepto del gasto

    Default: desde hoy hasta dentro de 12 meses.
    """
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    hoy = date.today()
    if not desde:
        desde = hoy
    if not hasta:
        hasta = _add_months(desde, 12)

    wheres = _filtros_proyeccion(
        municipio_id, desde, hasta,
        destino_dependencia_id, destino_contacto_id, tipo_financiacion, concepto,
    )

    # CASE para contar cuotas vencidas por mes en una sola pasada
    vencida_case = case(
        (GastoCuota.estado == EstadoGastoCuota.VENCIDA, 1),
        else_=0,
    )

    # Query 1: agregado por mes
    query_mes = (
        select(
            extract("year", GastoCuota.fecha_vencimiento).label("anio"),
            extract("month", GastoCuota.fecha_vencimiento).label("mes"),
            func.sum(GastoCuota.monto).label("total_pesos"),
            func.count(GastoCuota.id).label("cantidad"),
            func.sum(vencida_case).label("vencidas"),
        )
        .join(Gasto, GastoCuota.gasto_id == Gasto.id)
        .where(*wheres)
        .group_by("anio", "mes")
        .order_by("anio", "mes")
    )
    rows = (await db.execute(query_mes)).all()

    por_mes = [
        ProyeccionMes(
            anio=int(r.anio),
            mes=int(r.mes),
            total_pesos=Decimal(r.total_pesos or 0),
            cantidad_cuotas=int(r.cantidad),
            cuotas_vencidas=int(r.vencidas or 0),
        )
        for r in rows
    ]

    # Query 2: desglose por tipo_financiacion del gasto madre
    query_tipo = (
        select(
            Gasto.tipo_financiacion.label("tipo"),
            func.sum(GastoCuota.monto).label("total_pesos"),
            func.count(GastoCuota.id).label("cantidad"),
        )
        .join(Gasto, GastoCuota.gasto_id == Gasto.id)
        .where(*wheres)
        .group_by(Gasto.tipo_financiacion)
    )
    tipo_rows = (await db.execute(query_tipo)).all()
    desglose_por_tipo = [
        DesgloseTipoFinanciacion(
            tipo=(r.tipo.value if hasattr(r.tipo, "value") else str(r.tipo)),
            total_pesos=Decimal(r.total_pesos or 0),
            cantidad_cuotas=int(r.cantidad),
        )
        for r in tipo_rows
    ]

    total_pesos = sum((p.total_pesos for p in por_mes), Decimal(0))
    cantidad = sum((p.cantidad_cuotas for p in por_mes), 0)
    cuotas_vencidas = sum((p.cuotas_vencidas for p in por_mes), 0)

    # mes_pico: el mes con mayor total_pesos (None si por_mes esta vacio)
    mes_pico = max(por_mes, key=lambda p: p.total_pesos) if por_mes else None

    return ProyeccionResponse(
        desde=desde,
        hasta=hasta,
        total_pesos=total_pesos,
        cantidad_cuotas=cantidad,
        cuotas_vencidas=cuotas_vencidas,
        mes_pico=mes_pico,
        por_mes=por_mes,
        desglose_por_tipo=desglose_por_tipo,
    )


@router.get("/proyecciones/cobros/cuotas", response_model=List[CuotaProyeccionResponse])
async def proyecciones_cuotas_del_mes(
    request: Request,
    anio: int,
    mes: int,
    destino_dependencia_id: Optional[int] = None,
    destino_contacto_id: Optional[int] = None,
    tipo_financiacion: Optional[str] = None,
    concepto: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Drill-down: lista las cuotas individuales de un mes especifico.

    Usa los mismos filtros que el endpoint padre para que el detalle sea
    consistente con la suma agregada.
    """
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    # Rango = mes completo
    desde_mes = date(anio, mes, 1)
    last_day = monthrange(anio, mes)[1]
    hasta_mes = date(anio, mes, last_day)

    wheres = _filtros_proyeccion(
        municipio_id, desde_mes, hasta_mes,
        destino_dependencia_id, destino_contacto_id, tipo_financiacion, concepto,
    )

    query = (
        select(
            GastoCuota.id.label("cuota_id"),
            GastoCuota.gasto_id,
            GastoCuota.numero,
            GastoCuota.monto,
            GastoCuota.fecha_vencimiento,
            GastoCuota.estado,
            Gasto.concepto,
            Gasto.cuotas_total,
            Gasto.tipo_financiacion,
            Contacto.nombre.label("contacto_nombre"),
            Contacto.apellido.label("contacto_apellido"),
            Dependencia.nombre.label("dependencia_nombre"),
        )
        .join(Gasto, GastoCuota.gasto_id == Gasto.id)
        .outerjoin(Contacto, Gasto.destino_contacto_id == Contacto.id)
        .outerjoin(MunicipioDependencia, Gasto.destino_dependencia_id == MunicipioDependencia.id)
        .outerjoin(Dependencia, MunicipioDependencia.dependencia_id == Dependencia.id)
        .where(*wheres)
        .order_by(GastoCuota.fecha_vencimiento, GastoCuota.id)
    )
    rows = (await db.execute(query)).all()

    return [
        CuotaProyeccionResponse(
            cuota_id=int(r.cuota_id),
            gasto_id=int(r.gasto_id),
            concepto=r.concepto or "",
            contacto_nombre=(
                f"{r.contacto_nombre or ''} {r.contacto_apellido or ''}".strip() or None
            ),
            dependencia_nombre=r.dependencia_nombre,
            monto=Decimal(r.monto or 0),
            fecha_vencimiento=r.fecha_vencimiento,
            estado=(r.estado.value if hasattr(r.estado, "value") else str(r.estado)),
            numero_cuota=int(r.numero),
            total_cuotas=(int(r.cuotas_total) if r.cuotas_total is not None else None),
            tipo_financiacion=(
                r.tipo_financiacion.value if hasattr(r.tipo_financiacion, "value")
                else str(r.tipo_financiacion)
            ),
        )
        for r in rows
    ]



# ===========================================
# Dashboard IA — analisis operativo Tesoreria
# ===========================================
@router.get("/dashboard-ia")
async def tesoreria_dashboard_ia(
    request: Request,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    from core.tenancy import get_effective_municipio_id
    municipio_id = get_effective_municipio_id(request, current_user)
    if not municipio_id:
        return {"urgentes": [], "recomendaciones": [], "secciones": [], "generadoEn": None}
    from core.ia_config import get_ia_config
    _cfg = await get_ia_config(db, municipio_id)
    if not (_cfg.habilitada and _cfg.tesoreria):
        return {"urgentes": [], "recomendaciones": [], "secciones": [], "generadoEn": None}
    from services.dashboard_ia import build_tesoreria_dashboard
    return await build_tesoreria_dashboard(db, municipio_id, force=force)


@router.post("/upload-factura")
async def upload_factura_gasto(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Sube el PDF/imagen de la factura asociada a un gasto a Cloudinary.
    Devuelve la URL para guardar en factura_url. Mismo patron que OPs."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    if not file.content_type:
        raise HTTPException(422, "Tipo de archivo desconocido")
    ct = file.content_type
    is_pdf = ct == "application/pdf"
    if is_pdf:
        resource_type = "raw"
    elif ct.startswith("image/"):
        resource_type = "image"
    else:
        raise HTTPException(422, "Solo se permiten PDF o imagenes")
    try:
        result = cloudinary.uploader.upload(
            file.file,
            folder=f"facturas-gasto/muni-{municipio_id}",
            resource_type=resource_type,
        )
    except Exception as e:
        raise HTTPException(500, f"Error subiendo factura: {e}")
    return {
        "url": result.get("secure_url") or result.get("url"),
        "public_id": result.get("public_id"),
        "resource_type": resource_type,
    }


@router.get("/stats/reportes")
async def reportes_tesoreria(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reportes para Tesoreria:
      - por_caja: movimientos del mes actual agrupados por caja.
      - top_conceptos: conceptos con mas gasto del mes.
      - top_dependencias: dependencias con mas gasto del mes.
      - mensuales: ultimos 6 meses de gasto total.
    """
    from datetime import timedelta
    from models import TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja, MunicipioDependencia
    from models.dependencia import Dependencia
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    hoy = date.today()
    inicio_mes = hoy.replace(day=1)
    desde_6m = (inicio_mes - timedelta(days=180)).replace(day=1)

    # Movimientos por caja (mes actual)
    por_caja_rows = (await db.execute(
        select(
            TesoreriaCaja.id, TesoreriaCaja.nombre, TesoreriaCaja.color,
            func.coalesce(func.sum(TesoreriaMovimientoCaja.monto), 0),
            func.count(TesoreriaMovimientoCaja.id),
        )
        .join(TesoreriaMovimientoCaja, TesoreriaMovimientoCaja.caja_id == TesoreriaCaja.id)
        .where(
            TesoreriaCaja.municipio_id == municipio_id,
            TesoreriaMovimientoCaja.tipo == TipoMovimientoCaja.EGRESO,
            TesoreriaMovimientoCaja.fecha >= inicio_mes,
        )
        .group_by(TesoreriaCaja.id, TesoreriaCaja.nombre, TesoreriaCaja.color)
        .order_by(func.sum(TesoreriaMovimientoCaja.monto).desc())
    )).all()
    por_caja = [
        {"id": int(i), "nombre": n, "color": c, "monto": str(m), "cantidad": int(cnt)}
        for i, n, c, m, cnt in por_caja_rows
    ]

    # Top conceptos del mes
    top_conceptos_rows = (await db.execute(
        select(
            Gasto.concepto,
            func.count(Gasto.id),
            func.coalesce(func.sum(Gasto.monto_pesos), 0),
        )
        .where(
            Gasto.municipio_id == municipio_id,
            Gasto.activo == True,  # noqa: E712
            Gasto.fecha >= inicio_mes,
        )
        .group_by(Gasto.concepto)
        .order_by(func.sum(Gasto.monto_pesos).desc())
        .limit(10)
    )).all()
    top_conceptos = [
        {"concepto": c, "cantidad": int(cnt), "monto": str(m)}
        for c, cnt, m in top_conceptos_rows
    ]

    # Top dependencias del mes
    top_dep_rows = (await db.execute(
        select(
            Dependencia.nombre,
            func.count(Gasto.id),
            func.coalesce(func.sum(Gasto.monto_pesos), 0),
        )
        .join(MunicipioDependencia, MunicipioDependencia.dependencia_id == Dependencia.id)
        .join(Gasto, Gasto.destino_dependencia_id == MunicipioDependencia.id)
        .where(
            Gasto.municipio_id == municipio_id,
            Gasto.activo == True,  # noqa: E712
            Gasto.fecha >= inicio_mes,
        )
        .group_by(Dependencia.nombre)
        .order_by(func.sum(Gasto.monto_pesos).desc())
        .limit(10)
    )).all()
    top_dependencias = [
        {"nombre": n, "cantidad": int(cnt), "monto": str(m)}
        for n, cnt, m in top_dep_rows
    ]

    # Mensuales: ultimos 6 meses
    mens_rows = (await db.execute(
        select(
            func.extract("year", Gasto.fecha).label("anio"),
            func.extract("month", Gasto.fecha).label("mes"),
            func.count(Gasto.id),
            func.coalesce(func.sum(Gasto.monto_pesos), 0),
        )
        .where(
            Gasto.municipio_id == municipio_id,
            Gasto.activo == True,  # noqa: E712
            Gasto.fecha >= desde_6m,
        )
        .group_by("anio", "mes")
        .order_by("anio", "mes")
    )).all()
    mensuales = [
        {"anio": int(a), "mes": int(m), "cantidad": int(c), "monto": str(monto)}
        for a, m, c, monto in mens_rows
    ]

    return {
        "por_caja": por_caja,
        "top_conceptos": top_conceptos,
        "top_dependencias": top_dependencias,
        "mensuales": mensuales,
    }


# ============================================================
# Generar Orden de Pago a partir de un Gasto pagado
# ============================================================

from pydantic import BaseModel, Field as _Field


class GenerarOPRequest(BaseModel):
    """Body opcional para refinar los datos contables que van a la OP.
    Si no vienen, se intenta inferir del gasto o se dejan vacios (el PDF
    los imprime como "—" para que se completen a mano si hace falta)."""
    codigo_imputacion: Optional[str] = _Field(None, max_length=50)
    imputacion_descripcion: Optional[str] = _Field(None, max_length=150)
    tipo_pago: Optional[str] = _Field(None, max_length=30)
    nro_comprobante_pago: Optional[str] = _Field(None, max_length=50)
    cuenta_destino: Optional[str] = _Field(None, max_length=100)
    contaduria_nombre: Optional[str] = _Field(None, max_length=150)
    secretario_nombre: Optional[str] = _Field(None, max_length=150)
    intendente_nombre: Optional[str] = _Field(None, max_length=150)
    nro_factura: Optional[str] = _Field(None, max_length=50)


@router.post("/{gasto_id}/generar-op")
async def generar_op_desde_gasto(
    gasto_id: int,
    payload: Optional[GenerarOPRequest] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera una Orden de Pago a partir de un Gasto ya cargado.

    La OP nace en estado `pagada` (es el documento de respaldo posterior
    al pago, no la autorizacion previa). Hereda destino, concepto, monto,
    caja y fecha del gasto. Los campos contables especificos del documento
    (imputacion, tipo de pago, nro comprobante, cuenta destino) se reciben
    en el body y se guardan en la OP para que aparezcan en el PDF.

    Si el gasto ya tiene una OP asociada (op.gasto_id == gasto_id), devuelve
    409 con el id de la OP existente.
    """
    from datetime import datetime
    from models import OrdenPago, EstadoOrdenPago, Municipio
    from api.ordenes_pago import _siguiente_numero

    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    gasto = (await db.execute(
        select(Gasto).where(Gasto.id == gasto_id, Gasto.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not gasto:
        raise HTTPException(404, "Gasto no encontrado")

    # Si ya hay una OP para este gasto, no crear otra
    op_existente = (await db.execute(
        select(OrdenPago).where(
            OrdenPago.gasto_id == gasto_id,
            OrdenPago.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if op_existente:
        return {
            "ya_existe": True,
            "op_id": op_existente.id,
            "numero": op_existente.numero,
        }

    p = payload or GenerarOPRequest()

    # Defaults de firmantes desde el muni si no vienen en el body
    muni = (await db.execute(select(Municipio).where(Municipio.id == municipio_id))).scalar_one()

    numero = await _siguiente_numero(db, municipio_id)
    op = OrdenPago(
        municipio_id=municipio_id,
        numero=numero,
        creador_id=current_user.id,
        estado=EstadoOrdenPago.PAGADA,                      # nace pagada (respaldo posterior)
        destino_tipo=gasto.destino_tipo,
        destino_contacto_id=gasto.destino_contacto_id,
        destino_dependencia_id=gasto.destino_dependencia_id,
        concepto=gasto.concepto,
        descripcion=gasto.descripcion,
        monto_pesos=gasto.monto_pesos,
        caja_id=gasto.caja_id,
        fecha_emision=gasto.fecha,
        fecha_pago=datetime.utcnow(),
        nro_factura=p.nro_factura or gasto.nro_factura,
        factura_url=gasto.factura_url,
        codigo_imputacion=p.codigo_imputacion,
        imputacion_descripcion=p.imputacion_descripcion,
        tipo_pago=p.tipo_pago or gasto.forma_pago,
        nro_comprobante_pago=p.nro_comprobante_pago,
        cuenta_destino=p.cuenta_destino,
        contaduria_nombre=p.contaduria_nombre or muni.contador_nombre,
        secretario_nombre=p.secretario_nombre or muni.secretario_nombre,
        intendente_nombre=p.intendente_nombre or muni.intendente_nombre,
        gasto_id=gasto.id,
        autorizado_por_id=current_user.id,
        fecha_autorizacion=datetime.utcnow(),
    )
    db.add(op)
    await db.commit()
    await db.refresh(op)

    return {
        "ya_existe": False,
        "op_id": op.id,
        "numero": op.numero,
    }

