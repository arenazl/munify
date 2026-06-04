"""Config de IA por municipio.

  - Superadmin (admin sin municipio_id): GET/PUT /admin/ia-config/{municipio_id}
    para prender/apagar la IA y elegir el modelo de Gemini de cada municipio.
    El intendente NO accede (guard require_super_admin).
  - Gate del frontend: GET /ia-config/actual devuelve la config del municipio
    actual (cualquier usuario autenticado del muni) para ocultar/mostrar la IA.
"""
from typing import List

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import resolve_municipio_id
from core.audit_helpers import require_super_admin
from core.ia_config import get_ia_config
from models import User
from models.municipio_ia_config import MunicipioIaConfig

router = APIRouter()

# Modelos de Gemini ofrecidos en la pantalla del superadmin.
MODELOS_GEMINI: List[str] = [
    "gemini-2.5-flash",       # económico + bueno (default)
    "gemini-2.5-flash-lite",  # el más liviano/barato (light)
    "gemini-2.5-pro",         # el mejor (más caro)
    "gemini-2.0-flash",       # alternativa más barata
]


class IaConfigIn(BaseModel):
    habilitada: bool = False
    provider: str = "gemini"
    modelo: str = "gemini-2.5-flash"
    tesoreria: bool = True


class IaConfigOut(BaseModel):
    municipio_id: int
    habilitada: bool
    provider: str
    modelo: str
    tesoreria: bool = True


# ============ Superadmin: config por municipio (path param) ============

@router.get("/admin/ia-config/modelos", response_model=List[str])
async def admin_listar_modelos(_: User = Depends(require_super_admin)):
    return MODELOS_GEMINI


@router.get("/admin/ia-config/{municipio_id}", response_model=IaConfigOut)
async def admin_get_ia_config(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    cfg = await get_ia_config(db, municipio_id)
    return IaConfigOut(municipio_id=municipio_id, habilitada=cfg.habilitada, provider=cfg.provider, modelo=cfg.modelo, tesoreria=cfg.tesoreria)


@router.put("/admin/ia-config/{municipio_id}", response_model=IaConfigOut)
async def admin_put_ia_config(
    municipio_id: int,
    payload: IaConfigIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    row = (await db.execute(
        select(MunicipioIaConfig).where(MunicipioIaConfig.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not row:
        row = MunicipioIaConfig(municipio_id=municipio_id)
        db.add(row)
    row.habilitada = bool(payload.habilitada)
    row.provider = (payload.provider or "gemini").strip() or "gemini"
    row.modelo = (payload.modelo or "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    row.tesoreria = bool(payload.tesoreria)
    await db.commit()
    await db.refresh(row)
    return IaConfigOut(municipio_id=municipio_id, habilitada=row.habilitada, provider=row.provider, modelo=row.modelo, tesoreria=row.tesoreria)


# ============ Gate del frontend: config del municipio actual ============

@router.get("/ia-config/actual", response_model=IaConfigOut)
async def get_ia_config_actual(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Config del municipio actual. Si no hay muni resoluble (superadmin en
    modo Global), devuelve deshabilitada — no rompe."""
    muni_id = resolve_municipio_id(request, current_user)
    cfg = await get_ia_config(db, muni_id)
    return IaConfigOut(municipio_id=muni_id or 0, habilitada=cfg.habilitada, provider=cfg.provider, modelo=cfg.modelo, tesoreria=cfg.tesoreria)
