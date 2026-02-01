from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional

from core.database import get_db
from core.security import get_current_user, require_roles, get_password_hash
from models.empleado import Empleado
from models.empleado_horario import EmpleadoHorario
from models.tramite import Solicitud, EstadoSolicitud
from models.reclamo import Reclamo
from models.categoria import Categoria
from models.user import User
from schemas.empleado import EmpleadoCreate, EmpleadoUpdate, EmpleadoResponse, EmpleadoDisponibilidad, HorarioSimple

router = APIRouter()

@router.get("/me", response_model=EmpleadoResponse)
async def get_mi_empleado(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener datos del empleado vinculado al usuario actual"""
    if not current_user.empleado_id:
        raise HTTPException(status_code=404, detail="No tienes un empleado vinculado")

    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == current_user.empleado_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    return empleado


def _formato_horario(horarios: List[EmpleadoHorario]) -> str:
    """Genera texto legible del horario, ej: 'Lun-Vie 8:00-16:00'"""
    if not horarios:
        return "Sin horario definido"

    dias_nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    activos = [h for h in horarios if h.activo]

    if not activos:
        return "Sin horario definido"

    # Agrupar por horario similar
    grupos = {}
    for h in activos:
        key = f"{h.hora_entrada.strftime('%H:%M')}-{h.hora_salida.strftime('%H:%M')}"
        if key not in grupos:
            grupos[key] = []
        grupos[key].append(h.dia_semana)

    partes = []
    for horario, dias in grupos.items():
        dias.sort()
        # Detectar rangos consecutivos
        if len(dias) >= 2 and dias[-1] - dias[0] == len(dias) - 1:
            rango = f"{dias_nombres[dias[0]]}-{dias_nombres[dias[-1]]}"
        else:
            rango = ", ".join(dias_nombres[d] for d in dias)
        partes.append(f"{rango} {horario}")

    return " | ".join(partes)


@router.get("/disponibilidad", response_model=List[EmpleadoDisponibilidad])
async def get_empleados_disponibilidad(
    tipo: Optional[str] = Query(None, description="Filtrar por tipo: operario o administrativo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Obtener empleados con su disponibilidad y horarios.
    Ordenados por disponibilidad (menos carga = más disponible).
    """
    # Query base de empleados activos del municipio
    query = select(Empleado).options(
        selectinload(Empleado.horarios)
    ).where(
        Empleado.municipio_id == current_user.municipio_id,
        Empleado.activo == True
    )

    # Filtrar por tipo si se especifica
    if tipo:
        query = query.where(Empleado.tipo == tipo)

    result = await db.execute(query)
    empleados = result.scalars().all()

    # Estados pendientes para trámites (solicitudes) - Enum con mayúsculas
    estados_pendientes_tramites = [
        EstadoSolicitud.INICIADO,
        EstadoSolicitud.EN_REVISION,
        EstadoSolicitud.EN_CURSO
    ]
    # Estados pendientes para reclamos (strings en minúscula)
    estados_pendientes_reclamos = ['pendiente', 'en_progreso', 'asignado']

    resultado = []
    for emp in empleados:
        # TODO: Migrar a dependencia cuando se implemente IA
        # Por ahora, la carga se calcula sin filtro de empleado
        carga_tramites = 0  # Pendiente: filtrar por dependencia asignada
        carga_reclamos = 0  # Pendiente: filtrar por dependencia asignada

        carga_actual = carga_tramites + carga_reclamos
        disponibilidad = max(0, emp.capacidad_maxima - carga_actual)
        porcentaje = (carga_actual / emp.capacidad_maxima * 100) if emp.capacidad_maxima > 0 else 0

        # Formatear horarios
        horarios_list = [
            HorarioSimple(
                dia_semana=h.dia_semana,
                hora_entrada=h.hora_entrada.strftime("%H:%M") if h.hora_entrada else "00:00",
                hora_salida=h.hora_salida.strftime("%H:%M") if h.hora_salida else "00:00",
                activo=h.activo
            )
            for h in emp.horarios
        ]

        resultado.append(EmpleadoDisponibilidad(
            id=emp.id,
            nombre=emp.nombre,
            apellido=emp.apellido,
            especialidad=emp.especialidad,
            tipo=emp.tipo or "operario",
            capacidad_maxima=emp.capacidad_maxima,
            carga_actual=carga_actual,
            disponibilidad=disponibilidad,
            porcentaje_ocupacion=round(porcentaje, 1),
            horarios=horarios_list,
            horario_texto=_formato_horario(emp.horarios)
        ))

    # Ordenar por disponibilidad (más disponible primero)
    resultado.sort(key=lambda x: (-x.disponibilidad, x.porcentaje_ocupacion))

    return resultado


@router.get("", response_model=List[EmpleadoResponse])
async def get_empleados(
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    query = select(Empleado).options(
        selectinload(Empleado.miembros),
        selectinload(Empleado.categorias),
        selectinload(Empleado.categoria_principal)
    ).where(Empleado.municipio_id == current_user.municipio_id)
    if activo is not None:
        query = query.where(Empleado.activo == activo)
    query = query.order_by(Empleado.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{empleado_id}", response_model=EmpleadoResponse)
async def get_empleado(
    empleado_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado_id)
        .where(Empleado.municipio_id == current_user.municipio_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    return empleado

@router.post("", response_model=EmpleadoResponse)
async def create_empleado(
    data: EmpleadoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Verificar que el email no exista
    existing_user = await db.execute(
        select(User).where(User.email == data.email)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")

    # 1. Crear el usuario con rol empleado
    nuevo_usuario = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        nombre=data.nombre,
        apellido=data.apellido or "",
        telefono=data.telefono,
        dni=data.dni,
        rol="empleado",
        municipio_id=current_user.municipio_id,
        activo=True
    )
    db.add(nuevo_usuario)
    await db.flush()  # Para obtener el ID del usuario

    # 2. Crear el empleado vinculado al usuario
    categoria_ids = data.categoria_ids or []
    empleado_data = {
        'nombre': data.nombre,
        'apellido': data.apellido,
        'telefono': data.telefono,
        'descripcion': data.descripcion,
        'especialidad': data.especialidad,
        'tipo': data.tipo or 'operario',
        'zona_id': data.zona_id,
        'capacidad_maxima': data.capacidad_maxima,
        'categoria_principal_id': data.categoria_principal_id,
        'municipio_id': current_user.municipio_id
    }

    empleado = Empleado(**empleado_data)

    # Agregar categorias si se proporcionan (solo habilitadas para el municipio)
    from models.categoria import MunicipioCategoria
    if categoria_ids:
        result = await db.execute(
            select(Categoria)
            .join(MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id)
            .where(
                Categoria.id.in_(categoria_ids),
                MunicipioCategoria.municipio_id == current_user.municipio_id,
                MunicipioCategoria.activo == True
            )
        )
        categorias = result.scalars().all()
        empleado.categorias = list(categorias)

    db.add(empleado)
    await db.flush()

    # 3. Vincular usuario al empleado como miembro
    nuevo_usuario.empleado_id = empleado.id

    await db.commit()
    await db.refresh(empleado)

    # Recargar con relaciones
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado.id)
    )
    return result.scalar_one()

@router.put("/{empleado_id}", response_model=EmpleadoResponse)
async def update_empleado(
    empleado_id: int,
    data: EmpleadoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado_id)
        .where(Empleado.municipio_id == current_user.municipio_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # Manejar categoria_ids por separado (solo habilitadas para el municipio)
    if 'categoria_ids' in update_data:
        categoria_ids = update_data.pop('categoria_ids')
        if categoria_ids is not None:
            if categoria_ids:
                from models.categoria import MunicipioCategoria
                result = await db.execute(
                    select(Categoria)
                    .join(MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id)
                    .where(
                        Categoria.id.in_(categoria_ids),
                        MunicipioCategoria.municipio_id == current_user.municipio_id,
                        MunicipioCategoria.activo == True
                    )
                )
                categorias = result.scalars().all()
                empleado.categorias = list(categorias)
            else:
                # Si envían lista vacía, limpiar categorías
                empleado.categorias = []

    # Actualizar campos normales
    for key, value in update_data.items():
        setattr(empleado, key, value)

    await db.commit()
    await db.refresh(empleado)

    # Recargar con relaciones
    result = await db.execute(
        select(Empleado)
        .options(
            selectinload(Empleado.miembros),
            selectinload(Empleado.categorias),
            selectinload(Empleado.categoria_principal)
        )
        .where(Empleado.id == empleado_id)
    )
    return result.scalar_one()

@router.delete("/{empleado_id}")
async def delete_empleado(
    empleado_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Empleado)
        .where(Empleado.id == empleado_id)
        .where(Empleado.municipio_id == current_user.municipio_id)
    )
    empleado = result.scalar_one_or_none()
    if not empleado:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")

    empleado.activo = False
    await db.commit()
    return {"message": "Empleado desactivado"}
