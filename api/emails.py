"""API de notificaciones por email"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta

from core.database import get_db
from core.security import require_roles
from models import User, Reclamo
from models.enums import EstadoReclamo, RolUsuario
from services.email_service import email_service, EmailTemplates

router = APIRouter()


class EmailTestRequest(BaseModel):
    to_email: EmailStr
    template: str = "test"


class EmailConfigUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_from_name: Optional[str] = None


@router.post("/test")
async def enviar_email_prueba(
    data: EmailTestRequest,
    current_user: User = Depends(require_roles(["admin"]))
):
    """Enviar email de prueba"""
    content = """
    <h2>🧪 Email de Prueba</h2>
    <p>Este es un email de prueba del Sistema de Reclamos Municipal.</p>
    <p>Si recibió este mensaje, la configuración de email está funcionando correctamente.</p>
    <p><strong>Enviado:</strong> {}</p>
    """.format(datetime.now().strftime("%d/%m/%Y %H:%M:%S"))

    html = EmailTemplates.base_template(content, "Email de Prueba")

    success = await email_service.send_email(
        to_email=data.to_email,
        subject="[PRUEBA] Sistema de Reclamos Municipal",
        body_html=html
    )

    if success:
        return {"message": f"Email de prueba enviado a {data.to_email}"}
    else:
        raise HTTPException(
            status_code=500,
            detail="No se pudo enviar el email. Verifique la configuración SMTP."
        )


@router.post("/notificar-reclamo/{reclamo_id}")
async def notificar_cambio_reclamo(
    reclamo_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Enviar notificación por email sobre un reclamo"""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Reclamo)
        .where(Reclamo.id == reclamo_id)
        .options(
            selectinload(Reclamo.creador),
            selectinload(Reclamo.categoria),
            selectinload(Reclamo.cuadrilla_asignada)
        )
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if not reclamo.creador.email:
        raise HTTPException(status_code=400, detail="El creador del reclamo no tiene email registrado")

    # Seleccionar template según estado
    if reclamo.estado == EstadoReclamo.NUEVO:
        html = EmailTemplates.reclamo_creado(
            reclamo.titulo, reclamo.id, reclamo.categoria.nombre
        )
        subject = f"Reclamo #{reclamo.id} registrado"

    elif reclamo.estado == EstadoReclamo.ASIGNADO:
        cuadrilla_nombre = f"{reclamo.cuadrilla_asignada.nombre} {reclamo.cuadrilla_asignada.apellido or ''}" if reclamo.cuadrilla_asignada else "Equipo municipal"
        fecha = reclamo.fecha_programada.strftime("%d/%m/%Y") if reclamo.fecha_programada else None
        html = EmailTemplates.reclamo_asignado(
            reclamo.titulo, reclamo.id, cuadrilla_nombre, fecha
        )
        subject = f"Reclamo #{reclamo.id} asignado"

    elif reclamo.estado == EstadoReclamo.EN_PROCESO:
        html = EmailTemplates.reclamo_en_proceso(reclamo.titulo, reclamo.id)
        subject = f"Reclamo #{reclamo.id} en proceso"

    elif reclamo.estado == EstadoReclamo.RESUELTO:
        html = EmailTemplates.reclamo_resuelto(
            reclamo.titulo, reclamo.id, reclamo.resolucion or "Reclamo solucionado"
        )
        subject = f"Reclamo #{reclamo.id} resuelto"

    else:
        raise HTTPException(status_code=400, detail=f"No hay template para estado {reclamo.estado}")

    # Enviar en background
    background_tasks.add_task(
        email_service.send_email,
        reclamo.creador.email,
        subject,
        html
    )

    return {"message": f"Notificación programada para {reclamo.creador.email}"}


@router.post("/resumen-diario")
async def enviar_resumen_diario(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Enviar resumen diario a supervisores"""
    from sqlalchemy.orm import selectinload

    hoy = datetime.utcnow().date()
    ayer = hoy - timedelta(days=1)

    # Obtener estadísticas del día
    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(func.date(Reclamo.created_at) == ayer)
    )
    nuevos = result.scalar() or 0

    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.estado == EstadoReclamo.ASIGNADO,
            func.date(Reclamo.updated_at) == ayer
        )
    )
    asignados = result.scalar() or 0

    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.estado == EstadoReclamo.RESUELTO,
            func.date(Reclamo.fecha_resolucion) == ayer
        )
    )
    resueltos = result.scalar() or 0

    result = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
        )
    )
    total_activos = result.scalar() or 0

    stats = {
        "nuevos": nuevos,
        "asignados": asignados,
        "resueltos": resueltos,
        "total_activos": total_activos,
        "tiempo_promedio": "24",
        "proximos_vencer": 0
    }

    html = EmailTemplates.resumen_diario(stats)
    subject = f"Resumen Diario - {ayer.strftime('%d/%m/%Y')}"

    # Obtener supervisores y admins
    result = await db.execute(
        select(User).where(
            User.rol.in_([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]),
            User.activo == True,
            User.email.isnot(None)
        )
    )
    destinatarios = [u.email for u in result.scalars().all() if u.email]

    if not destinatarios:
        return {"message": "No hay destinatarios configurados", "enviados": 0}

    # Enviar a todos
    for email in destinatarios:
        background_tasks.add_task(
            email_service.send_email,
            email,
            subject,
            html
        )

    return {
        "message": f"Resumen programado para {len(destinatarios)} destinatarios",
        "destinatarios": destinatarios
    }


@router.get("/estadisticas")
async def get_estadisticas_emails(
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """Obtener estadísticas de emails enviados (placeholder)"""
    # En una implementación real, esto consultaría una tabla de logs de emails
    return {
        "periodo_dias": dias,
        "total_enviados": 0,
        "por_tipo": {
            "reclamo_creado": 0,
            "reclamo_asignado": 0,
            "reclamo_resuelto": 0,
            "alertas": 0,
            "resumenes": 0
        },
        "tasa_entrega": 0,
        "mensaje": "Estadísticas no disponibles - configurar logging de emails"
    }
