"""API de Contactos del modulo Tesoreria.

Agenda de personas fisicas (empleados, concejales, profesionales,
proveedores, beneficiarios de prestamos) que se vinculan a gastos.

Solo el admin del municipio puede ver/modificar.

Endpoints:
  GET    /tesoreria/contactos                 listado paginado + filtros
  POST   /tesoreria/contactos                 crear
  GET    /tesoreria/contactos/{id}            detalle + gastos asociados
  PUT    /tesoreria/contactos/{id}            update
  DELETE /tesoreria/contactos/{id}            soft delete (activo=false)
  POST   /tesoreria/contactos/importar-excel  bulk import desde Excel matriz
  POST   /tesoreria/contactos/importar-kmz    bulk update lat/lon desde KMZ
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query, UploadFile, File, Response
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import Contacto, User, RolUsuario
from schemas.tesoreria import ContactoCreate, ContactoUpdate, ContactoResponse

router = APIRouter()


def _require_admin(user: User):
    # Admin del muni o supervisor del muni (no dependencia) pueden gestionar
    # contactos. Los supervisores de dependencia y vecinos no.
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar contactos")


def _build_filters_query(municipio_id, tipo, activo, search):
    """Construye la query con filtros (sin offset/limit/order_by).
    Reutilizable para list + count."""
    query = select(Contacto).where(Contacto.municipio_id == municipio_id)
    if tipo:
        query = query.where(Contacto.tipo == tipo)
    if activo is not None:
        query = query.where(Contacto.activo == activo)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.where(
            or_(
                Contacto.nombre.ilike(s),
                Contacto.apellido.ilike(s),
                Contacto.dni.ilike(s),
                Contacto.alias_pago.ilike(s),
            )
        )
    return query


@router.get("", response_model=List[ContactoResponse])
async def list_contactos(
    response: Response,
    request: Request,
    tipo: Optional[str] = None,
    activo: Optional[bool] = True,
    search: Optional[str] = Query(None, description="Busca en nombre/apellido/DNI/alias"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve lista paginada + header X-Total-Count con total que matchea
    los filtros (sin paginar). El frontend usa el header para calcular
    cantidad de paginas en la UI."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    base = _build_filters_query(municipio_id, tipo, activo, search)
    # Count: total que matchea sin paginar
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    # Items paginados
    items_q = base.order_by(Contacto.nombre.asc(), Contacto.apellido.asc()).offset(skip).limit(limit)
    result = await db.execute(items_q)
    return result.scalars().all()


@router.get("/count")
async def count_contactos(
    request: Request,
    tipo: Optional[str] = None,
    activo: Optional[bool] = True,
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Endpoint dedicado de count (sin traer items). Usar cuando solo
    se necesita el total para mostrar."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    base = _build_filters_query(municipio_id, tipo, activo, search)
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()
    return {"total": total}


@router.post("", response_model=ContactoResponse, status_code=201)
async def create_contacto(
    payload: ContactoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    contacto = Contacto(municipio_id=municipio_id, **payload.model_dump())
    db.add(contacto)
    await db.commit()
    await db.refresh(contacto)
    return contacto


@router.get("/{contacto_id}", response_model=ContactoResponse)
async def get_contacto(
    contacto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Contacto).where(
            Contacto.id == contacto_id,
            Contacto.municipio_id == municipio_id,
        )
    )
    contacto = result.scalar_one_or_none()
    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    return contacto


@router.put("/{contacto_id}", response_model=ContactoResponse)
async def update_contacto(
    contacto_id: int,
    payload: ContactoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Contacto).where(
            Contacto.id == contacto_id,
            Contacto.municipio_id == municipio_id,
        )
    )
    contacto = result.scalar_one_or_none()
    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(contacto, k, v)
    await db.commit()
    await db.refresh(contacto)
    return contacto


@router.delete("/{contacto_id}")
async def delete_contacto(
    contacto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete (marca activo=false). Los gastos historicos se preservan."""
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Contacto).where(
            Contacto.id == contacto_id,
            Contacto.municipio_id == municipio_id,
        )
    )
    contacto = result.scalar_one_or_none()
    if not contacto:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")

    contacto.activo = False
    await db.commit()
    return {"ok": True, "id": contacto_id}
