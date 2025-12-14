from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from core.database import get_db
from core.security import require_roles
from models.user import User
from models.sla import SLAConfig, SLAViolacion
from models.reclamo import Reclamo
from models.categoria import Categoria
from models.enums import EstadoReclamo

router = APIRouter()


# Schemas
class SLAConfigCreate(BaseModel):
    categoria_id: Optional[int] = None
    prioridad: Optional[int] = None
    tiempo_respuesta: int = 24
    tiempo_resolucion: int = 72
    tiempo_alerta_amarilla: int = 48
    activo: bool = True


class SLAConfigResponse(BaseModel):
    id: int
    categoria_id: Optional[int]
    categoria_nombre: Optional[str] = None
    prioridad: Optional[int]
    tiempo_respuesta: int
    tiempo_resolucion: int
    tiempo_alerta_amarilla: int
    activo: bool

    class Config:
        from_attributes = True


class SLAEstadoReclamo(BaseModel):
    reclamo_id: int
    titulo: str
    categoria: str
    prioridad: int
    estado: str
    created_at: datetime
    tiempo_transcurrido_horas: float
    tiempo_limite_respuesta: int
    tiempo_limite_resolucion: int
    estado_sla: str  # 'ok', 'amarillo', 'rojo', 'vencido'
    porcentaje_tiempo_respuesta: float
    porcentaje_tiempo_resolucion: float
    horas_restantes_respuesta: Optional[float]
    horas_restantes_resolucion: Optional[float]


class SLAResumen(BaseModel):
    total_reclamos_activos: int
    en_tiempo: int
    en_riesgo: int  # amarillo
    vencidos: int
    porcentaje_cumplimiento: float
    tiempo_promedio_respuesta_horas: float
    tiempo_promedio_resolucion_horas: float


# Endpoints

@router.get("/config", response_model=List[SLAConfigResponse])
async def get_sla_configs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener todas las configuraciones de SLA"""
    result = await db.execute(
        select(SLAConfig)
        .options(selectinload(SLAConfig.categoria))
        .order_by(SLAConfig.categoria_id, SLAConfig.prioridad)
    )
    configs = result.scalars().all()

    return [
        SLAConfigResponse(
            id=c.id,
            categoria_id=c.categoria_id,
            categoria_nombre=c.categoria.nombre if c.categoria else "General (todas)",
            prioridad=c.prioridad,
            tiempo_respuesta=c.tiempo_respuesta,
            tiempo_resolucion=c.tiempo_resolucion,
            tiempo_alerta_amarilla=c.tiempo_alerta_amarilla,
            activo=c.activo
        )
        for c in configs
    ]


@router.post("/config", response_model=SLAConfigResponse)
async def create_sla_config(
    data: SLAConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Crear nueva configuración de SLA"""
    config = SLAConfig(**data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)

    # Cargar categoría si existe
    if config.categoria_id:
        result = await db.execute(
            select(Categoria).where(Categoria.id == config.categoria_id)
        )
        categoria = result.scalar_one_or_none()
        categoria_nombre = categoria.nombre if categoria else None
    else:
        categoria_nombre = "General (todas)"

    return SLAConfigResponse(
        id=config.id,
        categoria_id=config.categoria_id,
        categoria_nombre=categoria_nombre,
        prioridad=config.prioridad,
        tiempo_respuesta=config.tiempo_respuesta,
        tiempo_resolucion=config.tiempo_resolucion,
        tiempo_alerta_amarilla=config.tiempo_alerta_amarilla,
        activo=config.activo
    )


@router.put("/config/{config_id}", response_model=SLAConfigResponse)
async def update_sla_config(
    config_id: int,
    data: SLAConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Actualizar configuración de SLA"""
    result = await db.execute(select(SLAConfig).where(SLAConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    for key, value in data.model_dump().items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)

    if config.categoria_id:
        result = await db.execute(
            select(Categoria).where(Categoria.id == config.categoria_id)
        )
        categoria = result.scalar_one_or_none()
        categoria_nombre = categoria.nombre if categoria else None
    else:
        categoria_nombre = "General (todas)"

    return SLAConfigResponse(
        id=config.id,
        categoria_id=config.categoria_id,
        categoria_nombre=categoria_nombre,
        prioridad=config.prioridad,
        tiempo_respuesta=config.tiempo_respuesta,
        tiempo_resolucion=config.tiempo_resolucion,
        tiempo_alerta_amarilla=config.tiempo_alerta_amarilla,
        activo=config.activo
    )


@router.delete("/config/{config_id}")
async def delete_sla_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Eliminar configuración de SLA"""
    result = await db.execute(select(SLAConfig).where(SLAConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    await db.delete(config)
    await db.commit()
    return {"message": "Configuración eliminada"}


async def get_sla_for_reclamo(db: AsyncSession, categoria_id: int, prioridad: int) -> dict:
    """Obtener configuración de SLA aplicable a un reclamo"""
    # Buscar SLA específico para categoría y prioridad
    result = await db.execute(
        select(SLAConfig)
        .where(
            SLAConfig.categoria_id == categoria_id,
            SLAConfig.prioridad == prioridad,
            SLAConfig.activo == True
        )
    )
    config = result.scalar_one_or_none()

    if not config:
        # Buscar SLA para categoría (cualquier prioridad)
        result = await db.execute(
            select(SLAConfig)
            .where(
                SLAConfig.categoria_id == categoria_id,
                SLAConfig.prioridad.is_(None),
                SLAConfig.activo == True
            )
        )
        config = result.scalar_one_or_none()

    if not config:
        # Buscar SLA general
        result = await db.execute(
            select(SLAConfig)
            .where(
                SLAConfig.categoria_id.is_(None),
                SLAConfig.activo == True
            )
        )
        config = result.scalar_one_or_none()

    if config:
        return {
            "tiempo_respuesta": config.tiempo_respuesta,
            "tiempo_resolucion": config.tiempo_resolucion,
            "tiempo_alerta_amarilla": config.tiempo_alerta_amarilla
        }

    # Valores por defecto si no hay configuración
    return {
        "tiempo_respuesta": 24,
        "tiempo_resolucion": 72,
        "tiempo_alerta_amarilla": 48
    }


@router.get("/estado-reclamos", response_model=List[SLAEstadoReclamo])
async def get_sla_estado_reclamos(
    solo_activos: bool = True,
    solo_vencidos: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener estado de SLA de todos los reclamos"""
    query = select(Reclamo).options(selectinload(Reclamo.categoria))

    if solo_activos:
        query = query.where(
            Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
        )

    query = query.order_by(Reclamo.created_at.asc())
    result = await db.execute(query)
    reclamos = result.scalars().all()

    estados_sla = []
    ahora = datetime.utcnow()

    for r in reclamos:
        sla_config = await get_sla_for_reclamo(db, r.categoria_id, r.prioridad)

        tiempo_transcurrido = (ahora - r.created_at.replace(tzinfo=None)).total_seconds() / 3600

        # Calcular porcentajes
        porcentaje_respuesta = (tiempo_transcurrido / sla_config["tiempo_respuesta"]) * 100 if sla_config["tiempo_respuesta"] > 0 else 0
        porcentaje_resolucion = (tiempo_transcurrido / sla_config["tiempo_resolucion"]) * 100 if sla_config["tiempo_resolucion"] > 0 else 0

        # Determinar estado SLA
        if r.estado == EstadoReclamo.NUEVO:
            # Para reclamos nuevos, revisar tiempo de respuesta
            if porcentaje_respuesta >= 100:
                estado_sla = "vencido"
            elif porcentaje_respuesta >= (sla_config["tiempo_alerta_amarilla"] / sla_config["tiempo_respuesta"]) * 100:
                estado_sla = "amarillo"
            else:
                estado_sla = "ok"
        else:
            # Para reclamos asignados/en proceso, revisar tiempo de resolución
            if porcentaje_resolucion >= 100:
                estado_sla = "vencido"
            elif porcentaje_resolucion >= (sla_config["tiempo_alerta_amarilla"] / sla_config["tiempo_resolucion"]) * 100:
                estado_sla = "amarillo"
            else:
                estado_sla = "ok"

        horas_restantes_respuesta = max(0, sla_config["tiempo_respuesta"] - tiempo_transcurrido)
        horas_restantes_resolucion = max(0, sla_config["tiempo_resolucion"] - tiempo_transcurrido)

        if solo_vencidos and estado_sla != "vencido":
            continue

        estados_sla.append(SLAEstadoReclamo(
            reclamo_id=r.id,
            titulo=r.titulo,
            categoria=r.categoria.nombre,
            prioridad=r.prioridad,
            estado=r.estado.value,
            created_at=r.created_at,
            tiempo_transcurrido_horas=round(tiempo_transcurrido, 1),
            tiempo_limite_respuesta=sla_config["tiempo_respuesta"],
            tiempo_limite_resolucion=sla_config["tiempo_resolucion"],
            estado_sla=estado_sla,
            porcentaje_tiempo_respuesta=min(round(porcentaje_respuesta, 1), 100),
            porcentaje_tiempo_resolucion=min(round(porcentaje_resolucion, 1), 100),
            horas_restantes_respuesta=round(horas_restantes_respuesta, 1) if r.estado == EstadoReclamo.NUEVO else None,
            horas_restantes_resolucion=round(horas_restantes_resolucion, 1)
        ))

    return estados_sla


@router.get("/resumen", response_model=SLAResumen)
async def get_sla_resumen(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener resumen de cumplimiento de SLA"""
    # Obtener estados de todos los reclamos activos
    estados = await get_sla_estado_reclamos(
        solo_activos=True,
        solo_vencidos=False,
        db=db,
        current_user=current_user
    )

    total = len(estados)
    en_tiempo = sum(1 for e in estados if e.estado_sla == "ok")
    en_riesgo = sum(1 for e in estados if e.estado_sla == "amarillo")
    vencidos = sum(1 for e in estados if e.estado_sla == "vencido")

    porcentaje_cumplimiento = (en_tiempo / total * 100) if total > 0 else 100

    # Calcular tiempos promedio de reclamos resueltos (últimos 30 días)
    hace_30_dias = datetime.utcnow() - timedelta(days=30)
    result = await db.execute(
        select(Reclamo)
        .where(
            Reclamo.estado == EstadoReclamo.RESUELTO,
            Reclamo.fecha_resolucion >= hace_30_dias
        )
    )
    reclamos_resueltos = result.scalars().all()

    tiempos_respuesta = []
    tiempos_resolucion = []

    for r in reclamos_resueltos:
        if r.fecha_resolucion and r.created_at:
            tiempo_total = (r.fecha_resolucion.replace(tzinfo=None) - r.created_at.replace(tzinfo=None)).total_seconds() / 3600
            tiempos_resolucion.append(tiempo_total)

    tiempo_promedio_respuesta = 0  # Necesitaría historial para calcular esto correctamente
    tiempo_promedio_resolucion = sum(tiempos_resolucion) / len(tiempos_resolucion) if tiempos_resolucion else 0

    return SLAResumen(
        total_reclamos_activos=total,
        en_tiempo=en_tiempo,
        en_riesgo=en_riesgo,
        vencidos=vencidos,
        porcentaje_cumplimiento=round(porcentaje_cumplimiento, 1),
        tiempo_promedio_respuesta_horas=round(tiempo_promedio_respuesta, 1),
        tiempo_promedio_resolucion_horas=round(tiempo_promedio_resolucion, 1)
    )


@router.get("/alertas")
async def get_sla_alertas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener alertas de SLA (reclamos próximos a vencer o vencidos)"""
    estados = await get_sla_estado_reclamos(
        solo_activos=True,
        solo_vencidos=False,
        db=db,
        current_user=current_user
    )

    alertas = []
    for e in estados:
        if e.estado_sla in ["amarillo", "vencido"]:
            alertas.append({
                "reclamo_id": e.reclamo_id,
                "titulo": e.titulo,
                "categoria": e.categoria,
                "estado_reclamo": e.estado,
                "estado_sla": e.estado_sla,
                "tiempo_transcurrido_horas": e.tiempo_transcurrido_horas,
                "horas_restantes": e.horas_restantes_respuesta if e.estado == "nuevo" else e.horas_restantes_resolucion,
                "mensaje": f"{'VENCIDO' if e.estado_sla == 'vencido' else 'PRÓXIMO A VENCER'}: {e.titulo}",
                "prioridad": "alta" if e.estado_sla == "vencido" else "media"
            })

    # Ordenar por prioridad (vencidos primero) y luego por horas restantes
    alertas.sort(key=lambda x: (x["prioridad"] != "alta", x.get("horas_restantes") or 999))

    return {
        "total_alertas": len(alertas),
        "vencidos": sum(1 for a in alertas if a["estado_sla"] == "vencido"),
        "en_riesgo": sum(1 for a in alertas if a["estado_sla"] == "amarillo"),
        "alertas": alertas
    }
