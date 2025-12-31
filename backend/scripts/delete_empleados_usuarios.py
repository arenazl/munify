"""
Script para eliminar todos los usuarios con rol 'empleado' de la tabla usuarios.
Primero desvincula las relaciones (solicitudes, etc) y luego elimina.

Ejecutar: python -m scripts.delete_empleados_usuarios
"""
import sys
import os
import asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete, update, text
from core.database import AsyncSessionLocal
from models.user import User
from models.enums import RolUsuario

async def delete_empleados_usuarios():
    async with AsyncSessionLocal() as db:
        try:
            # Contar usuarios empleados antes de eliminar
            result = await db.execute(
                select(User).where(User.rol == RolUsuario.EMPLEADO)
            )
            usuarios = result.scalars().all()
            count_before = len(usuarios)
            user_ids = [u.id for u in usuarios]

            print(f"Usuarios con rol 'empleado' encontrados: {count_before}")

            if count_before == 0:
                print("No hay usuarios empleados para eliminar.")
                return

            # Mostrar lista de usuarios a eliminar
            print("\nUsuarios a eliminar:")
            for u in usuarios:
                print(f"  - ID: {u.id}, Email: {u.email}, Nombre: {u.nombre} {u.apellido}")

            # Confirmar
            confirm = input(f"\nEliminar {count_before} usuarios empleados? (s/N): ")
            if confirm.lower() != 's':
                print("Operacion cancelada.")
                return

            # Desvincular solicitudes (poner solicitante_id en NULL)
            print("\nDesvinculando solicitudes...")
            await db.execute(
                text("UPDATE solicitudes SET solicitante_id = NULL WHERE solicitante_id IN :ids"),
                {"ids": tuple(user_ids)}
            )

            # Desvincular reclamos creados (poner creador_id en NULL)
            print("Desvinculando reclamos...")
            await db.execute(
                text("UPDATE reclamos SET creador_id = NULL WHERE creador_id IN :ids"),
                {"ids": tuple(user_ids)}
            )

            # Eliminar notificaciones
            print("Eliminando notificaciones...")
            await db.execute(
                text("DELETE FROM notificaciones WHERE usuario_id IN :ids"),
                {"ids": tuple(user_ids)}
            )

            # Eliminar push subscriptions
            print("Eliminando push subscriptions...")
            await db.execute(
                text("DELETE FROM push_subscriptions WHERE user_id IN :ids"),
                {"ids": tuple(user_ids)}
            )

            # Ahora eliminar usuarios con rol empleado
            print("Eliminando usuarios empleados...")
            await db.execute(
                delete(User).where(User.rol == RolUsuario.EMPLEADO)
            )
            await db.commit()

            print(f"\n{count_before} usuarios empleados eliminados correctamente.")

        except Exception as e:
            await db.rollback()
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            raise

if __name__ == "__main__":
    asyncio.run(delete_empleados_usuarios())
