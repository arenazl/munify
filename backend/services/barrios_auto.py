"""
Servicio para cargar barrios automáticamente al crear un municipio.
Usa IA (Gemini) para obtener los barrios y Nominatim para validar coordenadas.
"""
import asyncio
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from models.barrio import Barrio
from services.barrios_service import sugerir_barrios_con_ia, obtener_coordenadas_nominatim


async def cargar_barrios_municipio(
    db: AsyncSession,
    municipio_id: int,
    nombre_municipio: str,
    provincia: str = "Buenos Aires"
) -> int:
    """
    Carga automáticamente los barrios de un municipio usando IA.

    Args:
        db: Sesión de base de datos
        municipio_id: ID del municipio
        nombre_municipio: Nombre del municipio (ej: "Chacabuco")
        provincia: Provincia (default: "Buenos Aires")

    Returns:
        Cantidad de barrios creados
    """
    print(f"[BARRIOS_AUTO] Buscando barrios para {nombre_municipio}, {provincia}...")

    # 1. Obtener sugerencias de la IA
    barrios_sugeridos = await sugerir_barrios_con_ia(nombre_municipio, provincia)

    if not barrios_sugeridos:
        print(f"[BARRIOS_AUTO] IA no devolvió barrios, usando genéricos")
        barrios_sugeridos = ["Centro", "Norte", "Sur", "Este", "Oeste"]

    print(f"[BARRIOS_AUTO] IA sugirió {len(barrios_sugeridos)} barrios")

    # 2. Validar cada barrio con Nominatim y crear en BD
    barrios_creados = 0

    for nombre_barrio in barrios_sugeridos:
        # Rate limit: 1 request por segundo para Nominatim
        await asyncio.sleep(1.0)

        # Buscar coordenadas
        coords = await obtener_coordenadas_nominatim(nombre_barrio, nombre_municipio, provincia)

        # Crear el barrio
        barrio = Barrio(
            municipio_id=municipio_id,
            nombre=nombre_barrio,
            latitud=coords["lat"] if coords else None,
            longitud=coords["lng"] if coords else None,
            display_name=coords["display_name"] if coords else None,
            tipo=coords["type"] if coords else None,
            importancia=coords["importance"] if coords else None,
            validado=coords is not None
        )
        db.add(barrio)
        barrios_creados += 1

        if coords:
            print(f"[BARRIOS_AUTO] OK {nombre_barrio} ({coords['lat']:.4f}, {coords['lng']:.4f})")
        else:
            print(f"[BARRIOS_AUTO] -- {nombre_barrio} sin coordenadas")

    await db.flush()
    print(f"[BARRIOS_AUTO] {barrios_creados} barrios creados para {nombre_municipio}")

    return barrios_creados


async def obtener_barrios_municipio(db: AsyncSession, municipio_id: int) -> List[dict]:
    """
    Obtiene todos los barrios de un municipio.

    Returns:
        Lista de barrios con sus datos
    """
    from sqlalchemy import select

    result = await db.execute(
        select(Barrio)
        .where(Barrio.municipio_id == municipio_id)
        .order_by(Barrio.nombre)
    )
    barrios = result.scalars().all()

    return [
        {
            "id": b.id,
            "nombre": b.nombre,
            "latitud": b.latitud,
            "longitud": b.longitud,
            "display_name": b.display_name,
            "validado": b.validado
        }
        for b in barrios
    ]
