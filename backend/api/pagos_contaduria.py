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
from models.pago_sesion import PagoSesion, EstadoSesionPago, MedioPagoGateway
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
