from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from core.database import get_db
from core.security import require_roles, get_current_user
from models.reclamo import Reclamo
from models.user import User
from models.enums import EstadoReclamo, RolUsuario

router = APIRouter()


def get_effective_municipio_id(request: Request, current_user: User) -> int | None:
    """Obtiene el municipio_id efectivo (del header X-Municipio-ID si es admin/supervisor)"""
    if current_user.rol in [RolUsuario.ADMIN, RolUsuario.SUPERVISOR]:
        header_municipio_id = request.headers.get('X-Municipio-ID')
        if header_municipio_id:
            try:
                return int(header_municipio_id)
            except (ValueError, TypeError):
                pass
    return current_user.municipio_id


# =====================================================
# CONFIGURACIONES DE WIDGETS POR ROL
# =====================================================


# Schemas para configuración de widgets
class WidgetConfig(BaseModel):
    id: str
    tipo: str  # stat_card, chart, list, info_card, quick_actions
    titulo: str
    size: str  # small, medium, large, full
    orden: int
    config: dict  # Configuración específica del widget


class DashboardConfig(BaseModel):
    titulo: str
    subtitulo: str
    widgets: List[WidgetConfig]


# Configuraciones de dashboard por rol
def get_dashboard_config_vecino() -> DashboardConfig:
    """Dashboard para vecinos - enfocado en sus propios reclamos"""
    return DashboardConfig(
        titulo="Mi Panel",
        subtitulo="Resumen de tus reclamos y actividad",
        widgets=[
            WidgetConfig(
                id="mis_stats",
                tipo="stat_cards",
                titulo="Mis Reclamos",
                size="full",
                orden=1,
                config={
                    "cards": [
                        {"key": "total", "label": "Total", "icon": "FileText", "color": "primary"},
                        {"key": "pendientes", "label": "Pendientes", "icon": "Clock", "color": "#f59e0b"},
                        {"key": "resueltos", "label": "Resueltos", "icon": "CheckCircle", "color": "#10b981"},
                        {"key": "rechazados", "label": "Rechazados", "icon": "AlertCircle", "color": "#ef4444"},
                    ],
                    "endpoint": "/reclamos/mis-reclamos/stats"
                }
            ),
            WidgetConfig(
                id="reclamos_recientes",
                tipo="list",
                titulo="Reclamos Recientes",
                size="full",
                orden=2,
                config={
                    "endpoint": "/reclamos/mis-reclamos",
                    "limit": 3,
                    "showViewAll": True,
                    "viewAllLink": "/mis-reclamos"
                }
            ),
            WidgetConfig(
                id="info_municipio",
                tipo="info_card",
                titulo="Tu Municipio",
                size="full",
                orden=3,
                config={
                    "endpoint": "/publico/estadisticas",
                    "fields": [
                        {"key": "tasa_resolucion", "label": "Tasa de resolución", "suffix": "%", "icon": "TrendingUp"},
                        {"key": "tiempo_promedio_resolucion_dias", "label": "Días promedio", "icon": "Clock"},
                        {"key": "calificacion_promedio", "label": "Calificación", "icon": "Star"},
                        {"key": "total_reclamos", "label": "Total atendidos", "icon": "BarChart3"},
                    ]
                }
            ),
            WidgetConfig(
                id="acciones_rapidas",
                tipo="quick_actions",
                titulo="Acciones Rápidas",
                size="full",
                orden=4,
                config={
                    "actions": [
                        {"label": "Nuevo Reclamo", "icon": "PlusCircle", "link": "/nuevo-reclamo", "primary": True},
                        {"label": "Mis Reclamos", "icon": "FileText", "link": "/mis-reclamos"},
                        {"label": "Ver Mapa", "icon": "MapPin", "link": "/mapa"},
                    ]
                }
            ),
        ]
    )


def get_dashboard_config_empleado() -> DashboardConfig:
    """Dashboard para empleados - enfocado en trabajo asignado"""
    return DashboardConfig(
        titulo="Mi Trabajo",
        subtitulo="Tareas asignadas y pendientes",
        widgets=[
            WidgetConfig(
                id="trabajo_stats",
                tipo="stat_cards",
                titulo="Resumen del Día",
                size="full",
                orden=1,
                config={
                    "cards": [
                        {"key": "asignados_hoy", "label": "Asignados Hoy", "icon": "Calendar", "color": "#3b82f6"},
                        {"key": "en_curso", "label": "En Proceso", "icon": "Wrench", "color": "#f59e0b"},
                        {"key": "completados_hoy", "label": "Completados Hoy", "icon": "CheckCircle", "color": "#10b981"},
                        {"key": "pendientes", "label": "Pendientes", "icon": "Clock", "color": "#8b5cf6"},
                    ],
                    "endpoint": "/dashboard/empleado-stats"
                }
            ),
            WidgetConfig(
                id="proximos_trabajos",
                tipo="list",
                titulo="Próximos Trabajos",
                size="full",
                orden=2,
                config={
                    "endpoint": "/reclamos/mis-asignados",
                    "limit": 5,
                    "showViewAll": True,
                    "viewAllLink": "/tablero"
                }
            ),
            WidgetConfig(
                id="acciones_rapidas",
                tipo="quick_actions",
                titulo="Acciones",
                size="full",
                orden=3,
                config={
                    "actions": [
                        {"label": "Ver Tablero", "icon": "Kanban", "link": "/tablero", "primary": True},
                        {"label": "Ver Mapa", "icon": "MapPin", "link": "/mapa"},
                    ]
                }
            ),
        ]
    )


def get_dashboard_config_supervisor() -> DashboardConfig:
    """Dashboard para supervisores - vista general + gestión"""
    return DashboardConfig(
        titulo="Dashboard",
        subtitulo="Resumen general de operaciones",
        widgets=[
            WidgetConfig(
                id="stats_generales",
                tipo="stat_cards",
                titulo="Estadísticas Generales",
                size="full",
                orden=1,
                config={
                    "cards": [
                        {"key": "total", "label": "Total Reclamos", "icon": "ClipboardList", "color": "primary"},
                        {"key": "hoy", "label": "Hoy", "icon": "Calendar", "color": "#3b82f6"},
                        {"key": "semana", "label": "Esta Semana", "icon": "TrendingUp", "color": "#10b981"},
                        {"key": "tiempo_promedio_dias", "label": "Días Promedio", "icon": "Clock", "color": "#f59e0b"},
                    ],
                    "endpoint": "/dashboard/stats"
                }
            ),
            WidgetConfig(
                id="por_estado",
                tipo="chart_pie",
                titulo="Por Estado",
                size="medium",
                orden=2,
                config={"endpoint": "/dashboard/stats", "dataKey": "por_estado"}
            ),
            WidgetConfig(
                id="por_categoria",
                tipo="chart_bar",
                titulo="Por Categoría",
                size="medium",
                orden=3,
                config={"endpoint": "/dashboard/por-categoria"}
            ),
            WidgetConfig(
                id="tendencia",
                tipo="chart_line",
                titulo="Tendencia (30 días)",
                size="full",
                orden=4,
                config={"endpoint": "/dashboard/tendencia", "dias": 30}
            ),
            WidgetConfig(
                id="por_zona",
                tipo="chart_bar_horizontal",
                titulo="Por Zona",
                size="full",
                orden=5,
                config={"endpoint": "/dashboard/por-zona", "limit": 8}
            ),
        ]
    )


def get_dashboard_config_admin() -> DashboardConfig:
    """Dashboard para admin - todo lo del supervisor + analytics avanzados"""
    config = get_dashboard_config_supervisor()
    config.subtitulo = "Panel de administración completo"

    # Agregar widgets adicionales para admin
    config.widgets.extend([
        WidgetConfig(
            id="cobertura_zonas",
            tipo="chart_coverage",
            titulo="Cobertura por Zona",
            size="medium",
            orden=6,
            config={"endpoint": "/analytics/cobertura"}
        ),
        WidgetConfig(
            id="rendimiento_empleados",
            tipo="chart_performance",
            titulo="Rendimiento Empleados",
            size="medium",
            orden=7,
            config={"endpoint": "/analytics/rendimiento-empleados"}
        ),
        WidgetConfig(
            id="tiempo_resolucion",
            tipo="chart_bar",
            titulo="Tiempo Resolución por Categoría",
            size="full",
            orden=8,
            config={"endpoint": "/analytics/tiempo-resolucion"}
        ),
    ])

    return config


@router.get("/config", response_model=DashboardConfig)
async def get_dashboard_config(
    current_user: User = Depends(get_current_user)
):
    """Obtener configuración del dashboard según el rol del usuario"""
    if current_user.rol == RolUsuario.ADMIN:
        return get_dashboard_config_admin()
    elif current_user.rol == RolUsuario.SUPERVISOR:
        return get_dashboard_config_supervisor()
    elif current_user.rol == RolUsuario.EMPLEADO:
        return get_dashboard_config_empleado()
    else:  # vecino
        return get_dashboard_config_vecino()


@router.get("/mis-stats")
async def get_mis_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Estadísticas personales del usuario (para vecinos)"""
    query = await db.execute(
        select(Reclamo.estado, func.count(Reclamo.id))
        .where(Reclamo.usuario_id == current_user.id)
        .group_by(Reclamo.estado)
    )
    estados = {estado.value: count for estado, count in query.all()}

    total = sum(estados.values())
    pendientes = estados.get('nuevo', 0) + estados.get('ASIGNADO', 0) + estados.get('en_curso', 0)

    return {
        "total": total,
        "pendientes": pendientes,
        "nuevos": estados.get('nuevo', 0),
        "asignados": estados.get('asignado', 0),
        "en_curso": estados.get('en_curso', 0),
        "resueltos": estados.get('resuelto', 0),
        "rechazados": estados.get('rechazado', 0),
    }


@router.get("/empleado-stats")
async def get_empleado_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["empleado"]))
):
    """Estadisticas para empleados - trabajo asignado
    TODO: Migrar a dependencia cuando se implemente asignación por IA
    """
    # Por ahora retorna 0s ya que no hay empleado_id en reclamos
    # Se migrará a dependencia_id cuando se implemente IA
    return {
        "asignados_hoy": 0,
        "en_curso": 0,
        "completados_hoy": 0,
        "pendientes": 0,
        "mensaje": "Pendiente migración a dependencias"
    }


@router.get("/stats")
async def get_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)

    # Total de reclamos por estado
    estados_query = await db.execute(
        select(Reclamo.estado, func.count(Reclamo.id))
        .where(Reclamo.municipio_id == municipio_id)
        .group_by(Reclamo.estado)
    )
    estados = {estado.value: count for estado, count in estados_query.all()}

    # Total general
    total = sum(estados.values())

    # Reclamos de hoy
    hoy = datetime.utcnow().date()
    hoy_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            func.date(Reclamo.created_at) == hoy
        )
    )
    hoy_count = hoy_query.scalar()

    # Reclamos de esta semana
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    semana_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            func.date(Reclamo.created_at) >= inicio_semana
        )
    )
    semana_count = semana_query.scalar()

    # Tiempo promedio de resolución (en días) - compatible con MySQL
    resueltos_query = await db.execute(
        select(
            func.avg(
                func.datediff(Reclamo.fecha_resolucion, Reclamo.created_at)
            )
        ).where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.RESUELTO
        )
    )
    tiempo_promedio = resueltos_query.scalar() or 0

    return {
        "total": total,
        "por_estado": estados,
        "hoy": hoy_count,
        "semana": semana_count,
        "tiempo_promedio_dias": round(tiempo_promedio, 1)
    }

@router.get("/por-categoria")
async def get_por_categoria(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    from models.categoria import Categoria
    municipio_id = get_effective_municipio_id(request, current_user)

    query = await db.execute(
        select(Categoria.nombre, func.count(Reclamo.id))
        .join(Reclamo, Reclamo.categoria_id == Categoria.id)
        .where(Reclamo.municipio_id == municipio_id)
        .group_by(Categoria.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )
    result = [{"categoria": nombre, "cantidad": count} for nombre, count in query.all()]

    return result


@router.get("/conteo-categorias")
async def get_conteo_categorias(
    request: Request,
    estado: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    """
    Endpoint optimizado que devuelve el conteo de reclamos por categoría
    sin traer todos los datos. Mucho más eficiente que traer todos los reclamos.
    Para empleados: solo cuenta reclamos asignados a él o su cuadrilla.
    """
    from models.categoria import Categoria
    from sqlalchemy import and_, or_

    municipio_id = get_effective_municipio_id(request, current_user)

    # Construir condiciones base
    conditions = [Reclamo.municipio_id == municipio_id]
    if estado:
        conditions.append(Reclamo.estado == estado)

    # TODO: Migrar filtro de empleado a dependencia cuando se implemente IA
    # Por ahora, empleados ven todos los reclamos del municipio
    # if current_user.rol == RolUsuario.EMPLEADO:
    #     conditions.append(Reclamo.municipio_dependencia_id == current_user.dependencia_id)

    query = await db.execute(
        select(
            Categoria.id,
            Categoria.nombre,
            func.count(Reclamo.id).label('cantidad')
        )
        .join(Reclamo, Reclamo.categoria_id == Categoria.id, isouter=True)
        .where(and_(*conditions))
        .group_by(Categoria.id, Categoria.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )

    result = [
        {
            "categoria_id": cat_id,
            "categoria": nombre,
            "cantidad": count or 0
        }
        for cat_id, nombre, count in query.all()
    ]

    return result

@router.get("/conteo-estados")
async def get_conteo_estados(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    """
    Endpoint optimizado que devuelve el conteo de reclamos por estado.
    Para empleados: solo cuenta reclamos asignados a él o su cuadrilla.
    """
    from sqlalchemy import or_

    municipio_id = get_effective_municipio_id(request, current_user)

    # Construir condiciones base
    conditions = [Reclamo.municipio_id == municipio_id]

    # Filtrar por dependencia si es empleado
    if current_user.rol == RolUsuario.EMPLEADO and current_user.municipio_dependencia_id:
        conditions.append(Reclamo.municipio_dependencia_id == current_user.municipio_dependencia_id)

    query = await db.execute(
        select(
            Reclamo.estado,
            func.count(Reclamo.id).label('cantidad')
        )
        .where(*conditions)
        .group_by(Reclamo.estado)
    )

    result = [
        {
            "estado": estado,
            "cantidad": count or 0
        }
        for estado, count in query.all()
    ]

    return result

@router.get("/por-zona")
async def get_por_zona(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    from models.zona import Zona
    from sqlalchemy import and_
    municipio_id = get_effective_municipio_id(request, current_user)

    # LEFT JOIN para incluir todas las zonas activas del municipio, incluso sin reclamos
    query = await db.execute(
        select(Zona.nombre, func.count(Reclamo.id))
        .select_from(Zona)
        .outerjoin(Reclamo, and_(
            Reclamo.zona_id == Zona.id,
            Reclamo.municipio_id == municipio_id
        ))
        .where(and_(Zona.activo == True, Zona.municipio_id == municipio_id))
        .group_by(Zona.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )
    result = [{"zona": nombre, "cantidad": count} for nombre, count in query.all()]

    return result

@router.get("/tendencia")
async def get_tendencia(
    request: Request,
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow().date() - timedelta(days=dias)

    query = await db.execute(
        select(
            func.date(Reclamo.created_at).label('fecha'),
            func.count(Reclamo.id)
        )
        .where(
            Reclamo.municipio_id == municipio_id,
            func.date(Reclamo.created_at) >= fecha_inicio
        )
        .group_by(func.date(Reclamo.created_at))
        .order_by(func.date(Reclamo.created_at))
    )

    result = [{"fecha": str(fecha), "cantidad": count} for fecha, count in query.all()]

    return result


@router.get("/metricas-accion")
async def get_metricas_accion(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Métricas accionables para el resumen del dashboard"""
    from models.empleado import Empleado
    from models.zona import Zona
    from sqlalchemy import and_, case

    municipio_id = get_effective_municipio_id(request, current_user)
    hoy = datetime.utcnow().date()
    hace_7_dias = hoy - timedelta(days=7)
    hace_14_dias = hoy - timedelta(days=14)

    # 1. Reclamos urgentes (prioridad alta, no resueltos, más de 3 días)
    urgentes_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.prioridad >= 4,
            Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.created_at) <= hoy - timedelta(days=3)
        )
    )
    urgentes = urgentes_query.scalar() or 0

    # 2. Sin asignar (nuevos que llevan más de 24h)
    sin_asignar_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.NUEVO,
            func.date(Reclamo.created_at) < hoy
        )
    )
    sin_asignar = sin_asignar_query.scalar() or 0

    # 3. Vencidos (asignados con fecha_programada pasada y no resueltos)
    vencidos_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            Reclamo.fecha_programada != None,
            func.date(Reclamo.fecha_programada) < hoy
        )
    )
    vencidos = vencidos_query.scalar() or 0

    # 4. Para hoy (programados para hoy)
    para_hoy_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.fecha_programada) == hoy
        )
    )
    para_hoy = para_hoy_query.scalar() or 0

    # 5. Eficiencia semanal (resueltos esta semana vs semana anterior)
    resueltos_semana_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.RESUELTO,
            func.date(Reclamo.fecha_resolucion) >= hace_7_dias
        )
    )
    resueltos_semana = resueltos_semana_query.scalar() or 0

    resueltos_semana_ant_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.RESUELTO,
            func.date(Reclamo.fecha_resolucion) >= hace_14_dias,
            func.date(Reclamo.fecha_resolucion) < hace_7_dias
        )
    )
    resueltos_semana_ant = resueltos_semana_ant_query.scalar() or 0

    if resueltos_semana_ant > 0:
        cambio_eficiencia = round(((resueltos_semana - resueltos_semana_ant) / resueltos_semana_ant) * 100)
    else:
        cambio_eficiencia = 100 if resueltos_semana > 0 else 0

    # 6. Empleados activos - TODO: Migrar a dependencias cuando se implemente IA
    # Por ahora retornamos 0 ya que no hay empleado_id en reclamos
    empleados_activos = 0

    # Total empleados
    total_empleados_query = await db.execute(
        select(func.count(Empleado.id))
        .where(Empleado.municipio_id == municipio_id, Empleado.activo == True)
    )
    total_empleados = total_empleados_query.scalar() or 0

    return {
        "urgentes": urgentes,
        "sin_asignar": sin_asignar,
        "vencidos": vencidos,
        "para_hoy": para_hoy,
        "resueltos_semana": resueltos_semana,
        "cambio_eficiencia": cambio_eficiencia,
        "empleados_activos": empleados_activos,
        "total_empleados": total_empleados
    }


class ReclamoResumen(BaseModel):
    """Resumen de reclamo para las métricas"""
    id: int
    titulo: str
    direccion: Optional[str]
    categoria: str
    zona: Optional[str]
    dias_antiguedad: int
    prioridad: int

    class Config:
        from_attributes = True


@router.get("/metricas-detalle")
async def get_metricas_detalle(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Métricas con detalle de reclamos para cada tarjeta"""
    from models.categoria import Categoria
    from models.zona import Zona
    from sqlalchemy.orm import selectinload

    municipio_id = get_effective_municipio_id(request, current_user)
    hoy = datetime.utcnow().date()
    hace_7_dias = hoy - timedelta(days=7)

    async def get_reclamos_resumen(query_result) -> List[dict]:
        """Convierte resultados de query a resumen"""
        reclamos = []
        for r in query_result:
            dias = (hoy - r.created_at.date()).days
            reclamos.append({
                "id": r.id,
                "titulo": r.titulo[:50] + "..." if len(r.titulo) > 50 else r.titulo,
                "direccion": r.direccion[:40] + "..." if r.direccion and len(r.direccion) > 40 else r.direccion,
                "categoria": r.categoria.nombre if r.categoria else "Sin categoría",
                "zona": r.zona.nombre if r.zona else None,
                "dias_antiguedad": dias,
                "prioridad": r.prioridad or 1
            })
        return reclamos

    # 1. Urgentes (prioridad alta, no resueltos, más de 3 días)
    urgentes_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.prioridad >= 4,
            Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.created_at) <= hoy - timedelta(days=3)
        )
        .order_by(Reclamo.prioridad.desc(), Reclamo.created_at.asc())
        .limit(10)
    )
    urgentes = await get_reclamos_resumen(urgentes_query.scalars().all())

    # 2. Sin asignar (nuevos que llevan más de 24h)
    sin_asignar_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.NUEVO,
            func.date(Reclamo.created_at) < hoy
        )
        .order_by(Reclamo.created_at.asc())
        .limit(10)
    )
    sin_asignar = await get_reclamos_resumen(sin_asignar_query.scalars().all())

    # 3. Para hoy (programados para hoy)
    para_hoy_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.fecha_programada) == hoy
        )
        .order_by(Reclamo.prioridad.desc())
        .limit(10)
    )
    para_hoy = await get_reclamos_resumen(para_hoy_query.scalars().all())

    # 4. Resueltos esta semana
    resueltos_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado == EstadoReclamo.RESUELTO,
            func.date(Reclamo.fecha_resolucion) >= hace_7_dias
        )
        .order_by(Reclamo.fecha_resolucion.desc())
        .limit(10)
    )
    resueltos = await get_reclamos_resumen(resueltos_query.scalars().all())

    return {
        "urgentes": urgentes,
        "sin_asignar": sin_asignar,
        "para_hoy": para_hoy,
        "resueltos": resueltos
    }


@router.get("/recurrentes")
async def get_recurrentes(
    request: Request,
    dias: int = 90,
    min_reclamos: int = 2,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Reclamos que se repiten en la misma dirección"""
    from models.zona import Zona
    from models.categoria import Categoria

    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow().date() - timedelta(days=dias)

    # Buscar direcciones con múltiples reclamos
    subquery = (
        select(
            Reclamo.direccion,
            Reclamo.zona_id,
            func.count(Reclamo.id).label('cantidad')
        )
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.direccion != None,
            Reclamo.direccion != '',
            func.date(Reclamo.created_at) >= fecha_inicio
        )
        .group_by(Reclamo.direccion, Reclamo.zona_id)
        .having(func.count(Reclamo.id) >= min_reclamos)
        .subquery()
    )

    # Obtener las direcciones con más reclamos
    query = await db.execute(
        select(subquery.c.direccion, subquery.c.zona_id, subquery.c.cantidad)
        .order_by(subquery.c.cantidad.desc())
        .limit(10)
    )

    resultado = []
    for direccion, zona_id, cantidad in query.all():
        # Obtener nombre de zona
        zona_nombre = "Sin zona"
        if zona_id:
            zona_query = await db.execute(select(Zona.nombre).where(Zona.id == zona_id))
            zona_nombre = zona_query.scalar() or "Sin zona"

        # Obtener categorías de esos reclamos
        cat_query = await db.execute(
            select(Categoria.nombre)
            .join(Reclamo, Reclamo.categoria_id == Categoria.id)
            .where(
                Reclamo.direccion == direccion,
                Reclamo.municipio_id == municipio_id
            )
            .distinct()
        )
        categorias = [c[0] for c in cat_query.all()]

        resultado.append({
            "direccion": direccion,
            "zona": zona_nombre,
            "cantidad": cantidad,
            "categorias": categorias
        })

    return resultado
