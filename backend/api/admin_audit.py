"""
Endpoints de la consola de auditoría (solo super admin).

GET    /api/admin/audit-logs              - lista con filtros + paginación
GET    /api/admin/audit-logs/{id}         - detalle expandido
GET    /api/admin/audit-logs/stats        - métricas agregadas
GET    /api/admin/audit-logs/distinct/{field} - valores únicos
DELETE /api/admin/audit-logs/cleanup      - purga manual (older_than_days)
GET    /api/admin/settings/debug_mode     - estado del flag
PUT    /api/admin/settings/debug_mode     - toggle (invalida cache)
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, distinct, delete

from core.database import get_db
from core.audit_helpers import require_super_admin, invalidate_debug_mode_cache
from models.audit_log import AuditLog
from models.user import User
from models.municipio import Municipio
from models.configuracion import Configuracion
from schemas.audit_log import (
    AuditLogItem, AuditLogDetail, AuditLogPage,
    AuditStats, DebugModeResponse, DebugModeUpdate,
)


router = APIRouter(prefix="/admin", tags=["admin-audit"])


# ============================================================
# Listado con filtros
# ============================================================
@router.get("/audit-logs", response_model=AuditLogPage)
async def list_audit_logs(
    municipio_id: Optional[int] = Query(None),
    usuario_id: Optional[int] = Query(None),
    usuario_email: Optional[str] = Query(None, description="match substring"),
    method: Optional[List[str]] = Query(None),
    path: Optional[str] = Query(None, description="substring del path"),
    action: Optional[List[str]] = Query(None),
    status_code_min: Optional[int] = Query(None),
    status_code_max: Optional[int] = Query(None),
    duracion_min_ms: Optional[int] = Query(None),
    duracion_max_ms: Optional[int] = Query(None),
    desde: Optional[datetime] = Query(None),
    hasta: Optional[datetime] = Query(None),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None, description="buscar en path o error_message"),
    order_by: str = Query("created_at", regex="^(created_at|duracion_ms|status_code)$"),
    order_dir: str = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Lista paginada de audit logs con filtros amplios. Solo super admin."""
    filters = []
    if municipio_id is not None:
        filters.append(AuditLog.municipio_id == municipio_id)
    if usuario_id is not None:
        filters.append(AuditLog.usuario_id == usuario_id)
    if usuario_email:
        filters.append(AuditLog.usuario_email.ilike(f"%{usuario_email}%"))
    if method:
        filters.append(AuditLog.method.in_(method))
    if path:
        filters.append(AuditLog.path.ilike(f"%{path}%"))
    if action:
        filters.append(AuditLog.action.in_(action))
    if status_code_min is not None:
        filters.append(AuditLog.status_code >= status_code_min)
    if status_code_max is not None:
        filters.append(AuditLog.status_code <= status_code_max)
    if duracion_min_ms is not None:
        filters.append(AuditLog.duracion_ms >= duracion_min_ms)
    if duracion_max_ms is not None:
        filters.append(AuditLog.duracion_ms <= duracion_max_ms)
    if desde:
        filters.append(AuditLog.created_at >= desde)
    if hasta:
        filters.append(AuditLog.created_at <= hasta)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        filters.append(AuditLog.entity_id == entity_id)
    if q:
        filters.append(AuditLog.path.ilike(f"%{q}%") | AuditLog.error_message.ilike(f"%{q}%"))

    where = and_(*filters) if filters else None

    # Total
    count_q = select(func.count()).select_from(AuditLog)
    if where is not None:
        count_q = count_q.where(where)
    total = (await db.execute(count_q)).scalar() or 0

    # Page
    order_col = getattr(AuditLog, order_by)
    if order_dir == "desc":
        order_col = desc(order_col)
    offset = (page - 1) * limit
    items_q = (
        select(AuditLog, Municipio.nombre.label("muni_nombre"))
        .outerjoin(Municipio, AuditLog.municipio_id == Municipio.id)
        .order_by(order_col)
        .limit(limit)
        .offset(offset)
    )
    if where is not None:
        items_q = items_q.where(where)

    rows = (await db.execute(items_q)).all()
    items = []
    for row in rows:
        log = row[0]
        muni_nombre = row[1]
        items.append(AuditLogItem(
            id=log.id,
            created_at=log.created_at,
            usuario_id=log.usuario_id,
            usuario_email=log.usuario_email,
            usuario_rol=log.usuario_rol,
            municipio_id=log.municipio_id,
            municipio_nombre=muni_nombre,
            method=log.method,
            path=log.path,
            status_code=log.status_code,
            duracion_ms=log.duracion_ms,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            ip_address=log.ip_address,
        ))

    return AuditLogPage(
        items=items,
        total=total,
        page=page,
        limit=limit,
        has_more=offset + len(items) < total,
    )


# ============================================================
# Detalle expandido
# ============================================================
@router.get("/audit-logs/stats", response_model=AuditStats)
async def audit_stats(
    municipio_id: Optional[int] = Query(None),
    desde: Optional[datetime] = Query(None),
    hasta: Optional[datetime] = Query(None),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Métricas agregadas para los widgets de la consola."""
    filters = []
    if municipio_id is not None:
        filters.append(AuditLog.municipio_id == municipio_id)
    if not desde:
        desde = datetime.now(timezone.utc) - timedelta(hours=24)
    filters.append(AuditLog.created_at >= desde)
    if hasta:
        filters.append(AuditLog.created_at <= hasta)
    where = and_(*filters)

    # Total + errores
    base = select(func.count()).select_from(AuditLog).where(where)
    total = (await db.execute(base)).scalar() or 0
    errors = (await db.execute(base.where(AuditLog.status_code >= 400))).scalar() or 0
    error_rate = (errors / total) if total else 0.0

    # Latencia: MySQL no tiene percentile_cont nativo, hacemos approximación con ORDER + LIMIT
    # Para volumen chico es OK. Para volumen alto podríamos usar tablas de muestreo.
    durations_q = (
        select(AuditLog.duracion_ms)
        .where(where)
        .order_by(AuditLog.duracion_ms)
    )
    durations = [r[0] for r in (await db.execute(durations_q)).all()]
    p50_ms = durations[len(durations) // 2] if durations else 0
    p95_idx = int(len(durations) * 0.95)
    p95_ms = durations[min(p95_idx, len(durations) - 1)] if durations else 0

    # Top endpoints
    top_q = (
        select(AuditLog.path, func.count().label("c"))
        .where(where)
        .group_by(AuditLog.path)
        .order_by(desc("c"))
        .limit(5)
    )
    top_endpoints = [{"path": r[0], "count": r[1]} for r in (await db.execute(top_q)).all()]

    # Slowest endpoints (top por max(duracion_ms))
    slow_q = (
        select(AuditLog.path, func.max(AuditLog.duracion_ms).label("max_ms"))
        .where(where)
        .group_by(AuditLog.path)
        .order_by(desc("max_ms"))
        .limit(5)
    )
    slowest = [{"path": r[0], "p95_ms": r[1]} for r in (await db.execute(slow_q)).all()]

    # Status buckets
    bucket_q = (
        select(AuditLog.status_code, func.count())
        .where(where)
        .group_by(AuditLog.status_code)
    )
    by_status_raw = (await db.execute(bucket_q)).all()
    buckets = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "other": 0}
    for code, count in by_status_raw:
        if 200 <= code < 300:
            buckets["2xx"] += count
        elif 300 <= code < 400:
            buckets["3xx"] += count
        elif 400 <= code < 500:
            buckets["4xx"] += count
        elif 500 <= code < 600:
            buckets["5xx"] += count
        else:
            buckets["other"] += count

    return AuditStats(
        total_requests=total,
        error_count=errors,
        error_rate=error_rate,
        p50_ms=p50_ms,
        p95_ms=p95_ms,
        top_endpoints=top_endpoints,
        slowest_endpoints=slowest,
        requests_by_status=buckets,
    )


@router.get("/audit-logs/distinct/{field}")
async def audit_distinct(
    field: str,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve valores únicos de un campo, para llenar selects en el frontend."""
    allowed = {"action", "method", "entity_type", "usuario_rol"}
    if field not in allowed:
        raise HTTPException(status_code=400, detail=f"campo no permitido: {field}")
    col = getattr(AuditLog, field)
    q = select(distinct(col)).where(col.is_not(None)).order_by(col)
    rows = await db.execute(q)
    return {"values": [r[0] for r in rows.all()]}


@router.get("/audit-logs/{log_id}", response_model=AuditLogDetail)
async def audit_detail(
    log_id: int,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(AuditLog, Municipio.nombre.label("muni_nombre"))
        .outerjoin(Municipio, AuditLog.municipio_id == Municipio.id)
        .where(AuditLog.id == log_id)
    )
    row = r.first()
    if not row:
        raise HTTPException(status_code=404, detail="Audit log no encontrado")
    log = row[0]
    return AuditLogDetail(
        id=log.id,
        created_at=log.created_at,
        usuario_id=log.usuario_id,
        usuario_email=log.usuario_email,
        usuario_rol=log.usuario_rol,
        municipio_id=log.municipio_id,
        municipio_nombre=row[1],
        method=log.method,
        path=log.path,
        status_code=log.status_code,
        duracion_ms=log.duracion_ms,
        action=log.action,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        query_params=log.query_params,
        request_body=log.request_body,
        response_summary=log.response_summary,
        error_message=log.error_message,
        ip_address=log.ip_address,
        user_agent=log.user_agent,
    )


@router.delete("/audit-logs/cleanup")
async def audit_cleanup(
    older_than_days: int = Query(30, ge=1),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Borra logs más viejos que `older_than_days`. Default 30 días."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    r = await db.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
    await db.commit()
    return {"deleted": r.rowcount, "older_than_days": older_than_days}


# ============================================================
# Setting debug_mode
# ============================================================
@router.get("/settings/debug_mode", response_model=DebugModeResponse)
async def get_debug_setting(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(Configuracion).where(
            Configuracion.clave == "audit.debug_mode",
            Configuracion.municipio_id.is_(None),
        )
    )
    conf = r.scalar_one_or_none()
    enabled = (conf.valor.lower() == "true") if conf else False
    return DebugModeResponse(enabled=enabled)


@router.put("/settings/debug_mode", response_model=DebugModeResponse)
async def set_debug_setting(
    payload: DebugModeUpdate,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(Configuracion).where(
            Configuracion.clave == "audit.debug_mode",
            Configuracion.municipio_id.is_(None),
        )
    )
    conf = r.scalar_one_or_none()
    valor = "true" if payload.enabled else "false"
    if conf:
        conf.valor = valor
    else:
        db.add(Configuracion(
            clave="audit.debug_mode",
            valor=valor,
            descripcion="Si true, el middleware de audit captura GETs y request bodies",
            tipo="boolean",
            editable=True,
            municipio_id=None,
        ))
    await db.commit()
    invalidate_debug_mode_cache()
    return DebugModeResponse(enabled=payload.enabled)
