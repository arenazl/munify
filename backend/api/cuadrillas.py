from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional

from core.database import get_db
from core.security import get_current_user, require_roles
from models.cuadrilla import Cuadrilla
from models.categoria import Categoria
from models.user import User
from schemas.cuadrilla import CuadrillaCreate, CuadrillaUpdate, CuadrillaResponse

router = APIRouter()


# ===========================================
# RUTAS ESPECÍFICAS (deben ir ANTES de /{cuadrilla_id})
# ===========================================

@router.get("/sugerir")
async def sugerir_cuadrilla(
    categoria_id: int,
    zona_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    """
    Sugiere cuadrillas disponibles para un reclamo.
    Por ahora solo lista las cuadrillas activas del municipio.
    """
    # Buscar cuadrillas activas del municipio
    query = (
        select(Cuadrilla)
        .options(selectinload(Cuadrilla.categorias))
        .where(
            Cuadrilla.municipio_id == current_user.municipio_id,
            Cuadrilla.activo == True
        )
    )

    result = await db.execute(query)
    cuadrillas = result.scalars().all()

    if not cuadrillas:
        return {
            "sugerencia": None,
            "mensaje": "No hay cuadrillas disponibles",
            "alternativas": []
        }

    # Listar cuadrillas con puntaje básico por coincidencia de categoría/zona
    sugerencias = []
    for cuadrilla in cuadrillas:
        puntaje = 0
        categoria_ids_cuadrilla = [c.id for c in cuadrilla.categorias]

        if categoria_id in categoria_ids_cuadrilla:
            puntaje += 50
        elif cuadrilla.categoria_principal_id == categoria_id:
            puntaje += 60

        if zona_id and cuadrilla.zona_id == zona_id:
            puntaje += 30

        sugerencias.append({
            "cuadrilla_id": cuadrilla.id,
            "nombre": cuadrilla.nombre,
            "puntaje": puntaje,
            "capacidad": cuadrilla.capacidad_maxima or 10,
            "especialidad_match": categoria_id in categoria_ids_cuadrilla,
            "zona_match": zona_id and cuadrilla.zona_id == zona_id
        })

    sugerencias.sort(key=lambda x: x["puntaje"], reverse=True)
    mejor = sugerencias[0] if sugerencias else None

    return {
        "sugerencia": mejor,
        "alternativas": sugerencias[1:4] if len(sugerencias) > 1 else []
    }


# ===========================================
# RUTAS CRUD ESTÁNDAR
# ===========================================

@router.get("/", response_model=List[CuadrillaResponse])
async def get_cuadrillas(
    activo: bool = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    query = select(Cuadrilla).options(
        selectinload(Cuadrilla.miembros),
        selectinload(Cuadrilla.categorias),
        selectinload(Cuadrilla.categoria_principal)
    ).where(Cuadrilla.municipio_id == current_user.municipio_id)
    if activo is not None:
        query = query.where(Cuadrilla.activo == activo)
    query = query.order_by(Cuadrilla.nombre)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{cuadrilla_id}", response_model=CuadrillaResponse)
async def get_cuadrilla(
    cuadrilla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "supervisor"]))
):
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla_id)
    )
    cuadrilla = result.scalar_one_or_none()
    if not cuadrilla:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")
    return cuadrilla

@router.post("/", response_model=CuadrillaResponse)
async def create_cuadrilla(
    data: CuadrillaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Extraer categoria_ids antes de crear el modelo
    categoria_ids = data.categoria_ids or []
    create_data = data.model_dump(exclude={'categoria_ids'})

    cuadrilla = Cuadrilla(**create_data, municipio_id=current_user.municipio_id)

    # Agregar categorias si se proporcionan
    if categoria_ids:
        result = await db.execute(
            select(Categoria).where(Categoria.id.in_(categoria_ids))
        )
        categorias = result.scalars().all()
        cuadrilla.categorias = list(categorias)

    db.add(cuadrilla)
    await db.commit()

    # Recargar con relaciones
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla.id)
    )
    return result.scalar_one()

@router.put("/{cuadrilla_id}", response_model=CuadrillaResponse)
async def update_cuadrilla(
    cuadrilla_id: int,
    data: CuadrillaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla_id)
    )
    cuadrilla = result.scalar_one_or_none()
    if not cuadrilla:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")

    update_data = data.model_dump(exclude_unset=True)

    # Manejar categoria_ids por separado
    if 'categoria_ids' in update_data:
        categoria_ids = update_data.pop('categoria_ids')
        if categoria_ids is not None:
            result = await db.execute(
                select(Categoria).where(Categoria.id.in_(categoria_ids))
            )
            categorias = result.scalars().all()
            cuadrilla.categorias = list(categorias)

    # Actualizar campos normales
    for key, value in update_data.items():
        setattr(cuadrilla, key, value)

    await db.commit()

    # Recargar con relaciones
    result = await db.execute(
        select(Cuadrilla)
        .options(
            selectinload(Cuadrilla.miembros),
            selectinload(Cuadrilla.categorias),
            selectinload(Cuadrilla.categoria_principal)
        )
        .where(Cuadrilla.id == cuadrilla_id)
    )
    return result.scalar_one()

@router.delete("/{cuadrilla_id}")
async def delete_cuadrilla(
    cuadrilla_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    result = await db.execute(select(Cuadrilla).where(Cuadrilla.id == cuadrilla_id))
    cuadrilla = result.scalar_one_or_none()
    if not cuadrilla:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")

    cuadrilla.activo = False
    await db.commit()
    return {"message": "Cuadrilla desactivada"}
