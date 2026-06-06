"""API SalesBot (Bruno) <-> Munify.

Dos tipos de endpoints, dos auth distintas:

  - GENERALES (los consume SalesBot, backend a backend): auth por header
    `X-SalesBot-Key`. Listan/devuelven municipios con su WhatsApp de derivacion
    + stats reales. NO son tenant-scoped: cruzan todos los municipios.

  - ADMIN per-muni (los consume el panel del propio municipio): auth JWT.
    Cargar/guardar la config de derivacion (numero + habilitado) del muni.

El WhatsApp de derivacion sale de la tabla dedicada `salesbot_configs`, NO de
WhatsAppConfig (que es la integracion Meta). Asi un muni puede estar en SalesBot
sin tener Meta configurado.
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func, case
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.config import settings
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    Municipio, Reclamo, User, Tramite, CategoriaReclamo,
    RolUsuario,
)
from models.salesbot_config import SalesbotConfig
from models.municipio_dependencia import MunicipioDependencia

router = APIRouter()

# Estados que cuentan como "resuelto": FINALIZADO es el actual, "resuelto" es
# legacy. La columna guarda el VALUE en minuscula (values_callable en el Enum).
ESTADOS_RESUELTO = ["finalizado", "resuelto"]


# ============================================================
# Auth backend-to-backend (SalesBot)
# ============================================================

def verify_salesbot_key(request: Request):
    # El codebase lee headers desde Request (evita Header() por incompat de
    # versiones FastAPI/Pydantic). Header: X-SalesBot-Key.
    key = request.headers.get("X-SalesBot-Key")
    if not settings.SALESBOT_API_KEY or key != settings.SALESBOT_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


# ============================================================
# Helpers
# ============================================================

async def _stats(db: AsyncSession, municipio_id: int, detalle: bool = False) -> dict:
    """Stats reales de un municipio (counts directos sobre la BD de Munify)."""
    total = (await db.execute(
        select(func.count(Reclamo.id)).where(Reclamo.municipio_id == municipio_id)
    )).scalar() or 0
    resueltos = (await db.execute(
        select(func.count(Reclamo.id)).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_(ESTADOS_RESUELTO),
        )
    )).scalar() or 0
    tramites = (await db.execute(
        select(func.count(Tramite.id)).where(
            Tramite.municipio_id == municipio_id,
            Tramite.activo == True,  # noqa: E712
        )
    )).scalar() or 0
    vecinos = (await db.execute(
        select(func.count(User.id)).where(
            User.municipio_id == municipio_id,
            User.rol == RolUsuario.VECINO,
        )
    )).scalar() or 0

    stats = {
        "reclamos_totales": int(total),
        "reclamos_resueltos": int(resueltos),
        "tramites_activos": int(tramites),
        "vecinos": int(vecinos),
    }
    if detalle:
        stats["tasa_resolucion_pct"] = round(resueltos / total * 100) if total else 0
        cats = (await db.execute(
            select(CategoriaReclamo.nombre)
            .where(CategoriaReclamo.municipio_id == municipio_id)
            .order_by(CategoriaReclamo.nombre)
            .limit(8)
        )).scalars().all()
        stats["categorias_reclamo"] = list(cats)
    return stats


async def _salesbot_map(db: AsyncSession, municipio_ids: List[int]) -> dict:
    """{municipio_id: SalesbotConfig} (1 query, evita N+1)."""
    if not municipio_ids:
        return {}
    rows = (await db.execute(
        select(SalesbotConfig).where(SalesbotConfig.municipio_id.in_(municipio_ids))
    )).scalars().all()
    return {r.municipio_id: r for r in rows}


async def _stats_batch(db: AsyncSession, municipio_ids: List[int]) -> dict:
    """Stats de VARIOS municipios en pocas queries agregadas (evita el N+1 de
    llamar _stats por municipio). Mismos filtros que _stats: los numeros son
    identicos, solo cambia como se piden. Devuelve {muni_id: {stats}}."""
    base = {
        mid: {
            "reclamos_totales": 0,
            "reclamos_resueltos": 0,
            "tramites_activos": 0,
            "vecinos": 0,
        }
        for mid in municipio_ids
    }
    if not municipio_ids:
        return base

    # Reclamos: total y resueltos en una sola pasada (SUM condicional).
    for mid, total, resueltos in (await db.execute(
        select(
            Reclamo.municipio_id,
            func.count(Reclamo.id),
            func.coalesce(
                func.sum(case((Reclamo.estado.in_(ESTADOS_RESUELTO), 1), else_=0)), 0
            ),
        )
        .where(Reclamo.municipio_id.in_(municipio_ids))
        .group_by(Reclamo.municipio_id)
    )).all():
        if mid in base:
            base[mid]["reclamos_totales"] = int(total or 0)
            base[mid]["reclamos_resueltos"] = int(resueltos or 0)

    # Tramites activos por municipio.
    for mid, c in (await db.execute(
        select(Tramite.municipio_id, func.count(Tramite.id))
        .where(Tramite.municipio_id.in_(municipio_ids), Tramite.activo == True)  # noqa: E712
        .group_by(Tramite.municipio_id)
    )).all():
        if mid in base:
            base[mid]["tramites_activos"] = int(c or 0)

    # Vecinos por municipio.
    for mid, c in (await db.execute(
        select(User.municipio_id, func.count(User.id))
        .where(User.municipio_id.in_(municipio_ids), User.rol == RolUsuario.VECINO)
        .group_by(User.municipio_id)
    )).all():
        if mid in base:
            base[mid]["vecinos"] = int(c or 0)

    return base


# ============================================================
# Endpoints GENERALES (SalesBot, X-SalesBot-Key)
# ============================================================

@router.get("/municipios")
async def listar_municipios(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Lista TODOS los municipios activos con su derivacion de WhatsApp + stats."""
    verify_salesbot_key(request)
    munis = (await db.execute(
        select(Municipio).where(Municipio.activo == True).order_by(Municipio.nombre)  # noqa: E712
    )).scalars().all()
    ids = [m.id for m in munis]
    sb = await _salesbot_map(db, ids)
    stats_map = await _stats_batch(db, ids)  # 1 pasada agregada, no N+1 por muni

    out = []
    for m in munis:
        cfg = sb.get(m.id)
        out.append({
            "id": m.id,
            "nombre": m.nombre,
            "codigo": m.codigo,
            "logo_url": m.logo_url,
            "color_primario": m.color_primario,
            # telefono va tambien en la LISTA: el fast-path del postback del menu
            # interactivo (Flujo 2) lo usa como fallback cuando no hay whatsapp,
            # sin tener que pegarle a /detalle.
            "telefono": m.telefono,
            "whatsapp": cfg.whatsapp if cfg else None,
            "whatsapp_habilitado": cfg.habilitado if cfg else False,
            "stats": stats_map[m.id],
        })
    return out


@router.get("/municipios/{municipio_id}/detalle")
async def detalle_municipio(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Detalle de un municipio (cuando el prospecto ya eligio uno)."""
    verify_salesbot_key(request)
    m = (await db.execute(
        select(Municipio).where(
            Municipio.id == municipio_id,
            Municipio.activo == True,  # noqa: E712
        )
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    sb = await _salesbot_map(db, [m.id])
    cfg = sb.get(m.id)
    return {
        "id": m.id,
        "nombre": m.nombre,
        "codigo": m.codigo,
        "descripcion": m.descripcion,
        "telefono": m.telefono,
        "email": m.email,
        "sitio_web": m.sitio_web,
        "logo_url": m.logo_url,
        "color_primario": m.color_primario,
        "whatsapp": cfg.whatsapp if cfg else None,
        "whatsapp_habilitado": cfg.habilitado if cfg else False,
        "stats": await _stats(db, m.id, detalle=True),
    }


@router.get("/municipios/{municipio_id}/tramites")
async def listar_tramites_muni(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Tramites activos que ofrece el municipio."""
    verify_salesbot_key(request)
    rows = (await db.execute(
        select(Tramite).where(
            Tramite.municipio_id == municipio_id,
            Tramite.activo == True,  # noqa: E712
        ).order_by(Tramite.nombre)
    )).scalars().all()
    return [
        {"id": t.id, "nombre": t.nombre, "descripcion": t.descripcion, "activo": bool(t.activo)}
        for t in rows
    ]


@router.get("/municipios/{municipio_id}/categorias")
async def listar_categorias_muni(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Categorias de reclamo del municipio."""
    verify_salesbot_key(request)
    rows = (await db.execute(
        select(CategoriaReclamo)
        .where(CategoriaReclamo.municipio_id == municipio_id)
        .order_by(CategoriaReclamo.nombre)
    )).scalars().all()
    return [{"id": c.id, "nombre": c.nombre, "descripcion": c.descripcion} for c in rows]


@router.get("/municipios/{municipio_id}/dependencias")
async def listar_dependencias_muni(
    municipio_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Areas/secretarias habilitadas en el municipio. Dependencia es un template
    global (sin municipio_id); las del muni viven en el pivot MunicipioDependencia
    con telefono/email efectivos (override local o el del template)."""
    verify_salesbot_key(request)
    rows = (await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(
            MunicipioDependencia.municipio_id == municipio_id,
            MunicipioDependencia.activo == True,  # noqa: E712
        )
    )).scalars().all()
    out = [
        {"id": md.dependencia_id, "nombre": md.nombre, "telefono": md.telefono_efectivo, "email": md.email_efectivo}
        for md in rows
    ]
    out.sort(key=lambda d: (d["nombre"] or ""))
    return out


# ============================================================
# Endpoints ADMIN per-muni (panel del municipio, JWT)
# ============================================================

class SalesbotConfigIn(BaseModel):
    whatsapp: Optional[str] = None
    habilitado: bool = False


class SalesbotConfigOut(BaseModel):
    municipio_id: int
    whatsapp: Optional[str] = None
    habilitado: bool = False


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


@router.get("/mi-config", response_model=SalesbotConfigOut)
async def get_mi_config(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Config de derivacion del municipio actual (para la pestaña SalesBot)."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    cfg = (await db.execute(
        select(SalesbotConfig).where(SalesbotConfig.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not cfg:
        return SalesbotConfigOut(municipio_id=muni_id, whatsapp=None, habilitado=False)
    return SalesbotConfigOut(municipio_id=muni_id, whatsapp=cfg.whatsapp, habilitado=cfg.habilitado)


@router.put("/mi-config", response_model=SalesbotConfigOut)
async def put_mi_config(
    payload: SalesbotConfigIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea o actualiza la config de derivacion del municipio actual."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    cfg = (await db.execute(
        select(SalesbotConfig).where(SalesbotConfig.municipio_id == muni_id)
    )).scalar_one_or_none()
    if not cfg:
        cfg = SalesbotConfig(municipio_id=muni_id)
        db.add(cfg)
    cfg.whatsapp = (payload.whatsapp or "").strip() or None
    cfg.habilitado = bool(payload.habilitado)
    await db.commit()
    await db.refresh(cfg)
    return SalesbotConfigOut(municipio_id=muni_id, whatsapp=cfg.whatsapp, habilitado=cfg.habilitado)
