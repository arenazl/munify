"""
Script para crear usuarios demo
- Maria Garcia (Vecino)
- Carlos Lopez (Empleado)
- Ana Martinez (Supervisor)
"""
import asyncio
from sqlalchemy import text, select
from core.database import engine, AsyncSessionLocal
from core.security import get_password_hash
from models.user import User
from models.enums import RolUsuario
from models.municipio import Municipio

async def create_demo_users():
    async with AsyncSessionLocal() as db:
        # Buscar municipio (asumiendo que hay al menos uno)
        result = await db.execute(select(Municipio).limit(1))
        municipio = result.scalar_one_or_none()

        if not municipio:
            print("ERROR: No hay municipios en la base de datos")
            print("Creando municipio de ejemplo...")
            municipio = Municipio(
                nombre="Municipalidad Demo",
                codigo="demo",
                latitud=-34.603722,
                longitud=-58.381592,
                activo=True
            )
            db.add(municipio)
            await db.commit()
            await db.refresh(municipio)
            print(f"Municipio creado: {municipio.nombre} (ID: {municipio.id})")

        municipio_id = municipio.id
        print(f"\nUsando municipio: {municipio.nombre} (ID: {municipio_id})\n")

        # Usuarios demo a crear
        usuarios_demo = [
            {
                "email": "maria.garcia@demo.com",
                "password": "demo123",
                "nombre": "Maria",
                "apellido": "Garcia",
                "telefono": "+54 11 1234-5678",
                "dni": "12345678",
                "rol": RolUsuario.VECINO,
                "descripcion": "Vecino - Crea reclamos, hace tramites y sigue el estado"
            },
            {
                "email": "carlos.lopez@demo.com",
                "password": "demo123",
                "nombre": "Carlos",
                "apellido": "Lopez",
                "telefono": "+54 11 2345-6789",
                "dni": "23456789",
                "rol": RolUsuario.EMPLEADO,
                "descripcion": "Empleado - Resuelve trabajos en campo con la app movil"
            },
            {
                "email": "ana.martinez@demo.com",
                "password": "demo123",
                "nombre": "Ana",
                "apellido": "Martinez",
                "telefono": "+54 11 3456-7890",
                "dni": "34567890",
                "rol": RolUsuario.SUPERVISOR,
                "descripcion": "Supervisor - Coordina equipos y monitorea metricas"
            }
        ]

        for user_data in usuarios_demo:
            # Verificar si ya existe
            result = await db.execute(
                select(User).where(User.email == user_data["email"])
            )
            existing_user = result.scalar_one_or_none()

            if existing_user:
                print(f"SKIP - Usuario ya existe: {user_data['email']}")
                continue

            # Crear usuario
            descripcion = user_data.pop("descripcion")
            password = user_data.pop("password")

            user = User(
                **user_data,
                password_hash=get_password_hash(password),
                municipio_id=municipio_id,
                activo=True,
                es_anonimo=False
            )

            db.add(user)
            await db.commit()
            await db.refresh(user)

            print(f"OK - Usuario creado: {user.nombre} {user.apellido}")
            print(f"  Email: {user.email}")
            print(f"  Password: demo123")
            print(f"  Rol: {user.rol.value}")
            print(f"  Descripcion: {descripcion}")
            print()

        print("\n=== USUARIOS DEMO CREADOS ===")
        print("\nPuedes usar estos usuarios para login:")
        print("\n1. VECINO:")
        print("   Email: maria.garcia@demo.com")
        print("   Password: demo123")
        print("   Funciones: Crear reclamos, hacer tramites y ver estado")
        print("\n2. EMPLEADO:")
        print("   Email: carlos.lopez@demo.com")
        print("   Password: demo123")
        print("   Funciones: Tablero de tareas, actualizar estados, subir fotos")
        print("\n3. SUPERVISOR:")
        print("   Email: ana.martinez@demo.com")
        print("   Password: demo123")
        print("   Funciones: Asignar trabajos, ver reportes, gestionar equipos")

if __name__ == "__main__":
    asyncio.run(create_demo_users())
