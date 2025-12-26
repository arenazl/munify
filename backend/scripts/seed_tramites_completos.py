"""
Script para poblar la base de datos con servicios de trámites municipales completos.
Incluye 10 rubros con todos sus trámites asociados.
Ejecutar con: python scripts/seed_tramites_completos.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete

from core.config import settings
from models.municipio import Municipio
from models.tramite import ServicioTramite


# Rubros con sus trámites
RUBROS_TRAMITES = {
    "HABILITACIONES Y COMERCIO": {
        "icono": "Store",
        "color": "#3B82F6",
        "tramites": [
            {"nombre": "Habilitación comercial", "descripcion": "Trámite para habilitar un nuevo comercio o industria", "tiempo": 30, "costo": 15000},
            {"nombre": "Renovación de habilitación", "descripcion": "Renovación anual de habilitación comercial vigente", "tiempo": 15, "costo": 8000},
            {"nombre": "Cambio de titularidad", "descripcion": "Transferencia de habilitación a nuevo titular", "tiempo": 20, "costo": 10000},
            {"nombre": "Cambio de rubro", "descripcion": "Modificación del rubro comercial habilitado", "tiempo": 25, "costo": 12000},
            {"nombre": "Ampliación / modificación de local", "descripcion": "Autorización para ampliar o modificar el local comercial", "tiempo": 30, "costo": 8000},
            {"nombre": "Baja comercial", "descripcion": "Solicitud de baja de habilitación comercial", "tiempo": 10, "costo": 0},
            {"nombre": "Habilitación provisoria", "descripcion": "Habilitación temporal mientras se completa el trámite definitivo", "tiempo": 7, "costo": 5000},
            {"nombre": "Inspección comercial", "descripcion": "Solicitud de inspección del local comercial", "tiempo": 15, "costo": 3000},
            {"nombre": "Autorización de cartelería", "descripcion": "Permiso para instalar cartelería comercial", "tiempo": 10, "costo": 2500},
            {"nombre": "Libre deuda comercial", "descripcion": "Certificado de libre deuda para comercios", "tiempo": 5, "costo": 1000},
            {"nombre": "Certificado de habilitación", "descripcion": "Copia certificada de habilitación comercial", "tiempo": 3, "costo": 500},
        ]
    },
    "OBRAS PARTICULARES": {
        "icono": "HardHat",
        "color": "#F59E0B",
        "tramites": [
            {"nombre": "Permiso de obra nueva", "descripcion": "Autorización para construcción nueva", "tiempo": 45, "costo": 25000},
            {"nombre": "Ampliación de obra", "descripcion": "Permiso para ampliar construcción existente", "tiempo": 30, "costo": 15000},
            {"nombre": "Regularización de obra", "descripcion": "Regularizar construcciones sin permiso previo", "tiempo": 60, "costo": 35000},
            {"nombre": "Final de obra", "descripcion": "Certificado de finalización de obra", "tiempo": 20, "costo": 8000},
            {"nombre": "Declaración de obra menor", "descripcion": "Obras menores que no requieren permiso completo", "tiempo": 10, "costo": 3000},
            {"nombre": "Aprobación de planos", "descripcion": "Aprobación de planos de construcción", "tiempo": 30, "costo": 12000},
            {"nombre": "Visado de planos", "descripcion": "Visado municipal de planos arquitectónicos", "tiempo": 15, "costo": 5000},
            {"nombre": "Inspecciones de obra", "descripcion": "Solicitud de inspección de avance de obra", "tiempo": 10, "costo": 2000},
            {"nombre": "Certificado de aptitud técnica", "descripcion": "Certificado de aptitud técnica de la construcción", "tiempo": 15, "costo": 4000},
            {"nombre": "Consulta técnica", "descripcion": "Consulta técnica sobre obras y construcciones", "tiempo": 7, "costo": 1500},
        ]
    },
    "CATASTRO": {
        "icono": "Map",
        "color": "#EC4899",
        "tramites": [
            {"nombre": "Certificado catastral", "descripcion": "Certificado con datos catastrales del inmueble", "tiempo": 10, "costo": 2000},
            {"nombre": "Numeración domiciliaria", "descripcion": "Asignación o verificación de número de calle", "tiempo": 10, "costo": 1500},
            {"nombre": "Nomenclatura catastral", "descripcion": "Obtención de nomenclatura catastral oficial", "tiempo": 7, "costo": 1000},
            {"nombre": "Subdivisión / unificación de parcelas", "descripcion": "Trámite de subdivisión o unificación parcelaria", "tiempo": 45, "costo": 20000},
            {"nombre": "Mensura", "descripcion": "Solicitud de mensura oficial", "tiempo": 30, "costo": 15000},
            {"nombre": "Actualización de datos catastrales", "descripcion": "Actualizar información catastral del inmueble", "tiempo": 15, "costo": 2500},
            {"nombre": "Certificado de zonificación", "descripcion": "Certificado de uso de suelo permitido", "tiempo": 10, "costo": 2000},
            {"nombre": "Informe parcelario", "descripcion": "Informe detallado de la parcela", "tiempo": 7, "costo": 1500},
        ]
    },
    "TRÁNSITO": {
        "icono": "Car",
        "color": "#8B5CF6",
        "tramites": [
            {"nombre": "Licencia de conducir (alta / renovación)", "descripcion": "Obtención o renovación de licencia de conducir", "tiempo": 15, "costo": 8000},
            {"nombre": "Duplicado de licencia", "descripcion": "Duplicado por robo, extravío o deterioro", "tiempo": 10, "costo": 4000},
            {"nombre": "Cambio de categoría", "descripcion": "Cambio de categoría de licencia de conducir", "tiempo": 15, "costo": 6000},
            {"nombre": "Turnos para licencia", "descripcion": "Solicitud de turno para trámite de licencia", "tiempo": 1, "costo": 0},
            {"nombre": "Infracciones (consulta / descargo)", "descripcion": "Consulta de infracciones o presentación de descargo", "tiempo": 15, "costo": 0},
            {"nombre": "Permisos de estacionamiento", "descripcion": "Permiso especial de estacionamiento", "tiempo": 10, "costo": 3000},
            {"nombre": "Corte de calle", "descripcion": "Autorización para corte temporal de calle", "tiempo": 7, "costo": 2000},
            {"nombre": "Señalización vial", "descripcion": "Solicitud de nueva señalización vial", "tiempo": 20, "costo": 0},
        ]
    },
    "TASAS Y RECAUDACIÓN": {
        "icono": "CreditCard",
        "color": "#10B981",
        "tramites": [
            {"nombre": "Tasas municipales (consulta)", "descripcion": "Consulta de estado de tasas municipales", "tiempo": 1, "costo": 0},
            {"nombre": "Reimpresión de boletas", "descripcion": "Reimpresión de boletas de tasas municipales", "tiempo": 1, "costo": 0},
            {"nombre": "Planes de pago", "descripcion": "Solicitud de plan de pagos para deudas", "tiempo": 5, "costo": 0},
            {"nombre": "Moratorias", "descripcion": "Adhesión a moratorias vigentes", "tiempo": 5, "costo": 0},
            {"nombre": "Libre deuda municipal", "descripcion": "Certificado de libre deuda del inmueble", "tiempo": 5, "costo": 500},
            {"nombre": "Certificado de deuda", "descripcion": "Certificado de estado de deuda", "tiempo": 3, "costo": 300},
            {"nombre": "Exenciones", "descripcion": "Solicitud de exención de tasas", "tiempo": 20, "costo": 0},
            {"nombre": "Reclamos por liquidación", "descripcion": "Reclamo por errores en liquidación de tasas", "tiempo": 15, "costo": 0},
            {"nombre": "Cambio de titularidad tributaria", "descripcion": "Cambio de titular para pago de tasas", "tiempo": 10, "costo": 500},
        ]
    },
    "SERVICIOS PÚBLICOS": {
        "icono": "Lightbulb",
        "color": "#F97316",
        "tramites": [
            {"nombre": "Alumbrado público", "descripcion": "Reclamo por falta o falla de alumbrado público", "tiempo": 7, "costo": 0},
            {"nombre": "Barrido y limpieza", "descripcion": "Reclamo por deficiencia en barrido y limpieza", "tiempo": 5, "costo": 0},
            {"nombre": "Recolección de residuos", "descripcion": "Reclamo por problemas en recolección de residuos", "tiempo": 3, "costo": 0},
            {"nombre": "Bacheo", "descripcion": "Solicitud de reparación de baches en calzada", "tiempo": 15, "costo": 0},
            {"nombre": "Veredas en mal estado", "descripcion": "Reclamo por veredas deterioradas", "tiempo": 20, "costo": 0},
            {"nombre": "Desagües pluviales", "descripcion": "Reclamo por problemas de desagües pluviales", "tiempo": 15, "costo": 0},
            {"nombre": "Semáforos", "descripcion": "Reclamo por fallas en semáforos", "tiempo": 5, "costo": 0},
            {"nombre": "Espacios verdes", "descripcion": "Solicitud de mantenimiento de espacios verdes", "tiempo": 10, "costo": 0},
        ]
    },
    "MEDIO AMBIENTE": {
        "icono": "TreeDeciduous",
        "color": "#22C55E",
        "tramites": [
            {"nombre": "Poda / extracción de árboles", "descripcion": "Solicitud de poda o extracción de árboles", "tiempo": 20, "costo": 0},
            {"nombre": "Denuncia por quema", "descripcion": "Denuncia por quema de residuos o pastizales", "tiempo": 3, "costo": 0},
            {"nombre": "Ruidos molestos", "descripcion": "Denuncia por ruidos molestos", "tiempo": 5, "costo": 0},
            {"nombre": "Denuncia ambiental", "descripcion": "Denuncia por contaminación o daño ambiental", "tiempo": 10, "costo": 0},
            {"nombre": "Gestión de residuos especiales", "descripcion": "Autorización para disposición de residuos especiales", "tiempo": 15, "costo": 3000},
        ]
    },
    "SALUD": {
        "icono": "Heart",
        "color": "#EF4444",
        "tramites": [
            {"nombre": "Turnos en centros de salud", "descripcion": "Solicitud de turnos en centros de salud municipales", "tiempo": 1, "costo": 0},
            {"nombre": "Libreta sanitaria", "descripcion": "Obtención o renovación de libreta sanitaria", "tiempo": 7, "costo": 1500},
            {"nombre": "Certificados médicos", "descripcion": "Emisión de certificados médicos varios", "tiempo": 3, "costo": 500},
            {"nombre": "Denuncias sanitarias", "descripcion": "Denuncia por condiciones sanitarias deficientes", "tiempo": 5, "costo": 0},
            {"nombre": "Control bromatológico", "descripcion": "Solicitud de inspección bromatológica", "tiempo": 10, "costo": 2000},
        ]
    },
    "ACCIÓN SOCIAL": {
        "icono": "Users",
        "color": "#6366F1",
        "tramites": [
            {"nombre": "Solicitud de asistencia social", "descripcion": "Solicitud de asistencia social municipal", "tiempo": 15, "costo": 0},
            {"nombre": "Ayuda económica", "descripcion": "Solicitud de ayuda económica de emergencia", "tiempo": 10, "costo": 0},
            {"nombre": "Emergencia habitacional", "descripcion": "Solicitud por situación de emergencia habitacional", "tiempo": 7, "costo": 0},
            {"nombre": "Entrevista social", "descripcion": "Turno para entrevista con trabajador social", "tiempo": 5, "costo": 0},
            {"nombre": "Certificados sociales", "descripcion": "Emisión de certificados sociales varios", "tiempo": 7, "costo": 0},
        ]
    },
    "INSTITUCIONAL / ADMINISTRATIVO": {
        "icono": "FileText",
        "color": "#64748B",
        "tramites": [
            {"nombre": "Mesa de entradas", "descripcion": "Ingreso de documentación por mesa de entradas", "tiempo": 1, "costo": 0},
            {"nombre": "Expedientes administrativos", "descripcion": "Consulta de estado de expedientes", "tiempo": 3, "costo": 0},
            {"nombre": "Acceso a la información pública", "descripcion": "Solicitud de información pública", "tiempo": 15, "costo": 0},
            {"nombre": "Quejas y sugerencias", "descripcion": "Presentación de quejas o sugerencias", "tiempo": 10, "costo": 0},
            {"nombre": "Solicitud de audiencias", "descripcion": "Solicitud de audiencia con funcionarios", "tiempo": 15, "costo": 0},
            {"nombre": "Certificaciones varias", "descripcion": "Certificaciones y constancias administrativas", "tiempo": 7, "costo": 500},
        ]
    },
}


async def main():
    print("=" * 70)
    print("SEED DE SERVICIOS DE TRAMITES MUNICIPALES - COMPLETO")
    print("=" * 70)

    # Contar total de trámites
    total_tramites = sum(len(rubro["tramites"]) for rubro in RUBROS_TRAMITES.values())
    print(f"\nTotal de trámites a cargar: {total_tramites}")
    print(f"Rubros: {len(RUBROS_TRAMITES)}")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener todos los municipios
        result = await session.execute(select(Municipio).where(Municipio.activo == True))
        municipios = result.scalars().all()

        if not municipios:
            print("\n[ERROR] No hay municipios en la base de datos.")
            return

        print(f"\nMunicipios encontrados: {len(municipios)}")

        for municipio in municipios:
            print(f"\n>> Procesando: {municipio.nombre}")

            # Eliminar servicios existentes del municipio
            await session.execute(
                delete(ServicioTramite).where(ServicioTramite.municipio_id == municipio.id)
            )
            await session.commit()
            print(f"   [INFO] Servicios anteriores eliminados")

            orden = 1
            servicios_creados = 0

            for rubro_nombre, rubro_data in RUBROS_TRAMITES.items():
                for tramite in rubro_data["tramites"]:
                    servicio = ServicioTramite(
                        municipio_id=municipio.id,
                        nombre=tramite["nombre"],
                        descripcion=f"[{rubro_nombre}] {tramite['descripcion']}",
                        icono=rubro_data["icono"],
                        color=rubro_data["color"],
                        requisitos=f"Rubro: {rubro_nombre}",
                        documentos_requeridos="DNI, Documentación según corresponda",
                        tiempo_estimado_dias=tramite["tiempo"],
                        costo=float(tramite["costo"]),
                        orden=orden,
                        activo=True,
                        favorito=orden <= 6  # Los primeros 6 son favoritos
                    )
                    session.add(servicio)
                    servicios_creados += 1
                    orden += 1

            await session.commit()
            print(f"   [OK] {servicios_creados} servicios creados")

        print("\n" + "=" * 70)
        print("SEED COMPLETADO")
        print("=" * 70)
        print(f"\nResumen por rubro:")
        for rubro_nombre, rubro_data in RUBROS_TRAMITES.items():
            print(f"  - {rubro_nombre}: {len(rubro_data['tramites'])} trámites")
        print(f"\nTotal: {total_tramites} trámites por municipio")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
