"""Pobla el catálogo maestro `tipos_tasa` con todas las tasas municipales
típicas de la Provincia de Buenos Aires.

Referencias usadas:
  - Ley Orgánica de las Municipalidades (Dec-Ley 6769/58) — tasas autorizadas.
  - Ordenanzas Tributarias tipo de municipios PBA (La Matanza, Morón, La Plata,
    Vicente López, Tigre, Moreno, Tres de Febrero, Quilmes, Merlo, San Isidro).
  - Pacto Fiscal PBA: patentes automotor y multas delegadas a los munis.

Cada muni habilita los que le sirven (via Partida.tipo_tasa_id). No todos
los munis cobran todas — pero el catálogo maestro está para todos.

Ejecutar:
  python scripts/seed_tipos_tasa.py
"""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from core.config import settings
from models.tasas import TipoTasa, CicloTasa


# Catálogo maestro — 20 tasas típicas de munis PBA.
# Orden: primero las de mayor volumen (ABL, Seguridad e Higiene, Patentes, Multas),
# después las de nicho. El `orden` se usa en la UI.
TIPOS_TASA = [
    # ==========================================================
    # VOLUMEN ALTO — presentes en ~100% de munis PBA
    # ==========================================================
    {
        "codigo": "abl",
        "nombre": "Alumbrado, Barrido y Limpieza",
        "descripcion": "Tasa por servicios urbanos municipales (TSUM). Cubre alumbrado público, recolección de residuos y limpieza de calles. Se cobra por frentista.",
        "icono": "Home",
        "color": "#3b82f6",
        "ciclo": CicloTasa.BIMESTRAL,
        "orden": 1,
    },
    {
        "codigo": "seguridad_higiene",
        "nombre": "Seguridad e Higiene",
        "descripcion": "Tasa por inspección de seguridad, higiene, salubridad y contralor del funcionamiento de comercios, industrias y servicios.",
        "icono": "Store",
        "color": "#10b981",
        "ciclo": CicloTasa.MENSUAL,
        "orden": 2,
    },
    {
        "codigo": "patente_automotor",
        "nombre": "Patente Automotor",
        "descripcion": "Impuesto a los vehículos automotores (delegado por la Provincia a municipios con convenio). Se liquida por dominio.",
        "icono": "Car",
        "color": "#f59e0b",
        "ciclo": CicloTasa.CUATRIMESTRAL,
        "orden": 3,
    },
    {
        "codigo": "multa_transito",
        "nombre": "Multas de Tránsito",
        "descripcion": "Sanciones pecuniarias por infracciones al código de tránsito municipal/provincial. Se emiten individualmente por acta.",
        "icono": "AlertTriangle",
        "color": "#ef4444",
        "ciclo": CicloTasa.ONE_SHOT,
        "orden": 4,
    },
    {
        "codigo": "cementerio",
        "nombre": "Cementerio",
        "descripcion": "Derechos de ocupación de nichos, sepulturas y parcelas en cementerios municipales. Incluye mantenimiento.",
        "icono": "Church",
        "color": "#78716c",
        "ciclo": CicloTasa.ANUAL,
        "orden": 5,
    },

    # ==========================================================
    # VOLUMEN MEDIO — presentes en ~60-80% de munis PBA
    # ==========================================================
    {
        "codigo": "publicidad_propaganda",
        "nombre": "Publicidad y Propaganda",
        "descripcion": "Derechos por carteles, pantallas, banderas, publicidad rodante y otros medios de difusión en espacio público o visible desde él.",
        "icono": "Megaphone",
        "color": "#ec4899",
        "ciclo": CicloTasa.ANUAL,
        "orden": 10,
    },
    {
        "codigo": "ocupacion_espacio_publico",
        "nombre": "Ocupación del Espacio Público",
        "descripcion": "Por uso privativo del dominio público: mesas y sillas en vereda, kioscos, stands, ferias, obradores.",
        "icono": "Tent",
        "color": "#8b5cf6",
        "ciclo": CicloTasa.MENSUAL,
        "orden": 11,
    },
    {
        "codigo": "habilitacion_comercial",
        "nombre": "Derechos de Habilitación Comercial",
        "descripcion": "Tasa de inicio/renovación de habilitación de comercio, industria o servicio. Se cobra por trámite.",
        "icono": "ClipboardCheck",
        "color": "#06b6d4",
        "ciclo": CicloTasa.ONE_SHOT,
        "orden": 12,
    },
    {
        "codigo": "construccion",
        "nombre": "Derechos de Construcción",
        "descripcion": "Permisos de obra nueva, ampliación, demolición. Se calcula sobre la superficie y categoría constructiva.",
        "icono": "HardHat",
        "color": "#eab308",
        "ciclo": CicloTasa.ONE_SHOT,
        "orden": 13,
    },
    {
        "codigo": "oficina",
        "nombre": "Derechos de Oficina",
        "descripcion": "Emisión de certificados, constancias, copias de expediente, pedidos de informes y otros actos administrativos.",
        "icono": "FileText",
        "color": "#64748b",
        "ciclo": CicloTasa.ONE_SHOT,
        "orden": 14,
    },

    # ==========================================================
    # VOLUMEN BAJO — presentes en <50% de munis PBA (nichos)
    # ==========================================================
    {
        "codigo": "servicios_sanitarios",
        "nombre": "Servicios Sanitarios",
        "descripcion": "Agua corriente y cloacas donde la prestación está a cargo del municipio (no aplica donde hay empresa concesionaria).",
        "icono": "Droplet",
        "color": "#0ea5e9",
        "ciclo": CicloTasa.BIMESTRAL,
        "orden": 20,
    },
    {
        "codigo": "red_vial",
        "nombre": "Red Vial Rural",
        "descripcion": "Contribución para conservación y mejora de caminos rurales. Típica de municipios del interior de PBA con producción agropecuaria.",
        "icono": "Road",
        "color": "#a16207",
        "ciclo": CicloTasa.ANUAL,
        "orden": 21,
    },
    {
        "codigo": "antenas",
        "nombre": "Antenas y Estructuras Soporte",
        "descripcion": "Inspección y control de antenas de telecomunicaciones, estructuras de soporte y equipamientos asociados.",
        "icono": "Radio",
        "color": "#0891b2",
        "ciclo": CicloTasa.ANUAL,
        "orden": 22,
    },
    {
        "codigo": "abasto",
        "nombre": "Tasa de Abasto",
        "descripcion": "Por ingreso de productos alimenticios a mercados, ferias y depósitos municipales.",
        "icono": "ShoppingBag",
        "color": "#84cc16",
        "ciclo": CicloTasa.MENSUAL,
        "orden": 23,
    },
    {
        "codigo": "marcas_senales",
        "nombre": "Marcas y Señales de Ganado",
        "descripcion": "Registro de marcas y señales de hacienda. Común en municipios rurales con producción ganadera.",
        "icono": "Stamp",
        "color": "#92400e",
        "ciclo": CicloTasa.ANUAL,
        "orden": 24,
    },
    {
        "codigo": "canteras",
        "nombre": "Explotación de Canteras",
        "descripcion": "Derecho sobre extracción de minerales de yacimientos dentro del ejido municipal.",
        "icono": "Mountain",
        "color": "#57534e",
        "ciclo": CicloTasa.ANUAL,
        "orden": 25,
    },
    {
        "codigo": "servicios_especiales_limpieza",
        "nombre": "Servicios Especiales de Limpieza",
        "descripcion": "Retiro de residuos no domiciliarios, escombros, desmalezamiento, poda a solicitud de particulares.",
        "icono": "Trash2",
        "color": "#14b8a6",
        "ciclo": CicloTasa.ONE_SHOT,
        "orden": 26,
    },
    {
        "codigo": "rodados",
        "nombre": "Patente de Rodados",
        "descripcion": "Bicicletas, triciclos y rodados no alcanzados por la patente automotor. Raro — algunos munis lo cobran.",
        "icono": "Bike",
        "color": "#6366f1",
        "ciclo": CicloTasa.ANUAL,
        "orden": 27,
    },
    {
        "codigo": "multa_faltas",
        "nombre": "Multas por Faltas Municipales",
        "descripcion": "Sanciones por incumplimiento de ordenanzas municipales no viales (ruidos, residuos, obras sin permiso, etc.).",
        "icono": "Gavel",
        "color": "#dc2626",
        "ciclo": CicloTasa.ONE_SHOT,
        "orden": 28,
    },
    {
        "codigo": "inscripcion_profesionales",
        "nombre": "Inscripción de Profesionales",
        "descripcion": "Registro local de profesionales (martilleros, arquitectos, etc.) para actuar ante la administración municipal.",
        "icono": "BadgeCheck",
        "color": "#7c3aed",
        "ciclo": CicloTasa.ANUAL,
        "orden": 29,
    },
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        # Buscar tipos ya existentes para no duplicar.
        existentes_q = await db.execute(select(TipoTasa.codigo))
        existentes = {row[0] for row in existentes_q.all()}

        creados = 0
        actualizados = 0
        for data in TIPOS_TASA:
            if data["codigo"] in existentes:
                # Actualizar nombre/desc/icono/color por si cambio el master.
                upd_q = await db.execute(
                    select(TipoTasa).where(TipoTasa.codigo == data["codigo"])
                )
                existente = upd_q.scalar_one()
                existente.nombre = data["nombre"]
                existente.descripcion = data["descripcion"]
                existente.icono = data["icono"]
                existente.color = data["color"]
                existente.ciclo = data["ciclo"]
                existente.orden = data["orden"]
                actualizados += 1
            else:
                db.add(TipoTasa(**data, activo=True))
                creados += 1

        await db.commit()

    await engine.dispose()
    print(f"OK — {creados} tipos de tasa creados, {actualizados} actualizados.")


if __name__ == "__main__":
    asyncio.run(main())
