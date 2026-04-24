"""Endpoints de contaduria — listado / resumen / export de pagos realizados.

A diferencia de /pagos (checkout del vecino), estos endpoints son de backoffice:
muestran el historico transaccional para que contaduria pueda conciliar contra
el extracto bancario, el panel del gateway (MP/GIRE/MODO) y los reportes
tributarios. Por default filtra estado=approved ("solo pagos realizados")
pero se pueden pedir pendientes/rechazados via filtro.

Dos tipos de origen conviven en PagoSesion:
  - Deuda (tasas ABL, patente, etc)  -> concepto = "TipoTasa - Periodo"
  - Solicitud (tramite con costo)    -> concepto = "Tramite - N° Solicitud"

Tenancy: admin/supervisor ven SOLO los pagos de su municipio.
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from io import StringIO
from typing import Optional, List
import csv

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.pago_sesion import PagoSesion, EstadoSesionPago, EstadoImputacion, MedioPagoGateway
from models.tasas import Deuda, Partida
from models.tramite import Solicitud
from models.municipio_dependencia import MunicipioDependencia


router = APIRouter(prefix="/pagos/contaduria", tags=["Pagos - Contaduria"])


# ============================================================
# Schemas
# ============================================================

class PagoItem(BaseModel):
    session_id: str
    fecha: Optional[str]           # ISO — completed_at si aprobado, created_at sino
    concepto: str
    origen: str                    # "tramite" | "tasa" | "otro"
    monto: str
    medio_pago: Optional[str]
    estado: str
    provider: str
    external_id: Optional[str]
    dependencia_id: Optional[int]
    dependencia_nombre: Optional[str]
    vecino_id: Optional[int]
    vecino_nombre: Optional[str]
    vecino_email: Optional[str]


class ResumenMedio(BaseModel):
    medio_pago: str
    monto: str
    cantidad: int


class ResumenTotales(BaseModel):
    monto_aprobado: str
    monto_pendiente: str
    monto_rechazado: str
    cantidad_aprobados: int
    cantidad_pendientes: int
    cantidad_rechazados: int
    ticket_promedio: str


class ResumenResponse(BaseModel):
    totales: ResumenTotales
    por_medio: List[ResumenMedio]


class ListarResponse(BaseModel):
    items: List[PagoItem]
    total: int
    page: int
    page_size: int


# ============================================================
# Helpers
# ============================================================

PENDIENTES = {EstadoSesionPago.PENDING, EstadoSesionPago.IN_CHECKOUT}
FALLIDOS = {EstadoSesionPago.REJECTED, EstadoSesionPago.EXPIRED, EstadoSesionPago.CANCELLED}


def _asegurar_permisos(user: User) -> None:
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="No tenes permiso para ver la contaduria")


def _resolver_municipio_id(user: User) -> int:
    if not user.municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")
    return user.municipio_id


def _rango_default_mes_actual() -> tuple[date, date]:
    hoy = date.today()
    inicio = hoy.replace(day=1)
    # Fin del mes: primer dia del proximo mes menos 1 dia
    if inicio.month == 12:
        prox = date(inicio.year + 1, 1, 1)
    else:
        prox = date(inicio.year, inicio.month + 1, 1)
    fin = prox - timedelta(days=1)
    return inicio, fin


def _build_filtros_base(
    municipio_id: int,
    fecha_desde: Optional[date],
    fecha_hasta: Optional[date],
    estados: list[EstadoSesionPago],
    medios: Optional[list[MedioPagoGateway]],
    origen: Optional[str],
    usuario_id: Optional[int],
):
    """Arma la lista de clausulas WHERE comunes a listar/resumen/export."""
    conds = [PagoSesion.municipio_id == municipio_id]

    if estados:
        conds.append(PagoSesion.estado.in_(estados))

    # La "fecha del pago" para aprobados es completed_at; para no aprobados
    # caemos en created_at. Asi el rango no oculta aprobados viejos ni deja
    # fuera intentos dentro del rango.
    if fecha_desde or fecha_hasta:
        ts = func.coalesce(PagoSesion.completed_at, PagoSesion.created_at)
        if fecha_desde:
            conds.append(ts >= datetime.combine(fecha_desde, datetime.min.time()))
        if fecha_hasta:
            conds.append(ts <= datetime.combine(fecha_hasta, datetime.max.time()))

    if medios:
        conds.append(PagoSesion.medio_pago.in_(medios))

    if origen == "tramite":
        conds.append(PagoSesion.solicitud_id.isnot(None))
    elif origen == "tasa":
        conds.append(PagoSesion.deuda_id.isnot(None))

    if usuario_id:
        conds.append(PagoSesion.vecino_user_id == usuario_id)

    return conds


async def _cargar_dependencias_por_solicitud(
    db: AsyncSession, solicitud_ids: list[int]
) -> dict[int, tuple[Optional[int], Optional[str]]]:
    """Devuelve {solicitud_id: (municipio_dependencia_id, nombre_dependencia)}."""
    if not solicitud_ids:
        return {}
    q = await db.execute(
        select(Solicitud.id, Solicitud.municipio_dependencia_id, MunicipioDependencia)
        .outerjoin(MunicipioDependencia, MunicipioDependencia.id == Solicitud.municipio_dependencia_id)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(Solicitud.id.in_(solicitud_ids))
    )
    out: dict[int, tuple[Optional[int], Optional[str]]] = {}
    for sol_id, dep_id, mdep in q.all():
        nombre = mdep.nombre if mdep else None
        out[sol_id] = (dep_id, nombre)
    return out


# ============================================================
# 1. Listar pagos (grilla)
# ============================================================

@router.get("/listar", response_model=ListarResponse)
async def listar_pagos(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    estado: List[str] = Query(default=["approved"]),
    medio_pago: Optional[List[str]] = Query(default=None),
    origen: Optional[str] = Query(default=None, pattern="^(tramite|tasa|all)?$"),
    dependencia_id: Optional[int] = None,
    usuario_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    # Defaults
    if not fecha_desde and not fecha_hasta:
        fecha_desde, fecha_hasta = _rango_default_mes_actual()

    estados_enum: list[EstadoSesionPago] = []
    for e in estado:
        try:
            estados_enum.append(EstadoSesionPago(e))
        except ValueError:
            continue

    medios_enum: Optional[list[MedioPagoGateway]] = None
    if medio_pago:
        medios_enum = []
        for m in medio_pago:
            try:
                medios_enum.append(MedioPagoGateway(m))
            except ValueError:
                continue

    origen_filtro = origen if origen in ("tramite", "tasa") else None

    conds = _build_filtros_base(
        municipio_id, fecha_desde, fecha_hasta, estados_enum, medios_enum, origen_filtro, usuario_id
    )

    if search:
        like = f"%{search.strip()}%"
        conds.append(or_(
            PagoSesion.concepto.ilike(like),
            PagoSesion.external_id.ilike(like),
            PagoSesion.id.ilike(like),
        ))

    # Total
    total_q = await db.execute(select(func.count()).select_from(PagoSesion).where(and_(*conds)))
    total = int(total_q.scalar() or 0)

    # Page
    stmt = (
        select(PagoSesion)
        .options(
            selectinload(PagoSesion.vecino),
        )
        .where(and_(*conds))
        .order_by(func.coalesce(PagoSesion.completed_at, PagoSesion.created_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    res = await db.execute(stmt)
    sesiones = res.scalars().all()

    # Cargar dependencias por solicitud en bulk
    sol_ids = [s.solicitud_id for s in sesiones if s.solicitud_id]
    deps = await _cargar_dependencias_por_solicitud(db, sol_ids)

    # Filtro post-query por dependencia (solo si se pidio)
    if dependencia_id:
        sesiones = [
            s for s in sesiones
            if s.solicitud_id and deps.get(s.solicitud_id, (None, None))[0] == dependencia_id
        ]

    items: list[PagoItem] = []
    for s in sesiones:
        dep_id, dep_nombre = deps.get(s.solicitud_id, (None, None)) if s.solicitud_id else (None, None)
        origen_val = "tramite" if s.solicitud_id else ("tasa" if s.deuda_id else "otro")
        fecha_iso = (s.completed_at or s.created_at).isoformat() if (s.completed_at or s.created_at) else None
        vecino_nombre = None
        vecino_email = None
        if s.vecino:
            vecino_nombre = f"{s.vecino.nombre or ''} {s.vecino.apellido or ''}".strip() or None
            vecino_email = s.vecino.email
        items.append(PagoItem(
            session_id=s.id,
            fecha=fecha_iso,
            concepto=s.concepto,
            origen=origen_val,
            monto=str(s.monto),
            medio_pago=s.medio_pago.value if s.medio_pago else None,
            estado=s.estado.value if hasattr(s.estado, "value") else str(s.estado),
            provider=s.provider,
            external_id=s.external_id,
            dependencia_id=dep_id,
            dependencia_nombre=dep_nombre,
            vecino_id=s.vecino_user_id,
            vecino_nombre=vecino_nombre,
            vecino_email=vecino_email,
        ))

    return ListarResponse(items=items, total=total, page=page, page_size=page_size)


# ============================================================
# 2. Resumen (stat cards + breakdown por medio)
# ============================================================

@router.get("/resumen", response_model=ResumenResponse)
async def resumen_pagos(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    medio_pago: Optional[List[str]] = Query(default=None),
    origen: Optional[str] = Query(default=None, pattern="^(tramite|tasa|all)?$"),
    dependencia_id: Optional[int] = None,
    usuario_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    if not fecha_desde and not fecha_hasta:
        fecha_desde, fecha_hasta = _rango_default_mes_actual()

    medios_enum: Optional[list[MedioPagoGateway]] = None
    if medio_pago:
        medios_enum = []
        for m in medio_pago:
            try:
                medios_enum.append(MedioPagoGateway(m))
            except ValueError:
                continue

    origen_filtro = origen if origen in ("tramite", "tasa") else None

    # Para el resumen pedimos TODOS los estados (sin filtrar por approved)
    # porque contaduria quiere ver tambien pendientes/rechazados en las cards.
    conds = _build_filtros_base(
        municipio_id, fecha_desde, fecha_hasta, [], medios_enum, origen_filtro, usuario_id
    )

    # Si hay filtro por dependencia, restringimos a sesiones con solicitud
    # cuyo municipio_dependencia_id coincida (via subquery).
    if dependencia_id:
        sub = select(Solicitud.id).where(
            Solicitud.municipio_dependencia_id == dependencia_id
        )
        conds.append(PagoSesion.solicitud_id.in_(sub))

    # Agregados por estado
    tot_q = await db.execute(
        select(
            PagoSesion.estado,
            func.coalesce(func.sum(PagoSesion.monto), 0),
            func.count(),
        )
        .where(and_(*conds))
        .group_by(PagoSesion.estado)
    )
    monto_aprobado = Decimal("0")
    monto_pendiente = Decimal("0")
    monto_rechazado = Decimal("0")
    cant_aprobados = 0
    cant_pendientes = 0
    cant_rechazados = 0
    for est, monto, cant in tot_q.all():
        estado_val = est.value if hasattr(est, "value") else str(est)
        if estado_val == EstadoSesionPago.APPROVED.value:
            monto_aprobado = Decimal(str(monto or 0))
            cant_aprobados = int(cant or 0)
        elif estado_val in (EstadoSesionPago.PENDING.value, EstadoSesionPago.IN_CHECKOUT.value):
            monto_pendiente += Decimal(str(monto or 0))
            cant_pendientes += int(cant or 0)
        else:
            monto_rechazado += Decimal(str(monto or 0))
            cant_rechazados += int(cant or 0)

    ticket = (monto_aprobado / cant_aprobados) if cant_aprobados else Decimal("0")

    # Breakdown por medio (solo aprobados — es lo que interesa para el mix de cobro)
    por_medio_q = await db.execute(
        select(
            PagoSesion.medio_pago,
            func.coalesce(func.sum(PagoSesion.monto), 0),
            func.count(),
        )
        .where(and_(*conds, PagoSesion.estado == EstadoSesionPago.APPROVED))
        .group_by(PagoSesion.medio_pago)
        .order_by(func.sum(PagoSesion.monto).desc())
    )
    por_medio: list[ResumenMedio] = []
    for medio, monto, cant in por_medio_q.all():
        if not medio:
            continue
        medio_val = medio.value if hasattr(medio, "value") else str(medio)
        por_medio.append(ResumenMedio(
            medio_pago=medio_val,
            monto=str(Decimal(str(monto or 0))),
            cantidad=int(cant or 0),
        ))

    return ResumenResponse(
        totales=ResumenTotales(
            monto_aprobado=str(monto_aprobado),
            monto_pendiente=str(monto_pendiente),
            monto_rechazado=str(monto_rechazado),
            cantidad_aprobados=cant_aprobados,
            cantidad_pendientes=cant_pendientes,
            cantidad_rechazados=cant_rechazados,
            ticket_promedio=f"{ticket:.2f}",
        ),
        por_medio=por_medio,
    )


# ============================================================
# 3. Exportar CSV
# ============================================================

@router.get("/exportar")
async def exportar_pagos(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    estado: List[str] = Query(default=["approved"]),
    medio_pago: Optional[List[str]] = Query(default=None),
    origen: Optional[str] = Query(default=None, pattern="^(tramite|tasa|all)?$"),
    dependencia_id: Optional[int] = None,
    usuario_id: Optional[int] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Exporta el resultado filtrado a CSV (todas las filas, sin paginado)."""
    # Reutilizo listar sin paginado — pido 1 pagina grande
    data = await listar_pagos(
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        estado=estado,
        medio_pago=medio_pago,
        origen=origen,
        dependencia_id=dependencia_id,
        usuario_id=usuario_id,
        search=search,
        page=1,
        page_size=10000,
        db=db,
        current_user=current_user,
    )

    buf = StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow([
        "Fecha", "Session ID", "N° Operación", "Concepto", "Origen",
        "Monto", "Medio de pago", "Estado", "Provider",
        "Dependencia", "Vecino", "Email vecino",
    ])
    for it in data.items:
        writer.writerow([
            it.fecha or "",
            it.session_id,
            it.external_id or "",
            it.concepto,
            it.origen,
            it.monto,
            it.medio_pago or "",
            it.estado,
            it.provider,
            it.dependencia_nombre or "",
            it.vecino_nombre or "",
            it.vecino_email or "",
        ])
    buf.seek(0)

    filename = f"pagos_{(fecha_desde or date.today()).isoformat()}_{(fecha_hasta or date.today()).isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================
# 4. Cola de imputacion contable (Fase 1 del bundle de pagos)
# ============================================================
#
# Flow:
#   Vecino paga -> sesion queda APPROVED + imputacion_estado=PENDIENTE.
#   Contaduria entra a la cola, marca "imputado" con el N° asiento RAFAM.
#   Si no puede imputarlo (ej: el asiento del sistema contable ya estaba),
#   lo marca "rechazado_imputacion" y queda visible para retry.
# ============================================================


class CutItem(BaseModel):
    session_id: str
    codigo_cut_qr: Optional[str]
    fecha_pago: Optional[str]
    concepto: str
    origen: str
    monto: str
    medio_pago: Optional[str]
    provider: str
    external_id: Optional[str]
    imputacion_estado: Optional[str]
    imputado_at: Optional[str]
    imputado_por_nombre: Optional[str]
    imputacion_referencia_externa: Optional[str]
    imputacion_observacion: Optional[str]
    vecino_nombre: Optional[str]
    dependencia_nombre: Optional[str]


class ColaResponse(BaseModel):
    items: List[CutItem]
    total: int
    page: int
    page_size: int
    conteo_por_estado: dict  # { pendiente: 34, imputado: 120, rechazado_imputacion: 2 }


class MarcarImputadoRequest(BaseModel):
    referencia_externa: str
    observacion: Optional[str] = None


class RechazarImputacionRequest(BaseModel):
    motivo: str  # minimo 3 chars para forzar explicacion


class BulkMarcarItem(BaseModel):
    session_id: str
    referencia_externa: str


class BulkMarcarRequest(BaseModel):
    items: List[BulkMarcarItem]
    observacion_comun: Optional[str] = None


@router.get("/imputacion/pendientes", response_model=ColaResponse)
async def imputacion_pendientes(
    imputacion_estado: Optional[List[str]] = Query(default=["pendiente"]),
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    origen: Optional[str] = Query(default=None, pattern="^(tramite|tasa|all)?$"),
    dependencia_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Grilla de pagos por estado de imputacion (default: pendientes)."""
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    conds = [
        PagoSesion.municipio_id == municipio_id,
        PagoSesion.estado == EstadoSesionPago.APPROVED,
    ]

    estados_imp: list[EstadoImputacion] = []
    for e in (imputacion_estado or []):
        try:
            estados_imp.append(EstadoImputacion(e))
        except ValueError:
            continue
    if estados_imp:
        conds.append(PagoSesion.imputacion_estado.in_(estados_imp))

    if fecha_desde or fecha_hasta:
        ts = func.coalesce(PagoSesion.completed_at, PagoSesion.created_at)
        if fecha_desde:
            conds.append(ts >= datetime.combine(fecha_desde, datetime.min.time()))
        if fecha_hasta:
            conds.append(ts <= datetime.combine(fecha_hasta, datetime.max.time()))

    if origen == "tramite":
        conds.append(PagoSesion.solicitud_id.isnot(None))
    elif origen == "tasa":
        conds.append(PagoSesion.deuda_id.isnot(None))

    if search:
        like = f"%{search.strip()}%"
        conds.append(or_(
            PagoSesion.concepto.ilike(like),
            PagoSesion.codigo_cut_qr.ilike(like),
            PagoSesion.external_id.ilike(like),
            PagoSesion.imputacion_referencia_externa.ilike(like),
        ))

    # Total
    total_q = await db.execute(select(func.count()).select_from(PagoSesion).where(and_(*conds)))
    total = int(total_q.scalar() or 0)

    # Conteo global por estado de imputacion (no se ve afectado por el filtro
    # de imputacion_estado — sirve para los badges del header).
    conds_global = [c for c in conds if "imputacion_estado" not in str(c)]
    conteo_q = await db.execute(
        select(PagoSesion.imputacion_estado, func.count())
        .where(and_(*conds_global))
        .group_by(PagoSesion.imputacion_estado)
    )
    conteo_por_estado: dict[str, int] = {}
    for est, cant in conteo_q.all():
        if est is None:
            continue
        val = est.value if hasattr(est, "value") else str(est)
        conteo_por_estado[val] = int(cant or 0)

    # Page
    stmt = (
        select(PagoSesion)
        .options(
            selectinload(PagoSesion.vecino),
            selectinload(PagoSesion.imputado_por),
        )
        .where(and_(*conds))
        .order_by(func.coalesce(PagoSesion.completed_at, PagoSesion.created_at).desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    res = await db.execute(stmt)
    sesiones = res.scalars().all()

    sol_ids = [s.solicitud_id for s in sesiones if s.solicitud_id]
    deps = await _cargar_dependencias_por_solicitud(db, sol_ids)

    if dependencia_id:
        sesiones = [
            s for s in sesiones
            if s.solicitud_id and deps.get(s.solicitud_id, (None, None))[0] == dependencia_id
        ]

    items: list[CutItem] = []
    for s in sesiones:
        dep_id, dep_nombre = (deps.get(s.solicitud_id, (None, None)) if s.solicitud_id else (None, None))
        origen_val = "tramite" if s.solicitud_id else ("tasa" if s.deuda_id else "otro")
        fecha_iso = (s.completed_at or s.created_at).isoformat() if (s.completed_at or s.created_at) else None
        imp_est = s.imputacion_estado.value if s.imputacion_estado else None
        imputado_nombre = None
        if s.imputado_por:
            imputado_nombre = f"{s.imputado_por.nombre or ''} {s.imputado_por.apellido or ''}".strip() or None
        items.append(CutItem(
            session_id=s.id,
            codigo_cut_qr=s.codigo_cut_qr,
            fecha_pago=fecha_iso,
            concepto=s.concepto,
            origen=origen_val,
            monto=str(s.monto),
            medio_pago=s.medio_pago.value if s.medio_pago else None,
            provider=s.provider,
            external_id=s.external_id,
            imputacion_estado=imp_est,
            imputado_at=s.imputado_at.isoformat() if s.imputado_at else None,
            imputado_por_nombre=imputado_nombre,
            imputacion_referencia_externa=s.imputacion_referencia_externa,
            imputacion_observacion=s.imputacion_observacion,
            vecino_nombre=(
                f"{s.vecino.nombre or ''} {s.vecino.apellido or ''}".strip() or None
                if s.vecino else None
            ),
            dependencia_nombre=dep_nombre,
        ))

    return ColaResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        conteo_por_estado=conteo_por_estado,
    )


async def _cargar_sesion_imputable(
    db: AsyncSession, session_id: str, municipio_id: int
) -> PagoSesion:
    q = await db.execute(
        select(PagoSesion).where(
            PagoSesion.id == session_id,
            PagoSesion.municipio_id == municipio_id,
        )
    )
    sesion = q.scalar_one_or_none()
    if not sesion:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if sesion.estado != EstadoSesionPago.APPROVED:
        raise HTTPException(status_code=400, detail="Solo se pueden imputar pagos aprobados")
    return sesion


@router.post("/imputacion/{session_id}/marcar")
async def marcar_imputado(
    session_id: str,
    body: MarcarImputadoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Contaduria marca un pago como imputado en RAFAM."""
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    ref = (body.referencia_externa or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="La referencia externa es obligatoria")

    sesion = await _cargar_sesion_imputable(db, session_id, municipio_id)
    sesion.imputacion_estado = EstadoImputacion.IMPUTADO
    sesion.imputado_at = datetime.utcnow()
    sesion.imputado_por_usuario_id = current_user.id
    sesion.imputacion_referencia_externa = ref[:100]
    sesion.imputacion_observacion = (body.observacion or "").strip()[:500] or None

    # Si la sesion era de un tramite, dejamos rastro en el historial.
    if sesion.solicitud_id:
        from models.tramite import HistorialSolicitud
        db.add(HistorialSolicitud(
            solicitud_id=sesion.solicitud_id,
            usuario_id=current_user.id,
            accion="Pago imputado en sistema contable",
            comentario=f"Ref externa {ref} — sesion {sesion.id}",
        ))

    await db.commit()
    return {
        "session_id": sesion.id,
        "imputacion_estado": sesion.imputacion_estado.value,
        "imputado_at": sesion.imputado_at.isoformat(),
        "imputacion_referencia_externa": sesion.imputacion_referencia_externa,
    }


@router.post("/imputacion/{session_id}/rechazar")
async def rechazar_imputacion(
    session_id: str,
    body: RechazarImputacionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Contaduria marca un pago como 'no pude imputarlo' — queda visible para retry."""
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    motivo = (body.motivo or "").strip()
    if len(motivo) < 3:
        raise HTTPException(status_code=400, detail="El motivo es obligatorio (min. 3 caracteres)")

    sesion = await _cargar_sesion_imputable(db, session_id, municipio_id)
    sesion.imputacion_estado = EstadoImputacion.RECHAZADO_IMPUTACION
    sesion.imputado_at = datetime.utcnow()
    sesion.imputado_por_usuario_id = current_user.id
    sesion.imputacion_observacion = motivo[:500]
    # Limpiamos la ref externa si la habia — este pago no entro al sistema
    sesion.imputacion_referencia_externa = None

    await db.commit()
    return {
        "session_id": sesion.id,
        "imputacion_estado": sesion.imputacion_estado.value,
        "motivo": motivo,
    }


# ============================================================
# 6. Metricas por canal (Fase 9 bundle) — dashboard omnicanal
# ============================================================


class MetricaCanalItem(BaseModel):
    canal: str
    cantidad: int
    monto: str


class MetricaSerieItem(BaseModel):
    fecha: str           # YYYY-MM-DD
    app: int
    ventanilla_asistida: int
    otros: int
    monto_app: str
    monto_ventanilla: str


class OperadorRankingItem(BaseModel):
    operador_id: int
    operador_nombre: str
    tramites: int
    monto: str


class DashboardOmnicanalResponse(BaseModel):
    rango: dict
    por_canal: List[MetricaCanalItem]
    serie_temporal: List[MetricaSerieItem]
    ranking_operadores: List[OperadorRankingItem]
    total_aprobado_monto: str
    total_aprobado_cantidad: int
    ticket_promedio: str


@router.get("/metricas-canal", response_model=DashboardOmnicanalResponse)
async def metricas_canal(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Agregados por canal (app / ventanilla_asistida / otros) + serie diaria
    + ranking de operadores. Para el tablero que le vende al intendente."""
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    if not fecha_desde and not fecha_hasta:
        fecha_desde, fecha_hasta = _rango_default_mes_actual()

    ts_col = func.coalesce(PagoSesion.completed_at, PagoSesion.created_at)
    conds = [
        PagoSesion.municipio_id == municipio_id,
        PagoSesion.estado == EstadoSesionPago.APPROVED,
    ]
    if fecha_desde:
        conds.append(ts_col >= datetime.combine(fecha_desde, datetime.min.time()))
    if fecha_hasta:
        conds.append(ts_col <= datetime.combine(fecha_hasta, datetime.max.time()))

    # Totales globales
    tot_q = await db.execute(
        select(func.count(), func.coalesce(func.sum(PagoSesion.monto), 0))
        .where(and_(*conds))
    )
    cant_tot, monto_tot = tot_q.one()
    cant_tot = int(cant_tot or 0)
    monto_tot_d = Decimal(str(monto_tot or 0))
    ticket = (monto_tot_d / cant_tot) if cant_tot else Decimal("0")

    # Por canal (NULL -> "app" por default)
    canal_col = func.coalesce(PagoSesion.canal, "app")
    pc_q = await db.execute(
        select(canal_col, func.count(), func.coalesce(func.sum(PagoSesion.monto), 0))
        .where(and_(*conds))
        .group_by(canal_col)
    )
    por_canal: list[MetricaCanalItem] = []
    for canal, cant, monto in pc_q.all():
        por_canal.append(MetricaCanalItem(
            canal=str(canal),
            cantidad=int(cant or 0),
            monto=str(Decimal(str(monto or 0))),
        ))

    # Serie temporal por dia
    fecha_col = func.date(ts_col)
    ser_q = await db.execute(
        select(fecha_col, canal_col, func.count(), func.coalesce(func.sum(PagoSesion.monto), 0))
        .where(and_(*conds))
        .group_by(fecha_col, canal_col)
        .order_by(fecha_col)
    )
    serie_map: dict[str, dict] = {}
    for fecha, canal, cant, monto in ser_q.all():
        key = str(fecha)
        if key not in serie_map:
            serie_map[key] = {"app": 0, "ventanilla_asistida": 0, "otros": 0, "monto_app": Decimal("0"), "monto_ventanilla": Decimal("0")}
        if canal == "app":
            serie_map[key]["app"] += int(cant or 0)
            serie_map[key]["monto_app"] += Decimal(str(monto or 0))
        elif canal == "ventanilla_asistida":
            serie_map[key]["ventanilla_asistida"] += int(cant or 0)
            serie_map[key]["monto_ventanilla"] += Decimal(str(monto or 0))
        else:
            serie_map[key]["otros"] += int(cant or 0)
    serie: list[MetricaSerieItem] = [
        MetricaSerieItem(
            fecha=k,
            app=v["app"],
            ventanilla_asistida=v["ventanilla_asistida"],
            otros=v["otros"],
            monto_app=str(v["monto_app"]),
            monto_ventanilla=str(v["monto_ventanilla"]),
        )
        for k, v in sorted(serie_map.items())
    ]

    # Ranking operadores de ventanilla
    rank_q = await db.execute(
        select(
            PagoSesion.operador_user_id,
            func.count(),
            func.coalesce(func.sum(PagoSesion.monto), 0),
        )
        .where(
            and_(*conds),
            PagoSesion.operador_user_id.isnot(None),
        )
        .group_by(PagoSesion.operador_user_id)
        .order_by(func.sum(PagoSesion.monto).desc())
        .limit(10)
    )
    rank_rows = rank_q.all()
    op_ids = [r[0] for r in rank_rows]
    op_nombres: dict[int, str] = {}
    if op_ids:
        u_q = await db.execute(select(User).where(User.id.in_(op_ids)))
        for u in u_q.scalars().all():
            op_nombres[u.id] = f"{u.nombre or ''} {u.apellido or ''}".strip() or u.email

    ranking: list[OperadorRankingItem] = [
        OperadorRankingItem(
            operador_id=int(op_id),
            operador_nombre=op_nombres.get(int(op_id), f"Operador #{op_id}"),
            tramites=int(cant or 0),
            monto=str(Decimal(str(monto or 0))),
        )
        for op_id, cant, monto in rank_rows
    ]

    return DashboardOmnicanalResponse(
        rango={
            "desde": fecha_desde.isoformat() if fecha_desde else None,
            "hasta": fecha_hasta.isoformat() if fecha_hasta else None,
        },
        por_canal=por_canal,
        serie_temporal=serie,
        ranking_operadores=ranking,
        total_aprobado_monto=str(monto_tot_d),
        total_aprobado_cantidad=cant_tot,
        ticket_promedio=f"{ticket:.2f}",
    )


# ============================================================
# 5. Exports contables (Fase 4 bundle) — motor de plantillas batch
# ============================================================


class ExportRequest(BaseModel):
    formato: str = "csv"             # csv | json | rafam_ba
    fecha_desde: Optional[date] = None
    fecha_hasta: Optional[date] = None
    estado: Optional[List[str]] = None  # estados de sesion (default approved)
    imputacion_estado: Optional[List[str]] = None
    session_ids: Optional[List[str]] = None  # si viene, sobrescribe otros filtros
    mapeo_rubros: Optional[dict] = None      # { tipo_tasa_codigo: codigo_rubro }


class ExportHistorialItem(BaseModel):
    id: int
    formato: str
    fecha_desde: Optional[str]
    fecha_hasta: Optional[str]
    cantidad_pagos: int
    monto_total: str
    generado_por_nombre: Optional[str]
    created_at: str


@router.get("/formatos-export")
async def formatos_export(current_user: User = Depends(get_current_user)):
    _asegurar_permisos(current_user)
    from services.exports_contables import FORMATOS_DISPONIBLES
    return {
        "formatos": [
            {"clave": k, "descripcion": v} for k, v in FORMATOS_DISPONIBLES.items()
        ],
    }


@router.post("/imputacion/export")
async def exportar_imputacion(
    body: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera un archivo batch con los pagos filtrados y lo descarga.

    Queda log en `exportaciones_imputacion` para audit trail.
    """
    from services.exports_contables import generar, FORMATOS_DISPONIBLES
    from models.exportacion_imputacion import ExportacionImputacion

    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    if body.formato not in FORMATOS_DISPONIBLES:
        raise HTTPException(status_code=400, detail=f"Formato invalido: {body.formato}")

    # Armar filtros iguales que en /listar, default approved + fecha del mes
    fecha_desde = body.fecha_desde
    fecha_hasta = body.fecha_hasta
    if not fecha_desde and not fecha_hasta and not body.session_ids:
        fecha_desde, fecha_hasta = _rango_default_mes_actual()

    conds = [PagoSesion.municipio_id == municipio_id]

    if body.session_ids:
        conds.append(PagoSesion.id.in_(body.session_ids))
    else:
        estados_enum: list[EstadoSesionPago] = []
        for e in (body.estado or ["approved"]):
            try:
                estados_enum.append(EstadoSesionPago(e))
            except ValueError:
                continue
        if estados_enum:
            conds.append(PagoSesion.estado.in_(estados_enum))
        if fecha_desde or fecha_hasta:
            ts = func.coalesce(PagoSesion.completed_at, PagoSesion.created_at)
            if fecha_desde:
                conds.append(ts >= datetime.combine(fecha_desde, datetime.min.time()))
            if fecha_hasta:
                conds.append(ts <= datetime.combine(fecha_hasta, datetime.max.time()))
        if body.imputacion_estado:
            estados_imp: list[EstadoImputacion] = []
            for e in body.imputacion_estado:
                try:
                    estados_imp.append(EstadoImputacion(e))
                except ValueError:
                    continue
            if estados_imp:
                conds.append(PagoSesion.imputacion_estado.in_(estados_imp))

    stmt = (
        select(PagoSesion)
        .options(
            selectinload(PagoSesion.deuda).selectinload(Deuda.partida).selectinload(Partida.tipo_tasa),
        )
        .where(and_(*conds))
        .order_by(func.coalesce(PagoSesion.completed_at, PagoSesion.created_at).asc())
    )
    res = await db.execute(stmt)
    sesiones = res.scalars().all()

    if not sesiones:
        raise HTTPException(status_code=404, detail="No hay pagos para exportar con esos filtros")

    # Resolver nombre muni para el filename
    from models.municipio import Municipio
    muni_q = await db.execute(select(Municipio.nombre).where(Municipio.id == municipio_id))
    muni_nombre = (muni_q.scalar() or "muni").replace("Municipalidad de ", "")

    out = generar(body.formato, sesiones, muni_nombre=muni_nombre, mapeo_rubros=body.mapeo_rubros)

    monto_total = sum((Decimal(str(s.monto or 0)) for s in sesiones), Decimal("0"))

    db.add(ExportacionImputacion(
        municipio_id=municipio_id,
        formato=body.formato,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        cantidad_pagos=len(sesiones),
        monto_total=monto_total,
        session_ids=[s.id for s in sesiones],
        filtros={
            "estado": body.estado,
            "imputacion_estado": body.imputacion_estado,
        },
        generado_por_usuario_id=current_user.id,
    ))
    await db.commit()

    return StreamingResponse(
        iter([out.body]),
        media_type=out.content_type,
        headers={"Content-Disposition": f'attachment; filename="{out.filename}"'},
    )


@router.get("/exports/historial", response_model=List[ExportHistorialItem])
async def historial_exports(
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historial de los ultimos N archivos batch generados."""
    from models.exportacion_imputacion import ExportacionImputacion
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    q = await db.execute(
        select(ExportacionImputacion)
        .options(selectinload(ExportacionImputacion.generado_por))
        .where(ExportacionImputacion.municipio_id == municipio_id)
        .order_by(ExportacionImputacion.created_at.desc())
        .limit(limit)
    )
    rows = q.scalars().all()
    out: list[ExportHistorialItem] = []
    for r in rows:
        nombre = None
        if r.generado_por:
            nombre = f"{r.generado_por.nombre or ''} {r.generado_por.apellido or ''}".strip() or r.generado_por.email
        out.append(ExportHistorialItem(
            id=r.id,
            formato=r.formato,
            fecha_desde=r.fecha_desde.isoformat() if r.fecha_desde else None,
            fecha_hasta=r.fecha_hasta.isoformat() if r.fecha_hasta else None,
            cantidad_pagos=r.cantidad_pagos,
            monto_total=str(r.monto_total or 0),
            generado_por_nombre=nombre,
            created_at=r.created_at.isoformat() if r.created_at else "",
        ))
    return out


@router.post("/imputacion/bulk-marcar")
async def bulk_marcar_imputado(
    body: BulkMarcarRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca varios pagos como imputados en una sola accion (importacion masiva)."""
    _asegurar_permisos(current_user)
    municipio_id = _resolver_municipio_id(current_user)

    if not body.items:
        raise HTTPException(status_code=400, detail="No hay items para imputar")

    ids = [it.session_id for it in body.items]
    q = await db.execute(
        select(PagoSesion).where(
            PagoSesion.id.in_(ids),
            PagoSesion.municipio_id == municipio_id,
        )
    )
    sesiones = {s.id: s for s in q.scalars().all()}

    ok: list[str] = []
    errores: list[dict] = []
    ahora = datetime.utcnow()
    obs_comun = (body.observacion_comun or "").strip()[:500] or None

    for it in body.items:
        sesion = sesiones.get(it.session_id)
        if not sesion:
            errores.append({"session_id": it.session_id, "error": "No encontrado"})
            continue
        if sesion.estado != EstadoSesionPago.APPROVED:
            errores.append({"session_id": it.session_id, "error": "No aprobado"})
            continue
        ref = (it.referencia_externa or "").strip()
        if not ref:
            errores.append({"session_id": it.session_id, "error": "Ref externa vacia"})
            continue
        sesion.imputacion_estado = EstadoImputacion.IMPUTADO
        sesion.imputado_at = ahora
        sesion.imputado_por_usuario_id = current_user.id
        sesion.imputacion_referencia_externa = ref[:100]
        if obs_comun:
            sesion.imputacion_observacion = obs_comun
        ok.append(sesion.id)

    await db.commit()
    return {"imputados": len(ok), "errores": errores, "ok_ids": ok}
