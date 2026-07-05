"""Puntos de Interés (POI) — F6 · Etapa B (router).

Dos catálogos + la consolidación en OT de zona:

  - `/poi/tipos`   CRUD del catálogo de tipos (Hospital, Escuela, ...). Clon de
                   `ot_tipos_trabajo.py` (DELETE inteligente soft/hard).
  - `/poi/puntos`  CRUD de los POIs concretos (lat/long + radio). Al crear/editar/
                   borrar un POI o cambiar su radio -> recálculo batch del matching
                   reclamo<->POI del muni (`services.poi_matching`).
  - `/poi/puntos/{id}/reclamos-en-zona`  conteo + lista de reclamos activos en zona.
  - `/poi/puntos/{id}/consolidar`        crea/obtiene LA OT consolidada vigente del
                   POI (origen=CONSOLIDADA_POI, prioridad ALTA) y vincula los
                   reclamos. Idempotente. UNA notificación (no una por reclamo).
  - `/poi/puntos/recalcular`             recálculo batch del muni.

Multi-tenant estricto: TODA query filtra por `resolve_municipio_id(...)`.
Opt-in por `municipio_modulos.modulo = 'poi'` (la superficie la gatea el front).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import require_roles
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from models import (
    PoiTipo, PuntoInteres, OrdenTrabajo, OrdenTrabajoReclamo, EstadoOrdenTrabajo,
    PrioridadOT, OrigenOT, Reclamo, HistorialReclamo, User,
)
from services.notificacion_service import NotificacionService
from services.poi_matching import recalcular_pois_municipio, ESTADOS_CERRADOS

router = APIRouter()

# OTs cerradas: espeja `ordenes_trabajo.ESTADOS_FINALES` a propósito, para no
# importar de `api.ordenes_trabajo` en tiempo de carga (el único símbolo de ese
# módulo que reusamos — `crear_ot_core` — se importa lazy dentro de consolidar,
# siguiendo el patrón anti-ciclo de reclamos.py).
_OT_FINALES = (EstadoOrdenTrabajo.COMPLETADA, EstadoOrdenTrabajo.CANCELADA)

RADIO_MIN = 100
RADIO_MAX = 10000
RADIO_DEFAULT = 2000


# ============================== Schemas: tipos ==============================

class TipoCreate(BaseModel):
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None
    radio_default_metros: Optional[int] = None
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
    radio_default_metros: Optional[int] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


class TipoResponse(BaseModel):
    id: int
    nombre: str
    icono: Optional[str] = None
    color: Optional[str] = None
    radio_default_metros: Optional[int] = None
    activo: bool
    orden: int

    class Config:
        from_attributes = True


# ============================== Schemas: puntos ==============================

class PuntoCreate(BaseModel):
    tipo_id: int
    nombre: str
    direccion: Optional[str] = None
    latitud: float
    longitud: float
    # None -> se resuelve del radio_default del tipo, o RADIO_DEFAULT global.
    radio_metros: Optional[int] = None
    notas: Optional[str] = None

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre es obligatorio")
        return v.strip()

    @field_validator("radio_metros")
    @classmethod
    def _radio(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (RADIO_MIN <= v <= RADIO_MAX):
            raise ValueError(f"El radio debe estar entre {RADIO_MIN} y {RADIO_MAX} metros")
        return v


class PuntoUpdate(BaseModel):
    tipo_id: Optional[int] = None
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    radio_metros: Optional[int] = None
    activo: Optional[bool] = None
    notas: Optional[str] = None

    @field_validator("radio_metros")
    @classmethod
    def _radio(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (RADIO_MIN <= v <= RADIO_MAX):
            raise ValueError(f"El radio debe estar entre {RADIO_MIN} y {RADIO_MAX} metros")
        return v


class PuntoResponse(BaseModel):
    id: int
    tipo_id: int
    nombre: str
    direccion: Optional[str] = None
    latitud: float
    longitud: float
    radio_metros: int
    activo: bool
    notas: Optional[str] = None
    # Enriquecido desde el tipo (para el marker del mapa — B4).
    tipo_nombre: Optional[str] = None
    tipo_color: Optional[str] = None
    tipo_icono: Optional[str] = None


class ReclamoEnZona(BaseModel):
    id: int
    titulo: str
    estado: str
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


class ReclamosEnZonaResponse(BaseModel):
    poi_id: int
    total: int
    reclamos: List[ReclamoEnZona]


class ConsolidarInput(BaseModel):
    # None / vacío -> todos los reclamos activos en zona del POI.
    reclamo_ids: Optional[List[int]] = None


class OTConsolidadaResponse(BaseModel):
    id: int
    numero: str
    titulo: str
    estado: str
    prioridad: str
    origen: str
    poi_id: Optional[int] = None
    reclamos_count: int
    creada: bool  # True: se creó una OT nueva; False: se reusó la vigente


class RecalcularResponse(BaseModel):
    reclamos_en_zona: int


# ============================== Helpers ==============================

def _tipo_to_response(t: PoiTipo) -> TipoResponse:
    return TipoResponse.model_validate(t)


def _punto_to_response(p: PuntoInteres) -> PuntoResponse:
    return PuntoResponse(
        id=p.id, tipo_id=p.tipo_id, nombre=p.nombre, direccion=p.direccion,
        latitud=p.latitud, longitud=p.longitud, radio_metros=p.radio_metros,
        activo=p.activo, notas=p.notas,
        tipo_nombre=p.tipo.nombre if p.tipo else None,
        tipo_color=p.tipo.color if p.tipo else None,
        tipo_icono=p.tipo.icono if p.tipo else None,
    )


async def _get_tipo(db: AsyncSession, tipo_id: int, municipio_id: int) -> PoiTipo:
    t = (await db.execute(select(PoiTipo).where(
        PoiTipo.id == tipo_id, PoiTipo.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tipo de POI no encontrado")
    return t


async def _get_punto(db: AsyncSession, punto_id: int, municipio_id: int,
                     with_tipo: bool = True) -> PuntoInteres:
    q = select(PuntoInteres).where(
        PuntoInteres.id == punto_id, PuntoInteres.municipio_id == municipio_id,
    )
    if with_tipo:
        q = q.options(selectinload(PuntoInteres.tipo))
    p = (await db.execute(q)).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Punto de interés no encontrado")
    return p


async def _validar_tipo(db: AsyncSession, municipio_id: int, tipo_id: int) -> PoiTipo:
    """El tipo debe pertenecer al municipio (anti cross-tenant). Devuelve el tipo."""
    t = (await db.execute(select(PoiTipo).where(
        PoiTipo.id == tipo_id, PoiTipo.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=400, detail="Tipo de POI inválido para este municipio")
    return t


def _clamp_radio(valor: Optional[int]) -> int:
    """Resuelve el radio a un entero dentro de [RADIO_MIN, RADIO_MAX]."""
    v = valor if valor is not None else RADIO_DEFAULT
    return max(RADIO_MIN, min(RADIO_MAX, v))


# ============================== Tipos CRUD ==============================

@router.get("/tipos", response_model=List[TipoResponse])
async def listar_tipos(
    request: Request,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(PoiTipo).where(PoiTipo.municipio_id == municipio_id)
    if activo is not None:
        query = query.where(PoiTipo.activo == activo)
    query = query.order_by(PoiTipo.orden, PoiTipo.nombre)
    return [_tipo_to_response(t) for t in (await db.execute(query)).scalars().all()]


@router.post("/tipos", response_model=TipoResponse)
async def crear_tipo(
    data: TipoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    dup = (await db.execute(select(PoiTipo.id).where(
        PoiTipo.municipio_id == municipio_id, PoiTipo.nombre == data.nombre,
    ))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail="Ya existe un tipo de POI con ese nombre")
    t = PoiTipo(
        municipio_id=municipio_id, nombre=data.nombre, icono=data.icono,
        color=data.color, radio_default_metros=data.radio_default_metros, orden=data.orden,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _tipo_to_response(t)


@router.put("/tipos/{tipo_id}", response_model=TipoResponse)
async def actualizar_tipo(
    tipo_id: int,
    data: TipoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    t = await _get_tipo(db, tipo_id, municipio_id)
    campos = data.model_dump(exclude_unset=True)
    if "nombre" in campos and campos["nombre"]:
        dup = (await db.execute(select(PoiTipo.id).where(
            PoiTipo.municipio_id == municipio_id, PoiTipo.nombre == campos["nombre"],
            PoiTipo.id != tipo_id,
        ))).scalar_one_or_none()
        if dup:
            raise HTTPException(status_code=400, detail="Ya existe un tipo de POI con ese nombre")
    for k, v in campos.items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return _tipo_to_response(t)


@router.delete("/tipos/{tipo_id}")
async def eliminar_tipo(
    tipo_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """DELETE inteligente (clon de ot_tipos_trabajo): si hay POIs de este tipo,
    soft delete (activo=False) para no romper el histórico ni el FK RESTRICT;
    si no lo usa nadie, se borra."""
    municipio_id = get_effective_municipio_id(request, current_user)
    t = await _get_tipo(db, tipo_id, municipio_id)
    en_uso = (await db.execute(select(func.count(PuntoInteres.id)).where(
        PuntoInteres.tipo_id == tipo_id,
        PuntoInteres.municipio_id == municipio_id,
    ))).scalar_one()
    if en_uso:
        t.activo = False
    else:
        await db.delete(t)
    await db.commit()
    return {"ok": True, "soft_delete": bool(en_uso)}


# ============================== Puntos CRUD ==============================

@router.get("/puntos", response_model=List[PuntoResponse])
async def listar_puntos(
    request: Request,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = select(PuntoInteres).options(selectinload(PuntoInteres.tipo)).where(
        PuntoInteres.municipio_id == municipio_id
    )
    if activo is not None:
        query = query.where(PuntoInteres.activo == activo)
    query = query.order_by(PuntoInteres.nombre)
    return [_punto_to_response(p) for p in (await db.execute(query)).scalars().all()]


@router.post("/puntos", response_model=PuntoResponse)
async def crear_punto(
    data: PuntoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    tipo = await _validar_tipo(db, municipio_id, data.tipo_id)
    radio = _clamp_radio(data.radio_metros if data.radio_metros is not None
                         else tipo.radio_default_metros)
    p = PuntoInteres(
        municipio_id=municipio_id, tipo_id=data.tipo_id, nombre=data.nombre,
        direccion=data.direccion, latitud=data.latitud, longitud=data.longitud,
        radio_metros=radio, notas=data.notas, activo=True,
    )
    db.add(p)
    await db.flush()
    # Un POI nuevo puede capturar reclamos existentes en su radio -> recálculo.
    await recalcular_pois_municipio(db, municipio_id)
    await db.commit()
    p = await _get_punto(db, p.id, municipio_id)
    return _punto_to_response(p)


@router.put("/puntos/{punto_id}", response_model=PuntoResponse)
async def actualizar_punto(
    punto_id: int,
    data: PuntoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    p = await _get_punto(db, punto_id, municipio_id)
    campos = data.model_dump(exclude_unset=True)
    if "tipo_id" in campos and campos["tipo_id"] is not None:
        await _validar_tipo(db, municipio_id, campos["tipo_id"])
    if "radio_metros" in campos and campos["radio_metros"] is not None:
        campos["radio_metros"] = _clamp_radio(campos["radio_metros"])
    for k, v in campos.items():
        setattr(p, k, v)
    await db.flush()
    # Editar radio/coords/tipo/activo puede mover reclamos dentro/fuera de zona.
    await recalcular_pois_municipio(db, municipio_id)
    await db.commit()
    p = await _get_punto(db, punto_id, municipio_id)
    return _punto_to_response(p)


@router.delete("/puntos/{punto_id}")
async def eliminar_punto(
    punto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """DELETE inteligente: si alguna OT (consolidada) referencia este POI, soft
    delete (activo=False) para preservar el vínculo/histórico de esa OT; si no,
    hard delete. En ambos casos se recalcula el matching del muni (los reclamos
    que estaban en zona pasan al POI activo más cercano, o a None)."""
    municipio_id = get_effective_municipio_id(request, current_user)
    p = await _get_punto(db, punto_id, municipio_id, with_tipo=False)
    en_uso = (await db.execute(select(func.count(OrdenTrabajo.id)).where(
        OrdenTrabajo.poi_id == punto_id, OrdenTrabajo.municipio_id == municipio_id,
    ))).scalar_one()
    if en_uso:
        p.activo = False
    else:
        await db.delete(p)
    await db.flush()
    await recalcular_pois_municipio(db, municipio_id)
    await db.commit()
    return {"ok": True, "soft_delete": bool(en_uso)}


# --- Rutas con sufijo/estáticas bajo /puntos --------------------------------
# `POST /puntos/recalcular` no colisiona con `/puntos/{punto_id}` (PUT/DELETE):
# no existe un `POST /puntos/{punto_id}`, así que el método desambigua el match
# (verificado con Starlette). consolidar/reclamos-en-zona tienen sufijo propio.

@router.post("/puntos/recalcular", response_model=RecalcularResponse)
async def recalcular_puntos(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Recalcula `poi_id` de todos los reclamos activos del muni. Devuelve cuántos
    quedaron dentro de alguna zona."""
    municipio_id = get_effective_municipio_id(request, current_user)
    en_zona = await recalcular_pois_municipio(db, municipio_id)
    await db.commit()
    return RecalcularResponse(reclamos_en_zona=en_zona)


@router.get("/puntos/{punto_id}/reclamos-en-zona", response_model=ReclamosEnZonaResponse)
async def reclamos_en_zona(
    punto_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    """Conteo + lista de reclamos ACTIVOS actualmente vinculados a este POI
    (`reclamo.poi_id == punto_id`)."""
    municipio_id = get_effective_municipio_id(request, current_user)
    await _get_punto(db, punto_id, municipio_id, with_tipo=False)
    reclamos = (await db.execute(
        select(Reclamo).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.poi_id == punto_id,
            Reclamo.estado.notin_(ESTADOS_CERRADOS),
        ).order_by(Reclamo.created_at.desc())
    )).scalars().all()
    return ReclamosEnZonaResponse(
        poi_id=punto_id,
        total=len(reclamos),
        reclamos=[
            ReclamoEnZona(
                id=r.id, titulo=r.titulo,
                estado=r.estado.value if r.estado else "",
                direccion=r.direccion, latitud=r.latitud, longitud=r.longitud,
            )
            for r in reclamos
        ],
    )


@router.post("/puntos/{punto_id}/consolidar", response_model=OTConsolidadaResponse)
async def consolidar_zona(
    punto_id: int,
    data: ConsolidarInput,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """Crea u obtiene LA OT consolidada VIGENTE del POI y le vincula los reclamos.

    - Sin `reclamo_ids` -> todos los reclamos activos en zona (poi_id == punto_id).
    - Con `reclamo_ids` -> esos (validados como del muni).
    Idempotente: si ya hay una OT consolidada vigente del POI se reusa (no se
    duplica); sólo se agregan los vínculos faltantes. La OT es
    origen=CONSOLIDADA_POI, prioridad ALTA, título "Zona {POI}". Emite UNA sola
    notificación a los supervisores (nunca una por reclamo)."""
    municipio_id = get_effective_municipio_id(request, current_user)
    poi = await _get_punto(db, punto_id, municipio_id, with_tipo=False)

    # Reclamos objetivo
    if data.reclamo_ids:
        ids = list(dict.fromkeys(data.reclamo_ids))  # dedup preservando orden
        reclamos = (await db.execute(select(Reclamo).where(
            Reclamo.id.in_(ids), Reclamo.municipio_id == municipio_id,
        ))).scalars().all()
        if len(reclamos) != len(ids):
            raise HTTPException(status_code=400, detail="Uno o más reclamos no pertenecen a este municipio")
        target_ids = [r.id for r in reclamos]
    else:
        reclamos = (await db.execute(select(Reclamo).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.poi_id == punto_id,
            Reclamo.estado.notin_(ESTADOS_CERRADOS),
        ))).scalars().all()
        target_ids = [r.id for r in reclamos]

    if not target_ids:
        raise HTTPException(status_code=400, detail="No hay reclamos para consolidar en esta zona")

    # OT consolidada vigente del POI (una sola por POI) — idempotencia.
    ot = (await db.execute(select(OrdenTrabajo).where(
        OrdenTrabajo.municipio_id == municipio_id,
        OrdenTrabajo.poi_id == punto_id,
        OrdenTrabajo.origen == OrigenOT.CONSOLIDADA_POI,
        OrdenTrabajo.estado.notin_(_OT_FINALES),
    ).order_by(OrdenTrabajo.created_at.desc()).limit(1))).scalar_one_or_none()
    creada = ot is None

    if creada:
        # Import lazy (patrón anti-ciclo de reclamos.py). crear_ot_core no commitea.
        from api.ordenes_trabajo import crear_ot_core
        ot, _ = await crear_ot_core(
            db, municipio_id=municipio_id, creador_id=current_user.id,
            titulo=f"Zona {poi.nombre}",
            descripcion=f"OT de zona del punto de interés '{poi.nombre}' (consolidación de reclamos cercanos).",
            prioridad=PrioridadOT.ALTA, reclamo_ids=[], origen=OrigenOT.CONSOLIDADA_POI,
        )
        ot.poi_id = punto_id
        await db.flush()

    # Vincular sólo los reclamos aún NO vinculados (evita duplicar el pivot).
    ya_vinculados = {
        rid for rid in (await db.execute(select(OrdenTrabajoReclamo.reclamo_id).where(
            OrdenTrabajoReclamo.orden_trabajo_id == ot.id
        ))).scalars().all()
    }
    nuevos = [rid for rid in target_ids if rid not in ya_vinculados]
    for rid in nuevos:
        db.add(OrdenTrabajoReclamo(orden_trabajo_id=ot.id, reclamo_id=rid))
        db.add(HistorialReclamo(
            reclamo_id=rid, usuario_id=current_user.id,
            accion="ot_consolidada",
            comentario=f"Consolidado en la OT de zona {ot.numero} ({poi.nombre}).",
        ))
    await db.flush()

    # Absorción (doc §2.2): la OT de zona reemplaza la OT implícita 1:1 de cada
    # reclamo consolidado, para no dejar dos OTs vivas del mismo reclamo (la
    # implícita con su empleado + la consolidada). No-op si no tenía implícita;
    # best-effort (no rompe la consolidación si falla la cancelación).
    if nuevos:
        from api.ordenes_trabajo import cancelar_ot_implicita
        nuevos_set = set(nuevos)
        for reclamo in reclamos:
            if reclamo.id in nuevos_set:
                await cancelar_ot_implicita(
                    db, reclamo,
                    motivo=f"Absorbido por la OT de zona {ot.numero} ({poi.nombre})",
                )
        await db.flush()

    # UNA notificación por consolidación (no una por reclamo — gotcha del spam).
    if nuevos:
        titulo = f"Zona {poi.nombre}: {len(nuevos)} reclamo(s) consolidado(s)"
        verbo = "creó" if creada else "actualizó"
        mensaje = (f"Se {verbo} la OT de zona {ot.numero} ({poi.nombre}) con "
                   f"{len(nuevos)} reclamo(s). Prioridad alta.")
        await NotificacionService.notificar_supervisores(
            db=db, municipio_id=municipio_id, titulo=titulo, mensaje=mensaje,
            tipo="info", enviar_whatsapp=False,
        )

    await db.commit()

    total_vinculados = len(ya_vinculados) + len(nuevos)
    return OTConsolidadaResponse(
        id=ot.id, numero=ot.numero, titulo=ot.titulo,
        estado=ot.estado.value if ot.estado else "",
        prioridad=ot.prioridad.value if ot.prioridad else "",
        origen=ot.origen.value if ot.origen else "",
        poi_id=ot.poi_id, reclamos_count=total_vinculados, creada=creada,
    )
