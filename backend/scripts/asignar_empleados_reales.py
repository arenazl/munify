"""
Script para asignar empleados reales (de la tabla empleados) a reclamos y tramites
que esten en estados avanzados.

Estados avanzados reclamos: ASIGNADO, EN_PROCESO, PENDIENTE_CONFIRMACION, RESUELTO
Estados avanzados tramites: EN_REVISION, EN_PROCESO, APROBADO, FINALIZADO

Ejecutar: python -m scripts.asignar_empleados_reales
"""
import sys
import os
import asyncio
import random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import AsyncSessionLocal

# Estados que requieren un empleado asignado
ESTADOS_AVANZADOS_RECLAMO = ['asignado', 'en_proceso', 'pendiente_confirmacion', 'resuelto']
ESTADOS_AVANZADOS_TRAMITE = ['EN_REVISION', 'EN_PROCESO', 'APROBADO', 'FINALIZADO']


async def asignar_empleados():
    async with AsyncSessionLocal() as db:
        try:
            # Obtener todos los empleados activos
            result = await db.execute(
                text("SELECT id, nombre, apellido FROM empleados WHERE activo = 1")
            )
            empleados = result.fetchall()

            if not empleados:
                print("No hay empleados activos en la tabla 'empleados'.")
                print("Primero crea empleados desde la pagina de Empleados en el frontend.")
                return

            print(f"Empleados activos encontrados: {len(empleados)}")
            for e in empleados:
                print(f"  - ID: {e.id}, Nombre: {e.nombre} {e.apellido or ''}")

            empleado_ids = [e.id for e in empleados]

            # --- RECLAMOS ---
            print("\n--- RECLAMOS ---")

            # Contar reclamos sin asignar
            result = await db.execute(
                text("""
                    SELECT COUNT(*) as total FROM reclamos
                    WHERE estado IN :estados AND empleado_id IS NULL
                """),
                {"estados": tuple(ESTADOS_AVANZADOS_RECLAMO)}
            )
            count_reclamos = result.scalar()
            print(f"Reclamos en estado avanzado sin empleado asignado: {count_reclamos}")

            if count_reclamos > 0:
                # Asignar empleados aleatoriamente usando UPDATE con CASE
                # Dividir entre todos los empleados de forma equitativa
                for i, emp_id in enumerate(empleado_ids):
                    # Cada empleado recibe ~1/N de los reclamos
                    await db.execute(
                        text("""
                            UPDATE reclamos
                            SET empleado_id = :empleado_id, updated_at = NOW()
                            WHERE estado IN :estados
                            AND empleado_id IS NULL
                            AND id % :total_empleados = :indice
                        """),
                        {
                            "empleado_id": emp_id,
                            "estados": tuple(ESTADOS_AVANZADOS_RECLAMO),
                            "total_empleados": len(empleado_ids),
                            "indice": i
                        }
                    )
                    print(f"  Asignando reclamos (id % {len(empleado_ids)} = {i}) -> Empleado ID: {emp_id}")

            # --- TRAMITES (Solicitudes) ---
            print("\n--- TRAMITES (Solicitudes) ---")

            # Contar tramites sin asignar
            result = await db.execute(
                text("""
                    SELECT COUNT(*) as total FROM solicitudes
                    WHERE estado IN :estados AND empleado_id IS NULL
                """),
                {"estados": tuple(ESTADOS_AVANZADOS_TRAMITE)}
            )
            count_tramites = result.scalar()
            print(f"Tramites en estado avanzado sin empleado asignado: {count_tramites}")

            if count_tramites > 0:
                # Asignar empleados aleatoriamente
                for i, emp_id in enumerate(empleado_ids):
                    await db.execute(
                        text("""
                            UPDATE solicitudes
                            SET empleado_id = :empleado_id, updated_at = NOW()
                            WHERE estado IN :estados
                            AND empleado_id IS NULL
                            AND id % :total_empleados = :indice
                        """),
                        {
                            "empleado_id": emp_id,
                            "estados": tuple(ESTADOS_AVANZADOS_TRAMITE),
                            "total_empleados": len(empleado_ids),
                            "indice": i
                        }
                    )
                    print(f"  Asignando tramites (id % {len(empleado_ids)} = {i}) -> Empleado ID: {emp_id}")

            # Guardar cambios
            await db.commit()

            print(f"\nResumen:")
            print(f"  - Reclamos actualizados: {count_reclamos}")
            print(f"  - Tramites actualizados: {count_tramites}")
            print("Asignacion completada correctamente.")

        except Exception as e:
            await db.rollback()
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(asignar_empleados())
