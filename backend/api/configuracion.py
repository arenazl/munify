from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import httpx

from core.database import get_db
from core.security import get_current_user, require_roles
from models.configuracion import Configuracion
from models.zona import Zona
from models.user import User
from schemas.configuracion import ConfiguracionCreate, ConfiguracionUpdate, ConfiguracionResponse

router = APIRouter()

@router.get("/", response_model=List[ConfiguracionResponse])
async def get_configuraciones(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: filtrar por municipio_id del usuario actual
    result = await db.execute(
        select(Configuracion)
        .where(Configuracion.municipio_id == current_user.municipio_id)
        .order_by(Configuracion.clave)
    )
    return result.scalars().all()

@router.get("/{clave}", response_model=ConfiguracionResponse)
async def get_configuracion(
    clave: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Configuracion)
        .where(Configuracion.clave == clave)
        .where(Configuracion.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return config

@router.post("/", response_model=ConfiguracionResponse)
async def create_configuracion(
    data: ConfiguracionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: verificar duplicado solo en el mismo municipio
    result = await db.execute(
        select(Configuracion)
        .where(Configuracion.clave == data.clave)
        .where(Configuracion.municipio_id == current_user.municipio_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una configuración con esa clave")

    # Multi-tenant: agregar municipio_id
    config = Configuracion(**data.model_dump(), municipio_id=current_user.municipio_id)
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config

@router.put("/{clave}", response_model=ConfiguracionResponse)
async def update_configuracion(
    clave: str,
    data: ConfiguracionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Configuracion)
        .where(Configuracion.clave == clave)
        .where(Configuracion.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    if not config.editable:
        raise HTTPException(status_code=400, detail="Esta configuración no es editable")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    return config

@router.delete("/{clave}")
async def delete_configuracion(
    clave: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    # Multi-tenant: filtrar por municipio_id
    result = await db.execute(
        select(Configuracion)
        .where(Configuracion.clave == clave)
        .where(Configuracion.municipio_id == current_user.municipio_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    await db.delete(config)
    await db.commit()
    return {"message": "Configuración eliminada"}


@router.get("/publica/municipio")
async def get_datos_municipio(
    municipio_id: int = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint público para obtener datos de un Municipio.
    Si se pasa municipio_id, devuelve datos de ese municipio desde la tabla municipios.
    Si no, fallback a configuración global (legacy).
    """
    from models.municipio import Municipio

    # Si tenemos municipio_id, usar tabla municipios (multi-tenant correcto)
    if municipio_id:
        result = await db.execute(select(Municipio).where(Municipio.id == municipio_id))
        muni = result.scalar_one_or_none()
        if muni:
            return {
                "nombre_municipio": muni.nombre,
                "direccion_municipio": muni.direccion,
                "latitud_municipio": str(muni.latitud) if muni.latitud else None,
                "longitud_municipio": str(muni.longitud) if muni.longitud else None,
                "telefono_contacto": muni.telefono,
                "email_contacto": muni.email
            }

    # Fallback: configuración global (legacy, para compatibilidad)
    claves = ['nombre_municipio', 'direccion_municipio', 'latitud_municipio', 'longitud_municipio', 'telefono_contacto']
    result = await db.execute(select(Configuracion).where(Configuracion.clave.in_(claves)))
    configs = result.scalars().all()

    datos = {}
    for config in configs:
        datos[config.clave] = config.valor

    return datos


@router.get("/publica/registro")
async def get_config_registro(db: AsyncSession = Depends(get_db)):
    """
    Endpoint público para obtener configuración relacionada al registro.
    No requiere autenticación para que el formulario de registro sepa cómo validar.
    """
    result = await db.execute(
        select(Configuracion).where(Configuracion.clave == "skip_email_validation")
    )
    config = result.scalar_one_or_none()

    return {
        "skip_email_validation": config.valor.lower() == "true" if config and config.valor else False
    }


@router.get("/barrios/{municipio}")
async def buscar_barrios_municipio(
    municipio: str,
    current_user: User = Depends(require_roles(["admin"]))
):
    """
    Busca los barrios/localidades de un municipio usando Overpass API (OpenStreetMap).
    """
    # Query Overpass para buscar barrios dentro de un municipio
    overpass_url = "https://overpass-api.de/api/interpreter"

    # Buscar barrios (suburb), neighbourhoods y localidades dentro del municipio
    query = f"""
    [out:json][timeout:25];
    area["name"~"{municipio}"]["admin_level"~"6|7|8"]["boundary"="administrative"]->.municipio;
    (
      node["place"~"suburb|neighbourhood|quarter|village"](area.municipio);
      way["place"~"suburb|neighbourhood|quarter|village"](area.municipio);
      relation["place"~"suburb|neighbourhood|quarter|village"](area.municipio);
    );
    out center;
    """

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(overpass_url, data={"data": query})

            if response.status_code == 200:
                data = response.json()
                barrios = []
                seen_names = set()

                for element in data.get("elements", []):
                    name = element.get("tags", {}).get("name")
                    if name and name not in seen_names:
                        seen_names.add(name)

                        # Obtener coordenadas (center para ways/relations)
                        lat = element.get("lat") or element.get("center", {}).get("lat")
                        lon = element.get("lon") or element.get("center", {}).get("lon")

                        barrios.append({
                            "nombre": name,
                            "lat": lat,
                            "lon": lon,
                            "tipo": element.get("tags", {}).get("place", "barrio")
                        })

                # Ordenar alfabéticamente
                barrios.sort(key=lambda x: x["nombre"])
                return {"municipio": municipio, "barrios": barrios, "total": len(barrios)}
            else:
                raise HTTPException(status_code=503, detail="Error consultando Overpass API")

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout consultando Overpass API")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cargar-barrios")
async def cargar_barrios_como_zonas(
    barrios: List[str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    """
    Carga una lista de barrios como zonas en la base de datos.
    """
    creados = 0
    existentes = 0

    for nombre in barrios:
        # Multi-tenant: Verificar si ya existe en el mismo municipio
        result = await db.execute(
            select(Zona)
            .where(Zona.nombre == nombre)
            .where(Zona.municipio_id == current_user.municipio_id)
        )
        if result.scalar_one_or_none():
            existentes += 1
            continue

        # Crear código único
        codigo = f"Z-{nombre[:3].upper()}"

        # Multi-tenant: agregar municipio_id
        zona = Zona(
            nombre=nombre,
            codigo=codigo,
            descripcion=f"Barrio {nombre}",
            activo=True,
            municipio_id=current_user.municipio_id
        )
        db.add(zona)
        creados += 1

    await db.commit()

    return {
        "mensaje": f"Se crearon {creados} zonas nuevas. {existentes} ya existían.",
        "creados": creados,
        "existentes": existentes
    }
