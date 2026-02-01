"""API de auto-escalado de reclamos"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta

from core.database import get_db, AsyncSessionLocal
from core.security import require_roles
from models import User, Reclamo, Notificacion
from models.escalado import ConfiguracionEscalado, HistorialEscalado
from models.enums import EstadoReclamo

router = APIRouter()


# Schemas
class ConfiguracionEscaladoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    horas_sin_asignar: int = 24
    horas_sin_iniciar: int = 48
    horas_sin_resolver: int = 72
    categoria_id: Optional[int] = None
    prioridad_minima: Optional[int] = None
    accion: str = "notificar"  # notificar, reasignar, aumentar_prioridad
    notificar_a: Optional[str] = None
    aumentar_prioridad_en: int = 1
    activo: bool = True


class ConfiguracionEscaladoResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str]
    horas_sin_asignar: int
    horas_sin_iniciar: int
    horas_sin_resolver: int
    categoria_id: Optional[int]
    prioridad_minima: Optional[int]
    accion: str
    notificar_a: Optional[str]
    aumentar_prioridad_en: int
    activo: bool

    class Config:
        from_attributes = True


# CRUD de configuración

@router.get("/config", response_model=List[ConfiguracionEscaladoResponse])
async def get_configuraciones(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Obtener todas las configuraciones de escalado"""
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(ConfiguracionEscalado)
        .where(ConfiguracionEscalado.municipio_id == current_user.municipio_id)
        .order_by(ConfiguracionEscalado.nombre)
    )
    return result.scalars().all()


@router.post("/config", response_model=ConfiguracionEscaladoResponse)
async def crear_configuracion(
    data: ConfiguracionEscaladoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Crear nueva configuración de escalado"""
    # Multi-tenant: agregar municipio_id
    config = ConfiguracionEscalado(**data.model_dump(), municipio_id=current_user.municipio_id)
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/config/{config_id}", response_model=ConfiguracionEscaladoResponse)
async def actualizar_configuracion(
    config_id: int,
    data: ConfiguracionEscaladoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Actualizar configuración de escalado"""
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(ConfiguracionEscalado)
        .where(ConfiguracionEscalado.id == config_id)
        .where(ConfiguracionEscalado.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    for key, value in data.model_dump().items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/config/{config_id}")
async def eliminar_configuracion(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Eliminar configuración de escalado"""
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(ConfiguracionEscalado)
        .where(ConfiguracionEscalado.id == config_id)
        .where(ConfiguracionEscalado.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    await db.delete(config)
    await db.commit()
    return {"message": "Configuración eliminada"}


# Ejecución de escalado

async def ejecutar_escalado_automatico():
    """Función que ejecuta el escalado automático de reclamos"""
    async with AsyncSessionLocal() as db:
        ahora = datetime.utcnow()

        # Obtener configuraciones activas
        result = await db.execute(
            select(ConfiguracionEscalado)
            .where(ConfiguracionEscalado.activo == True)
            .options(selectinload(ConfiguracionEscalado.categoria))
        )
        configuraciones = result.scalars().all()

        escalados_realizados = []

        for config in configuraciones:
            # 1. Reclamos sin asignar
            fecha_limite_asignar = ahora - timedelta(hours=config.horas_sin_asignar)
            query_sin_asignar = select(Reclamo).where(
                Reclamo.estado == EstadoReclamo.NUEVO,
                Reclamo.created_at <= fecha_limite_asignar
            )
            if config.categoria_id:
                query_sin_asignar = query_sin_asignar.where(Reclamo.categoria_id == config.categoria_id)
            if config.prioridad_minima:
                query_sin_asignar = query_sin_asignar.where(Reclamo.prioridad <= config.prioridad_minima)

            result = await db.execute(query_sin_asignar)
            reclamos_sin_asignar = result.scalars().all()

            for reclamo in reclamos_sin_asignar:
                escalado = await _escalar_reclamo(db, reclamo, config, "sin_asignar")
                if escalado:
                    escalados_realizados.append(escalado)

            # 2. Reclamos asignados sin iniciar
            fecha_limite_iniciar = ahora - timedelta(hours=config.horas_sin_iniciar)
            query_sin_iniciar = select(Reclamo).where(
                Reclamo.estado == EstadoReclamo.ASIGNADO,
                Reclamo.updated_at <= fecha_limite_iniciar
            )
            if config.categoria_id:
                query_sin_iniciar = query_sin_iniciar.where(Reclamo.categoria_id == config.categoria_id)

            result = await db.execute(query_sin_iniciar)
            reclamos_sin_iniciar = result.scalars().all()

            for reclamo in reclamos_sin_iniciar:
                escalado = await _escalar_reclamo(db, reclamo, config, "sin_iniciar")
                if escalado:
                    escalados_realizados.append(escalado)

            # 3. Reclamos en proceso sin resolver
            fecha_limite_resolver = ahora - timedelta(hours=config.horas_sin_resolver)
            query_sin_resolver = select(Reclamo).where(
                Reclamo.estado == EstadoReclamo.EN_CURSO,
                Reclamo.updated_at <= fecha_limite_resolver
            )
            if config.categoria_id:
                query_sin_resolver = query_sin_resolver.where(Reclamo.categoria_id == config.categoria_id)

            result = await db.execute(query_sin_resolver)
            reclamos_sin_resolver = result.scalars().all()

            for reclamo in reclamos_sin_resolver:
                escalado = await _escalar_reclamo(db, reclamo, config, "sin_resolver")
                if escalado:
                    escalados_realizados.append(escalado)

        await db.commit()
        return escalados_realizados


async def _escalar_reclamo(db: AsyncSession, reclamo: Reclamo, config: ConfiguracionEscalado, tipo: str) -> Optional[dict]:
    """Ejecuta la acción de escalado sobre un reclamo"""
    from models.historial import HistorialReclamo

    # Verificar que no se haya escalado recientemente (últimas 24h)
    result = await db.execute(
        select(HistorialEscalado).where(
            HistorialEscalado.reclamo_id == reclamo.id,
            HistorialEscalado.tipo_escalado == tipo,
            HistorialEscalado.created_at >= datetime.utcnow() - timedelta(hours=24)
        )
    )
    if result.scalar_one_or_none():
        return None  # Ya fue escalado recientemente

    prioridad_anterior = reclamo.prioridad
    empleado_anterior = reclamo.empleado_id
    accion_tomada = config.accion

    # Ejecutar acción según configuración
    if config.accion == "aumentar_prioridad":
        nueva_prioridad = max(1, reclamo.prioridad - config.aumentar_prioridad_en)
        reclamo.prioridad = nueva_prioridad

    elif config.accion == "notificar":
        # Crear notificación para supervisores
        from models.enums import RolUsuario
        result = await db.execute(
            select(User).where(User.rol.in_([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
        )
        supervisores = result.scalars().all()

        for supervisor in supervisores:
            notif = Notificacion(
                usuario_id=supervisor.id,
                tipo="escalado",
                titulo=f"Reclamo escalado: {reclamo.titulo}",
                mensaje=f"El reclamo #{reclamo.id} ha sido escalado por {tipo.replace('_', ' ')} después de {getattr(config, f'horas_{tipo}')} horas",
                reclamo_id=reclamo.id
            )
            db.add(notif)

    # Registrar en historial de escalado
    historial = HistorialEscalado(
        reclamo_id=reclamo.id,
        configuracion_id=config.id,
        tipo_escalado=tipo,
        accion_tomada=accion_tomada,
        prioridad_anterior=prioridad_anterior,
        prioridad_nueva=reclamo.prioridad if config.accion == "aumentar_prioridad" else None,
        empleado_anterior_id=empleado_anterior,
        notificacion_enviada_a=config.notificar_a,
        comentario=f"Escalado automático: {tipo}"
    )
    db.add(historial)

    # Registrar en historial del reclamo
    historial_reclamo = HistorialReclamo(
        reclamo_id=reclamo.id,
        estado_anterior=reclamo.estado,
        estado_nuevo=reclamo.estado,
        accion="escalado",
        comentario=f"Escalado automático ({tipo}): {accion_tomada}"
    )
    db.add(historial_reclamo)

    return {
        "reclamo_id": reclamo.id,
        "tipo": tipo,
        "accion": accion_tomada
    }


@router.post("/ejecutar")
async def ejecutar_escalado_manual(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Ejecutar escalado automático manualmente"""
    background_tasks.add_task(ejecutar_escalado_automatico)
    return {"message": "Escalado iniciado en segundo plano"}


@router.get("/historial")
async def get_historial_escalado(
    reclamo_id: Optional[int] = None,
    dias: int = 7,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener historial de escalados"""
    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    query = select(HistorialEscalado).where(
        HistorialEscalado.created_at >= fecha_desde
    ).order_by(HistorialEscalado.created_at.desc())

    if reclamo_id:
        query = query.where(HistorialEscalado.reclamo_id == reclamo_id)

    result = await db.execute(query.options(selectinload(HistorialEscalado.reclamo)))
    historiales = result.scalars().all()

    return {
        "total": len(historiales),
        "historial": [
            {
                "id": h.id,
                "reclamo_id": h.reclamo_id,
                "reclamo_titulo": h.reclamo.titulo if h.reclamo else None,
                "tipo_escalado": h.tipo_escalado,
                "accion_tomada": h.accion_tomada,
                "prioridad_anterior": h.prioridad_anterior,
                "prioridad_nueva": h.prioridad_nueva,
                "comentario": h.comentario,
                "created_at": h.created_at.isoformat()
            }
            for h in historiales
        ]
    }


@router.get("/pendientes")
async def get_reclamos_pendientes_escalado(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Obtener reclamos que están próximos a ser escalados"""
    ahora = datetime.utcnow()

    # Obtener configuración por defecto (primera activa)
    result = await db.execute(
        select(ConfiguracionEscalado).where(ConfiguracionEscalado.activo == True).limit(1)
    )
    config = result.scalar_one_or_none()

    if not config:
        return {"message": "No hay configuración de escalado activa", "reclamos": []}

    # Buscar reclamos próximos a escalar (menos de 4 horas para el límite)
    margen_horas = 4

    reclamos_proximos = []

    # Sin asignar
    limite_asignar = ahora - timedelta(hours=config.horas_sin_asignar - margen_horas)
    result = await db.execute(
        select(Reclamo)
        .where(
            Reclamo.estado == EstadoReclamo.NUEVO,
            Reclamo.created_at <= limite_asignar,
            Reclamo.created_at > ahora - timedelta(hours=config.horas_sin_asignar)
        )
        .options(selectinload(Reclamo.categoria))
    )
    for r in result.scalars().all():
        horas_restantes = config.horas_sin_asignar - (ahora - r.created_at.replace(tzinfo=None)).total_seconds() / 3600
        reclamos_proximos.append({
            "id": r.id,
            "titulo": r.titulo,
            "categoria": r.categoria.nombre,
            "estado": r.estado.value,
            "tipo_escalado": "sin_asignar",
            "horas_restantes": round(horas_restantes, 1)
        })

    # Sin iniciar
    limite_iniciar = ahora - timedelta(hours=config.horas_sin_iniciar - margen_horas)
    result = await db.execute(
        select(Reclamo)
        .where(
            Reclamo.estado == EstadoReclamo.ASIGNADO,
            Reclamo.updated_at <= limite_iniciar,
            Reclamo.updated_at > ahora - timedelta(hours=config.horas_sin_iniciar)
        )
        .options(selectinload(Reclamo.categoria))
    )
    for r in result.scalars().all():
        horas_restantes = config.horas_sin_iniciar - (ahora - r.updated_at.replace(tzinfo=None)).total_seconds() / 3600
        reclamos_proximos.append({
            "id": r.id,
            "titulo": r.titulo,
            "categoria": r.categoria.nombre,
            "estado": r.estado.value,
            "tipo_escalado": "sin_iniciar",
            "horas_restantes": round(horas_restantes, 1)
        })

    # Ordenar por horas restantes
    reclamos_proximos.sort(key=lambda x: x["horas_restantes"])

    return {
        "config_activa": config.nombre,
        "total": len(reclamos_proximos),
        "reclamos": reclamos_proximos
    }
