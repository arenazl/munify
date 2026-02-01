"""
Endpoints de analytics avanzados para el Dashboard.
- Mapa de calor (coordenadas de reclamos)
- Clustering de reclamos cercanos
- Distancia promedio de empleados
- Cobertura por zonas
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case
from datetime import datetime, timedelta
from typing import List, Optional
from math import radians, cos, sin, asin, sqrt

from core.database import get_db
from core.security import require_roles
from models.reclamo import Reclamo
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.empleado import Empleado
from models.configuracion import Configuracion
from models.municipio import Municipio
from models.enums import EstadoReclamo, RolUsuario

router = APIRouter()


def get_effective_municipio_id(request: Request, current_user: User) -> int:
    """Obtiene el municipio_id efectivo (del header X-Municipio-ID si es admin/supervisor)"""
    if current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        header_municipio_id = request.headers.get('X-Municipio-ID')
        if header_municipio_id:
            try:
                return int(header_municipio_id)
            except (ValueError, TypeError):
                pass
    return current_user.municipio_id


def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """
    Calcula la distancia en km entre dos puntos geográficos usando la fórmula de Haversine.
    """
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    km = 6371 * c
    return km


@router.get("/heatmap")
async def get_heatmap_data(
    request: Request,
    dias: int = Query(30, description="Últimos N días"),
    categoria_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtiene coordenadas de reclamos para el mapa de calor.
    Retorna puntos con latitud, longitud e intensidad (cantidad de reclamos cercanos).
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow() - timedelta(days=dias)

    query = select(
        Reclamo.latitud,
        Reclamo.longitud,
        Reclamo.estado,
        Reclamo.prioridad,
        Categoria.nombre.label('categoria')
    ).join(Categoria, Reclamo.categoria_id == Categoria.id).where(
        and_(
            Reclamo.latitud.isnot(None),
            Reclamo.longitud.isnot(None),
            Reclamo.created_at >= fecha_inicio,
            Reclamo.municipio_id == municipio_id
        )
    )

    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)

    result = await db.execute(query)
    reclamos = result.all()

    # Calcular intensidad basada en densidad de puntos cercanos
    points = []
    for r in reclamos:
        # Intensidad base según estado y prioridad
        intensidad = 1.0
        if r.estado == EstadoReclamo.NUEVO:
            intensidad = 1.5
        elif r.estado == EstadoReclamo.EN_CURSO:
            intensidad = 1.2

        # Ajustar por prioridad (1 = más urgente)
        if r.prioridad:
            intensidad *= (6 - r.prioridad) / 5

        points.append({
            "lat": r.latitud,
            "lng": r.longitud,
            "intensidad": round(intensidad, 2),
            "estado": r.estado.value if r.estado else "nuevo",
            "categoria": r.categoria
        })

    return {
        "puntos": points,
        "total": len(points),
        "periodo_dias": dias
    }


@router.get("/clusters")
async def get_clusters(
    request: Request,
    radio_km: float = Query(0.5, description="Radio en km para agrupar reclamos"),
    min_reclamos: int = Query(3, description="Mínimo de reclamos para formar cluster"),
    dias: int = Query(30, description="Últimos N días"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Agrupa reclamos cercanos en clusters para optimizar rutas de empleados.
    Usa un algoritmo simple de clustering basado en distancia.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow() - timedelta(days=dias)

    result = await db.execute(
        select(Reclamo).where(
            and_(
                Reclamo.latitud.isnot(None),
                Reclamo.longitud.isnot(None),
                Reclamo.created_at >= fecha_inicio,
                Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO]),
                Reclamo.municipio_id == municipio_id
            )
        )
    )
    reclamos = result.scalars().all()

    # Algoritmo simple de clustering
    clusters = []
    usados = set()

    for i, r1 in enumerate(reclamos):
        if i in usados:
            continue

        cluster_reclamos = [r1]
        usados.add(i)

        for j, r2 in enumerate(reclamos):
            if j in usados:
                continue

            dist = haversine(r1.longitud, r1.latitud, r2.longitud, r2.latitud)
            if dist <= radio_km:
                cluster_reclamos.append(r2)
                usados.add(j)

        if len(cluster_reclamos) >= min_reclamos:
            # Calcular centroide del cluster
            lat_centro = sum(r.latitud for r in cluster_reclamos) / len(cluster_reclamos)
            lon_centro = sum(r.longitud for r in cluster_reclamos) / len(cluster_reclamos)

            # Calcular prioridad promedio del cluster
            prioridad_promedio = sum(r.prioridad or 3 for r in cluster_reclamos) / len(cluster_reclamos)

            clusters.append({
                "id": len(clusters) + 1,
                "centro": {"lat": lat_centro, "lng": lon_centro},
                "cantidad": len(cluster_reclamos),
                "reclamos_ids": [r.id for r in cluster_reclamos],
                "prioridad_promedio": round(prioridad_promedio, 1),
                "radio_km": radio_km
            })

    # Ordenar por cantidad de reclamos (mayor a menor)
    clusters.sort(key=lambda x: x["cantidad"], reverse=True)

    return {
        "clusters": clusters,
        "total_clusters": len(clusters),
        "total_reclamos_agrupados": sum(c["cantidad"] for c in clusters),
        "parametros": {"radio_km": radio_km, "min_reclamos": min_reclamos}
    }


@router.get("/distancias")
async def get_distancias_empleados(
    request: Request,
    dias: int = Query(30, description="Últimos N días"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Calcula la distancia promedio recorrida por los empleados.
    Basado en las coordenadas de reclamos resueltos.

    TODO: Requiere agregar campo empleado_id a tabla reclamos para trackear
    qué empleado resolvió cada reclamo.
    """
    # Funcionalidad pendiente - requiere campo empleado_id en reclamos
    return {
        "empleados": [],
        "resumen": {
            "distancia_total_km": 0,
            "reclamos_total": 0,
            "distancia_promedio_por_reclamo_km": 0,
            "periodo_dias": dias
        },
        "mensaje": "Funcionalidad pendiente - requiere asignación de empleados a reclamos"
    }


@router.get("/cobertura")
async def get_cobertura_zonas(
    request: Request,
    dias: int = Query(30, description="Últimos N días"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Análisis de cobertura: qué zonas tienen más/menos atención.
    Compara reclamos recibidos vs resueltos por zona.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow() - timedelta(days=dias)

    # Reclamos por zona con estados (filtrado por municipio)
    result = await db.execute(
        select(
            Zona.id,
            Zona.nombre,
            func.count(Reclamo.id).label('total'),
            func.sum(case((Reclamo.estado == EstadoReclamo.RESUELTO, 1), else_=0)).label('resueltos'),
            func.sum(case((Reclamo.estado == EstadoReclamo.NUEVO, 1), else_=0)).label('pendientes'),
            func.sum(case((Reclamo.estado == EstadoReclamo.EN_CURSO, 1), else_=0)).label('en_curso'),
            func.avg(Reclamo.prioridad).label('prioridad_promedio')
        )
        .select_from(Zona)
        .outerjoin(Reclamo, and_(
            Reclamo.zona_id == Zona.id,
            Reclamo.created_at >= fecha_inicio,
            Reclamo.municipio_id == municipio_id
        ))
        .where(and_(Zona.activo == True, Zona.municipio_id == municipio_id))
        .group_by(Zona.id, Zona.nombre)
    )
    zonas = result.all()

    # Calcular métricas de cobertura
    cobertura_data = []
    total_reclamos = sum(z.total or 0 for z in zonas)

    for zona in zonas:
        # Convertir a int para evitar problemas con Decimal de SQLAlchemy
        total = int(zona.total or 0)
        resueltos = int(zona.resueltos or 0)
        pendientes = int(zona.pendientes or 0)
        en_curso = int(zona.en_curso or 0)

        # Tasa de resolución
        tasa_resolucion = (resueltos / total * 100) if total > 0 else 0.0

        # Porcentaje del total
        porcentaje_total = (total / total_reclamos * 100) if total_reclamos > 0 else 0.0

        # Indicador de atención (alto = bien atendida, bajo = necesita más atención)
        # Basado en tasa de resolución y pendientes
        if total == 0:
            indice_atencion = 100.0  # Sin reclamos = zona bien
        else:
            indice_atencion = (tasa_resolucion * 0.7) + ((1 - pendientes/total) * 30)

        cobertura_data.append({
            "zona_id": zona.id,
            "zona_nombre": zona.nombre,
            "total_reclamos": total,
            "resueltos": resueltos,
            "pendientes": pendientes,
            "en_curso": en_curso,
            "tasa_resolucion": round(tasa_resolucion, 1),
            "porcentaje_total": round(porcentaje_total, 1),
            "prioridad_promedio": round(zona.prioridad_promedio or 3, 1),
            "indice_atencion": round(indice_atencion, 1)
        })

    # Ordenar por índice de atención (menor a mayor = zonas que necesitan más atención primero)
    cobertura_data.sort(key=lambda x: x["indice_atencion"])

    # Identificar zonas críticas (bajo índice de atención y muchos reclamos)
    zonas_criticas = [z for z in cobertura_data if z["indice_atencion"] < 50 and z["total_reclamos"] > 0]

    return {
        "zonas": cobertura_data,
        "resumen": {
            "total_zonas": len(cobertura_data),
            "zonas_criticas": len(zonas_criticas),
            "tasa_resolucion_global": round(
                sum(z["resueltos"] for z in cobertura_data) / total_reclamos * 100, 1
            ) if total_reclamos > 0 else 0,
            "periodo_dias": dias
        },
        "alertas": zonas_criticas[:3]  # Top 3 zonas que necesitan atención
    }


@router.get("/tiempo-resolucion")
async def get_tiempo_resolucion_por_categoria(
    request: Request,
    dias: int = Query(90, description="Últimos N días"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Tiempo promedio de resolución por categoría.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow() - timedelta(days=dias)

    result = await db.execute(
        select(
            Categoria.nombre,
            Categoria.color,
            func.count(Reclamo.id).label('total'),
            func.avg(
                func.datediff(Reclamo.fecha_resolucion, Reclamo.created_at)
            ).label('dias_promedio')
        )
        .join(Reclamo, Reclamo.categoria_id == Categoria.id)
        .where(
            and_(
                Reclamo.estado == EstadoReclamo.RESUELTO,
                Reclamo.fecha_resolucion >= fecha_inicio,
                Reclamo.municipio_id == municipio_id
            )
        )
        .group_by(Categoria.id, Categoria.nombre, Categoria.color)
        .order_by(func.avg(func.datediff(Reclamo.fecha_resolucion, Reclamo.created_at)))
    )

    categorias = []
    for row in result.all():
        categorias.append({
            "categoria": row.nombre,
            "color": row.color,
            "total_resueltos": row.total,
            "dias_promedio": round(row.dias_promedio or 0, 1)
        })

    return {
        "categorias": categorias,
        "periodo_dias": dias
    }


@router.get("/rendimiento-empleados")
async def get_rendimiento_empleados(
    request: Request,
    semanas: int = Query(4, description="Últimas N semanas"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Rendimiento de empleados por semana.
    TODO: Migrar a dependencia cuando se implemente asignación por IA
    """
    # Por ahora retorna datos vacíos ya que no hay empleado_id en reclamos
    return {
        "semanas": [],
        "empleados": [],
        "mensaje": "Pendiente migración a dependencias"
    }
