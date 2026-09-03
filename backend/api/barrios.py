"""
ABM de barrios — el tercer nivel del territorio (municipio -> zona -> barrio).

Hasta el 2026-09-02 los barrios no tenían pantalla: el alta de la demo los
ascendía a zonas y por eso "se veían". Con el modelo nuevo (una ciudad nace
con una sola zona y todos sus barrios adentro) quedaron en la base sin
ninguna UI que los expusiera. Este router es lo que Configuración > Municipio
> Barrios consume, y lo que el mapa usa como catálogo de lugares.

Reglas:
  - Todo filtra por el municipio efectivo del usuario (multi-tenant).
  - La zona de un barrio tiene que ser del mismo municipio.
  - Un barrio con reclamos no se borra (409): el reclamo apunta a él por FK
    y un barrio "borrado" dejaría el reclamo sin lugar.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_roles
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from models.barrio import Barrio
from models.reclamo import Reclamo
from models.user import User
from models.zona import Zona
from schemas.barrio import BarrioCreate, BarrioResponse, BarriosMover, BarrioUpdate

router = APIRouter()

ROLES_EDICION = ["admin", "supervisor"]


async def _zona_del_municipio(db: AsyncSession, zona_id: Optional[int], municipio_id: int) -> Optional[Zona]:
    """La zona pedida, si existe y es de este municipio. None = sin zona."""
    if zona_id is None:
        return None
    zona = (await db.execute(
        select(Zona).where(Zona.id == zona_id, Zona.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not zona:
        raise HTTPException(status_code=400, detail="La zona no existe en este municipio")
    return zona


async def _barrio_del_municipio(db: AsyncSession, barrio_id: int, municipio_id: int) -> Barrio:
    barrio = (await db.execute(
        select(Barrio).where(Barrio.id == barrio_id, Barrio.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not barrio:
        raise HTTPException(status_code=404, detail="Barrio no encontrado")
    return barrio


async def _nombre_repetido(db: AsyncSession, nombre: str, municipio_id: int, salvo_id: Optional[int] = None) -> bool:
    q = select(Barrio.id).where(
        Barrio.municipio_id == municipio_id,
        func.lower(Barrio.nombre) == nombre.lower(),
    )
    if salvo_id is not None:
        q = q.where(Barrio.id != salvo_id)
    return (await db.execute(q)).first() is not None


async def _completar(db: AsyncSession, barrios: list[Barrio], municipio_id: int) -> list[BarrioResponse]:
    """Los datos derivados, con UNA query por dato para todos los barrios."""
    if not barrios:
        return []
    ids = [b.id for b in barrios]
    zona_ids = {b.zona_id for b in barrios if b.zona_id is not None}
    nombres_zona: dict[int, str] = {}
    if zona_ids:
        nombres_zona = dict((await db.execute(
            select(Zona.id, Zona.nombre).where(Zona.id.in_(zona_ids))
        )).all())
    por_reclamos = dict((await db.execute(
        select(Reclamo.barrio_id, func.count(Reclamo.id))
        .where(Reclamo.barrio_id.in_(ids))
        .group_by(Reclamo.barrio_id)
    )).all())
    # `poligono` es deferred en el modelo: se pregunta sólo si está, sin traerlo.
    con_contorno = {
        r[0] for r in (await db.execute(text(
            "SELECT id FROM barrios WHERE municipio_id = :m AND poligono IS NOT NULL"
        ), {"m": municipio_id})).fetchall()
    }
    salida = []
    for b in barrios:
        item = BarrioResponse.model_validate(b)
        item.zona_nombre = nombres_zona.get(b.zona_id) if b.zona_id is not None else None
        item.reclamos_count = int(por_reclamos.get(b.id, 0))
        item.tiene_contorno = b.id in con_contorno
        salida.append(item)
    return salida


@router.get("", response_model=List[BarrioResponse])
async def get_barrios(
    request: Request,
    zona_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    q = select(Barrio).where(Barrio.municipio_id == municipio_id)
    if zona_id is not None:
        q = q.where(Barrio.zona_id == zona_id)
    barrios = (await db.execute(q.order_by(Barrio.nombre))).scalars().all()
    return await _completar(db, list(barrios), municipio_id)


@router.post("", response_model=BarrioResponse, status_code=201)
async def create_barrio(
    request: Request,
    data: BarrioCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(ROLES_EDICION)),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    if await _nombre_repetido(db, data.nombre, municipio_id):
        raise HTTPException(status_code=400, detail="Ya existe un barrio con ese nombre")
    await _zona_del_municipio(db, data.zona_id, municipio_id)
    barrio = Barrio(
        **data.model_dump(),
        municipio_id=municipio_id,
        # "validado" quiere decir "tiene coordenadas"; un barrio cargado a mano
        # con lat/lon las tiene por definición.
        validado=data.latitud is not None and data.longitud is not None,
    )
    db.add(barrio)
    await db.commit()
    await db.refresh(barrio)
    return (await _completar(db, [barrio], municipio_id))[0]


@router.put("/mover", response_model=List[BarrioResponse])
async def mover_barrios(
    request: Request,
    data: BarriosMover,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(ROLES_EDICION)),
):
    """Varios barrios a una zona de un saque. Va ANTES de `/{barrio_id}` para
    que FastAPI no lea "mover" como un id."""
    municipio_id = get_effective_municipio_id(request, current_user)
    if not data.barrio_ids:
        raise HTTPException(status_code=400, detail="No hay barrios para mover")
    await _zona_del_municipio(db, data.zona_id, municipio_id)
    barrios = (await db.execute(
        select(Barrio).where(Barrio.municipio_id == municipio_id, Barrio.id.in_(data.barrio_ids))
    )).scalars().all()
    if len(barrios) != len(set(data.barrio_ids)):
        raise HTTPException(status_code=404, detail="Alguno de los barrios no es de este municipio")
    for b in barrios:
        b.zona_id = data.zona_id
    await db.commit()
    for b in barrios:
        await db.refresh(b)
    return await _completar(db, list(barrios), municipio_id)


@router.get("/{barrio_id}", response_model=BarrioResponse)
async def get_barrio(
    request: Request,
    barrio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    barrio = await _barrio_del_municipio(db, barrio_id, municipio_id)
    return (await _completar(db, [barrio], municipio_id))[0]


@router.put("/{barrio_id}", response_model=BarrioResponse)
async def update_barrio(
    request: Request,
    barrio_id: int,
    data: BarrioUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(ROLES_EDICION)),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    barrio = await _barrio_del_municipio(db, barrio_id, municipio_id)
    cambios = data.model_dump(exclude_unset=True)
    if "nombre" in cambios and await _nombre_repetido(db, cambios["nombre"], municipio_id, salvo_id=barrio.id):
        raise HTTPException(status_code=400, detail="Ya existe un barrio con ese nombre")
    if "zona_id" in cambios:
        await _zona_del_municipio(db, cambios["zona_id"], municipio_id)
    for k, v in cambios.items():
        setattr(barrio, k, v)
    if "latitud" in cambios or "longitud" in cambios:
        barrio.validado = barrio.latitud is not None and barrio.longitud is not None
    await db.commit()
    await db.refresh(barrio)
    return (await _completar(db, [barrio], municipio_id))[0]


@router.delete("/{barrio_id}")
async def delete_barrio(
    request: Request,
    barrio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(ROLES_EDICION)),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    barrio = await _barrio_del_municipio(db, barrio_id, municipio_id)
    reclamos = (await db.execute(
        select(func.count(Reclamo.id)).where(Reclamo.barrio_id == barrio.id)
    )).scalar() or 0
    if reclamos:
        raise HTTPException(
            status_code=409,
            detail=f"El barrio tiene {reclamos} reclamo{'s' if reclamos != 1 else ''}: no se puede borrar. "
                   "Si sobra, movelo a otra zona o renombralo.",
        )
    await db.delete(barrio)
    await db.commit()
    return {"message": "Barrio eliminado"}
