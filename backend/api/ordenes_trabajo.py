"""Órdenes de trabajo (OT) — unidad formal del trabajo de campo.

Circuito: pendiente → asignada (cuadrilla y/o empleado) → en_curso → completada.
Cancelable en cualquier estado no final. N:M con reclamos (1 reclamo → N OTs,
N reclamos → 1 OT). Completar la OT NO cierra los reclamos: el reclamo mantiene
su circuito propio (resolver → confirmar supervisor → confirmar vecino).

Aditivo al flujo simple (Reclamo.empleado_id directo) — los munis chicos no
necesitan OTs. Frontend gated por municipio_modulos 'ordenes_trabajo' (opt-in).
"""
from datetime import datetime, date, time
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user, require_roles
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from models import (
    OrdenTrabajo, OrdenTrabajoReclamo, EstadoOrdenTrabajo,
    Reclamo, HistorialReclamo, Cuadrilla, Empleado, EmpleadoCuadrilla, User,
    InventarioItem, OrdenTrabajoRecurso, NaturalezaInventario, EstadoActivo, TipoRecursoOT,
)
from models.enums import RolUsuario

router = APIRouter()

ESTADOS_FINALES = (EstadoOrdenTrabajo.COMPLETADA, EstadoOrdenTrabajo.CANCELADA)


# ============================== Schemas ==============================

class MaterialItem(BaseModel):
    descripcion: str
    cantidad: float = 1
    unidad: Optional[str] = None


class RecursoInput(BaseModel):
    """Ítem de inventario a vincular a la OT. El tipo (reserva/consumo) se
    deriva de la naturaleza del ítem. `cantidad` sólo aplica a consumibles."""
    item_id: int
    cantidad: Optional[float] = None


class RecursoResponse(BaseModel):
    id: int
    item_id: int
    item_nombre: Optional[str] = None
    naturaleza: Optional[str] = None
    tipo: TipoRecursoOT
    cantidad: Optional[float] = None
    unidad: Optional[str] = None
    identificador: Optional[str] = None
    aplicado: bool = False

    class Config:
        from_attributes = True


class OTCreate(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    reclamo_ids: List[int] = []
    cuadrilla_id: Optional[int] = None
    empleado_id: Optional[int] = None
    fecha_programada: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None
    materiales: Optional[List[MaterialItem]] = None
    recursos: Optional[List[RecursoInput]] = None
    horas_estimadas: Optional[float] = None


class OTUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    reclamo_ids: Optional[List[int]] = None  # None = no tocar vínculos
    cuadrilla_id: Optional[int] = None
    empleado_id: Optional[int] = None
    fecha_programada: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None
    materiales: Optional[List[MaterialItem]] = None
    recursos: Optional[List[RecursoInput]] = None  # None = no tocar recursos
    horas_estimadas: Optional[float] = None


class OTAsignar(BaseModel):
    cuadrilla_id: Optional[int] = None
    empleado_id: Optional[int] = None
    fecha_programada: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None


class OTCompletar(BaseModel):
    notas_cierre: str
    horas_reales: Optional[float] = None


class OTCancelar(BaseModel):
    motivo: str


class ReclamoMini(BaseModel):
    id: int
    titulo: str
    estado: str
    direccion: Optional[str] = None

    class Config:
        from_attributes = True


class OTResponse(BaseModel):
    id: int
    numero: str
    estado: EstadoOrdenTrabajo
    titulo: str
    descripcion: Optional[str] = None
    cuadrilla_id: Optional[int] = None
    cuadrilla_nombre: Optional[str] = None
    empleado_id: Optional[int] = None
    empleado_nombre: Optional[str] = None
    fecha_programada: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None
    materiales: Optional[List[MaterialItem]] = None
    horas_estimadas: Optional[float] = None
    horas_reales: Optional[float] = None
    notas_cierre: Optional[str] = None
    motivo_cancelacion: Optional[str] = None
    fecha_inicio_real: Optional[datetime] = None
    fecha_completada: Optional[datetime] = None
    created_at: Optional[datetime] = None
    reclamos: List[ReclamoMini] = []
    recursos: List[RecursoResponse] = []

    class Config:
        from_attributes = True


# ============================== Helpers ==============================

async def _siguiente_numero(db: AsyncSession, municipio_id: int) -> str:
    """Correlativo por muni y año: OT-2026-0001 (mismo patrón que OrdenPago)."""
    anio = date.today().year
    prefix = f"OT-{anio}-"
    last = (await db.execute(
        select(OrdenTrabajo.numero)
        .where(
            OrdenTrabajo.municipio_id == municipio_id,
            OrdenTrabajo.numero.like(f"{prefix}%"),
        )
        .order_by(OrdenTrabajo.numero.desc())
        .limit(1)
    )).scalar_one_or_none()
    if last:
        try:
            seq = int(last.split("-")[-1]) + 1
        except Exception:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def _query_base():
    return select(OrdenTrabajo).options(
        selectinload(OrdenTrabajo.cuadrilla),
        selectinload(OrdenTrabajo.empleado),
        selectinload(OrdenTrabajo.reclamos_vinculados).selectinload(OrdenTrabajoReclamo.reclamo),
        selectinload(OrdenTrabajo.recursos).selectinload(OrdenTrabajoRecurso.item),
    )


def _to_response(ot: OrdenTrabajo) -> OTResponse:
    resp = OTResponse.model_validate(ot)
    if ot.cuadrilla:
        resp.cuadrilla_nombre = f"{ot.cuadrilla.nombre} {ot.cuadrilla.apellido or ''}".strip()
    if ot.empleado:
        resp.empleado_nombre = f"{ot.empleado.nombre} {ot.empleado.apellido or ''}".strip()
    resp.reclamos = [
        ReclamoMini(
            id=link.reclamo.id,
            titulo=link.reclamo.titulo,
            estado=link.reclamo.estado.value if link.reclamo.estado else "",
            direccion=link.reclamo.direccion,
        )
        for link in ot.reclamos_vinculados if link.reclamo
    ]
    resp.recursos = [
        RecursoResponse(
            id=rec.id,
            item_id=rec.item_id,
            item_nombre=(rec.item.nombre if rec.item else rec.item_nombre),
            naturaleza=(rec.item.naturaleza.value if rec.item and rec.item.naturaleza else None),
            tipo=rec.tipo,
            cantidad=rec.cantidad,
            unidad=(rec.item.unidad if rec.item else None),
            identificador=(rec.item.identificador if rec.item else None),
            aplicado=rec.aplicado,
        )
        for rec in ot.recursos
    ]
    return resp


async def _get_ot(db: AsyncSession, ot_id: int, municipio_id: int) -> OrdenTrabajo:
    ot = (await db.execute(
        _query_base().where(OrdenTrabajo.id == ot_id, OrdenTrabajo.municipio_id == municipio_id)
    )).scalar_one_or_none()
    if not ot:
        raise HTTPException(status_code=404, detail="Orden de trabajo no encontrada")
    return ot


async def _validar_recursos(db: AsyncSession, municipio_id: int,
                            cuadrilla_id: Optional[int], empleado_id: Optional[int]):
    """Cuadrilla y empleado deben pertenecer al mismo municipio (anti cross-tenant)."""
    if cuadrilla_id:
        ok = (await db.execute(select(Cuadrilla.id).where(
            Cuadrilla.id == cuadrilla_id, Cuadrilla.municipio_id == municipio_id
        ))).scalar_one_or_none()
        if not ok:
            raise HTTPException(status_code=400, detail="Cuadrilla inválida para este municipio")
    if empleado_id:
        ok = (await db.execute(select(Empleado.id).where(
            Empleado.id == empleado_id, Empleado.municipio_id == municipio_id
        ))).scalar_one_or_none()
        if not ok:
            raise HTTPException(status_code=400, detail="Empleado inválido para este municipio")


async def _vincular_reclamos(db: AsyncSession, ot: OrdenTrabajo, reclamo_ids: List[int],
                             municipio_id: int) -> List[Reclamo]:
    """Valida que los reclamos sean del muni y crea los vínculos. Devuelve los reclamos."""
    if not reclamo_ids:
        return []
    reclamos = (await db.execute(
        select(Reclamo).where(Reclamo.id.in_(reclamo_ids), Reclamo.municipio_id == municipio_id)
    )).scalars().all()
    if len(reclamos) != len(set(reclamo_ids)):
        raise HTTPException(status_code=400, detail="Uno o más reclamos no pertenecen a este municipio")
    for r in reclamos:
        db.add(OrdenTrabajoReclamo(orden_trabajo_id=ot.id, reclamo_id=r.id))
    return list(reclamos)


def _historial_reclamos(db: AsyncSession, reclamos: List[Reclamo], usuario_id: int,
                        accion: str, comentario: str):
    for r in reclamos:
        db.add(HistorialReclamo(
            reclamo_id=r.id, usuario_id=usuario_id,
            accion=accion, comentario=comentario,
        ))


def _puede_operar_en_campo(ot: OrdenTrabajo, user: User, cuadrillas_ids: set) -> bool:
    """Empleado solo opera su OT: responsable directo o miembro de la cuadrilla."""
    if user.rol in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        return True
    if user.empleado_id and ot.empleado_id == user.empleado_id:
        return True
    if ot.cuadrilla_id and ot.cuadrilla_id in cuadrillas_ids:
        return True
    return False


async def _cuadrillas_del_user(db: AsyncSession, user: User) -> set:
    if not user.empleado_id:
        return set()
    rows = (await db.execute(
        select(EmpleadoCuadrilla.cuadrilla_id).where(
            EmpleadoCuadrilla.empleado_id == user.empleado_id,
            EmpleadoCuadrilla.activo == True,  # noqa: E712
        )
    )).scalars().all()
    return set(rows)


# ---------------------- Recursos de inventario ----------------------
#
# Mecánica del cruce OT ↔ inventario:
#   - ACTIVO (reserva): se marca `en_uso` mientras la OT esté vinculada;
#     se libera al desvincular, completar o cancelar. Un activo sólo puede
#     estar tomado por UNA OT a la vez.
#   - CONSUMIBLE (consumo): se guarda la cantidad planeada; el stock se
#     descuenta recién al COMPLETAR la OT (si se cancela, no se descuenta).

async def _sincronizar_recursos(db: AsyncSession, ot: OrdenTrabajo,
                                recursos_input: List[RecursoInput], municipio_id: int):
    """Reemplaza los recursos de la OT por la lista dada (sync total).

    Libera los activos que se quitan; reserva los activos nuevos (validando
    disponibilidad); registra/actualiza los consumos planeados. NO descuenta
    stock acá (eso ocurre al completar la OT)."""
    actuales = {
        r.item_id: r for r in (await db.execute(
            select(OrdenTrabajoRecurso).where(OrdenTrabajoRecurso.orden_trabajo_id == ot.id)
        )).scalars().all()
    }
    nuevos_ids = {r.item_id for r in recursos_input}

    # 1) Quitar los que ya no están (liberar activos)
    for item_id, rec in list(actuales.items()):
        if item_id not in nuevos_ids:
            if rec.tipo == TipoRecursoOT.RESERVA:
                await _liberar_activo(db, item_id, ot.id, municipio_id)
            await db.delete(rec)

    # 2) Agregar / actualizar
    for rin in recursos_input:
        item = (await db.execute(select(InventarioItem).where(
            InventarioItem.id == rin.item_id,
            InventarioItem.municipio_id == municipio_id,
            InventarioItem.activo == True,  # noqa: E712
        ))).scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=400, detail=f"Ítem de inventario {rin.item_id} inválido para este municipio")

        existente = actuales.get(item.id)

        if item.naturaleza == NaturalezaInventario.CONSUMIBLE:
            cant = rin.cantidad if (rin.cantidad and rin.cantidad > 0) else 1
            if existente:
                existente.cantidad = cant
                existente.item_nombre = item.nombre
            else:
                db.add(OrdenTrabajoRecurso(
                    orden_trabajo_id=ot.id, item_id=item.id,
                    tipo=TipoRecursoOT.CONSUMO, cantidad=cant, item_nombre=item.nombre,
                ))
        else:  # ACTIVO — reserva
            if existente:
                continue  # ya reservado por esta OT
            if item.estado_activo != EstadoActivo.DISPONIBLE:
                if item.ocupado_por_ot_id and item.ocupado_por_ot_id != ot.id:
                    otra = (await db.execute(select(OrdenTrabajo.numero).where(
                        OrdenTrabajo.id == item.ocupado_por_ot_id
                    ))).scalar_one_or_none()
                    raise HTTPException(
                        status_code=400,
                        detail=f"«{item.nombre}» ya está tomado por la OT {otra or item.ocupado_por_ot_id}",
                    )
                if item.estado_activo in (EstadoActivo.MANTENIMIENTO, EstadoActivo.BAJA):
                    raise HTTPException(
                        status_code=400,
                        detail=f"«{item.nombre}» no está disponible ({item.estado_activo.value})",
                    )
            item.estado_activo = EstadoActivo.EN_USO
            item.ocupado_por_ot_id = ot.id
            db.add(OrdenTrabajoRecurso(
                orden_trabajo_id=ot.id, item_id=item.id,
                tipo=TipoRecursoOT.RESERVA, item_nombre=item.nombre,
            ))


async def _liberar_activo(db: AsyncSession, item_id: int, ot_id: int, municipio_id: int):
    """Devuelve un activo a `disponible` si lo tenía esta OT (o quedó colgado)."""
    item = (await db.execute(select(InventarioItem).where(
        InventarioItem.id == item_id, InventarioItem.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if item and item.naturaleza == NaturalezaInventario.ACTIVO:
        if item.ocupado_por_ot_id in (ot_id, None):
            item.estado_activo = EstadoActivo.DISPONIBLE
            item.ocupado_por_ot_id = None


async def _cerrar_recursos(db: AsyncSession, ot: OrdenTrabajo, municipio_id: int,
                           descontar_consumos: bool):
    """Al cerrar la OT: libera activos siempre; descuenta stock de
    consumibles sólo si `descontar_consumos` (completar sí, cancelar no)."""
    for rec in ot.recursos:
        item = (await db.execute(select(InventarioItem).where(
            InventarioItem.id == rec.item_id, InventarioItem.municipio_id == municipio_id,
        ))).scalar_one_or_none()
        if not item:
            continue
        if rec.tipo == TipoRecursoOT.RESERVA and item.naturaleza == NaturalezaInventario.ACTIVO:
            if item.ocupado_por_ot_id in (ot.id, None):
                item.estado_activo = EstadoActivo.DISPONIBLE
                item.ocupado_por_ot_id = None
        elif (rec.tipo == TipoRecursoOT.CONSUMO and descontar_consumos
              and not rec.aplicado and rec.cantidad):
            if item.stock_actual is not None:
                item.stock_actual = max(0.0, (item.stock_actual or 0) - rec.cantidad)
            rec.aplicado = True


# ============================== Endpoints ==============================

@router.get("", response_model=List[OTResponse])
async def listar_ordenes(
    request: Request,
    estado: Optional[EstadoOrdenTrabajo] = None,
    cuadrilla_id: Optional[int] = None,
    empleado_id: Optional[int] = None,
    reclamo_id: Optional[int] = None,
    dependencia_id: Optional[int] = Query(None, description="Solo OTs con algún reclamo vinculado de esta dependencia"),
    vigentes: bool = Query(False, description="Excluye OTs completadas/canceladas"),
    solo_mias: bool = Query(False, description="Solo OTs donde soy responsable o mi cuadrilla"),
    search: Optional[str] = Query(None, description="Busca en número/título"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    query = _query_base().where(OrdenTrabajo.municipio_id == municipio_id)

    es_empleado = current_user.rol == RolUsuario.EMPLEADO
    if es_empleado or solo_mias:
        cuadrillas = await _cuadrillas_del_user(db, current_user)
        condiciones = []
        if current_user.empleado_id:
            condiciones.append(OrdenTrabajo.empleado_id == current_user.empleado_id)
        if cuadrillas:
            condiciones.append(OrdenTrabajo.cuadrilla_id.in_(cuadrillas))
        if condiciones:
            from sqlalchemy import or_
            query = query.where(or_(*condiciones))
        else:
            return []

    if estado:
        query = query.where(OrdenTrabajo.estado == estado)
    if cuadrilla_id:
        query = query.where(OrdenTrabajo.cuadrilla_id == cuadrilla_id)
    if empleado_id:
        query = query.where(OrdenTrabajo.empleado_id == empleado_id)
    if reclamo_id or dependencia_id:
        query = query.join(OrdenTrabajoReclamo, OrdenTrabajoReclamo.orden_trabajo_id == OrdenTrabajo.id)
        if reclamo_id:
            query = query.where(OrdenTrabajoReclamo.reclamo_id == reclamo_id)
        if dependencia_id:
            query = query.join(Reclamo, Reclamo.id == OrdenTrabajoReclamo.reclamo_id).where(
                Reclamo.municipio_dependencia_id == dependencia_id
            )
    if vigentes:
        query = query.where(OrdenTrabajo.estado.notin_(ESTADOS_FINALES))
    if search and search.strip():
        s = f"%{search.strip()}%"
        from sqlalchemy import or_
        query = query.where(or_(OrdenTrabajo.numero.ilike(s), OrdenTrabajo.titulo.ilike(s)))

    query = query.order_by(OrdenTrabajo.created_at.desc()).offset(skip).limit(limit)
    ots = (await db.execute(query)).scalars().unique().all()
    return [_to_response(ot) for ot in ots]


@router.get("/reclamo/{reclamo_id}", response_model=List[OTResponse])
async def ordenes_de_un_reclamo(
    reclamo_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    ots = (await db.execute(
        _query_base()
        .join(OrdenTrabajoReclamo, OrdenTrabajoReclamo.orden_trabajo_id == OrdenTrabajo.id)
        .where(
            OrdenTrabajoReclamo.reclamo_id == reclamo_id,
            OrdenTrabajo.municipio_id == municipio_id,
        )
        .order_by(OrdenTrabajo.created_at.desc())
    )).scalars().unique().all()
    return [_to_response(ot) for ot in ots]


@router.get("/{ot_id}", response_model=OTResponse)
async def obtener_orden(
    ot_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)


@router.post("", response_model=OTResponse)
async def crear_orden(
    data: OTCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    await _validar_recursos(db, municipio_id, data.cuadrilla_id, data.empleado_id)

    numero = await _siguiente_numero(db, municipio_id)
    estado = (
        EstadoOrdenTrabajo.ASIGNADA
        if (data.cuadrilla_id or data.empleado_id)
        else EstadoOrdenTrabajo.PENDIENTE
    )

    ot = OrdenTrabajo(
        municipio_id=municipio_id,
        numero=numero,
        estado=estado,
        titulo=data.titulo,
        descripcion=data.descripcion,
        cuadrilla_id=data.cuadrilla_id,
        empleado_id=data.empleado_id,
        fecha_programada=data.fecha_programada,
        hora_inicio=data.hora_inicio,
        hora_fin=data.hora_fin,
        materiales=[m.model_dump() for m in data.materiales] if data.materiales else None,
        horas_estimadas=data.horas_estimadas,
        creador_id=current_user.id,
    )
    db.add(ot)
    await db.flush()

    reclamos = await _vincular_reclamos(db, ot, data.reclamo_ids, municipio_id)
    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_creada",
        comentario=f"Orden de trabajo {numero} creada: {data.titulo}",
    )

    if data.recursos:
        await _sincronizar_recursos(db, ot, data.recursos, municipio_id)

    await db.commit()
    ot = await _get_ot(db, ot.id, municipio_id)
    return _to_response(ot)


@router.put("/{ot_id}", response_model=OTResponse)
async def actualizar_orden(
    ot_id: int,
    data: OTUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    if ot.estado in ESTADOS_FINALES:
        raise HTTPException(status_code=400, detail="No se puede editar una OT completada o cancelada")

    await _validar_recursos(db, municipio_id, data.cuadrilla_id, data.empleado_id)

    campos = data.model_dump(exclude_unset=True, exclude={"reclamo_ids", "materiales"})
    for k, v in campos.items():
        setattr(ot, k, v)
    if data.materiales is not None:
        ot.materiales = [m.model_dump() for m in data.materiales]

    if data.reclamo_ids is not None:
        # Reemplazar vínculos: borrar los actuales y crear los nuevos
        for link in list(ot.reclamos_vinculados):
            await db.delete(link)
        await db.flush()
        await _vincular_reclamos(db, ot, data.reclamo_ids, municipio_id)

    if data.recursos is not None:
        await _sincronizar_recursos(db, ot, data.recursos, municipio_id)

    # Si estaba pendiente y ahora tiene responsable, pasa a asignada
    if ot.estado == EstadoOrdenTrabajo.PENDIENTE and (ot.cuadrilla_id or ot.empleado_id):
        ot.estado = EstadoOrdenTrabajo.ASIGNADA

    await db.commit()
    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)


@router.post("/{ot_id}/asignar", response_model=OTResponse)
async def asignar_orden(
    ot_id: int,
    data: OTAsignar,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    if not data.cuadrilla_id and not data.empleado_id:
        raise HTTPException(status_code=400, detail="Indicá una cuadrilla o un empleado responsable")
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    if ot.estado in ESTADOS_FINALES:
        raise HTTPException(status_code=400, detail="La OT ya está cerrada")

    await _validar_recursos(db, municipio_id, data.cuadrilla_id, data.empleado_id)

    ot.cuadrilla_id = data.cuadrilla_id if data.cuadrilla_id else ot.cuadrilla_id
    ot.empleado_id = data.empleado_id if data.empleado_id else ot.empleado_id
    if data.fecha_programada:
        ot.fecha_programada = data.fecha_programada
    if data.hora_inicio:
        ot.hora_inicio = data.hora_inicio
    if data.hora_fin:
        ot.hora_fin = data.hora_fin
    if ot.estado == EstadoOrdenTrabajo.PENDIENTE:
        ot.estado = EstadoOrdenTrabajo.ASIGNADA

    await db.commit()
    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)


@router.post("/{ot_id}/iniciar", response_model=OTResponse)
async def iniciar_orden(
    ot_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    if ot.estado != EstadoOrdenTrabajo.ASIGNADA:
        raise HTTPException(status_code=400, detail="Solo se puede iniciar una OT asignada")

    cuadrillas = await _cuadrillas_del_user(db, current_user)
    if not _puede_operar_en_campo(ot, current_user, cuadrillas):
        raise HTTPException(status_code=403, detail="No sos responsable de esta OT")

    ot.estado = EstadoOrdenTrabajo.EN_CURSO
    ot.fecha_inicio_real = datetime.utcnow()
    await db.commit()
    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)


@router.post("/{ot_id}/completar", response_model=OTResponse)
async def completar_orden(
    ot_id: int,
    data: OTCompletar,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    # Se permite completar desde asignada (en campo no siempre marcan "iniciar")
    if ot.estado not in (EstadoOrdenTrabajo.ASIGNADA, EstadoOrdenTrabajo.EN_CURSO):
        raise HTTPException(status_code=400, detail="La OT no está en un estado completable")

    cuadrillas = await _cuadrillas_del_user(db, current_user)
    if not _puede_operar_en_campo(ot, current_user, cuadrillas):
        raise HTTPException(status_code=403, detail="No sos responsable de esta OT")

    ot.estado = EstadoOrdenTrabajo.COMPLETADA
    ot.notas_cierre = data.notas_cierre
    ot.horas_reales = data.horas_reales
    ot.fecha_completada = datetime.utcnow()

    # Libera activos y descuenta el stock de los consumibles usados.
    await _cerrar_recursos(db, ot, municipio_id, descontar_consumos=True)

    reclamos = [link.reclamo for link in ot.reclamos_vinculados if link.reclamo]
    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_completada",
        comentario=f"Orden de trabajo {ot.numero} completada: {data.notas_cierre}",
    )

    await db.commit()
    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)


@router.post("/{ot_id}/cancelar", response_model=OTResponse)
async def cancelar_orden(
    ot_id: int,
    data: OTCancelar,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    if ot.estado in ESTADOS_FINALES:
        raise HTTPException(status_code=400, detail="La OT ya está cerrada")

    ot.estado = EstadoOrdenTrabajo.CANCELADA
    ot.motivo_cancelacion = data.motivo

    # Libera los activos reservados; NO descuenta consumibles (no se usaron).
    await _cerrar_recursos(db, ot, municipio_id, descontar_consumos=False)

    reclamos = [link.reclamo for link in ot.reclamos_vinculados if link.reclamo]
    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_cancelada",
        comentario=f"Orden de trabajo {ot.numero} cancelada: {data.motivo}",
    )

    await db.commit()
    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)
