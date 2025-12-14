from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timedelta
from io import BytesIO
import csv

from core.database import get_db
from core.security import require_roles
from models.user import User
from models.reclamo import Reclamo
from models.categoria import Categoria
from models.zona import Zona
from models.cuadrilla import Cuadrilla
from models.enums import EstadoReclamo

router = APIRouter()


@router.get("/reclamos/csv")
async def exportar_reclamos_csv(
    estado: Optional[str] = None,
    categoria_id: Optional[int] = None,
    zona_id: Optional[int] = None,
    cuadrilla_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Exportar reclamos a CSV"""
    query = select(Reclamo).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.zona),
        selectinload(Reclamo.creador),
        selectinload(Reclamo.cuadrilla_asignada)
    )

    # Aplicar filtros
    if estado:
        try:
            estado_enum = EstadoReclamo(estado.lower())
            query = query.where(Reclamo.estado == estado_enum)
        except ValueError:
            pass

    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)

    if zona_id:
        query = query.where(Reclamo.zona_id == zona_id)

    if cuadrilla_id:
        query = query.where(Reclamo.cuadrilla_id == cuadrilla_id)

    if fecha_desde:
        try:
            desde = datetime.fromisoformat(fecha_desde)
            query = query.where(Reclamo.created_at >= desde)
        except ValueError:
            pass

    if fecha_hasta:
        try:
            hasta = datetime.fromisoformat(fecha_hasta)
            query = query.where(Reclamo.created_at <= hasta)
        except ValueError:
            pass

    query = query.order_by(Reclamo.created_at.desc())
    result = await db.execute(query)
    reclamos = result.scalars().all()

    # Crear CSV
    output = BytesIO()

    # Escribir BOM para Excel
    output.write(b'\xef\xbb\xbf')

    # Crear writer con encoding UTF-8
    import codecs
    wrapper = codecs.getwriter('utf-8')(output)

    writer = csv.writer(wrapper, delimiter=';')

    # Encabezados
    writer.writerow([
        'ID',
        'Título',
        'Descripción',
        'Estado',
        'Prioridad',
        'Categoría',
        'Zona',
        'Dirección',
        'Creador',
        'Email Creador',
        'Empleado Asignado',
        'Fecha Creación',
        'Fecha Programada',
        'Hora Inicio',
        'Hora Fin',
        'Fecha Resolución',
        'Resolución',
        'Tiempo Resolución (días)'
    ])

    for r in reclamos:
        # Calcular tiempo de resolución
        tiempo_resolucion = None
        if r.fecha_resolucion and r.created_at:
            delta = r.fecha_resolucion.replace(tzinfo=None) - r.created_at.replace(tzinfo=None)
            tiempo_resolucion = round(delta.total_seconds() / 86400, 2)

        writer.writerow([
            r.id,
            r.titulo,
            r.descripcion[:200] if r.descripcion else '',
            r.estado.value if r.estado else '',
            r.prioridad,
            r.categoria.nombre if r.categoria else '',
            r.zona.nombre if r.zona else '',
            r.direccion,
            f"{r.creador.nombre} {r.creador.apellido}" if r.creador else '',
            r.creador.email if r.creador else '',
            f"{r.cuadrilla_asignada.nombre} {r.cuadrilla_asignada.apellido or ''}" if r.cuadrilla_asignada else '',
            r.created_at.strftime('%Y-%m-%d %H:%M') if r.created_at else '',
            r.fecha_programada.strftime('%Y-%m-%d') if r.fecha_programada else '',
            r.hora_inicio.strftime('%H:%M') if r.hora_inicio else '',
            r.hora_fin.strftime('%H:%M') if r.hora_fin else '',
            r.fecha_resolucion.strftime('%Y-%m-%d %H:%M') if r.fecha_resolucion else '',
            r.resolucion[:200] if r.resolucion else '',
            tiempo_resolucion or ''
        ])

    output.seek(0)

    # Nombre del archivo con fecha
    fecha_archivo = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"reclamos_{fecha_archivo}.csv"

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/estadisticas/csv")
async def exportar_estadisticas_csv(
    dias: int = Query(30, description="Días a incluir en el reporte"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Exportar estadísticas generales a CSV"""
    fecha_desde = datetime.utcnow() - timedelta(days=dias)

    # Estadísticas por estado
    result = await db.execute(
        select(Reclamo.estado, func.count(Reclamo.id))
        .where(Reclamo.created_at >= fecha_desde)
        .group_by(Reclamo.estado)
    )
    por_estado = {str(estado.value): count for estado, count in result.all()}

    # Estadísticas por categoría
    result = await db.execute(
        select(Categoria.nombre, func.count(Reclamo.id))
        .join(Reclamo, Reclamo.categoria_id == Categoria.id)
        .where(Reclamo.created_at >= fecha_desde)
        .group_by(Categoria.nombre)
    )
    por_categoria = result.all()

    # Estadísticas por zona
    result = await db.execute(
        select(Zona.nombre, func.count(Reclamo.id))
        .join(Reclamo, Reclamo.zona_id == Zona.id)
        .where(Reclamo.created_at >= fecha_desde)
        .group_by(Zona.nombre)
    )
    por_zona = result.all()

    # Estadísticas por empleado
    result = await db.execute(
        select(
            Cuadrilla.nombre,
            Cuadrilla.apellido,
            func.count(Reclamo.id).label('total'),
            func.count(Reclamo.id).filter(Reclamo.estado == EstadoReclamo.RESUELTO).label('resueltos')
        )
        .join(Reclamo, Reclamo.cuadrilla_id == Cuadrilla.id)
        .where(Reclamo.created_at >= fecha_desde)
        .group_by(Cuadrilla.id, Cuadrilla.nombre, Cuadrilla.apellido)
    )
    por_empleado = result.all()

    # Tiempo promedio de resolución
    result = await db.execute(
        select(Reclamo)
        .where(
            Reclamo.estado == EstadoReclamo.RESUELTO,
            Reclamo.fecha_resolucion.isnot(None),
            Reclamo.created_at >= fecha_desde
        )
    )
    reclamos_resueltos = result.scalars().all()

    tiempos = []
    for r in reclamos_resueltos:
        if r.fecha_resolucion and r.created_at:
            delta = r.fecha_resolucion.replace(tzinfo=None) - r.created_at.replace(tzinfo=None)
            tiempos.append(delta.total_seconds() / 86400)

    tiempo_promedio = sum(tiempos) / len(tiempos) if tiempos else 0

    # Crear CSV
    output = BytesIO()
    output.write(b'\xef\xbb\xbf')

    import codecs
    wrapper = codecs.getwriter('utf-8')(output)
    writer = csv.writer(wrapper, delimiter=';')

    # Resumen general
    writer.writerow([f'REPORTE DE ESTADÍSTICAS - Últimos {dias} días'])
    writer.writerow([f'Generado: {datetime.now().strftime("%Y-%m-%d %H:%M")}'])
    writer.writerow([])

    # Por estado
    writer.writerow(['RECLAMOS POR ESTADO'])
    writer.writerow(['Estado', 'Cantidad'])
    for estado, cantidad in por_estado.items():
        writer.writerow([estado, cantidad])
    writer.writerow([])

    # Por categoría
    writer.writerow(['RECLAMOS POR CATEGORÍA'])
    writer.writerow(['Categoría', 'Cantidad'])
    for nombre, cantidad in por_categoria:
        writer.writerow([nombre, cantidad])
    writer.writerow([])

    # Por zona
    writer.writerow(['RECLAMOS POR ZONA'])
    writer.writerow(['Zona', 'Cantidad'])
    for nombre, cantidad in por_zona:
        writer.writerow([nombre, cantidad])
    writer.writerow([])

    # Por empleado
    writer.writerow(['RENDIMIENTO POR EMPLEADO'])
    writer.writerow(['Empleado', 'Total Asignados', 'Resueltos', '% Resolución'])
    for nombre, apellido, total, resueltos in por_empleado:
        porcentaje = round((resueltos / total) * 100, 1) if total > 0 else 0
        writer.writerow([f"{nombre} {apellido or ''}", total, resueltos, f"{porcentaje}%"])
    writer.writerow([])

    # Tiempo promedio
    writer.writerow(['MÉTRICAS DE TIEMPO'])
    writer.writerow(['Tiempo promedio de resolución (días)', round(tiempo_promedio, 2)])

    output.seek(0)

    fecha_archivo = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"estadisticas_{fecha_archivo}.csv"

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/empleados/csv")
async def exportar_empleados_csv(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Exportar listado de empleados con sus métricas"""
    # Obtener empleados con estadísticas
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.categoria_principal),
            selectinload(Cuadrilla.zona_asignada),
            selectinload(Cuadrilla.categorias)
        )
        .where(Cuadrilla.activo == True)
    )
    empleados = result.scalars().all()

    output = BytesIO()
    output.write(b'\xef\xbb\xbf')

    import codecs
    wrapper = codecs.getwriter('utf-8')(output)
    writer = csv.writer(wrapper, delimiter=';')

    writer.writerow([
        'ID',
        'Nombre',
        'Apellido',
        'Categoría Principal',
        'Otras Categorías',
        'Zona Asignada',
        'Capacidad Máxima',
        'Activo'
    ])

    for emp in empleados:
        otras_cats = ', '.join([c.nombre for c in emp.categorias if c.id != emp.categoria_principal_id])

        writer.writerow([
            emp.id,
            emp.nombre,
            emp.apellido or '',
            emp.categoria_principal.nombre if emp.categoria_principal else '',
            otras_cats,
            emp.zona_asignada.nombre if emp.zona_asignada else '',
            emp.capacidad_maxima,
            'Sí' if emp.activo else 'No'
        ])

    output.seek(0)

    fecha_archivo = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"empleados_{fecha_archivo}.csv"

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@router.get("/sla/csv")
async def exportar_sla_csv(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Exportar estado de SLA de reclamos activos"""
    from api.sla import get_sla_estado_reclamos

    estados = await get_sla_estado_reclamos(
        solo_activos=True,
        solo_vencidos=False,
        db=db,
        current_user=current_user
    )

    output = BytesIO()
    output.write(b'\xef\xbb\xbf')

    import codecs
    wrapper = codecs.getwriter('utf-8')(output)
    writer = csv.writer(wrapper, delimiter=';')

    writer.writerow([
        'ID Reclamo',
        'Título',
        'Categoría',
        'Prioridad',
        'Estado Reclamo',
        'Estado SLA',
        'Fecha Creación',
        'Horas Transcurridas',
        'Límite Respuesta (hs)',
        'Límite Resolución (hs)',
        '% Tiempo Respuesta',
        '% Tiempo Resolución',
        'Horas Restantes'
    ])

    for e in estados:
        horas_restantes = e.horas_restantes_respuesta if e.estado == 'nuevo' else e.horas_restantes_resolucion

        writer.writerow([
            e.reclamo_id,
            e.titulo,
            e.categoria,
            e.prioridad,
            e.estado,
            e.estado_sla.upper(),
            e.created_at.strftime('%Y-%m-%d %H:%M'),
            e.tiempo_transcurrido_horas,
            e.tiempo_limite_respuesta,
            e.tiempo_limite_resolucion,
            f"{e.porcentaje_tiempo_respuesta}%",
            f"{e.porcentaje_tiempo_resolucion}%",
            horas_restantes or 0
        ])

    output.seek(0)

    fecha_archivo = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"sla_estado_{fecha_archivo}.csv"

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
