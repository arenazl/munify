"""Endpoints agregados del vecino — resumen cross-modulo para sidebar badges + recomendaciones."""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, and_
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.enums import RolUsuario
from models.reclamo import Reclamo
from models.tramite import Solicitud, EstadoSolicitud
from models.tasas import Partida, Deuda, EstadoDeuda, EstadoPartida, TipoTasa
from models.calificacion import Calificacion
from models.documento_solicitud import DocumentoSolicitud
from models.tramite_documento_requerido import TramiteDocumentoRequerido


router = APIRouter(prefix="/vecino", tags=["Vecino"])


class ResumenBadges(BaseModel):
    """Contadores para mostrar badges en sidebar/nav del vecino."""
    reclamos_pendientes: int
    tramites_pendientes: int
    tasas_pendientes: int  # boletas pendientes + vencidas


@router.get("/resumen-badges", response_model=ResumenBadges)
async def resumen_badges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve contadores cross-modulo para mostrar al vecino en sidebar.

    Se llama una vez al loguear + se refresca periódicamente (frontend decide).
    Rápido — solo 3 COUNTs paralelos.
    """
    # Solo tiene sentido para vecinos. Admin/supervisor recibe 0s.
    if current_user.rol != RolUsuario.VECINO or not current_user.municipio_id:
        return ResumenBadges(
            reclamos_pendientes=0,
            tramites_pendientes=0,
            tasas_pendientes=0,
        )

    # Reclamos pendientes — estados no terminados.
    # Los estados "activos" son: recibido, en_curso, pospuesto, pendiente_confirmacion
    # Terminados: finalizado, rechazado, resuelto
    estados_reclamo_pendientes = (
        "recibido", "en_curso", "pospuesto", "pendiente_confirmacion",
        "nuevo", "asignado", "en_proceso",  # legacy
    )
    rec_q = await db.execute(
        select(func.count(Reclamo.id)).where(
            Reclamo.creador_id == current_user.id,
            Reclamo.estado.in_(estados_reclamo_pendientes),
        )
    )
    reclamos_count = rec_q.scalar() or 0

    # Tramites pendientes — RECIBIDO o EN_CURSO o POSPUESTO.
    estados_tramite_pendientes = [
        EstadoSolicitud.RECIBIDO,
        EstadoSolicitud.EN_CURSO,
        EstadoSolicitud.POSPUESTO,
    ]
    tram_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.solicitante_id == current_user.id,
            Solicitud.estado.in_(estados_tramite_pendientes),
        )
    )
    tramites_count = tram_q.scalar() or 0

    # Tasas pendientes — partidas del vecino (por user_id o dni) con deudas
    # pendientes/vencidas.
    partida_match = [Partida.titular_user_id == current_user.id]
    if current_user.dni:
        partida_match.append(Partida.titular_dni == current_user.dni)

    tasas_q = await db.execute(
        select(func.count(Deuda.id))
        .join(Partida, Deuda.partida_id == Partida.id)
        .where(
            Partida.municipio_id == current_user.municipio_id,
            or_(*partida_match),
            Partida.estado == EstadoPartida.ACTIVA,
            Deuda.estado.in_([EstadoDeuda.PENDIENTE, EstadoDeuda.VENCIDA]),
        )
    )
    tasas_count = tasas_q.scalar() or 0

    return ResumenBadges(
        reclamos_pendientes=reclamos_count,
        tramites_pendientes=tramites_count,
        tasas_pendientes=tasas_count,
    )


# ============================================================
# Recomendaciones inteligentes (rule-based, sin LLM)
# ============================================================

class Recomendacion(BaseModel):
    tipo: str        # "tasas" | "reclamos" | "tramites" | "general"
    icono: str       # Lucide icon name
    color: str       # hex
    titulo: str
    descripcion: str
    accion_label: Optional[str] = None
    accion_url: Optional[str] = None
    prioridad: int = 5  # 1=urgente → 10=bajo


@router.get("/recomendaciones", response_model=List[Recomendacion])
async def recomendaciones_vecino(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera recomendaciones contextuales para el vecino basándose en su estado actual."""
    if current_user.rol != RolUsuario.VECINO or not current_user.municipio_id:
        return []

    recs: list[Recomendacion] = []
    ahora = datetime.utcnow()

    # --- TASAS ---
    partida_match = [Partida.titular_user_id == current_user.id]
    if current_user.dni:
        partida_match.append(Partida.titular_dni == current_user.dni)

    partida_filter = and_(
        Partida.municipio_id == current_user.municipio_id,
        or_(*partida_match),
        Partida.estado == EstadoPartida.ACTIVA,
    )

    # Deudas vencidas (urgente)
    vencidas_q = await db.execute(
        select(func.count(Deuda.id), func.coalesce(func.sum(Deuda.importe), 0))
        .join(Partida, Deuda.partida_id == Partida.id)
        .where(partida_filter, Deuda.estado == EstadoDeuda.VENCIDA)
    )
    vencidas_row = vencidas_q.one()
    cant_vencidas, monto_vencidas = vencidas_row[0], float(vencidas_row[1])
    if cant_vencidas > 0:
        recs.append(Recomendacion(
            tipo="tasas", icono="AlertTriangle", color="#ef4444",
            titulo=f"Tenés {cant_vencidas} {'boleta vencida' if cant_vencidas == 1 else 'boletas vencidas'}",
            descripcion=f"Total adeudado: ${monto_vencidas:,.0f}. Pagá cuanto antes para evitar recargos adicionales.",
            accion_label="Ver mis tasas",
            accion_url="/gestion/mis-tasas",
            prioridad=1,
        ))

    # Deudas próximas a vencer (dentro de 7 días)
    proximas_q = await db.execute(
        select(func.count(Deuda.id))
        .join(Partida, Deuda.partida_id == Partida.id)
        .where(
            partida_filter,
            Deuda.estado == EstadoDeuda.PENDIENTE,
            Deuda.fecha_vencimiento <= (ahora + timedelta(days=7)).date(),
            Deuda.fecha_vencimiento >= ahora.date(),
        )
    )
    cant_proximas = proximas_q.scalar() or 0
    if cant_proximas > 0:
        recs.append(Recomendacion(
            tipo="tasas", icono="Clock", color="#f59e0b",
            titulo=f"{cant_proximas} {'boleta vence' if cant_proximas == 1 else 'boletas vencen'} en los próximos 7 días",
            descripcion="Pagá antes del vencimiento y evitá recargos.",
            accion_label="Ver boletas",
            accion_url="/gestion/mis-tasas",
            prioridad=2,
        ))

    # Sin tasas asociadas (nunca reclamó partidas)
    partidas_q = await db.execute(
        select(func.count(Partida.id)).where(partida_filter)
    )
    cant_partidas = partidas_q.scalar() or 0
    if cant_partidas == 0:
        recs.append(Recomendacion(
            tipo="tasas", icono="Search", color="#6366f1",
            titulo="Asociá tus tasas municipales",
            descripcion="Vinculá tu ABL, patente u otras tasas a tu cuenta para verlas y pagarlas desde acá.",
            accion_label="Ir a Mis Tasas",
            accion_url="/gestion/mis-tasas",
            prioridad=7,
        ))

    # --- RECLAMOS ---
    # Reclamos resueltos sin calificar
    finalizados_q = await db.execute(
        select(Reclamo.id)
        .where(
            Reclamo.creador_id == current_user.id,
            Reclamo.estado.in_(["finalizado", "resuelto"]),
        )
    )
    ids_finalizados = [r[0] for r in finalizados_q.all()]

    if ids_finalizados:
        calificados_q = await db.execute(
            select(Calificacion.reclamo_id).where(
                Calificacion.reclamo_id.in_(ids_finalizados)
            )
        )
        calificados = {r[0] for r in calificados_q.all()}
        sin_calificar = [rid for rid in ids_finalizados if rid not in calificados]
        if sin_calificar:
            recs.append(Recomendacion(
                tipo="reclamos", icono="Star", color="#f59e0b",
                titulo=f"Calificá {'tu reclamo resuelto' if len(sin_calificar) == 1 else f'tus {len(sin_calificar)} reclamos resueltos'}",
                descripcion="Tu opinión ayuda al municipio a mejorar el servicio.",
                accion_label="Ver reclamos",
                accion_url="/gestion/mis-reclamos",
                prioridad=4,
            ))

    # Reclamo antiguo sin respuesta (>15 días en recibido)
    antiguos_q = await db.execute(
        select(func.count(Reclamo.id)).where(
            Reclamo.creador_id == current_user.id,
            Reclamo.estado == "recibido",
            Reclamo.created_at <= ahora - timedelta(days=15),
        )
    )
    cant_antiguos = antiguos_q.scalar() or 0
    if cant_antiguos > 0:
        recs.append(Recomendacion(
            tipo="reclamos", icono="Clock", color="#ef4444",
            titulo=f"{'Un reclamo lleva' if cant_antiguos == 1 else f'{cant_antiguos} reclamos llevan'} más de 15 días sin respuesta",
            descripcion="Si querés, podés agregar un comentario para impulsar la revisión.",
            accion_label="Ver reclamos",
            accion_url="/gestion/mis-reclamos",
            prioridad=3,
        ))

    # Sin reclamos activos → invitar a crear
    activos_q = await db.execute(
        select(func.count(Reclamo.id)).where(
            Reclamo.creador_id == current_user.id,
            Reclamo.estado.in_(("recibido", "en_curso", "pospuesto", "nuevo", "asignado", "en_proceso")),
        )
    )
    if (activos_q.scalar() or 0) == 0:
        recs.append(Recomendacion(
            tipo="reclamos", icono="PlusCircle", color="#22c55e",
            titulo="¿Notaste algún problema en tu barrio?",
            descripcion="Reportá baches, luminarias, residuos u otros inconvenientes y damos seguimiento.",
            accion_label="Nuevo reclamo",
            accion_url="/gestion/nuevo-reclamo",
            prioridad=8,
        ))

    # --- TRÁMITES ---
    # Trámites con documentación pendiente de subir
    tramites_recibidos = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.solicitante_id == current_user.id,
            Solicitud.estado == EstadoSolicitud.RECIBIDO,
        )
    )
    cant_recibidos = tramites_recibidos.scalar() or 0
    if cant_recibidos > 0:
        recs.append(Recomendacion(
            tipo="tramites", icono="Upload", color="#3b82f6",
            titulo=f"{'Un trámite necesita' if cant_recibidos == 1 else f'{cant_recibidos} trámites necesitan'} documentación",
            descripcion="Subí los documentos requeridos para que el municipio pueda avanzar con tu solicitud.",
            accion_label="Ver trámites",
            accion_url="/gestion/mis-tramites",
            prioridad=3,
        ))

    # Trámites en curso (positivo / progreso)
    en_curso_q = await db.execute(
        select(func.count(Solicitud.id)).where(
            Solicitud.solicitante_id == current_user.id,
            Solicitud.estado == EstadoSolicitud.EN_CURSO,
        )
    )
    cant_en_curso = en_curso_q.scalar() or 0
    if cant_en_curso > 0:
        recs.append(Recomendacion(
            tipo="tramites", icono="Loader", color="#10b981",
            titulo=f"{'Tu trámite está' if cant_en_curso == 1 else f'{cant_en_curso} trámites están'} en curso",
            descripcion="El municipio está procesando tu solicitud. Te notificaremos cuando haya novedades.",
            accion_label="Ver estado",
            accion_url="/gestion/mis-tramites",
            prioridad=6,
        ))

    # --- PERFIL ---
    if not current_user.dni:
        recs.append(Recomendacion(
            tipo="general", icono="ShieldCheck", color="#8b5cf6",
            titulo="Verificá tu identidad",
            descripcion="Con tu DNI verificado podés asociar tasas, hacer trámites y acceder a más funciones.",
            accion_label="Verificar",
            accion_url="/gestion/mi-panel",
            prioridad=5,
        ))

    recs.sort(key=lambda r: r.prioridad)
    return recs
