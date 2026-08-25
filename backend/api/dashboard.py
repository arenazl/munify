from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from core.database import get_db
from core.security import require_roles, get_current_user
from models.reclamo import Reclamo
from models.user import User
from models.enums import EstadoReclamo, RolUsuario

from core.tenancy import resolve_municipio_id as get_effective_municipio_id  # noqa: E402

router = APIRouter()


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
        # Cierre canónico = 'finalizado'; se suma 'resuelto' (legacy) para no perder
        # los cierres viejos que aún no migraron.
        "resueltos": estados.get('finalizado', 0) + estados.get('resuelto', 0),
        "rechazados": estados.get('rechazado', 0),
    }


@router.get("/empleado-stats")
async def get_empleado_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["empleado", "supervisor", "admin"]))
):
    """Estadísticas del empleado de campo: SUS reclamos asignados
    (Reclamo.empleado_id == empleado vinculado al usuario)."""
    if not current_user.empleado_id:
        return {"asignados_hoy": 0, "en_curso": 0, "completados_hoy": 0, "pendientes": 0}

    hoy = datetime.utcnow().date()
    base = [
        Reclamo.empleado_id == current_user.empleado_id,
        Reclamo.municipio_id == current_user.municipio_id,
    ]

    async def _count(*extra):
        return (await db.execute(
            select(func.count(Reclamo.id)).where(*base, *extra)
        )).scalar() or 0

    cerrados = [EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO,
                EstadoReclamo.RECHAZADO]
    return {
        "asignados_hoy": await _count(Reclamo.fecha_programada == hoy),
        "en_curso": await _count(Reclamo.estado.in_(
            [EstadoReclamo.EN_CURSO, EstadoReclamo.EN_PROCESO])),
        "completados_hoy": await _count(
            Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]),
            func.date(Reclamo.fecha_resolucion) == hoy,
        ),
        "pendientes": await _count(Reclamo.estado.notin_(cerrados)),
    }


async def _tendencias_periodo(db: AsyncSession, model, base_filters: list, filtro_resueltos: list) -> dict:
    """Comparativas reales para los trends de las stat-cards del dashboard.

    Ventanas de igual longitud para que la comparación sea honesta:
    - ayer (día completo) → trend de "Nuevos Hoy"
    - semana pasada cortada al mismo día de la semana → trend de "Esta Semana"
    - creados últimos 30 días vs los 30 previos → trend de "Total"
    - tiempo promedio de resolución (resueltos últimos 30d vs 30d previos) → trend de "Tiempo Promedio"
    """
    hoy = datetime.utcnow().date()
    inicio_semana = hoy - timedelta(days=hoy.weekday())

    async def _count(*extra):
        return (await db.execute(
            select(func.count(model.id)).where(*base_filters, *extra)
        )).scalar() or 0

    ayer = await _count(func.date(model.created_at) == hoy - timedelta(days=1))
    semana_pasada = await _count(
        func.date(model.created_at) >= inicio_semana - timedelta(days=7),
        func.date(model.created_at) <= hoy - timedelta(days=7),
    )
    creados_30d = await _count(func.date(model.created_at) > hoy - timedelta(days=30))
    creados_30d_prev = await _count(
        func.date(model.created_at) > hoy - timedelta(days=60),
        func.date(model.created_at) <= hoy - timedelta(days=30),
    )

    async def _avg_resolucion(desde, hasta):
        val = (await db.execute(
            select(func.avg(func.datediff(model.fecha_resolucion, model.created_at)))
            .where(
                *base_filters,
                *filtro_resueltos,
                model.fecha_resolucion.isnot(None),
                func.date(model.fecha_resolucion) > desde,
                func.date(model.fecha_resolucion) <= hasta,
            )
        )).scalar()
        return round(float(val), 1) if val is not None else None

    # Serie REAL de tiempo de resolución, semana a semana (8 semanas, de la más
    # vieja a la más nueva). Antes la tarjeta "Resolución promedio" dibujaba su
    # sparkline con DOS puntos (mes actual vs. mes previo): una recta entre dos
    # valores, que parece un gráfico pero no muestra ninguna tendencia. Con la
    # serie, la línea dice de verdad si el municipio viene acelerando o no.
    # Semana 0 = los últimos 7 días; semana 7 = hace ocho semanas.
    semanas_bucket = func.floor(
        func.datediff(func.curdate(), func.date(model.fecha_resolucion)) / 7
    ).label("bucket")
    filas = (await db.execute(
        select(
            semanas_bucket,
            func.avg(func.datediff(model.fecha_resolucion, model.created_at)),
        )
        .where(
            *base_filters,
            *filtro_resueltos,
            model.fecha_resolucion.isnot(None),
            func.date(model.fecha_resolucion) > hoy - timedelta(days=56),
        )
        .group_by(semanas_bucket)
    )).all()
    por_bucket = {int(b): round(float(v), 1) for b, v in filas if b is not None and v is not None}
    # Semanas sin cierres quedan en None: el front corta la línea ahí en vez de
    # dibujar un cero que se leería como "resolvimos todo en el día".
    serie_resolucion = [por_bucket.get(i) for i in range(7, -1, -1)]

    return {
        "ayer": ayer,
        "semana_pasada": semana_pasada,
        "creados_30d": creados_30d,
        "creados_30d_prev": creados_30d_prev,
        "tiempo_resolucion_30d": await _avg_resolucion(hoy - timedelta(days=30), hoy),
        "tiempo_resolucion_30d_prev": await _avg_resolucion(hoy - timedelta(days=60), hoy - timedelta(days=30)),
        "serie_resolucion_semanal": serie_resolucion,
    }


@router.get("/stats")
async def get_stats(
    request: Request,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    municipio_id = get_effective_municipio_id(request, current_user)

    # Filtro base: municipio (+ dependencia opcional)
    base_filters = [Reclamo.municipio_id == municipio_id]
    if dependencia_id:
        base_filters.append(Reclamo.municipio_dependencia_id == dependencia_id)

    # Total de reclamos por estado
    estados_query = await db.execute(
        select(Reclamo.estado, func.count(Reclamo.id))
        .where(*base_filters)
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
            *base_filters,
            func.date(Reclamo.created_at) == hoy
        )
    )
    hoy_count = hoy_query.scalar()

    # Reclamos de esta semana
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    semana_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            *base_filters,
            func.date(Reclamo.created_at) >= inicio_semana
        )
    )
    semana_count = semana_query.scalar()

    # Tiempo promedio de resolución (en días) - compatible con MySQL.
    # Aceptamos AMBOS estados: 'finalizado' (nuevo) y 'resuelto' (legacy).
    resueltos_query = await db.execute(
        select(
            func.avg(
                func.datediff(Reclamo.fecha_resolucion, Reclamo.created_at)
            )
        ).where(
            *base_filters,
            Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]),
            Reclamo.fecha_resolucion.is_not(None),
        )
    )
    tiempo_promedio = resueltos_query.scalar() or 0

    tendencias = await _tendencias_periodo(
        db, Reclamo, base_filters,
        [Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO])],
    )

    return {
        "total": total,
        "por_estado": estados,
        "hoy": hoy_count,
        "semana": semana_count,
        "tiempo_promedio_dias": round(float(tiempo_promedio), 1),
        "tendencias": tendencias,
    }


@router.get("/tramites-stats")
async def get_tramites_stats(
    request: Request,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Estadísticas de trámites/solicitudes para el dashboard"""
    from models.tramite import Solicitud, EstadoSolicitud
    from sqlalchemy import or_

    municipio_id = get_effective_municipio_id(request, current_user)

    # Si no hay municipio_id, intentar obtener del usuario directamente
    if not municipio_id and current_user.municipio_id:
        municipio_id = current_user.municipio_id

    # Log para debug
    print(f"[tramites-stats] municipio_id={municipio_id}, dep={dependencia_id}, user={current_user.email}, header={request.headers.get('X-Municipio-ID')}")

    # Si aún no hay municipio_id, retornar 0s
    if not municipio_id:
        return {
            "total": 0,
            "por_estado": {},
            "hoy": 0,
            "semana": 0,
            "tiempo_promedio_dias": 0
        }

    # Filtro base: municipio (+ dependencia opcional)
    base_filters = [Solicitud.municipio_id == municipio_id]
    if dependencia_id:
        base_filters.append(Solicitud.municipio_dependencia_id == dependencia_id)

    # Total de solicitudes por estado
    estados_query = await db.execute(
        select(Solicitud.estado, func.count(Solicitud.id))
        .where(*base_filters)
        .group_by(Solicitud.estado)
    )
    estados = {estado.value if hasattr(estado, 'value') else str(estado): count for estado, count in estados_query.all()}

    # Total general
    total = sum(estados.values())

    # Solicitudes de hoy
    hoy = datetime.utcnow().date()
    hoy_query = await db.execute(
        select(func.count(Solicitud.id))
        .where(
            *base_filters,
            func.date(Solicitud.created_at) == hoy
        )
    )
    hoy_count = hoy_query.scalar() or 0

    # Solicitudes de esta semana
    inicio_semana = hoy - timedelta(days=hoy.weekday())
    semana_query = await db.execute(
        select(func.count(Solicitud.id))
        .where(
            *base_filters,
            func.date(Solicitud.created_at) >= inicio_semana
        )
    )
    semana_count = semana_query.scalar() or 0

    # Tiempo promedio de resolución (en días) - incluir estados legacy FINALIZADO
    resueltos_query = await db.execute(
        select(
            func.avg(
                func.datediff(Solicitud.fecha_resolucion, Solicitud.created_at)
            )
        ).where(
            *base_filters,
            or_(
                Solicitud.estado == EstadoSolicitud.FINALIZADO,
                Solicitud.estado == "FINALIZADO"  # Estado legacy en mayúsculas
            ),
            Solicitud.fecha_resolucion.isnot(None)
        )
    )
    tiempo_promedio = resueltos_query.scalar() or 0

    tendencias = await _tendencias_periodo(
        db, Solicitud, base_filters,
        [or_(
            Solicitud.estado == EstadoSolicitud.FINALIZADO,
            Solicitud.estado == "FINALIZADO",  # Estado legacy en mayúsculas
        )],
    )

    return {
        "total": total,
        "por_estado": estados,
        "hoy": hoy_count,
        "semana": semana_count,
        "tiempo_promedio_dias": round(tiempo_promedio, 1),
        "tendencias": tendencias,
    }


@router.get("/por-categoria")
async def get_por_categoria(
    request: Request,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    from models.categoria_reclamo import CategoriaReclamo as Categoria
    municipio_id = get_effective_municipio_id(request, current_user)

    filters = [Reclamo.municipio_id == municipio_id]
    if dependencia_id:
        filters.append(Reclamo.municipio_dependencia_id == dependencia_id)

    query = await db.execute(
        select(Categoria.nombre, func.count(Reclamo.id))
        .join(Reclamo, Reclamo.categoria_id == Categoria.id)
        .where(*filters)
        .group_by(Categoria.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )
    result = [{"categoria": nombre, "cantidad": count} for nombre, count in query.all()]

    return result


@router.get("/conteo-categorias")
async def get_conteo_categorias(
    request: Request,
    estado: Optional[str] = None,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "empleado"]))
):
    """
    Endpoint optimizado que devuelve el conteo de reclamos por categoría
    sin traer todos los datos. Mucho más eficiente que traer todos los reclamos.
    Para empleados: solo cuenta reclamos asignados a él o su cuadrilla.
    """
    from models.categoria_reclamo import CategoriaReclamo as Categoria
    from sqlalchemy import and_, or_

    municipio_id = get_effective_municipio_id(request, current_user)

    # Construir condiciones base
    conditions = [Reclamo.municipio_id == municipio_id]
    if estado:
        conditions.append(Reclamo.estado == estado)
    if dependencia_id:
        conditions.append(Reclamo.municipio_dependencia_id == dependencia_id)

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
    dependencia_id: Optional[int] = None,
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

    # Filtrar por dependencia si se especifica o si es empleado
    if dependencia_id:
        conditions.append(Reclamo.municipio_dependencia_id == dependencia_id)
    elif current_user.rol == RolUsuario.EMPLEADO and current_user.municipio_dependencia_id:
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

    # "disputados": reclamos con feedback negativo del vecino (confirmado_vecino
    # explicito en False). Va como pseudo-estado para que el front lea el TOTAL
    # real (no el array paginado del cliente) — D2 / code-review F1.
    disputados_q = await db.execute(
        select(func.count(Reclamo.id)).where(*conditions, Reclamo.confirmado_vecino.is_(False))
    )
    result.append({"estado": "disputados", "cantidad": disputados_q.scalar() or 0})

    return result

@router.get("/conteo-dependencias")
async def get_conteo_dependencias(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Endpoint optimizado que devuelve el conteo de reclamos por dependencia.
    Solo disponible para admin y supervisor.
    """
    from models.municipio_dependencia import MunicipioDependencia
    from models.dependencia import Dependencia
    from sqlalchemy import and_

    municipio_id = get_effective_municipio_id(request, current_user)

    # JOIN con Dependencia para obtener el nombre (MunicipioDependencia.nombre es una property)
    query = await db.execute(
        select(
            MunicipioDependencia.id,
            Dependencia.nombre,
            func.count(Reclamo.id).label('cantidad')
        )
        .select_from(MunicipioDependencia)
        .join(Dependencia, MunicipioDependencia.dependencia_id == Dependencia.id)
        .outerjoin(Reclamo, and_(
            Reclamo.municipio_dependencia_id == MunicipioDependencia.id,
            Reclamo.municipio_id == municipio_id
        ))
        .where(and_(
            MunicipioDependencia.activo == True,
            MunicipioDependencia.municipio_id == municipio_id
        ))
        .group_by(MunicipioDependencia.id, Dependencia.nombre)
        .order_by(func.count(Reclamo.id).desc())
    )

    result = [
        {
            "dependencia_id": dep_id,
            "nombre": nombre,
            "cantidad": count or 0
        }
        for dep_id, nombre, count in query.all()
    ]

    return result

@router.get("/por-zona")
async def get_por_zona(
    request: Request,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    from models.zona import Zona
    from sqlalchemy import and_
    municipio_id = get_effective_municipio_id(request, current_user)

    join_conds = [
        Reclamo.zona_id == Zona.id,
        Reclamo.municipio_id == municipio_id,
    ]
    if dependencia_id:
        join_conds.append(Reclamo.municipio_dependencia_id == dependencia_id)

    # LEFT JOIN para incluir todas las zonas activas del municipio, incluso sin reclamos
    query = await db.execute(
        select(Zona.nombre, func.count(Reclamo.id))
        .select_from(Zona)
        .outerjoin(Reclamo, and_(*join_conds))
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
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Serie diaria de ingresos y resoluciones.

    Devuelve TODOS los días del rango (incluidos los que no tuvieron actividad, en 0)
    para que el gráfico no comprima el eje temporal y exagere la tendencia.

    - `cantidad`: reclamos creados ese día (contrato histórico, no tocar).
    - `resueltos`: reclamos con `fecha_resolucion` ese día.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    # Acotado: como ahora se rellena día por día, un `dias` gigante materializaría
    # una fila por día en memoria. Un año cubre cualquier vista del tablero.
    dias = max(1, min(dias, 365))
    hoy = datetime.utcnow().date()
    fecha_inicio = hoy - timedelta(days=dias)

    base_filters = [Reclamo.municipio_id == municipio_id]
    if dependencia_id:
        base_filters.append(Reclamo.municipio_dependencia_id == dependencia_id)

    def _clave(valor) -> str:
        # func.date() puede volver date, datetime o str según el driver: normalizamos a YYYY-MM-DD
        return str(valor)[:10]

    # Serie 1: ingresados (por fecha de creación)
    query = await db.execute(
        select(
            func.date(Reclamo.created_at).label('fecha'),
            func.count(Reclamo.id)
        )
        .where(*base_filters, func.date(Reclamo.created_at) >= fecha_inicio)
        .group_by(func.date(Reclamo.created_at))
        .order_by(func.date(Reclamo.created_at))
    )
    ingresados = {_clave(fecha): count for fecha, count in query.all()}

    # Serie 2: resueltos (por fecha de resolución).
    # Mismo criterio de cierre que el resto del archivo: canónico 'finalizado'
    # + legacy 'resuelto' (ver get_mis_stats y get_metricas_accion).
    query_resueltos = await db.execute(
        select(
            func.date(Reclamo.fecha_resolucion).label('fecha'),
            func.count(Reclamo.id)
        )
        .where(
            *base_filters,
            Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]),
            Reclamo.fecha_resolucion.isnot(None),
            func.date(Reclamo.fecha_resolucion) >= fecha_inicio,
        )
        .group_by(func.date(Reclamo.fecha_resolucion))
        .order_by(func.date(Reclamo.fecha_resolucion))
    )
    resueltos = {_clave(fecha): count for fecha, count in query_resueltos.all()}

    # Relleno día por día: sin esto los días sin actividad desaparecen y el gráfico miente.
    result = []
    dia = fecha_inicio
    while dia <= hoy:
        clave = dia.isoformat()
        result.append({
            "fecha": clave,
            "cantidad": ingresados.get(clave, 0),
            "resueltos": resueltos.get(clave, 0),
        })
        dia += timedelta(days=1)

    return result


@router.get("/metricas-accion")
async def get_metricas_accion(
    request: Request,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Métricas accionables para el resumen del dashboard"""
    from models.empleado import Empleado
    from models.zona import Zona
    from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
    from models.enums import PrioridadOT, EstadoOrdenTrabajo
    from sqlalchemy import and_, case

    municipio_id = get_effective_municipio_id(request, current_user)
    hoy = datetime.utcnow().date()
    hace_7_dias = hoy - timedelta(days=7)
    hace_14_dias = hoy - timedelta(days=14)

    base = [Reclamo.municipio_id == municipio_id]
    if dependencia_id:
        base.append(Reclamo.municipio_dependencia_id == dependencia_id)

    # 1. Reclamos urgentes (prioridad efectiva de OT alta/urgente, no resueltos, más de 3 días).
    # "Urgente" = el reclamo tiene una OT viva (no cancelada) con prioridad alta o urgente.
    # La prioridad canónica vive en la OT (F6); Reclamo.prioridad está deprecado.
    urgentes_query = await db.execute(
        select(func.count(func.distinct(Reclamo.id)))
        .join(OrdenTrabajoReclamo, OrdenTrabajoReclamo.reclamo_id == Reclamo.id)
        .join(OrdenTrabajo, OrdenTrabajo.id == OrdenTrabajoReclamo.orden_trabajo_id)
        .where(
            *base,
            OrdenTrabajo.estado != EstadoOrdenTrabajo.CANCELADA,
            OrdenTrabajo.prioridad.in_([PrioridadOT.ALTA, PrioridadOT.URGENTE]),
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.created_at) <= hoy - timedelta(days=3)
        )
    )
    urgentes = urgentes_query.scalar() or 0

    # 2. Sin asignar (nuevos que llevan más de 24h)
    sin_asignar_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            *base,
            # RECIBIDO es el estado inicial del circuito nuevo (F3); NUEVO queda
            # por compatibilidad con datos legacy. Sin esto, "Sin asignar"
            # siempre daba 0 con reclamos recientes.
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.NUEVO]),
            func.date(Reclamo.created_at) < hoy
        )
    )
    sin_asignar = sin_asignar_query.scalar() or 0

    # 3. Vencidos (asignados con fecha_programada pasada y no resueltos)
    vencidos_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            Reclamo.fecha_programada != None,
            func.date(Reclamo.fecha_programada) < hoy
        )
    )
    vencidos = vencidos_query.scalar() or 0

    # 4. Para hoy (programados para hoy)
    para_hoy_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.fecha_programada) == hoy
        )
    )
    para_hoy = para_hoy_query.scalar() or 0

    # 4.bis Esperando el visto bueno: la cuadrilla ya dio el trabajo por hecho
    # y falta que un supervisor lo cierre. Es la única cola de la fila que se
    # destraba desde el escritorio, sin salir a la calle, y cada cierre suma
    # directo a "resueltos". Reemplaza a "para hoy" en el tablero: aquella
    # dependía de que el municipio cargara la agenda todos los días y vivía en
    # cero en los que no la usan.
    esperando_vb_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(*base, Reclamo.estado == EstadoReclamo.PENDIENTE_CONFIRMACION)
    )
    esperando_visto_bueno = esperando_vb_query.scalar() or 0

    # 5. Eficiencia semanal (resueltos esta semana vs semana anterior)
    resueltos_semana_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]),
            func.date(Reclamo.fecha_resolucion) >= hace_7_dias
        )
    )
    resueltos_semana = resueltos_semana_query.scalar() or 0

    resueltos_semana_ant_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]),
            func.date(Reclamo.fecha_resolucion) >= hace_14_dias,
            func.date(Reclamo.fecha_resolucion) < hace_7_dias
        )
    )
    resueltos_semana_ant = resueltos_semana_ant_query.scalar() or 0

    if resueltos_semana_ant > 0:
        cambio_eficiencia = round(((resueltos_semana - resueltos_semana_ant) / resueltos_semana_ant) * 100)
    else:
        cambio_eficiencia = 100 if resueltos_semana > 0 else 0

    # 5.bis Lo que ENTRÓ en la misma semana. Un conteo de resueltos solo no
    # dice nada ("¿6 está bien? ¿contra qué?"): el dato con consecuencia es si
    # el municipio cierra más de lo que le entra. Con los dos números el
    # tablero puede dar veredicto — al día, empatando, o acumulando.
    entraron_semana_query = await db.execute(
        select(func.count(Reclamo.id))
        .where(*base, func.date(Reclamo.created_at) >= hace_7_dias)
    )
    entraron_semana = entraron_semana_query.scalar() or 0

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
        "esperando_visto_bueno": esperando_visto_bueno,
        "resueltos_semana": resueltos_semana,
        "entraron_semana": entraron_semana,
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
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Métricas con detalle de reclamos para cada tarjeta"""
    from models.categoria_reclamo import CategoriaReclamo as Categoria
    from models.zona import Zona
    from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
    from models.enums import PrioridadOT, EstadoOrdenTrabajo
    from sqlalchemy import and_, case
    from sqlalchemy.orm import selectinload

    municipio_id = get_effective_municipio_id(request, current_user)
    hoy = datetime.utcnow().date()
    hace_7_dias = hoy - timedelta(days=7)

    base = [Reclamo.municipio_id == municipio_id]
    if dependencia_id:
        base.append(Reclamo.municipio_dependencia_id == dependencia_id)

    # Severidad efectiva de la OT del reclamo (F6): urgente>alta>media>baja.
    # Un reclamo con varias OTs vivas toma la más alta (func.max). Se excluyen
    # las OTs canceladas dentro del ON del outer join para no descartar reclamos.
    prioridad_rank = case(
        (OrdenTrabajo.prioridad == PrioridadOT.URGENTE, 4),
        (OrdenTrabajo.prioridad == PrioridadOT.ALTA, 3),
        (OrdenTrabajo.prioridad == PrioridadOT.MEDIA, 2),
        (OrdenTrabajo.prioridad == PrioridadOT.BAJA, 1),
        else_=0,
    )
    ot_viva = and_(
        OrdenTrabajo.id == OrdenTrabajoReclamo.orden_trabajo_id,
        OrdenTrabajo.estado != EstadoOrdenTrabajo.CANCELADA,
    )

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
            })
        return reclamos

    # 1. Urgentes (prioridad efectiva de OT alta/urgente, no resueltos, más de 3 días).
    # Join a la OT viva; se agrupa por reclamo y se toma su severidad máxima.
    urgentes_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .join(OrdenTrabajoReclamo, OrdenTrabajoReclamo.reclamo_id == Reclamo.id)
        .join(OrdenTrabajo, ot_viva)
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.created_at) <= hoy - timedelta(days=3)
        )
        .group_by(Reclamo.id)
        .having(func.max(prioridad_rank) >= 3)
        .order_by(func.max(prioridad_rank).desc(), Reclamo.created_at.asc())
        .limit(10)
    )
    urgentes = await get_reclamos_resumen(urgentes_query.scalars().all())

    # 2. Sin asignar (nuevos que llevan más de 24h)
    sin_asignar_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(
            *base,
            # RECIBIDO es el estado inicial del circuito nuevo (F3); NUEVO queda
            # por compatibilidad con datos legacy. Sin esto, "Sin asignar"
            # siempre daba 0 con reclamos recientes.
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.NUEVO]),
            func.date(Reclamo.created_at) < hoy
        )
        .order_by(Reclamo.created_at.asc())
        .limit(10)
    )
    sin_asignar = await get_reclamos_resumen(sin_asignar_query.scalars().all())

    # 3. Para hoy (programados para hoy), ordenados por prioridad efectiva de OT.
    # Outer join: un reclamo sin OT viva NO se descarta (queda con severidad 0, al final).
    para_hoy_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .outerjoin(OrdenTrabajoReclamo, OrdenTrabajoReclamo.reclamo_id == Reclamo.id)
        .outerjoin(OrdenTrabajo, ot_viva)
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.RECIBIDO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_CURSO]),
            func.date(Reclamo.fecha_programada) == hoy
        )
        .group_by(Reclamo.id)
        .order_by(func.max(prioridad_rank).desc(), Reclamo.created_at.asc())
        .limit(10)
    )
    para_hoy = await get_reclamos_resumen(para_hoy_query.scalars().all())

    # 3.bis Esperando el visto bueno del supervisor. Los más viejos primero:
    # un trabajo hecho que no se cierra es un vecino esperando novedades de
    # algo que la cuadrilla ya resolvió.
    esperando_vb_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(*base, Reclamo.estado == EstadoReclamo.PENDIENTE_CONFIRMACION)
        .order_by(Reclamo.updated_at.asc())
        .limit(10)
    )
    esperando_visto_bueno = await get_reclamos_resumen(esperando_vb_query.scalars().all())

    # 4. Resueltos esta semana
    resueltos_query = await db.execute(
        select(Reclamo)
        .options(selectinload(Reclamo.categoria), selectinload(Reclamo.zona))
        .where(
            *base,
            Reclamo.estado.in_([EstadoReclamo.FINALIZADO, EstadoReclamo.RESUELTO]),
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
        "esperando_visto_bueno": esperando_visto_bueno,
        "resueltos": resueltos
    }


@router.get("/actividad")
async def get_actividad(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Cuánta HISTORIA y cuánta ACTIVIDAD reciente tiene cada dominio del tablero.

    Un solo request al arrancar el dashboard, seis COUNT() sin joins. Con esto
    el tablero decide dos cosas de una vez:

    - **Visibilidad por historia**: `total = 0` es un "módulo prototipo" — está
      prendido pero nunca se usó. Sus secciones no se muestran NI se fetchean.
      (El módulo apagado ya lo mata antes, aunque tenga datos viejos.)
    - **Orden de los bloques**: `ultimos30` ordena los dominios de mayor a menor
      actividad. Un muni que vive de la tesorería ve la plata arriba; uno que
      vive de la calle, los reclamos.

    Qué cuenta cada dominio (y por qué):

    - `reclamos`  → tabla `reclamos`, por `created_at`.
    - `tramites`  → tabla `solicitudes`. El dominio del tablero son las
      GESTIONES de los vecinos, no el catálogo `tramites` (que son los tipos de
      trámite que ofrece el muni y no miden actividad). Mismo criterio que
      `/dashboard/tramites-stats`.
    - `finanzas`  → `gastos` + `tesoreria_pagos_programados`, ambos sólo los
      ACTIVOS (`activo = 1`): un gasto dado de baja no es historia del módulo.
      Los últimos 30 días se miden con `gastos.fecha` (la fecha económica, que
      es la indexada y la que usa `/tesoreria/gastos/serie`) y con
      `created_at` de los pagos programados. Ojo: un pago programado que se
      EJECUTA genera un `Gasto` con `pago_programado_id`, así que su ejecución
      ya está contada del lado de gastos — contarla otra vez acá duplicaría.
      Lo que suma la agenda por su cuenta es haberse dado de alta.

    Sin dependencia_id a propósito: la actividad ordena la PANTALLA, no informa
    de una secretaría. Filtrarla por el combo de arriba haría bailar el orden
    de los bloques cada vez que el admin cambia de dependencia.
    """
    from models.tramite import Solicitud
    from models.gasto import Gasto
    from models.tesoreria_extra import TesoreriaPagoProgramado

    municipio_id = get_effective_municipio_id(request, current_user)
    desde = datetime.utcnow().date() - timedelta(days=30)

    async def _count(modelo, *extra) -> int:
        return (await db.execute(
            select(func.count(modelo.id))
            .where(modelo.municipio_id == municipio_id, *extra)
        )).scalar() or 0

    gastos_total = await _count(Gasto, Gasto.activo == True)  # noqa: E712
    gastos_30 = await _count(
        Gasto, Gasto.activo == True, Gasto.fecha >= desde,  # noqa: E712
    )
    pagos_total = await _count(
        TesoreriaPagoProgramado, TesoreriaPagoProgramado.activo == True,  # noqa: E712
    )
    pagos_30 = await _count(
        TesoreriaPagoProgramado,
        TesoreriaPagoProgramado.activo == True,  # noqa: E712
        func.date(TesoreriaPagoProgramado.created_at) >= desde,
    )

    return {
        "reclamos": {
            "total": await _count(Reclamo),
            "ultimos30": await _count(Reclamo, func.date(Reclamo.created_at) >= desde),
        },
        "tramites": {
            "total": await _count(Solicitud),
            "ultimos30": await _count(Solicitud, func.date(Solicitud.created_at) >= desde),
        },
        "finanzas": {
            "total": gastos_total + pagos_total,
            "ultimos30": gastos_30 + pagos_30,
        },
    }


# =====================================================
# CIRCUITO DE TRÁMITES (WO-F4 — "el barro" del mostrador)
# =====================================================

# El circuito de una solicitud, leído por QUIÉN tiene la pelota. Los valores
# van en minúscula porque acá se normaliza con .lower(): el enum tiene los
# estados nuevos en minúscula ('recibido', 'pendiente_pago'…) y los legacy en
# MAYÚSCULA ('EN_REVISION', 'REQUIERE_DOCUMENTACION'…), y ambos conviven en la
# misma columna.
#
# CERRADOS: 'finalizado' es el cierre canónico, 'rechazado' también cierra
# (mal, pero cierra) y 'aprobado' es el finalizado legacy.
_SOLICITUD_CERRADOS = {"finalizado", "rechazado", "aprobado"}

# ESPERAN AL VECINO: la solicitud está viva pero el municipio NO puede
# moverla — depende de que el vecino pague o entregue papeles.
#   - pendiente_pago: el trámite tiene costo y el pago no entró
#     (models/tramite.py: "Esperando pago del vecino").
#   - requiere_documentacion: legacy, la ventanilla pidió un papel que falta.
# TODO lo demás que esté abierto espera al MUNICIPIO. Es a propósito el
# criterio conservador (patrón resiliente): un estado nuevo que nadie mapeó
# cae del lado del municipio, porque el tablero no puede desligar al muni de
# algo que no sabe clasificar. Al revés —contarlo como del vecino— escondería
# trabajo propio.
_SOLICITUD_ESPERAN_VECINO = {"pendiente_pago", "requiere_documentacion"}

# Turnos: el modelo declara 'reservado | cumplido | cancelado | ausente'
# (models/turno.py) y la API de turnero valida exactamente ese set
# (api/turnos_tramite.py, PATCH de estado). 'reservado' NO es un resultado:
# es el estado inicial, así que un turno que ya pasó y sigue 'reservado' es
# un turno que NADIE marcó — ni cumplido ni ausente.
_TURNO_PRESENTADO = "cumplido"
_TURNO_AUSENTE = "ausente"
_TURNO_CANCELADO = "cancelado"
_TURNO_SIN_MARCAR = "reservado"

# Cierres mínimos para que un tipo de trámite pueda ser "el que más tarda".
# Con uno solo el promedio es el caso, no la tendencia.
_MIN_CIERRES_PARA_RANKING = 2


def _estado_valor(estado) -> str:
    """El estado como string, venga como enum o como texto crudo."""
    return estado.value if hasattr(estado, "value") else str(estado)


@router.get("/tramites-circuito")
async def get_tramites_circuito(
    request: Request,
    dependencia_id: Optional[int] = None,
    dias_turnos: int = 30,
    dias_tipos: int = 90,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"])),
):
    """El CIRCUITO de trámites en un solo request: dónde se traban, si se
    cumplen los turnos y qué tipo de trámite tarda más.

    Contesta las tres preguntas del tablero (WO-F4). Son ocho agregaciones
    (COUNT/AVG con GROUP BY, sin traer una sola fila de detalle), así que
    entran en un request y no en tres.

    **cuellos** — de las solicitudes ABIERTAS (todo lo que no sea finalizado,
    rechazado o aprobado), cuántas dependen del municipio y cuántas están
    frenadas esperando al vecino. Es la distinción que el tablero no hacía:
    una cola de 30 no dice lo mismo si 25 duermen en una dependencia que si
    25 esperan que alguien pague. Se acompaña de la dependencia (y del tipo)
    que más concentra y de la antigüedad de la más vieja, que es la única
    vara honesta para darle veredicto a una cola.

    **turnos** — la ventana son los turnos YA OCURRIDOS de los últimos
    `dias_turnos` (`fecha_hora` entre hace N días y ahora); los futuros van
    aparte en `proximos`. Mezclarlos hundiría el presentismo con turnos que
    todavía no llegaron. Los que pasaron y siguen en 'reservado' NO son
    ausentes: son turnos que nadie marcó, y van en su propio contador —
    inventarles un resultado sería la mentira más fácil de este endpoint.

    **tipos** — por tipo de trámite en `dias_tipos`: cuántas solicitudes
    entraron y cuánto tardaron las que CERRARON con fecha real. El promedio
    va en MINUTOS y es `null` cuando el tipo no tiene ningún cierre medible
    (mismo criterio que `tendencias.tiempo_resolucion_30d`: sin filas, null,
    nunca un 0 que se lea como "se resuelve al instante"). `mas_lento` sale
    sólo si algún tipo promedia MÁS de cero: si todos cierran en el acto no
    hay un trámite que duela más, y decir que lo hay sería inventarlo.

    Ojo con la hora: `turnos.fecha_hora` es un DateTime sin zona (la hora de
    atención del mostrador) y el corte "ya ocurrido" se hace con la hora del
    proceso, que en Cloud Run es UTC. En Argentina eso corre el corte hasta
    3 horas — a las 07:00 UTC un turno de hoy 05:00 local ya cuenta como
    ocurrido. Con horarios de atención de 8 a 13 no cambia ningún número,
    pero queda dicho. Mismo criterio que `/turnos-tramite/stats`.
    """
    from models.tramite import Solicitud, EstadoSolicitud, Tramite
    from models.turno import Turno
    from models.municipio_dependencia import MunicipioDependencia
    from models.dependencia import Dependencia
    from sqlalchemy import and_, case, text

    municipio_id = get_effective_municipio_id(request, current_user)
    if not municipio_id and current_user.municipio_id:
        municipio_id = current_user.municipio_id

    # Acotado como en /tendencia: un `dias` gigante no rompe (son agregados)
    # pero tampoco significa nada.
    dias_turnos = max(1, min(dias_turnos, 365))
    dias_tipos = max(1, min(dias_tipos, 365))

    vacio = {
        "cuellos": {
            "abiertas": 0, "esperando_vecino": 0, "esperando_municipio": 0,
            "por_estado_vecino": {}, "por_estado_municipio": {},
            "dias_mas_vieja": None,
            "top_dependencia": None, "dependencias_con_abiertas": 0,
            "top_tramite": None, "tramites_con_abiertas": 0,
        },
        "turnos": {
            "dias": dias_turnos, "total": 0, "presentados": 0, "ausentes": 0,
            "cancelados": 0, "sin_marcar": 0, "proximos": 0,
            "franja_ausencias": None,
        },
        "tipos": {
            "dias": dias_tipos, "total": 0, "items": [],
            "mas_lento": None, "promedio_resto_minutos": None,
        },
    }
    if not municipio_id:
        return vacio

    ahora = datetime.utcnow()
    base_sol = [Solicitud.municipio_id == municipio_id]
    if dependencia_id:
        base_sol.append(Solicitud.municipio_dependencia_id == dependencia_id)

    # ------------------------------------------------------------ cuellos
    # (1) Reparto por estado de TODO el universo; la clasificación
    # abierto/cerrado y vecino/municipio se hace en Python contra los sets de
    # arriba, así un estado nuevo no rompe la query ni desaparece del conteo.
    filas_estado = (await db.execute(
        select(Solicitud.estado, func.count(Solicitud.id))
        .where(*base_sol)
        .group_by(Solicitud.estado)
    )).all()

    por_estado_vecino: dict[str, int] = {}
    por_estado_municipio: dict[str, int] = {}
    for estado, n in filas_estado:
        clave = _estado_valor(estado)
        norm = clave.lower()
        if norm in _SOLICITUD_CERRADOS:
            continue
        destino = (
            por_estado_vecino if norm in _SOLICITUD_ESPERAN_VECINO
            else por_estado_municipio
        )
        destino[clave] = destino.get(clave, 0) + int(n)

    esperando_vecino = sum(por_estado_vecino.values())
    esperando_municipio = sum(por_estado_municipio.values())
    abiertas = esperando_vecino + esperando_municipio

    # Filtro SQL de "abierta" para las dos agrupaciones que siguen. Los
    # miembros del enum son los que la columna guarda; el resto de los
    # estados quedan del lado abierto por descarte, igual que arriba.
    abiertas_sql = [
        Solicitud.estado.notin_([
            EstadoSolicitud.FINALIZADO,
            EstadoSolicitud.RECHAZADO,
            EstadoSolicitud.APROBADO,
        ]),
    ]

    # (2) Qué dependencia concentra las abiertas. Se traen TODAS las que
    # tienen alguna (son las dependencias del muni: decenas como mucho) para
    # saber además cuántas hay — con una sola, "la que más concentra" no
    # informa nada y el front dice el trámite en su lugar.
    filas_dep = (await db.execute(
        select(Dependencia.nombre, func.count(Solicitud.id).label("n"))
        .select_from(Solicitud)
        .join(MunicipioDependencia,
              MunicipioDependencia.id == Solicitud.municipio_dependencia_id)
        .join(Dependencia, Dependencia.id == MunicipioDependencia.dependencia_id)
        .where(*base_sol, *abiertas_sql)
        .group_by(Dependencia.id, Dependencia.nombre)
        .order_by(func.count(Solicitud.id).desc())
    )).all()

    # (3) Ídem por tipo de trámite.
    filas_tramite_abiertas = (await db.execute(
        select(Tramite.nombre, func.count(Solicitud.id).label("n"))
        .select_from(Solicitud)
        .join(Tramite, Tramite.id == Solicitud.tramite_id)
        .where(*base_sol, *abiertas_sql)
        .group_by(Tramite.id, Tramite.nombre)
        .order_by(func.count(Solicitud.id).desc())
    )).all()

    # (4) La más vieja que sigue abierta. Es la vara del veredicto: una cola
    # de 30 con nada de más de dos días no es el mismo problema que una de 30
    # con algo esperando desde hace un mes.
    mas_vieja = (await db.execute(
        select(func.min(Solicitud.created_at)).where(*base_sol, *abiertas_sql)
    )).scalar()
    dias_mas_vieja = (ahora - mas_vieja).days if mas_vieja else None

    # ------------------------------------------------------------- turnos
    desde_turnos = ahora - timedelta(days=dias_turnos)
    base_turnos = [Turno.municipio_id == municipio_id]
    if dependencia_id:
        base_turnos.append(Turno.municipio_dependencia_id == dependencia_id)
    ventana_ocurridos = [Turno.fecha_hora >= desde_turnos, Turno.fecha_hora <= ahora]

    filas_turnos = (await db.execute(
        select(Turno.estado, func.count(Turno.id))
        .where(*base_turnos, *ventana_ocurridos)
        .group_by(Turno.estado)
    )).all()
    turnos_por_estado = {_estado_valor(e): int(n) for e, n in filas_turnos}
    turnos_total = sum(turnos_por_estado.values())

    # Los próximos se acotan a la misma ventana hacia adelante: sin tope, un
    # turno agendado a un año infla el número de "lo que se viene".
    proximos = (await db.execute(
        select(func.count(Turno.id)).where(
            *base_turnos,
            Turno.fecha_hora > ahora,
            Turno.fecha_hora <= ahora + timedelta(days=dias_turnos),
        )
    )).scalar() or 0

    # La franja con más ausencias. Sólo la HORA (no el día de semana): es la
    # que sirve para mover ventanillas y sale de un GROUP BY sobre el índice
    # (municipio_id, fecha_hora). El front decide si el número tiene entidad
    # suficiente para enunciarlo — dos faltas no son una franja problemática.
    fila_franja = (await db.execute(
        select(func.hour(Turno.fecha_hora).label("h"), func.count(Turno.id))
        .where(*base_turnos, *ventana_ocurridos, Turno.estado == _TURNO_AUSENTE)
        .group_by(func.hour(Turno.fecha_hora))
        .order_by(func.count(Turno.id).desc())
        .limit(1)
    )).first()

    # -------------------------------------------------------------- tipos
    desde_tipos = ahora.date() - timedelta(days=dias_tipos)
    # Duración REAL del expediente, en minutos. En días (DATEDIFF, que es lo
    # que usa el resto del archivo) todo lo que cierra dentro de la jornada
    # da 0 y no se puede ordenar por "el que más tarda".
    minutos_cierre = func.timestampdiff(
        text("MINUTE"), Solicitud.created_at, Solicitud.fecha_resolucion,
    )
    # Mismo criterio de cierre MEDIBLE que /tramites-stats: finalizado (+ el
    # legacy en mayúsculas) y con fecha de resolución cargada. Una solicitud
    # 'finalizado' sin `fecha_resolucion` está cerrada pero no tiene duración
    # — San Pedro Norte tiene de ésas — y no puede entrar en un promedio.
    es_cierre_medible = and_(
        or_(
            Solicitud.estado == EstadoSolicitud.FINALIZADO,
            Solicitud.estado == "FINALIZADO",
        ),
        Solicitud.fecha_resolucion.isnot(None),
    )
    filas_tipos = (await db.execute(
        select(
            Tramite.id,
            Tramite.nombre,
            func.count(Solicitud.id).label("n"),
            func.sum(case((es_cierre_medible, 1), else_=0)).label("cerradas"),
            func.avg(case((es_cierre_medible, minutos_cierre))).label("minutos"),
        )
        .select_from(Solicitud)
        .join(Tramite, Tramite.id == Solicitud.tramite_id)
        .where(*base_sol, func.date(Solicitud.created_at) >= desde_tipos)
        .group_by(Tramite.id, Tramite.nombre)
        .order_by(func.count(Solicitud.id).desc())
    )).all()

    items = [
        {
            "tramite_id": int(tid),
            "nombre": nombre,
            "solicitudes": int(n),
            "cerradas": int(cerradas or 0),
            # null (no 0) cuando no hay ningún cierre medible: el AVG viene
            # NULL y así se devuelve. Un 0 acá se leería como "se resuelve al
            # instante", que es lo contrario de "no sabemos".
            "minutos_promedio": round(float(minutos), 1) if minutos is not None else None,
        }
        for tid, nombre, n, cerradas, minutos in filas_tipos
    ]

    # "El que más tarda" pide DOS cosas: que su promedio sea mayor que cero
    # (si todo cierra en el acto no hay uno que duela más) y que salga de al
    # menos dos cierres. Con un solo expediente medido eso no es un promedio,
    # es una anécdota — y el tablero la publicaría como si fuera el ranking
    # del municipio.
    medibles = [
        i for i in items
        if (i["minutos_promedio"] or 0) > 0 and i["cerradas"] >= _MIN_CIERRES_PARA_RANKING
    ]
    mas_lento = max(medibles, key=lambda i: i["minutos_promedio"]) if medibles else None

    # El "resto" contra el que se compara al más lento sale de la MISMA vara.
    # Calcularlo del otro lado (con todos los tipos que tengan algún promedio)
    # producía frases que se contradecían solas: un tipo con un único cierre de
    # 24 h quedaba fuera del ranking por poco fiable pero entraba igual en el
    # promedio, y la tarjeta terminaba diciendo "el más lento tarda 2,4 horas,
    # contra 1 día del resto". null cuando no hay ningún otro tipo comparable:
    # ahí no hay contra qué medirlo y no se afirma.
    resto = [i for i in medibles if mas_lento is None or i["tramite_id"] != mas_lento["tramite_id"]]
    promedio_resto = (
        round(sum(i["minutos_promedio"] for i in resto) / len(resto), 1) if resto else None
    )

    return {
        "cuellos": {
            "abiertas": abiertas,
            "esperando_vecino": esperando_vecino,
            "esperando_municipio": esperando_municipio,
            "por_estado_vecino": por_estado_vecino,
            "por_estado_municipio": por_estado_municipio,
            "dias_mas_vieja": dias_mas_vieja,
            "top_dependencia": (
                {"nombre": filas_dep[0][0], "cantidad": int(filas_dep[0][1])}
                if filas_dep else None
            ),
            "dependencias_con_abiertas": len(filas_dep),
            "top_tramite": (
                {"nombre": filas_tramite_abiertas[0][0],
                 "cantidad": int(filas_tramite_abiertas[0][1])}
                if filas_tramite_abiertas else None
            ),
            "tramites_con_abiertas": len(filas_tramite_abiertas),
        },
        "turnos": {
            "dias": dias_turnos,
            "total": turnos_total,
            "presentados": turnos_por_estado.get(_TURNO_PRESENTADO, 0),
            "ausentes": turnos_por_estado.get(_TURNO_AUSENTE, 0),
            "cancelados": turnos_por_estado.get(_TURNO_CANCELADO, 0),
            # Pasaron y siguen 'reservado': nadie los marcó. No son ausentes.
            "sin_marcar": turnos_por_estado.get(_TURNO_SIN_MARCAR, 0),
            "proximos": int(proximos),
            "franja_ausencias": (
                {"hora": int(fila_franja[0]), "cantidad": int(fila_franja[1])}
                if fila_franja and fila_franja[0] is not None else None
            ),
        },
        "tipos": {
            "dias": dias_tipos,
            "total": sum(i["solicitudes"] for i in items),
            "items": items,
            "mas_lento": mas_lento,
            "promedio_resto_minutos": promedio_resto,
        },
    }


@router.get("/recurrentes")
async def get_recurrentes(
    request: Request,
    dias: int = 90,
    min_reclamos: int = 2,
    dependencia_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Reclamos que se repiten en la misma dirección"""
    from models.zona import Zona
    from models.categoria_reclamo import CategoriaReclamo as Categoria

    municipio_id = get_effective_municipio_id(request, current_user)
    fecha_inicio = datetime.utcnow().date() - timedelta(days=dias)

    sub_filters = [
        Reclamo.municipio_id == municipio_id,
        Reclamo.direccion != None,
        Reclamo.direccion != '',
        func.date(Reclamo.created_at) >= fecha_inicio,
        # Solo ubicaciones PRECISAS: un foco armado con coordenadas por IP o
        # centroide sería una esquina caliente falsa. NULL = legacy preciso.
        or_(
            Reclamo.ubicacion_origen.is_(None),
            Reclamo.ubicacion_origen.notin_(("ip", "municipio")),
        ),
    ]
    if dependencia_id:
        sub_filters.append(Reclamo.municipio_dependencia_id == dependencia_id)

    # Buscar direcciones con múltiples reclamos
    subquery = (
        select(
            Reclamo.direccion,
            Reclamo.zona_id,
            func.count(Reclamo.id).label('cantidad'),
            # Centro de la esquina: el promedio de sus reclamos. Sirve para que
            # el mapa pueda ENCUADRAR cada foco, no solo listarlo.
            func.avg(Reclamo.latitud).label('lat'),
            func.avg(Reclamo.longitud).label('lng'),
            # El más antiguo de la esquina. Es lo que convierte un foco en algo
            # urgente: cuatro reclamos juntos son un dato; cuatro reclamos
            # juntos desde hace cuarenta días son un problema.
            func.min(Reclamo.created_at).label('mas_viejo'),
        )
        .where(*sub_filters)
        .group_by(Reclamo.direccion, Reclamo.zona_id)
        .having(func.count(Reclamo.id) >= min_reclamos)
        .subquery()
    )

    # Obtener las direcciones con más reclamos
    query = await db.execute(
        select(subquery.c.direccion, subquery.c.zona_id, subquery.c.cantidad,
               subquery.c.lat, subquery.c.lng, subquery.c.mas_viejo)
        .order_by(subquery.c.cantidad.desc())
        .limit(10)
    )

    filas = query.all()
    if not filas:
        return []

    # ------------------------------------------------------------------
    # Antes acá había un N+1: por CADA dirección del top se hacían dos
    # queries más (una para el nombre de zona y otra para sus categorías).
    # Con 10 direcciones eran 21 viajes a la base. Ahora son 2 en total,
    # resueltas con un IN sobre las direcciones del top.
    # ------------------------------------------------------------------
    direcciones = [f[0] for f in filas]
    zona_ids = {f[1] for f in filas if f[1]}

    nombres_zona = {}
    if zona_ids:
        zq = await db.execute(select(Zona.id, Zona.nombre).where(Zona.id.in_(zona_ids)))
        nombres_zona = {zid: nombre for zid, nombre in zq.all()}

    # Categorías CON su conteo (antes venían DISTINCT, sin cantidad, así que
    # no se podía saber cuál pesa). Con el conteo, cada esquina puede decir de
    # qué son la mayoría de sus reclamos — que es lo que vuelve accionable al
    # ranking cuando se está mirando "todas las categorías".
    cat_filters = [
        Reclamo.municipio_id == municipio_id,
        Reclamo.direccion.in_(direcciones),
        func.date(Reclamo.created_at) >= fecha_inicio,
    ]
    if dependencia_id:
        cat_filters.append(Reclamo.municipio_dependencia_id == dependencia_id)
    cat_query = await db.execute(
        select(Reclamo.direccion, Categoria.nombre, func.count(Reclamo.id))
        .join(Categoria, Reclamo.categoria_id == Categoria.id)
        .where(*cat_filters)
        .group_by(Reclamo.direccion, Categoria.nombre)
    )
    por_direccion: dict[str, list[tuple[str, int]]] = {}
    for direccion, nombre_cat, n in cat_query.all():
        por_direccion.setdefault(direccion, []).append((nombre_cat, n))

    resultado = []
    hoy_dt = datetime.utcnow()
    for direccion, zona_id, cantidad, lat, lng, mas_viejo in filas:
        pares = sorted(por_direccion.get(direccion, []), key=lambda x: x[1], reverse=True)
        top_cat, top_n = pares[0] if pares else (None, 0)
        dias_mas_viejo = (hoy_dt - mas_viejo).days if mas_viejo else None
        resultado.append({
            "direccion": direccion,
            "zona": nombres_zona.get(zona_id, "Sin zona"),
            "cantidad": cantidad,
            # None si los reclamos de esa esquina no tienen coordenadas: el
            # front lo saltea en vez de inventar un punto en el mapa.
            "lat": float(lat) if lat is not None else None,
            "lng": float(lng) if lng is not None else None,
            "categorias": [nombre for nombre, _ in pares],
            # La que más pesa en esa esquina, con cuántos de los suyos son.
            "categoria_top": top_cat,
            "categoria_top_cantidad": top_n,
            "dias_mas_viejo": dias_mas_viejo,
        })

    return resultado
