"""
Seed para poblar tipos de trámites y trámites del catálogo
Modelo actualizado: TipoTramite -> Tramite -> Solicitud
"""
import sys
import os
import asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete
from core.database import AsyncSessionLocal
from models.tramite import TipoTramite, Tramite

MUNICIPIO_ID = 48  # Merlo

# Catálogo de trámites
CATALOGO = [
    {
        "nombre": "Obras Privadas",
        "icono": "HardHat",
        "color": "#f59e0b",
        "tramites": [
            {"nombre": "Permiso de Obra Nueva", "tiempo": 30, "costo": 15000},
            {"nombre": "Ampliación de Vivienda", "tiempo": 20, "costo": 10000},
            {"nombre": "Regularización de Obra", "tiempo": 45, "costo": 20000},
            {"nombre": "Demolición", "tiempo": 15, "costo": 5000},
        ]
    },
    {
        "nombre": "Comercio",
        "icono": "Store",
        "color": "#3b82f6",
        "tramites": [
            {"nombre": "Habilitación Comercial", "tiempo": 30, "costo": 12000},
            {"nombre": "Renovación de Habilitación", "tiempo": 15, "costo": 6000},
            {"nombre": "Cambio de Rubro", "tiempo": 20, "costo": 8000},
            {"nombre": "Baja de Comercio", "tiempo": 10, "costo": 0},
        ]
    },
    {
        "nombre": "Tránsito",
        "icono": "Car",
        "color": "#8b5cf6",
        "tramites": [
            {"nombre": "Licencia de Conducir", "tiempo": 7, "costo": 5000},
            {"nombre": "Renovación de Licencia", "tiempo": 5, "costo": 4000},
            {"nombre": "Cambio de Domicilio", "tiempo": 3, "costo": 1000},
            {"nombre": "Duplicado de Licencia", "tiempo": 5, "costo": 3000},
        ]
    },
    {
        "nombre": "Espacios Verdes",
        "icono": "TreeDeciduous",
        "color": "#22c55e",
        "tramites": [
            {"nombre": "Extracción de Árbol", "tiempo": 15, "costo": 0},
            {"nombre": "Poda de Árbol", "tiempo": 10, "costo": 0},
            {"nombre": "Plantación en Vereda", "tiempo": 20, "costo": 0},
        ]
    },
    {
        "nombre": "Catastro",
        "icono": "Map",
        "color": "#06b6d4",
        "tramites": [
            {"nombre": "Certificado Catastral", "tiempo": 10, "costo": 3000},
            {"nombre": "Plano de Mensura", "tiempo": 30, "costo": 15000},
            {"nombre": "Subdivision de Parcela", "tiempo": 45, "costo": 20000},
        ]
    },
    {
        "nombre": "Desarrollo Social",
        "icono": "Users",
        "color": "#ec4899",
        "tramites": [
            {"nombre": "Asistencia Alimentaria", "tiempo": 7, "costo": 0},
            {"nombre": "Subsidio Habitacional", "tiempo": 30, "costo": 0},
            {"nombre": "Pensión Social", "tiempo": 45, "costo": 0},
        ]
    },
]


async def seed():
    async with AsyncSessionLocal() as db:
        try:
            # Limpiar datos existentes
            await db.execute(delete(Tramite))
            await db.execute(
                delete(TipoTramite).where(TipoTramite.municipio_id == MUNICIPIO_ID)
            )
            await db.commit()

            print(f"Sembrando trámites para municipio {MUNICIPIO_ID}...")

            for orden, tipo_data in enumerate(CATALOGO, start=1):
                # Crear tipo de trámite
                tipo = TipoTramite(
                    municipio_id=MUNICIPIO_ID,
                    nombre=tipo_data["nombre"],
                    icono=tipo_data["icono"],
                    color=tipo_data["color"],
                    orden=orden,
                    activo=True,
                )
                db.add(tipo)
                await db.flush()  # Para obtener el ID

                print(f"  + {tipo.nombre} (id={tipo.id})")

                # Crear trámites del tipo
                for sub_orden, tramite_data in enumerate(tipo_data["tramites"], start=1):
                    tramite = Tramite(
                        tipo_tramite_id=tipo.id,
                        nombre=tramite_data["nombre"],
                        tiempo_estimado_dias=tramite_data["tiempo"],
                        costo=tramite_data["costo"],
                        orden=sub_orden,
                        activo=True,
                    )
                    db.add(tramite)
                    print(f"    - {tramite.nombre}")

            await db.commit()
            print("\nSeed completado!")

        except Exception as e:
            await db.rollback()
            print(f"Error: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(seed())
