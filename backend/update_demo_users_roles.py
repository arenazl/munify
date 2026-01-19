"""
Script para actualizar los roles de los usuarios demo
Orden: Supervisor, Vecino, Empleado (sin Admin)
"""
import asyncio
from sqlalchemy import select, update
from core.database import AsyncSessionLocal
from models.user import User
from models.enums import RolUsuario

async def update_demo_roles():
    async with AsyncSessionLocal() as db:
        # Mapeo de emails a nuevos roles
        # Orden deseado: Supervisor, Vecino, Empleado
        updates = [
            {
                "email": "ana.martinez@demo.com",
                "rol": RolUsuario.SUPERVISOR,
                "nombre": "Ana",
                "apellido": "Martinez"
            },
            {
                "email": "maria.garcia@demo.com",
                "rol": RolUsuario.VECINO,
                "nombre": "Maria",
                "apellido": "Garcia"
            },
            {
                "email": "carlos.lopez@demo.com",
                "rol": RolUsuario.EMPLEADO,
                "nombre": "Carlos",
                "apellido": "Lopez"
            }
        ]

        for user_data in updates:
            result = await db.execute(
                update(User)
                .where(User.email == user_data["email"])
                .values(
                    rol=user_data["rol"],
                    nombre=user_data["nombre"],
                    apellido=user_data["apellido"]
                )
            )
            await db.commit()
            print(f"Actualizado: {user_data['email']} -> {user_data['rol'].value}")

        # Desactivar el usuario admin (roberto.fernandez@demo.com)
        result = await db.execute(
            update(User)
            .where(User.email == "roberto.fernandez@demo.com")
            .values(activo=False)
        )
        await db.commit()
        print("Desactivado: roberto.fernandez@demo.com")

        print("\nUsuarios demo finales:")
        print("1. Ana Martinez - Supervisor")
        print("2. Maria Garcia - Vecino")
        print("3. Carlos Lopez - Empleado")

if __name__ == "__main__":
    asyncio.run(update_demo_roles())
