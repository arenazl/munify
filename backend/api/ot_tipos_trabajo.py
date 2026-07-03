"""Tipos de trabajo de las OT — catálogo configurable por municipio (template).

Clasifica la OT en la planilla (Poda, Bacheo, Alumbrado, ...). Multi-tenant,
gestión admin/supervisor. Prefijo propio (`/ot-tipos-trabajo`) para no
colisionar con `/ordenes-trabajo/{ot_id}`.
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import require_roles
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from models import OrdenTrabajoTipo, OrdenTrabajo, User

router = APIRouter()


class TipoCreate(BaseModel):
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None
    orden: int = 0

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class TipoUpdate(BaseModel):
    nombre: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class TipoResponse(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None
    activo: bool
    orden: int

    class Config:
        from_attributes = True


async def _get_tipo(db: AsyncSession, tipo_id: int, municipio_id: int) -> OrdenTrabajoTipo:
    t = (await db.execute(select(OrdenTrabajoTipo).where(
        OrdenTrabajoTipo.id == tipo_id, OrdenTrabajoTipo.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tipo de trabajo no encontrado")
    return t


@router.get("", response_model=List[TipoResponse])
async def listar_tipos(
    request: Request,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(OrdenTrabajoTipo).where(OrdenTrabajoTipo.municipio_id == municipio_id)
    if activo is not None:
        query = query.where(OrdenTrabajoTipo.activo == activo)
    query = query.order_by(OrdenTrabajoTipo.orden, OrdenTrabajoTipo.nombre)
    return list((await db.execute(query)).scalars().all())


@router.post("", response_model=TipoResponse)
async def crear_tipo(
    data: TipoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    dup = (await db.execute(select(OrdenTrabajoTipo.id).where(
        OrdenTrabajoTipo.municipio_id == municipio_id, OrdenTrabajoTipo.nombre == data.nombre,
    ))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="Ya existe un tipo de trabajo con ese nombre")
    t = OrdenTrabajoTipo(
        municipio_id=municipio_id, nombre=data.nombre, icono=data.icono,
        color=data.color, orden=data.orden,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.put("/{tipo_id}", response_model=TipoResponse)
async def actualizar_tipo(
    tipo_id: int,
    data: TipoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    t = await _get_tipo(db, tipo_id, municipio_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/{tipo_id}")
async def eliminar_tipo(
    tipo_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Si hay OTs usando este tipo, hace soft delete (activo=False) para no
    romper el histórico; si no lo usa nadie, lo borra."""
    municipio_id = get_effective_municipio_id(request, current_user)
    t = await _get_tipo(db, tipo_id, municipio_id)
    en_uso = (await db.execute(select(func.count(OrdenTrabajo.id)).where(
        OrdenTrabajo.tipo_trabajo_id == tipo_id
    ))).scalar_one()
    if en_uso:
        t.activo = False
    else:
        await db.delete(t)
    await db.commit()
    return {"ok": True, "soft_delete": bool(en_uso)}
