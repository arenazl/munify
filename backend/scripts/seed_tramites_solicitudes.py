"""
Script para crear tramites/solicitudes de ejemplo usando los servicios existentes.
Ejecutar con: python scripts/seed_tramites_solicitudes.py
"""
import asyncio
import sys
import os
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func

from core.config import settings
from models.municipio import Municipio
from models.tramite import ServicioTramite, Tramite, EstadoTramite
from models.user import User


# Datos de ejemplo para solicitudes
NOMBRES = ["Juan", "María", "Carlos", "Ana", "Pedro", "Laura", "Diego", "Lucía", "Martín", "Sofía"]
APELLIDOS = ["García", "Rodríguez", "López", "Martínez", "González", "Fernández", "Pérez", "Sánchez", "Romero", "Torres"]
ASUNTOS = [
    "Solicitud de trámite",
    "Renovación",
    "Consulta previa",
    "Nueva habilitación",
    "Regularización",
    "Actualización de datos",
    "Reclamo",
    "Pedido urgente",
]

DESCRIPCIONES = [
    "Solicito iniciar el trámite correspondiente según los requisitos indicados.",
    "Necesito realizar este trámite a la brevedad posible.",
    "Adjunto la documentación requerida para comenzar el proceso.",
    "Por favor, revisar mi solicitud y comunicarse a la brevedad.",
    "Este trámite es necesario para regularizar mi situación.",
]


async def main():
    print("=" * 60)
    print("SEED DE TRAMITES/SOLICITUDES DE EJEMPLO")
    print("=" * 60)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener municipio principal (Merlo)
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

        if not servicios:
            print("\n[ERROR] No hay servicios de trámites. Ejecute primero seed_tramites_completos.py")
            return

        print(f"Servicios disponibles: {len(servicios)}")

        # Obtener usuarios del municipio para asociar algunos trámites
        result = await session.execute(
            select(User).where(User.municipio_id == municipio.id).limit(10)
        )
        usuarios = result.scalars().all()
        print(f"Usuarios encontrados: {len(usuarios)}")

        # Contar trámites existentes
        result = await session.execute(
            select(func.count(Tramite.id)).where(Tramite.municipio_id == municipio.id)
        )
        count_existentes = result.scalar() or 0
        print(f"Trámites existentes: {count_existentes}")

        # Cantidad de trámites a crear
        CANTIDAD = 100
        year = datetime.now().year

        print(f"\nCreando {CANTIDAD} trámites de ejemplo...")

        tramites_creados = 0
        for i in range(CANTIDAD):
            servicio = random.choice(servicios)
            nombre = random.choice(NOMBRES)
            apellido = random.choice(APELLIDOS)

            # 60% de los trámites tendrán usuario asociado
            usuario = random.choice(usuarios) if usuarios and random.random() > 0.4 else None

            # Estado aleatorio con distribución realista
            estado_weights = [
                (EstadoTramite.INICIADO, 20),
                (EstadoTramite.EN_REVISION, 25),
                (EstadoTramite.REQUIERE_DOCUMENTACION, 15),
                (EstadoTramite.EN_PROCESO, 15),
                (EstadoTramite.APROBADO, 10),
                (EstadoTramite.FINALIZADO, 10),
                (EstadoTramite.RECHAZADO, 5),
            ]
            estados = [e for e, w in estado_weights for _ in range(w)]
            estado = random.choice(estados)

            # Fecha de creación aleatoria en los últimos 90 días
            dias_atras = random.randint(0, 90)
            created_at = datetime.now() - timedelta(days=dias_atras)

            # Número de trámite
            numero = f"TRM-{year}-{str(count_existentes + i + 1).zfill(5)}"

            tramite = Tramite(
                municipio_id=municipio.id,
                servicio_id=servicio.id,
                numero_tramite=numero,
                estado=estado,
                asunto=f"{random.choice(ASUNTOS)} - {servicio.nombre}",
                descripcion=random.choice(DESCRIPCIONES),
                nombre_solicitante=usuario.nombre if usuario else nombre,
                apellido_solicitante=usuario.apellido if usuario else apellido,
                dni_solicitante=f"{random.randint(20000000, 45000000)}",
                email_solicitante=f"{nombre.lower()}.{apellido.lower()}@email.com",
                telefono_solicitante=f"11{random.randint(30000000, 69999999)}",
                direccion_solicitante=f"Calle {random.randint(1, 200)} N° {random.randint(100, 9999)}",
                solicitante_id=usuario.id if usuario else None,
                prioridad=random.choice([1, 2, 3, 4, 5]),  # 1=urgente, 5=baja
                created_at=created_at,
            )

            # Si está finalizado o aprobado, agregar fecha de resolución
            if estado in [EstadoTramite.APROBADO, EstadoTramite.FINALIZADO, EstadoTramite.RECHAZADO]:
                tramite.fecha_resolucion = created_at + timedelta(days=random.randint(1, 30))

            session.add(tramite)
            tramites_creados += 1

            if (i + 1) % 20 == 0:
                print(f"   ... {i + 1}/{CANTIDAD} creados")

        await session.commit()

        print(f"\n[OK] {tramites_creados} trámites creados exitosamente")

        # Mostrar resumen por estado
        result = await session.execute(
            select(Tramite.estado, func.count(Tramite.id))
            .where(Tramite.municipio_id == municipio.id)
            .group_by(Tramite.estado)
        )
        print("\nResumen por estado:")
        for estado, count in result.all():
            print(f"  - {estado.value}: {count}")

        print("\n" + "=" * 60)
        print("SEED COMPLETADO")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
