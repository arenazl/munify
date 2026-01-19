"""
Script para crear el 4to usuario demo - Empleado Administrativo
"""
import asyncio
from sqlalchemy import select, update
from core.database import AsyncSessionLocal
from models.user import User
from models.enums import RolUsuario

async def create_admin_employee():
    async with AsyncSessionLocal() as db:
        # Actualizar Roberto Fernandez a empleado administrativo
        result = await db.execute(
            select(User).where(User.email == "roberto.fernandez@demo.com")
        )
        user = result.scalar_one_or_none()

        if user:
            # Actualizar a empleado y activar
            user.rol = RolUsuario.EMPLEADO
            user.activo = True
            user.nombre = "Roberto"
            user.apellido = "Fernandez"
            await db.commit()
            print("OK - Roberto Fernandez actualizado a Empleado Administrativo")
            print(f"  Email: {user.email}")
            print(f"  Rol: {user.rol.value}")
            print(f"  Activo: {user.activo}")
        else:
            print("ERROR - Usuario roberto.fernandez@demo.com no encontrado")

        print("\n=== USUARIOS DEMO FINALES ===")
        print("1. Ana Martinez - Supervisor")
        print("2. Maria Garcia - Vecino")
        print("3. Carlos Lopez - Empleado (Tecnico)")
        print("4. Roberto Fernandez - Empleado (Administrativo)")

if __name__ == "__main__":
    asyncio.run(create_admin_employee())
