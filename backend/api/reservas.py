"""Reservas — modulo Recursos, Etapa 3.

Prestar el salon, la cancha, el camion de agua. Lo que el cuaderno no puede
hacer y por eso se superpone: avisar que ese dia ya esta tomado.

Endpoints:
  GET  /reservas/disponibles        que se puede pedir (publico, para el vecino)
  GET  /reservas                    las reservas del muni (gestion)
  POST /reservas                    pedir / cargar una reserva
  POST /reservas/{id}/aprobar       aprobar
  POST /reservas/{id}/rechazar      rechazar, con motivo
  POST /reservas/{id}/cancelar      dar de baja una aprobada
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import InventarioItem, Reserva, RolUsuario, User

router = APIRouter()

# Estados que OCUPAN el bien. Una rechazada o cancelada no bloquea: si no,
# un "no" del municipio dejaria el salon trabado para siempre.
OCUPAN = ("solicitada", "aprobada")


def _require_gestor(user: User):
    if user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar reservas")


class ReservaCreate(BaseModel):
    item_id: int
    solicitante_nombre: str = Field(..., min_length=1, max_length=150)
    solicitante_telefono: Optional[str] = None
    fecha_desde: date
    fecha_hasta: date
    motivo: Optional[str] = None

    @field_validator("fecha_hasta")
    @classmethod
    def _rango_valido(cls, v: date, info):
        desde = info.data.get("fecha_desde")
        if desde and v < desde:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return v


class RechazoIn(BaseModel):
    # Obligatorio: un "no" sin motivo hace que el vecino vuelva a preguntar
    # por otro canal, y el municipio pierde el registro de por que dijo que no.
    motivo: str = Field(..., min_length=3)


class ReservaResponse(BaseModel):
    id: int
    item_id: int
    item_nombre: Optional[str] = None
    solicitante_nombre: str
    solicitante_telefono: Optional[str] = None
    fecha_desde: date
    fecha_hasta: date
    motivo: Optional[str] = None
    estado: str
    motivo_rechazo: Optional[str] = None
    created_at: Optional[datetime] = None


class BienDisponible(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    # Los dias que ya estan tomados, para que el vecino no pida uno ocupado.
    ocupado_desde: List[date] = []


async def _item_reservable(db: AsyncSession, item_id: int, municipio_id: int) -> InventarioItem:
    r = await db.execute(
        select(InventarioItem).where(
            InventarioItem.id == item_id,
            InventarioItem.municipio_id == municipio_id,
            InventarioItem.activo == True,  # noqa: E712
        )
    )
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="El bien no existe")
    if not item.reservable:
        raise HTTPException(status_code=400, detail=f"{item.nombre} no esta habilitado para prestarse")
    return item


async def _hay_superposicion(
    db: AsyncSession, item_id: int, desde: date, hasta: date, excluir_id: Optional[int] = None
) -> Optional[Reserva]:
    """La reserva que pisa el rango pedido, o None.

    Dos rangos se pisan si uno empieza antes de que el otro termine y termina
    despues de que el otro empieza. Es la unica regla, y va en el backend: la
    pantalla puede olvidarse de chequearla, la base no.
    """
    cond = [
        Reserva.item_id == item_id,
        Reserva.estado.in_(OCUPAN),
        Reserva.activo == True,  # noqa: E712
        and_(Reserva.fecha_desde <= hasta, Reserva.fecha_hasta >= desde),
    ]
    if excluir_id:
        cond.append(Reserva.id != excluir_id)
    r = await db.execute(select(Reserva).where(*cond).limit(1))
    return r.scalar_one_or_none()


@router.get("/disponibles", response_model=List[BienDisponible])
async def disponibles(
    municipio_id: int = Query(..., description="Municipio del vecino"),
    db: AsyncSession = Depends(get_db),
):
    """Que se puede pedir. Publico: el vecino lo consulta antes de pedir."""
    r = await db.execute(
        select(InventarioItem).where(
            InventarioItem.municipio_id == municipio_id,
            InventarioItem.reservable == True,  # noqa: E712
            InventarioItem.activo == True,  # noqa: E712
        )
    )
    bienes = r.scalars().all()
    if not bienes:
        return []

    hoy = date.today()
    rr = await db.execute(
        select(Reserva).where(
            Reserva.item_id.in_([b.id for b in bienes]),
            Reserva.estado.in_(OCUPAN),
            Reserva.activo == True,  # noqa: E712
            Reserva.fecha_hasta >= hoy,
        )
    )
    tomadas: dict[int, list] = {}
    for res in rr.scalars().all():
        tomadas.setdefault(res.item_id, []).append(res.fecha_desde)

    return [
        BienDisponible(
            id=b.id, nombre=b.nombre, descripcion=b.descripcion,
            ocupado_desde=sorted(tomadas.get(b.id, [])),
        )
        for b in bienes
    ]


@router.get("", response_model=List[ReservaResponse])
async def listar(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    r = await db.execute(
        select(Reserva, InventarioItem.nombre)
        .join(InventarioItem, Reserva.item_id == InventarioItem.id)
        .where(Reserva.municipio_id == municipio_id, Reserva.activo == True)  # noqa: E712
        .order_by(Reserva.fecha_desde.desc())
    )
    return [
        ReservaResponse(
            id=res.id, item_id=res.item_id, item_nombre=nombre,
            solicitante_nombre=res.solicitante_nombre,
            solicitante_telefono=res.solicitante_telefono,
            fecha_desde=res.fecha_desde, fecha_hasta=res.fecha_hasta,
            motivo=res.motivo, estado=res.estado,
            motivo_rechazo=res.motivo_rechazo, created_at=res.created_at,
        )
        for res, nombre in r.all()
    ]


@router.post("", response_model=ReservaResponse, status_code=201)
async def crear(
    data: ReservaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pide un bien. Lo usa el vecino desde la app y el mostrador por telefono.

    Si el bien ya esta tomado esos dias, se rechaza ACA con el dato de quien
    lo tiene: enterarse despues es el problema que este modulo resuelve.
    """
    municipio_id = current_user.municipio_id or get_effective_municipio_id(request, current_user)
    item = await _item_reservable(db, data.item_id, municipio_id)

    choque = await _hay_superposicion(db, data.item_id, data.fecha_desde, data.fecha_hasta)
    if choque:
        raise HTTPException(
            status_code=409,
            detail=f"{item.nombre} ya esta reservado del {choque.fecha_desde.strftime('%d/%m')} "
                   f"al {choque.fecha_hasta.strftime('%d/%m')}",
        )

    reserva = Reserva(
        municipio_id=municipio_id,
        item_id=data.item_id,
        solicitante_id=current_user.id,
        solicitante_nombre=data.solicitante_nombre.strip(),
        solicitante_telefono=data.solicitante_telefono,
        fecha_desde=data.fecha_desde,
        fecha_hasta=data.fecha_hasta,
        motivo=data.motivo,
        estado="solicitada",
    )
    db.add(reserva)
    await db.commit()
    await db.refresh(reserva)
    return ReservaResponse(
        id=reserva.id, item_id=reserva.item_id, item_nombre=item.nombre,
        solicitante_nombre=reserva.solicitante_nombre,
        solicitante_telefono=reserva.solicitante_telefono,
        fecha_desde=reserva.fecha_desde, fecha_hasta=reserva.fecha_hasta,
        motivo=reserva.motivo, estado=reserva.estado, created_at=reserva.created_at,
    )


async def _traer(db: AsyncSession, reserva_id: int, municipio_id: int) -> Reserva:
    r = await db.execute(
        select(Reserva).where(Reserva.id == reserva_id, Reserva.municipio_id == municipio_id)
    )
    reserva = r.scalar_one_or_none()
    if not reserva:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    return reserva


@router.post("/{reserva_id}/aprobar")
async def aprobar(
    reserva_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aprueba el prestamo. Vuelve a chequear la superposicion: entre que se
    pidio y que se aprueba pudo aprobarse otra para los mismos dias."""
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    reserva = await _traer(db, reserva_id, municipio_id)
    if reserva.estado != "solicitada":
        raise HTTPException(status_code=400, detail=f"La reserva ya esta {reserva.estado}")

    choque = await _hay_superposicion(
        db, reserva.item_id, reserva.fecha_desde, reserva.fecha_hasta, excluir_id=reserva.id)
    if choque and choque.estado == "aprobada":
        raise HTTPException(
            status_code=409,
            detail=f"Ya hay otra reserva aprobada para esos dias ({choque.solicitante_nombre})",
        )

    reserva.estado = "aprobada"
    reserva.resuelto_por_id = current_user.id
    reserva.resuelto_at = datetime.utcnow()
    await db.commit()
    return {"estado": "aprobada"}


@router.post("/{reserva_id}/rechazar")
async def rechazar(
    reserva_id: int,
    data: RechazoIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    reserva = await _traer(db, reserva_id, municipio_id)
    if reserva.estado != "solicitada":
        raise HTTPException(status_code=400, detail=f"La reserva ya esta {reserva.estado}")
    reserva.estado = "rechazada"
    reserva.motivo_rechazo = data.motivo.strip()
    reserva.resuelto_por_id = current_user.id
    reserva.resuelto_at = datetime.utcnow()
    await db.commit()
    return {"estado": "rechazada"}


@router.post("/{reserva_id}/cancelar")
async def cancelar(
    reserva_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Da de baja una reserva ya aprobada (se suspendio el evento, se rompio
    la maquina). Libera los dias para que otro pueda pedirlos."""
    _require_gestor(current_user)
    municipio_id = get_effective_municipio_id(request, current_user)
    reserva = await _traer(db, reserva_id, municipio_id)
    if reserva.estado not in ("solicitada", "aprobada"):
        raise HTTPException(status_code=400, detail=f"La reserva esta {reserva.estado}")
    reserva.estado = "cancelada"
    reserva.resuelto_por_id = current_user.id
    reserva.resuelto_at = datetime.utcnow()
    await db.commit()
    return {"estado": "cancelada"}
