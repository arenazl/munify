"""CRUD de configuracion de agenda de turnos por dependencia (Fase 2).

  - AgendaConfig: horarios de atencion por dependencia x dia (soporta horario partido).
  - AgendaExcepcion: feriados/cierres y aperturas especiales por fecha.

Auth JWT admin|supervisor, todo scopeado por el municipio del current_user.
Rutas con path completo (se registra sin prefix en api/__init__.py).
"""
from datetime import date, time
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import (
    User, RolUsuario, AgendaConfig, AgendaExcepcion, MunicipioDependencia,
)

router = APIRouter()


def _require_admin(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(403, "Sin permisos")


async def _dep_del_muni(db: AsyncSession, dependencia_id: int, muni_id: int) -> MunicipioDependencia:
    """Valida que la dependencia pertenezca al municipio del usuario (multi-tenant)."""
    dep = (await db.execute(
        select(MunicipioDependencia).where(
            MunicipioDependencia.id == dependencia_id,
            MunicipioDependencia.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not dep:
        raise HTTPException(404, "Dependencia no encontrada en este municipio")
    return dep


# ============================================================
# Schemas
# ============================================================

class AgendaDiaIn(BaseModel):
    dia_semana: int
    hora_inicio: time
    hora_fin: time
    cupo_max_por_slot: int = 1
    activo: bool = True


class AgendaConfigIn(BaseModel):
    dias: List[AgendaDiaIn]


class AgendaDiaOut(BaseModel):
    id: int
    dia_semana: int
    hora_inicio: time
    hora_fin: time
    cupo_max_por_slot: int
    activo: bool

    class Config:
        from_attributes = True


class ExcepcionIn(BaseModel):
    municipio_dependencia_id: int
    fecha: date
    tipo: str = "cierre"
    motivo: Optional[str] = None
    hora_inicio_override: Optional[time] = None
    hora_fin_override: Optional[time] = None


class ExcepcionPatch(BaseModel):
    fecha: Optional[date] = None
    tipo: Optional[str] = None
    motivo: Optional[str] = None
    hora_inicio_override: Optional[time] = None
    hora_fin_override: Optional[time] = None


class ExcepcionOut(BaseModel):
    id: int
    municipio_dependencia_id: int
    fecha: date
    tipo: str
    motivo: Optional[str] = None
    hora_inicio_override: Optional[time] = None
    hora_fin_override: Optional[time] = None

    class Config:
        from_attributes = True


# ============================================================
# AgendaConfig (horarios por dependencia)
# ============================================================

@router.get("/agenda-config", response_model=List[AgendaDiaOut])
async def listar_agenda_config(
    request: Request,
    dependencia_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    await _dep_del_muni(db, dependencia_id, muni_id)
    rows = (await db.execute(
        select(AgendaConfig)
        .where(AgendaConfig.municipio_dependencia_id == dependencia_id)
        .order_by(AgendaConfig.dia_semana, AgendaConfig.hora_inicio)
    )).scalars().all()
    return rows


@router.put("/agenda-config/{dependencia_id}")
async def guardar_agenda_config(
    dependencia_id: int,
    payload: AgendaConfigIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert COMPLETO y transaccional: reemplaza la agenda de la dependencia.
    Los dias no incluidos en el payload quedan sin configurar (caen al fallback)."""
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    await _dep_del_muni(db, dependencia_id, muni_id)

    # Validacion server-side (la critica marco no confiar solo en el front)
    for d in payload.dias:
        if not 0 <= d.dia_semana <= 6:
            raise HTTPException(400, f"dia_semana invalido: {d.dia_semana} (debe ser 0..6)")
        if d.cupo_max_por_slot < 1:
            raise HTTPException(400, "cupo_max_por_slot debe ser >= 1")
        if d.hora_inicio >= d.hora_fin:
            raise HTTPException(400, f"hora_inicio debe ser < hora_fin (dia {d.dia_semana})")

    # delete + insert en el mismo commit = atomico (sin ventana de agenda vacia)
    await db.execute(
        delete(AgendaConfig).where(AgendaConfig.municipio_dependencia_id == dependencia_id)
    )
    for d in payload.dias:
        db.add(AgendaConfig(
            municipio_id=muni_id,
            municipio_dependencia_id=dependencia_id,
            dia_semana=d.dia_semana,
            hora_inicio=d.hora_inicio,
            hora_fin=d.hora_fin,
            cupo_max_por_slot=d.cupo_max_por_slot,
            activo=d.activo,
        ))
    await db.commit()
    return {"ok": True, "configurados": len(payload.dias)}


# ============================================================
# AgendaExcepcion (feriados / aperturas especiales)
# ============================================================

@router.get("/agenda-excepciones", response_model=List[ExcepcionOut])
async def listar_excepciones(
    request: Request,
    dependencia_id: int = Query(...),
    desde: Optional[date] = None,
    hasta: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    await _dep_del_muni(db, dependencia_id, muni_id)
    q = select(AgendaExcepcion).where(
        AgendaExcepcion.municipio_dependencia_id == dependencia_id
    )
    if desde:
        q = q.where(AgendaExcepcion.fecha >= desde)
    if hasta:
        q = q.where(AgendaExcepcion.fecha <= hasta)
    rows = (await db.execute(q.order_by(AgendaExcepcion.fecha))).scalars().all()
    return rows


@router.post("/agenda-excepciones", response_model=ExcepcionOut)
async def crear_excepcion(
    payload: ExcepcionIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    await _dep_del_muni(db, payload.municipio_dependencia_id, muni_id)
    if payload.tipo not in ("cierre", "apertura_especial"):
        raise HTTPException(400, "tipo invalido (cierre | apertura_especial)")
    exc = AgendaExcepcion(
        municipio_id=muni_id,
        municipio_dependencia_id=payload.municipio_dependencia_id,
        fecha=payload.fecha,
        tipo=payload.tipo,
        motivo=payload.motivo,
        hora_inicio_override=payload.hora_inicio_override,
        hora_fin_override=payload.hora_fin_override,
    )
    db.add(exc)
    await db.commit()
    await db.refresh(exc)
    return exc


@router.patch("/agenda-excepciones/{exc_id}", response_model=ExcepcionOut)
async def editar_excepcion(
    exc_id: int,
    payload: ExcepcionPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    exc = (await db.execute(
        select(AgendaExcepcion).where(
            AgendaExcepcion.id == exc_id,
            AgendaExcepcion.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not exc:
        raise HTTPException(404, "Excepcion no encontrada")
    if payload.tipo is not None and payload.tipo not in ("cierre", "apertura_especial"):
        raise HTTPException(400, "tipo invalido")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(exc, k, v)
    await db.commit()
    await db.refresh(exc)
    return exc


@router.delete("/agenda-excepciones/{exc_id}")
async def borrar_excepcion(
    exc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    muni_id = get_effective_municipio_id(request, current_user)
    exc = (await db.execute(
        select(AgendaExcepcion).where(
            AgendaExcepcion.id == exc_id,
            AgendaExcepcion.municipio_id == muni_id,
        )
    )).scalar_one_or_none()
    if not exc:
        raise HTTPException(404, "Excepcion no encontrada")
    await db.delete(exc)
    await db.commit()
    return {"ok": True}
