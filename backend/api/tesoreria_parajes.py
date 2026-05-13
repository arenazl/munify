"""ABM de Parajes (regiones del muni) + integracion con contactos."""
import json
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, ConfigDict

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import TesoreriaParaje, Contacto, User, RolUsuario

router = APIRouter()


class ParajeBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    poligono: Optional[List[List[float]]] = None  # [[lat, lon], ...]
    orden: int = 0


class ParajeCreate(ParajeBase):
    pass


class ParajeUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None
    poligono: Optional[List[List[float]]] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class ParajeResponse(ParajeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    municipio_id: int
    centro_lat: Optional[float] = None
    centro_lon: Optional[float] = None
    activo: bool
    cantidad_contactos: Optional[int] = None
    created_at: datetime
    updated_at: datetime


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


def _centroide(coords: List[List[float]]) -> tuple[Optional[float], Optional[float]]:
    if not coords:
        return None, None
    lats = [c[0] for c in coords if len(c) == 2]
    lons = [c[1] for c in coords if len(c) == 2]
    if not lats or not lons:
        return None, None
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _to_response(p: TesoreriaParaje, cantidad_contactos: Optional[int] = None) -> ParajeResponse:
    poligono = None
    if p.poligono:
        try:
            poligono = json.loads(p.poligono)
        except Exception:
            poligono = None
    resp = ParajeResponse(
        id=p.id,
        municipio_id=p.municipio_id,
        nombre=p.nombre,
        descripcion=p.descripcion,
        color=p.color,
        icono=p.icono,
        poligono=poligono,
        orden=p.orden,
        centro_lat=p.centro_lat,
        centro_lon=p.centro_lon,
        activo=p.activo,
        cantidad_contactos=cantidad_contactos,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )
    return resp


@router.get("", response_model=List[ParajeResponse])
async def list_parajes(
    request: Request,
    activo: Optional[bool] = True,
    include_count: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    q = select(TesoreriaParaje).where(TesoreriaParaje.municipio_id == muni_id)
    if activo is not None:
        q = q.where(TesoreriaParaje.activo == activo)
    q = q.order_by(TesoreriaParaje.orden, TesoreriaParaje.nombre)
    parajes = (await db.execute(q)).scalars().all()

    counts: dict[int, int] = {}
    if parajes and include_count:
        try:
            rows = (await db.execute(
                select(Contacto.paraje_id, func.count(Contacto.id))  # type: ignore[attr-defined]
                .where(Contacto.municipio_id == muni_id, Contacto.activo == True)  # noqa: E712
                .group_by(Contacto.paraje_id)  # type: ignore[attr-defined]
            )).all()
            counts = {r[0]: r[1] for r in rows if r[0]}
        except Exception:
            counts = {}

    return [_to_response(p, counts.get(p.id, 0)) for p in parajes]


@router.post("", response_model=ParajeResponse, status_code=201)
async def create_paraje(
    payload: ParajeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    data = payload.model_dump()
    coords = data.pop("poligono", None)
    poligono_json = json.dumps(coords) if coords else None
    lat, lon = _centroide(coords or [])
    p = TesoreriaParaje(
        municipio_id=muni_id,
        poligono=poligono_json,
        centro_lat=lat,
        centro_lon=lon,
        **data,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _to_response(p, 0)


@router.put("/{paraje_id}", response_model=ParajeResponse)
async def update_paraje(
    paraje_id: int,
    payload: ParajeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = (await db.execute(
        select(TesoreriaParaje).where(
            TesoreriaParaje.id == paraje_id,
            TesoreriaParaje.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Paraje no encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "poligono" in data:
        coords = data.pop("poligono")
        p.poligono = json.dumps(coords) if coords else None
        lat, lon = _centroide(coords or [])
        p.centro_lat = lat
        p.centro_lon = lon
    for k, v in data.items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return _to_response(p)


@router.delete("/{paraje_id}")
async def delete_paraje(
    paraje_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    p = (await db.execute(
        select(TesoreriaParaje).where(
            TesoreriaParaje.id == paraje_id,
            TesoreriaParaje.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "No encontrado")
    p.activo = False
    await db.commit()
    return {"ok": True, "id": paraje_id}
