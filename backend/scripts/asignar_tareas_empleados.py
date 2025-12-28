"""
Script para asignar reclamos a los empleados de Merlo.
Cada empleado recibirá 10 tareas repartidas en diferentes estados.
Solo modifica la tabla de reclamos, no toca usuarios.
"""
import asyncio
import random
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings
from models.municipio import Municipio
from models.empleado import Empleado
from models.reclamo import Reclamo
from models.enums import EstadoReclamo

MUNICIPIO_NOMBRE = "Merlo"
TAREAS_POR_EMPLEADO = 10


async def main():
    print(">> Asignando tareas a empleados de Merlo...")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Obtener municipio de Merlo
        result = await session.execute(
            select(Municipio).where(Municipio.nombre == MUNICIPIO_NOMBRE)
        )
        municipio = result.scalar_one_or_none()

        if not municipio:
            print(f"[ERROR] No se encontró el municipio {MUNICIPIO_NOMBRE}")
            return

        print(f"[OK] Municipio: {municipio.nombre} (ID: {municipio.id})")

        # 2. Obtener empleados de la tabla empleados
        result = await session.execute(
            select(Empleado).where(
                Empleado.municipio_id == municipio.id,
                Empleado.activo == True
            )
        )
        empleados_db = result.scalars().all()
        print(f"[OK] Encontrados {len(empleados_db)} empleados")

        if not empleados_db:
            print("[ERROR] No hay empleados registrados")
            return

        # 3. Obtener reclamos disponibles (NUEVO o sin empleado asignado)
        result = await session.execute(
            select(Reclamo).where(
                Reclamo.municipio_id == municipio.id,
                Reclamo.estado.in_([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])
            ).order_by(Reclamo.created_at.desc())
        )
        reclamos_disponibles = result.scalars().all()
        print(f"[OK] Reclamos disponibles: {len(reclamos_disponibles)}")

        # 4. Asignar tareas a cada empleado
        indice_reclamo = 0
        total_asignados = 0

        for emp in empleados_db:
            print(f"\n>> Asignando tareas a {emp.nombre} {emp.apellido} (ID: {emp.id})...")

            tareas_asignadas = 0
            for i in range(TAREAS_POR_EMPLEADO):
                if indice_reclamo >= len(reclamos_disponibles):
                    print("   [!] No hay más reclamos disponibles")
                    break

                reclamo = reclamos_disponibles[indice_reclamo]
                indice_reclamo += 1

                # Asignar empleado
                reclamo.empleado_id = emp.id

                # Decidir estado aleatorio
                peso = random.random()

                if peso < 0.4:  # 40% asignado
                    reclamo.estado = EstadoReclamo.ASIGNADO
                    reclamo.fecha_asignacion = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 7))
                else:  # 60% en proceso
                    reclamo.estado = EstadoReclamo.EN_PROCESO
                    reclamo.fecha_asignacion = datetime.now(timezone.utc) - timedelta(days=random.randint(3, 14))
                    reclamo.fecha_inicio_trabajo = reclamo.fecha_asignacion + timedelta(hours=random.randint(1, 48))

                # Establecer prioridad variada
                reclamo.prioridad = random.randint(1, 5)

                tareas_asignadas += 1
                total_asignados += 1

            print(f"   [OK] {tareas_asignadas} tareas asignadas")

        # Commit al final
        await session.commit()

        print(f"\n{'='*60}")
        print(f"RESUMEN")
        print(f"{'='*60}")
        print(f"Total empleados: {len(empleados_db)}")
        print(f"Total reclamos asignados: {total_asignados}")
        print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
