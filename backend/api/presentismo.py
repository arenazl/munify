"""Presentismo — modulo Recursos, Etapa 2.

El presentismo deja de marcarse a dedo en la liquidacion: sale de cruzar lo
que el empleado DEBIA trabajar (horarios), lo que estaba JUSTIFICADO que no
trabajara (ausencias aprobadas) y lo que REALMENTE trabajo (jornadas).

Endpoints:
  POST /presentismo/fichar          el empleado ficha (entrada o salida)
  GET  /presentismo/mi-jornada      como viene su dia
  GET  /presentismo/mes             el resumen del mes por empleado (gestion)
"""
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from core.tenancy import get_effective_municipio_id
from models import Empleado, EmpleadoAusencia, EmpleadoJornada, RolUsuario, User
from models.empleado_horario import EmpleadoHorario

router = APIRouter()

ART = ZoneInfo("America/Argentina/Buenos_Aires")


def _hoy() -> date:
    """Hoy en hora argentina. El server corre en UTC: de noche, `date.today()`
    ya es manana y el fichaje de las 21 caeria en el dia equivocado."""
    return datetime.now(ART).date()


class FicharIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


class JornadaResponse(BaseModel):
    fecha: date
    entrada_at: Optional[datetime] = None
    salida_at: Optional[datetime] = None
    origen: str = "app"
    abierta: bool = False

    class Config:
        from_attributes = True


class PresentismoEmpleado(BaseModel):
    """Lo que la liquidacion necesita saber, ya masticado."""
    empleado_id: int
    nombre: str
    esperadas: int          # dias que debia trabajar segun su horario
    justificadas: int       # de esos, cuantos estaban cubiertos por ausencia
    trabajadas: int         # jornadas fichadas
    faltas: int             # esperadas - justificadas - trabajadas (nunca < 0)
    abiertas: int           # jornadas sin cierre (fichó entrada y no salida)
    # None cuando el empleado no tiene horario cargado: sin saber que dias
    # debia venir, cualquier porcentaje seria inventado.
    porcentaje: Optional[float] = None


async def _empleado_del_usuario(db: AsyncSession, user: User) -> Empleado:
    if not user.empleado_id:
        raise HTTPException(status_code=403, detail="Tu usuario no esta vinculado a un empleado")
    r = await db.execute(select(Empleado).where(Empleado.id == user.empleado_id))
    emp = r.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    return emp


@router.post("/fichar", response_model=JornadaResponse)
async def fichar(
    data: FicharIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Un solo boton: si la jornada de hoy esta abierta, cierra; si no, abre.

    Es a proposito: el empleado en la calle no tiene que elegir entre
    "entrada" y "salida" — aprieta y el sistema sabe cual corresponde. Fichar
    de mas no crea un dia nuevo (hay UNIQUE por empleado y fecha).
    """
    emp = await _empleado_del_usuario(db, current_user)
    hoy = _hoy()
    ahora = datetime.now(ART)

    r = await db.execute(
        select(EmpleadoJornada).where(
            EmpleadoJornada.empleado_id == emp.id,
            EmpleadoJornada.fecha == hoy,
        )
    )
    jornada = r.scalar_one_or_none()

    if jornada is None:
        jornada = EmpleadoJornada(
            municipio_id=emp.municipio_id, empleado_id=emp.id, fecha=hoy,
            entrada_at=ahora, entrada_lat=data.lat, entrada_lng=data.lng,
            origen="app",
        )
        db.add(jornada)
    elif jornada.salida_at is None:
        jornada.salida_at = ahora
        jornada.salida_lat = data.lat
        jornada.salida_lng = data.lng
    else:
        # Ya cerro el dia. No se reabre desde el celular: si hubo un error,
        # lo corrige el supervisor, que es quien puede dar fe.
        raise HTTPException(status_code=400, detail="Ya fichaste la entrada y la salida de hoy")

    await db.commit()
    await db.refresh(jornada)
    return JornadaResponse(
        fecha=jornada.fecha, entrada_at=jornada.entrada_at,
        salida_at=jornada.salida_at, origen=jornada.origen,
        abierta=jornada.salida_at is None,
    )


@router.get("/mi-jornada", response_model=Optional[JornadaResponse])
async def mi_jornada(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Como viene el dia del empleado logueado. None si todavia no fichó."""
    emp = await _empleado_del_usuario(db, current_user)
    r = await db.execute(
        select(EmpleadoJornada).where(
            EmpleadoJornada.empleado_id == emp.id,
            EmpleadoJornada.fecha == _hoy(),
        )
    )
    j = r.scalar_one_or_none()
    if not j:
        return None
    return JornadaResponse(
        fecha=j.fecha, entrada_at=j.entrada_at, salida_at=j.salida_at,
        origen=j.origen, abierta=j.salida_at is None,
    )


@router.get("/mes", response_model=List[PresentismoEmpleado])
async def presentismo_del_mes(
    request: Request,
    mes: Optional[str] = Query(None, description="YYYY-MM; por defecto, el mes en curso"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El presentismo de cada empleado en el mes, listo para la liquidacion.

    `esperadas` sale del horario del empleado: se cuentan los dias del mes
    cuyo dia de semana tiene horario activo. Un empleado SIN horario cargado
    devuelve porcentaje None — no 0% ni 100%: no sabemos que se esperaba de
    el, y marcarlo como ausente seria acusarlo por un dato que falta.

    Los dias FUTUROS del mes en curso no cuentan: nadie falta a un dia que
    todavia no llego.
    """
    if current_user.rol not in (RolUsuario.ADMIN, RolUsuario.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Sin permisos para ver el presentismo")
    municipio_id = get_effective_municipio_id(request, current_user)

    hoy = _hoy()
    try:
        anio, num_mes = (int(x) for x in (mes or hoy.strftime("%Y-%m")).split("-"))
        primero = date(anio, num_mes, 1)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="El mes va como YYYY-MM")
    ultimo = date(anio, num_mes, monthrange(anio, num_mes)[1])
    # El mes en curso se corta en hoy.
    tope = min(ultimo, hoy)
    if primero > tope:
        return []

    r = await db.execute(
        select(Empleado).where(
            Empleado.municipio_id == municipio_id,
            Empleado.activo == True,  # noqa: E712
        )
    )
    empleados = r.scalars().all()
    if not empleados:
        return []
    ids = [e.id for e in empleados]

    rh = await db.execute(
        select(EmpleadoHorario).where(
            EmpleadoHorario.empleado_id.in_(ids),
            EmpleadoHorario.activo == True,  # noqa: E712
        )
    )
    dias_por_empleado: dict[int, set] = {}
    for h in rh.scalars().all():
        dias_por_empleado.setdefault(h.empleado_id, set()).add(h.dia_semana)

    rj = await db.execute(
        select(EmpleadoJornada).where(
            EmpleadoJornada.empleado_id.in_(ids),
            EmpleadoJornada.fecha >= primero,
            EmpleadoJornada.fecha <= ultimo,
        )
    )
    jornadas_por_empleado: dict[int, list] = {}
    for j in rj.scalars().all():
        jornadas_por_empleado.setdefault(j.empleado_id, []).append(j)

    ra = await db.execute(
        select(EmpleadoAusencia).where(
            EmpleadoAusencia.empleado_id.in_(ids),
            EmpleadoAusencia.aprobado == True,  # noqa: E712
            EmpleadoAusencia.fecha_inicio <= ultimo,
            EmpleadoAusencia.fecha_fin >= primero,
        )
    )
    ausencias_por_empleado: dict[int, list] = {}
    for a in ra.scalars().all():
        ausencias_por_empleado.setdefault(a.empleado_id, []).append(a)

    salida = []
    for e in empleados:
        dias_horario = dias_por_empleado.get(e.id)
        jornadas = jornadas_por_empleado.get(e.id, [])
        ausencias = ausencias_por_empleado.get(e.id, [])
        fichadas = {j.fecha for j in jornadas}

        esperadas = justificadas = 0
        d = primero
        while d <= tope:
            # `weekday()`: 0=lunes, igual que `EmpleadoHorario.dia_semana`.
            if dias_horario is not None and d.weekday() in dias_horario:
                esperadas += 1
                if any(a.fecha_inicio <= d <= a.fecha_fin for a in ausencias):
                    justificadas += 1
            d += timedelta(days=1)

        trabajadas = len(fichadas)
        faltas = max(esperadas - justificadas - trabajadas, 0)
        debia = esperadas - justificadas
        salida.append(PresentismoEmpleado(
            empleado_id=e.id,
            nombre=f"{e.nombre} {e.apellido}".strip() if getattr(e, "apellido", None) else e.nombre,
            esperadas=esperadas,
            justificadas=justificadas,
            trabajadas=trabajadas,
            faltas=faltas,
            abiertas=sum(1 for j in jornadas if j.salida_at is None),
            porcentaje=(round(min(trabajadas / debia, 1) * 100) if dias_horario and debia > 0 else None),
        ))

    # Primero el que mas falto: es lo que hay que mirar antes de liquidar.
    salida.sort(key=lambda p: (-p.faltas, p.nombre))
    return salida
