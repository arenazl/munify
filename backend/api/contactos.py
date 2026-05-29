"""API de Contactos del modulo Tesoreria.

Agenda de personas fisicas (empleados, concejales, profesionales,
proveedores, beneficiarios de prestamos) que se vinculan a gastos.

Solo el admin del municipio puede ver/modificar.

Endpoints:
  GET    /tesoreria/contactos                 listado paginado + filtros
  POST   /tesoreria/contactos                 crear
  GET    /tesoreria/contactos/duplicados      detecta grupos de duplicados
  POST   /tesoreria/contactos/merge           fusiona N contactos en 1
  GET    /tesoreria/contactos/{id}            detalle + gastos asociados
  PUT    /tesoreria/contactos/{id}            update
  DELETE /tesoreria/contactos/{id}            soft delete (activo=false)
  POST   /tesoreria/contactos/importar-excel  bulk import desde Excel matriz
  POST   /tesoreria/contactos/importar-kmz    bulk update lat/lon desde KMZ
"""
import unicodedata
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query, UploadFile, File, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, or_, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import Contacto, Gasto, TesoreriaPagoProgramado, User, RolUsuario
from models.contacto import TipoContacto
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


# ============================================================
# Detección y merge de contactos duplicados
# ============================================================
#
# Bartolo carga el padrón de contactos desde Excel y a veces queda el mismo
# tipo en >1 fila (Juan González / Juan Gonzalez / Juan Gonzales). El
# endpoint /duplicados detecta esos grupos por nombre normalizado + fuzzy
# match (default 90%), y /merge fusiona N en 1: reapunta gastos y pagos
# programados al ganador, y soft-deletea los duplicados.
#
# Tablas afectadas en la cascada del merge:
#   - gastos.destino_contacto_id
#   - tesoreria_pagos_programados.contacto_id
# Si en el futuro se agrega otra tabla con FK a contactos.id, hay que
# sumar el UPDATE acá.

def _normalize_nombre(s: str) -> str:
    """lowercase + sin tildes + trim + colapsa espacios. Usado para
    agrupar y comparar nombres sin importar acentos o espaciado raro."""
    if not s:
        return ""
    s = s.lower().strip()
    s = "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(s.split())


class ContactoDuplicadoItem(BaseModel):
    """Un contacto dentro de un grupo de duplicados, con stats para que el
    user decida cuál mantener."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    apellido: Optional[str] = None
    tipo: str
    dni: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    alias_pago: Optional[str] = None
    subtipo: Optional[str] = None
    cantidad_gastos: int = 0
    total_gastado: Decimal = Decimal(0)
    cantidad_pagos_prog: int = 0


class DuplicadoGrupo(BaseModel):
    score: float  # 1.0 = exacto, <1 = fuzzy (mínimo el threshold)
    contactos: List[ContactoDuplicadoItem]


@router.get("/duplicados", response_model=List[DuplicadoGrupo])
async def detectar_duplicados(
    request: Request,
    threshold: float = Query(0.65, ge=0.5, le=1.0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detecta grupos de contactos potencialmente duplicados.

    Algoritmo:
      1. Normalizar `nombre + apellido` (lower, sin tildes, trim, colapso
         de espacios).
      2. Agrupar exacto por string normalizado.
      3. Dentro de buckets por las primeras 2 letras del normalizado,
         comparar con SequenceMatcher.ratio() >= threshold. Bucketing
         evita O(n²) sobre todo el universo.
      4. Enriquecer cada contacto con stats (cantidad de gastos, total
         gastado, cantidad de pagos programados) para que Bartolo elija
         el ganador con info real.

    Devuelve solo grupos con >= 2 contactos. Ordenados por tamaño desc.
    """
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    res = await db.execute(
        select(Contacto).where(
            Contacto.municipio_id == municipio_id,
            Contacto.activo == True,  # noqa: E712
        )
    )
    contactos = list(res.scalars().all())
    if not contactos:
        return []

    # Pre-normalizar
    norm_list = [(c, _normalize_nombre(f"{c.nombre} {c.apellido or ''}")) for c in contactos]

    # Bucketing por primeras 2 letras del normalizado
    buckets: Dict[str, List] = {}
    for c, norm in norm_list:
        key = norm[:2] if norm else "__"
        buckets.setdefault(key, []).append((c, norm))

    # Detectar grupos
    visited = set()
    grupos_raw: List[tuple] = []  # (lista de contactos, score)
    for bucket_items in buckets.values():
        for i, (c1, n1) in enumerate(bucket_items):
            if c1.id in visited:
                continue
            grupo = [c1]
            grupo_score = 1.0
            for j in range(i + 1, len(bucket_items)):
                c2, n2 = bucket_items[j]
                if c2.id in visited:
                    continue
                if not n1 or not n2:
                    continue
                ratio = SequenceMatcher(None, n1, n2).ratio()
                if ratio >= threshold:
                    grupo.append(c2)
                    grupo_score = min(grupo_score, ratio)
                    visited.add(c2.id)
            if len(grupo) > 1:
                visited.add(c1.id)
                grupos_raw.append((grupo, grupo_score))

    if not grupos_raw:
        return []

    # Enriquecer con stats. Hacemos las queries agregadas para todos los
    # IDs de una sola vez para evitar N+1.
    all_ids = [c.id for grupo, _ in grupos_raw for c in grupo]
    g_stats = await db.execute(
        select(
            Gasto.destino_contacto_id,
            func.count(Gasto.id),
            func.coalesce(func.sum(Gasto.monto_pesos), 0),
        )
        .where(
            Gasto.destino_contacto_id.in_(all_ids),
            Gasto.activo == True,  # noqa: E712
        )
        .group_by(Gasto.destino_contacto_id)
    )
    gastos_by_id: Dict[int, tuple] = {row[0]: (row[1], row[2]) for row in g_stats.all()}

    pp_stats = await db.execute(
        select(
            TesoreriaPagoProgramado.contacto_id,
            func.count(TesoreriaPagoProgramado.id),
        )
        .where(TesoreriaPagoProgramado.contacto_id.in_(all_ids))
        .group_by(TesoreriaPagoProgramado.contacto_id)
    )
    pp_by_id: Dict[int, int] = {row[0]: row[1] for row in pp_stats.all()}

    # Armar response
    out: List[DuplicadoGrupo] = []
    for grupo, score in grupos_raw:
        items: List[ContactoDuplicadoItem] = []
        for c in grupo:
            g_count, g_total = gastos_by_id.get(c.id, (0, 0))
            items.append(ContactoDuplicadoItem(
                id=c.id,
                nombre=c.nombre,
                apellido=c.apellido,
                tipo=c.tipo.value if hasattr(c.tipo, "value") else str(c.tipo),
                dni=c.dni,
                telefono=c.telefono,
                email=c.email,
                direccion=c.direccion,
                latitud=c.latitud,
                longitud=c.longitud,
                alias_pago=c.alias_pago,
                subtipo=c.subtipo,
                cantidad_gastos=int(g_count or 0),
                total_gastado=Decimal(g_total or 0),
                cantidad_pagos_prog=int(pp_by_id.get(c.id, 0)),
            ))
        # Dentro del grupo: el que tiene más actividad arriba (suele ser
        # el "canónico" que el user querrá mantener).
        items.sort(key=lambda x: (-x.cantidad_gastos, -float(x.total_gastado), x.id))
        out.append(DuplicadoGrupo(score=score, contactos=items))

    # Grupos más grandes primero, dentro del mismo tamaño los más
    # parecidos al final (los exactos primero, los fuzzy después).
    out.sort(key=lambda g: (-len(g.contactos), -g.score))
    return out


class MergeRequest(BaseModel):
    """Body del POST /merge. El user elige `keep_id` (el ganador) y los
    IDs a fusionar. `tipo_final` permite forzar el tipo del ganador (ej:
    los 3 estaban como Beneficiario y se quiere dejar como Proveedor).
    `overrides` permite resolver conflictos campo por campo: si el ganador
    tiene un teléfono y un merged tiene otro distinto, el frontend manda
    `{"telefono": "...el que el user eligió..."}`.
    """
    keep_id: int
    merge_ids: List[int]
    tipo_final: Optional[str] = None
    overrides: Optional[Dict[str, Any]] = None


class MergeResponse(BaseModel):
    keep_id: int
    merged_count: int
    gastos_reapuntados: int
    pagos_prog_reapuntados: int


# Campos que se intentan completar en el ganador si están vacíos.
# Listado explícito para no traer accidentalmente campos sensibles
# (municipio_id, activo, created_at, etc.).
_MERGEABLE_FIELDS = (
    "dni", "telefono", "email", "direccion", "latitud", "longitud",
    "alias_pago", "subtipo", "notas", "tipo_empleado_id", "paraje_id",
)


@router.post("/merge", response_model=MergeResponse)
async def merge_contactos(
    payload: MergeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fusiona N contactos en 1.

    Pasos (en una sola transacción):
      1. Valida que todos los IDs pertenezcan al muni del user.
      2. Si viene `tipo_final`, lo aplica al ganador.
      3. Para cada campo de _MERGEABLE_FIELDS:
         - Si el frontend mandó override, ese valor gana.
         - Sino, si el ganador tiene valor, lo deja.
         - Sino, toma el primer merged que tenga valor.
      4. UPDATE gastos.destino_contacto_id IN merge_ids -> keep_id.
      5. UPDATE tesoreria_pagos_programados.contacto_id IN merge_ids -> keep_id.
      6. UPDATE contactos.activo=false WHERE id IN merge_ids (soft delete).
    """
    _require_admin(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)

    if payload.keep_id in payload.merge_ids:
        raise HTTPException(422, "keep_id no puede estar en merge_ids")
    if not payload.merge_ids:
        raise HTTPException(422, "merge_ids no puede estar vacio")

    all_ids = [payload.keep_id] + payload.merge_ids
    res = await db.execute(
        select(Contacto).where(
            Contacto.id.in_(all_ids),
            Contacto.municipio_id == municipio_id,
        )
    )
    by_id: Dict[int, Contacto] = {c.id: c for c in res.scalars().all()}
    if len(by_id) != len(set(all_ids)):
        raise HTTPException(404, "Algun contacto no encontrado o de otro municipio")

    keep = by_id[payload.keep_id]
    merged = [by_id[i] for i in payload.merge_ids]

    # Cambio de tipo del ganador
    if payload.tipo_final:
        try:
            keep.tipo = TipoContacto(payload.tipo_final)
        except ValueError:
            raise HTTPException(422, f"tipo_final invalido: {payload.tipo_final}")

    # Auto-merge de campos faltantes
    overrides = payload.overrides or {}
    for field in _MERGEABLE_FIELDS:
        if field in overrides:
            setattr(keep, field, overrides[field])
            continue
        if getattr(keep, field):
            continue
        for m in merged:
            v = getattr(m, field)
            if v not in (None, ""):
                setattr(keep, field, v)
                break

    # Reapuntar gastos
    upd_gastos = await db.execute(
        sa_update(Gasto)
        .where(Gasto.destino_contacto_id.in_(payload.merge_ids))
        .values(destino_contacto_id=payload.keep_id)
    )
    gastos_count = upd_gastos.rowcount or 0

    # Reapuntar pagos programados
    upd_pp = await db.execute(
        sa_update(TesoreriaPagoProgramado)
        .where(TesoreriaPagoProgramado.contacto_id.in_(payload.merge_ids))
        .values(contacto_id=payload.keep_id)
    )
    pp_count = upd_pp.rowcount or 0

    # Soft-delete de los merged
    await db.execute(
        sa_update(Contacto)
        .where(Contacto.id.in_(payload.merge_ids))
        .values(activo=False)
    )

    await db.commit()

    return MergeResponse(
        keep_id=payload.keep_id,
        merged_count=len(payload.merge_ids),
        gastos_reapuntados=gastos_count,
        pagos_prog_reapuntados=pp_count,
    )


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
