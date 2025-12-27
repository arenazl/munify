"""
Script para crear Tipos de Trámite (subcategorías) dentro de cada Servicio.
Ejecutar con: python scripts/seed_tipos_tramites.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func

from core.config import settings
from models.municipio import Municipio
from models.tramite import ServicioTramite, TipoTramite


# Tipos de trámite por nombre de servicio (subcategorías)
TIPOS_POR_SERVICIO = {
    "Habilitación comercial": [
        {"nombre": "Nueva habilitación", "descripcion": "Primera habilitación del comercio", "tiempo": 30, "costo": 15000},
        {"nombre": "Renovación anual", "descripcion": "Renovación de habilitación vigente", "tiempo": 15, "costo": 8000},
        {"nombre": "Cambio de rubro", "descripcion": "Modificación del rubro comercial", "tiempo": 20, "costo": 10000},
        {"nombre": "Ampliación de local", "descripcion": "Habilitación para superficie ampliada", "tiempo": 25, "costo": 12000},
    ],
    "Licencia de conducir (alta / renovación)": [
        {"nombre": "Primera licencia", "descripcion": "Obtención de licencia por primera vez", "tiempo": 15, "costo": 8000},
        {"nombre": "Renovación", "descripcion": "Renovación de licencia vencida", "tiempo": 7, "costo": 6000},
        {"nombre": "Duplicado", "descripcion": "Por robo o extravío", "tiempo": 5, "costo": 4000},
        {"nombre": "Cambio de categoría", "descripcion": "Agregar categoría a licencia existente", "tiempo": 10, "costo": 5000},
    ],
    "Permiso de obra nueva": [
        {"nombre": "Obra nueva residencial", "descripcion": "Vivienda unifamiliar", "tiempo": 45, "costo": 25000},
        {"nombre": "Obra nueva comercial", "descripcion": "Local comercial o industrial", "tiempo": 60, "costo": 35000},
        {"nombre": "Obra nueva multifamiliar", "descripcion": "Edificio de departamentos", "tiempo": 90, "costo": 50000},
    ],
    "Ampliación de obra": [
        {"nombre": "Ampliación menor (hasta 50m²)", "descripcion": "Ampliaciones pequeñas", "tiempo": 20, "costo": 10000},
        {"nombre": "Ampliación mayor (más de 50m²)", "descripcion": "Ampliaciones grandes", "tiempo": 35, "costo": 18000},
    ],
    "Regularización de obra": [
        {"nombre": "Regularización total", "descripcion": "Toda la construcción sin permiso", "tiempo": 60, "costo": 35000},
        {"nombre": "Regularización parcial", "descripcion": "Parte de la construcción", "tiempo": 45, "costo": 25000},
    ],
    "Certificado catastral": [
        {"nombre": "Certificado simple", "descripcion": "Datos básicos del inmueble", "tiempo": 5, "costo": 1500},
        {"nombre": "Certificado completo", "descripcion": "Con plano y valuación", "tiempo": 10, "costo": 3000},
    ],
    "Subdivisión / unificación de parcelas": [
        {"nombre": "Subdivisión", "descripcion": "División de parcela en lotes", "tiempo": 45, "costo": 20000},
        {"nombre": "Unificación", "descripcion": "Unión de parcelas linderas", "tiempo": 30, "costo": 15000},
    ],
    "Tasas municipales (consulta)": [
        {"nombre": "Consulta de deuda", "descripcion": "Estado de cuenta", "tiempo": 1, "costo": 0},
        {"nombre": "Reimpresión de boleta", "descripcion": "Copia de boleta de pago", "tiempo": 1, "costo": 0},
        {"nombre": "Detalle de liquidación", "descripcion": "Desglose de conceptos", "tiempo": 2, "costo": 0},
    ],
    "Planes de pago": [
        {"nombre": "Plan hasta 6 cuotas", "descripcion": "Sin interés", "tiempo": 3, "costo": 0},
        {"nombre": "Plan hasta 12 cuotas", "descripcion": "Con interés reducido", "tiempo": 3, "costo": 0},
        {"nombre": "Plan extendido", "descripcion": "Más de 12 cuotas con interés", "tiempo": 5, "costo": 0},
    ],
    "Libre deuda municipal": [
        {"nombre": "Libre deuda inmobiliario", "descripcion": "Para inmuebles", "tiempo": 3, "costo": 500},
        {"nombre": "Libre deuda comercial", "descripcion": "Para comercios habilitados", "tiempo": 3, "costo": 500},
        {"nombre": "Libre deuda automotor", "descripcion": "Para vehículos", "tiempo": 3, "costo": 500},
    ],
    "Poda / extracción de árboles": [
        {"nombre": "Poda de formación", "descripcion": "Poda regular de mantenimiento", "tiempo": 15, "costo": 0},
        {"nombre": "Poda de emergencia", "descripcion": "Ramas peligrosas", "tiempo": 5, "costo": 0},
        {"nombre": "Extracción total", "descripcion": "Remoción del árbol", "tiempo": 20, "costo": 0},
    ],
    "Turnos en centros de salud": [
        {"nombre": "Consulta clínica", "descripcion": "Médico clínico", "tiempo": 1, "costo": 0},
        {"nombre": "Especialidad", "descripcion": "Médico especialista", "tiempo": 1, "costo": 0},
        {"nombre": "Vacunación", "descripcion": "Aplicación de vacunas", "tiempo": 1, "costo": 0},
        {"nombre": "Laboratorio", "descripcion": "Análisis clínicos", "tiempo": 1, "costo": 0},
    ],
    "Libreta sanitaria": [
        {"nombre": "Primera vez", "descripcion": "Obtención inicial", "tiempo": 7, "costo": 1500},
        {"nombre": "Renovación", "descripcion": "Renovación anual", "tiempo": 5, "costo": 1000},
    ],
}


async def main():
    print("=" * 60)
    print("SEED DE TIPOS DE TRAMITE (SUBCATEGORÍAS)")
    print("=" * 60)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener municipio Merlo
        result = await session.execute(
            select(Municipio).where(Municipio.nombre.ilike("%merlo%"))
        )
        municipio = result.scalar_one_or_none()

        if not municipio:
            result = await session.execute(select(Municipio).where(Municipio.activo == True).limit(1))
            municipio = result.scalar_one_or_none()

        if not municipio:
            print("\n[ERROR] No hay municipios en la base de datos.")
            return

        print(f"\nMunicipio: {municipio.nombre} (ID: {municipio.id})")

        # Obtener servicios del municipio
        result = await session.execute(
            select(ServicioTramite)
            .where(ServicioTramite.municipio_id == municipio.id)
            .where(ServicioTramite.activo == True)
        )
        servicios = result.scalars().all()
        print(f"Servicios encontrados: {len(servicios)}")

        # Contar tipos existentes
        result = await session.execute(select(func.count(TipoTramite.id)))
        count_existentes = result.scalar() or 0
        print(f"Tipos de trámite existentes: {count_existentes}")

        tipos_creados = 0
        servicios_con_tipos = 0

        for servicio in servicios:
            # Buscar si hay tipos definidos para este servicio
            tipos_config = TIPOS_POR_SERVICIO.get(servicio.nombre, [])

            if not tipos_config:
                continue

            servicios_con_tipos += 1
            print(f"\n>> {servicio.nombre}:")

            for i, tipo_data in enumerate(tipos_config):
                # Verificar si ya existe
                result = await session.execute(
                    select(TipoTramite).where(
                        TipoTramite.servicio_id == servicio.id,
                        TipoTramite.nombre == tipo_data["nombre"]
                    )
                )
                existing = result.scalar_one_or_none()

                if existing:
                    print(f"   - {tipo_data['nombre']} (ya existe)")
                    continue

                tipo = TipoTramite(
                    servicio_id=servicio.id,
                    nombre=tipo_data["nombre"],
                    descripcion=tipo_data.get("descripcion", ""),
                    tiempo_estimado_dias=tipo_data.get("tiempo", servicio.tiempo_estimado_dias),
                    costo=tipo_data.get("costo", servicio.costo),
                    activo=True,
                    orden=i + 1,
                )
                session.add(tipo)
                tipos_creados += 1
                print(f"   + {tipo_data['nombre']}")

        await session.commit()

        print(f"\n{'=' * 60}")
        print(f"[OK] {tipos_creados} tipos de trámite creados")
        print(f"     {servicios_con_tipos} servicios tienen subcategorías")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
