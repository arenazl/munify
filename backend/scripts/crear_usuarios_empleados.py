"""
Script para crear usuarios con rol 'empleado' para cada empleado de la tabla empleados.
Esto permite que aparezcan en el modo demo de la landing page.

Ejecutar: python -m scripts.crear_usuarios_empleados
"""
import sys
import os
import asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, text
from core.database import AsyncSessionLocal
from models.empleado import Empleado
from models.user import User
from models.enums import RolUsuario
from core.security import get_password_hash


def generar_email(nombre: str, apellido: str, codigo_municipio: str) -> str:
    """Genera un email para el empleado basado en su nombre"""
    nombre_clean = nombre.lower().replace(' ', '.').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n')
    apellido_clean = (apellido or '').lower().replace(' ', '.').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n')
    if apellido_clean:
        return f"{nombre_clean}.{apellido_clean}@{codigo_municipio}.test.com"
    return f"{nombre_clean}@{codigo_municipio}.test.com"


async def crear_usuarios_empleados():
    async with AsyncSessionLocal() as db:
        try:
            # Obtener todos los empleados activos con su municipio
            result = await db.execute(
                text("""
                    SELECT e.id, e.nombre, e.apellido, e.telefono, e.municipio_id, m.codigo
                    FROM empleados e
                    JOIN municipios m ON e.municipio_id = m.id
                    WHERE e.activo = 1
                """)
            )
            empleados = result.fetchall()

            if not empleados:
                print("No hay empleados activos.")
                return

            print(f"Empleados activos encontrados: {len(empleados)}")

            # Password por defecto para todos los usuarios de prueba
            password_hash = get_password_hash("123456")

            usuarios_creados = 0
            usuarios_existentes = 0

            for emp in empleados:
                emp_id = emp.id
                nombre = emp.nombre
                apellido = emp.apellido or ''
                telefono = emp.telefono
                municipio_id = emp.municipio_id
                codigo_municipio = emp.codigo

                # Generar email
                email = generar_email(nombre, apellido, codigo_municipio)

                # Verificar si ya existe un usuario con ese email
                result = await db.execute(
                    select(User).where(User.email == email)
                )
                existing_user = result.scalar_one_or_none()

                if existing_user:
                    print(f"  Usuario ya existe: {email}")
                    # Actualizar la relacion empleado_id si no esta
                    if existing_user.empleado_id != emp_id:
                        existing_user.empleado_id = emp_id
                        print(f"    -> Vinculado a empleado #{emp_id}")
                    usuarios_existentes += 1
                    continue

                # Crear nuevo usuario
                new_user = User(
                    email=email,
                    password_hash=password_hash,
                    nombre=nombre,
                    apellido=apellido,
                    telefono=telefono,
                    rol=RolUsuario.EMPLEADO,
                    municipio_id=municipio_id,
                    empleado_id=emp_id,
                    activo=True
                )
                db.add(new_user)
                print(f"  + Creando usuario: {email} (Empleado: {nombre} {apellido})")
                usuarios_creados += 1

            await db.commit()

            print(f"\nResumen:")
            print(f"  - Usuarios creados: {usuarios_creados}")
            print(f"  - Usuarios existentes: {usuarios_existentes}")
            print("Proceso completado.")

        except Exception as e:
            await db.rollback()
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            raise


if __name__ == "__main__":
    asyncio.run(crear_usuarios_empleados())
