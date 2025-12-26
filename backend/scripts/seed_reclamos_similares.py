"""
Script para generar reclamos similares de prueba.
Crea grupos de reclamos reportados por diferentes vecinos en la misma zona.
"""
import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings
from models.reclamo import Reclamo
from models.categoria import Categoria
from models.zona import Zona
from models.user import User
from models.municipio import Municipio
from models.historial import HistorialReclamo
from models.enums import EstadoReclamo


# Grupos de reclamos similares para crear
# Coordenadas de MERLO, Buenos Aires (zona real del municipio)
GRUPOS_SIMILARES = [
    {
        "titulo_base": "Bache profundo en Av. San Martín",
        "descripcion_base": "Hay un bache muy grande que afecta el tránsito",
        "direccion_base": "Av. San Martín 1234, Merlo",
        "categoria": "Baches",
        "cantidad_reportes": 8,
        "latitud_base": -34.6637,  # Merlo Centro
        "longitud_base": -58.7276,
        "zona": "Merlo Centro",
    },
    {
        "titulo_base": "Luz de calle apagada en calle Mitre",
        "descripcion_base": "La luz de la esquina está apagada hace días, zona muy oscura",
        "direccion_base": "Calle Mitre 567, Merlo",
        "categoria": "Alumbrado",
        "cantidad_reportes": 5,
        "latitud_base": -34.6650,  # Cerca de Merlo Centro
        "longitud_base": -58.7290,
        "zona": "Merlo Centro",
    },
    {
        "titulo_base": "Basura acumulada en Plaza de Merlo",
        "descripcion_base": "Hay basura acumulada en la plaza, no pasó el camión",
        "direccion_base": "Plaza San Martín, Merlo",
        "categoria": "Limpieza",
        "cantidad_reportes": 12,
        "latitud_base": -34.6620,  # Plaza de Merlo
        "longitud_base": -58.7260,
        "zona": "Merlo Centro",
    },
    {
        "titulo_base": "Semáforo sin funcionar en Libertad",
        "descripcion_base": "El semáforo no funciona, es peligroso cruzar",
        "direccion_base": "Av. Libertad y Ruta 21, Libertad",
        "categoria": "Tránsito",
        "cantidad_reportes": 6,
        "latitud_base": -34.6750,  # Libertad, Merlo
        "longitud_base": -58.7150,
        "zona": "Libertad",
    },
    {
        "titulo_base": "Pozo en vereda de Pontevedra",
        "descripcion_base": "Vereda rota con pozo profundo, riesgo de caídas",
        "direccion_base": "Calle Belgrano 890, Pontevedra",
        "categoria": "Veredas",
        "cantidad_reportes": 4,
        "latitud_base": -34.7450,  # Pontevedra, Merlo
        "longitud_base": -58.6950,
        "zona": "Pontevedra",
    },
]

# Variaciones para hacer los reportes únicos
VARIACIONES_TITULO = [
    "",
    " - urgente",
    " muy peligroso",
    " necesita arreglo",
    " sigue sin solución",
]

VARIACIONES_DESCRIPCION = [
    "Vi esto y quiero reportarlo. ",
    "Esto sigue igual hace días. ",
    "Necesita atención urgente. ",
    "Ya van varias semanas con este problema. ",
    "Muchos vecinos se están quejando. ",
]


async def main():
    print(">> Generando reclamos similares de prueba...")

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Obtener datos necesarios
        print("\n>> Obteniendo datos del sistema...")

        # Obtener municipio de Merlo (ID 48)
        result = await session.execute(select(Municipio).where(Municipio.id == 48))
        municipio = result.scalar_one_or_none()
        if not municipio:
            # Fallback: usar el primero disponible
            result = await session.execute(select(Municipio).limit(1))
            municipio = result.scalar_one_or_none()
        if not municipio:
            print("[ERROR] No hay municipios en la base de datos")
            return

        print(f"[OK] Municipio: {municipio.nombre}")

        # Obtener vecinos (usuarios con rol vecino)
        result = await session.execute(
            select(User).where(
                User.rol == 'vecino',
                User.municipio_id == municipio.id
            )
        )
        vecinos = result.scalars().all()
        if len(vecinos) < 5:
            print(f"[WARN] Solo hay {len(vecinos)} vecinos. Se recomienda tener al menos 5")

        print(f"[OK] {len(vecinos)} vecinos disponibles")

        # Obtener categorías y zonas
        result = await session.execute(
            select(Categoria).where(Categoria.municipio_id == municipio.id)
        )
        categorias = {cat.nombre: cat for cat in result.scalars().all()}

        result = await session.execute(
            select(Zona).where(Zona.municipio_id == municipio.id)
        )
        zonas = {zona.nombre: zona for zona in result.scalars().all()}

        print(f"[OK] {len(categorias)} categorías y {len(zonas)} zonas")

        # 2. Crear grupos de reclamos similares
        total_creados = 0
        total_grupos = len(GRUPOS_SIMILARES)

        for idx, grupo in enumerate(GRUPOS_SIMILARES, 1):
            print(f"\n>> Creando grupo {idx}/{total_grupos}: {grupo['titulo_base']}")

            # Buscar categoría (aproximada si no existe exacta)
            categoria = None
            for cat_nombre, cat_obj in categorias.items():
                if grupo['categoria'].lower() in cat_nombre.lower():
                    categoria = cat_obj
                    break

            if not categoria:
                # Usar primera categoría disponible
                categoria = next(iter(categorias.values()))
                print(f"[WARN] Categoría '{grupo['categoria']}' no encontrada, usando '{categoria.nombre}'")

            # Buscar zona
            zona = zonas.get(grupo['zona'])
            if not zona:
                zona = next(iter(zonas.values())) if zonas else None
                if zona:
                    print(f"[WARN] Zona '{grupo['zona']}' no encontrada, usando '{zona.nombre}'")

            # Crear N reclamos similares
            cantidad = min(grupo['cantidad_reportes'], len(vecinos))
            vecinos_usados = random.sample(vecinos, cantidad)

            for i, vecino in enumerate(vecinos_usados):
                # Generar pequeña variación en ubicación (dentro de 50 metros)
                lat_offset = random.uniform(-0.0004, 0.0004)  # ~40 metros
                lon_offset = random.uniform(-0.0004, 0.0004)

                latitud = grupo['latitud_base'] + lat_offset
                longitud = grupo['longitud_base'] + lon_offset

                # Variar título y descripción ligeramente
                titulo = grupo['titulo_base'] + random.choice(VARIACIONES_TITULO)
                descripcion = random.choice(VARIACIONES_DESCRIPCION) + grupo['descripcion_base']

                # Variar dirección ligeramente
                numero_base = 1234
                numero = numero_base + random.randint(-20, 20)
                direccion = grupo['direccion_base'].replace('1234', str(numero))

                # Fecha de creación (últimos 15 días, con pequeña variación)
                dias_atras = random.randint(1, 15)
                horas_atras = random.randint(0, 23)
                created_at = datetime.utcnow() - timedelta(days=dias_atras, hours=horas_atras)

                # Estado aleatorio (mayoría nuevos o asignados)
                estados_posibles = [
                    EstadoReclamo.NUEVO,
                    EstadoReclamo.NUEVO,
                    EstadoReclamo.NUEVO,
                    EstadoReclamo.ASIGNADO,
                    EstadoReclamo.ASIGNADO,
                    EstadoReclamo.EN_PROCESO,
                ]
                estado = random.choice(estados_posibles)

                # Crear reclamo
                reclamo = Reclamo(
                    titulo=titulo,
                    descripcion=descripcion,
                    direccion=direccion,
                    estado=estado,
                    categoria_id=categoria.id,
                    zona_id=zona.id if zona else None,
                    creador_id=vecino.id,
                    municipio_id=municipio.id,
                    latitud=latitud,
                    longitud=longitud,
                    prioridad=3,
                    created_at=created_at,
                    updated_at=created_at,
                )
                session.add(reclamo)
                await session.flush()

                # Crear historial inicial
                historial = HistorialReclamo(
                    reclamo_id=reclamo.id,
                    usuario_id=vecino.id,
                    estado_nuevo=EstadoReclamo.NUEVO,
                    accion="creado",
                    comentario="Reclamo creado",
                    created_at=created_at
                )
                session.add(historial)

                total_creados += 1

            print(f"   [OK] {cantidad} reclamos similares creados")

        # Commit final
        await session.commit()

        print("\n" + "="*60)
        print("> RESUMEN")
        print("="*60)
        print(f"Grupos creados: {total_grupos}")
        print(f"Reclamos totales creados: {total_creados}")
        print("\nDistribucion por grupo:")
        for grupo in GRUPOS_SIMILARES:
            print(f"  - {grupo['titulo_base']}: {grupo['cantidad_reportes']} reportes")
        print("="*60)
        print("\n[OK] Script completado con exito!")
        print("\nAhora puedes probar:")
        print("1. Ver alertas al crear reclamos similares")
        print("2. Ver contador 'X vecinos reportaron esto'")
        print("3. Dashboard de reclamos recurrentes (admin/supervisor)")


if __name__ == "__main__":
    asyncio.run(main())
