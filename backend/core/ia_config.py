"""Helper central para leer la config de IA de un municipio.

Lo usan los servicios de IA (gate de backend) y el endpoint que alimenta el
gate del frontend. Default si el municipio no tiene fila: DESHABILITADA.
"""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.municipio_ia_config import MunicipioIaConfig


@dataclass
class IaConfig:
    habilitada: bool
    provider: str
    modelo: str
    tesoreria: bool = True


def _default() -> IaConfig:
    return IaConfig(habilitada=False, provider="gemini", modelo=settings.GEMINI_MODEL or "gemini-2.5-flash", tesoreria=True)


async def get_ia_config(db: AsyncSession, municipio_id: Optional[int]) -> IaConfig:
    if not municipio_id:
        return _default()
    row = (await db.execute(
        select(MunicipioIaConfig).where(MunicipioIaConfig.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not row:
        return _default()
    return IaConfig(
        habilitada=bool(row.habilitada),
        provider=row.provider or "gemini",
        modelo=row.modelo or (settings.GEMINI_MODEL or "gemini-2.5-flash"),
        tesoreria=bool(row.tesoreria),
    )


async def ia_habilitada(db: AsyncSession, municipio_id: Optional[int]) -> bool:
    return (await get_ia_config(db, municipio_id)).habilitada
