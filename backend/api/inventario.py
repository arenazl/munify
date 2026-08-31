"""Inventario municipal — categorías (template) + ítems (activos/consumibles).

Dos naturalezas con mecánicas opuestas:
  - ACTIVO: bien reutilizable con estado operativo; una OT lo toma y libera.
  - CONSUMIBLE: material con stock; una OT lo descuenta al completarse.

Multi-tenant estricto (todo filtra por municipio_id). Gestión reservada a
admin/supervisor. Opt-in por `municipio_modulos.modulo = 'inventario'`.
El cruce con OT (reservar/consumir/liberar) vive en `api/ordenes_trabajo.py`.
"""
from datetime import date, datetime, time as dtime
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
    InventarioDeposito, InventarioMovimiento,
    InventarioOrdenCompra, InventarioOrdenCompraLinea,
    NaturalezaInventario, EstadoActivo, User,
    TipoMovimientoInventario, EstadoOrdenCompra,
)
from services.inventario_movimientos import (
    registrar_movimiento, _nombres_depositos, TIPOS_MANUALES,
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
    # Donde queda guardado. Opcional: no se le inventa ubicacion a nada.
    deposito_id: Optional[int] = None
    # Consumibles
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad: Optional[str] = None
    # Activos
    identificador: Optional[str] = None
    estado_activo: Optional[EstadoActivo] = None
    # Se puede prestar al vecino (salon, cancha, camion de agua).
    reservable: Optional[bool] = None
    # Flota: un activo con `tipo_combustible` cargado ES un vehiculo del
    # municipio y aparece en Recursos -> Flota. No hay tabla de vehiculos.
    marca_modelo: Optional[str] = None
    anio: Optional[int] = None
    km_actual: Optional[int] = None
    tipo_combustible: Optional[str] = None
    vencimiento_vtv: Optional[date] = None
    vencimiento_seguro: Optional[date] = None
    km_proximo_service: Optional[int] = None

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
    deposito_id: Optional[int] = None
    stock_actual: Optional[float] = None
    stock_minimo: Optional[float] = None
    unidad: Optional[str] = None
    identificador: Optional[str] = None
    estado_activo: Optional[EstadoActivo] = None
    activo: Optional[bool] = None
    # Se puede prestar al vecino (salon, cancha, camion de agua).
    reservable: Optional[bool] = None
    # Flota: un activo con `tipo_combustible` cargado ES un vehiculo del
    # municipio y aparece en Recursos -> Flota. No hay tabla de vehiculos.
    marca_modelo: Optional[str] = None
    anio: Optional[int] = None
    km_actual: Optional[int] = None
    tipo_combustible: Optional[str] = None
    vencimiento_vtv: Optional[date] = None
    vencimiento_seguro: Optional[date] = None
    km_proximo_service: Optional[int] = None



class ItemResponse(BaseModel):
    id: int
    categoria_id: int
    categoria_nombre: Optional[str] = None
    deposito_id: Optional[int] = None
    deposito_nombre: Optional[str] = None
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
    # Se puede prestar al vecino (salon, cancha, camion de agua).
    reservable: Optional[bool] = None
    # Flota: un activo con `tipo_combustible` cargado ES un vehiculo del
    # municipio y aparece en Recursos -> Flota. No hay tabla de vehiculos.
    marca_modelo: Optional[str] = None
    anio: Optional[int] = None
    km_actual: Optional[int] = None
    tipo_combustible: Optional[str] = None
    vencimiento_vtv: Optional[date] = None
    vencimiento_seguro: Optional[date] = None
    km_proximo_service: Optional[int] = None
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
    if item.deposito:
        resp.deposito_nombre = item.deposito.nombre
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
            selectinload(InventarioItem.deposito),
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
            selectinload(InventarioItem.deposito),
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
        deposito_id=data.deposito_id,
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


# ==================== Depósitos ====================

class DepositoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    responsable: Optional[str] = None
    orden: int = 0

    @field_validator("nombre")
    @classmethod
    def _nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()


class DepositoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    responsable: Optional[str] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class DepositoResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    responsable: Optional[str] = None
    activo: bool
    orden: int
    items_count: int = 0


def _deposito_to_response(d: InventarioDeposito, n: int = 0) -> DepositoResponse:
    return DepositoResponse(
        id=d.id, nombre=d.nombre, descripcion=d.descripcion, direccion=d.direccion,
        responsable=d.responsable, activo=d.activo, orden=d.orden or 0, items_count=n,
    )


@router.get("/depositos", response_model=List[DepositoResponse])
async def listar_depositos(
    request: Request,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    q = select(InventarioDeposito).where(InventarioDeposito.municipio_id == municipio_id)
    if activo is not None:
        q = q.where(InventarioDeposito.activo == activo)
    deps = (await db.execute(q.order_by(InventarioDeposito.orden, InventarioDeposito.nombre))).scalars().all()
    counts = dict((await db.execute(
        select(InventarioItem.deposito_id, func.count(InventarioItem.id))
        .where(InventarioItem.municipio_id == municipio_id, InventarioItem.activo == True)  # noqa: E712
        .group_by(InventarioItem.deposito_id)
    )).all())
    return [_deposito_to_response(d, counts.get(d.id, 0)) for d in deps]


@router.post("/depositos", response_model=DepositoResponse)
async def crear_deposito(
    data: DepositoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    existe = (await db.execute(select(InventarioDeposito).where(
        InventarioDeposito.municipio_id == municipio_id,
        InventarioDeposito.nombre == data.nombre,
    ))).scalar_one_or_none()
    if existe:
        raise HTTPException(status_code=400, detail="Ya hay un depósito con ese nombre")
    dep = InventarioDeposito(municipio_id=municipio_id, **data.model_dump())
    db.add(dep)
    await db.commit()
    await db.refresh(dep)
    return _deposito_to_response(dep)


@router.put("/depositos/{dep_id}", response_model=DepositoResponse)
async def actualizar_deposito(
    dep_id: int,
    data: DepositoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    dep = (await db.execute(select(InventarioDeposito).where(
        InventarioDeposito.id == dep_id, InventarioDeposito.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(dep, k, v)
    await db.commit()
    await db.refresh(dep)
    return _deposito_to_response(dep)


@router.delete("/depositos/{dep_id}")
async def eliminar_deposito(
    dep_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Baja lógica. Un depósito con cosas adentro no se borra: dejaría los
    ítems sin ubicación y el historial apuntando a la nada."""
    municipio_id = get_effective_municipio_id(request, current_user)
    dep = (await db.execute(select(InventarioDeposito).where(
        InventarioDeposito.id == dep_id, InventarioDeposito.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")
    n = (await db.execute(select(func.count(InventarioItem.id)).where(
        InventarioItem.deposito_id == dep_id, InventarioItem.activo == True,  # noqa: E712
    ))).scalar() or 0
    if n:
        raise HTTPException(
            status_code=400,
            detail=f"El depósito tiene {n} ítem(s). Movelos a otro depósito antes de darlo de baja.",
        )
    dep.activo = False
    await db.commit()
    return {"ok": True}


# ==================== Movimientos de stock ====================

class MovimientoCreate(BaseModel):
    """Entrada, salida o ajuste cargados por una persona.

    Los tipos `*_ot` no se aceptan acá: los escribe el cierre de la orden de
    trabajo. Dejar que se carguen a mano rompería la cuenta contra la OT.
    """
    item_id: int
    tipo: TipoMovimientoInventario
    cantidad: float
    deposito_id: Optional[int] = None
    contraparte: Optional[str] = None
    motivo: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def _solo_manuales(cls, v: TipoMovimientoInventario) -> TipoMovimientoInventario:
        if v not in TIPOS_MANUALES:
            raise ValueError("Ese tipo de movimiento lo genera el sistema, no se carga a mano")
        return v

    @field_validator("cantidad")
    @classmethod
    def _cantidad_valida(cls, v: float) -> float:
        if v is None or v < 0:
            raise ValueError("La cantidad no puede ser negativa")
        return v


class MovimientoResponse(BaseModel):
    id: int
    item_id: int
    item_nombre: Optional[str] = None
    tipo: TipoMovimientoInventario
    cantidad: float
    stock_resultante: Optional[float] = None
    deposito_id: Optional[int] = None
    deposito_nombre: Optional[str] = None
    contraparte: Optional[str] = None
    motivo: Optional[str] = None
    orden_trabajo_id: Optional[int] = None
    orden_compra_id: Optional[int] = None
    usuario_nombre: Optional[str] = None
    fecha: Optional[datetime] = None


def _movimiento_to_response(m: InventarioMovimiento, dep_nombre: Optional[str] = None) -> MovimientoResponse:
    return MovimientoResponse(
        id=m.id, item_id=m.item_id, item_nombre=m.item_nombre, tipo=m.tipo,
        cantidad=m.cantidad or 0, stock_resultante=m.stock_resultante,
        deposito_id=m.deposito_id, deposito_nombre=dep_nombre,
        contraparte=m.contraparte, motivo=m.motivo,
        orden_trabajo_id=m.orden_trabajo_id, orden_compra_id=m.orden_compra_id,
        usuario_nombre=m.usuario_nombre, fecha=m.fecha,
    )


@router.get("/movimientos", response_model=List[MovimientoResponse])
async def listar_movimientos(
    request: Request,
    item_id: Optional[int] = None,
    tipo: Optional[TipoMovimientoInventario] = None,
    deposito_id: Optional[int] = None,
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    limit: int = Query(200, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    """El libro del depósito. Sin filtros, lo último que pasó."""
    municipio_id = get_effective_municipio_id(request, current_user)
    q = select(InventarioMovimiento).where(InventarioMovimiento.municipio_id == municipio_id)
    if item_id:
        q = q.where(InventarioMovimiento.item_id == item_id)
    if tipo:
        q = q.where(InventarioMovimiento.tipo == tipo)
    if deposito_id:
        q = q.where(InventarioMovimiento.deposito_id == deposito_id)
    if desde:
        q = q.where(InventarioMovimiento.fecha >= datetime.combine(desde, dtime.min))
    if hasta:
        q = q.where(InventarioMovimiento.fecha <= datetime.combine(hasta, dtime.max))
    movs = (await db.execute(
        q.order_by(InventarioMovimiento.fecha.desc(), InventarioMovimiento.id.desc()).limit(limit)
    )).scalars().all()
    nombres = await _nombres_depositos(db, municipio_id)
    return [_movimiento_to_response(m, nombres.get(m.deposito_id)) for m in movs]


@router.post("/movimientos", response_model=MovimientoResponse)
async def crear_movimiento(
    data: MovimientoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Carga una entrada, una salida o un ajuste, y mueve el stock.

    El AJUSTE fija el stock en `cantidad` (conteo físico, rotura, robo): es la
    única forma honesta de corregir sin inventar una entrada o una salida que
    nunca ocurrió.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    item = (await db.execute(select(InventarioItem).where(
        InventarioItem.id == data.item_id, InventarioItem.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    if item.naturaleza != NaturalezaInventario.CONSUMIBLE:
        raise HTTPException(
            status_code=400,
            detail="Los activos no tienen stock: se toman y se liberan desde la orden de trabajo",
        )
    if data.deposito_id is not None:
        dep = (await db.execute(select(InventarioDeposito).where(
            InventarioDeposito.id == data.deposito_id,
            InventarioDeposito.municipio_id == municipio_id,
        ))).scalar_one_or_none()
        if not dep:
            raise HTTPException(status_code=404, detail="Depósito no encontrado")

    mov = await registrar_movimiento(
        db, item, data.tipo, data.cantidad,
        deposito_id=data.deposito_id or item.deposito_id,
        contraparte=data.contraparte, motivo=data.motivo,
        usuario=current_user,
    )
    await db.commit()
    await db.refresh(mov)
    nombres = await _nombres_depositos(db, municipio_id)
    return _movimiento_to_response(mov, nombres.get(mov.deposito_id))


@router.get("/items/{item_id}/movimientos", response_model=List[MovimientoResponse])
async def historial_item(
    item_id: int,
    request: Request,
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    """La historia de un artículo: qué entró, qué salió y quién lo tomó."""
    municipio_id = get_effective_municipio_id(request, current_user)
    item = (await db.execute(select(InventarioItem).where(
        InventarioItem.id == item_id, InventarioItem.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    movs = (await db.execute(
        select(InventarioMovimiento)
        .where(InventarioMovimiento.item_id == item_id)
        .order_by(InventarioMovimiento.fecha.desc(), InventarioMovimiento.id.desc())
        .limit(limit)
    )).scalars().all()
    nombres = await _nombres_depositos(db, municipio_id)
    return [_movimiento_to_response(m, nombres.get(m.deposito_id)) for m in movs]


# ==================== Órdenes de compra ====================

class OCLineaIn(BaseModel):
    item_id: int
    cantidad: float
    precio_unitario: Optional[float] = None


class OCLineaResponse(BaseModel):
    id: int
    item_id: int
    item_nombre: Optional[str] = None
    cantidad: float
    cantidad_recibida: float
    pendiente: float
    precio_unitario: Optional[float] = None


class OrdenCompraCreate(BaseModel):
    proveedor: Optional[str] = None
    deposito_id: Optional[int] = None
    fecha: Optional[date] = None
    fecha_esperada: Optional[date] = None
    notas: Optional[str] = None
    lineas: List[OCLineaIn] = []


class OrdenCompraUpdate(BaseModel):
    proveedor: Optional[str] = None
    deposito_id: Optional[int] = None
    fecha: Optional[date] = None
    fecha_esperada: Optional[date] = None
    notas: Optional[str] = None
    estado: Optional[EstadoOrdenCompra] = None
    lineas: Optional[List[OCLineaIn]] = None


class OrdenCompraResponse(BaseModel):
    id: int
    numero: str
    proveedor: Optional[str] = None
    estado: EstadoOrdenCompra
    deposito_id: Optional[int] = None
    deposito_nombre: Optional[str] = None
    fecha: Optional[date] = None
    fecha_esperada: Optional[date] = None
    total_estimado: Optional[float] = None
    notas: Optional[str] = None
    lineas: List[OCLineaResponse] = []


class RecepcionLinea(BaseModel):
    linea_id: int
    cantidad: float


class RecepcionIn(BaseModel):
    """Qué llegó. Vacío = llegó todo lo que faltaba."""
    lineas: Optional[List[RecepcionLinea]] = None
    deposito_id: Optional[int] = None
    motivo: Optional[str] = None


def _oc_to_response(oc: InventarioOrdenCompra, dep_nombre: Optional[str] = None) -> OrdenCompraResponse:
    return OrdenCompraResponse(
        id=oc.id, numero=oc.numero, proveedor=oc.proveedor, estado=oc.estado,
        deposito_id=oc.deposito_id, deposito_nombre=dep_nombre, fecha=oc.fecha,
        fecha_esperada=oc.fecha_esperada, total_estimado=oc.total_estimado, notas=oc.notas,
        lineas=[OCLineaResponse(
            id=l.id, item_id=l.item_id, item_nombre=l.item_nombre,
            cantidad=l.cantidad or 0, cantidad_recibida=l.cantidad_recibida or 0,
            pendiente=l.pendiente, precio_unitario=l.precio_unitario,
        ) for l in (oc.lineas or [])],
    )


async def _proximo_numero_oc(db: AsyncSession, municipio_id: int) -> str:
    """OC-YYYY-NNNN correlativo por municipio y año, igual que la OT."""
    anio = datetime.now().year
    pref = f"OC-{anio}-"
    ultimo = (await db.execute(
        select(InventarioOrdenCompra.numero)
        .where(
            InventarioOrdenCompra.municipio_id == municipio_id,
            InventarioOrdenCompra.numero.like(f"{pref}%"),
        )
        .order_by(InventarioOrdenCompra.id.desc()).limit(1)
    )).scalar_one_or_none()
    n = int(ultimo.split("-")[-1]) + 1 if ultimo else 1
    return f"{pref}{n:04d}"


async def _sincronizar_lineas(db: AsyncSession, oc: InventarioOrdenCompra,
                              lineas: List[OCLineaIn], municipio_id: int) -> None:
    """Reescribe los renglones, conservando lo YA RECIBIDO de los que siguen.

    Sin eso, editar una orden a medio recibir borraría el historial de lo que
    llegó y el stock quedaría contado dos veces en la próxima recepción.
    """
    previas = (await db.execute(select(InventarioOrdenCompraLinea).where(
        InventarioOrdenCompraLinea.orden_compra_id == oc.id
    ))).scalars().all()
    recibido = {l.item_id: (l.cantidad_recibida or 0) for l in previas}
    ids = [l.item_id for l in lineas]
    items = {}
    if ids:
        items = {i.id: i for i in (await db.execute(select(InventarioItem).where(
            InventarioItem.id.in_(ids), InventarioItem.municipio_id == municipio_id,
        ))).scalars().all()}
    # Se reescriben por sentencia y no tocando `oc.lineas`: la relacion de un
    # objeto ya persistido dispara lazy load y en async eso explota.
    for vieja in previas:
        await db.delete(vieja)
    total = 0.0
    for l in lineas:
        item = items.get(l.item_id)
        if not item:
            raise HTTPException(status_code=400, detail=f"El ítem {l.item_id} no es de este municipio")
        db.add(InventarioOrdenCompraLinea(
            orden_compra_id=oc.id, item_id=l.item_id, item_nombre=item.nombre,
            cantidad=l.cantidad, cantidad_recibida=recibido.get(l.item_id, 0),
            precio_unitario=l.precio_unitario,
        ))
        total += (l.cantidad or 0) * (l.precio_unitario or 0)
    oc.total_estimado = total or None


@router.get("/ordenes-compra", response_model=List[OrdenCompraResponse])
async def listar_ordenes_compra(
    request: Request,
    estado: Optional[EstadoOrdenCompra] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    q = select(InventarioOrdenCompra).where(InventarioOrdenCompra.municipio_id == municipio_id)
    if estado:
        q = q.where(InventarioOrdenCompra.estado == estado)
    ocs = (await db.execute(
        q.options(selectinload(InventarioOrdenCompra.lineas))
        .order_by(InventarioOrdenCompra.id.desc())
    )).scalars().all()
    nombres = await _nombres_depositos(db, municipio_id)
    return [_oc_to_response(oc, nombres.get(oc.deposito_id)) for oc in ocs]


@router.post("/ordenes-compra", response_model=OrdenCompraResponse)
async def crear_orden_compra(
    data: OrdenCompraCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    oc = InventarioOrdenCompra(
        municipio_id=municipio_id,
        numero=await _proximo_numero_oc(db, municipio_id),
        proveedor=data.proveedor, deposito_id=data.deposito_id,
        fecha=data.fecha or date.today(), fecha_esperada=data.fecha_esperada,
        notas=data.notas, estado=EstadoOrdenCompra.BORRADOR,
    )
    db.add(oc)
    await db.flush()
    await _sincronizar_lineas(db, oc, data.lineas, municipio_id)
    await db.commit()
    oc = (await db.execute(
        select(InventarioOrdenCompra).options(selectinload(InventarioOrdenCompra.lineas))
        .where(InventarioOrdenCompra.id == oc.id)
    )).scalar_one()
    nombres = await _nombres_depositos(db, municipio_id)
    return _oc_to_response(oc, nombres.get(oc.deposito_id))


@router.put("/ordenes-compra/{oc_id}", response_model=OrdenCompraResponse)
async def actualizar_orden_compra(
    oc_id: int,
    data: OrdenCompraUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    oc = (await db.execute(
        select(InventarioOrdenCompra).options(selectinload(InventarioOrdenCompra.lineas))
        .where(InventarioOrdenCompra.id == oc_id, InventarioOrdenCompra.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not oc:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    if oc.estado in (EstadoOrdenCompra.RECIBIDA, EstadoOrdenCompra.CANCELADA):
        raise HTTPException(status_code=400, detail="Una orden cerrada no se edita")
    campos = data.model_dump(exclude_unset=True, exclude={"lineas"})
    for k, v in campos.items():
        setattr(oc, k, v)
    if data.lineas is not None:
        await _sincronizar_lineas(db, oc, data.lineas, municipio_id)
    await db.commit()
    oc = (await db.execute(
        select(InventarioOrdenCompra).options(selectinload(InventarioOrdenCompra.lineas))
        .where(InventarioOrdenCompra.id == oc.id)
    )).scalar_one()
    nombres = await _nombres_depositos(db, municipio_id)
    return _oc_to_response(oc, nombres.get(oc.deposito_id))


@router.post("/ordenes-compra/{oc_id}/recibir", response_model=OrdenCompraResponse)
async def recibir_orden_compra(
    oc_id: int,
    data: RecepcionIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Recibe la mercadería y escribe las ENTRADAS de stock.

    Sin `lineas`, entra todo lo que faltaba. Con `lineas`, sólo lo que llegó:
    la orden queda `recibida_parcial` y el resto sigue esperando.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    oc = (await db.execute(
        select(InventarioOrdenCompra).options(selectinload(InventarioOrdenCompra.lineas))
        .where(InventarioOrdenCompra.id == oc_id, InventarioOrdenCompra.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not oc:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    if oc.estado in (EstadoOrdenCompra.RECIBIDA, EstadoOrdenCompra.CANCELADA):
        raise HTTPException(status_code=400, detail="Esa orden ya está cerrada")

    pedido = {l.linea_id: l.cantidad for l in (data.lineas or [])}
    items = {i.id: i for i in (await db.execute(select(InventarioItem).where(
        InventarioItem.id.in_([l.item_id for l in oc.lineas] or [0]),
        InventarioItem.municipio_id == municipio_id,
    ))).scalars().all()}

    hubo = False
    for linea in oc.lineas:
        cant = pedido.get(linea.id) if data.lineas is not None else linea.pendiente
        if not cant or cant <= 0:
            continue
        cant = min(cant, linea.pendiente)   # nunca recibir de más
        if cant <= 0:
            continue
        item = items.get(linea.item_id)
        if item and item.naturaleza == NaturalezaInventario.CONSUMIBLE:
            await registrar_movimiento(
                db, item, TipoMovimientoInventario.ENTRADA, cant,
                deposito_id=oc.deposito_id or item.deposito_id,
                contraparte=oc.proveedor, motivo=data.motivo or f"Recepción {oc.numero}",
                usuario=current_user, orden_compra_id=oc.id,
            )
        linea.cantidad_recibida = (linea.cantidad_recibida or 0) + cant
        hubo = True

    if not hubo:
        raise HTTPException(status_code=400, detail="No hay nada pendiente de recibir")

    completa = all(l.pendiente <= 0 for l in oc.lineas)
    oc.estado = EstadoOrdenCompra.RECIBIDA if completa else EstadoOrdenCompra.RECIBIDA_PARCIAL
    await db.commit()
    oc = (await db.execute(
        select(InventarioOrdenCompra).options(selectinload(InventarioOrdenCompra.lineas))
        .where(InventarioOrdenCompra.id == oc.id)
    )).scalar_one()
    nombres = await _nombres_depositos(db, municipio_id)
    return _oc_to_response(oc, nombres.get(oc.deposito_id))


@router.delete("/ordenes-compra/{oc_id}")
async def cancelar_orden_compra(
    oc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Cancela la orden. Lo ya recibido NO se revierte: entró de verdad, y
    deshacerlo por acá dejaría el stock mintiendo. Para sacarlo, un ajuste."""
    municipio_id = get_effective_municipio_id(request, current_user)
    oc = (await db.execute(select(InventarioOrdenCompra).where(
        InventarioOrdenCompra.id == oc_id, InventarioOrdenCompra.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not oc:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    oc.estado = EstadoOrdenCompra.CANCELADA
    await db.commit()
    return {"ok": True}
