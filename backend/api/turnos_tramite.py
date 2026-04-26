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
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.tramite import Solicitud, Tramite
from models.turno import Turno
from models.municipio_dependencia import MunicipioDependencia


router = APIRouter(prefix="/turnos-tramite", tags=["Turnos Tramite"])


# Configuracion default (MVP). Despues hacemos por dependencia.
HORA_INICIO = time(8, 30)
HORA_FIN = time(13, 0)
DIAS_HABILES = {0, 1, 2, 3, 4}  # lun=0 ... vie=4


class SlotDisponible(BaseModel):
    fecha_hora: datetime
    disponible: bool
    motivo: Optional[str] = None  # "ocupado" cuando otro lo tomo


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
    solicitud_id: int
    municipio_dependencia_id: int
    fecha_hora: datetime
    duracion_min: int
    estado: str
    dependencia_nombre: Optional[str] = None
    notas: Optional[str] = None

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

    # Rango: por default proximos 14 dias desde manana
    if not desde:
        desde = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    if not hasta:
        hasta = desde + timedelta(days=14)

    # Turnos ya reservados en ese rango
    q_ocupados = await db.execute(
        select(Turno.fecha_hora).where(
            Turno.municipio_dependencia_id == dep_id,
            Turno.estado == "reservado",
            Turno.fecha_hora >= desde,
            Turno.fecha_hora <= hasta,
        )
    )
    ocupados = {row[0].replace(microsecond=0) for row in q_ocupados.all()}

    # Generar slots
    slots: List[SlotDisponible] = []
    cursor = desde
    while cursor <= hasta:
        if cursor.weekday() in DIAS_HABILES:
            slot_inicio = cursor.replace(
                hour=HORA_INICIO.hour, minute=HORA_INICIO.minute, second=0, microsecond=0
            )
            slot_fin_dia = cursor.replace(
                hour=HORA_FIN.hour, minute=HORA_FIN.minute, second=0, microsecond=0
            )
            while slot_inicio < slot_fin_dia:
                ocupado = slot_inicio.replace(microsecond=0) in ocupados
                slots.append(SlotDisponible(
                    fecha_hora=slot_inicio,
                    disponible=not ocupado,
                    motivo="ocupado" if ocupado else None,
                ))
                slot_inicio += timedelta(minutes=duracion)
        cursor += timedelta(days=1)

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

    # Verificar que el slot esté libre (race condition basico)
    q_ocupado = await db.execute(
        select(Turno).where(
            Turno.municipio_dependencia_id == solicitud.municipio_dependencia_id,
            Turno.fecha_hora == body.fecha_hora,
            Turno.estado == "reservado",
        )
    )
    if q_ocupado.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ese slot fue tomado por otra persona. Elegí otro.")

    duracion = (
        solicitud.tramite.duracion_turno_min
        if solicitud.tramite and solicitud.tramite.duracion_turno_min
        else 30
    )

    turno = Turno(
        solicitud_id=solicitud.id,
        municipio_dependencia_id=solicitud.municipio_dependencia_id,
        municipio_id=solicitud.municipio_id,
        fecha_hora=body.fecha_hora,
        duracion_min=duracion,
        estado="reservado",
    )
    db.add(turno)
    await db.commit()
    await db.refresh(turno)
    return await _turno_to_response(db, turno)


@router.get("/agenda", response_model=List[TurnoResponse])
async def agenda(
    dependencia_id: Optional[int] = Query(None),
    fecha: Optional[str] = Query(None),  # YYYY-MM-DD
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve los turnos del día para una dependencia. Si no se pasa
    dependencia_id, usa la del supervisor logueado."""
    if not dependencia_id and current_user.dependencia_id:
        dependencia_id = current_user.dependencia_id
    if not dependencia_id:
        raise HTTPException(status_code=400, detail="Falta dependencia_id")

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
        )
        for t in turnos
    ]


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
    if current_user.rol != RolUsuario.VECINO and current_user.municipio_id != turno.municipio_id:
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
