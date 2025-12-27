"""
Script para poblar la base de datos con tipos de trámites y trámites específicos.
Ejecutar con: python scripts/seed_tramites.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text

from core.config import settings
from models.municipio import Municipio
from models.tramite import TipoTramite, Tramite


# Estructura: Tipos de trámite (categorías) con sus trámites específicos
TIPOS_TRAMITES = [
    {
        "nombre": "Obras Privadas",
        "descripcion": "Trámites relacionados con construcciones, ampliaciones y modificaciones de inmuebles",
        "icono": "HardHat",
        "color": "#F59E0B",
        "tramites": [
            {"nombre": "Permiso de obra nueva", "tiempo": 45, "costo": 25000},
            {"nombre": "Ampliación de vivienda", "tiempo": 30, "costo": 15000},
            {"nombre": "Regularización de obra", "tiempo": 60, "costo": 35000},
            {"nombre": "Demolición", "tiempo": 20, "costo": 8000},
            {"nombre": "Cerco perimetral", "tiempo": 15, "costo": 5000},
            {"nombre": "Pileta de natación", "tiempo": 20, "costo": 10000},
            {"nombre": "Refacción", "tiempo": 15, "costo": 8000},
            {"nombre": "Final de obra", "tiempo": 30, "costo": 12000},
        ]
    },
    {
        "nombre": "Comercio e Industria",
        "descripcion": "Habilitaciones comerciales e industriales",
        "icono": "Store",
        "color": "#3B82F6",
        "tramites": [
            {"nombre": "Habilitación comercial", "tiempo": 30, "costo": 15000},
            {"nombre": "Renovación de habilitación", "tiempo": 15, "costo": 8000},
            {"nombre": "Cambio de rubro", "tiempo": 20, "costo": 10000},
            {"nombre": "Cambio de titular", "tiempo": 15, "costo": 5000},
            {"nombre": "Ampliación de rubro", "tiempo": 20, "costo": 8000},
            {"nombre": "Baja de habilitación", "tiempo": 10, "costo": 0},
            {"nombre": "Habilitación industrial", "tiempo": 45, "costo": 30000},
            {"nombre": "Permiso de publicidad", "tiempo": 15, "costo": 5000},
        ]
    },
    {
        "nombre": "Tránsito y Transporte",
        "descripcion": "Licencias de conducir y permisos de tránsito",
        "icono": "Car",
        "color": "#8B5CF6",
        "tramites": [
            {"nombre": "Licencia de conducir - Primera vez", "tiempo": 15, "costo": 8000},
            {"nombre": "Renovación de licencia", "tiempo": 7, "costo": 6000},
            {"nombre": "Duplicado de licencia", "tiempo": 5, "costo": 4000},
            {"nombre": "Cambio de categoría", "tiempo": 15, "costo": 7000},
            {"nombre": "Licencia profesional", "tiempo": 20, "costo": 12000},
            {"nombre": "Permiso de estacionamiento", "tiempo": 10, "costo": 3000},
            {"nombre": "Oblea para discapacitados", "tiempo": 15, "costo": 0},
        ]
    },
    {
        "nombre": "Rentas y Tributos",
        "descripcion": "Tasas municipales, planes de pago y exenciones",
        "icono": "Landmark",
        "color": "#10B981",
        "tramites": [
            {"nombre": "Certificado de libre deuda", "tiempo": 5, "costo": 500},
            {"nombre": "Plan de pago", "tiempo": 3, "costo": 0},
            {"nombre": "Exención de tasas", "tiempo": 20, "costo": 0},
            {"nombre": "Reclamo de boleta", "tiempo": 10, "costo": 0},
            {"nombre": "Cambio de titularidad", "tiempo": 15, "costo": 1000},
            {"nombre": "Subdivisión de partida", "tiempo": 30, "costo": 5000},
            {"nombre": "Unificación de partidas", "tiempo": 30, "costo": 5000},
        ]
    },
    {
        "nombre": "Catastro y Tierras",
        "descripcion": "Trámites catastrales y de regularización dominial",
        "icono": "Map",
        "color": "#EC4899",
        "tramites": [
            {"nombre": "Certificado de zonificación", "tiempo": 10, "costo": 2000},
            {"nombre": "Numeración domiciliaria", "tiempo": 10, "costo": 1500},
            {"nombre": "Nomenclatura catastral", "tiempo": 15, "costo": 2000},
            {"nombre": "Visación de planos", "tiempo": 20, "costo": 5000},
            {"nombre": "Informe de dominio", "tiempo": 10, "costo": 1500},
        ]
    },
    {
        "nombre": "Medio Ambiente",
        "descripcion": "Trámites ambientales y espacios verdes",
        "icono": "TreeDeciduous",
        "color": "#22C55E",
        "tramites": [
            {"nombre": "Solicitud de poda", "tiempo": 20, "costo": 0},
            {"nombre": "Extracción de árbol", "tiempo": 30, "costo": 0},
            {"nombre": "Certificado ambiental", "tiempo": 30, "costo": 5000},
            {"nombre": "Denuncia ambiental", "tiempo": 15, "costo": 0},
            {"nombre": "Habilitación de piletas", "tiempo": 20, "costo": 3000},
        ]
    },
    {
        "nombre": "Salud",
        "descripcion": "Trámites relacionados con salud pública",
        "icono": "Heart",
        "color": "#EF4444",
        "tramites": [
            {"nombre": "Libreta sanitaria", "tiempo": 5, "costo": 1000},
            {"nombre": "Habilitación bromatológica", "tiempo": 20, "costo": 8000},
            {"nombre": "Inspección sanitaria", "tiempo": 15, "costo": 3000},
            {"nombre": "Certificado de vacunación", "tiempo": 3, "costo": 0},
            {"nombre": "Registro de mascotas", "tiempo": 3, "costo": 0},
        ]
    },
    {
        "nombre": "Servicios Públicos",
        "descripcion": "Solicitudes de servicios municipales",
        "icono": "Wrench",
        "color": "#64748B",
        "tramites": [
            {"nombre": "Solicitud de contenedor", "tiempo": 30, "costo": 0},
            {"nombre": "Reparación de luminaria", "tiempo": 15, "costo": 0},
            {"nombre": "Bacheo", "tiempo": 20, "costo": 0},
            {"nombre": "Limpieza de terreno", "tiempo": 15, "costo": 0},
            {"nombre": "Desagote de pozo", "tiempo": 10, "costo": 2000},
        ]
    },
    {
        "nombre": "Espacio Público",
        "descripcion": "Uso de espacios públicos y eventos",
        "icono": "CalendarDays",
        "color": "#A855F7",
        "tramites": [
            {"nombre": "Uso del espacio público", "tiempo": 15, "costo": 3000},
            {"nombre": "Permiso para evento", "tiempo": 20, "costo": 5000},
            {"nombre": "Feria itinerante", "tiempo": 15, "costo": 2000},
            {"nombre": "Food truck", "tiempo": 20, "costo": 4000},
            {"nombre": "Ocupación de vereda", "tiempo": 10, "costo": 1500},
        ]
    },
    {
        "nombre": "Registro Civil",
        "descripcion": "Trámites de registro civil y certificados",
        "icono": "FileText",
        "color": "#0EA5E9",
        "tramites": [
            {"nombre": "Certificado de convivencia", "tiempo": 7, "costo": 1000},
            {"nombre": "Certificado de domicilio", "tiempo": 5, "costo": 500},
            {"nombre": "Certificado de residencia", "tiempo": 5, "costo": 500},
            {"nombre": "Partida de nacimiento", "tiempo": 5, "costo": 800},
            {"nombre": "Partida de defunción", "tiempo": 5, "costo": 800},
            {"nombre": "Partida de matrimonio", "tiempo": 5, "costo": 800},
        ]
    },
    {
        "nombre": "Acción Social",
        "descripcion": "Asistencia social y programas municipales",
        "icono": "Users",
        "color": "#6366F1",
        "tramites": [
            {"nombre": "Bolsón alimentario", "tiempo": 10, "costo": 0},
            {"nombre": "Subsidio por emergencia", "tiempo": 15, "costo": 0},
            {"nombre": "Programa de empleo", "tiempo": 20, "costo": 0},
            {"nombre": "Ayuda económica", "tiempo": 15, "costo": 0},
            {"nombre": "Certificado de pobreza", "tiempo": 10, "costo": 0},
        ]
    },
    {
        "nombre": "Denuncias y Fiscalización",
        "descripcion": "Denuncias varias y fiscalización",
        "icono": "AlertTriangle",
        "color": "#F97316",
        "tramites": [
            {"nombre": "Denuncia de obra clandestina", "tiempo": 15, "costo": 0},
            {"nombre": "Denuncia de comercio irregular", "tiempo": 15, "costo": 0},
            {"nombre": "Denuncia de ruidos molestos", "tiempo": 10, "costo": 0},
            {"nombre": "Denuncia de usurpación", "tiempo": 15, "costo": 0},
            {"nombre": "Inspección a pedido", "tiempo": 20, "costo": 2000},
        ]
    },
]


async def main():
    print("=" * 70)
    print("SEED DE TIPOS DE TRAMITE Y TRAMITES")
    print("=" * 70)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener municipio Merlo
        result = await session.execute(
            select(Municipio).where(Municipio.nombre.ilike("%merlo%"))
        )
        municipio = result.scalar_one_or_none()

        if not municipio:
            result = await session.execute(select(Municipio).where(Municipio.activo == True))
            municipio = result.scalars().first()

        if not municipio:
            print("\n[ERROR] No hay municipios en la base de datos.")
            return

        print(f"\nMunicipio: {municipio.nombre} (ID: {municipio.id})")

        # Limpiar datos existentes
        print("\nLimpiando datos existentes...")
        await session.execute(text("DELETE FROM tramites"))
        await session.execute(text(f"DELETE FROM tipos_tramites WHERE municipio_id = {municipio.id}"))
        await session.commit()
        print("   [OK] Datos eliminados")

        # Crear tipos y trámites
        print("\nCreando estructura...")

        tipos_creados = 0
        tramites_creados = 0

        for i, tipo_data in enumerate(TIPOS_TRAMITES):
            # Crear tipo de trámite
            tipo = TipoTramite(
                municipio_id=municipio.id,
                nombre=tipo_data["nombre"],
                descripcion=tipo_data["descripcion"],
                icono=tipo_data["icono"],
                color=tipo_data["color"],
                orden=i + 1,
                activo=True
            )
            session.add(tipo)
            await session.flush()  # Para obtener el ID
            tipos_creados += 1

            print(f"\n>> {tipo_data['nombre']} ({len(tipo_data['tramites'])} trámites)")

            # Crear trámites
            for j, tram_data in enumerate(tipo_data["tramites"]):
                tramite = Tramite(
                    tipo_tramite_id=tipo.id,
                    nombre=tram_data["nombre"],
                    tiempo_estimado_dias=tram_data["tiempo"],
                    costo=tram_data["costo"],
                    orden=j + 1,
                    activo=True
                )
                session.add(tramite)
                tramites_creados += 1

                costo_str = f"${tram_data['costo']:,.0f}" if tram_data["costo"] > 0 else "Gratis"
                print(f"   + {tram_data['nombre']} ({tram_data['tiempo']} días, {costo_str})")

        await session.commit()

        print(f"\n{'=' * 70}")
        print(f"[OK] SEED COMPLETADO")
        print(f"   - {tipos_creados} tipos de trámite creados")
        print(f"   - {tramites_creados} trámites creados")
        print(f"{'=' * 70}")


if __name__ == "__main__":
    asyncio.run(main())
