"""Reglas de asignación de trabajo, en UN solo lugar (F4 · Despacho, T1).

Antes, cada uno de los 4 puntos que asignaban (PUT /reclamos/{id}/empleado,
auto-asignar, el drag del canvas, y la OT) tenía sus propias reglas — y varias
eran DATOS SIMULADOS: el auto-asignar calculaba con `carga_actual = 0` y
`disponibilidad_score = 15` hardcodeados. Este service las unifica leyendo lo
que ya existe en la base y nadie consultaba: reclamos/OTs vigentes del empleado
(carga real), `EmpleadoHorario` (jornada por día), `EmpleadoAusencia` (ausencias)
y `Empleado.capacidad_maxima`.

Política (decisión F4): la ausencia y el exceso de capacidad WARNEAN, no
bloquean — el supervisor puede asignar igual, pero ve el aviso. Lo único que se
valida DURO es el estado del reclamo. Multi-tenant estricto en cada query.
"""
from datetime import date, time
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.reclamo import Reclamo
from models.empleado import Empleado
from models.orden_trabajo import OrdenTrabajo
from models.empleado_ausencia import EmpleadoAusencia
from models.empleado_horario import EmpleadoHorario
from models.enums import EstadoReclamo, EstadoOrdenTrabajo

# Reclamo "activo" = no cerrado (blocklist resiliente; un estado nuevo/legacy NO
# lo excluye por error, patrón con fallback de la regla dura #3).
ESTADOS_RECLAMO_CERRADOS = (
    EstadoReclamo.FINALIZADO,
    EstadoReclamo.RESUELTO,
    EstadoReclamo.RECHAZADO,
)
# OT "vigente" = todavía representa trabajo por hacer (no terminada/anulada).
ESTADOS_OT_VIGENTES = (
    EstadoOrdenTrabajo.PENDIENTE,
    EstadoOrdenTrabajo.ASIGNADA,
    EstadoOrdenTrabajo.EN_CURSO,
)
# Estados de reclamo desde los que se puede (re)programar una asignación.
ESTADOS_ASIGNABLES = (
    EstadoReclamo.RECIBIDO,
    EstadoReclamo.EN_CURSO,
    EstadoReclamo.POSPUESTO,
    EstadoReclamo.PENDIENTE_CONFIRMACION,
)

JORNADA_DEFAULT = (time(9, 0), time(18, 0))


async def ausente_en(db: AsyncSession, empleado_id: int, fecha: date) -> Optional[str]:
    """Devuelve el tipo de ausencia si el empleado está ausente en `fecha`, o None.

    Cuenta cualquier ausencia registrada que cubra la fecha (aprobada o no):
    para un WARNING preferimos avisar de más que de menos.
    """
    row = (await db.execute(
        select(EmpleadoAusencia.tipo).where(
            EmpleadoAusencia.empleado_id == empleado_id,
            EmpleadoAusencia.fecha_inicio <= fecha,
            EmpleadoAusencia.fecha_fin >= fecha,
        ).limit(1)
    )).scalar_one_or_none()
    return row


async def carga_de(
    db: AsyncSession, empleado_id: int, municipio_id: int,
    fecha: Optional[date] = None,
) -> int:
    """Carga real del empleado: reclamos activos asignados + OTs vigentes.

    Sin `fecha` => carga total pendiente. Con `fecha` => solo lo programado
    para ese día (por `fecha_programada`). Cuenta reclamos y OTs por separado y
    suma (un reclamo canalizado por OT puede aparecer en ambos, pero como
    unidades de trabajo distintas para el operario es aceptable).
    """
    rec_q = select(func.count(Reclamo.id)).where(
        Reclamo.municipio_id == municipio_id,
        Reclamo.empleado_id == empleado_id,
        Reclamo.estado.notin_(ESTADOS_RECLAMO_CERRADOS),
    )
    ot_q = select(func.count(OrdenTrabajo.id)).where(
        OrdenTrabajo.municipio_id == municipio_id,
        OrdenTrabajo.empleado_id == empleado_id,
        OrdenTrabajo.estado.in_(ESTADOS_OT_VIGENTES),
    )
    if fecha is not None:
        rec_q = rec_q.where(Reclamo.fecha_programada == fecha)
        ot_q = ot_q.where(OrdenTrabajo.fecha_programada == fecha)
    rec = (await db.execute(rec_q)).scalar_one() or 0
    ot = (await db.execute(ot_q)).scalar_one() or 0
    return int(rec) + int(ot)


async def jornada_de(db: AsyncSession, empleado_id: int, fecha: date) -> tuple[time, time]:
    """Jornada (entrada, salida) del empleado para el día de `fecha`.

    Lee `EmpleadoHorario` por día de semana (0=Lunes..6=Domingo, igual que
    date.weekday()); si no hay horario activo para ese día, cae al default 9-18.
    """
    row = (await db.execute(
        select(EmpleadoHorario.hora_entrada, EmpleadoHorario.hora_salida).where(
            EmpleadoHorario.empleado_id == empleado_id,
            EmpleadoHorario.dia_semana == fecha.weekday(),
            EmpleadoHorario.activo == True,  # noqa: E712
        ).limit(1)
    )).first()
    if row and row[0] and row[1]:
        return row[0], row[1]
    return JORNADA_DEFAULT


async def disponibilidad_de(
    db: AsyncSession, empleado_id: int, municipio_id: int, fecha: date,
) -> dict:
    """Foto de disponibilidad del empleado para un día concreto.

    {jornada:(entrada,salida), bloques_ocupados:[{inicio,fin,titulo}], carga_dia,
     capacidad, dia_lleno, ausente} — todo con datos reales, sin simular.
    """
    entrada, salida = await jornada_de(db, empleado_id, fecha)
    cap = (await db.execute(
        select(Empleado.capacidad_maxima).where(Empleado.id == empleado_id)
    )).scalar_one_or_none() or 10

    # Bloques ocupados: reclamos con hora + OTs con hora, ese día.
    bloques = []
    rec_rows = (await db.execute(
        select(Reclamo.hora_inicio, Reclamo.hora_fin, Reclamo.titulo).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.empleado_id == empleado_id,
            Reclamo.fecha_programada == fecha,
            Reclamo.estado.notin_(ESTADOS_RECLAMO_CERRADOS),
            Reclamo.hora_inicio.isnot(None),
        )
    )).all()
    for h_ini, h_fin, titulo in rec_rows:
        bloques.append({"inicio": h_ini, "fin": h_fin, "titulo": titulo})
    ot_rows = (await db.execute(
        select(OrdenTrabajo.hora_inicio, OrdenTrabajo.hora_fin, OrdenTrabajo.titulo).where(
            OrdenTrabajo.municipio_id == municipio_id,
            OrdenTrabajo.empleado_id == empleado_id,
            OrdenTrabajo.fecha_programada == fecha,
            OrdenTrabajo.estado.in_(ESTADOS_OT_VIGENTES),
            OrdenTrabajo.hora_inicio.isnot(None),
        )
    )).all()
    for h_ini, h_fin, titulo in ot_rows:
        bloques.append({"inicio": h_ini, "fin": h_fin, "titulo": titulo})

    carga_dia = await carga_de(db, empleado_id, municipio_id, fecha=fecha)
    ausente = await ausente_en(db, empleado_id, fecha)
    return {
        "jornada": (entrada, salida),
        "bloques_ocupados": bloques,
        "carga_dia": carga_dia,
        "capacidad": cap,
        "dia_lleno": carga_dia >= cap,
        "ausente": ausente,
    }


async def validar_asignacion(
    db: AsyncSession, empleado_id: int, municipio_id: int,
    fecha: Optional[date], estado_reclamo: EstadoReclamo,
) -> dict:
    """{ok, warnings:[...]} para asignar un reclamo a un empleado en una fecha.

    DURO (bloquea, ok=False): el reclamo no está en un estado (re)asignable.
    WARNING (ok=True, no bloquea): el empleado está ausente ese día, o superaría
    su capacidad. El supervisor decide con el aviso a la vista.
    """
    warnings: list[str] = []
    if estado_reclamo in ESTADOS_RECLAMO_CERRADOS:
        return {"ok": False, "warnings": [f"El reclamo está {estado_reclamo.value}: no se puede asignar."]}
    if estado_reclamo not in ESTADOS_ASIGNABLES:
        # No cerrado pero tampoco claramente asignable (ej. estado legacy) → warning, no bloqueo.
        warnings.append(f"El reclamo está en estado '{getattr(estado_reclamo, 'value', estado_reclamo)}'.")

    if fecha is not None:
        tipo_ausencia = await ausente_en(db, empleado_id, fecha)
        if tipo_ausencia:
            warnings.append(f"El empleado tiene una ausencia ({tipo_ausencia}) en esa fecha.")
        disp = await disponibilidad_de(db, empleado_id, municipio_id, fecha)
        if disp["dia_lleno"]:
            warnings.append(
                f"El empleado ya tiene {disp['carga_dia']} tareas ese día "
                f"(capacidad {disp['capacidad']})."
            )
    return {"ok": True, "warnings": warnings}
