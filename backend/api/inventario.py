"""Inventario municipal — categorías (template) + ítems (activos/consumibles).

Dos naturalezas con mecánicas opuestas:
  - ACTIVO: bien reutilizable con estado operativo; una OT lo toma y libera.
  - CONSUMIBLE: material con stock; una OT lo descuenta al completarse.

Multi-tenant estricto (todo filtra por municipio_id). Gestión reservada a
admin/supervisor. Opt-in por `municipio_modulos.modulo = 'inventario'`.
El cruce con OT (reservar/consumir/liberar) vive en `api/ordenes_trabajo.py`.
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import require_roles
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from models import (
    InventarioCategoria, InventarioItem,
    NaturalezaInventario, EstadoActivo, User,
)

router = APIRouter()


# ============================== Schemas ==============================

class CategoriaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    naturaleza: NaturalezaInventario = NaturalezaInventario.CONSUMIBLE
    orden: int = 0

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    naturaleza: Optional[NaturalezaInventario] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class CategoriaResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    color: Optional[str] = None
    naturaleza: NaturalezaInventario
    orden: int
    activo: bool
    items_count: int = 0

    class Config:
        from_attributes = True


class ItemCreate(BaseModel):
    categoria_id: int
    nombre: str
    descripcion: Optional[str] = None
    # Consumibles
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad: Optional[str] = None
    # Activos
    identificador: Optional[str] = None
    estado_activo: Optional[EstadoActivo] = None

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class ItemUpdate(BaseModel):
    categoria_id: Optional[int] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad: Optional[str] = None
    identificador: Optional[str] = None
    estado_activo: Optional[EstadoActivo] = None
    activo: Optional[bool] = None


class ItemResponse(BaseModel):
    id: int
    categoria_id: int
    categoria_nombre: Optional[str] = None
    categoria_icono: Optional[str] = None
    categoria_color: Optional[str] = None
    nombre: str
    descripcion: Optional[str] = None
    naturaleza: NaturalezaInventario
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad: Optional[str] = None
    identificador: Optional[str] = None
    estado_activo: Optional[EstadoActivo] = None
    ocupado_por_ot_id: Optional[int] = None
    ocupado_por_ot_numero: Optional[str] = None
    activo: bool
    bajo_stock: bool = False

    class Config:
        from_attributes = True


# ============================== Helpers ==============================

def _categoria_to_response(cat: InventarioCategoria, items_count: int = 0) -> CategoriaResponse:
    resp = CategoriaResponse.model_validate(cat)
    resp.items_count = items_count
    return resp


def _item_to_response(item: InventarioItem) -> ItemResponse:
    resp = ItemResponse.model_validate(item)
    if item.categoria:
        resp.categoria_nombre = item.categoria.nombre
        resp.categoria_icono = item.categoria.icono
        resp.categoria_color = item.categoria.color
    if item.ocupado_por_ot:
        resp.ocupado_por_ot_numero = item.ocupado_por_ot.numero
    if (item.naturaleza == NaturalezaInventario.CONSUMIBLE
            and item.stock_minimo is not None and item.stock_actual is not None):
        resp.bajo_stock = item.stock_actual <= item.stock_minimo
    return resp


async def _get_categoria(db: AsyncSession, cat_id: int, municipio_id: int) -> InventarioCategoria:
    cat = (await db.execute(
        select(InventarioCategoria).where(
            InventarioCategoria.id == cat_id,
            InventarioCategoria.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return cat


async def _get_item(db: AsyncSession, item_id: int, municipio_id: int) -> InventarioItem:
    item = (await db.execute(
        select(InventarioItem)
        .options(
            selectinload(InventarioItem.categoria),
            selectinload(InventarioItem.ocupado_por_ot),
        )
        .where(
            InventarioItem.id == item_id,
            InventarioItem.municipio_id == municipio_id,
        )
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    return item


# ============================== Categorías ==============================

@router.get("/categorias", response_model=List[CategoriaResponse])
async def listar_categorias(
    request: Request,
    naturaleza: Optional[NaturalezaInventario] = None,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(InventarioCategoria).where(InventarioCategoria.municipio_id == municipio_id)
    if naturaleza:
        query = query.where(InventarioCategoria.naturaleza == naturaleza)
    if activo is not None:
        query = query.where(InventarioCategoria.activo == activo)
    query = query.order_by(InventarioCategoria.orden, InventarioCategoria.nombre)
    cats = (await db.execute(query)).scalars().all()

    # Conteo de ítems activos por categoría (una query agregada)
    counts = dict((await db.execute(
        select(InventarioItem.categoria_id, func.count(InventarioItem.id))
        .where(
            InventarioItem.municipio_id == municipio_id,
            InventarioItem.activo == True,  # noqa: E712
        )
        .group_by(InventarioItem.categoria_id)
    )).all())
    return [_categoria_to_response(c, counts.get(c.id, 0)) for c in cats]


@router.post("/categorias", response_model=CategoriaResponse)
async def crear_categoria(
    data: CategoriaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    dup = (await db.execute(select(InventarioCategoria.id).where(
        InventarioCategoria.municipio_id == municipio_id,
        InventarioCategoria.nombre == data.nombre,
    ))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    cat = InventarioCategoria(
        municipio_id=municipio_id,
        nombre=data.nombre,
        descripcion=data.descripcion,
        icono=data.icono,
        color=data.color,
        naturaleza=data.naturaleza,
        orden=data.orden,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return _categoria_to_response(cat, 0)


@router.put("/categorias/{cat_id}", response_model=CategoriaResponse)
async def actualizar_categoria(
    cat_id: int,
    data: CategoriaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    cat = await _get_categoria(db, cat_id, municipio_id)

    # Cambiar la naturaleza de una categoría con ítems rompería su mecánica.
    if data.naturaleza is not None and data.naturaleza != cat.naturaleza:
        tiene_items = (await db.execute(select(InventarioItem.id).where(
            InventarioItem.categoria_id == cat_id
        ).limit(1))).scalar_one_or_none()
        if tiene_items:
            raise HTTPException(
                status_code=400,
                detail="No se puede cambiar la naturaleza: la categoría ya tiene ítems cargados",
            )

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    await db.commit()
    await db.refresh(cat)
    count = (await db.execute(select(func.count(InventarioItem.id)).where(
        InventarioItem.categoria_id == cat_id, InventarioItem.activo == True,  # noqa: E712
    ))).scalar_one()
    return _categoria_to_response(cat, count)


@router.delete("/categorias/{cat_id}")
async def eliminar_categoria(
    cat_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    cat = await _get_categoria(db, cat_id, municipio_id)
    tiene_items = (await db.execute(select(InventarioItem.id).where(
        InventarioItem.categoria_id == cat_id
    ).limit(1))).scalar_one_or_none()
    if tiene_items:
        raise HTTPException(
            status_code=400,
            detail="La categoría tiene ítems cargados. Movelos o eliminalos antes.",
        )
    await db.delete(cat)
    await db.commit()
    return {"ok": True}


# ============================== Ítems ==============================

@router.get("/items", response_model=List[ItemResponse])
async def listar_items(
    request: Request,
    categoria_id: Optional[int] = None,
    naturaleza: Optional[NaturalezaInventario] = None,
    estado_activo: Optional[EstadoActivo] = None,
    solo_disponibles: bool = Query(False, description="Activos disponibles + consumibles con stock > 0"),
    incluir_inactivos: bool = Query(False),
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = (
        select(InventarioItem)
        .options(
            selectinload(InventarioItem.categoria),
            selectinload(InventarioItem.ocupado_por_ot),
        )
        .where(InventarioItem.municipio_id == municipio_id)
    )
    if not incluir_inactivos:
        query = query.where(InventarioItem.activo == True)  # noqa: E712
    if categoria_id:
        query = query.where(InventarioItem.categoria_id == categoria_id)
    if naturaleza:
        query = query.where(InventarioItem.naturaleza == naturaleza)
    if estado_activo:
        query = query.where(InventarioItem.estado_activo == estado_activo)
    if solo_disponibles:
        query = query.where(or_(
            (InventarioItem.naturaleza == NaturalezaInventario.ACTIVO)
            & (InventarioItem.estado_activo == EstadoActivo.DISPONIBLE),
            (InventarioItem.naturaleza == NaturalezaInventario.CONSUMIBLE)
            & (InventarioItem.stock_actual > 0),
        ))
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.where(or_(
            InventarioItem.nombre.ilike(s),
            InventarioItem.identificador.ilike(s),
        ))
    query = query.order_by(InventarioItem.nombre).offset(skip).limit(limit)
    items = (await db.execute(query)).scalars().all()
    return [_item_to_response(it) for it in items]


@router.get("/items/{item_id}", response_model=ItemResponse)
async def obtener_item(
    item_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    item = await _get_item(db, item_id, municipio_id)
    return _item_to_response(item)


@router.post("/items", response_model=ItemResponse)
async def crear_item(
    data: ItemCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    cat = await _get_categoria(db, data.categoria_id, municipio_id)

    item = InventarioItem(
        municipio_id=municipio_id,
        categoria_id=cat.id,
        nombre=data.nombre,
        descripcion=data.descripcion,
        naturaleza=cat.naturaleza,  # la naturaleza la manda la categoría
    )
    if cat.naturaleza == NaturalezaInventario.CONSUMIBLE:
        item.stock_actual = data.stock_actual if data.stock_actual is not None else 0
        item.stock_minimo = data.stock_minimo
        item.unidad = data.unidad
    else:  # ACTIVO
        item.identificador = data.identificador
        item.estado_activo = data.estado_activo or EstadoActivo.DISPONIBLE

    db.add(item)
    await db.commit()
    item = await _get_item(db, item.id, municipio_id)
    return _item_to_response(item)


@router.put("/items/{item_id}", response_model=ItemResponse)
async def actualizar_item(
    item_id: int,
    data: ItemUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    item = await _get_item(db, item_id, municipio_id)

    # Si se cambia de categoría, debe ser de la misma naturaleza.
    if data.categoria_id is not None and data.categoria_id != item.categoria_id:
        nueva = await _get_categoria(db, data.categoria_id, municipio_id)
        if nueva.naturaleza != item.naturaleza:
            raise HTTPException(
                status_code=400,
                detail="La nueva categoría es de otra naturaleza (activo/consumible)",
            )
        item.categoria_id = nueva.id

    campos = data.model_dump(exclude_unset=True, exclude={"categoria_id"})
    for k, v in campos.items():
        setattr(item, k, v)

    await db.commit()
    item = await _get_item(db, item_id, municipio_id)
    return _item_to_response(item)


@router.delete("/items/{item_id}")
async def eliminar_item(
    item_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Soft delete: preserva el histórico de recursos de OT. Un activo
    tomado por una OT vigente no se puede eliminar (liberalo primero)."""
    municipio_id = get_effective_municipio_id(request, current_user)
    item = await _get_item(db, item_id, municipio_id)
    if item.naturaleza == NaturalezaInventario.ACTIVO and item.estado_activo == EstadoActivo.EN_USO:
        raise HTTPException(
            status_code=400,
            detail="El activo está tomado por una OT. Liberalo antes de eliminarlo.",
        )
    item.activo = False
    await db.commit()
    return {"ok": True}
