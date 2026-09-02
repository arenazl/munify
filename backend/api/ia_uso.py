"""Consumo de IA: lo que se gasta, quien lo gasta y si sirvio.

Solo superadmin. Es la pantalla con la que se busca el punto dulce
tokens/modelo/performance a medida que crecen los clientes, y la que delata
sola un camino que esta devolviendo vacio (la firma del bug de gpt-oss del
2026-09-01: `respuesta_vacia` + `finish_reason='length'`).

Lee de `ia_uso`, que escribe el cliente unico `services/groq_common`.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit_helpers import require_super_admin
from core.database import get_db
from models import User
from models.ia_uso import IaUso

router = APIRouter()


class FilaUso(BaseModel):
    clave: str
    llamadas: int
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    tokens_por_llamada: int
    latencia_media_ms: int
    vacias: int
    errores: int
    fallbacks: int


class ResumenUso(BaseModel):
    desde: str
    hasta: str
    # KPIs del hero
    llamadas: int
    tokens: int
    tokens_por_llamada: int
    latencia_media_ms: int
    tasa_vacias: float          # % de llamadas que no devolvieron nada
    tasa_fallback: float        # % en que la app resolvio sin IA
    cuota_requests_restante: Optional[int]
    cuota_tokens_restante: Optional[int]
    por_feature: List[FilaUso]
    por_modelo: List[FilaUso]


def _fila(clave, r) -> FilaUso:
    llamadas = int(r.llamadas or 0)
    prompt = int(r.prompt or 0)
    compl = int(r.compl or 0)
    return FilaUso(
        clave=clave or "(sin dato)",
        llamadas=llamadas,
        prompt_tokens=prompt,
        completion_tokens=compl,
        reasoning_tokens=int(r.reason or 0),
        tokens_por_llamada=int((prompt + compl) / llamadas) if llamadas else 0,
        latencia_media_ms=int(r.latencia or 0),
        vacias=int(r.vacias or 0),
        errores=int(r.errores or 0),
        fallbacks=int(r.fallbacks or 0),
    )


def _columnas():
    """Las mismas agregaciones para cualquier agrupacion."""
    return [
        func.count(IaUso.id).label("llamadas"),
        func.sum(IaUso.prompt_tokens).label("prompt"),
        func.sum(IaUso.completion_tokens).label("compl"),
        func.sum(IaUso.reasoning_tokens).label("reason"),
        func.avg(IaUso.latencia_ms).label("latencia"),
        func.sum(func.if_(IaUso.respuesta_vacia, 1, 0)).label("vacias"),
        func.sum(func.if_(IaUso.error_http.isnot(None), 1, 0)).label("errores"),
        func.sum(func.if_(IaUso.cayo_a_fallback, 1, 0)).label("fallbacks"),
    ]


@router.get("/admin/ia-uso/resumen", response_model=ResumenUso)
async def resumen(
    dias: int = Query(7, ge=1, le=90),
    municipio_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    desde = datetime.utcnow() - timedelta(days=dias)

    def base(q):
        q = q.where(IaUso.creado >= desde)
        if municipio_id:
            q = q.where(IaUso.municipio_id == municipio_id)
        return q

    total = (await db.execute(base(select(*_columnas())))).one()
    por_feature = (await db.execute(
        base(select(IaUso.feature, *_columnas())).group_by(IaUso.feature)
        .order_by(func.count(IaUso.id).desc())
    )).all()
    por_modelo = (await db.execute(
        base(select(IaUso.modelo, *_columnas())).group_by(IaUso.modelo)
        .order_by(func.count(IaUso.id).desc())
    )).all()

    # La cuota que reporto el proveedor en la ultima llamada: sirve para ver
    # venir el techo del free tier antes de comerse un 429 en una demo.
    ultima = (await db.execute(
        select(IaUso.ratelimit_remaining_requests, IaUso.ratelimit_remaining_tokens)
        .order_by(IaUso.creado.desc()).limit(1)
    )).first()

    llamadas = int(total.llamadas or 0)
    tokens = int((total.prompt or 0) + (total.compl or 0))
    return ResumenUso(
        desde=desde.date().isoformat(),
        hasta=datetime.utcnow().date().isoformat(),
        llamadas=llamadas,
        tokens=tokens,
        tokens_por_llamada=int(tokens / llamadas) if llamadas else 0,
        latencia_media_ms=int(total.latencia or 0),
        tasa_vacias=round(100 * int(total.vacias or 0) / llamadas, 1) if llamadas else 0.0,
        tasa_fallback=round(100 * int(total.fallbacks or 0) / llamadas, 1) if llamadas else 0.0,
        cuota_requests_restante=ultima[0] if ultima else None,
        cuota_tokens_restante=ultima[1] if ultima else None,
        por_feature=[_fila(r.feature, r) for r in por_feature],
        por_modelo=[_fila(r.modelo, r) for r in por_modelo],
    )
