"""API de calificaciones de vecinos"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime

from core.database import get_db
from core.security import get_current_user, require_roles
from models import User, Reclamo
from models.calificacion import Calificacion
from models.enums import EstadoReclamo

router = APIRouter()


# Schemas
class CalificacionCreate(BaseModel):
    reclamo_id: int
    puntuacion: int = Field(..., ge=1, le=5)
    tiempo_respuesta: Optional[int] = Field(None, ge=1, le=5)
    calidad_trabajo: Optional[int] = Field(None, ge=1, le=5)
    atencion: Optional[int] = Field(None, ge=1, le=5)
    comentario: Optional[str] = None
    tags: Optional[List[str]] = None


class CalificacionResponse(BaseModel):
    id: int
    reclamo_id: int
    puntuacion: int
    tiempo_respuesta: Optional[int]
    calidad_trabajo: Optional[int]
    atencion: Optional[int]
    comentario: Optional[str]
    tags: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class EstadisticasCalificaciones(BaseModel):
    total_calificaciones: int
    promedio_general: float
    promedio_tiempo_respuesta: float
    promedio_calidad_trabajo: float
    promedio_atencion: float
    distribucion: dict  # {1: 5, 2: 10, 3: 20, 4: 30, 5: 35}
    tags_frecuentes: List[dict]


# Endpoints

@router.post("", response_model=CalificacionResponse)
async def crear_calificacion(
    data: CalificacionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crear calificación para un reclamo resuelto"""
    # Verificar que el reclamo existe y está resuelto
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == data.reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.RESUELTO:
        raise HTTPException(status_code=400, detail="Solo se pueden calificar reclamos resueltos")

    if reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el creador del reclamo puede calificarlo")

    # Verificar que no existe calificación previa
    result = await db.execute(
        select(Calificacion).where(Calificacion.reclamo_id == data.reclamo_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este reclamo ya fue calificado")

    # Crear calificación
    calificacion = Calificacion(
        reclamo_id=data.reclamo_id,
        usuario_id=current_user.id,
        puntuacion=data.puntuacion,
        tiempo_respuesta=data.tiempo_respuesta,
        calidad_trabajo=data.calidad_trabajo,
        atencion=data.atencion,
        comentario=data.comentario,
        tags=",".join(data.tags) if data.tags else None
    )

    db.add(calificacion)
    await db.commit()
    await db.refresh(calificacion)

    return calificacion


@router.get("/reclamo/{reclamo_id}", response_model=CalificacionResponse)
async def get_calificacion_reclamo(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener calificación de un reclamo"""
    result = await db.execute(
        select(Calificacion).where(Calificacion.reclamo_id == reclamo_id)
    )
    calificacion = result.scalar_one_or_none()

    if not calificacion:
        raise HTTPException(status_code=404, detail="Calificación no encontrada")

    return calificacion


@router.get("/estadisticas", response_model=EstadisticasCalificaciones)
async def get_estadisticas_calificaciones(
    empleado_id: Optional[int] = None,
    categoria_id: Optional[int] = None,
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener estadísticas de calificaciones"""
    from datetime import timedelta

    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    # Query base
    query = select(Calificacion).where(Calificacion.created_at >= fecha_desde)

    # Filtros
    if empleado_id or categoria_id:
        query = query.join(Reclamo)
        if empleado_id:
            query = query.where(Reclamo.empleado_id == empleado_id)
        if categoria_id:
            query = query.where(Reclamo.categoria_id == categoria_id)

    result = await db.execute(query)
    calificaciones = result.scalars().all()

    if not calificaciones:
        return EstadisticasCalificaciones(
            total_calificaciones=0,
            promedio_general=0,
            promedio_tiempo_respuesta=0,
            promedio_calidad_trabajo=0,
            promedio_atencion=0,
            distribucion={1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
            tags_frecuentes=[]
        )

    # Calcular promedios
    total = len(calificaciones)
    promedio_general = sum(c.puntuacion for c in calificaciones) / total

    tiempos = [c.tiempo_respuesta for c in calificaciones if c.tiempo_respuesta]
    calidades = [c.calidad_trabajo for c in calificaciones if c.calidad_trabajo]
    atenciones = [c.atencion for c in calificaciones if c.atencion]

    promedio_tiempo = sum(tiempos) / len(tiempos) if tiempos else 0
    promedio_calidad = sum(calidades) / len(calidades) if calidades else 0
    promedio_atencion = sum(atenciones) / len(atenciones) if atenciones else 0

    # Distribución
    distribucion = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for c in calificaciones:
        distribucion[c.puntuacion] += 1

    # Tags frecuentes
    all_tags = []
    for c in calificaciones:
        if c.tags:
            all_tags.extend(c.tags.split(","))

    tag_count = {}
    for tag in all_tags:
        tag = tag.strip()
        tag_count[tag] = tag_count.get(tag, 0) + 1

    tags_frecuentes = [
        {"tag": tag, "count": count}
        for tag, count in sorted(tag_count.items(), key=lambda x: -x[1])[:10]
    ]

    return EstadisticasCalificaciones(
        total_calificaciones=total,
        promedio_general=round(promedio_general, 2),
        promedio_tiempo_respuesta=round(promedio_tiempo, 2),
        promedio_calidad_trabajo=round(promedio_calidad, 2),
        promedio_atencion=round(promedio_atencion, 2),
        distribucion=distribucion,
        tags_frecuentes=tags_frecuentes
    )


@router.get("/ranking-empleados")
async def get_ranking_empleados(
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener ranking de empleados por calificación"""
    from datetime import timedelta
    from models import Empleado

    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    # Obtener todos los empleados activos
    result = await db.execute(
        select(Empleado).where(Empleado.activo == True)
    )
    empleados = result.scalars().all()

    ranking = []
    for empleado in empleados:
        # Obtener calificaciones de reclamos de este empleado
        result = await db.execute(
            select(Calificacion)
            .join(Reclamo)
            .where(
                Reclamo.empleado_id == empleado.id,
                Calificacion.created_at >= fecha_desde
            )
        )
        calificaciones = result.scalars().all()

        if calificaciones:
            promedio = sum(c.puntuacion for c in calificaciones) / len(calificaciones)
            ranking.append({
                "empleado_id": empleado.id,
                "empleado_nombre": f"{empleado.nombre} {empleado.apellido or ''}".strip(),
                "total_calificaciones": len(calificaciones),
                "promedio": round(promedio, 2),
                "calificaciones_5_estrellas": sum(1 for c in calificaciones if c.puntuacion == 5),
                "calificaciones_bajas": sum(1 for c in calificaciones if c.puntuacion <= 2)
            })

    # Ordenar por promedio descendente
    ranking.sort(key=lambda x: (-x["promedio"], -x["total_calificaciones"]))

    return {
        "periodo_dias": dias,
        "total_empleados": len(ranking),
        "ranking": ranking
    }


@router.get("/pendientes")
async def get_calificaciones_pendientes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener reclamos resueltos sin calificar del usuario actual"""
    # Obtener reclamos resueltos del usuario que no tienen calificación
    result = await db.execute(
        select(Reclamo)
        .outerjoin(Calificacion)
        .where(
            Reclamo.creador_id == current_user.id,
            Reclamo.estado == EstadoReclamo.RESUELTO,
            Calificacion.id.is_(None)
        )
        .options(selectinload(Reclamo.categoria))
        .order_by(Reclamo.fecha_resolucion.desc())
    )
    reclamos = result.scalars().all()

    return {
        "total_pendientes": len(reclamos),
        "reclamos": [
            {
                "id": r.id,
                "titulo": r.titulo,
                "categoria": r.categoria.nombre,
                "fecha_resolucion": r.fecha_resolucion.isoformat() if r.fecha_resolucion else None
            }
            for r in reclamos
        ]
    }


# ============================================================
# ENDPOINT PÚBLICO PARA CALIFICACIÓN RÁPIDA (vía link WhatsApp)
# ============================================================

class CalificacionPublicaCreate(BaseModel):
    """Schema para calificación pública sin login"""
    puntuacion: int = Field(..., ge=1, le=5)
    comentario: Optional[str] = None


class ReclamoInfoCalificacion(BaseModel):
    """Info del reclamo para mostrar en página de calificación"""
    id: int
    titulo: str
    descripcion: str
    categoria: str
    fecha_resolucion: Optional[str]
    resolucion: Optional[str]
    ya_calificado: bool
    creador_nombre: str


@router.get("/calificar/{reclamo_id}", response_model=ReclamoInfoCalificacion)
async def get_info_calificacion_publica(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Obtener información del reclamo para la página de calificación pública.
    No requiere autenticación - se accede vía link directo.
    """
    result = await db.execute(
        select(Reclamo)
        .options(
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.creador)
        )
        .where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.RESUELTO:
        raise HTTPException(status_code=400, detail="Este reclamo aún no ha sido resuelto")

    # Verificar si ya fue calificado
    result = await db.execute(
        select(Calificacion).where(Calificacion.reclamo_id == reclamo_id)
    )
    ya_calificado = result.scalar_one_or_none() is not None

    return ReclamoInfoCalificacion(
        id=reclamo.id,
        titulo=reclamo.titulo,
        descripcion=reclamo.descripcion[:200] + "..." if len(reclamo.descripcion) > 200 else reclamo.descripcion,
        categoria=reclamo.categoria.nombre if reclamo.categoria else "Sin categoría",
        fecha_resolucion=reclamo.fecha_resolucion.isoformat() if reclamo.fecha_resolucion else None,
        resolucion=reclamo.resolucion,
        ya_calificado=ya_calificado,
        creador_nombre=reclamo.creador.nombre if reclamo.creador else "Anónimo"
    )


@router.post("/calificar/{reclamo_id}")
async def crear_calificacion_publica(
    reclamo_id: int,
    data: CalificacionPublicaCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Crear calificación desde link público (WhatsApp).
    No requiere autenticación - se asocia al creador del reclamo.
    """
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.RESUELTO:
        raise HTTPException(status_code=400, detail="Este reclamo aún no ha sido resuelto")

    # Verificar que no existe calificación previa
    result = await db.execute(
        select(Calificacion).where(Calificacion.reclamo_id == reclamo_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este reclamo ya fue calificado. ¡Gracias!")

    # Crear calificación asociada al creador del reclamo
    calificacion = Calificacion(
        reclamo_id=reclamo_id,
        usuario_id=reclamo.creador_id,
        puntuacion=data.puntuacion,
        comentario=data.comentario
    )

    db.add(calificacion)
    await db.commit()

    return {
        "success": True,
        "message": "¡Gracias por tu calificación!",
        "puntuacion": data.puntuacion
    }
