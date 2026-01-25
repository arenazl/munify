"""
Zonas por defecto para municipios nuevos.
Estas zonas genéricas se crean automáticamente cuando se crea un municipio.
El admin puede luego buscar barrios reales con IA y reemplazarlas.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.zona import Zona


# 5 zonas genéricas básicas
ZONAS_DEFAULT = [
    {"nombre": "Centro", "codigo": "CEN", "descripcion": "Zona centro del municipio"},
    {"nombre": "Norte", "codigo": "NOR", "descripcion": "Zona norte del municipio"},
    {"nombre": "Sur", "codigo": "SUR", "descripcion": "Zona sur del municipio"},
    {"nombre": "Este", "codigo": "EST", "descripcion": "Zona este del municipio"},
    {"nombre": "Oeste", "codigo": "OES", "descripcion": "Zona oeste del municipio"},
]


async def crear_zonas_default(
    db: AsyncSession,
    municipio_id: int,
    codigo_municipio: str,
    latitud_centro: float = None,
    longitud_centro: float = None
) -> int:
    """
    Crea las 5 zonas genéricas por defecto para un municipio.
    Las coordenadas se distribuyen alrededor del centro del municipio.

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio
        codigo_municipio: Código del municipio (para generar códigos de zona)
        latitud_centro: Latitud del centro del municipio
        longitud_centro: Longitud del centro del municipio

    Returns:
        Cantidad de zonas creadas
    """
    creadas = 0

    # Offsets para distribuir zonas alrededor del centro (en grados, ~1km aprox)
    offsets = {
        "Centro": (0, 0),
        "Norte": (0.01, 0),
        "Sur": (-0.01, 0),
        "Este": (0, 0.01),
        "Oeste": (0, -0.01),
    }

    prefix = codigo_municipio[:3].upper()

    for zona_data in ZONAS_DEFAULT:
        # Verificar si ya existe
        result = await db.execute(
            select(Zona).where(
                Zona.nombre == zona_data["nombre"],
                Zona.municipio_id == municipio_id
            )
        )
        if result.scalar_one_or_none():
            continue

        # Calcular coordenadas
        offset = offsets.get(zona_data["nombre"], (0, 0))
        lat = (latitud_centro + offset[0]) if latitud_centro else None
        lng = (longitud_centro + offset[1]) if longitud_centro else None

        zona = Zona(
            municipio_id=municipio_id,
            nombre=zona_data["nombre"],
            codigo=f"{prefix}-{zona_data['codigo']}",
            descripcion=zona_data["descripcion"],
            latitud_centro=lat,
            longitud_centro=lng,
            activo=True
        )
        db.add(zona)
        creadas += 1

    await db.commit()
    return creadas
