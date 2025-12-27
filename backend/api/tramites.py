from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
import logging

from core.database import get_db
from core.security import get_current_user, get_current_user_optional, require_roles
from core.config import settings
from models.tramite import ServicioTramite, Tramite, HistorialTramite, EstadoTramite
from models.user import User
from models.enums import RolUsuario
from models.notificacion import Notificacion
from schemas.tramite import (
    ServicioTramiteCreate, ServicioTramiteUpdate, ServicioTramiteResponse,
    TramiteCreate, TramiteUpdate, TramiteResponse, TramiteAsignar,
    HistorialTramiteResponse
)
from models.empleado import Empleado
from services.notificacion_service import NotificacionService, get_plantilla, formatear_mensaje

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== SERVICIOS DE TRAMITES ====================

@router.get("/servicios", response_model=List[ServicioTramiteResponse])
async def listar_servicios(
    municipio_id: int = Query(..., description="ID del municipio"),
    solo_activos: bool = Query(True, description="Solo servicios activos"),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los servicios de trámites disponibles para un municipio (público)"""
    query = select(ServicioTramite).where(ServicioTramite.municipio_id == municipio_id)

    if solo_activos:
        query = query.where(ServicioTramite.activo == True)

    query = query.order_by(ServicioTramite.orden, ServicioTramite.nombre)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/servicios/{servicio_id}", response_model=ServicioTramiteResponse)
async def obtener_servicio(
    servicio_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Obtiene un servicio de trámite por ID (público)"""
    result = await db.execute(
        select(ServicioTramite).where(ServicioTramite.id == servicio_id)
    )
    servicio = result.scalar_one_or_none()

    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    return servicio


@router.post("/servicios", response_model=ServicioTramiteResponse)
async def crear_servicio(
    servicio_data: ServicioTramiteCreate,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo servicio de trámite (solo admin/gestor)"""
    servicio = ServicioTramite(
        municipio_id=municipio_id,
        **servicio_data.model_dump()
    )

    db.add(servicio)
    await db.commit()
    await db.refresh(servicio)

    return servicio


@router.put("/servicios/{servicio_id}", response_model=ServicioTramiteResponse)
async def actualizar_servicio(
    servicio_id: int,
    servicio_data: ServicioTramiteUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un servicio de trámite (solo admin/gestor)"""
    result = await db.execute(
        select(ServicioTramite).where(ServicioTramite.id == servicio_id)
    )
    servicio = result.scalar_one_or_none()

    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    for field, value in servicio_data.model_dump(exclude_unset=True).items():
        setattr(servicio, field, value)

    await db.commit()
    await db.refresh(servicio)

    return servicio


@router.delete("/servicios/{servicio_id}")
async def eliminar_servicio(
    servicio_id: int,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Elimina (desactiva) un servicio de trámite (solo admin)"""
    result = await db.execute(
        select(ServicioTramite).where(ServicioTramite.id == servicio_id)
    )
    servicio = result.scalar_one_or_none()

    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")

    # Soft delete - solo desactivar
    servicio.activo = False
    await db.commit()

    return {"message": "Servicio desactivado correctamente"}


# ==================== TRAMITES ====================

@router.get("", response_model=List[TramiteResponse])
async def listar_tramites(
    municipio_id: int = Query(..., description="ID del municipio"),
    estado: Optional[EstadoTramite] = Query(None, description="Filtrar por estado"),
    servicio_id: Optional[int] = Query(None, description="Filtrar por servicio"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Lista trámites. Si es vecino, solo ve los suyos. Si es gestor/admin, ve todos del municipio."""
    query = select(Tramite).where(Tramite.municipio_id == municipio_id)

    # Si es vecino, solo ve sus propios trámites
    if current_user and current_user.rol == RolUsuario.VECINO:
        query = query.where(Tramite.solicitante_id == current_user.id)
    elif not current_user:
        # Usuario anónimo no puede listar trámites
        raise HTTPException(status_code=401, detail="Debe iniciar sesión para ver sus trámites")

    if estado:
        query = query.where(Tramite.estado == estado)

    if servicio_id:
        query = query.where(Tramite.servicio_id == servicio_id)

    query = query.options(
        selectinload(Tramite.servicio),
        selectinload(Tramite.empleado_asignado),
        selectinload(Tramite.solicitante)
    )
    query = query.order_by(Tramite.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/consultar/{numero_tramite}", response_model=TramiteResponse)
async def consultar_tramite_por_numero(
    numero_tramite: str,
    db: AsyncSession = Depends(get_db)
):
    """Consulta un trámite por su número (público, para seguimiento)"""
    result = await db.execute(
        select(Tramite)
        .options(
            selectinload(Tramite.servicio),
            selectinload(Tramite.empleado_asignado),
            selectinload(Tramite.solicitante)
        )
        .where(Tramite.numero_tramite == numero_tramite)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    return tramite


@router.get("/{tramite_id}", response_model=TramiteResponse)
async def obtener_tramite(
    tramite_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene un trámite por ID"""
    result = await db.execute(
        select(Tramite)
        .options(
            selectinload(Tramite.servicio),
            selectinload(Tramite.empleado_asignado),
            selectinload(Tramite.solicitante)
        )
        .where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    # Verificar permisos: vecino solo puede ver sus propios trámites
    if current_user and current_user.rol == RolUsuario.VECINO:
        if tramite.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso para ver este trámite")

    return tramite


@router.post("", response_model=TramiteResponse)
async def crear_tramite(
    tramite_data: TramiteCreate,
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """
    Crea un nuevo trámite.
    - Si el usuario está logueado, se asocia automáticamente.
    - Si es anónimo, debe proveer datos de contacto.
    """
    # Verificar que el servicio existe y está activo
    result = await db.execute(
        select(ServicioTramite).where(
            and_(
                ServicioTramite.id == tramite_data.servicio_id,
                ServicioTramite.municipio_id == municipio_id,
                ServicioTramite.activo == True
            )
        )
    )
    servicio = result.scalar_one_or_none()

    if not servicio:
        raise HTTPException(status_code=404, detail="Servicio no encontrado o no disponible")

    # Generar número de trámite único
    year = datetime.now().year
    result = await db.execute(
        select(func.count(Tramite.id)).where(
            and_(
                Tramite.municipio_id == municipio_id,
                func.extract('year', Tramite.created_at) == year
            )
        )
    )
    count = result.scalar() or 0
    numero_tramite = f"TRM-{year}-{str(count + 1).zfill(5)}"

    # Preparar datos del trámite
    tramite_dict = tramite_data.model_dump()

    tramite = Tramite(
        municipio_id=municipio_id,
        numero_tramite=numero_tramite,
        estado=EstadoTramite.INICIADO,
        **tramite_dict
    )

    # Si hay usuario logueado, asociar
    if current_user:
        tramite.solicitante_id = current_user.id
        # Si no se proporcionaron datos de contacto, usar los del usuario
        if not tramite.nombre_solicitante:
            tramite.nombre_solicitante = current_user.nombre
        if not tramite.apellido_solicitante:
            tramite.apellido_solicitante = current_user.apellido
        if not tramite.email_solicitante:
            tramite.email_solicitante = current_user.email
        if not tramite.telefono_solicitante:
            tramite.telefono_solicitante = current_user.telefono
        if not tramite.dni_solicitante:
            tramite.dni_solicitante = current_user.dni
        if not tramite.direccion_solicitante:
            tramite.direccion_solicitante = current_user.direccion
    else:
        # Usuario anónimo: verificar que al menos tenga email o teléfono
        if not tramite_data.email_solicitante and not tramite_data.telefono_solicitante:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar al menos email o teléfono para seguimiento del trámite"
            )

    db.add(tramite)
    await db.commit()
    await db.refresh(tramite)

    # Registrar en historial
    historial = HistorialTramite(
        tramite_id=tramite.id,
        usuario_id=current_user.id if current_user else None,
        estado_nuevo=EstadoTramite.INICIADO,
        accion="Trámite creado",
        comentario=f"Trámite iniciado para servicio: {servicio.nombre}"
    )
    db.add(historial)
    await db.commit()

    # Cargar relación servicio para la respuesta
    await db.refresh(tramite, ["servicio"])

    # === NOTIFICACIONES ===
    try:
        # Preparar variables para las plantillas
        variables = {
            "numero_tramite": tramite.numero_tramite,
            "servicio": servicio.nombre,
            "asunto": tramite.asunto or "Sin asunto",
            "nombre": tramite.nombre_solicitante or "Vecino",
            "solicitante_nombre": f"{tramite.nombre_solicitante or ''} {tramite.apellido_solicitante or ''}".strip() or "Sin nombre",
            "url": f"{settings.FRONTEND_URL}/tramites/{tramite.id}"
        }

        # 1. Notificación in-app al vecino (si está logueado)
        if current_user:
            plantilla = get_plantilla("tramite_creado")
            if plantilla:
                push_config = plantilla.get("push", {})
                titulo = formatear_mensaje(push_config.get("titulo", "Trámite Registrado"), variables)
                cuerpo = formatear_mensaje(push_config.get("cuerpo", ""), variables)

                notif = Notificacion(
                    usuario_id=current_user.id,
                    titulo=titulo,
                    mensaje=cuerpo,
                    tipo="tramite"
                )
                db.add(notif)
                await db.commit()
                logger.info(f"Notificación creada para usuario {current_user.id} - Trámite {tramite.numero_tramite}")

        # 2. Notificación a supervisores
        await NotificacionService.notificar_supervisores(
            db=db,
            municipio_id=municipio_id,
            titulo=f"Nuevo Trámite: {tramite.numero_tramite}",
            mensaje=f"Nuevo trámite de {servicio.nombre}: {tramite.asunto or 'Sin asunto'}",
            tipo="tramite",
            enviar_whatsapp=False  # Por ahora solo in-app
        )
    except Exception as e:
        logger.error(f"Error enviando notificaciones de trámite: {e}")
        # No fallar el endpoint si las notificaciones fallan

    return tramite


@router.put("/{tramite_id}", response_model=TramiteResponse)
async def actualizar_tramite(
    tramite_id: int,
    tramite_data: TramiteUpdate,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR, RolUsuario.EMPLEADO])),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un trámite (solo personal municipal)"""
    result = await db.execute(
        select(Tramite)
        .options(selectinload(Tramite.servicio))
        .where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    estado_anterior = tramite.estado

    # Actualizar campos
    for field, value in tramite_data.model_dump(exclude_unset=True).items():
        setattr(tramite, field, value)

    # Si cambió el estado, registrar fecha de resolución si corresponde
    cambio_estado = tramite_data.estado and tramite_data.estado != estado_anterior
    if cambio_estado:
        if tramite_data.estado in [EstadoTramite.APROBADO, EstadoTramite.RECHAZADO, EstadoTramite.FINALIZADO]:
            tramite.fecha_resolucion = datetime.utcnow()

        # Registrar en historial
        historial = HistorialTramite(
            tramite_id=tramite.id,
            usuario_id=current_user.id,
            estado_anterior=estado_anterior,
            estado_nuevo=tramite_data.estado,
            accion=f"Estado cambiado a {tramite_data.estado.value}",
            comentario=tramite_data.observaciones
        )
        db.add(historial)

    await db.commit()
    await db.refresh(tramite)

    # === NOTIFICACIONES por cambio de estado ===
    if cambio_estado and tramite.solicitante_id:
        try:
            variables = {
                "numero_tramite": tramite.numero_tramite,
                "servicio": tramite.servicio.nombre if tramite.servicio else "Trámite",
                "estado_nuevo": tramite_data.estado.value.replace("_", " ").title(),
                "nombre": tramite.nombre_solicitante or "Vecino",
                "motivo_rechazo": tramite_data.observaciones or "Sin especificar",
                "url": f"{settings.FRONTEND_URL}/tramites/{tramite.id}"
            }

            # Determinar tipo de notificación según estado
            if tramite_data.estado == EstadoTramite.APROBADO:
                tipo_notif = "tramite_aprobado"
            elif tramite_data.estado == EstadoTramite.RECHAZADO:
                tipo_notif = "tramite_rechazado"
            else:
                tipo_notif = "tramite_cambio_estado"

            plantilla = get_plantilla(tipo_notif)
            if plantilla:
                push_config = plantilla.get("push", {})
                titulo = formatear_mensaje(push_config.get("titulo", "Estado Actualizado"), variables)
                cuerpo = formatear_mensaje(push_config.get("cuerpo", ""), variables)

                notif = Notificacion(
                    usuario_id=tramite.solicitante_id,
                    titulo=titulo,
                    mensaje=cuerpo,
                    tipo="tramite"
                )
                db.add(notif)
                await db.commit()
                logger.info(f"Notificación de cambio de estado enviada - Trámite {tramite.numero_tramite}")
        except Exception as e:
            logger.error(f"Error enviando notificación de cambio de estado: {e}")

    return tramite


@router.get("/{tramite_id}/historial", response_model=List[HistorialTramiteResponse])
async def obtener_historial_tramite(
    tramite_id: int,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene el historial de cambios de un trámite"""
    # Verificar que el trámite existe
    result = await db.execute(
        select(Tramite).where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    # Verificar permisos
    if current_user and current_user.rol == RolUsuario.VECINO:
        if tramite.solicitante_id != current_user.id:
            raise HTTPException(status_code=403, detail="No tiene permiso para ver este trámite")

    result = await db.execute(
        select(HistorialTramite)
        .where(HistorialTramite.tramite_id == tramite_id)
        .order_by(HistorialTramite.created_at.desc())
    )

    return result.scalars().all()


# ==================== ESTADÍSTICAS ====================

@router.get("/stats/resumen")
async def resumen_tramites(
    municipio_id: int = Query(..., description="ID del municipio"),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Resumen de trámites para dashboard (solo admin/gestor)"""
    # Contar por estado
    result = await db.execute(
        select(Tramite.estado, func.count(Tramite.id))
        .where(Tramite.municipio_id == municipio_id)
        .group_by(Tramite.estado)
    )
    por_estado = {row[0].value: row[1] for row in result.all()}

    # Total de trámites
    total_result = await db.execute(
        select(func.count(Tramite.id)).where(Tramite.municipio_id == municipio_id)
    )
    total = total_result.scalar() or 0

    # Trámites de hoy
    from datetime import date
    hoy_result = await db.execute(
        select(func.count(Tramite.id)).where(
            and_(
                Tramite.municipio_id == municipio_id,
                func.date(Tramite.created_at) == date.today()
            )
        )
    )
    hoy = hoy_result.scalar() or 0

    return {
        "total": total,
        "hoy": hoy,
        "por_estado": por_estado
    }


# ==================== ASIGNACIÓN ====================

@router.post("/{tramite_id}/asignar", response_model=TramiteResponse)
async def asignar_tramite(
    tramite_id: int,
    asignacion: TramiteAsignar,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """Asigna un empleado a un trámite"""
    # Obtener trámite
    result = await db.execute(
        select(Tramite)
        .options(
            selectinload(Tramite.servicio),
            selectinload(Tramite.empleado_asignado),
            selectinload(Tramite.solicitante)
        )
        .where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    # Verificar que el empleado existe
    result = await db.execute(
        select(Empleado).where(
            and_(
                Empleado.id == asignacion.empleado_id,
                Empleado.municipio_id == tramite.municipio_id,
                Empleado.activo == True
            )
        )
    )
    empleado = result.scalar_one_or_none()

    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado o no disponible")

    # Guardar empleado anterior para historial
    empleado_anterior_id = tramite.empleado_id
    estado_anterior = tramite.estado

    # Asignar empleado
    tramite.empleado_id = asignacion.empleado_id

    # Si estaba en estado iniciado, pasar a en_revision
    if tramite.estado == EstadoTramite.INICIADO:
        tramite.estado = EstadoTramite.EN_REVISION

    # Registrar en historial
    accion = "Empleado asignado" if not empleado_anterior_id else "Empleado reasignado"
    historial = HistorialTramite(
        tramite_id=tramite.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=tramite.estado,
        accion=f"{accion}: {empleado.nombre} {empleado.apellido or ''}",
        comentario=asignacion.comentario
    )
    db.add(historial)

    await db.commit()
    await db.refresh(tramite)

    return tramite


@router.get("/{tramite_id}/sugerir-empleado")
async def sugerir_empleado_ia(
    tramite_id: int,
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR])),
    db: AsyncSession = Depends(get_db)
):
    """
    Usa IA para sugerir el mejor empleado para un trámite
    basándose en el tipo de servicio, carga de trabajo y disponibilidad.
    """
    import httpx
    from core.config import settings

    # Obtener trámite con servicio
    result = await db.execute(
        select(Tramite)
        .options(selectinload(Tramite.servicio))
        .where(Tramite.id == tramite_id)
    )
    tramite = result.scalar_one_or_none()

    if not tramite:
        raise HTTPException(status_code=404, detail="Trámite no encontrado")

    # Obtener empleados activos del municipio
    result = await db.execute(
        select(Empleado).where(
            and_(
                Empleado.municipio_id == tramite.municipio_id,
                Empleado.activo == True
            )
        )
    )
    empleados = result.scalars().all()

    if not empleados:
        return {
            "sugerencia": None,
            "mensaje": "No hay empleados disponibles",
            "empleados": []
        }

    # Obtener carga de trabajo de cada empleado (trámites activos)
    cargas = {}
    for emp in empleados:
        result = await db.execute(
            select(func.count(Tramite.id)).where(
                and_(
                    Tramite.empleado_id == emp.id,
                    Tramite.estado.notin_([EstadoTramite.FINALIZADO, EstadoTramite.RECHAZADO])
                )
            )
        )
        cargas[emp.id] = result.scalar() or 0

    # Preparar datos para IA
    empleados_info = []
    for emp in empleados:
        empleados_info.append({
            "id": emp.id,
            "nombre": f"{emp.nombre} {emp.apellido or ''}",
            "especialidad": emp.especialidad or "General",
            "carga_actual": cargas[emp.id],
            "capacidad_maxima": emp.capacidad_maxima
        })

    # Si no hay API de Gemini, usar lógica simple
    if not settings.GEMINI_API_KEY:
        # Ordenar por menor carga de trabajo
        empleados_ordenados = sorted(empleados_info, key=lambda x: x["carga_actual"])
        mejor = empleados_ordenados[0] if empleados_ordenados else None

        return {
            "sugerencia": mejor,
            "mensaje": f"Sugerido por menor carga de trabajo ({mejor['carga_actual']} trámites activos)" if mejor else None,
            "empleados": empleados_info
        }

    # Usar IA para sugerencia más inteligente
    prompt = f"""Eres un asistente de gestión municipal. Sugiere el mejor empleado para este trámite:

TRÁMITE:
- Servicio: {tramite.servicio.nombre if tramite.servicio else 'General'}
- Asunto: {tramite.asunto}
- Descripción: {tramite.descripcion or 'Sin descripción'}

EMPLEADOS DISPONIBLES:
{chr(10).join([f"- ID {e['id']}: {e['nombre']} | Especialidad: {e['especialidad']} | Carga: {e['carga_actual']}/{e['capacidad_maxima']}" for e in empleados_info])}

Responde SOLO con el ID del empleado más adecuado y una breve razón (máximo 30 palabras).
Formato: ID|RAZÓN
Ejemplo: 3|Especialista en el área con menor carga de trabajo"""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 100,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')

                if "|" in text:
                    parts = text.strip().split("|")
                    try:
                        emp_id = int(parts[0].strip())
                        razon = parts[1].strip() if len(parts) > 1 else "Sugerido por IA"

                        sugerido = next((e for e in empleados_info if e["id"] == emp_id), None)
                        if sugerido:
                            return {
                                "sugerencia": sugerido,
                                "mensaje": razon,
                                "empleados": empleados_info
                            }
                    except ValueError:
                        pass

    except Exception as e:
        print(f"Error consultando IA: {e}")

    # Fallback: menor carga
    empleados_ordenados = sorted(empleados_info, key=lambda x: x["carga_actual"])
    mejor = empleados_ordenados[0] if empleados_ordenados else None

    return {
        "sugerencia": mejor,
        "mensaje": f"Sugerido por menor carga de trabajo ({mejor['carga_actual']} trámites activos)" if mejor else None,
        "empleados": empleados_info
    }


# ==================== GESTIÓN MASIVA ====================

@router.get("/gestion/todos", response_model=List[TramiteResponse])
async def listar_todos_tramites(
    municipio_id: int = Query(..., description="ID del municipio"),
    estado: Optional[EstadoTramite] = Query(None, description="Filtrar por estado"),
    servicio_id: Optional[int] = Query(None, description="Filtrar por servicio"),
    empleado_id: Optional[int] = Query(None, description="Filtrar por empleado"),
    sin_asignar: bool = Query(False, description="Solo trámites sin asignar"),
    search: Optional[str] = Query(None, description="Buscar por número, asunto o solicitante"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN, RolUsuario.SUPERVISOR, RolUsuario.EMPLEADO])),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los trámites para gestión (supervisores/admin)"""
    query = select(Tramite).where(Tramite.municipio_id == municipio_id)

    if estado:
        query = query.where(Tramite.estado == estado)

    if servicio_id:
        query = query.where(Tramite.servicio_id == servicio_id)

    if empleado_id:
        query = query.where(Tramite.empleado_id == empleado_id)

    if sin_asignar:
        query = query.where(Tramite.empleado_id == None)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            (Tramite.numero_tramite.ilike(search_term)) |
            (Tramite.asunto.ilike(search_term)) |
            (Tramite.nombre_solicitante.ilike(search_term)) |
            (Tramite.apellido_solicitante.ilike(search_term)) |
            (Tramite.dni_solicitante.ilike(search_term))
        )

    # Si es empleado, solo ver los suyos
    if current_user.rol == RolUsuario.EMPLEADO:
        query = query.where(Tramite.empleado_id == current_user.empleado_id)

    query = query.options(
        selectinload(Tramite.servicio),
        selectinload(Tramite.empleado_asignado),
        selectinload(Tramite.solicitante)
    )
    query = query.order_by(Tramite.prioridad, Tramite.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()
