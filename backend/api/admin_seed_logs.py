# -*- coding: utf-8 -*-
"""Consola del super admin: que hizo la semilla en cada demo.

Es de lectura y es CROSS-TENANT a proposito --- la gracia es comparar demos de
municipios distintos ---, asi que el filtro por `municipio_id` no aplica. Lo que
si aplica, y no es opcional, es el gate de rol: `require_super_admin` (admin sin
`municipio_id`), el mismo que usa la consola de auditoria.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_helpers import require_super_admin
from core.database import get_db
from models.demo_seed_log import DemoSeedLog
from models.user import User

router = APIRouter()


def _fila(log: DemoSeedLog, con_pasos: bool = False) -> dict:
    d = {
        "id": log.id,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "municipio_id": log.municipio_id,
        "municipio_nombre": log.municipio_nombre,
        "codigo": log.codigo,
        "pais": log.pais,
        "provincia": log.provincia,
        "origen": log.origen,
        "estado": log.estado,
        "duracion_ms": log.duracion_ms,
        "resumen": log.resumen,
        "error_message": log.error_message,
    }
    if con_pasos:
        d["pasos"] = log.pasos
    return d


@router.get("/admin/seed-logs")
async def listar_seed_logs(
    estado: Optional[str] = Query(None, description="ok | degradado | fallo"),
    municipio_id: Optional[int] = None,
    q: Optional[str] = Query(None, description="filtra por nombre de municipio"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Ultimas creaciones de demo con su resumen. Sin los pasos: el detalle de
    una demo grande son 20 pasos con sus counts y no entra en un listado."""
    qry = select(DemoSeedLog)
    if estado:
        qry = qry.where(DemoSeedLog.estado == estado)
    if municipio_id is not None:
        qry = qry.where(DemoSeedLog.municipio_id == municipio_id)
    if q:
        qry = qry.where(DemoSeedLog.municipio_nombre.like(f"%{q}%"))
    qry = qry.order_by(DemoSeedLog.id.desc()).offset(offset).limit(limit)
    filas = (await db.execute(qry)).scalars().all()
    return {"total": len(filas), "items": [_fila(f) for f in filas]}


@router.get("/admin/seed-logs/{log_id}")
async def detalle_seed_log(
    log_id: int,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """El paso a paso completo de UNA creacion: cada etapa con su estado, lo que
    produjo (counts y los nombres reales) y el motivo si degrado o fallo."""
    log = (await db.execute(
        select(DemoSeedLog).where(DemoSeedLog.id == log_id))).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Log de seeding no encontrado")
    return _fila(log, con_pasos=True)
