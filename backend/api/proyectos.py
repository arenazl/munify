"""API de Proyectos del modulo Tesoreria.

Proyectos = obras / iniciativas con varios gastos imputados.
Ejemplo: "Departamento para el vecindario", "Repavimentacion Av X".

Cada gasto puede imputarse a 0+ proyectos via tabla gasto_proyectos
(N:M con monto_asignado por gasto).

Endpoints:
  GET    /tesoreria/proyectos                 listado (opcional con resumen)
  POST   /tesoreria/proyectos                 crear
  GET    /tesoreria/proyectos/{id}            detalle + resumen + gastos
  PUT    /tesoreria/proyectos/{id}            update
  DELETE /tesoreria/proyectos/{id}            soft delete
  GET    /tesoreria/proyectos/publicas         OBRAS del vecino (sin token)
"""
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import Proyecto, GastoProyecto, User, RolUsuario
from schemas.tesoreria import (
    ObraPublica, ProyectoCreate, ProyectoUpdate, ProyectoResponse, ProyectoResumen,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar proyectos")


async def _resumen_proyecto(db: AsyncSession, proyecto: Proyecto) -> ProyectoResumen:
    """Calcula total imputado y cantidad de gastos del proyecto."""
    q = select(
        func.coalesce(func.sum(GastoProyecto.monto_asignado), 0),
        func.count(GastoProyecto.id),
    ).where(GastoProyecto.proyecto_id == proyecto.id)
    row = (await db.execute(q)).one()
    total = Decimal(row[0] or 0)
    cantidad = int(row[1] or 0)
    pct = None
    if proyecto.presupuesto and proyecto.presupuesto > 0:
        pct = float(total / proyecto.presupuesto * 100)
    return ProyectoResumen(
        total_imputado=total,
        cantidad_gastos=cantidad,
        porcentaje_presupuesto=pct,
    )


@router.get("", response_model=List[ProyectoResponse])
async def list_proyectos(
    request: Request,
    estado: Optional[str] = None,
    activo: Optional[bool] = True,
    search: Optional[str] = Query(None, description="Busca en nombre/descripcion"),
    include_resumen: bool = Query(True, description="Incluye total_imputado y cantidad_gastos"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    query = select(Proyecto).where(Proyecto.municipio_id == municipio_id)
    if estado:
        query = query.where(Proyecto.estado == estado)
    if activo is not None:
        query = query.where(Proyecto.activo == activo)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.where(or_(Proyecto.nombre.ilike(s), Proyecto.descripcion.ilike(s)))

    query = query.order_by(Proyecto.created_at.desc()).offset(skip).limit(limit)
    proyectos = (await db.execute(query)).scalars().all()

    responses = []
    for p in proyectos:
        resp = ProyectoResponse.model_validate(p)
        if include_resumen:
            resp.resumen = await _resumen_proyecto(db, p)
        responses.append(resp)
    return responses


@router.post("", response_model=ProyectoResponse, status_code=201)
async def create_proyecto(
    payload: ProyectoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    proyecto = Proyecto(municipio_id=municipio_id, **payload.model_dump())
    db.add(proyecto)
    await db.commit()
    await db.refresh(proyecto)
    resp = ProyectoResponse.model_validate(proyecto)
    resp.resumen = ProyectoResumen(total_imputado=Decimal(0), cantidad_gastos=0, porcentaje_presupuesto=None)
    return resp


@router.get("/publicas", response_model=List[ObraPublica])
async def obras_publicas(
    municipio_id: int = Query(..., description="Municipio del vecino"),
    db: AsyncSession = Depends(get_db),
):
    """Las obras que el municipio decidio MOSTRAR al vecino (sin login).

    Modulo Comunicacion, Etapa 2. Tres reglas que hacen a lo que sale a la
    calle:
      - solo `publico=True` y `activo=True`: publicar es un acto deliberado;
      - el monto viaja SOLO si el muni prendio `mostrar_monto`, y es lo
        REALMENTE imputado (la suma de gastos), no el presupuesto: decir
        "esta obra sale X" cuando X es una estimacion es prometer un numero;
      - primero lo que esta en ejecucion, que es lo que el vecino ve en la
        calle; despues lo terminado; al final lo que todavia no arranco.

    Va ANTES de /{proyecto_id} en el archivo: si no, FastAPI intenta leer
    "publicas" como un id y devuelve 422.
    """
    r = await db.execute(
        select(Proyecto)
        .where(
            Proyecto.municipio_id == municipio_id,
            Proyecto.publico == True,   # noqa: E712
            Proyecto.activo == True,    # noqa: E712
        )
    )
    obras = r.scalars().all()
    if not obras:
        return []

    # Lo invertido sale de las imputaciones reales, en UNA query para todas.
    ids_con_monto = [o.id for o in obras if o.mostrar_monto]
    invertido: dict[int, Decimal] = {}
    if ids_con_monto:
        r2 = await db.execute(
            select(GastoProyecto.proyecto_id, func.coalesce(func.sum(GastoProyecto.monto_asignado), 0))
            .where(GastoProyecto.proyecto_id.in_(ids_con_monto))
            .group_by(GastoProyecto.proyecto_id)
        )
        invertido = {pid: total for pid, total in r2.all()}

    orden = {"en_ejecucion": 0, "terminada": 1, "por_empezar": 2}
    # Se ordena por lo PUBLICADO: el real no sale de la casa.
    obras.sort(key=lambda o: (orden.get(o.estado_obra or "", 3), -(o.avance_publicado or 0)))

    return [
        ObraPublica(
            id=o.id, nombre=o.nombre, descripcion=o.descripcion,
            estado_obra=o.estado_obra, avance=o.avance_publicado, foto_url=o.foto_url,
            latitud=o.latitud, longitud=o.longitud,
            fecha_inicio=o.fecha_inicio, fecha_fin=o.fecha_fin,
            invertido=invertido.get(o.id) if o.mostrar_monto else None,
        )
        for o in obras
    ]


@router.get("/{proyecto_id}", response_model=ProyectoResponse)
async def get_proyecto(
    proyecto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    proyecto = (await db.execute(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    resp = ProyectoResponse.model_validate(proyecto)
    resp.resumen = await _resumen_proyecto(db, proyecto)
    return resp


@router.put("/{proyecto_id}", response_model=ProyectoResponse)
async def update_proyecto(
    proyecto_id: int,
    payload: ProyectoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    proyecto = (await db.execute(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(proyecto, k, v)
    await db.commit()
    await db.refresh(proyecto)
    resp = ProyectoResponse.model_validate(proyecto)
    resp.resumen = await _resumen_proyecto(db, proyecto)
    return resp


@router.delete("/{proyecto_id}")
async def delete_proyecto(
    proyecto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete (marca activo=false). Las imputaciones a gastos se preservan."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    proyecto = (await db.execute(
        select(Proyecto).where(Proyecto.id == proyecto_id, Proyecto.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    proyecto.activo = False
    await db.commit()
    return {"ok": True, "id": proyecto_id}
