from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
import cloudinary
import cloudinary.uploader

from core.database import get_db
from core.security import get_current_user, require_roles
from core.config import settings
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.documento import Documento
from models.user import User
from models.enums import EstadoReclamo, RolUsuario
from schemas.reclamo import (
    ReclamoCreate, ReclamoUpdate, ReclamoResponse,
    ReclamoAsignar, ReclamoRechazar, ReclamoResolver
)
from schemas.historial import HistorialResponse

router = APIRouter()

# Configurar Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

def get_reclamos_query():
    return select(Reclamo).options(
        selectinload(Reclamo.categoria),
        selectinload(Reclamo.zona),
        selectinload(Reclamo.creador),
        selectinload(Reclamo.cuadrilla_asignada),
        selectinload(Reclamo.documentos)
    )

@router.get("/", response_model=List[ReclamoResponse])
async def get_reclamos(
    estado: Optional[EstadoReclamo] = None,
    categoria_id: Optional[int] = None,
    zona_id: Optional[int] = None,
    cuadrilla_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = get_reclamos_query()

    # SIEMPRE filtrar por municipio del usuario
    query = query.where(Reclamo.municipio_id == current_user.municipio_id)

    # Filtrar según rol
    if current_user.rol == RolUsuario.VECINO:
        query = query.where(Reclamo.creador_id == current_user.id)
    elif current_user.rol == RolUsuario.CUADRILLA:
        query = query.where(Reclamo.cuadrilla_id == current_user.cuadrilla_id)

    # Filtros opcionales
    if estado:
        query = query.where(Reclamo.estado == estado)
    if categoria_id:
        query = query.where(Reclamo.categoria_id == categoria_id)
    if zona_id:
        query = query.where(Reclamo.zona_id == zona_id)
    if cuadrilla_id:
        query = query.where(Reclamo.cuadrilla_id == cuadrilla_id)

    query = query.order_by(Reclamo.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/mis-reclamos", response_model=List[ReclamoResponse])
async def get_mis_reclamos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = get_reclamos_query().where(Reclamo.creador_id == current_user.id)
    query = query.order_by(Reclamo.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{reclamo_id}", response_model=ReclamoResponse)
async def cambiar_estado_reclamo_drag(
    reclamo_id: int,
    nuevo_estado: str = Query(..., description="Nuevo estado del reclamo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "cuadrilla"]))
):
    """Cambiar el estado de un reclamo (usado por drag & drop en tablero Kanban)."""
    from datetime import datetime

    # Convertir string a enum
    try:
        estado_enum = EstadoReclamo(nuevo_estado.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Estado inválido: {nuevo_estado}")

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Validar transiciones permitidas
    transiciones_validas = {
        EstadoReclamo.NUEVO: [EstadoReclamo.ASIGNADO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.ASIGNADO: [EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO, EstadoReclamo.RECHAZADO],
        EstadoReclamo.EN_PROCESO: [EstadoReclamo.RESUELTO, EstadoReclamo.ASIGNADO],
        EstadoReclamo.RESUELTO: [EstadoReclamo.EN_PROCESO],
        EstadoReclamo.RECHAZADO: [],
    }

    if estado_enum not in transiciones_validas.get(reclamo.estado, []):
        raise HTTPException(
            status_code=400,
            detail=f"No se puede cambiar de {reclamo.estado.value} a {estado_enum.value}"
        )

    # Verificar permisos de cuadrilla
    if current_user.rol == RolUsuario.CUADRILLA:
        if reclamo.cuadrilla_id != current_user.cuadrilla_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para modificar este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = estado_enum

    if estado_enum == EstadoReclamo.RESUELTO:
        reclamo.fecha_resolucion = datetime.utcnow()

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_enum,
        accion="cambio_estado",
        comentario=f"Estado cambiado de {estado_anterior.value} a {estado_enum.value}"
    )
    db.add(historial)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


@router.get("/{reclamo_id}", response_model=ReclamoResponse)
async def get_reclamo(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Verificar permisos
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este reclamo")

    return reclamo

@router.get("/{reclamo_id}/historial", response_model=List[HistorialResponse])
async def get_reclamo_historial(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(HistorialReclamo)
        .options(selectinload(HistorialReclamo.usuario))
        .where(HistorialReclamo.reclamo_id == reclamo_id)
        .order_by(HistorialReclamo.created_at.desc())
    )
    return result.scalars().all()

@router.post("/", response_model=ReclamoResponse)
async def create_reclamo(
    data: ReclamoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    reclamo = Reclamo(
        **data.model_dump(),
        creador_id=current_user.id,
        municipio_id=current_user.municipio_id,
        estado=EstadoReclamo.NUEVO
    )
    db.add(reclamo)
    await db.flush()

    # Crear historial
    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_nuevo=EstadoReclamo.NUEVO,
        accion="creado",
        comentario="Reclamo creado"
    )
    db.add(historial)

    await db.commit()

    # Recargar con relaciones
    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo.id))
    return result.scalar_one()

@router.put("/{reclamo_id}", response_model=ReclamoResponse)
async def update_reclamo(
    reclamo_id: int,
    data: ReclamoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Solo el creador o admin/supervisor pueden editar
    if current_user.rol == RolUsuario.VECINO and reclamo.creador_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este reclamo")

    # Solo se puede editar si está en estado NUEVO
    if reclamo.estado != EstadoReclamo.NUEVO:
        raise HTTPException(status_code=400, detail="Solo se pueden editar reclamos nuevos")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(reclamo, key, value)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/asignar", response_model=ReclamoResponse)
async def asignar_reclamo(
    reclamo_id: int,
    data: ReclamoAsignar,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado not in [EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO]:
        raise HTTPException(status_code=400, detail="El reclamo no puede ser asignado en su estado actual")

    estado_anterior = reclamo.estado
    reclamo.cuadrilla_id = data.cuadrilla_id
    reclamo.estado = EstadoReclamo.ASIGNADO

    # Programación del trabajo
    if data.fecha_programada:
        reclamo.fecha_programada = data.fecha_programada
    if data.hora_inicio:
        reclamo.hora_inicio = data.hora_inicio
    if data.hora_fin:
        reclamo.hora_fin = data.hora_fin

    # Construir comentario del historial
    comentario_historial = data.comentario or f"Asignado a empleado #{data.cuadrilla_id}"
    if data.fecha_programada:
        comentario_historial += f" - Programado para {data.fecha_programada}"
        if data.hora_inicio and data.hora_fin:
            comentario_historial += f" de {data.hora_inicio} a {data.hora_fin}"

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.ASIGNADO,
        accion="asignado",
        comentario=comentario_historial
    )
    db.add(historial)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/iniciar", response_model=ReclamoResponse)
async def iniciar_reclamo(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "cuadrilla"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.ASIGNADO:
        raise HTTPException(status_code=400, detail="El reclamo debe estar asignado para iniciarlo")

    # Verificar que la cuadrilla del usuario sea la asignada
    if current_user.rol == RolUsuario.CUADRILLA and reclamo.cuadrilla_id != current_user.cuadrilla_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para iniciar este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.EN_PROCESO

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.EN_PROCESO,
        accion="en_proceso",
        comentario="Trabajo iniciado"
    )
    db.add(historial)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/resolver", response_model=ReclamoResponse)
async def resolver_reclamo(
    reclamo_id: int,
    data: ReclamoResolver,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor", "cuadrilla"]))
):
    from datetime import datetime

    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.EN_PROCESO:
        raise HTTPException(status_code=400, detail="El reclamo debe estar en proceso para resolverlo")

    if current_user.rol == RolUsuario.CUADRILLA and reclamo.cuadrilla_id != current_user.cuadrilla_id:
        raise HTTPException(status_code=403, detail="No tienes permiso para resolver este reclamo")

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.RESUELTO
    reclamo.resolucion = data.resolucion
    reclamo.fecha_resolucion = datetime.utcnow()

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.RESUELTO,
        accion="resuelto",
        comentario=data.resolucion
    )
    db.add(historial)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()

@router.post("/{reclamo_id}/rechazar", response_model=ReclamoResponse)
async def rechazar_reclamo(
    reclamo_id: int,
    data: ReclamoRechazar,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado == EstadoReclamo.RESUELTO:
        raise HTTPException(status_code=400, detail="No se puede rechazar un reclamo resuelto")

    estado_anterior = reclamo.estado
    reclamo.estado = EstadoReclamo.RECHAZADO
    reclamo.motivo_rechazo = data.motivo
    reclamo.descripcion_rechazo = data.descripcion

    historial = HistorialReclamo(
        reclamo_id=reclamo.id,
        usuario_id=current_user.id,
        estado_anterior=estado_anterior,
        estado_nuevo=EstadoReclamo.RECHAZADO,
        accion="rechazado",
        comentario=f"Motivo: {data.motivo.value}. {data.descripcion or ''}"
    )
    db.add(historial)

    await db.commit()

    result = await db.execute(get_reclamos_query().where(Reclamo.id == reclamo_id))
    return result.scalar_one()


@router.post("/{reclamo_id}/upload")
async def upload_documento(
    reclamo_id: int,
    file: UploadFile = File(...),
    etapa: str = Query("creacion"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Reclamo).where(Reclamo.id == reclamo_id))
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Subir a Cloudinary
    try:
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder=f"reclamos/{reclamo_id}",
            resource_type="auto"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir archivo: {str(e)}")

    # Determinar tipo
    tipo = "imagen" if file.content_type.startswith("image/") else "documento"

    documento = Documento(
        reclamo_id=reclamo_id,
        usuario_id=current_user.id,
        nombre_original=file.filename,
        url=upload_result["secure_url"],
        public_id=upload_result["public_id"],
        tipo=tipo,
        mime_type=file.content_type,
        tamanio=upload_result.get("bytes"),
        etapa=etapa
    )
    db.add(documento)
    await db.commit()
    await db.refresh(documento)

    return {"message": "Archivo subido", "url": documento.url, "id": documento.id}


@router.get("/empleado/{cuadrilla_id}/disponibilidad/{fecha}")
async def get_disponibilidad_empleado(
    cuadrilla_id: int,
    fecha: str,
    buscar_siguiente: bool = Query(False, description="Buscar siguiente día si el actual está lleno"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtiene los bloques horarios ocupados de un empleado para una fecha específica.
    Devuelve los rangos horarios ya asignados y el próximo horario disponible.
    Si buscar_siguiente=True y el día está lleno, busca el próximo día con disponibilidad.
    """
    from datetime import date as date_type, time as time_type, timedelta, datetime as datetime_type

    # Parsear la fecha
    try:
        fecha_date = date_type.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    hora_inicio_jornada = time_type(9, 0)   # 9:00
    hora_fin_jornada = time_type(18, 0)     # 18:00
    hoy = date_type.today()
    hora_actual = datetime_type.now().time()

    # Función para obtener disponibilidad de un día específico
    async def get_disponibilidad_dia(fecha_check: date_type):
        result = await db.execute(
            select(Reclamo)
            .where(
                Reclamo.cuadrilla_id == cuadrilla_id,
                Reclamo.fecha_programada == fecha_check,
                Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
            )
            .order_by(Reclamo.hora_inicio)
        )
        reclamos = result.scalars().all()

        bloques_ocupados = []
        for r in reclamos:
            if r.hora_inicio and r.hora_fin:
                bloques_ocupados.append({
                    "reclamo_id": r.id,
                    "titulo": r.titulo,
                    "hora_inicio": r.hora_inicio.isoformat() if r.hora_inicio else None,
                    "hora_fin": r.hora_fin.isoformat() if r.hora_fin else None
                })

        # Calcular próximo horario disponible
        proximo_disponible = hora_inicio_jornada
        bloques_ocupados_sorted = sorted(bloques_ocupados, key=lambda x: x["hora_inicio"] or "00:00")

        for bloque in bloques_ocupados_sorted:
            if bloque["hora_fin"]:
                hora_fin_bloque = time_type.fromisoformat(bloque["hora_fin"])
                if hora_fin_bloque > proximo_disponible:
                    proximo_disponible = hora_fin_bloque

        # Si es el día de hoy y la hora actual es mayor al próximo disponible,
        # el próximo disponible debe ser la hora actual (redondeada al próximo bloque de 30 min)
        if fecha_check == hoy and hora_actual > proximo_disponible:
            # Redondear hora actual al próximo bloque de 30 minutos
            minutos = hora_actual.hour * 60 + hora_actual.minute
            minutos_redondeados = ((minutos + 29) // 30) * 30  # Redondear hacia arriba
            # Manejar caso donde pasa de las 24:00
            if minutos_redondeados >= 24 * 60:
                minutos_redondeados = 23 * 60 + 59
            hora_redondeada = time_type(minutos_redondeados // 60, minutos_redondeados % 60)
            proximo_disponible = hora_redondeada

        # Verificar si el día está lleno:
        # 1. Si próximo disponible >= hora fin jornada
        # 2. Si es hoy y ya pasaron las 17:00 (no alcanza para ni 1 hora de trabajo)
        dia_lleno = proximo_disponible >= hora_fin_jornada
        if fecha_check == hoy and hora_actual >= time_type(17, 0):
            dia_lleno = True

        return {
            "fecha": fecha_check.isoformat(),
            "bloques_ocupados": bloques_ocupados,
            "proximo_disponible": proximo_disponible.isoformat(),
            "hora_fin_jornada": hora_fin_jornada.isoformat(),
            "dia_lleno": dia_lleno
        }

    # Obtener disponibilidad del día solicitado
    disponibilidad = await get_disponibilidad_dia(fecha_date)

    # Si buscar_siguiente está activado y el día está lleno, buscar siguiente
    if buscar_siguiente and disponibilidad["dia_lleno"]:
        # Buscar hasta 30 días adelante
        for i in range(1, 31):
            siguiente_fecha = fecha_date + timedelta(days=i)
            # Saltar fines de semana
            if siguiente_fecha.weekday() >= 5:  # 5=Sábado, 6=Domingo
                continue

            disponibilidad_siguiente = await get_disponibilidad_dia(siguiente_fecha)
            if not disponibilidad_siguiente["dia_lleno"]:
                disponibilidad = disponibilidad_siguiente
                break

    return disponibilidad


@router.get("/{reclamo_id}/sugerencia-asignacion")
async def get_sugerencia_asignacion(
    reclamo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Algoritmo de asignación automática inteligente.
    Sugiere el mejor empleado para un reclamo basándose en:
    1. Especialidad/Categoría (peso: 40%)
    2. Zona geográfica (peso: 20%)
    3. Carga de trabajo actual (peso: 25%)
    4. Disponibilidad próxima (peso: 15%)
    """
    from datetime import date as date_type, time as time_type, timedelta, datetime as datetime_type
    from models.cuadrilla import Cuadrilla
    from models.categoria import Categoria
    from models.cuadrilla_categoria import cuadrilla_categoria
    import math

    # Obtener el reclamo
    result = await db.execute(
        get_reclamos_query().where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()
    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    if reclamo.estado != EstadoReclamo.NUEVO:
        raise HTTPException(status_code=400, detail="Solo se pueden sugerir asignaciones para reclamos nuevos")

    # Obtener todos los empleados activos del municipio
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.zona_asignada),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.activo == True, Cuadrilla.municipio_id == current_user.municipio_id)
    )
    empleados = result.scalars().all()

    if not empleados:
        return {"sugerencias": [], "mensaje": "No hay empleados activos disponibles"}

    sugerencias = []
    hoy = date_type.today()
    hora_inicio_jornada = time_type(9, 0)
    hora_fin_jornada = time_type(18, 0)

    for empleado in empleados:
        score = 0
        detalles = {
            "categoria_match": False,
            "zona_match": False,
            "carga_trabajo": 0,
            "disponibilidad_horas": 0,
            "proximo_disponible": None
        }

        # 1. ESPECIALIDAD/CATEGORÍA (40 puntos máx)
        categoria_score = 0
        categoria_ids = [cat.id for cat in empleado.categorias]

        # Categoría principal = 40 puntos
        if empleado.categoria_principal_id == reclamo.categoria_id:
            categoria_score = 40
            detalles["categoria_match"] = True
        # Tiene la categoría en su lista = 30 puntos
        elif reclamo.categoria_id in categoria_ids:
            categoria_score = 30
            detalles["categoria_match"] = True
        # No tiene la categoría = 0 puntos

        score += categoria_score

        # 2. ZONA GEOGRÁFICA (20 puntos máx)
        zona_score = 0
        if reclamo.zona_id and empleado.zona_id:
            if empleado.zona_id == reclamo.zona_id:
                zona_score = 20
                detalles["zona_match"] = True
        elif reclamo.latitud and reclamo.longitud and empleado.zona_asignada:
            # Calcular distancia si hay coordenadas
            if empleado.zona_asignada.latitud_centro and empleado.zona_asignada.longitud_centro:
                dist = math.sqrt(
                    (reclamo.latitud - empleado.zona_asignada.latitud_centro) ** 2 +
                    (reclamo.longitud - empleado.zona_asignada.longitud_centro) ** 2
                )
                # Si está a menos de 0.01 grados (~1km) = 15 puntos
                if dist < 0.01:
                    zona_score = 15
                elif dist < 0.02:
                    zona_score = 10

        score += zona_score

        # 3. CARGA DE TRABAJO (25 puntos máx - menos carga = más puntos)
        result_carga = await db.execute(
            select(func.count(Reclamo.id))
            .where(
                Reclamo.cuadrilla_id == empleado.id,
                Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
            )
        )
        carga_actual = result_carga.scalar() or 0
        detalles["carga_trabajo"] = carga_actual

        # 0 reclamos = 25 pts, 1-2 = 20 pts, 3-4 = 15 pts, 5-6 = 10 pts, 7+ = 5 pts
        if carga_actual == 0:
            carga_score = 25
        elif carga_actual <= 2:
            carga_score = 20
        elif carga_actual <= 4:
            carga_score = 15
        elif carga_actual <= 6:
            carga_score = 10
        else:
            carga_score = 5

        score += carga_score

        # 4. DISPONIBILIDAD PRÓXIMA (15 puntos máx)
        # Buscar disponibilidad en los próximos 5 días laborales
        disponibilidad_score = 0
        dias_hasta_disponible = None
        horas_disponibles_semana = 0

        for dias_offset in range(7):  # Buscar en los próximos 7 días
            fecha_check = hoy + timedelta(days=dias_offset)
            # Saltar fines de semana
            if fecha_check.weekday() >= 5:
                continue

            # Obtener reclamos programados para ese día
            result_dia = await db.execute(
                select(Reclamo)
                .where(
                    Reclamo.cuadrilla_id == empleado.id,
                    Reclamo.fecha_programada == fecha_check,
                    Reclamo.estado.in_([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
                )
            )
            reclamos_dia = result_dia.scalars().all()

            # Calcular horas ocupadas
            horas_ocupadas = 0
            for r in reclamos_dia:
                if r.hora_inicio and r.hora_fin:
                    inicio_min = r.hora_inicio.hour * 60 + r.hora_inicio.minute
                    fin_min = r.hora_fin.hour * 60 + r.hora_fin.minute
                    horas_ocupadas += (fin_min - inicio_min) / 60

            horas_jornada = 9  # 9:00 a 18:00
            horas_libres = max(0, horas_jornada - horas_ocupadas)
            horas_disponibles_semana += horas_libres

            # Si hoy y ya pasaron las 17:00, el día está lleno
            if dias_offset == 0:
                hora_actual = datetime_type.now().time()
                if hora_actual >= time_type(17, 0):
                    continue

            if dias_hasta_disponible is None and horas_libres >= 1:
                dias_hasta_disponible = dias_offset
                detalles["proximo_disponible"] = fecha_check.isoformat()

        detalles["disponibilidad_horas"] = round(horas_disponibles_semana, 1)

        # Disponible hoy = 15 pts, mañana = 12 pts, 2 días = 10 pts, etc.
        if dias_hasta_disponible is not None:
            if dias_hasta_disponible == 0:
                disponibilidad_score = 15
            elif dias_hasta_disponible == 1:
                disponibilidad_score = 12
            elif dias_hasta_disponible == 2:
                disponibilidad_score = 10
            elif dias_hasta_disponible <= 4:
                disponibilidad_score = 7
            else:
                disponibilidad_score = 5

        score += disponibilidad_score

        # Solo incluir empleados que tengan la especialidad/categoría del reclamo
        if detalles["categoria_match"]:
            sugerencias.append({
                "empleado_id": empleado.id,
                "empleado_nombre": f"{empleado.nombre} {empleado.apellido or ''}".strip(),
                "categoria_principal": empleado.categoria_principal.nombre if empleado.categoria_principal else None,
                "zona": empleado.zona_asignada.nombre if empleado.zona_asignada else None,
                "score": score,
                "score_porcentaje": round(score),  # Ya está en escala 0-100
                "detalles": detalles,
                "razon_principal": _get_razon_principal(detalles, categoria_score, zona_score, carga_score, disponibilidad_score)
            })

    # Ordenar por score descendente
    sugerencias.sort(key=lambda x: x["score"], reverse=True)

    return {
        "reclamo_id": reclamo_id,
        "categoria": reclamo.categoria.nombre,
        "zona": reclamo.zona.nombre if reclamo.zona else None,
        "sugerencias": sugerencias[:5],  # Top 5
        "total_empleados_evaluados": len(empleados)
    }


def _get_razon_principal(detalles: dict, cat_score: int, zona_score: int, carga_score: int, disp_score: int) -> str:
    """Genera una explicación de por qué se sugiere este empleado."""
    razones = []

    if detalles["categoria_match"] and cat_score >= 30:
        razones.append("especialista en la categoría")

    if detalles["zona_match"]:
        razones.append("trabaja en la zona")

    if detalles["carga_trabajo"] == 0:
        razones.append("sin reclamos pendientes")
    elif detalles["carga_trabajo"] <= 2:
        razones.append("baja carga de trabajo")

    if detalles["proximo_disponible"]:
        from datetime import date as date_type
        fecha_disp = date_type.fromisoformat(detalles["proximo_disponible"])
        if fecha_disp == date_type.today():
            razones.append("disponible hoy")
        elif (fecha_disp - date_type.today()).days == 1:
            razones.append("disponible mañana")

    if not razones:
        razones.append("disponible")

    return ", ".join(razones).capitalize()
