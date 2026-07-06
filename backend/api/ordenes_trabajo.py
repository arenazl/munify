"""Órdenes de trabajo (OT) — unidad formal del trabajo de campo.

Circuito: pendiente → asignada (cuadrilla y/o empleado) → en_curso → completada.
Cancelable en cualquier estado no final. N:M con reclamos (1 reclamo → N OTs,
N reclamos → 1 OT). Completar la OT NO cierra los reclamos: el reclamo mantiene
su circuito propio (resolver → confirmar supervisor → confirmar vecino).

Aditivo al flujo simple (Reclamo.empleado_id directo) — los munis chicos no
necesitan OTs. Frontend gated por municipio_modulos 'ordenes_trabajo' (opt-in).
"""
import logging
from datetime import datetime, date, time, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user, require_roles
from core.tenancy import resolve_municipio_id as get_effective_municipio_id
from models import (
    OrdenTrabajo, OrdenTrabajoReclamo, OrdenTrabajoTipo, EstadoOrdenTrabajo, PrioridadOT,
    OrigenOT, Reclamo, CategoriaReclamo, HistorialReclamo, Cuadrilla, Empleado, EmpleadoCuadrilla, User,
    InventarioItem, OrdenTrabajoRecurso, NaturalezaInventario, EstadoActivo, TipoRecursoOT,
)
from models.enums import RolUsuario, EstadoReclamo
from services.notificacion_service import NotificacionService
from services import push_service

router = APIRouter()
logger = logging.getLogger(__name__)

ESTADOS_FINALES = (EstadoOrdenTrabajo.COMPLETADA, EstadoOrdenTrabajo.CANCELADA)

# T6 · etiquetas legibles del motivo de bloqueo (map resiliente, regla dura #3:
# .get con fallback, nunca switch). El detalle libre lo agrega OTBloquear.motivo.
MOTIVO_BLOQUEO_LABELS = {
    "falta_material": "Falta de material",
    "clima": "Clima",
    "vecino_ausente": "Vecino ausente",
    "otro": "Otro",
}


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
    prioridad: PrioridadOT = PrioridadOT.MEDIA
    tipo_trabajo_id: Optional[int] = None
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
    prioridad: Optional[PrioridadOT] = None
    tipo_trabajo_id: Optional[int] = None
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


class ConsumoReal(BaseModel):
    """Cantidad realmente consumida de un recurso al cerrar la OT.

    `recurso_id` = OrdenTrabajoRecurso.id (la fila de recurso de la OT, tal como
    la expone RecursoResponse.id), NO el item de inventario."""
    recurso_id: int
    cantidad_real: float


class OTCompletar(BaseModel):
    notas_cierre: str
    horas_reales: Optional[float] = None
    # D4: opt-in para finalizar también los reclamos vinculados al cerrar la OT.
    finalizar_reclamos: bool = False
    # T6: consumo REAL por consumible (lo que de verdad se usó en campo). Si no
    # viene un recurso, se descuenta la cantidad PLANEADA (compat).
    consumos_reales: Optional[List[ConsumoReal]] = None


class OTBloquear(BaseModel):
    motivo_tipo: Literal["falta_material", "clima", "vecino_ausente", "otro"]
    motivo: Optional[str] = None


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
    prioridad: PrioridadOT = PrioridadOT.MEDIA
    tipo_trabajo_id: Optional[int] = None
    tipo_trabajo_nombre: Optional[str] = None
    tipo_trabajo_color: Optional[str] = None
    tipo_trabajo_icono: Optional[str] = None
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
        selectinload(OrdenTrabajo.tipo_trabajo),
        selectinload(OrdenTrabajo.reclamos_vinculados).selectinload(OrdenTrabajoReclamo.reclamo),
        selectinload(OrdenTrabajo.recursos).selectinload(OrdenTrabajoRecurso.item),
    )


def _orden_prioridad_ot():
    """ORDER BY por prioridad de la OT: urgente>alta>media>baja (F6·A6). La
    prioridad de la OT deja de ser decorativa — encabeza el orden de las listas;
    el desempate por antigüedad (created_at desc) lo agrega el caller."""
    return case(
        (OrdenTrabajo.prioridad == PrioridadOT.URGENTE, 4),
        (OrdenTrabajo.prioridad == PrioridadOT.ALTA, 3),
        (OrdenTrabajo.prioridad == PrioridadOT.MEDIA, 2),
        (OrdenTrabajo.prioridad == PrioridadOT.BAJA, 1),
        else_=0,
    ).desc()


def _to_response(ot: OrdenTrabajo) -> OTResponse:
    resp = OTResponse.model_validate(ot)
    if ot.cuadrilla:
        resp.cuadrilla_nombre = f"{ot.cuadrilla.nombre} {ot.cuadrilla.apellido or ''}".strip()
    if ot.empleado:
        resp.empleado_nombre = f"{ot.empleado.nombre} {ot.empleado.apellido or ''}".strip()
    if ot.tipo_trabajo:
        resp.tipo_trabajo_nombre = ot.tipo_trabajo.nombre
        resp.tipo_trabajo_color = ot.tipo_trabajo.color
        resp.tipo_trabajo_icono = ot.tipo_trabajo.icono
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


async def _validar_tipo_trabajo(db: AsyncSession, municipio_id: int, tipo_trabajo_id: Optional[int]):
    """El tipo de trabajo debe pertenecer al mismo municipio (anti cross-tenant)."""
    if not tipo_trabajo_id:
        return
    ok = (await db.execute(select(OrdenTrabajoTipo.id).where(
        OrdenTrabajoTipo.id == tipo_trabajo_id, OrdenTrabajoTipo.municipio_id == municipio_id,
    ))).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=400, detail="Tipo de trabajo inválido para este municipio")


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


# ---------------------- Notificaciones (F1 · matriz canónica) -------
#
# El módulo OT era 100% mudo. Acá conectamos los helpers ya existentes de
# services/notificacion_service.py (in-app + campanita, transaccional vía flush)
# y services/push_service.py (web-push, best-effort DESPUÉS del commit).
# Para OT la matriz sólo pide in-app+push (nunca WhatsApp): enviar_whatsapp=False.

async def _empleado_user_ids(db: AsyncSession, empleado_ids) -> List[int]:
    """User.id vinculados a un conjunto de empleado_id (para el web-push)."""
    ids = [e for e in empleado_ids if e]
    if not ids:
        return []
    rows = (await db.execute(
        select(User.id).where(User.empleado_id.in_(ids))
    )).scalars().all()
    return list(rows)


async def _destinatarios_ot(db: AsyncSession, ot: OrdenTrabajo) -> set:
    """empleado_id destino de una OT: responsable directo + miembros activos
    de la cuadrilla asignada (dedup por set)."""
    ids = set()
    if ot.empleado_id:
        ids.add(ot.empleado_id)
    if ot.cuadrilla_id:
        rows = (await db.execute(select(EmpleadoCuadrilla.empleado_id).where(
            EmpleadoCuadrilla.cuadrilla_id == ot.cuadrilla_id,
            EmpleadoCuadrilla.activo == True,  # noqa: E712
        ))).scalars().all()
        ids.update(rows)
    return ids


async def _notificar_ot_asignada_inapp(db: AsyncSession, ot: OrdenTrabajo) -> Optional[dict]:
    """In-app al responsable/miembros de cuadrilla de una OT recién asignada.
    Devuelve {user_ids, titulo, mensaje} (strings ya materializados) para
    disparar el web-push después del commit, o None si no hay destinatarios."""
    empleado_ids = await _destinatarios_ot(db, ot)
    if not empleado_ids:
        return None
    titulo = f"OT {ot.numero} asignada"
    mensaje = f"Te asignaron la orden {ot.numero}: {ot.titulo}"
    for emp_id in empleado_ids:
        await NotificacionService.notificar_empleado(
            db=db, empleado_id=emp_id, titulo=titulo, mensaje=mensaje,
            tipo="info", enviar_whatsapp=False,
        )
    user_ids = await _empleado_user_ids(db, empleado_ids)
    return {"user_ids": user_ids, "titulo": titulo, "mensaje": mensaje}


async def _push_a_users(db: AsyncSession, user_ids, titulo: str, mensaje: str, url: str):
    """Web-push best-effort a un conjunto de usuarios. Se llama DESPUÉS del
    commit: send_push_to_user ya degrada solo si no hay VAPID/suscripciones."""
    for uid in {u for u in user_ids if u}:
        try:
            await push_service.send_push_to_user(
                db=db, user_id=uid, title=titulo, body=mensaje, url=url,
            )
        except Exception:  # noqa: BLE001 — push nunca debe romper el flujo
            pass


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
                           descontar_consumos: bool, consumos_reales: Optional[dict] = None):
    """Al cerrar la OT: libera activos siempre; descuenta stock de
    consumibles sólo si `descontar_consumos` (completar sí, cancelar no).

    T6 · `consumos_reales` = {OrdenTrabajoRecurso.id: cantidad_real}. Para cada
    consumible con cantidad real informada se descuenta ESA (y el registro pasa a
    reflejarla); si no viene, cae a la PLANEADA (compat con el flujo previo)."""
    consumos_reales = consumos_reales or {}
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
        elif rec.tipo == TipoRecursoOT.CONSUMO and descontar_consumos and not rec.aplicado:
            real = consumos_reales.get(rec.id)
            cant = real if real is not None else rec.cantidad
            if cant is None or cant < 0:
                continue  # sin cantidad válida: no descuenta ni marca (compat planeada None)
            if real is not None:
                rec.cantidad = cant  # el registro refleja el consumo real informado
            if item.stock_actual is not None and cant:
                item.stock_actual = max(0.0, (item.stock_actual or 0) - cant)
            rec.aplicado = True


# ---------------------- OT universal · implícita 1:1 (F6) -----------
#
# Toda asignación de un reclamo a un empleado crea/actualiza por debajo una OT
# "implícita" (origen=IMPLICITA) 1:1 con ese reclamo. Es transparente: se filtra
# de las listas de OT (no es una OT "formal") y ESPEJA el estado de su reclamo.
# La creación es SILENCIOSA (el aviso de "reclamo asignado" ya lo manda
# reclamos.py — no se duplica). Se importa lazy desde reclamos.py /
# planificacion.py (sin ciclo: este módulo no importa esos).
#
# MODELO UNIVERSAL (D11) — la OT implícita corre para TODOS los munis por igual,
# SIN gate per-tenant. El modelo es uno solo; el flag 'ordenes_trabajo' es solo
# de superficie (qué ve el muni en el menú), NO ramifica el modelo. Que un muni
# no use el módulo OT no lo excluye del modelo: sus OT implícitas existen igual,
# transparentes, y no tocan tesorería (tablas distintas). Meter un `if muni` acá
# sería el primer paso a un modelo Frankenstein.
#
# GARANTÍA DURA — todos los hooks públicos (upsert/cancelar/espejar) pasan por
# _ot_implicita_segura, que la aplica en un solo lugar (SSoT):
#   AISLAMIENTO DEL FALLO: el trabajo sobre la OT corre en un savepoint
#   best-effort. Un fallo (incl. la race de _siguiente_numero) se contiene y
#   JAMÁS aborta la mutación del reclamo que disparó el hook — ningún tenant
#   puede comerse un 500 por la OT implícita.

# Espejo reclamo → OT implícita. Map resiliente (regla dura #3: .get, no switch).
_ESPEJO_ESTADO_OT = {
    EstadoReclamo.EN_CURSO: EstadoOrdenTrabajo.EN_CURSO,
    EstadoReclamo.FINALIZADO: EstadoOrdenTrabajo.COMPLETADA,
    EstadoReclamo.RESUELTO: EstadoOrdenTrabajo.COMPLETADA,
    EstadoReclamo.RECHAZADO: EstadoOrdenTrabajo.CANCELADA,
}


async def _ot_implicita_segura(db: AsyncSession, reclamo: Reclamo, trabajo, ctx: str) -> None:
    """Corre `trabajo` (callable async sin args, el laburo real sobre la OT) con la
    garantía del bloque de arriba. Nunca propaga: un fallo se loguea y se ignora
    (best-effort).

    Detalle fino: se flushea ANTES de abrir el savepoint para que la mutación del
    reclamo quede persistida en la transacción EXTERNA. Así, si el trabajo de la
    OT falla, el rollback del savepoint revierte solo la OT — nunca la asignación/
    cambio de estado del reclamo. El flush del reclamo, si fallara, sí propaga
    (es un error real del reclamo, no de la OT)."""
    await db.flush()
    try:
        async with db.begin_nested():
            await trabajo()
    except Exception:
        logger.warning(
            "OT implícita: '%s' falló para reclamo %s (best-effort, ignorado)",
            ctx, getattr(reclamo, "id", "?"), exc_info=True,
        )


def _prioridad_default_a_ot(valor: Optional[int]) -> PrioridadOT:
    """Mapea `categoria.prioridad_default` (Integer 1-5, 1=más urgente) al enum de
    la OT: 1-2→ALTA, 3→MEDIA, 4-5→BAJA. Sin valor → MEDIA. (F6·A6: el default de
    la categoría deja de ser fantasma — el create de la OT sí lo lee.)"""
    if valor is None:
        return PrioridadOT.MEDIA
    if valor <= 2:
        return PrioridadOT.ALTA
    if valor == 3:
        return PrioridadOT.MEDIA
    return PrioridadOT.BAJA


async def _prioridad_inicial_ot(db: AsyncSession, reclamo_ids: List[int],
                                municipio_id: int) -> PrioridadOT:
    """Prioridad inicial de una OT derivada de la categoría de sus reclamos. Toma
    el `prioridad_default` más urgente (menor valor 1-5) entre las categorías de
    los reclamos vinculados (multi-tenant: filtra por municipio). Sin reclamos,
    sin categoría o sin valor → MEDIA. Un solo query, sin N+1."""
    ids = [rid for rid in reclamo_ids if rid is not None]
    if not ids:
        return PrioridadOT.MEDIA
    valor = (await db.execute(
        select(func.min(CategoriaReclamo.prioridad_default))
        .join(Reclamo, Reclamo.categoria_id == CategoriaReclamo.id)
        .where(Reclamo.id.in_(ids), Reclamo.municipio_id == municipio_id)
    )).scalar_one_or_none()
    return _prioridad_default_a_ot(valor)


async def crear_ot_core(
    db: AsyncSession, *, municipio_id: int, creador_id: int, titulo: str,
    descripcion: Optional[str] = None, prioridad: Optional[PrioridadOT] = None,
    tipo_trabajo_id: Optional[int] = None, reclamo_ids: Optional[List[int]] = None,
    cuadrilla_id: Optional[int] = None, empleado_id: Optional[int] = None,
    fecha_programada: Optional[date] = None, hora_inicio: Optional[time] = None,
    hora_fin: Optional[time] = None, materiales=None,
    horas_estimadas: Optional[float] = None, origen: OrigenOT = OrigenOT.MANUAL,
) -> tuple:
    """Crea una OT (manual o implícita) y la vincula a sus reclamos. NO commitea,
    NO notifica y NO toca recursos/historial — eso lo decide el caller. Devuelve
    (ot, reclamos) con la OT flusheada (ya tiene id).

    PRECONDICIÓN del caller: empleado_id/cuadrilla_id deben pertenecer a
    municipio_id. `crear_orden` lo valida con _validar_recursos; el path de OT
    implícita hereda el empleado ya validado en el call site (reclamos.py /
    planificacion.py). No se revalida acá para no duplicar el query en el hot path.

    `prioridad=None` (default): se deriva del `prioridad_default` de la categoría de
    los reclamos vinculados (F6·A6); sin categoría/valor cae a MEDIA. Los callers
    que fijan una prioridad explícita (create manual desde el Sheet) la respetan."""
    numero = await _siguiente_numero(db, municipio_id)
    if prioridad is None:
        prioridad = await _prioridad_inicial_ot(db, reclamo_ids or [], municipio_id)
    estado = (
        EstadoOrdenTrabajo.ASIGNADA
        if (cuadrilla_id or empleado_id)
        else EstadoOrdenTrabajo.PENDIENTE
    )
    ot = OrdenTrabajo(
        municipio_id=municipio_id, numero=numero, estado=estado, origen=origen,
        titulo=titulo, descripcion=descripcion, prioridad=prioridad,
        tipo_trabajo_id=tipo_trabajo_id, cuadrilla_id=cuadrilla_id, empleado_id=empleado_id,
        fecha_programada=fecha_programada, hora_inicio=hora_inicio, hora_fin=hora_fin,
        materiales=materiales, horas_estimadas=horas_estimadas, creador_id=creador_id,
    )
    db.add(ot)
    await db.flush()
    reclamos = await _vincular_reclamos(db, ot, reclamo_ids or [], municipio_id)
    return ot, reclamos


async def _ot_implicita_de(db: AsyncSession, reclamo_id: int, municipio_id: int,
                           incluir_finales: bool = False) -> Optional[OrdenTrabajo]:
    """La OT implícita 1:1 del reclamo (o None). Por defecto solo la vigente
    (no completada/cancelada). Carga recursos para poder cerrarlos sin lazy-load."""
    q = (
        select(OrdenTrabajo)
        .options(selectinload(OrdenTrabajo.recursos))
        .join(OrdenTrabajoReclamo, OrdenTrabajoReclamo.orden_trabajo_id == OrdenTrabajo.id)
        .where(
            OrdenTrabajoReclamo.reclamo_id == reclamo_id,
            OrdenTrabajo.municipio_id == municipio_id,
            OrdenTrabajo.origen == OrigenOT.IMPLICITA,
        )
        .order_by(OrdenTrabajo.id.desc())
    )
    if not incluir_finales:
        q = q.where(OrdenTrabajo.estado.notin_(ESTADOS_FINALES))
    return (await db.execute(q.limit(1))).scalars().first()


async def _upsert_ot_implicita_core(db: AsyncSession, reclamo: Reclamo,
                                    empleado_id: int, creador_id: int) -> OrdenTrabajo:
    # PRECONDICIÓN: empleado_id ya viene validado ↔ reclamo.municipio_id por el
    # call site (asignar_empleado / asignar_fecha_reclamo / auto_asignar_reclamo).
    ot = await _ot_implicita_de(db, reclamo.id, reclamo.municipio_id)
    if ot is None:
        ot, _ = await crear_ot_core(
            db, municipio_id=reclamo.municipio_id, creador_id=creador_id,
            titulo=reclamo.titulo, descripcion=reclamo.descripcion,
            reclamo_ids=[reclamo.id], empleado_id=empleado_id,
            fecha_programada=reclamo.fecha_programada, hora_inicio=reclamo.hora_inicio,
            hora_fin=reclamo.hora_fin, origen=OrigenOT.IMPLICITA,
        )
    else:
        ot.empleado_id = empleado_id
        ot.fecha_programada = reclamo.fecha_programada
        ot.hora_inicio = reclamo.hora_inicio
        ot.hora_fin = reclamo.hora_fin
    # Estado de la OT = espejo del reclamo, o ASIGNADA si el reclamo no mapea.
    ot.estado = _ESPEJO_ESTADO_OT.get(reclamo.estado, EstadoOrdenTrabajo.ASIGNADA)
    return ot


async def upsert_ot_implicita(db: AsyncSession, reclamo: Reclamo,
                              empleado_id: int, creador_id: int) -> None:
    """Hook: crea/actualiza la OT implícita 1:1 de un reclamo recién asignado.
    Silenciosa (no notifica). Gate + best-effort vía _ot_implicita_segura."""
    await _ot_implicita_segura(
        db, reclamo,
        lambda: _upsert_ot_implicita_core(db, reclamo, empleado_id, creador_id),
        ctx="upsert",
    )


async def _cancelar_ot_implicita_core(db: AsyncSession, reclamo: Reclamo, motivo: str) -> None:
    ot = await _ot_implicita_de(db, reclamo.id, reclamo.municipio_id)
    if ot is None:
        return
    ot.estado = EstadoOrdenTrabajo.CANCELADA
    ot.motivo_cancelacion = motivo
    ot.empleado_id = None
    if ot.recursos:
        await _cerrar_recursos(db, ot, reclamo.municipio_id, descontar_consumos=False)


async def cancelar_ot_implicita(db: AsyncSession, reclamo: Reclamo,
                                motivo: str = "Reclamo desasignado") -> None:
    """Hook: al desasignar/reasignar (el reclamo vuelve al pool), cancela la OT
    implícita vigente y libera sus recursos. Gate + best-effort. No-op si no hay
    OT implícita."""
    await _ot_implicita_segura(
        db, reclamo,
        lambda: _cancelar_ot_implicita_core(db, reclamo, motivo),
        ctx="cancelar",
    )


async def _espejar_ot_implicita_core(db: AsyncSession, reclamo: Reclamo) -> None:
    destino = _ESPEJO_ESTADO_OT.get(reclamo.estado)
    if destino is None:
        return
    ot = await _ot_implicita_de(db, reclamo.id, reclamo.municipio_id)
    if ot is None:
        return
    ot.estado = destino
    if destino == EstadoOrdenTrabajo.COMPLETADA and not ot.fecha_completada:
        ot.fecha_completada = datetime.now(timezone.utc)
        if ot.recursos:
            await _cerrar_recursos(db, ot, reclamo.municipio_id, descontar_consumos=True)
    elif destino == EstadoOrdenTrabajo.CANCELADA:
        if not ot.motivo_cancelacion:
            ot.motivo_cancelacion = "Reclamo rechazado"
        if ot.recursos:
            await _cerrar_recursos(db, ot, reclamo.municipio_id, descontar_consumos=False)


async def espejar_ot_implicita(db: AsyncSession, reclamo: Reclamo) -> None:
    """Hook: espeja el estado del reclamo en su OT implícita vigente. Idempotente;
    no-op si no hay OT o el estado no mapea. Solo toca OTs origen=IMPLICITA (las
    manuales/consolidadas conservan su ciclo propio). Gate + best-effort."""
    await _ot_implicita_segura(
        db, reclamo,
        lambda: _espejar_ot_implicita_core(db, reclamo),
        ctx="espejar",
    )


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
    # Las OT implícitas (espejo 1:1 de un reclamo asignado) son transparentes:
    # nunca se listan como OTs formales.
    query = _query_base().where(
        OrdenTrabajo.municipio_id == municipio_id,
        OrdenTrabajo.origen != OrigenOT.IMPLICITA,
    )

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

    query = query.order_by(_orden_prioridad_ot(), OrdenTrabajo.created_at.desc()).offset(skip).limit(limit)
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
            OrdenTrabajo.origen != OrigenOT.IMPLICITA,
        )
        .order_by(_orden_prioridad_ot(), OrdenTrabajo.created_at.desc())
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
    await _validar_tipo_trabajo(db, municipio_id, data.tipo_trabajo_id)

    ot, reclamos = await crear_ot_core(
        db, municipio_id=municipio_id, creador_id=current_user.id,
        titulo=data.titulo, descripcion=data.descripcion, prioridad=data.prioridad,
        tipo_trabajo_id=data.tipo_trabajo_id, reclamo_ids=data.reclamo_ids,
        cuadrilla_id=data.cuadrilla_id, empleado_id=data.empleado_id,
        fecha_programada=data.fecha_programada, hora_inicio=data.hora_inicio,
        hora_fin=data.hora_fin,
        materiales=[m.model_dump() for m in data.materiales] if data.materiales else None,
        horas_estimadas=data.horas_estimadas, origen=OrigenOT.MANUAL,
    )
    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_creada",
        comentario=f"Orden de trabajo {ot.numero} creada: {data.titulo}",
    )

    if data.recursos:
        await _sincronizar_recursos(db, ot, data.recursos, municipio_id)

    # Si nació ya asignada, avisar al responsable/cuadrilla (matriz: OT asignada).
    push_asig = None
    if ot.estado == EstadoOrdenTrabajo.ASIGNADA:
        push_asig = await _notificar_ot_asignada_inapp(db, ot)

    await db.commit()

    if push_asig:
        await _push_a_users(db, push_asig["user_ids"], push_asig["titulo"],
                            push_asig["mensaje"], "/gestion/ordenes-trabajo")

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
    if "tipo_trabajo_id" in data.model_dump(exclude_unset=True):
        await _validar_tipo_trabajo(db, municipio_id, data.tipo_trabajo_id)

    # prioridad/tipo_trabajo_id son escalares → se setean acá directo.
    # reclamo_ids/materiales/recursos se manejan aparte (no son columnas simples).
    campos = data.model_dump(exclude_unset=True, exclude={"reclamo_ids", "materiales", "recursos"})
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

    # Avisar al nuevo responsable / miembros de cuadrilla (matriz: OT asignada).
    push_asig = await _notificar_ot_asignada_inapp(db, ot)

    await db.commit()

    if push_asig:
        await _push_a_users(db, push_asig["user_ids"], push_asig["titulo"],
                            push_asig["mensaje"], "/gestion/ordenes-trabajo")

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

    numero = ot.numero
    reclamos = [link.reclamo for link in ot.reclamos_vinculados if link.reclamo]

    # D3: los reclamos que todavía no arrancaron pasan a EN_CURSO (con miga en
    # historial). No tocamos reclamos ya en un estado más avanzado.
    ESTADOS_PREVIOS = (EstadoReclamo.RECIBIDO, EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO)
    a_curso = [r for r in reclamos if r.estado in ESTADOS_PREVIOS]
    for r in a_curso:
        r.estado = EstadoReclamo.EN_CURSO
    if a_curso:
        _historial_reclamos(
            db, a_curso, current_user.id,
            accion="ot_iniciada",
            comentario=f"La orden {numero} comenzó: el reclamo pasó a en curso.",
        )

    # Avisar al vecino creador de cada reclamo vinculado ("comenzó el trabajo").
    # In-app transaccional; el web-push se dispara tras el commit.
    push_vecinos = []  # (creador_id, reclamo_id)
    for r in reclamos:
        await NotificacionService.notificar_vecino(
            db=db, reclamo=r,
            titulo="Comenzó el trabajo en tu reclamo",
            mensaje=f"Un equipo municipal comenzó a trabajar en tu reclamo #{r.id} (orden {numero}).",
            tipo="info", enviar_whatsapp=False,
        )
        if r.creador_id:
            push_vecinos.append((r.creador_id, r.id))

    await db.commit()

    for uid, rid in push_vecinos:
        await _push_a_users(
            db, [uid], "Comenzó el trabajo en tu reclamo",
            f"Un equipo municipal comenzó a trabajar en tu reclamo #{rid}.",
            f"/gestion/reclamos/{rid}",
        )

    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)


@router.post("/{ot_id}/bloquear", response_model=OTResponse)
async def bloquear_orden(
    ot_id: int,
    data: OTBloquear,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"])),
):
    """T6 · el empleado en campo marca la OT como BLOQUEADA (frenada: falta
    material, clima, vecino ausente, otro). Estado NO final — luego se completa o
    se cancela. Operable por _puede_operar_en_campo (responsable/miembro de
    cuadrilla + admin/supervisor). Avisa a los supervisores del muni (una
    notificación)."""
    municipio_id = get_effective_municipio_id(request, current_user)
    ot = await _get_ot(db, ot_id, municipio_id)
    if ot.estado not in (EstadoOrdenTrabajo.ASIGNADA, EstadoOrdenTrabajo.EN_CURSO):
        raise HTTPException(status_code=400, detail="Solo se puede bloquear una OT asignada o en curso")

    cuadrillas = await _cuadrillas_del_user(db, current_user)
    if not _puede_operar_en_campo(ot, current_user, cuadrillas):
        raise HTTPException(status_code=403, detail="No sos responsable de esta OT")

    label = MOTIVO_BLOQUEO_LABELS.get(data.motivo_tipo, data.motivo_tipo)
    detalle = f"Bloqueada · {label}"
    if data.motivo and data.motivo.strip():
        detalle += f": {data.motivo.strip()}"

    ot.estado = EstadoOrdenTrabajo.BLOQUEADA
    # Reusa motivo_cancelacion como campo de motivo del bloqueo (no hay columna
    # dedicada; si luego se cancela/completa, ese flujo lo sobrescribe).
    ot.motivo_cancelacion = detalle

    numero = ot.numero
    reclamos = [link.reclamo for link in ot.reclamos_vinculados if link.reclamo]
    primer_reclamo_id = reclamos[0].id if reclamos else None

    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_bloqueada",
        comentario=f"Orden de trabajo {numero} bloqueada: {detalle}",
    )

    # Avisar a supervisores del muni (matriz: OT bloqueada → supervisores).
    titulo = f"OT {numero} bloqueada"
    mensaje = f"La orden {numero} quedó bloqueada: {detalle}"
    notificados = await NotificacionService.notificar_supervisores(
        db=db, municipio_id=municipio_id, titulo=titulo, mensaje=mensaje,
        tipo="warning", reclamo_id=primer_reclamo_id, enviar_whatsapp=False,
    )

    await db.commit()

    await _push_a_users(db, notificados, titulo, mensaje, "/gestion/ordenes-trabajo")

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
    # Se permite completar desde asignada (en campo no siempre marcan "iniciar") y
    # desde bloqueada (T6: el bloqueo se resolvió y el trabajo terminó).
    if ot.estado not in (EstadoOrdenTrabajo.ASIGNADA, EstadoOrdenTrabajo.EN_CURSO,
                         EstadoOrdenTrabajo.BLOQUEADA):
        raise HTTPException(status_code=400, detail="La OT no está en un estado completable")

    cuadrillas = await _cuadrillas_del_user(db, current_user)
    if not _puede_operar_en_campo(ot, current_user, cuadrillas):
        raise HTTPException(status_code=403, detail="No sos responsable de esta OT")

    ot.estado = EstadoOrdenTrabajo.COMPLETADA
    ot.notas_cierre = data.notas_cierre
    ot.horas_reales = data.horas_reales
    ot.fecha_completada = datetime.utcnow()

    # Libera activos y descuenta el stock de los consumibles usados. T6: si el
    # cierre trae consumo real por recurso, se descuenta ese; si no, el planeado.
    consumos_map = (
        {c.recurso_id: c.cantidad_real for c in data.consumos_reales}
        if data.consumos_reales else None
    )
    await _cerrar_recursos(db, ot, municipio_id, descontar_consumos=True,
                           consumos_reales=consumos_map)

    numero = ot.numero
    creador_id = ot.creador_id
    reclamos = [link.reclamo for link in ot.reclamos_vinculados if link.reclamo]
    n_recl = len(reclamos)
    primer_reclamo_id = reclamos[0].id if reclamos else None

    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_completada",
        comentario=f"Orden de trabajo {numero} completada: {data.notas_cierre}",
    )

    # D4: opt-in para finalizar también los reclamos vinculados. No tocamos los
    # que ya estén cerrados (finalizado/resuelto/rechazado).
    finalizados_ids = []
    if data.finalizar_reclamos:
        CERRADOS = (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO, EstadoReclamo.RECHAZADO)
        a_finalizar = [r for r in reclamos if r.estado not in CERRADOS]
        for r in a_finalizar:
            r.estado = EstadoReclamo.FINALIZADO
            r.fecha_resolucion = datetime.now(timezone.utc)
            finalizados_ids.append(r.id)
        if a_finalizar:
            _historial_reclamos(
                db, a_finalizar, current_user.id,
                accion="ot_finalizo_reclamo",
                comentario=f"Finalizado al completar la orden {numero}.",
            )

    # Avisar al creador de la OT + supervisores del muni ("OT lista, cerrá los N").
    titulo = f"OT {numero} completada"
    if finalizados_ids:
        mensaje = f"La orden {numero} se completó y se finalizaron {len(finalizados_ids)} reclamo(s) vinculado(s)."
    else:
        mensaje = f"La orden {numero} está lista. Revisá y cerrá los {n_recl} reclamo(s) vinculado(s)."

    notificados = await NotificacionService.notificar_supervisores(
        db=db, municipio_id=municipio_id, titulo=titulo, mensaje=mensaje,
        tipo="info", reclamo_id=primer_reclamo_id, enviar_whatsapp=False,
    )
    if creador_id and creador_id not in notificados:
        await NotificacionService.crear_notificacion_inapp(
            db=db, usuario_id=creador_id, titulo=titulo, mensaje=mensaje,
            tipo="info", reclamo_id=primer_reclamo_id,
        )

    await db.commit()

    # Web-push best-effort (fuera de la transacción).
    push_ids = set(notificados)
    if creador_id:
        push_ids.add(creador_id)
    await _push_a_users(db, push_ids, titulo, mensaje, "/gestion/reclamos")

    # Vecinos de los reclamos finalizados: in-app con link a calificar + push
    # (reusa el helper canónico de cierre; re-fetch fresco tras el commit).
    for rid in finalizados_ids:
        r = (await db.execute(select(Reclamo).where(Reclamo.id == rid))).scalar_one_or_none()
        if r:
            await push_service.notificar_reclamo_resuelto(db, r)

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

    numero = ot.numero
    reclamos = [link.reclamo for link in ot.reclamos_vinculados if link.reclamo]
    primer_reclamo_id = reclamos[0].id if reclamos else None

    _historial_reclamos(
        db, reclamos, current_user.id,
        accion="ot_cancelada",
        comentario=f"Orden de trabajo {numero} cancelada: {data.motivo}",
    )

    # Avisar a supervisores del muni (matriz: OT cancelada → supervisores).
    titulo = f"OT {numero} cancelada"
    mensaje = f"La orden {numero} fue cancelada: {data.motivo}"
    notificados = await NotificacionService.notificar_supervisores(
        db=db, municipio_id=municipio_id, titulo=titulo, mensaje=mensaje,
        tipo="warning", reclamo_id=primer_reclamo_id, enviar_whatsapp=False,
    )

    await db.commit()

    await _push_a_users(db, notificados, titulo, mensaje, "/gestion/ordenes-trabajo")

    ot = await _get_ot(db, ot_id, municipio_id)
    return _to_response(ot)
