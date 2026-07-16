"""API de calificaciones de vecinos"""
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime

from core.database import get_db
from core.rate_limit import limiter
from core.security import get_current_user, require_roles, compute_calificacion_token
from models import User, Reclamo
from models.empleado import Empleado
from models.calificacion import Calificacion
from models.enums import EstadoReclamo

router = APIRouter()


def _validar_token_calificacion(reclamo_id: int, t: Optional[str]) -> None:
    """Exige que el ?t= del link coincida con el token HMAC del reclamo.
    404 genérico si falta o no coincide (no revela si el reclamo existe)."""
    esperado = compute_calificacion_token(reclamo_id)
    if not t or not secrets.compare_digest(str(t), esperado):
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")


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

    # Estado activo es FINALIZADO; RESUELTO queda como compat con datos legacy
    if reclamo.estado not in (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO):
        raise HTTPException(status_code=400, detail="Solo se pueden calificar reclamos finalizados")

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
    # Multi-tenant: la calificación solo es visible si el reclamo pertenece al
    # municipio del usuario (evita IDOR cross-tenant iterando reclamo_id).
    result = await db.execute(
        select(Calificacion)
        .join(Reclamo, Calificacion.reclamo_id == Reclamo.id)
        .where(
            Calificacion.reclamo_id == reclamo_id,
            Reclamo.municipio_id == current_user.municipio_id,
        )
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

    # Query base — multi-tenant: SIEMPRE join a Reclamo y filtro por el municipio
    # del usuario (sin esto el widget mezclaba calificaciones de TODOS los munis).
    query = (
        select(Calificacion)
        .join(Reclamo, Calificacion.reclamo_id == Reclamo.id)
        .where(
            Calificacion.created_at >= fecha_desde,
            Reclamo.municipio_id == current_user.municipio_id,
        )
    )

    # Filtros
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
    """Obtener ranking de empleados por promedio de calificación de sus reclamos.

    Usa el mismo join que el reporte ejecutivo (reportes.py): Reclamo.empleado_id
    → Empleado, y las estrellas de Calificacion sobre esos reclamos. Multi-tenant:
    solo empleados del municipio del usuario actual.
    """
    from datetime import timedelta

    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    result = await db.execute(
        select(
            Empleado.id,
            Empleado.nombre,
            Empleado.apellido,
            func.avg(Calificacion.puntuacion).label("promedio"),
            func.count(Calificacion.id).label("total_calificaciones"),
        )
        .join(Reclamo, Reclamo.empleado_id == Empleado.id)
        .join(Calificacion, Calificacion.reclamo_id == Reclamo.id)
        .where(
            Empleado.municipio_id == current_user.municipio_id,
            Calificacion.created_at >= fecha_desde,
        )
        .group_by(Empleado.id, Empleado.nombre, Empleado.apellido)
        .order_by(func.avg(Calificacion.puntuacion).desc())
    )

    ranking = [
        {
            "empleado_id": eid,
            "nombre": f"{nombre} {apellido or ''}".strip(),
            "promedio": round(float(promedio or 0), 2),
            "total_calificaciones": int(total),
        }
        for eid, nombre, apellido, promedio, total in result.all()
    ]

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
            Reclamo.estado.in_((EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO)),
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
@limiter.limit("30/minute")
async def get_info_calificacion_publica(
    request: Request,
    reclamo_id: int,
    t: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Obtener información del reclamo para la página de calificación pública.
    No requiere login, pero SÍ el token secreto (?t=) que viaja en el link.
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

    # Candado: sin el token secreto del link no se expone nada (evita el IDOR
    # cross-tenant iterando reclamo_id / el número REC-XXXXX).
    _validar_token_calificacion(reclamo.id, t)

    # Estado activo es FINALIZADO; RESUELTO queda como compat con datos legacy
    if reclamo.estado not in (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO):
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
@limiter.limit("30/minute")
async def crear_calificacion_publica(
    request: Request,
    reclamo_id: int,
    data: CalificacionPublicaCreate,
    t: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Crear calificación desde link público (WhatsApp).
    Sin login, pero exige el token secreto (?t=) del link; se asocia al creador.
    """
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Candado: sin el token secreto del link no se puede calificar (evita que
    # un tercero plante la calificación adivinando el id).
    _validar_token_calificacion(reclamo.id, t)

    # Estado activo es FINALIZADO; RESUELTO queda como compat con datos legacy
    if reclamo.estado not in (EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO):
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
