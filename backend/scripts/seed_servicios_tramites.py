"""
Script para poblar la base de datos con servicios de trámites típicos municipales.
Ejecutar con: python scripts/seed_servicios_tramites.py
"""
import asyncio
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from core.config import settings
from models.municipio import Municipio
from models.tramite import ServicioTramite


# Servicios de trámites típicos municipales
SERVICIOS_TRAMITES = [
    {
        "nombre": "Habilitación Comercial",
        "descripcion": "Trámite para habilitar un local comercial o industrial en el municipio.",
        "icono": "Store",
        "color": "#3B82F6",
        "requisitos": """- DNI del titular o representante legal
- Contrato de alquiler o título de propiedad
- Plano del local con medidas
- Certificado de aptitud ambiental (según rubro)
- Constancia de inscripción en AFIP""",
        "documentos_requeridos": """DNI (frente y dorso), Contrato de alquiler/Escritura, Plano del local, Habilitación de Bomberos (si aplica), Constancia AFIP""",
        "tiempo_estimado_dias": 30,
        "costo": 15000.0,
        "orden": 1
    },
    {
        "nombre": "Certificado de Libre Deuda",
        "descripcion": "Certificado que acredita que no posee deudas con el municipio por tasas o impuestos.",
        "icono": "FileCheck",
        "color": "#10B981",
        "requisitos": """- DNI del titular
- Datos del inmueble (partida inmobiliaria)
- Último recibo de tasa municipal pagado""",
        "documentos_requeridos": """DNI, Último recibo de tasa municipal""",
        "tiempo_estimado_dias": 5,
        "costo": 500.0,
        "orden": 2
    },
    {
        "nombre": "Permiso de Obra",
        "descripcion": "Autorización para realizar construcciones, ampliaciones o refacciones en un inmueble.",
        "icono": "HardHat",
        "color": "#F59E0B",
        "requisitos": """- DNI del propietario
- Escritura o boleto de compraventa
- Planos firmados por profesional matriculado
- Declaración jurada del profesional
- Certificado de aptitud de suelo (si aplica)""",
        "documentos_requeridos": """DNI, Escritura, Planos visados por Colegio, Libre deuda municipal, Certificado de zonificación""",
        "tiempo_estimado_dias": 45,
        "costo": 25000.0,
        "orden": 3
    },
    {
        "nombre": "Licencia de Conducir",
        "descripcion": "Obtención, renovación o duplicado de licencia de conducir.",
        "icono": "Car",
        "color": "#8B5CF6",
        "requisitos": """- DNI original
- Certificado de domicilio
- Examen psicofísico aprobado
- Curso de educación vial aprobado
- Libre de infracciones (para renovación)""",
        "documentos_requeridos": """DNI original, Certificado de domicilio, Foto 4x4, Grupo sanguíneo""",
        "tiempo_estimado_dias": 15,
        "costo": 8000.0,
        "orden": 4
    },
    {
        "nombre": "Certificado de Zonificación",
        "descripcion": "Certificado que indica el uso de suelo permitido para un inmueble determinado.",
        "icono": "Map",
        "color": "#EC4899",
        "requisitos": """- DNI del solicitante
- Datos catastrales del inmueble
- Croquis de ubicación""",
        "documentos_requeridos": """DNI, Datos de partida inmobiliaria""",
        "tiempo_estimado_dias": 10,
        "costo": 2000.0,
        "orden": 5
    },
    {
        "nombre": "Registro de Mascotas",
        "descripcion": "Inscripción de mascotas en el registro municipal (perros y gatos).",
        "icono": "Dog",
        "color": "#06B6D4",
        "requisitos": """- DNI del propietario
- Datos de la mascota (nombre, raza, color)
- Certificado de vacunación antirrábica vigente
- Foto de la mascota""",
        "documentos_requeridos": """DNI, Libreta sanitaria de la mascota, Foto de la mascota""",
        "tiempo_estimado_dias": 3,
        "costo": 0.0,
        "orden": 6
    },
    {
        "nombre": "Permiso de Publicidad",
        "descripcion": "Autorización para colocar carteles, toldos o publicidad en vía pública o fachadas.",
        "icono": "Megaphone",
        "color": "#F97316",
        "requisitos": """- DNI del titular del comercio
- Habilitación comercial vigente
- Diseño del cartel/publicidad con medidas
- Fotografía del frente del local""",
        "documentos_requeridos": """DNI, Habilitación comercial, Diseño del cartel, Foto del frente""",
        "tiempo_estimado_dias": 15,
        "costo": 5000.0,
        "orden": 7
    },
    {
        "nombre": "Solicitud de Poda",
        "descripcion": "Pedido de poda o extracción de árboles en vía pública.",
        "icono": "TreeDeciduous",
        "color": "#22C55E",
        "requisitos": """- DNI del solicitante
- Dirección exacta del árbol
- Motivo de la solicitud
- Fotografías del árbol (si es posible)""",
        "documentos_requeridos": """DNI, Fotos del árbol (opcional)""",
        "tiempo_estimado_dias": 20,
        "costo": 0.0,
        "orden": 8
    },
    {
        "nombre": "Certificado de Convivencia",
        "descripcion": "Documento que acredita la convivencia de dos o más personas en un mismo domicilio.",
        "icono": "Users",
        "color": "#6366F1",
        "requisitos": """- DNI de ambos convivientes
- Comprobante de domicilio actual
- Declaración jurada de convivencia
- Testigos (2) con DNI""",
        "documentos_requeridos": """DNI de ambos, Comprobante de domicilio, DNI de testigos""",
        "tiempo_estimado_dias": 7,
        "costo": 1000.0,
        "orden": 9
    },
    {
        "nombre": "Solicitud de Contenedor",
        "descripcion": "Pedido de instalación de contenedor de residuos en la cuadra.",
        "icono": "Trash2",
        "color": "#64748B",
        "requisitos": """- DNI del solicitante
- Dirección exacta solicitada
- Firma de vecinos de la cuadra (mínimo 5)""",
        "documentos_requeridos": """DNI, Planilla de firmas de vecinos""",
        "tiempo_estimado_dias": 30,
        "costo": 0.0,
        "orden": 10
    },
    {
        "nombre": "Uso del Espacio Público",
        "descripcion": "Permiso para uso temporal de espacios públicos (ferias, eventos, food trucks).",
        "icono": "CalendarDays",
        "color": "#A855F7",
        "requisitos": """- DNI del responsable
- Descripción del evento/actividad
- Fecha, horario y ubicación solicitada
- Seguro de responsabilidad civil
- Habilitación del vehículo (food trucks)""",
        "documentos_requeridos": """DNI, Descripción del evento, Póliza de seguro, Habilitación bromatológica (si aplica)""",
        "tiempo_estimado_dias": 15,
        "costo": 3000.0,
        "orden": 11
    },
    {
        "nombre": "Numeración Domiciliaria",
        "descripcion": "Asignación o verificación de número de calle para un inmueble.",
        "icono": "Hash",
        "color": "#0EA5E9",
        "requisitos": """- DNI del propietario o poseedor
- Escritura o boleto de compraventa
- Plano de mensura (si existe)""",
        "documentos_requeridos": """DNI, Escritura o boleto, Ubicación en el plano""",
        "tiempo_estimado_dias": 10,
        "costo": 1500.0,
        "orden": 12
    },
    {
        "nombre": "Exención de Tasas",
        "descripcion": "Solicitud de exención o reducción de tasas municipales por motivos sociales.",
        "icono": "BadgePercent",
        "color": "#14B8A6",
        "requisitos": """- DNI del titular
- Certificado de discapacidad o jubilación (según caso)
- Declaración jurada de ingresos
- Recibo de sueldo o certificación de haberes""",
        "documentos_requeridos": """DNI, Certificado correspondiente, Declaración de ingresos""",
        "tiempo_estimado_dias": 20,
        "costo": 0.0,
        "orden": 13
    },
    {
        "nombre": "Denuncia de Obra Clandestina",
        "descripcion": "Denuncia de construcciones sin permiso o en infracción.",
        "icono": "AlertTriangle",
        "color": "#EF4444",
        "requisitos": """- DNI del denunciante (opcional, puede ser anónimo)
- Dirección de la obra denunciada
- Descripción de la irregularidad
- Fotografías (si es posible)""",
        "documentos_requeridos": """Fotos de la obra (opcional)""",
        "tiempo_estimado_dias": 15,
        "costo": 0.0,
        "orden": 14
    },
    {
        "nombre": "Plan de Pago",
        "descripcion": "Solicitud de plan de pagos para deudas de tasas municipales.",
        "icono": "CreditCard",
        "color": "#84CC16",
        "requisitos": """- DNI del titular
- Datos del inmueble o comercio
- Anticipo del 10% de la deuda""",
        "documentos_requeridos": """DNI, Último recibo de tasa""",
        "tiempo_estimado_dias": 5,
        "costo": 0.0,
        "orden": 15
    }
]


async def main():
    print("=" * 60)
    print("SEED DE SERVICIOS DE TRAMITES MUNICIPALES")
    print("=" * 60)

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener todos los municipios
        result = await session.execute(select(Municipio).where(Municipio.activo == True))
        municipios = result.scalars().all()

        if not municipios:
            print("\n[ERROR] No hay municipios en la base de datos.")
            print("Ejecute primero: python scripts/seed_merlo.py")
            return

        print(f"\nMunicipios encontrados: {len(municipios)}")

        for municipio in municipios:
            print(f"\n>> Procesando: {municipio.nombre}")

            servicios_creados = 0
            servicios_existentes = 0

            for servicio_data in SERVICIOS_TRAMITES:
                # Verificar si ya existe
                result = await session.execute(
                    select(ServicioTramite).where(
                        ServicioTramite.municipio_id == municipio.id,
                        ServicioTramite.nombre == servicio_data["nombre"]
                    )
                )
                existing = result.scalar_one_or_none()

                if existing:
                    servicios_existentes += 1
                    continue

                # Crear nuevo servicio
                servicio = ServicioTramite(
                    municipio_id=municipio.id,
                    nombre=servicio_data["nombre"],
                    descripcion=servicio_data["descripcion"],
                    icono=servicio_data["icono"],
                    color=servicio_data["color"],
                    requisitos=servicio_data["requisitos"],
                    documentos_requeridos=servicio_data["documentos_requeridos"],
                    tiempo_estimado_dias=servicio_data["tiempo_estimado_dias"],
                    costo=servicio_data["costo"],
                    orden=servicio_data["orden"],
                    activo=True
                )
                session.add(servicio)
                servicios_creados += 1

            await session.commit()
            print(f"   [OK] {servicios_creados} servicios creados, {servicios_existentes} ya existían")

        print("\n" + "=" * 60)
        print("SEED COMPLETADO")
        print("=" * 60)
        print(f"\nServicios disponibles:")
        for i, s in enumerate(SERVICIOS_TRAMITES, 1):
            costo = f"${s['costo']:,.0f}" if s['costo'] > 0 else "Gratis"
            print(f"  {i:2}. {s['nombre']} ({s['tiempo_estimado_dias']} días, {costo})")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
