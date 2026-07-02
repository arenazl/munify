"""Logica central de agenda de turnos (compartida por todos los endpoints).

Resuelve los 3 criticos que marco la critica de diseno, en UN solo lugar:
  - calcular_slots(): disponibilidad leyendo AgendaConfig (con fallback historico
    si la dependencia no tiene config) + excluyendo feriados (AgendaExcepcion) +
    respetando cupo_max_por_slot. Soporta horario partido (varios tramos por dia).
  - validar_slot(): un endpoint de reserva NO puede crear un turno en un dia/hora
    fuera de la grilla o en un feriado. La validacion vive aca y la usan TODOS los
    puntos de reserva (interno, mostrador, bot).
  - reservar_turno(): unica funcion de escritura, serializada por slot con un
    advisory lock de MySQL (GET_LOCK) -> dos canales (app + bot) no pueden tomar
    el mismo cupo. Funciona para cupo=1 (comportamiento historico) y cupo>1.

Timezone: se opera en hora local del municipio (naive), igual que el resto del
codigo actual. La normalizacion UTC-3 queda pendiente (hueco documentado en la spec).
"""
from datetime import datetime, timedelta, time, date
from typing import Optional, List, Dict, Tuple

from fastapi import HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from models.turno import Turno
from models.agenda_config import AgendaConfig
from models.agenda_excepcion import AgendaExcepcion

# Fallback historico (identico al hardcode de turnos_tramite.py): se usa SOLO
# cuando una dependencia no tiene ninguna fila en AgendaConfig. Garantiza cero
# regresion para los munis que todavia no configuraron su agenda.
FALLBACK_HORA_INICIO = time(8, 30)
FALLBACK_HORA_FIN = time(13, 0)
FALLBACK_DIAS = {0, 1, 2, 3, 4}  # lun=0 ... vie=4
FALLBACK_CUPO = 1

# (hora_inicio, hora_fin, cupo_max) por dia de semana
Tramo = Tuple[time, time, int]


async def _tramos_por_dia(db: AsyncSession, dep_id: int) -> Dict[int, List[Tramo]]:
    """{dia_semana: [(hora_inicio, hora_fin, cupo)]}. Si la dependencia no tiene
    AgendaConfig, devuelve el fallback historico (lun-vie 08:30-13:00, cupo 1)."""
    rows = (await db.execute(
        select(AgendaConfig).where(
            AgendaConfig.municipio_dependencia_id == dep_id,
            AgendaConfig.activo == True,  # noqa: E712
        )
    )).scalars().all()

    if not rows:
        return {
            d: [(FALLBACK_HORA_INICIO, FALLBACK_HORA_FIN, FALLBACK_CUPO)]
            for d in FALLBACK_DIAS
        }

    out: Dict[int, List[Tramo]] = {}
    for r in rows:
        out.setdefault(r.dia_semana, []).append(
            (r.hora_inicio, r.hora_fin, max(1, r.cupo_max_por_slot))
        )
    for d in out:
        out[d].sort(key=lambda t: t[0])
    return out


async def _excepciones(
    db: AsyncSession, dep_id: int, d_desde: date, d_hasta: date
) -> Dict[date, AgendaExcepcion]:
    rows = (await db.execute(
        select(AgendaExcepcion).where(
            AgendaExcepcion.municipio_dependencia_id == dep_id,
            AgendaExcepcion.fecha >= d_desde,
            AgendaExcepcion.fecha <= d_hasta,
        )
    )).scalars().all()
    return {r.fecha: r for r in rows}


async def _ocupados(
    db: AsyncSession, dep_id: int, desde: datetime, hasta: datetime
) -> List[tuple]:
    """Intervalos [inicio, fin) de los turnos reservados del rango.

    Se devuelven INTERVALOS (no conteo por slot exacto) porque dos trámites
    con duraciones distintas generan grillas desalineadas: un turno de 30' a
    las 09:00 tiene que bloquear también el slot 08:45-09:45 de otro trámite.
    El margen hacia atrás atrapa turnos largos que arrancaron antes del rango.
    """
    margen = timedelta(hours=6)
    rows = (await db.execute(
        select(Turno.fecha_hora, Turno.duracion_min)
        .where(
            Turno.municipio_dependencia_id == dep_id,
            Turno.estado == "reservado",
            Turno.fecha_hora >= desde - margen,
            Turno.fecha_hora <= hasta,
        )
    )).all()
    return [
        (fh.replace(microsecond=0), fh.replace(microsecond=0) + timedelta(minutes=dur or 30))
        for fh, dur in rows
    ]


def _solapados(intervalos: List[tuple], ini: datetime, fin: datetime) -> int:
    """Cuántos intervalos reservados se superponen con [ini, fin)."""
    return sum(1 for i_ini, i_fin in intervalos if i_ini < fin and i_fin > ini)


def _tramos_del_dia(
    fecha: date,
    tramos_cfg: Dict[int, List[Tramo]],
    exc: Optional[AgendaExcepcion],
) -> List[Tramo]:
    """Tramos efectivos de un dia, aplicando la excepcion si hay."""
    if exc is not None:
        if exc.tipo == "cierre":
            return []
        if exc.tipo == "apertura_especial" and exc.hora_inicio_override and exc.hora_fin_override:
            return [(exc.hora_inicio_override, exc.hora_fin_override, FALLBACK_CUPO)]
        # apertura_especial sin override -> usa el horario normal del dia
    return tramos_cfg.get(fecha.weekday(), [])


async def calcular_slots(
    db: AsyncSession,
    dep_id: int,
    duracion: int,
    desde: datetime,
    hasta: datetime,
) -> List[dict]:
    """Slots del rango con disponibilidad y cupo. Cada item:
    {fecha_hora, disponible, cupo_total, cupo_restante}."""
    tramos_cfg = await _tramos_por_dia(db, dep_id)
    exc = await _excepciones(db, dep_id, desde.date(), hasta.date())
    ocupados = await _ocupados(db, dep_id, desde, hasta)

    slots: List[dict] = []
    dia = desde.replace(hour=0, minute=0, second=0, microsecond=0)
    while dia <= hasta:
        for hi, hf, cupo in _tramos_del_dia(dia.date(), tramos_cfg, exc.get(dia.date())):
            ini = dia.replace(hour=hi.hour, minute=hi.minute)
            fin = dia.replace(hour=hf.hour, minute=hf.minute)
            while ini + timedelta(minutes=duracion) <= fin:
                if ini >= desde:
                    slot_ini = ini.replace(microsecond=0)
                    tomados = _solapados(ocupados, slot_ini, slot_ini + timedelta(minutes=duracion))
                    restante = max(0, cupo - tomados)
                    slots.append({
                        "fecha_hora": ini,
                        "disponible": restante > 0,
                        "cupo_total": cupo,
                        "cupo_restante": restante,
                    })
                ini += timedelta(minutes=duracion)
        dia += timedelta(days=1)
    return slots


async def validar_slot(
    db: AsyncSession, dep_id: int, fecha_hora: datetime, duracion: int
) -> None:
    """Verifica que `fecha_hora` sea un slot valido de la grilla de la dependencia
    (dia/hora habil, alineado, no feriado). Lanza HTTP 400 si no. NO chequea cupo
    (eso lo hace reservar_turno bajo lock)."""
    fh = fecha_hora.replace(microsecond=0)
    tramos_cfg = await _tramos_por_dia(db, dep_id)
    exc = await _excepciones(db, dep_id, fh.date(), fh.date())
    tramos = _tramos_del_dia(fh.date(), tramos_cfg, exc.get(fh.date()))
    if not tramos:
        raise HTTPException(400, "La dependencia no atiende ese dia")

    for hi, hf, _ in tramos:
        ini = fh.replace(hour=hi.hour, minute=hi.minute, second=0)
        fin = fh.replace(hour=hf.hour, minute=hf.minute, second=0)
        cursor = ini
        while cursor + timedelta(minutes=duracion) <= fin:
            if cursor == fh:
                return
            cursor += timedelta(minutes=duracion)
    raise HTTPException(400, "Horario fuera de los turnos disponibles de la dependencia")


async def _cupo_del_slot(db: AsyncSession, dep_id: int, fecha_hora: datetime) -> int:
    tramos_cfg = await _tramos_por_dia(db, dep_id)
    exc = await _excepciones(db, dep_id, fecha_hora.date(), fecha_hora.date())
    h = fecha_hora.time().replace(second=0, microsecond=0)
    for hi, hf, cupo in _tramos_del_dia(fecha_hora.date(), tramos_cfg, exc.get(fecha_hora.date())):
        if hi <= h < hf:
            return cupo
    return FALLBACK_CUPO


async def reservar_turno(
    db: AsyncSession,
    *,
    dep_id: int,
    municipio_id: int,
    fecha_hora: datetime,
    duracion: int,
    motivo_tipo: str,
    origen_id: Optional[int] = None,
    solicitud_id: Optional[int] = None,
    nombre_solicitante: Optional[str] = None,
    dni_solicitante: Optional[str] = None,
    telefono_solicitante: Optional[str] = None,
    notas: Optional[str] = None,
    validar: bool = True,
) -> Turno:
    """UNICA funcion de creacion de turnos. Valida el slot y serializa el
    check-de-cupo + insert con un advisory lock por slot (GET_LOCK), de modo que
    dos requests concurrentes (app + bot) no puedan exceder el cupo. Lanza 409 si
    el slot esta lleno."""
    if validar:
        await validar_slot(db, dep_id, fecha_hora, duracion)

    fh = fecha_hora.replace(microsecond=0)
    # Lock por DEPENDENCIA (no por slot exacto): con duraciones distintas dos
    # slots desalineados pueden solaparse, y locks por slot no se verían entre
    # sí. Serializar por dependencia es seguro y el volumen lo banca de sobra.
    lock_name = f"turno:{dep_id}"
    got = (await db.execute(text("SELECT GET_LOCK(:n, 10)"), {"n": lock_name})).scalar()
    if got != 1:
        raise HTTPException(503, "No se pudo reservar (lock ocupado). Reintenta.")
    try:
        # Ocupación por SOLAPAMIENTO de intervalos (mismo criterio que
        # calcular_slots): un turno de otra grilla que pisa parcialmente
        # este rango también descuenta cupo.
        fin_nuevo = fh + timedelta(minutes=duracion)
        intervalos = await _ocupados(db, dep_id, fh, fin_nuevo)
        tomados = _solapados(intervalos, fh, fin_nuevo)
        cupo = await _cupo_del_slot(db, dep_id, fh)
        if tomados >= cupo:
            raise HTTPException(409, "Ese horario se completo. Eligi otro.")

        turno = Turno(
            motivo_tipo=motivo_tipo,
            origen_id=origen_id,
            solicitud_id=solicitud_id,
            nombre_solicitante=nombre_solicitante,
            dni_solicitante=dni_solicitante,
            telefono_solicitante=telefono_solicitante,
            municipio_dependencia_id=dep_id,
            municipio_id=municipio_id,
            fecha_hora=fh,
            duracion_min=duracion,
            estado="reservado",
        )
        db.add(turno)
        await db.commit()
        await db.refresh(turno)
        return turno
    finally:
        await db.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": lock_name})
