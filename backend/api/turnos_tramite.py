"""API de turnos presenciales para tramites.

  - GET  /turnos/disponibilidad?solicitud_id=X o ?dependencia_id=X
  - POST /turnos/reservar { solicitud_id, fecha_hora }
  - GET  /turnos/agenda?dependencia_id=X&fecha=YYYY-MM-DD
  - DELETE /turnos/{turno_id}     (cancelar)

Disponibilidad calculada dinamicamente — sin tabla de slots:
  - Lunes a viernes 08:30 a 13:00 (fijo MVP, despues hacemos config por dep).
  - Slots cada `tramite.duracion_turno_min` (default 30min).
  - Excluye slots ya reservados (turnos.estado='reservado' en esa dep+hora).
"""
from datetime import datetime, timedelta, time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import re

from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.tramite import Solicitud, Tramite
from models.turno import Turno
from models.municipio_dependencia import MunicipioDependencia

from services.turnos_agenda import calcular_slots, reservar_turno


router = APIRouter(prefix="/turnos-tramite", tags=["Turnos Tramite"])


# Configuracion default (MVP). Despues hacemos por dependencia.
HORA_INICIO = time(8, 30)
HORA_FIN = time(13, 0)
DIAS_HABILES = {0, 1, 2, 3, 4}  # lun=0 ... vie=4


class SlotDisponible(BaseModel):
    fecha_hora: datetime
    disponible: bool
    motivo: Optional[str] = None  # "ocupado" cuando otro lo tomo
    cupo_total: Optional[int] = None
    cupo_restante: Optional[int] = None


class DisponibilidadResponse(BaseModel):
    dependencia_id: int
    dependencia_nombre: str
    duracion_min: int
    slots: List[SlotDisponible]


class ReservarRequest(BaseModel):
    solicitud_id: int
    fecha_hora: datetime


class TurnoResponse(BaseModel):
    id: int
    solicitud_id: Optional[int] = None  # nullable: turnos del bot / atencion general
    municipio_dependencia_id: int
    fecha_hora: datetime
    duracion_min: int
    estado: str
    dependencia_nombre: Optional[str] = None
    notas: Optional[str] = None
    motivo_tipo: Optional[str] = "tramite"
    nombre_solicitante: Optional[str] = None
    # Para la agenda del mostrador (check-in): quién viene y a qué
    dni_solicitante: Optional[str] = None
    tramite_nombre: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/disponibilidad", response_model=DisponibilidadResponse)
async def disponibilidad(
    solicitud_id: Optional[int] = Query(None),
    dependencia_id: Optional[int] = Query(None),
    duracion_min: Optional[int] = Query(None),
    desde: Optional[datetime] = Query(None),
    hasta: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista slots disponibles para una solicitud o dependencia.

    Si `solicitud_id` viene, usa la dependencia + duracion del tramite.
    Si `dependencia_id` viene, usa esa con duracion_min default 30.
    """
    if not solicitud_id and not dependencia_id:
        raise HTTPException(status_code=400, detail="Pasá solicitud_id o dependencia_id")

    dep_id: Optional[int] = dependencia_id
    duracion: int = duracion_min or 30

    if solicitud_id:
        q = await db.execute(
            select(Solicitud)
            .options(selectinload(Solicitud.tramite))
            .where(Solicitud.id == solicitud_id)
        )
        solicitud = q.scalar_one_or_none()
        if not solicitud:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        # Tenant/ownership: el vecino solo ve disponibilidad de SUS solicitudes;
        # el staff, solo de solicitudes de su municipio.
        if current_user.rol == RolUsuario.VECINO:
            if solicitud.solicitante_id != current_user.id:
                raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        elif current_user.municipio_id and solicitud.municipio_id != current_user.municipio_id:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if not solicitud.municipio_dependencia_id:
            raise HTTPException(status_code=400, detail="La solicitud no tiene dependencia asignada")
        dep_id = solicitud.municipio_dependencia_id
        if solicitud.tramite and solicitud.tramite.duracion_turno_min:
            duracion = solicitud.tramite.duracion_turno_min

    # Cargar dependencia
    qd = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(MunicipioDependencia.id == dep_id)
    )
    dep = qd.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")
    # Tenant: la dependencia tiene que ser del municipio del usuario
    if current_user.municipio_id and dep.municipio_id != current_user.municipio_id:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    # Rango: por default proximos 14 dias desde manana
    if not desde:
        desde = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    if not hasta:
        hasta = desde + timedelta(days=14)

    # Slots calculados por el servicio central: lee AgendaConfig (con fallback
    # historico lun-vie 08:30-13:00 si la dependencia no tiene config), excluye
    # feriados (AgendaExcepcion) y descuenta cupos. Reemplaza el hardcode anterior.
    raw = await calcular_slots(db, dep_id, duracion, desde, hasta)
    slots: List[SlotDisponible] = [
        SlotDisponible(
            fecha_hora=s["fecha_hora"],
            disponible=s["disponible"],
            motivo=None if s["disponible"] else "ocupado",
            cupo_total=s["cupo_total"],
            cupo_restante=s["cupo_restante"],
        )
        for s in raw
    ]

    nombre_dep = dep.dependencia.nombre if dep.dependencia else "Dependencia"
    return DisponibilidadResponse(
        dependencia_id=dep.id,
        dependencia_nombre=nombre_dep,
        duracion_min=duracion,
        slots=slots,
    )


@router.post("/reservar", response_model=TurnoResponse)
async def reservar(
    body: ReservarRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reserva un slot para una solicitud. Idempotente: si la solicitud ya
    tiene un turno reservado, lo devuelve (no crea otro)."""
    q = await db.execute(
        select(Solicitud)
        .options(selectinload(Solicitud.tramite))
        .where(Solicitud.id == body.solicitud_id)
    )
    solicitud = q.scalar_one_or_none()
    if not solicitud:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if not solicitud.municipio_dependencia_id:
        raise HTTPException(status_code=400, detail="La solicitud no tiene dependencia asignada")

    # Permisos: vecino solo lo suyo; staff del muni solo de su muni
    if current_user.rol == RolUsuario.VECINO and solicitud.solicitante_id != current_user.id:
        raise HTTPException(status_code=403, detail="No podes reservar turno para otra persona")
    if current_user.rol != RolUsuario.VECINO and current_user.municipio_id != solicitud.municipio_id:
        raise HTTPException(status_code=403, detail="No podes operar sobre otro municipio")

    # Idempotencia: si ya hay turno reservado para esta solicitud, devolver
    q_existente = await db.execute(
        select(Turno).where(
            Turno.solicitud_id == solicitud.id,
            Turno.estado == "reservado",
        )
    )
    existente = q_existente.scalar_one_or_none()
    if existente:
        return await _turno_to_response(db, existente)

    duracion = (
        solicitud.tramite.duracion_turno_min
        if solicitud.tramite and solicitud.tramite.duracion_turno_min
        else 30
    )

    # Reserva centralizada: valida el slot (dia/hora habil, no feriado) y
    # serializa check-de-cupo + insert con lock por slot (mata la race condition).
    turno = await reservar_turno(
        db,
        dep_id=solicitud.municipio_dependencia_id,
        municipio_id=solicitud.municipio_id,
        fecha_hora=body.fecha_hora,
        duracion=duracion,
        motivo_tipo="tramite",
        origen_id=solicitud.id,
        solicitud_id=solicitud.id,
    )
    return await _turno_to_response(db, turno)


@router.get("/agenda", response_model=List[TurnoResponse])
async def agenda(
    dependencia_id: Optional[int] = Query(None),
    fecha: Optional[str] = Query(None),  # YYYY-MM-DD
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve los turnos del día para una dependencia. Si no se pasa
    dependencia_id, usa la del supervisor logueado. Solo staff (la agenda
    lleva nombre y DNI de los vecinos — un vecino no puede leerla)."""
    if current_user.rol == RolUsuario.VECINO:
        raise HTTPException(status_code=403, detail="Solo staff del municipio")
    # FIX: el atributo real del User es municipio_dependencia_id
    # (dependencia_id no existía — 500 para supervisores de dependencia)
    if not dependencia_id and current_user.municipio_dependencia_id:
        dependencia_id = current_user.municipio_dependencia_id
    if not dependencia_id:
        raise HTTPException(status_code=400, detail="Falta dependencia_id")

    # Tenant: la dependencia tiene que ser del municipio del staff
    dep_ok = (await db.execute(
        select(MunicipioDependencia.id).where(
            MunicipioDependencia.id == dependencia_id,
            MunicipioDependencia.municipio_id == current_user.municipio_id,
        )
    )).scalar_one_or_none() if current_user.municipio_id else dependencia_id
    if not dep_ok:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")

    if fecha:
        try:
            fecha_dt = datetime.strptime(fecha, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato fecha invalido (YYYY-MM-DD)")
    else:
        fecha_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    fin = fecha_dt + timedelta(days=1)

    q = await db.execute(
        select(Turno)
        .options(
            selectinload(Turno.municipio_dependencia).selectinload(MunicipioDependencia.dependencia),
            selectinload(Turno.solicitud).selectinload(Solicitud.tramite),
        )
        .where(
            Turno.municipio_dependencia_id == dependencia_id,
            Turno.fecha_hora >= fecha_dt,
            Turno.fecha_hora < fin,
        )
        .order_by(Turno.fecha_hora.asc())
    )
    turnos = q.scalars().all()

    def _nombre(t: Turno) -> Optional[str]:
        # Turnos sin cuenta (bot/mostrador) traen el nombre propio; los de la
        # app lo heredan del snapshot de la solicitud. Antes esto no se
        # serializaba y el mostrador veía "Vecino" genérico en toda la agenda.
        if t.nombre_solicitante:
            return t.nombre_solicitante
        if t.solicitud and t.solicitud.nombre_solicitante:
            return f"{t.solicitud.nombre_solicitante} {t.solicitud.apellido_solicitante or ''}".strip()
        return None

    def _dni(t: Turno) -> Optional[str]:
        if t.dni_solicitante:
            return t.dni_solicitante
        return t.solicitud.dni_solicitante if t.solicitud else None

    return [
        TurnoResponse(
            id=t.id,
            solicitud_id=t.solicitud_id,
            municipio_dependencia_id=t.municipio_dependencia_id,
            fecha_hora=t.fecha_hora,
            duracion_min=t.duracion_min,
            estado=t.estado,
            dependencia_nombre=(
                t.municipio_dependencia.dependencia.nombre
                if t.municipio_dependencia and t.municipio_dependencia.dependencia
                else None
            ),
            notas=t.notas,
            motivo_tipo=t.motivo_tipo,
            nombre_solicitante=_nombre(t),
            dni_solicitante=_dni(t),
            tramite_nombre=(
                t.solicitud.tramite.nombre
                if t.solicitud and t.solicitud.tramite else None
            ),
        )
        for t in turnos
    ]


@router.get("/mis-turnos", response_model=List[TurnoResponse])
async def mis_turnos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Turnos del vecino logueado.

    Dos fuentes reconciliadas:
      1. Turnos reservados desde la app (vía sus solicitudes).
      2. Turnos hechos SIN cuenta (bot de WhatsApp / mostrador: solicitud_id
         NULL) que matcheen su identidad por DNI o teléfono normalizados.
         Cierra el hueco de identidad documentado en la spec del turnero.
    """
    sub = select(Solicitud.id).where(Solicitud.solicitante_id == current_user.id)

    # Identidad del vecino para reconciliar turnos sin cuenta
    condiciones_identidad = []
    dni_norm = re.sub(r"\D", "", current_user.dni or "")
    if dni_norm:
        condiciones_identidad.append(
            func.regexp_replace(Turno.dni_solicitante, "[^0-9]", "") == dni_norm
        )
    tel_norm = re.sub(r"\D", "", current_user.telefono or "")[-10:]
    if len(tel_norm) >= 8:
        # Sufijo de 10 dígitos: tolera +54/054/9 y prefijos de formato
        condiciones_identidad.append(
            func.regexp_replace(Turno.telefono_solicitante, "[^0-9]", "").like(f"%{tel_norm}")
        )

    filtro = Turno.solicitud_id.in_(sub)
    if condiciones_identidad:
        filtro = or_(
            filtro,
            and_(
                Turno.solicitud_id.is_(None),
                Turno.municipio_id == current_user.municipio_id,
                or_(*condiciones_identidad),
            ),
        )

    q = await db.execute(
        select(Turno)
        .options(
            selectinload(Turno.municipio_dependencia).selectinload(MunicipioDependencia.dependencia)
        )
        .where(filtro)
        .order_by(Turno.fecha_hora.desc())
    )
    return [
        TurnoResponse(
            id=t.id,
            solicitud_id=t.solicitud_id,
            municipio_dependencia_id=t.municipio_dependencia_id,
            fecha_hora=t.fecha_hora,
            duracion_min=t.duracion_min,
            estado=t.estado,
            dependencia_nombre=(
                t.municipio_dependencia.dependencia.nombre
                if t.municipio_dependencia and t.municipio_dependencia.dependencia
                else None
            ),
            notas=t.notas,
            motivo_tipo=t.motivo_tipo,
            nombre_solicitante=t.nombre_solicitante,
        )
        for t in q.scalars().all()
    ]


class EstadoTurnoIn(BaseModel):
    estado: str
    notas: Optional[str] = None


async def _es_turno_del_vecino(db: AsyncSession, turno: Turno, user: User) -> bool:
    """Ownership del vecino: turnos de SUS solicitudes, o turnos sin cuenta
    (bot/mostrador) que matcheen su DNI/teléfono normalizados."""
    if turno.solicitud_id:
        solicitante = (await db.execute(
            select(Solicitud.solicitante_id).where(Solicitud.id == turno.solicitud_id)
        )).scalar_one_or_none()
        return solicitante == user.id
    dni_user = re.sub(r"\D", "", user.dni or "")
    dni_turno = re.sub(r"\D", "", turno.dni_solicitante or "")
    if dni_user and dni_user == dni_turno:
        return True
    tel_user = re.sub(r"\D", "", user.telefono or "")[-10:]
    tel_turno = re.sub(r"\D", "", turno.telefono_solicitante or "")
    return len(tel_user) >= 8 and tel_turno.endswith(tel_user)


@router.patch("/{turno_id}", response_model=TurnoResponse)
async def marcar_estado(
    turno_id: int,
    body: EstadoTurnoIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca el estado del turno. Staff del muni: cualquier estado (presente=
    cumplido / ausente / cancelado). Vecino: SOLO cancelar y SOLO sus turnos
    (antes no se validaba ownership — cualquier vecino podía tocar turnos
    ajenos iterando ids)."""
    q = await db.execute(select(Turno).where(Turno.id == turno_id))
    turno = q.scalar_one_or_none()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if current_user.rol == RolUsuario.VECINO:
        if not await _es_turno_del_vecino(db, turno, current_user):
            raise HTTPException(status_code=404, detail="Turno no encontrado")
        if body.estado != "cancelado":
            raise HTTPException(status_code=403, detail="Solo podés cancelar tu turno")
    elif current_user.municipio_id != turno.municipio_id:
        raise HTTPException(status_code=403, detail="No podes operar sobre este turno")
    if body.estado not in ("reservado", "cumplido", "ausente", "cancelado"):
        raise HTTPException(status_code=400, detail="Estado invalido")
    turno.estado = body.estado
    if body.notas is not None:
        turno.notas = body.notas
    await db.commit()
    return await _turno_to_response(db, turno)


@router.delete("/{turno_id}")
async def cancelar(
    turno_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = await db.execute(select(Turno).where(Turno.id == turno_id))
    turno = q.scalar_one_or_none()
    if not turno:
        raise HTTPException(status_code=404, detail="Turno no encontrado")
    if current_user.rol == RolUsuario.VECINO:
        # Ownership: antes cualquier vecino podía cancelar turnos ajenos
        if not await _es_turno_del_vecino(db, turno, current_user):
            raise HTTPException(status_code=404, detail="Turno no encontrado")
    elif current_user.municipio_id != turno.municipio_id:
        raise HTTPException(status_code=403, detail="No podes cancelar este turno")
    turno.estado = "cancelado"
    await db.commit()
    return {"ok": True}


@router.get("/por-solicitud/{solicitud_id}", response_model=Optional[TurnoResponse])
async def por_solicitud(
    solicitud_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve el turno reservado de una solicitud (o null si no tiene)."""
    q = await db.execute(
        select(Turno)
        .options(
            selectinload(Turno.municipio_dependencia).selectinload(MunicipioDependencia.dependencia),
        )
        .where(
            Turno.solicitud_id == solicitud_id,
            Turno.estado == "reservado",
        )
        .order_by(Turno.created_at.desc())
        .limit(1)
    )
    t = q.scalar_one_or_none()
    if not t:
        return None
    return TurnoResponse(
        id=t.id,
        solicitud_id=t.solicitud_id,
        municipio_dependencia_id=t.municipio_dependencia_id,
        fecha_hora=t.fecha_hora,
        duracion_min=t.duracion_min,
        estado=t.estado,
        dependencia_nombre=(
            t.municipio_dependencia.dependencia.nombre
            if t.municipio_dependencia and t.municipio_dependencia.dependencia
            else None
        ),
        notas=t.notas,
    )


async def _turno_to_response(db: AsyncSession, t: Turno) -> TurnoResponse:
    # Cargar nombre dependencia
    qd = await db.execute(
        select(MunicipioDependencia)
        .options(selectinload(MunicipioDependencia.dependencia))
        .where(MunicipioDependencia.id == t.municipio_dependencia_id)
    )
    dep = qd.scalar_one_or_none()
    return TurnoResponse(
        id=t.id,
        solicitud_id=t.solicitud_id,
        municipio_dependencia_id=t.municipio_dependencia_id,
        fecha_hora=t.fecha_hora,
        duracion_min=t.duracion_min,
        estado=t.estado,
        dependencia_nombre=(
            dep.dependencia.nombre if dep and dep.dependencia else None
        ),
        notas=t.notas,
    )
