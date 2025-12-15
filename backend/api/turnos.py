"""
API para gestión de turnos y planificación avanzada de empleados.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from datetime import datetime, date, timedelta, time
from typing import Optional, List
from pydantic import BaseModel

from core.database import get_db
from models import User, Reclamo, Empleado
from models.enums import EstadoReclamo
from core.security import require_roles

router = APIRouter()


class TurnoBase(BaseModel):
    empleado_id: int
    fecha: date
    hora_inicio: str  # "HH:MM"
    hora_fin: str  # "HH:MM"
    tipo: str  # "trabajo", "descanso", "vacaciones", "licencia"
    descripcion: Optional[str] = None


class BloqueoHorario(BaseModel):
    empleado_id: int
    fecha_inicio: date
    fecha_fin: date
    motivo: str  # "vacaciones", "licencia", "capacitacion", "otro"
    descripcion: Optional[str] = None


# Configuración de jornada laboral
JORNADA_INICIO = time(9, 0)  # 9:00 AM
JORNADA_FIN = time(18, 0)  # 6:00 PM
DURACION_TAREA_DEFAULT = 60  # minutos


@router.get("/calendario/{empleado_id}")
async def get_calendario_empleado(
    empleado_id: int,
    fecha_inicio: date = Query(default=None),
    fecha_fin: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtiene el calendario de un empleado con todas sus tareas y bloques de tiempo.
    """
    # Valores por defecto: semana actual
    if not fecha_inicio:
        hoy = date.today()
        fecha_inicio = hoy - timedelta(days=hoy.weekday())  # Lunes
    if not fecha_fin:
        fecha_fin = fecha_inicio + timedelta(days=6)  # Domingo

    # Verificar que el empleado existe
    result = await db.execute(
        select(Empleado).where(Empleado.id == empleado_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Obtener reclamos asignados en el período
    result = await db.execute(
        select(Reclamo).where(
            and_(
                Reclamo.empleado_id == empleado_id,
                Reclamo.fecha_programada >= fecha_inicio,
                Reclamo.fecha_programada <= fecha_fin,
                Reclamo.estado.in_([EstadoReclamo.asignado, EstadoReclamo.en_proceso])
            )
        ).order_by(Reclamo.fecha_programada, Reclamo.hora_inicio)
    )
    reclamos = result.scalars().all()

    # Construir calendario por día
    calendario = {}
    current_date = fecha_inicio
    while current_date <= fecha_fin:
        dia_str = current_date.isoformat()
        calendario[dia_str] = {
            "fecha": dia_str,
            "dia_semana": current_date.strftime("%A"),
            "es_fin_semana": current_date.weekday() >= 5,
            "tareas": [],
            "horas_ocupadas": 0,
            "horas_disponibles": 9 if current_date.weekday() < 5 else 0,  # 9 horas de jornada
        }
        current_date += timedelta(days=1)

    # Agregar tareas al calendario
    for reclamo in reclamos:
        if reclamo.fecha_programada:
            dia_str = reclamo.fecha_programada.isoformat()
            if dia_str in calendario:
                hora_inicio = reclamo.hora_inicio or "09:00"
                hora_fin = reclamo.hora_fin or "10:00"

                # Calcular duración
                h1, m1 = map(int, hora_inicio.split(":"))
                h2, m2 = map(int, hora_fin.split(":"))
                duracion = (h2 * 60 + m2) - (h1 * 60 + m1)

                calendario[dia_str]["tareas"].append({
                    "reclamo_id": reclamo.id,
                    "titulo": reclamo.titulo,
                    "direccion": reclamo.direccion,
                    "categoria": reclamo.categoria.nombre if reclamo.categoria else None,
                    "estado": reclamo.estado.value,
                    "hora_inicio": hora_inicio,
                    "hora_fin": hora_fin,
                    "duracion_minutos": duracion,
                    "prioridad": reclamo.prioridad,
                })

                calendario[dia_str]["horas_ocupadas"] += duracion / 60
                calendario[dia_str]["horas_disponibles"] = max(
                    0,
                    calendario[dia_str]["horas_disponibles"] - duracion / 60
                )

    return {
        "empleado": {
            "id": empleado.id,
            "nombre": f"{empleado.nombre} {empleado.apellido or ''}".strip(),
            "especialidad": empleado.especialidad,
        },
        "periodo": {
            "inicio": fecha_inicio.isoformat(),
            "fin": fecha_fin.isoformat(),
        },
        "calendario": list(calendario.values()),
        "resumen": {
            "total_tareas": len(reclamos),
            "horas_programadas": sum(d["horas_ocupadas"] for d in calendario.values()),
            "horas_disponibles": sum(d["horas_disponibles"] for d in calendario.values()),
        }
    }


@router.get("/disponibilidad")
async def get_disponibilidad_general(
    fecha: date = Query(default=None),
    categoria_id: Optional[int] = None,
    zona_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtiene la disponibilidad de todos los empleados para una fecha específica.
    Útil para planificación de asignaciones.
    """
    if not fecha:
        fecha = date.today()

    # Es fin de semana?
    if fecha.weekday() >= 5:
        return {
            "fecha": fecha.isoformat(),
            "es_fin_semana": True,
            "empleados": [],
            "mensaje": "Los fines de semana no hay jornada laboral regular"
        }

    # Obtener todos los empleados activos
    query = select(Empleado).where(Empleado.activo == True)

    # Filtrar por categoría si se especifica
    if categoria_id:
        from models.empleado_categoria import empleado_categoria
        query = query.join(empleado_categoria).where(
            empleado_categoria.c.categoria_id == categoria_id
        )

    # Filtrar por zona si se especifica
    if zona_id:
        query = query.where(Empleado.zona_id == zona_id)

    result = await db.execute(query)
    empleados = result.scalars().all()

    disponibilidad = []

    for empleado in empleados:
        # Obtener tareas del día
        result = await db.execute(
            select(Reclamo).where(
                and_(
                    Reclamo.empleado_id == empleado.id,
                    Reclamo.fecha_programada == fecha,
                    Reclamo.estado.in_([EstadoReclamo.asignado, EstadoReclamo.en_proceso])
                )
            ).order_by(Reclamo.hora_inicio)
        )
        tareas = result.scalars().all()

        # Calcular bloques ocupados
        bloques_ocupados = []
        horas_ocupadas = 0

        for tarea in tareas:
            hora_inicio = tarea.hora_inicio or "09:00"
            hora_fin = tarea.hora_fin or "10:00"

            h1, m1 = map(int, hora_inicio.split(":"))
            h2, m2 = map(int, hora_fin.split(":"))
            duracion = (h2 * 60 + m2) - (h1 * 60 + m1)
            horas_ocupadas += duracion / 60

            bloques_ocupados.append({
                "reclamo_id": tarea.id,
                "titulo": tarea.titulo,
                "hora_inicio": hora_inicio,
                "hora_fin": hora_fin,
            })

        # Calcular slots disponibles
        slots_disponibles = calcular_slots_disponibles(bloques_ocupados)

        disponibilidad.append({
            "empleado_id": empleado.id,
            "nombre": f"{empleado.nombre} {empleado.apellido or ''}".strip(),
            "especialidad": empleado.especialidad,
            "categorias": [c.nombre for c in empleado.categorias] if empleado.categorias else [],
            "horas_ocupadas": round(horas_ocupadas, 1),
            "horas_disponibles": round(9 - horas_ocupadas, 1),
            "porcentaje_ocupacion": round((horas_ocupadas / 9) * 100, 1),
            "bloques_ocupados": bloques_ocupados,
            "slots_disponibles": slots_disponibles,
            "puede_recibir_tareas": horas_ocupadas < 8,  # Máximo 8 horas de tareas
        })

    # Ordenar por disponibilidad (más disponible primero)
    disponibilidad.sort(key=lambda x: x["horas_ocupadas"])

    return {
        "fecha": fecha.isoformat(),
        "dia_semana": fecha.strftime("%A"),
        "es_fin_semana": False,
        "total_empleados": len(disponibilidad),
        "empleados_disponibles": len([e for e in disponibilidad if e["puede_recibir_tareas"]]),
        "empleados": disponibilidad,
    }


def calcular_slots_disponibles(bloques_ocupados: List[dict]) -> List[dict]:
    """
    Calcula los slots de tiempo disponibles en un día laboral.
    """
    slots = []
    jornada_inicio = "09:00"
    jornada_fin = "18:00"

    if not bloques_ocupados:
        return [{
            "hora_inicio": jornada_inicio,
            "hora_fin": jornada_fin,
            "duracion_minutos": 540,  # 9 horas
        }]

    # Ordenar bloques por hora de inicio
    bloques = sorted(bloques_ocupados, key=lambda x: x["hora_inicio"])

    # Slot antes del primer bloque
    if bloques[0]["hora_inicio"] > jornada_inicio:
        h1, m1 = map(int, jornada_inicio.split(":"))
        h2, m2 = map(int, bloques[0]["hora_inicio"].split(":"))
        duracion = (h2 * 60 + m2) - (h1 * 60 + m1)
        if duracion >= 30:  # Mínimo 30 minutos
            slots.append({
                "hora_inicio": jornada_inicio,
                "hora_fin": bloques[0]["hora_inicio"],
                "duracion_minutos": duracion,
            })

    # Slots entre bloques
    for i in range(len(bloques) - 1):
        hora_fin_actual = bloques[i]["hora_fin"]
        hora_inicio_siguiente = bloques[i + 1]["hora_inicio"]

        if hora_fin_actual < hora_inicio_siguiente:
            h1, m1 = map(int, hora_fin_actual.split(":"))
            h2, m2 = map(int, hora_inicio_siguiente.split(":"))
            duracion = (h2 * 60 + m2) - (h1 * 60 + m1)
            if duracion >= 30:
                slots.append({
                    "hora_inicio": hora_fin_actual,
                    "hora_fin": hora_inicio_siguiente,
                    "duracion_minutos": duracion,
                })

    # Slot después del último bloque
    if bloques[-1]["hora_fin"] < jornada_fin:
        h1, m1 = map(int, bloques[-1]["hora_fin"].split(":"))
        h2, m2 = map(int, jornada_fin.split(":"))
        duracion = (h2 * 60 + m2) - (h1 * 60 + m1)
        if duracion >= 30:
            slots.append({
                "hora_inicio": bloques[-1]["hora_fin"],
                "hora_fin": jornada_fin,
                "duracion_minutos": duracion,
            })

    return slots


@router.get("/planificacion-semanal")
async def get_planificacion_semanal(
    fecha_inicio: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtiene una vista de planificación semanal con todos los empleados y sus tareas.
    """
    if not fecha_inicio:
        hoy = date.today()
        fecha_inicio = hoy - timedelta(days=hoy.weekday())

    fecha_fin = fecha_inicio + timedelta(days=6)

    # Obtener todos los empleados activos
    result = await db.execute(
        select(Empleado).where(Empleado.activo == True).order_by(Empleado.nombre)
    )
    empleados = result.scalars().all()

    # Obtener todas las tareas de la semana
    result = await db.execute(
        select(Reclamo).where(
            and_(
                Reclamo.fecha_programada >= fecha_inicio,
                Reclamo.fecha_programada <= fecha_fin,
                Reclamo.estado.in_([EstadoReclamo.asignado, EstadoReclamo.en_proceso])
            )
        )
    )
    tareas = result.scalars().all()

    # Agrupar tareas por empleado y día
    tareas_por_empleado = {}
    for tarea in tareas:
        if tarea.empleado_id not in tareas_por_empleado:
            tareas_por_empleado[tarea.empleado_id] = {}

        dia = tarea.fecha_programada.isoformat() if tarea.fecha_programada else None
        if dia:
            if dia not in tareas_por_empleado[tarea.empleado_id]:
                tareas_por_empleado[tarea.empleado_id][dia] = []
            tareas_por_empleado[tarea.empleado_id][dia].append({
                "id": tarea.id,
                "titulo": tarea.titulo[:30],
                "hora_inicio": tarea.hora_inicio,
                "hora_fin": tarea.hora_fin,
                "estado": tarea.estado.value,
                "prioridad": tarea.prioridad,
            })

    # Construir planificación
    planificacion = []
    dias_semana = [(fecha_inicio + timedelta(days=i)).isoformat() for i in range(7)]

    for empleado in empleados:
        tareas_emp = tareas_por_empleado.get(empleado.id, {})
        semana = {}

        for dia in dias_semana:
            semana[dia] = tareas_emp.get(dia, [])

        total_tareas = sum(len(t) for t in semana.values())

        planificacion.append({
            "empleado_id": empleado.id,
            "nombre": f"{empleado.nombre} {empleado.apellido or ''}".strip(),
            "especialidad": empleado.especialidad,
            "semana": semana,
            "total_tareas": total_tareas,
        })

    return {
        "periodo": {
            "inicio": fecha_inicio.isoformat(),
            "fin": fecha_fin.isoformat(),
        },
        "dias": dias_semana,
        "planificacion": planificacion,
        "resumen": {
            "total_empleados": len(empleados),
            "total_tareas": len(tareas),
            "promedio_tareas_por_empleado": round(len(tareas) / len(empleados), 1) if empleados else 0,
        }
    }


@router.post("/optimizar-asignaciones")
async def optimizar_asignaciones(
    fecha: date = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Sugiere una optimización de las asignaciones del día para balancear carga de trabajo.
    No aplica cambios automáticamente, solo sugiere.
    """
    if not fecha:
        fecha = date.today()

    # Obtener reclamos sin asignar
    result = await db.execute(
        select(Reclamo).where(
            and_(
                Reclamo.estado == EstadoReclamo.nuevo,
                or_(
                    Reclamo.fecha_programada.is_(None),
                    Reclamo.fecha_programada == fecha
                )
            )
        ).order_by(Reclamo.prioridad.desc(), Reclamo.created_at)
    )
    reclamos_pendientes = result.scalars().all()

    if not reclamos_pendientes:
        return {
            "fecha": fecha.isoformat(),
            "mensaje": "No hay reclamos pendientes para asignar",
            "sugerencias": []
        }

    # Obtener disponibilidad
    disponibilidad_response = await get_disponibilidad_general(fecha, None, None, db, current_user)
    empleados_disponibles = [
        e for e in disponibilidad_response["empleados"]
        if e["puede_recibir_tareas"]
    ]

    if not empleados_disponibles:
        return {
            "fecha": fecha.isoformat(),
            "mensaje": "No hay empleados disponibles para el día seleccionado",
            "sugerencias": []
        }

    # Generar sugerencias de asignación
    sugerencias = []

    for reclamo in reclamos_pendientes:
        # Encontrar mejor empleado
        mejor_empleado = None
        mejor_score = -1

        for emp in empleados_disponibles:
            score = 0

            # Bonus si tiene la categoría del reclamo
            if reclamo.categoria and reclamo.categoria.nombre in emp["categorias"]:
                score += 50

            # Bonus por disponibilidad
            score += emp["horas_disponibles"] * 5

            # Penalización por ocupación
            score -= emp["porcentaje_ocupacion"] * 0.5

            if score > mejor_score:
                mejor_score = score
                mejor_empleado = emp

        if mejor_empleado and mejor_empleado["slots_disponibles"]:
            # Usar primer slot disponible
            slot = mejor_empleado["slots_disponibles"][0]

            sugerencias.append({
                "reclamo_id": reclamo.id,
                "titulo": reclamo.titulo,
                "categoria": reclamo.categoria.nombre if reclamo.categoria else None,
                "prioridad": reclamo.prioridad,
                "empleado_sugerido": {
                    "id": mejor_empleado["empleado_id"],
                    "nombre": mejor_empleado["nombre"],
                    "especialidad": mejor_empleado["especialidad"],
                },
                "horario_sugerido": {
                    "fecha": fecha.isoformat(),
                    "hora_inicio": slot["hora_inicio"],
                    "hora_fin": calcular_hora_fin(slot["hora_inicio"], DURACION_TAREA_DEFAULT),
                },
                "score": round(mejor_score, 1),
                "razon": "Mejor combinación de disponibilidad y especialidad",
            })

            # Actualizar disponibilidad del empleado para siguientes sugerencias
            mejor_empleado["horas_disponibles"] -= 1
            mejor_empleado["porcentaje_ocupacion"] += 11.1

    return {
        "fecha": fecha.isoformat(),
        "total_pendientes": len(reclamos_pendientes),
        "total_sugerencias": len(sugerencias),
        "sugerencias": sugerencias,
    }


def calcular_hora_fin(hora_inicio: str, duracion_minutos: int) -> str:
    """Calcula la hora de fin dado un inicio y duración"""
    h, m = map(int, hora_inicio.split(":"))
    total_minutos = h * 60 + m + duracion_minutos
    h_fin = total_minutos // 60
    m_fin = total_minutos % 60
    return f"{h_fin:02d}:{m_fin:02d}"
