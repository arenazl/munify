"""
API para gestion avanzada de empleados: cuadrillas, ausencias, horarios, metricas, capacitaciones.
Todos los endpoints siguen el patron ABM estandar del proyecto.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import date, time, datetime

from core.database import get_db
from core.security import require_roles
from models import (
    User, Empleado, Cuadrilla,
    EmpleadoCuadrilla, EmpleadoAusencia, EmpleadoHorario,
    EmpleadoMetrica, EmpleadoCapacitacion
)
from schemas.empleado_gestion import (
    EmpleadoCuadrillaCreate, EmpleadoCuadrillaUpdate, EmpleadoCuadrillaResponse,
    EmpleadoAusenciaCreate, EmpleadoAusenciaUpdate, EmpleadoAusenciaResponse,
    EmpleadoHorarioCreate, EmpleadoHorarioUpdate, EmpleadoHorarioResponse,
    EmpleadoMetricaCreate, EmpleadoMetricaResponse,
    EmpleadoCapacitacionCreate, EmpleadoCapacitacionUpdate, EmpleadoCapacitacionResponse,
)

router = APIRouter()


# ==================== EMPLEADO-CUADRILLA ====================

@router.get("/cuadrillas", response_model=List[EmpleadoCuadrillaResponse])
async def get_empleados_cuadrillas(
    empleado_id: Optional[int] = None,
    cuadrilla_id: Optional[int] = None,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Lista las asignaciones empleado-cuadrilla. Filtrable por empleado, cuadrilla o estado."""
    query = select(EmpleadoCuadrilla).options(
        selectinload(EmpleadoCuadrilla.empleado),
        selectinload(EmpleadoCuadrilla.cuadrilla)
    )

    # Filtrar por municipio a traves del empleado
    query = query.join(Empleado).where(Empleado.municipio_id == current_user.municipio_id)

    if empleado_id:
        query = query.where(EmpleadoCuadrilla.empleado_id == empleado_id)
    if cuadrilla_id:
        query = query.where(EmpleadoCuadrilla.cuadrilla_id == cuadrilla_id)
    if activo is not None:
        query = query.where(EmpleadoCuadrilla.activo == activo)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/cuadrillas", response_model=EmpleadoCuadrillaResponse)
async def asignar_empleado_cuadrilla(
    data: EmpleadoCuadrillaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Asigna un empleado a una cuadrilla."""
    # Verificar que empleado existe y es del municipio
    result = await db.execute(
        select(Empleado).where(
            Empleado.id == data.empleado_id,
            Empleado.municipio_id == current_user.municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Verificar que cuadrilla existe y es del municipio
    result = await db.execute(
        select(Cuadrilla).where(
            Cuadrilla.id == data.cuadrilla_id,
            Cuadrilla.municipio_id == current_user.municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")

    # Verificar si ya existe la asignacion
    result = await db.execute(
        select(EmpleadoCuadrilla).where(
            EmpleadoCuadrilla.empleado_id == data.empleado_id,
            EmpleadoCuadrilla.cuadrilla_id == data.cuadrilla_id
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        if existing.activo:
            raise HTTPException(status_code=400, detail="El empleado ya esta asignado a esta cuadrilla")
        # Reactivar asignacion existente
        existing.activo = True
        existing.es_lider = data.es_lider
        await db.commit()
        await db.refresh(existing)
        return existing

    asignacion = EmpleadoCuadrilla(**data.model_dump())
    db.add(asignacion)
    await db.commit()

    result = await db.execute(
        select(EmpleadoCuadrilla).options(
            selectinload(EmpleadoCuadrilla.empleado),
            selectinload(EmpleadoCuadrilla.cuadrilla)
        ).where(EmpleadoCuadrilla.id == asignacion.id)
    )
    return result.scalar_one()


@router.put("/cuadrillas/{asignacion_id}", response_model=EmpleadoCuadrillaResponse)
async def update_asignacion_cuadrilla(
    asignacion_id: int,
    data: EmpleadoCuadrillaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Actualiza una asignacion empleado-cuadrilla (ej: cambiar lider)."""
    result = await db.execute(
        select(EmpleadoCuadrilla).options(
            selectinload(EmpleadoCuadrilla.empleado),
            selectinload(EmpleadoCuadrilla.cuadrilla)
        ).where(EmpleadoCuadrilla.id == asignacion_id)
    )
    asignacion = result.scalar_one_or_none()
    if not asignacion:
        raise HTTPException(status_code=404, detail="Asignacion no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(asignacion, key, value)

    await db.commit()
    await db.refresh(asignacion)
    return asignacion


@router.delete("/cuadrillas/{asignacion_id}")
async def desasignar_empleado_cuadrilla(
    asignacion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Desactiva una asignacion empleado-cuadrilla."""
    result = await db.execute(
        select(EmpleadoCuadrilla).where(EmpleadoCuadrilla.id == asignacion_id)
    )
    asignacion = result.scalar_one_or_none()
    if not asignacion:
        raise HTTPException(status_code=404, detail="Asignacion no encontrada")

    asignacion.activo = False
    await db.commit()
    return {"message": "Asignacion desactivada"}


# ==================== AUSENCIAS ====================

@router.get("/ausencias", response_model=List[EmpleadoAusenciaResponse])
async def get_ausencias(
    empleado_id: Optional[int] = None,
    tipo: Optional[str] = None,
    aprobado: Optional[bool] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Lista las ausencias de empleados."""
    query = select(EmpleadoAusencia).options(
        selectinload(EmpleadoAusencia.empleado),
        selectinload(EmpleadoAusencia.aprobado_por)
    ).join(Empleado).where(Empleado.municipio_id == current_user.municipio_id)

    if empleado_id:
        query = query.where(EmpleadoAusencia.empleado_id == empleado_id)
    if tipo:
        query = query.where(EmpleadoAusencia.tipo == tipo)
    if aprobado is not None:
        query = query.where(EmpleadoAusencia.aprobado == aprobado)
    if fecha_desde:
        query = query.where(EmpleadoAusencia.fecha_fin >= fecha_desde)
    if fecha_hasta:
        query = query.where(EmpleadoAusencia.fecha_inicio <= fecha_hasta)

    query = query.order_by(EmpleadoAusencia.fecha_inicio.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/ausencias", response_model=EmpleadoAusenciaResponse)
async def create_ausencia(
    data: EmpleadoAusenciaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Registra una nueva ausencia."""
    # Verificar empleado
    result = await db.execute(
        select(Empleado).where(
            Empleado.id == data.empleado_id,
            Empleado.municipio_id == current_user.municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    ausencia = EmpleadoAusencia(**data.model_dump())
    db.add(ausencia)
    await db.commit()

    result = await db.execute(
        select(EmpleadoAusencia).options(
            selectinload(EmpleadoAusencia.empleado),
            selectinload(EmpleadoAusencia.aprobado_por)
        ).where(EmpleadoAusencia.id == ausencia.id)
    )
    return result.scalar_one()


@router.put("/ausencias/{ausencia_id}", response_model=EmpleadoAusenciaResponse)
async def update_ausencia(
    ausencia_id: int,
    data: EmpleadoAusenciaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Actualiza una ausencia (incluyendo aprobar/rechazar)."""
    result = await db.execute(
        select(EmpleadoAusencia).options(
            selectinload(EmpleadoAusencia.empleado),
            selectinload(EmpleadoAusencia.aprobado_por)
        ).where(EmpleadoAusencia.id == ausencia_id)
    )
    ausencia = result.scalar_one_or_none()
    if not ausencia:
        raise HTTPException(status_code=404, detail="Ausencia no encontrada")

    update_data = data.model_dump(exclude_unset=True)

    # Si se esta aprobando, registrar quien aprobo
    if 'aprobado' in update_data and update_data['aprobado']:
        ausencia.aprobado_por_id = current_user.id
        ausencia.fecha_aprobacion = date.today()

    for key, value in update_data.items():
        setattr(ausencia, key, value)

    await db.commit()
    await db.refresh(ausencia)
    return ausencia


@router.delete("/ausencias/{ausencia_id}")
async def delete_ausencia(
    ausencia_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Elimina una ausencia."""
    result = await db.execute(
        select(EmpleadoAusencia).where(EmpleadoAusencia.id == ausencia_id)
    )
    ausencia = result.scalar_one_or_none()
    if not ausencia:
        raise HTTPException(status_code=404, detail="Ausencia no encontrada")

    await db.delete(ausencia)
    await db.commit()
    return {"message": "Ausencia eliminada"}


# ==================== HORARIOS ====================

@router.get("/horarios", response_model=List[EmpleadoHorarioResponse])
async def get_horarios(
    empleado_id: Optional[int] = None,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Lista los horarios de empleados."""
    query = select(EmpleadoHorario).options(
        selectinload(EmpleadoHorario.empleado)
    ).join(Empleado).where(Empleado.municipio_id == current_user.municipio_id)

    if empleado_id:
        query = query.where(EmpleadoHorario.empleado_id == empleado_id)
    if activo is not None:
        query = query.where(EmpleadoHorario.activo == activo)

    query = query.order_by(EmpleadoHorario.empleado_id, EmpleadoHorario.dia_semana)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/horarios", response_model=EmpleadoHorarioResponse)
async def create_horario(
    data: EmpleadoHorarioCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Crea un horario para un dia especifico."""
    # Verificar empleado
    result = await db.execute(
        select(Empleado).where(
            Empleado.id == data.empleado_id,
            Empleado.municipio_id == current_user.municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Convertir strings a time
    hora_entrada = datetime.strptime(data.hora_entrada, "%H:%M").time()
    hora_salida = datetime.strptime(data.hora_salida, "%H:%M").time()

    horario = EmpleadoHorario(
        empleado_id=data.empleado_id,
        dia_semana=data.dia_semana,
        hora_entrada=hora_entrada,
        hora_salida=hora_salida,
        activo=data.activo
    )
    db.add(horario)
    await db.commit()

    result = await db.execute(
        select(EmpleadoHorario).options(
            selectinload(EmpleadoHorario.empleado)
        ).where(EmpleadoHorario.id == horario.id)
    )
    return result.scalar_one()


@router.put("/horarios/{horario_id}", response_model=EmpleadoHorarioResponse)
async def update_horario(
    horario_id: int,
    data: EmpleadoHorarioUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Actualiza un horario."""
    result = await db.execute(
        select(EmpleadoHorario).options(
            selectinload(EmpleadoHorario.empleado)
        ).where(EmpleadoHorario.id == horario_id)
    )
    horario = result.scalar_one_or_none()
    if not horario:
        raise HTTPException(status_code=404, detail="Horario no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    if 'hora_entrada' in update_data:
        update_data['hora_entrada'] = datetime.strptime(update_data['hora_entrada'], "%H:%M").time()
    if 'hora_salida' in update_data:
        update_data['hora_salida'] = datetime.strptime(update_data['hora_salida'], "%H:%M").time()

    for key, value in update_data.items():
        setattr(horario, key, value)

    await db.commit()
    await db.refresh(horario)
    return horario


@router.delete("/horarios/{horario_id}")
async def delete_horario(
    horario_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Elimina un horario."""
    result = await db.execute(
        select(EmpleadoHorario).where(EmpleadoHorario.id == horario_id)
    )
    horario = result.scalar_one_or_none()
    if not horario:
        raise HTTPException(status_code=404, detail="Horario no encontrado")

    await db.delete(horario)
    await db.commit()
    return {"message": "Horario eliminado"}


@router.post("/horarios/bulk/{empleado_id}")
async def set_horarios_semana(
    empleado_id: int,
    horarios: List[EmpleadoHorarioCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Establece todos los horarios de la semana para un empleado (reemplaza existentes)."""
    # Verificar empleado
    result = await db.execute(
        select(Empleado).where(
            Empleado.id == empleado_id,
            Empleado.municipio_id == current_user.municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # Eliminar horarios existentes
    result = await db.execute(
        select(EmpleadoHorario).where(EmpleadoHorario.empleado_id == empleado_id)
    )
    for h in result.scalars().all():
        await db.delete(h)

    # Crear nuevos horarios
    for h_data in horarios:
        hora_entrada = datetime.strptime(h_data.hora_entrada, "%H:%M").time()
        hora_salida = datetime.strptime(h_data.hora_salida, "%H:%M").time()
        horario = EmpleadoHorario(
            empleado_id=empleado_id,
            dia_semana=h_data.dia_semana,
            hora_entrada=hora_entrada,
            hora_salida=hora_salida,
            activo=h_data.activo
        )
        db.add(horario)

    await db.commit()
    return {"message": f"Horarios actualizados para empleado {empleado_id}"}


# ==================== METRICAS ====================

@router.get("/metricas", response_model=List[EmpleadoMetricaResponse])
async def get_metricas(
    empleado_id: Optional[int] = None,
    periodo_desde: Optional[date] = None,
    periodo_hasta: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Lista las metricas de rendimiento."""
    query = select(EmpleadoMetrica).options(
        selectinload(EmpleadoMetrica.empleado)
    ).join(Empleado).where(Empleado.municipio_id == current_user.municipio_id)

    if empleado_id:
        query = query.where(EmpleadoMetrica.empleado_id == empleado_id)
    if periodo_desde:
        query = query.where(EmpleadoMetrica.periodo >= periodo_desde)
    if periodo_hasta:
        query = query.where(EmpleadoMetrica.periodo <= periodo_hasta)

    query = query.order_by(EmpleadoMetrica.periodo.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/metricas", response_model=EmpleadoMetricaResponse)
async def create_metrica(
    data: EmpleadoMetricaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Registra metricas de un periodo."""
    metrica = EmpleadoMetrica(**data.model_dump())
    db.add(metrica)
    await db.commit()

    result = await db.execute(
        select(EmpleadoMetrica).options(
            selectinload(EmpleadoMetrica.empleado)
        ).where(EmpleadoMetrica.id == metrica.id)
    )
    return result.scalar_one()


# ==================== CAPACITACIONES ====================

@router.get("/capacitaciones", response_model=List[EmpleadoCapacitacionResponse])
async def get_capacitaciones(
    empleado_id: Optional[int] = None,
    vigentes: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Lista las capacitaciones de empleados."""
    query = select(EmpleadoCapacitacion).options(
        selectinload(EmpleadoCapacitacion.empleado)
    ).join(Empleado).where(Empleado.municipio_id == current_user.municipio_id)

    if empleado_id:
        query = query.where(EmpleadoCapacitacion.empleado_id == empleado_id)
    if vigentes is True:
        # Solo las que no tienen vencimiento o no han vencido
        query = query.where(
            (EmpleadoCapacitacion.fecha_vencimiento.is_(None)) |
            (EmpleadoCapacitacion.fecha_vencimiento >= date.today())
        )
    elif vigentes is False:
        # Solo las vencidas
        query = query.where(
            EmpleadoCapacitacion.fecha_vencimiento < date.today()
        )

    query = query.order_by(EmpleadoCapacitacion.fecha_fin.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/capacitaciones", response_model=EmpleadoCapacitacionResponse)
async def create_capacitacion(
    data: EmpleadoCapacitacionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Registra una capacitacion."""
    # Verificar empleado
    result = await db.execute(
        select(Empleado).where(
            Empleado.id == data.empleado_id,
            Empleado.municipio_id == current_user.municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    capacitacion = EmpleadoCapacitacion(**data.model_dump())
    db.add(capacitacion)
    await db.commit()

    result = await db.execute(
        select(EmpleadoCapacitacion).options(
            selectinload(EmpleadoCapacitacion.empleado)
        ).where(EmpleadoCapacitacion.id == capacitacion.id)
    )
    return result.scalar_one()


@router.put("/capacitaciones/{capacitacion_id}", response_model=EmpleadoCapacitacionResponse)
async def update_capacitacion(
    capacitacion_id: int,
    data: EmpleadoCapacitacionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Actualiza una capacitacion."""
    result = await db.execute(
        select(EmpleadoCapacitacion).options(
            selectinload(EmpleadoCapacitacion.empleado)
        ).where(EmpleadoCapacitacion.id == capacitacion_id)
    )
    capacitacion = result.scalar_one_or_none()
    if not capacitacion:
        raise HTTPException(status_code=404, detail="Capacitacion no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(capacitacion, key, value)

    await db.commit()
    await db.refresh(capacitacion)
    return capacitacion


@router.delete("/capacitaciones/{capacitacion_id}")
async def delete_capacitacion(
    capacitacion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Elimina una capacitacion."""
    result = await db.execute(
        select(EmpleadoCapacitacion).where(EmpleadoCapacitacion.id == capacitacion_id)
    )
    capacitacion = result.scalar_one_or_none()
    if not capacitacion:
        raise HTTPException(status_code=404, detail="Capacitacion no encontrada")

    await db.delete(capacitacion)
    await db.commit()
    return {"message": "Capacitacion eliminada"}


# ==================== HELPERS ====================

@router.get("/companeros/{empleado_id}")
async def get_companeros_cuadrilla(
    empleado_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    """
    Obtiene los IDs de todos los companeros de cuadrilla de un empleado.
    Util para filtrar reclamos en el tablero.
    """
    # Obtener cuadrillas donde participa el empleado
    result = await db.execute(
        select(EmpleadoCuadrilla.cuadrilla_id).where(
            EmpleadoCuadrilla.empleado_id == empleado_id,
            EmpleadoCuadrilla.activo == True
        )
    )
    cuadrilla_ids = [row[0] for row in result.fetchall()]

    if not cuadrilla_ids:
        return {"empleado_ids": [empleado_id], "cuadrilla_ids": []}

    # Obtener todos los empleados de esas cuadrillas
    result = await db.execute(
        select(EmpleadoCuadrilla.empleado_id).where(
            EmpleadoCuadrilla.cuadrilla_id.in_(cuadrilla_ids),
            EmpleadoCuadrilla.activo == True
        ).distinct()
    )
    empleado_ids = [row[0] for row in result.fetchall()]

    return {
        "empleado_ids": empleado_ids,
        "cuadrilla_ids": cuadrilla_ids
    }
