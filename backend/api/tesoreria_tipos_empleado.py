"""ABM de tipos de empleado (sub-clasificacion: albañil, MMO, arquitecto, etc)."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import TesoreriaTipoEmpleado, Contacto, User, RolUsuario
from schemas.tesoreria_extra import (
    TipoEmpleadoCreate, TipoEmpleadoUpdate, TipoEmpleadoResponse,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos")


@router.get("", response_model=List[TipoEmpleadoResponse])
async def list_tipos(
    request: Request,
    activo: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(TesoreriaTipoEmpleado).where(TesoreriaTipoEmpleado.municipio_id == muni_id)
    if activo is not None:
        q = q.where(TesoreriaTipoEmpleado.activo == activo)
    q = q.order_by(TesoreriaTipoEmpleado.orden, TesoreriaTipoEmpleado.nombre)
    tipos = (await db.execute(q)).scalars().all()

    # Contar empleados por tipo (usa tipo_empleado_id en contactos)
    counts = {}
    if tipos:
        try:
            rows = (await db.execute(
                select(Contacto.tipo_empleado_id, func.count(Contacto.id))  # type: ignore[attr-defined]
                .where(Contacto.municipio_id == muni_id, Contacto.tipo == 'empleado', Contacto.activo == True)  # noqa
                .group_by(Contacto.tipo_empleado_id)  # type: ignore[attr-defined]
            )).all()
            counts = {r[0]: r[1] for r in rows if r[0]}
        except Exception:
            counts = {}

    out = []
    for t in tipos:
        resp = TipoEmpleadoResponse.model_validate(t)
        resp.cantidad_empleados = counts.get(t.id, 0)
        out.append(resp)
    return out


@router.post("", response_model=TipoEmpleadoResponse, status_code=201)
async def create_tipo(
    payload: TipoEmpleadoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    tipo = TesoreriaTipoEmpleado(municipio_id=muni_id, **payload.model_dump())
    db.add(tipo)
    await db.commit()
    await db.refresh(tipo)
    return TipoEmpleadoResponse.model_validate(tipo)


@router.put("/{tipo_id}", response_model=TipoEmpleadoResponse)
async def update_tipo(
    tipo_id: int,
    payload: TipoEmpleadoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    tipo = (await db.execute(
        select(TesoreriaTipoEmpleado).where(
            TesoreriaTipoEmpleado.id == tipo_id, TesoreriaTipoEmpleado.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not tipo:
        raise HTTPException(404, "Tipo de empleado no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tipo, k, v)
    await db.commit()
    await db.refresh(tipo)
    return TipoEmpleadoResponse.model_validate(tipo)


@router.delete("/{tipo_id}")
async def delete_tipo(
    tipo_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    tipo = (await db.execute(
        select(TesoreriaTipoEmpleado).where(
            TesoreriaTipoEmpleado.id == tipo_id, TesoreriaTipoEmpleado.municipio_id == muni_id
        )
    )).scalar_one_or_none()
    if not tipo:
        raise HTTPException(404, "No encontrado")
    tipo.activo = False
    await db.commit()
    return {"ok": True, "id": tipo_id}
