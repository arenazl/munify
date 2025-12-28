"""
Script para agregar coordenadas a los reclamos de Merlo que no tienen ubicación.
Genera coordenadas aleatorias dentro del partido de Merlo, Buenos Aires.
"""
import asyncio
import random
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings
from models.reclamo import Reclamo
from models.zona import Zona

# Coordenadas de las zonas de Merlo (aproximadas)
ZONAS_COORDENADAS = {
    "Merlo Centro": {"lat": -34.6637, "lng": -58.7276, "radio": 0.015},
    "Libertad": {"lat": -34.6750, "lng": -58.7150, "radio": 0.012},
    "Pontevedra": {"lat": -34.7450, "lng": -58.6950, "radio": 0.015},
    "San Antonio de Padua": {"lat": -34.6700, "lng": -58.7000, "radio": 0.012},
    "Mariano Acosta": {"lat": -34.6850, "lng": -58.7400, "radio": 0.010},
    "Parque San Martín": {"lat": -34.6550, "lng": -58.7350, "radio": 0.012},
    "Ituzaingó Anexo": {"lat": -34.6450, "lng": -58.6700, "radio": 0.010},
    "Parque Leloir": {"lat": -34.6400, "lng": -58.6550, "radio": 0.010},
    "Villa Progreso": {"lat": -34.6900, "lng": -58.7200, "radio": 0.010},
    "Barrio Castelar": {"lat": -34.6350, "lng": -58.6400, "radio": 0.010},
}

# Coordenadas por defecto para Merlo (centro del partido)
DEFAULT_MERLO = {"lat": -34.6700, "lng": -58.7100, "radio": 0.04}


def get_random_coords_for_zona(zona_nombre: str) -> tuple[float, float]:
    """Genera coordenadas aleatorias dentro de una zona de Merlo."""
    # Buscar zona por nombre (coincidencia parcial)
    zona_data = None
    for nombre, datos in ZONAS_COORDENADAS.items():
        if nombre.lower() in zona_nombre.lower() or zona_nombre.lower() in nombre.lower():
            zona_data = datos
            break

    if not zona_data:
        zona_data = DEFAULT_MERLO

    # Generar coordenadas aleatorias dentro del radio
    lat = zona_data["lat"] + random.uniform(-zona_data["radio"], zona_data["radio"])
    lng = zona_data["lng"] + random.uniform(-zona_data["radio"], zona_data["radio"])

    return lat, lng


async def main():
    print("=" * 60)
    print("AGREGAR COORDENADAS A RECLAMOS DE MERLO")
    print("=" * 60)

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Obtener reclamos sin coordenadas
        print("\n>> Buscando reclamos sin coordenadas...")
        result = await session.execute(
            select(Reclamo, Zona.nombre)
            .outerjoin(Zona, Reclamo.zona_id == Zona.id)
            .where(
                (Reclamo.latitud.is_(None)) | (Reclamo.longitud.is_(None))
            )
        )
        reclamos = result.all()

        if not reclamos:
            print("[INFO] Todos los reclamos ya tienen coordenadas")
            return

        print(f"[INFO] Encontrados {len(reclamos)} reclamos sin coordenadas")

        # 2. Actualizar coordenadas
        print("\n>> Actualizando coordenadas...")
        actualizados = 0

        for reclamo, zona_nombre in reclamos:
            zona_nombre = zona_nombre or "Merlo Centro"
            lat, lng = get_random_coords_for_zona(zona_nombre)

            reclamo.latitud = lat
            reclamo.longitud = lng
            actualizados += 1

            # Commit cada 100 reclamos
            if actualizados % 100 == 0:
                await session.commit()
                print(f"   + {actualizados}/{len(reclamos)} actualizados")

        # Commit final
        await session.commit()

        print(f"\n[OK] {actualizados} reclamos actualizados con coordenadas!")
        print("\n>> Resumen de zonas:")
        for zona, datos in ZONAS_COORDENADAS.items():
            print(f"   - {zona}: ({datos['lat']}, {datos['lng']})")


if __name__ == "__main__":
    asyncio.run(main())
