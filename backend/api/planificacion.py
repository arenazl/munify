"""
API de Planificación Semanal - Calendario visual para supervisores
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, case
from sqlalchemy.orm import selectinload
from datetime import datetime, date, timedelta
from typing import List, Optional
from pydantic import BaseModel

from core.database import get_db
from core.security import get_current_user, require_roles
from models.reclamo import Reclamo
from models.empleado import Empleado
from models.orden_trabajo import OrdenTrabajo, OrdenTrabajoReclamo
from models.municipio_dependencia import MunicipioDependencia
from models.user import User
from models.historial import HistorialReclamo
from models.enums import RolUsuario, EstadoReclamo, PrioridadOT, EstadoOrdenTrabajo
from services.push_service import notificar_asignacion_empleado

router = APIRouter()


# ============ Schemas ============

class CategoriaMinima(BaseModel):
    id: int
    nombre: str
    color: Optional[str] = "#6b7280"  # Color por defecto si es None

    class Config:
        from_attributes = True


class ZonaMinima(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True


class DependenciaMinima(BaseModel):
    id: int
    nombre: str
    color: Optional[str] = "#6366f1"
    icono: Optional[str] = "Building2"

    class Config:
        from_attributes = True


class EmpleadoPlanificacion(BaseModel):
    id: int
    nombre: str
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    tipo: Optional[str] = None  # operario | administrativo
    especialidad: Optional[str] = None
    activo: bool
    capacidad_maxima: int = 10
    categoria_principal: Optional[CategoriaMinima] = None
    categorias: List[CategoriaMinima] = []  # Todas las categorías que maneja
    zona: Optional[ZonaMinima] = None
    dependencia: Optional[DependenciaMinima] = None

    class Config:
        from_attributes = True


class TareaReclamo(BaseModel):
    tipo: str = "reclamo"
    id: int
    titulo: str
    direccion: Optional[str] = None
    estado: str
    categoria: Optional[CategoriaMinima] = None
    fecha_programada: Optional[str] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    empleado_id: Optional[int] = None

    class Config:
        from_attributes = True


class AusenciaPlanificacion(BaseModel):
    id: int
    empleado_id: int
    tipo: str
    fecha_inicio: str
    fecha_fin: str
    motivo: Optional[str] = None
    aprobado: bool

    class Config:
        from_attributes = True


class PlanificacionSemanalResponse(BaseModel):
    semana_inicio: str
    semana_fin: str
    empleados: List[EmpleadoPlanificacion]
    tareas: List[TareaReclamo]
    ausencias: List[AusenciaPlanificacion]
    sin_asignar: List[TareaReclamo]


from core.tenancy import resolve_municipio_id as get_effective_municipio_id  # noqa: E402


# ============ Endpoints ============

@router.get("/semanal", response_model=PlanificacionSemanalResponse)
async def get_planificacion_semanal(
    request: Request,
    fecha_inicio: str = Query(..., description="Fecha inicio de la semana (YYYY-MM-DD)"),
    fecha_fin: str = Query(..., description="Fecha fin de la semana (YYYY-MM-DD)"),
    empleado_id: Optional[int] = Query(None, description="Filtrar por empleado específico"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Obtiene toda la información necesaria para la planificación semanal en una sola llamada.
    Incluye: empleados, reclamos programados, trámites asignados, ausencias y tareas sin asignar.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    try:
        fecha_ini = datetime.strptime(fecha_inicio, "%Y-%m-%d").date()
        fecha_f = datetime.strptime(fecha_fin, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    # 1. Obtener empleados activos con todas sus relaciones
    query_empleados = (
        select(Empleado)
        .options(
            selectinload(Empleado.categoria_principal),
            selectinload(Empleado.categorias),
            selectinload(Empleado.zona_asignada),
            selectinload(Empleado.municipio_dependencia).selectinload(MunicipioDependencia.dependencia),
        )
        .where(
            Empleado.municipio_id == municipio_id,
            Empleado.activo == True
        )
        .order_by(Empleado.nombre)
    )
    if empleado_id:
        query_empleados = query_empleados.where(Empleado.id == empleado_id)

    result = await db.execute(query_empleados)
    empleados = result.scalars().all()

    empleados_response = []
    for e in empleados:
        try:
            emp = EmpleadoPlanificacion(
                id=e.id,
                nombre=e.nombre,
                apellido=e.apellido,
                telefono=e.telefono,
                tipo=e.tipo,
                especialidad=e.especialidad,
                activo=e.activo,
                capacidad_maxima=e.capacidad_maxima or 10,
                categoria_principal=CategoriaMinima(
                    id=e.categoria_principal.id,
                    nombre=e.categoria_principal.nombre,
                    color=e.categoria_principal.color or "#6b7280"
                ) if e.categoria_principal else None,
                categorias=[
                    CategoriaMinima(id=c.id, nombre=c.nombre, color=c.color or "#6b7280")
                    for c in (list(e.categorias) if e.categorias else [])
                ],
                zona=ZonaMinima(id=e.zona_asignada.id, nombre=e.zona_asignada.nombre)
                    if e.zona_asignada else None,
                dependencia=DependenciaMinima(
                    id=e.municipio_dependencia.id,
                    nombre=e.municipio_dependencia.dependencia.nombre if e.municipio_dependencia.dependencia else "Sin nombre",
                    color=getattr(e.municipio_dependencia.dependencia, 'color', None) if e.municipio_dependencia.dependencia else "#6366f1",
                    icono=getattr(e.municipio_dependencia.dependencia, 'icono', None) if e.municipio_dependencia.dependencia else "Building2",
                ) if e.municipio_dependencia else None,
            )
            empleados_response.append(emp)
        except Exception as ex:
            print(f"Error procesando empleado {e.id}: {ex}")
            # Agregar versión mínima sin categorías
            empleados_response.append(EmpleadoPlanificacion(
                id=e.id,
                nombre=e.nombre,
                apellido=e.apellido,
                tipo=e.tipo,
                activo=e.activo,
                capacidad_maxima=10,
                categorias=[]
            ))

    # 2. Obtener reclamos asignados en el rango de fechas
    # Reclamos activos con fecha_programada dentro del rango
    estados_activos_tareas = [
        EstadoReclamo.RECIBIDO,
        EstadoReclamo.EN_CURSO,
        EstadoReclamo.POSPUESTO,
        EstadoReclamo.ASIGNADO,   # legacy
    ]
    query_reclamos = (
        select(Reclamo)
        .options(selectinload(Reclamo.categoria))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_(estados_activos_tareas),
            Reclamo.fecha_programada.isnot(None),
            Reclamo.fecha_programada >= fecha_ini,
            Reclamo.fecha_programada <= fecha_f,
        )
    )
    if empleado_id:
        query_reclamos = query_reclamos.where(Reclamo.empleado_id == empleado_id)

    result = await db.execute(query_reclamos)
    reclamos = result.scalars().all()

    tareas_response = [
        TareaReclamo(
            tipo="reclamo",
            id=r.id,
            titulo=r.titulo,
            direccion=r.direccion,
            estado=r.estado.value if isinstance(r.estado, EstadoReclamo) else r.estado,
            categoria=CategoriaMinima(
                id=r.categoria.id,
                nombre=r.categoria.nombre,
                color=r.categoria.color or "#6b7280"
            ) if r.categoria else None,
            fecha_programada=r.fecha_programada.isoformat() if r.fecha_programada else None,
            hora_inicio=r.hora_inicio.strftime("%H:%M") if r.hora_inicio else None,
            hora_fin=r.hora_fin.strftime("%H:%M") if r.hora_fin else None,
            empleado_id=r.empleado_id,
        )
        for r in reclamos
    ]

    # 3. Obtener ausencias del personal en el rango
    ausencias_response = []
    try:
        from models.empleado_gestion import EmpleadoAusencia

        query_ausencias = select(EmpleadoAusencia).where(
            or_(
                and_(
                    EmpleadoAusencia.fecha_inicio >= fecha_ini,
                    EmpleadoAusencia.fecha_inicio <= fecha_f
                ),
                and_(
                    EmpleadoAusencia.fecha_fin >= fecha_ini,
                    EmpleadoAusencia.fecha_fin <= fecha_f
                ),
                and_(
                    EmpleadoAusencia.fecha_inicio <= fecha_ini,
                    EmpleadoAusencia.fecha_fin >= fecha_f
                )
            )
        )
        if empleado_id:
            query_ausencias = query_ausencias.where(EmpleadoAusencia.empleado_id == empleado_id)

        result = await db.execute(query_ausencias)
        ausencias = result.scalars().all()

        ausencias_response = [
            AusenciaPlanificacion(
                id=a.id,
                empleado_id=a.empleado_id,
                tipo=a.tipo,
                fecha_inicio=a.fecha_inicio.isoformat() if a.fecha_inicio else "",
                fecha_fin=a.fecha_fin.isoformat() if a.fecha_fin else "",
                motivo=a.motivo,
                aprobado=a.aprobado if hasattr(a, 'aprobado') else True
            )
            for a in ausencias
        ]
    except Exception:
        # Si no existe el modelo de ausencias, ignorar
        pass

    # 4. Obtener reclamos sin asignar (para el pool)
    # "Sin asignar" = activo y sin empleado asignado
    estados_activos_sin_asignar = [
        EstadoReclamo.RECIBIDO,
        EstadoReclamo.EN_CURSO,
        EstadoReclamo.POSPUESTO,
        EstadoReclamo.NUEVO,      # legacy
        EstadoReclamo.ASIGNADO,   # legacy
    ]
    # Orden por prioridad de la OT (F6 · prioridad única): la prioridad canónica del
    # trabajo vive en la OT (enum baja<media<alta<urgente), NO en el legacy
    # Reclamo.prioridad (Integer deprecado, con doble semántica contradictoria — ver
    # docs/reclamos/08-fase-6-poi-prioridad-unica.md §2.1). Ordenar por ese campo legacy
    # ponía los MENOS urgentes primero (bug vivo). Se ordena por la severidad de la OT
    # más prioritaria del reclamo (subquery sobre el pivot, max, OTs no canceladas) y
    # luego por antigüedad. Estos reclamos del pool normalmente NO tienen OT aún (están
    # sin asignar) → sin OT viva se los trata como 'media' (rank 2) vía coalesce, de modo
    # que la prioridad manual de una eventual OT alta/urgente sube al tope y el resto
    # queda ordenado por created_at asc como antes.
    _ot_rank = case(
        (OrdenTrabajo.prioridad == PrioridadOT.URGENTE, 4),
        (OrdenTrabajo.prioridad == PrioridadOT.ALTA, 3),
        (OrdenTrabajo.prioridad == PrioridadOT.MEDIA, 2),
        (OrdenTrabajo.prioridad == PrioridadOT.BAJA, 1),
        else_=2,  # media por defecto ante un valor inesperado
    )
    ot_rank_subq = (
        select(func.max(_ot_rank))
        .select_from(OrdenTrabajoReclamo)
        .join(OrdenTrabajo, OrdenTrabajo.id == OrdenTrabajoReclamo.orden_trabajo_id)
        .where(OrdenTrabajoReclamo.reclamo_id == Reclamo.id)
        .where(OrdenTrabajo.estado != EstadoOrdenTrabajo.CANCELADA)
        .correlate(Reclamo)
        .scalar_subquery()
    )
    prioridad_orden = func.coalesce(ot_rank_subq, 2)  # sin OT viva -> 'media'
    # F4: excluir del pool los reclamos YA cubiertos por una OT VIGENTE (de
    # cuadrilla o individual). Antes, un reclamo canalizado por una OT figuraba
    # "Sin asignar" e invitaba a doble asignación — la planificación era ciega a
    # las OTs. Con F6-A toda asignación crea OT, así que esto es clave.
    from sqlalchemy import exists as _exists
    tiene_ot_vigente = (
        _exists()
        .where(OrdenTrabajoReclamo.reclamo_id == Reclamo.id)
        .where(OrdenTrabajo.id == OrdenTrabajoReclamo.orden_trabajo_id)
        .where(OrdenTrabajo.estado.in_([
            EstadoOrdenTrabajo.PENDIENTE,
            EstadoOrdenTrabajo.ASIGNADA,
            EstadoOrdenTrabajo.EN_CURSO,
        ]))
    )
    query_sin_asignar = (
        select(Reclamo)
        .options(selectinload(Reclamo.categoria))
        .where(
            Reclamo.municipio_id == municipio_id,
            Reclamo.estado.in_(estados_activos_sin_asignar),
            Reclamo.empleado_id.is_(None),
            ~tiene_ot_vigente,
        )
        .order_by(prioridad_orden.desc(), Reclamo.created_at.asc())
        .limit(30)
    )

    result = await db.execute(query_sin_asignar)
    sin_asignar = result.scalars().all()

    sin_asignar_response = [
        TareaReclamo(
            tipo="reclamo",
            id=r.id,
            titulo=r.titulo,
            direccion=r.direccion,
            estado=r.estado.value if isinstance(r.estado, EstadoReclamo) else r.estado,
            categoria=CategoriaMinima(
                id=r.categoria.id,
                nombre=r.categoria.nombre,
                color=r.categoria.color or "#6b7280"
            ) if r.categoria else None,
            fecha_programada=None,
            hora_inicio=None,
            hora_fin=None,
            empleado_id=None,
        )
        for r in sin_asignar
    ]

    return PlanificacionSemanalResponse(
        semana_inicio=fecha_inicio,
        semana_fin=fecha_fin,
        empleados=empleados_response,
        tareas=tareas_response,
        ausencias=ausencias_response,
        sin_asignar=sin_asignar_response
    )


@router.post("/desasignar")
async def desasignar_reclamo(
    request: Request,
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Quita la asignación de un reclamo (empleado, fecha programada, horas).
    Usado al arrastrar una tarea desde el calendario al pool "sin asignar".
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Reclamo).where(
            Reclamo.id == reclamo_id,
            Reclamo.municipio_id == municipio_id
        )
    )
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    reclamo.empleado_id = None
    reclamo.fecha_programada = None
    reclamo.hora_inicio = None
    reclamo.hora_fin = None
    # OT universal (F6): al quitar la asignación, cancelar la OT implícita.
    from api.ordenes_trabajo import cancelar_ot_implicita
    await cancelar_ot_implicita(db, reclamo)
    await db.commit()

    return {"success": True, "message": "Asignación quitada"}


@router.post("/asignar-fecha")
async def asignar_fecha_reclamo(
    request: Request,
    reclamo_id: int,
    empleado_id: int,
    fecha_programada: str,
    hora_inicio: Optional[str] = None,
    hora_fin: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR]))
):
    """
    Asigna o actualiza la fecha programada de un reclamo (desde drag & drop del calendario).
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    # Verificar que el reclamo existe y pertenece al municipio
    result = await db.execute(
        select(Reclamo).where(
            Reclamo.id == reclamo_id,
            Reclamo.municipio_id == municipio_id
        )
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar que el empleado existe y pertenece al municipio
    result = await db.execute(
        select(Empleado).where(
            Empleado.id == empleado_id,
            Empleado.municipio_id == municipio_id,
            Empleado.activo == True
        )
    )
    empleado = result.scalar_one_or_none()

    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    # F4: validar con datos reales. Estado no asignable BLOQUEA; ausencia y
    # exceso de capacidad WARNEAN (no bloquean — el supervisor decide).
    from services.asignacion import validar_asignacion
    try:
        fecha_d = datetime.strptime(fecha_programada, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido (YYYY-MM-DD)")
    validacion = await validar_asignacion(db, empleado_id, municipio_id, fecha_d, reclamo.estado)
    if not validacion["ok"]:
        raise HTTPException(status_code=400, detail=validacion["warnings"][0])

    # Actualizar reclamo
    try:
        reclamo.empleado_id = empleado_id
        reclamo.fecha_programada = fecha_d

        if hora_inicio:
            reclamo.hora_inicio = datetime.strptime(hora_inicio, "%H:%M").time()
        if hora_fin:
            reclamo.hora_fin = datetime.strptime(hora_fin, "%H:%M").time()

        # F4: NO escribir el estado legacy ASIGNADO. Si venía del legacy NUEVO,
        # migrarlo al estado canónico RECIBIDO (circuito recibido→en_curso→…).
        if reclamo.estado == EstadoReclamo.NUEVO:
            reclamo.estado = EstadoReclamo.RECIBIDO

        # Miga en el historial (mismo criterio que la asignación directa de reclamos)
        nombre_empleado = f"{empleado.nombre} {empleado.apellido or ''}".strip()
        db.add(HistorialReclamo(
            reclamo_id=reclamo.id,
            usuario_id=current_user.id,
            accion="asignado_empleado",
            comentario=f"Asignado a {nombre_empleado} para el {fecha_programada} (desde planificación)",
        ))

        # OT universal (F6): espejar la asignación en una OT implícita 1:1.
        from api.ordenes_trabajo import upsert_ot_implicita
        await upsert_ot_implicita(db, reclamo, empleado_id, current_user.id)

        await db.commit()

        # Notificar al/los usuario(s) vinculados al empleado (push).
        result_users = await db.execute(
            select(User).where(
                User.empleado_id == empleado_id,
                User.activo == True
            )
        )
        for empleado_user in result_users.scalars().all():
            try:
                await notificar_asignacion_empleado(db, empleado_user.id, reclamo)
            except Exception as ex:
                print(f"Error notificando asignación a usuario {empleado_user.id}: {ex}")

        return {
            "success": True,
            "message": "Reclamo asignado correctamente",
            "reclamo_id": reclamo_id,
            "empleado_id": empleado_id,
            "fecha_programada": fecha_programada,
            "warnings": validacion["warnings"],
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Error en formato de fecha/hora: {str(e)}")
