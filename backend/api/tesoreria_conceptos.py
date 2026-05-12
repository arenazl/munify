"""API ABM de tipos de concepto + conceptos del modulo Tesoreria.

Endpoints:
  GET    /tesoreria/tipos-concepto                listado + cantidad_conceptos
  POST   /tesoreria/tipos-concepto                crear
  PUT    /tesoreria/tipos-concepto/{id}           update
  DELETE /tesoreria/tipos-concepto/{id}           soft delete

  GET    /tesoreria/conceptos-abm                 listado conceptos + tipo
  POST   /tesoreria/conceptos-abm                 crear
  PUT    /tesoreria/conceptos-abm/{id}            update (puede mover de tipo)
  DELETE /tesoreria/conceptos-abm/{id}            soft delete

Notas:
- Multi-tenant: filtra por current_user.municipio_id.
- Solo admin / supervisor del muni gestiona.
- El endpoint legacy /tesoreria/conceptos (catalogo JSON) sigue
  funcionando como fallback, pero ahora prioriza la DB si el muni tiene
  tipos cargados.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    TesoreriaTipoConcepto, TesoreriaConcepto, User, RolUsuario,
)
from schemas.tesoreria import (
    TipoConceptoCreate, TipoConceptoUpdate, TipoConceptoResponse,
    ConceptoCreate, ConceptoUpdate, ConceptoResponse,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar el catalogo de conceptos")


# ============================================================
# Tipos de concepto
# ============================================================

@router.get("/tipos-concepto", response_model=List[TipoConceptoResponse])
async def list_tipos(
    request: Request,
    activo: Optional[bool] = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    q = select(TesoreriaTipoConcepto).where(TesoreriaTipoConcepto.municipio_id == municipio_id)
    if activo is not None:
        q = q.where(TesoreriaTipoConcepto.activo == activo)
    q = q.order_by(TesoreriaTipoConcepto.orden, TesoreriaTipoConcepto.nombre)
    tipos = (await db.execute(q)).scalars().all()

    # Contar conceptos por tipo
    if tipos:
        ids = [t.id for t in tipos]
        rows = (await db.execute(
            select(TesoreriaConcepto.tipo_concepto_id, func.count(TesoreriaConcepto.id))
            .where(TesoreriaConcepto.tipo_concepto_id.in_(ids), TesoreriaConcepto.activo == True)  # noqa: E712
            .group_by(TesoreriaConcepto.tipo_concepto_id)
        )).all()
        counts = {r[0]: r[1] for r in rows}
    else:
        counts = {}

    out = []
    for t in tipos:
        resp = TipoConceptoResponse.model_validate(t)
        resp.cantidad_conceptos = counts.get(t.id, 0)
        out.append(resp)
    return out


@router.post("/tipos-concepto", response_model=TipoConceptoResponse, status_code=201)
async def create_tipo(
    payload: TipoConceptoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    tipo = TesoreriaTipoConcepto(municipio_id=municipio_id, **payload.model_dump())
    db.add(tipo)
    await db.commit()
    await db.refresh(tipo)
    resp = TipoConceptoResponse.model_validate(tipo)
    resp.cantidad_conceptos = 0
    return resp


@router.put("/tipos-concepto/{tipo_id}", response_model=TipoConceptoResponse)
async def update_tipo(
    tipo_id: int,
    payload: TipoConceptoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    tipo = (await db.execute(
        select(TesoreriaTipoConcepto).where(
            TesoreriaTipoConcepto.id == tipo_id,
            TesoreriaTipoConcepto.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tipo, k, v)
    await db.commit()
    await db.refresh(tipo)
    return TipoConceptoResponse.model_validate(tipo)


@router.delete("/tipos-concepto/{tipo_id}")
async def delete_tipo(
    tipo_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete del tipo. Sus conceptos quedan huerfanos (activo=true).
    Se recomienda primero reasignar los conceptos a otro tipo."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    tipo = (await db.execute(
        select(TesoreriaTipoConcepto).where(
            TesoreriaTipoConcepto.id == tipo_id,
            TesoreriaTipoConcepto.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo no encontrado")

    # Bloquear si tiene conceptos activos (forzar a moverlos primero)
    count = (await db.execute(
        select(func.count(TesoreriaConcepto.id)).where(
            TesoreriaConcepto.tipo_concepto_id == tipo_id,
            TesoreriaConcepto.activo == True,  # noqa: E712
        )
    )).scalar() or 0
    if count > 0:
        raise HTTPException(
            status_code=422,
            detail=f"El tipo tiene {count} concepto(s) asociado(s). Movelos o desactivalos primero.",
        )

    tipo.activo = False
    await db.commit()
    return {"ok": True, "id": tipo_id}


# ============================================================
# Conceptos
# ============================================================

@router.get("/conceptos-abm", response_model=List[ConceptoResponse])
async def list_conceptos(
    request: Request,
    tipo_concepto_id: Optional[int] = None,
    activo: Optional[bool] = True,
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    q = (
        select(TesoreriaConcepto)
        .options(selectinload(TesoreriaConcepto.tipo))
        .where(TesoreriaConcepto.municipio_id == municipio_id)
    )
    if tipo_concepto_id is not None:
        q = q.where(TesoreriaConcepto.tipo_concepto_id == tipo_concepto_id)
    if activo is not None:
        q = q.where(TesoreriaConcepto.activo == activo)
    if search and search.strip():
        s = f"%{search.strip()}%"
        q = q.where(or_(TesoreriaConcepto.nombre.ilike(s), TesoreriaConcepto.descripcion.ilike(s)))
    q = q.order_by(TesoreriaConcepto.orden, TesoreriaConcepto.nombre)
    conceptos = (await db.execute(q)).scalars().all()

    out = []
    for c in conceptos:
        resp = ConceptoResponse.model_validate(c)
        resp.tipo_concepto_nombre = c.tipo.nombre if c.tipo else None
        resp.tipo_concepto_color = c.tipo.color if c.tipo else None
        out.append(resp)
    return out


@router.post("/conceptos-abm", response_model=ConceptoResponse, status_code=201)
async def create_concepto(
    payload: ConceptoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    # Validar que el tipo pertenezca al mismo muni
    tipo = (await db.execute(
        select(TesoreriaTipoConcepto).where(
            TesoreriaTipoConcepto.id == payload.tipo_concepto_id,
            TesoreriaTipoConcepto.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not tipo:
        raise HTTPException(status_code=422, detail="Tipo de concepto invalido para este municipio")

    concepto = TesoreriaConcepto(municipio_id=municipio_id, **payload.model_dump())
    db.add(concepto)
    await db.commit()
    await db.refresh(concepto)
    resp = ConceptoResponse.model_validate(concepto)
    resp.tipo_concepto_nombre = tipo.nombre
    resp.tipo_concepto_color = tipo.color
    return resp


@router.put("/conceptos-abm/{concepto_id}", response_model=ConceptoResponse)
async def update_concepto(
    concepto_id: int,
    payload: ConceptoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    concepto = (await db.execute(
        select(TesoreriaConcepto)
        .options(selectinload(TesoreriaConcepto.tipo))
        .where(TesoreriaConcepto.id == concepto_id, TesoreriaConcepto.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")

    data = payload.model_dump(exclude_unset=True)
    # Si reasigna tipo, validar que pertenezca al mismo muni
    if 'tipo_concepto_id' in data and data['tipo_concepto_id'] != concepto.tipo_concepto_id:
        nuevo_tipo = (await db.execute(
            select(TesoreriaTipoConcepto).where(
                TesoreriaTipoConcepto.id == data['tipo_concepto_id'],
                TesoreriaTipoConcepto.municipio_id == municipio_id,
            )
        )).scalar_one_or_none()
        if not nuevo_tipo:
            raise HTTPException(status_code=422, detail="Tipo de concepto invalido")
    for k, v in data.items():
        setattr(concepto, k, v)
    await db.commit()
    await db.refresh(concepto, attribute_names=["tipo"])
    resp = ConceptoResponse.model_validate(concepto)
    resp.tipo_concepto_nombre = concepto.tipo.nombre if concepto.tipo else None
    resp.tipo_concepto_color = concepto.tipo.color if concepto.tipo else None
    return resp


@router.delete("/conceptos-abm/{concepto_id}")
async def delete_concepto(
    concepto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    concepto = (await db.execute(
        select(TesoreriaConcepto).where(
            TesoreriaConcepto.id == concepto_id,
            TesoreriaConcepto.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")
    concepto.activo = False
    await db.commit()
    return {"ok": True, "id": concepto_id}
