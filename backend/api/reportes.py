"""
API de Reportes - Generación de reportes PDF
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract
from datetime import datetime, date, timedelta
from typing import Optional
from calendar import monthrange

from core.database import get_db
from core.security import require_roles
from models.municipio import Municipio
from models.reclamo import Reclamo
from models.categoria import Categoria
from models.zona import Zona
from models.empleado import Empleado
from models.calificacion import Calificacion
from models.user import User
from models.enums import RolUsuario, EstadoReclamo
from services.pdf_report import generate_executive_report

router = APIRouter()


@router.get("/ejecutivo")
async def generar_reporte_ejecutivo(
    mes: int = Query(..., ge=1, le=12, description="Mes del reporte (1-12)"),
    anio: int = Query(..., ge=2020, le=2100, description="Año del reporte"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Genera un reporte ejecutivo mensual en PDF.
    Solo admin y supervisor pueden generar reportes.
    """
    # Obtener municipio del usuario
    municipio_id = current_user.municipio_id
    if not municipio_id:
        raise HTTPException(status_code=400, detail="Usuario sin municipio asignado")

    # Obtener datos del municipio
    result = await db.execute(select(Municipio).where(Municipio.id == municipio_id))
    municipio = result.scalar_one_or_none()
    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    # Calcular rango de fechas del mes
    _, last_day = monthrange(anio, mes)
    fecha_inicio = date(anio, mes, 1)
    fecha_fin = date(anio, mes, last_day)

    # Construir queries base
    base_filter = and_(
        Reclamo.municipio_id == municipio_id,
        func.date(Reclamo.created_at) >= fecha_inicio,
        func.date(Reclamo.created_at) <= fecha_fin,
    )

    # === ESTADISTICAS GENERALES ===
    # Total reclamos
    result = await db.execute(
        select(func.count(Reclamo.id)).where(base_filter)
    )
    total_reclamos = result.scalar() or 0

    # Resueltos
    result = await db.execute(
        select(func.count(Reclamo.id)).where(
            and_(base_filter, Reclamo.estado == EstadoReclamo.RESUELTO)
        )
    )
    resueltos = result.scalar() or 0

    # Pendientes (nuevo + asignado + en_curso)
    result = await db.execute(
        select(func.count(Reclamo.id)).where(
            and_(
                base_filter,
                Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO])
            )
        )
    )
    pendientes = result.scalar() or 0

    estadisticas = {
        "total": total_reclamos,
        "resueltos": resueltos,
        "pendientes": pendientes,
    }

    # === RECLAMOS POR ESTADO ===
    result = await db.execute(
        select(Reclamo.estado, func.count(Reclamo.id))
        .where(base_filter)
        .group_by(Reclamo.estado)
    )
    reclamos_por_estado = {}
    for estado, count in result.all():
        estado_label = {
            EstadoReclamo.NUEVO: "Nuevo",
            EstadoReclamo.ASIGNADO: "Asignado",
            EstadoReclamo.EN_CURSO: "En Proceso",
            EstadoReclamo.RESUELTO: "Resuelto",
            EstadoReclamo.RECHAZADO: "Rechazado",
        }.get(estado, str(estado))
        reclamos_por_estado[estado_label] = count

    # === RECLAMOS POR CATEGORIA ===
    result = await db.execute(
        select(Categoria.nombre, func.count(Reclamo.id))
        .join(Reclamo, Reclamo.categoria_id == Categoria.id)
        .where(base_filter)
        .group_by(Categoria.nombre)
    )
    reclamos_por_categoria = {nombre: count for nombre, count in result.all()}

    # === RECLAMOS POR ZONA ===
    result = await db.execute(
        select(Zona.nombre, func.count(Reclamo.id))
        .join(Reclamo, Reclamo.zona_id == Zona.id)
        .where(base_filter)
        .group_by(Zona.nombre)
    )
    reclamos_por_zona = {nombre: count for nombre, count in result.all()}

    # === TENDENCIA MENSUAL (ultimos 6 meses) ===
    tendencia_mensual = {}
    for i in range(5, -1, -1):
        fecha_mes = fecha_inicio - timedelta(days=30 * i)
        mes_label = fecha_mes.strftime("%b %Y")
        _, ultimo_dia = monthrange(fecha_mes.year, fecha_mes.month)
        mes_inicio = date(fecha_mes.year, fecha_mes.month, 1)
        mes_fin = date(fecha_mes.year, fecha_mes.month, ultimo_dia)

        result = await db.execute(
            select(func.count(Reclamo.id)).where(
                and_(
                    Reclamo.municipio_id == municipio_id,
                    func.date(Reclamo.created_at) >= mes_inicio,
                    func.date(Reclamo.created_at) <= mes_fin,
                )
            )
        )
        tendencia_mensual[mes_label] = result.scalar() or 0

    # === TOP EMPLEADOS ===
    # TODO: Migrar a dependencia cuando se implemente asignación por IA
    # Por ahora retorna lista vacía ya que no hay empleado_id en reclamos
    top_empleados = []

    # === METRICAS SLA ===
    # Por ahora un valor estimado, despues se puede calcular real
    sla_cumplimiento = 85.0 if resueltos > 0 else 0

    # Tiempo promedio de resolucion (en horas)
    result = await db.execute(
        select(
            func.avg(
                func.timestampdiff(
                    func.literal_column('HOUR'),
                    Reclamo.created_at,
                    Reclamo.fecha_resolucion
                )
            )
        ).where(
            and_(
                base_filter,
                Reclamo.estado == EstadoReclamo.RESUELTO,
                Reclamo.fecha_resolucion.isnot(None)
            )
        )
    )
    tiempo_promedio = result.scalar() or 48.0

    # Calificacion promedio general
    result = await db.execute(
        select(func.avg(Calificacion.puntuacion))
        .join(Reclamo, Reclamo.id == Calificacion.reclamo_id)
        .where(
            and_(
                Reclamo.municipio_id == municipio_id,
                func.date(Reclamo.created_at) >= fecha_inicio,
                func.date(Reclamo.created_at) <= fecha_fin,
            )
        )
    )
    calificacion_promedio = result.scalar() or 4.0

    # === GENERAR PDF ===
    meses_nombres = [
        "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    periodo = f"{meses_nombres[mes]} {anio}"

    pdf_buffer = generate_executive_report(
        municipio_nombre=municipio.nombre.replace("Municipalidad de ", ""),
        municipio_codigo=municipio.codigo,
        color_primario=municipio.color_primario or "#3b82f6",
        periodo=periodo,
        estadisticas=estadisticas,
        reclamos_por_categoria=reclamos_por_categoria,
        reclamos_por_zona=reclamos_por_zona,
        reclamos_por_estado=reclamos_por_estado,
        tendencia_mensual=tendencia_mensual,
        top_empleados=top_empleados,
        sla_cumplimiento=sla_cumplimiento,
        tiempo_promedio_resolucion=float(tiempo_promedio) if tiempo_promedio else 48.0,
        calificacion_promedio=float(calificacion_promedio) if calificacion_promedio else 4.0,
        logo_url=municipio.logo_url,
    )

    # Nombre del archivo
    filename = f"reporte_{municipio.codigo}_{anio}_{mes:02d}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
