"""
API de Municipios - Endpoints publicos y protegidos
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from pydantic import BaseModel
from math import radians, cos, sin, asin, sqrt

from core.database import get_db
from core.security import get_current_user, require_roles
from models.municipio import Municipio
from models.user import User
from models.enums import RolUsuario

router = APIRouter()


# ============ Schemas ============

class MunicipioPublic(BaseModel):
    """Datos publicos de un municipio (sin info sensible)"""
    id: int
    nombre: str
    codigo: str
    latitud: float
    longitud: float
    radio_km: float
    logo_url: Optional[str] = None
    color_primario: str
    activo: bool

    class Config:
        from_attributes = True


class MunicipioDetalle(MunicipioPublic):
    """Datos completos del municipio"""
    descripcion: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sitio_web: Optional[str] = None
    zoom_mapa_default: int
    color_secundario: str


class MunicipioCreate(BaseModel):
    nombre: str
    codigo: str
    latitud: float
    longitud: float
    radio_km: float = 10.0
    descripcion: Optional[str] = None
    logo_url: Optional[str] = None
    color_primario: str = "#3B82F6"
    color_secundario: str = "#1E40AF"
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sitio_web: Optional[str] = None
    zoom_mapa_default: int = 13


class MunicipioUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    radio_km: Optional[float] = None
    logo_url: Optional[str] = None
    color_primario: Optional[str] = None
    color_secundario: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    sitio_web: Optional[str] = None
    zoom_mapa_default: Optional[int] = None
    activo: Optional[bool] = None


class MunicipioCercano(MunicipioPublic):
    """Municipio con distancia calculada"""
    distancia_km: float


# ============ Funciones auxiliares ============

def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """
    Calcula la distancia en km entre dos puntos usando la formula de Haversine.
    """
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radio de la Tierra en km
    return c * r


# ============ Endpoints PUBLICOS (sin autenticacion) ============

@router.get("/public", response_model=List[MunicipioPublic])
async def listar_municipios_publico(
    activo: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """
    Lista todos los municipios activos (endpoint PUBLICO).
    Usado por la landing page para mostrar opciones.
    """
    query = select(Municipio).where(Municipio.activo == activo)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/public/cercano", response_model=Optional[MunicipioCercano])
async def buscar_municipio_cercano(
    lat: float = Query(..., description="Latitud del usuario"),
    lng: float = Query(..., description="Longitud del usuario"),
    db: AsyncSession = Depends(get_db)
):
    """
    Busca el municipio mas cercano a las coordenadas dadas (endpoint PUBLICO).
    Retorna el municipio si el usuario esta dentro de su radio de cobertura.
    """
    query = select(Municipio).where(Municipio.activo == True)
    result = await db.execute(query)
    municipios = result.scalars().all()

    if not municipios:
        return None

    # Encontrar el municipio mas cercano
    mejor_municipio = None
    menor_distancia = float('inf')

    for muni in municipios:
        distancia = haversine(lng, lat, muni.longitud, muni.latitud)
        if distancia < menor_distancia:
            menor_distancia = distancia
            mejor_municipio = muni

    # Verificar si esta dentro del radio de cobertura
    if mejor_municipio and menor_distancia <= mejor_municipio.radio_km:
        return MunicipioCercano(
            id=mejor_municipio.id,
            nombre=mejor_municipio.nombre,
            codigo=mejor_municipio.codigo,
            latitud=mejor_municipio.latitud,
            longitud=mejor_municipio.longitud,
            radio_km=mejor_municipio.radio_km,
            logo_url=mejor_municipio.logo_url,
            color_primario=mejor_municipio.color_primario,
            activo=mejor_municipio.activo,
            distancia_km=round(menor_distancia, 2)
        )

    # Si no hay municipio dentro del radio, retornar el mas cercano de todas formas
    # pero indicando la distancia
    if mejor_municipio:
        return MunicipioCercano(
            id=mejor_municipio.id,
            nombre=mejor_municipio.nombre,
            codigo=mejor_municipio.codigo,
            latitud=mejor_municipio.latitud,
            longitud=mejor_municipio.longitud,
            radio_km=mejor_municipio.radio_km,
            logo_url=mejor_municipio.logo_url,
            color_primario=mejor_municipio.color_primario,
            activo=mejor_municipio.activo,
            distancia_km=round(menor_distancia, 2)
        )

    return None


@router.get("/public/{codigo}", response_model=MunicipioDetalle)
async def obtener_municipio_por_codigo(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene un municipio por su codigo (endpoint PUBLICO).
    Usado para cargar datos del municipio desde la URL.
    """
    query = select(Municipio).where(
        Municipio.codigo == codigo,
        Municipio.activo == True
    )
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    return municipio


# ============ Endpoints PROTEGIDOS (requieren autenticacion) ============

@router.get("/", response_model=List[MunicipioDetalle])
async def listar_municipios(
    skip: int = 0,
    limit: int = 100,
    activo: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Lista todos los municipios (solo admin).
    """
    query = select(Municipio)
    if activo is not None:
        query = query.where(Municipio.activo == activo)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{municipio_id}", response_model=MunicipioDetalle)
async def obtener_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene un municipio por ID.
    """
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    return municipio


@router.post("/", response_model=MunicipioDetalle)
async def crear_municipio(
    data: MunicipioCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Crea un nuevo municipio (solo admin).
    """
    # Verificar que no exista un municipio con el mismo codigo
    query = select(Municipio).where(Municipio.codigo == data.codigo)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe un municipio con ese codigo")

    municipio = Municipio(**data.model_dump())
    db.add(municipio)
    await db.commit()
    await db.refresh(municipio)
    return municipio


@router.put("/{municipio_id}", response_model=MunicipioDetalle)
async def actualizar_municipio(
    municipio_id: int,
    data: MunicipioUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Actualiza un municipio (solo admin).
    """
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(municipio, key, value)

    await db.commit()
    await db.refresh(municipio)
    return municipio


@router.delete("/{municipio_id}")
async def eliminar_municipio(
    municipio_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles([RolUsuario.ADMIN]))
):
    """
    Desactiva un municipio (soft delete, solo admin).
    """
    query = select(Municipio).where(Municipio.id == municipio_id)
    result = await db.execute(query)
    municipio = result.scalar_one_or_none()

    if not municipio:
        raise HTTPException(status_code=404, detail="Municipio no encontrado")

    municipio.activo = False
    await db.commit()

    return {"message": "Municipio desactivado correctamente"}
