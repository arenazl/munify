"""API de Ordenes de Pago (Contaduria).

Una OP autoriza formalmente un pago. Workflow:

  pendiente -> autorizada -> pagada
            \\-> anulada    (desde cualquier estado salvo pagada)

Al pasar a 'pagada' se crea automaticamente un Gasto en Tesoreria, una
cuota pagada, y se descuenta la caja (movimiento de egreso). Asi el
circuito formal de Contaduria se materializa en Tesoreria sin doble
carga.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

import cloudinary.uploader
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Response, UploadFile, File
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    OrdenPago, EstadoOrdenPago, Contacto, TesoreriaCaja, TesoreriaMovimientoCaja, TipoMovimientoCaja,
    Gasto, GastoCuota, User, RolUsuario,
)
from models.dependencia import Dependencia
from models.gasto import EstadoGastoCuota
from schemas.orden_pago import (
    OrdenPagoCreate, OrdenPagoUpdate, OrdenPagoResponse,
    AnularRequest, PagarOPRequest,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos para operar OPs")


async def _siguiente_numero(db: AsyncSession, municipio_id: int) -> str:
    """Genera el proximo numero correlativo del año actual para el muni.
    Formato OP-{anio}-{seq4}. Empieza en 0001 cada año.
    """
    anio = date.today().year
    prefix = f"OP-{anio}-"
    # Buscar el max numero del año actual para el muni
    last = (await db.execute(
        select(OrdenPago.numero)
        .where(
            OrdenPago.municipio_id == municipio_id,
            OrdenPago.numero.like(f"{prefix}%"),
        )
        .order_by(OrdenPago.numero.desc())
        .limit(1)
    )).scalar_one_or_none()
    if last:
        try:
            seq = int(last.split("-")[-1]) + 1
        except Exception:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def _enrich(db: AsyncSession, op: OrdenPago) -> OrdenPagoResponse:
    resp = OrdenPagoResponse.model_validate(op)
    if op.destino_contacto_id:
        c = (await db.execute(select(Contacto).where(Contacto.id == op.destino_contacto_id))).scalar_one_or_none()
        if c:
            resp.contacto_nombre = f"{c.nombre} {c.apellido or ''}".strip()
    if op.destino_dependencia_id:
        from models import MunicipioDependencia
        md = (await db.execute(
            select(MunicipioDependencia)
            .options(selectinload(MunicipioDependencia.dependencia))
            .where(MunicipioDependencia.id == op.destino_dependencia_id)
        )).scalar_one_or_none()
        if md and md.dependencia:
            resp.dependencia_nombre = md.dependencia.nombre
    if op.caja_id:
        caja = (await db.execute(select(TesoreriaCaja).where(TesoreriaCaja.id == op.caja_id))).scalar_one_or_none()
        if caja:
            resp.caja_nombre = caja.nombre
    if op.creador_id:
        u = (await db.execute(select(User).where(User.id == op.creador_id))).scalar_one_or_none()
        if u:
            resp.creador_nombre = f"{u.nombre or ''} {u.apellido or ''}".strip() or u.email
    if op.autorizado_por_id:
        u = (await db.execute(select(User).where(User.id == op.autorizado_por_id))).scalar_one_or_none()
        if u:
            resp.autorizado_por_nombre = f"{u.nombre or ''} {u.apellido or ''}".strip() or u.email
    return resp


# ============================================================
# CRUD
# ============================================================

@router.get("", response_model=List[OrdenPagoResponse])
async def list_ops(
    response: Response,
    request: Request,
    estado: Optional[str] = None,
    search: Optional[str] = Query(None, description="Busca en concepto/numero/descripcion"),
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    contacto_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    q = select(OrdenPago).where(OrdenPago.municipio_id == municipio_id)
    if estado:
        q = q.where(OrdenPago.estado == estado)
    if contacto_id:
        q = q.where(OrdenPago.destino_contacto_id == contacto_id)
    if search and search.strip():
        s = f"%{search.strip()}%"
        q = q.where(or_(
            OrdenPago.concepto.ilike(s),
            OrdenPago.numero.ilike(s),
            OrdenPago.descripcion.ilike(s),
        ))
    if desde:
        q = q.where(OrdenPago.fecha_emision >= desde)
    if hasta:
        q = q.where(OrdenPago.fecha_emision <= hasta)

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    q = q.order_by(OrdenPago.fecha_emision.desc(), OrdenPago.id.desc()).offset(skip).limit(limit)
    items = list((await db.execute(q)).scalars().all())
    return [await _enrich(db, op) for op in items]


@router.post("", response_model=OrdenPagoResponse, status_code=201)
async def create_op(
    payload: OrdenPagoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    # Validar destino
    if payload.destino_tipo == "contacto" and not payload.destino_contacto_id:
        raise HTTPException(422, "destino_contacto_id requerido")
    if payload.destino_tipo == "dependencia" and not payload.destino_dependencia_id:
        raise HTTPException(422, "destino_dependencia_id requerido")

    # Validar caja si viene
    if payload.caja_id is not None:
        caja = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.id == payload.caja_id,
                TesoreriaCaja.municipio_id == municipio_id,
            )
        )).scalar_one_or_none()
        if not caja:
            raise HTTPException(422, "caja_id invalido para este municipio")

    numero = await _siguiente_numero(db, municipio_id)
    data = payload.model_dump()
    # Limpiar el FK del destino opuesto
    if payload.destino_tipo == "contacto":
        data["destino_dependencia_id"] = None
    else:
        data["destino_contacto_id"] = None

    op = OrdenPago(
        municipio_id=municipio_id,
        numero=numero,
        creador_id=current_user.id,
        estado=EstadoOrdenPago.PENDIENTE,
        **data,
    )
    db.add(op)
    await db.commit()
    await db.refresh(op)
    return await _enrich(db, op)


@router.get("/{op_id}", response_model=OrdenPagoResponse)
async def get_op(
    op_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    op = (await db.execute(
        select(OrdenPago).where(OrdenPago.id == op_id, OrdenPago.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not op:
        raise HTTPException(404, "OP no encontrada")
    return await _enrich(db, op)


@router.put("/{op_id}", response_model=OrdenPagoResponse)
async def update_op(
    op_id: int,
    payload: OrdenPagoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Solo permite editar OPs en estado pendiente."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    op = (await db.execute(
        select(OrdenPago).where(OrdenPago.id == op_id, OrdenPago.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not op:
        raise HTTPException(404, "OP no encontrada")
    if op.estado != EstadoOrdenPago.PENDIENTE:
        raise HTTPException(409, f"No se puede editar una OP en estado '{op.estado.value}'")

    data = payload.model_dump(exclude_unset=True)
    # Si cambia destino_tipo, limpiar el FK opuesto
    if "destino_tipo" in data:
        if data["destino_tipo"] == "contacto":
            data.setdefault("destino_dependencia_id", None)
        else:
            data.setdefault("destino_contacto_id", None)

    # Validar caja
    if data.get("caja_id") is not None:
        caja = (await db.execute(
            select(TesoreriaCaja).where(
                TesoreriaCaja.id == data["caja_id"],
                TesoreriaCaja.municipio_id == municipio_id,
            )
        )).scalar_one_or_none()
        if not caja:
            raise HTTPException(422, "caja_id invalido")

    for k, v in data.items():
        setattr(op, k, v)
    await db.commit()
    await db.refresh(op)
    return await _enrich(db, op)


# ============================================================
# Acciones del workflow
# ============================================================

@router.post("/{op_id}/autorizar", response_model=OrdenPagoResponse)
async def autorizar_op(
    op_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pasa la OP de pendiente -> autorizada. Solo admin/supervisor."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    op = (await db.execute(
        select(OrdenPago).where(OrdenPago.id == op_id, OrdenPago.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not op:
        raise HTTPException(404, "OP no encontrada")
    if op.estado != EstadoOrdenPago.PENDIENTE:
        raise HTTPException(409, f"Solo se pueden autorizar OPs pendientes (estado actual: {op.estado.value})")

    op.estado = EstadoOrdenPago.AUTORIZADA
    op.fecha_autorizacion = datetime.utcnow()
    op.autorizado_por_id = current_user.id
    await db.commit()
    await db.refresh(op)
    return await _enrich(db, op)


@router.post("/{op_id}/pagar", response_model=OrdenPagoResponse)
async def pagar_op(
    op_id: int,
    payload: PagarOPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ejecuta el pago: pasa OP a 'pagada' y crea Gasto + descuento de caja.

    La OP queda vinculada al Gasto via gasto_id (trazabilidad bidireccional).
    """
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    op = (await db.execute(
        select(OrdenPago).where(OrdenPago.id == op_id, OrdenPago.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not op:
        raise HTTPException(404, "OP no encontrada")
    if op.estado != EstadoOrdenPago.AUTORIZADA:
        raise HTTPException(409, f"Solo se pueden pagar OPs autorizadas (estado actual: {op.estado.value})")

    caja_id = payload.caja_id if payload.caja_id is not None else op.caja_id
    if not caja_id:
        raise HTTPException(422, "Hay que indicar la caja desde donde sale el pago")
    caja = (await db.execute(
        select(TesoreriaCaja).where(
            TesoreriaCaja.id == caja_id,
            TesoreriaCaja.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not caja:
        raise HTTPException(422, "caja_id invalido")

    fecha = payload.fecha_pago or date.today()
    forma_pago = payload.forma_pago or "transferencia"

    # Crear el Gasto contado vinculado a la OP
    gasto = Gasto(
        municipio_id=municipio_id,
        creador_id=current_user.id,
        destino_tipo=op.destino_tipo,
        destino_contacto_id=op.destino_contacto_id,
        destino_dependencia_id=op.destino_dependencia_id,
        concepto=op.concepto,
        descripcion=f"OP {op.numero}" + (f" · {op.descripcion}" if op.descripcion else ""),
        monto_pesos=op.monto_pesos,
        fecha=fecha,
        tipo_financiacion='contado',
        forma_pago=forma_pago,
        caja_id=caja_id,
    )
    db.add(gasto)
    await db.flush()
    db.add(GastoCuota(
        gasto_id=gasto.id, numero=1, monto=op.monto_pesos,
        fecha_vencimiento=fecha, fecha_pago=fecha,
        estado=EstadoGastoCuota.PAGADA, forma_pago=forma_pago,
    ))
    db.add(TesoreriaMovimientoCaja(
        municipio_id=municipio_id, caja_id=caja_id, gasto_id=gasto.id,
        tipo=TipoMovimientoCaja.EGRESO, monto=op.monto_pesos, fecha=fecha,
        concepto=f"OP {op.numero} · {op.concepto}",
    ))

    op.estado = EstadoOrdenPago.PAGADA
    op.fecha_pago = datetime.utcnow()
    op.gasto_id = gasto.id
    if not op.caja_id:
        op.caja_id = caja_id

    await db.commit()
    await db.refresh(op)
    return await _enrich(db, op)


@router.post("/{op_id}/anular", response_model=OrdenPagoResponse)
async def anular_op(
    op_id: int,
    payload: AnularRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Anula una OP. Se puede anular en pendiente o autorizada. Una vez
    pagada NO se puede anular — para revertir hay que anular el Gasto."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    op = (await db.execute(
        select(OrdenPago).where(OrdenPago.id == op_id, OrdenPago.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not op:
        raise HTTPException(404, "OP no encontrada")
    if op.estado == EstadoOrdenPago.PAGADA:
        raise HTTPException(409, "No se puede anular una OP ya pagada. Anular el Gasto directamente si corresponde.")
    if op.estado == EstadoOrdenPago.ANULADA:
        raise HTTPException(409, "La OP ya esta anulada")

    op.estado = EstadoOrdenPago.ANULADA
    op.fecha_anulacion = datetime.utcnow()
    op.anulado_por_id = current_user.id
    op.motivo_anulacion = payload.motivo
    await db.commit()
    await db.refresh(op)
    return await _enrich(db, op)


# ============================================================
# Upload de factura adjunta (a Cloudinary)
# ============================================================

@router.post("/upload-factura")
async def upload_factura(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Sube el PDF/imagen de la factura a Cloudinary y devuelve la URL.
    El frontend despues guarda esa URL en factura_url al crear/editar la OP.
    PDFs van como resource_type='raw' (Cloudinary los preserva tal cual).
    Imagenes como 'image' (con CDN + transformaciones).
    """
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
            folder=f"facturas-op/muni-{municipio_id}",
            resource_type=resource_type,
        )
    except Exception as e:
        raise HTTPException(500, f"Error subiendo factura: {e}")

    return {
        "url": result.get("secure_url") or result.get("url"),
        "public_id": result.get("public_id"),
        "resource_type": resource_type,
    }


# ============================================================
# Resumen / KPIs
# ============================================================

@router.get("/stats/resumen")
async def resumen(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """KPIs para el dashboard de OPs: cantidades y montos por estado."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    rows = (await db.execute(
        select(
            OrdenPago.estado,
            func.count(OrdenPago.id),
            func.coalesce(func.sum(OrdenPago.monto_pesos), 0),
        )
        .where(OrdenPago.municipio_id == municipio_id)
        .group_by(OrdenPago.estado)
    )).all()
    out = {e.value: {"cantidad": 0, "monto": "0"} for e in EstadoOrdenPago}
    total_cantidad = 0
    total_monto = Decimal(0)
    for estado, cantidad, monto in rows:
        key = estado.value if hasattr(estado, "value") else str(estado)
        out[key] = {"cantidad": int(cantidad), "monto": str(monto)}
        if key != "anulada":
            total_cantidad += int(cantidad)
            total_monto += Decimal(monto or 0)
    return {
        "por_estado": out,
        "total_activas": {"cantidad": total_cantidad, "monto": str(total_monto)},
    }
