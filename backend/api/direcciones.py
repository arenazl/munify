from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.exc import OperationalError
from typing import List
import re
import asyncio

from core.database import get_db
from core.security import get_current_user, require_roles
from models.direccion import Direccion
from models.direccion_categoria import DireccionCategoria
from models.direccion_tipo_tramite import DireccionTipoTramite
from models.categoria import Categoria, MunicipioCategoria
from models.tramite import TipoTramite, MunicipioTipoTramite
from models.user import User
from models.enums import RolUsuario
from schemas.direccion import (
    DireccionCreate,
    DireccionUpdate,
    DireccionResponse,
    DireccionListResponse,
    AsignarCategoriasRequest,
    AsignarTiposTramiteRequest,
)

router = APIRouter()


def generar_codigo_direccion(nombre: str) -> str:
    """
    Genera un código automático basado en las iniciales del nombre.
    Ej: "Dirección de Obras Públicas" -> "DOP"
    """
    # Palabras a ignorar (artículos y preposiciones)
    ignorar = {'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'a'}

    # Limpiar y dividir en palabras
    palabras = re.sub(r'[^\w\s]', '', nombre).split()

    # Tomar la primera letra de cada palabra significativa
    iniciales = ''.join(
        palabra[0].upper()
        for palabra in palabras
        if palabra.lower() not in ignorar and len(palabra) > 1
    )

    # Si quedó muy corto, usar las primeras 3 letras del nombre
    if len(iniciales) < 2:
        iniciales = nombre[:3].upper()

    return iniciales


async def generar_codigo_unico(db: AsyncSession, municipio_id: int, nombre: str) -> str:
    """
    Genera un código único para la dirección.
    Formato: INICIALES-NNN (ej: DOP-001)
    """
    prefijo = generar_codigo_direccion(nombre)

    # Buscar el último número usado con este prefijo
    result = await db.execute(
        select(func.count(Direccion.id))
        .where(
            Direccion.municipio_id == municipio_id,
            Direccion.codigo.like(f"{prefijo}-%")
        )
    )
    count = result.scalar() or 0

    # Generar el nuevo código
    return f"{prefijo}-{str(count + 1).zfill(3)}"


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


# ============ CRUD Direcciones ============

@router.get("", response_model=List[DireccionListResponse])
async def get_direcciones(
    request: Request,
    activo: bool = None,
    tipo_gestion: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener todas las direcciones del municipio"""
    municipio_id = get_effective_municipio_id(request, current_user)

    query = select(Direccion).where(Direccion.municipio_id == municipio_id)

    if activo is not None:
        query = query.where(Direccion.activo == activo)

    if tipo_gestion:
        query = query.where(Direccion.tipo_gestion == tipo_gestion)

    query = query.order_by(Direccion.orden, Direccion.nombre)
    result = await db.execute(query)
    return result.scalars().all()


# ============ Endpoints de consulta para drag & drop ============
# IMPORTANTE: Estas rutas deben ir ANTES de /{direccion_id} para evitar conflictos

@router.get("/configuracion/categorias-disponibles")
async def get_categorias_disponibles(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtener todas las categorías habilitadas para el municipio,
    indicando a qué direcciones están asignadas.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Categoria)
        .join(MunicipioCategoria, MunicipioCategoria.categoria_id == Categoria.id)
        .where(
            MunicipioCategoria.municipio_id == municipio_id,
            MunicipioCategoria.activo == True,
            Categoria.activo == True
        )
        .order_by(Categoria.nombre)
    )
    categorias = result.scalars().all()

    response = []
    for cat in categorias:
        result = await db.execute(
            select(DireccionCategoria)
            .where(
                DireccionCategoria.categoria_id == cat.id,
                DireccionCategoria.municipio_id == municipio_id,
                DireccionCategoria.activo == True
            )
        )
        asignaciones = result.scalars().all()
        response.append({
            "id": cat.id,
            "nombre": cat.nombre,
            "icono": cat.icono,
            "color": cat.color,
            "descripcion": cat.descripcion,
            "direcciones_asignadas": [a.direccion_id for a in asignaciones]
        })

    return response


@router.get("/configuracion/tipos-tramite-disponibles")
async def get_tipos_tramite_disponibles(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtener todos los tipos de trámite habilitados para el municipio,
    indicando a qué direcciones están asignados.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(TipoTramite)
        .join(MunicipioTipoTramite, MunicipioTipoTramite.tipo_tramite_id == TipoTramite.id)
        .where(
            MunicipioTipoTramite.municipio_id == municipio_id,
            MunicipioTipoTramite.activo == True,
            TipoTramite.activo == True
        )
        .order_by(TipoTramite.nombre)
    )
    tipos_tramite = result.scalars().all()

    response = []
    for tt in tipos_tramite:
        result = await db.execute(
            select(DireccionTipoTramite)
            .where(
                DireccionTipoTramite.tipo_tramite_id == tt.id,
                DireccionTipoTramite.municipio_id == municipio_id,
                DireccionTipoTramite.activo == True
            )
        )
        asignaciones = result.scalars().all()
        response.append({
            "id": tt.id,
            "nombre": tt.nombre,
            "icono": tt.icono,
            "color": tt.color,
            "descripcion": tt.descripcion,
            "direcciones_asignadas": [a.direccion_id for a in asignaciones]
        })

    return response


@router.get("/{direccion_id}", response_model=DireccionResponse)
async def get_direccion(
    request: Request,
    direccion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener una dirección específica con sus asignaciones"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Direccion)
        .options(
            selectinload(Direccion.categorias_asignadas).selectinload(DireccionCategoria.categoria),
            selectinload(Direccion.tipos_tramite_asignados).selectinload(DireccionTipoTramite.tipo_tramite)
        )
        .where(Direccion.id == direccion_id)
        .where(Direccion.municipio_id == municipio_id)
    )
    direccion = result.scalar_one_or_none()
    if not direccion:
        raise HTTPException(status_code=404, detail="Dirección no encontrada")
    return direccion


@router.post("", response_model=DireccionListResponse)
async def create_direccion(
    request: Request,
    data: DireccionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Crear una nueva dirección"""
    municipio_id = get_effective_municipio_id(request, current_user)

    # Verificar si ya existe una dirección ACTIVA con ese nombre en este municipio
    result = await db.execute(
        select(Direccion).where(
            Direccion.nombre == data.nombre,
            Direccion.municipio_id == municipio_id,
            Direccion.activo == True
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una dirección activa con ese nombre")

    # Generar código automático
    codigo = await generar_codigo_unico(db, municipio_id, data.nombre)

    direccion = Direccion(
        municipio_id=municipio_id,
        codigo=codigo,
        **data.model_dump()
    )
    db.add(direccion)
    await db.commit()
    await db.refresh(direccion)
    return direccion


@router.put("/{direccion_id}", response_model=DireccionListResponse)
async def update_direccion(
    request: Request,
    direccion_id: int,
    data: DireccionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Actualizar una dirección"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.municipio_id == municipio_id
        )
    )
    direccion = result.scalar_one_or_none()
    if not direccion:
        raise HTTPException(status_code=404, detail="Dirección no encontrada")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(direccion, key, value)

    await db.commit()
    await db.refresh(direccion)
    return direccion


@router.delete("/{direccion_id}")
async def delete_direccion(
    request: Request,
    direccion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """Desactivar una dirección (soft delete)"""
    municipio_id = get_effective_municipio_id(request, current_user)

    result = await db.execute(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.municipio_id == municipio_id
        )
    )
    direccion = result.scalar_one_or_none()
    if not direccion:
        raise HTTPException(status_code=404, detail="Dirección no encontrada")

    direccion.activo = False
    await db.commit()
    return {"message": "Dirección desactivada"}


# ============ Asignación de Categorías ============

@router.get("/{direccion_id}/categorias")
async def get_categorias_asignadas(
    request: Request,
    direccion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener las categorías asignadas a una dirección"""
    municipio_id = get_effective_municipio_id(request, current_user)
    print(f"[DIRECCIONES] GET /{direccion_id}/categorias - user={current_user.email}, municipio_id={municipio_id}", flush=True)

    # Verificar que la dirección existe
    result = await db.execute(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.municipio_id == municipio_id
        )
    )
    if not result.scalar_one_or_none():
        # Verificar si la dirección existe pero en otro municipio
        check_result = await db.execute(select(Direccion).where(Direccion.id == direccion_id))
        dir_exists = check_result.scalar_one_or_none()
        if dir_exists:
            print(f"[DIRECCIONES] ERROR: Dirección {direccion_id} existe pero pertenece a municipio {dir_exists.municipio_id}, no a {municipio_id}", flush=True)
            raise HTTPException(
                status_code=404,
                detail=f"Dirección {direccion_id} no encontrada en municipio actual (id={municipio_id}). La dirección pertenece a otro municipio."
            )
        raise HTTPException(status_code=404, detail=f"Dirección {direccion_id} no existe")

    # Obtener categorías asignadas
    result = await db.execute(
        select(DireccionCategoria)
        .options(selectinload(DireccionCategoria.categoria))
        .where(
            DireccionCategoria.direccion_id == direccion_id,
            DireccionCategoria.municipio_id == municipio_id,
            DireccionCategoria.activo == True
        )
    )
    asignaciones = result.scalars().all()
    return [
        {
            "id": a.id,
            "categoria_id": a.categoria_id,
            "categoria": {
                "id": a.categoria.id,
                "nombre": a.categoria.nombre,
                "icono": a.categoria.icono,
                "color": a.categoria.color
            },
            "tiempo_resolucion_estimado": a.tiempo_resolucion_estimado,
            "prioridad_default": a.prioridad_default
        }
        for a in asignaciones
    ]


@router.post("/{direccion_id}/categorias")
async def asignar_categorias(
    request: Request,
    direccion_id: int,
    data: AsignarCategoriasRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Asignar categorías a una dirección.
    Reemplaza las asignaciones actuales con las nuevas.
    """
    municipio_id = get_effective_municipio_id(request, current_user)
    print(f"[DIRECCIONES] POST /{direccion_id}/categorias - user={current_user.email}, municipio_id={municipio_id}", flush=True)

    # Verificar que la dirección existe
    result = await db.execute(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.municipio_id == municipio_id
        )
    )
    direccion = result.scalar_one_or_none()
    if not direccion:
        # Verificar si la dirección existe pero en otro municipio
        check_result = await db.execute(select(Direccion).where(Direccion.id == direccion_id))
        dir_exists = check_result.scalar_one_or_none()
        if dir_exists:
            print(f"[DIRECCIONES] ERROR: Dirección {direccion_id} existe pero pertenece a municipio {dir_exists.municipio_id}, no a {municipio_id}", flush=True)
            raise HTTPException(
                status_code=404,
                detail=f"Dirección {direccion_id} no encontrada en municipio actual (id={municipio_id}). Pertenece a otro municipio."
            )
        print(f"[DIRECCIONES] ERROR: Dirección {direccion_id} no existe", flush=True)
        raise HTTPException(status_code=404, detail=f"Dirección {direccion_id} no existe")

    # Verificar que todas las categorías existen y están habilitadas para el municipio
    for cat_id in data.categoria_ids:
        result = await db.execute(
            select(MunicipioCategoria).where(
                MunicipioCategoria.categoria_id == cat_id,
                MunicipioCategoria.municipio_id == municipio_id,
                MunicipioCategoria.activo == True
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Categoría {cat_id} no encontrada o no habilitada para este municipio"
            )

    # Eliminar y crear asignaciones con retry para deadlock
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Eliminar asignaciones actuales
            await db.execute(
                delete(DireccionCategoria).where(
                    DireccionCategoria.direccion_id == direccion_id,
                    DireccionCategoria.municipio_id == municipio_id
                )
            )

            # Crear nuevas asignaciones
            for cat_id in data.categoria_ids:
                asignacion = DireccionCategoria(
                    municipio_id=municipio_id,
                    direccion_id=direccion_id,
                    categoria_id=cat_id,
                    activo=True
                )
                db.add(asignacion)

            break  # Éxito, salir del loop
        except OperationalError as e:
            if "Deadlock" in str(e) and attempt < max_retries - 1:
                print(f"[DIRECCIONES] Deadlock detectado en intento {attempt + 1}, reintentando...", flush=True)
                await db.rollback()
                await asyncio.sleep(0.1 * (attempt + 1))  # Espera incremental
            else:
                print(f"[DIRECCIONES] Error de DB: {e}", flush=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Error de base de datos: {str(e)[:200]}"
                )

    try:
        await db.commit()
        print(f"[DIRECCIONES] OK: {len(data.categoria_ids)} categorías asignadas a dirección {direccion_id}", flush=True)
        return {"message": f"Se asignaron {len(data.categoria_ids)} categorías a la dirección"}
    except OperationalError as e:
        print(f"[DIRECCIONES] Error en commit: {e}", flush=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error guardando cambios: {str(e)[:200]}"
        )


# ============ Asignación de Tipos de Trámite ============

@router.get("/{direccion_id}/tipos-tramite")
async def get_tipos_tramite_asignados(
    request: Request,
    direccion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtener los tipos de trámite asignados a una dirección"""
    municipio_id = get_effective_municipio_id(request, current_user)

    # Verificar que la dirección existe
    result = await db.execute(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.municipio_id == municipio_id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Dirección no encontrada")

    # Obtener tipos de trámite asignados
    result = await db.execute(
        select(DireccionTipoTramite)
        .options(selectinload(DireccionTipoTramite.tipo_tramite))
        .where(
            DireccionTipoTramite.direccion_id == direccion_id,
            DireccionTipoTramite.municipio_id == municipio_id,
            DireccionTipoTramite.activo == True
        )
    )
    asignaciones = result.scalars().all()
    return [
        {
            "id": a.id,
            "tipo_tramite_id": a.tipo_tramite_id,
            "tipo_tramite": {
                "id": a.tipo_tramite.id,
                "nombre": a.tipo_tramite.nombre,
                "icono": a.tipo_tramite.icono,
                "color": a.tipo_tramite.color
            }
        }
        for a in asignaciones
    ]


@router.post("/{direccion_id}/tipos-tramite")
async def asignar_tipos_tramite(
    request: Request,
    direccion_id: int,
    data: AsignarTiposTramiteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Asignar tipos de trámite a una dirección.
    Reemplaza las asignaciones actuales con las nuevas.
    """
    municipio_id = get_effective_municipio_id(request, current_user)

    # Verificar que la dirección existe
    result = await db.execute(
        select(Direccion).where(
            Direccion.id == direccion_id,
            Direccion.municipio_id == municipio_id
        )
    )
    direccion = result.scalar_one_or_none()
    if not direccion:
        raise HTTPException(status_code=404, detail="Dirección no encontrada")

    # Verificar que todos los tipos de trámite existen y están habilitados para el municipio
    for tt_id in data.tipo_tramite_ids:
        result = await db.execute(
            select(MunicipioTipoTramite).where(
                MunicipioTipoTramite.tipo_tramite_id == tt_id,
                MunicipioTipoTramite.municipio_id == municipio_id,
                MunicipioTipoTramite.activo == True
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de trámite {tt_id} no encontrado o no habilitado para este municipio"
            )

    # Eliminar asignaciones actuales
    await db.execute(
        delete(DireccionTipoTramite).where(
            DireccionTipoTramite.direccion_id == direccion_id,
            DireccionTipoTramite.municipio_id == municipio_id
        )
    )

    # Crear nuevas asignaciones
    for tt_id in data.tipo_tramite_ids:
        asignacion = DireccionTipoTramite(
            municipio_id=municipio_id,
            direccion_id=direccion_id,
            tipo_tramite_id=tt_id,
            activo=True
        )
        db.add(asignacion)

    await db.commit()
    return {"message": f"Se asignaron {len(data.tipo_tramite_ids)} tipos de trámite a la dirección"}
