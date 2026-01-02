"""
Script para:
1. Agregar columna 'tipo' a la tabla empleados si no existe
2. Llenar el campo tipo='operario' para empleados existentes
3. Crear usuarios de prueba de ambos tipos (operario y administrativo)
"""
import asyncio
import sys
import os

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings
from core.security import get_password_hash

async def main():
    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        try:
            # 1. Agregar columna tipo si no existe
            print("\n=== Verificando/agregando columna 'tipo' ===")
            try:
                await db.execute(text("""
                    ALTER TABLE empleados
                    ADD COLUMN tipo VARCHAR(20) DEFAULT 'operario' NOT NULL
                """))
                await db.commit()
                print("✓ Columna 'tipo' agregada")
            except Exception as e:
                if "Duplicate column" in str(e) or "already exists" in str(e):
                    print("✓ Columna 'tipo' ya existe")
                    await db.rollback()
                else:
                    print(f"Error agregando columna: {e}")
                    await db.rollback()

            # 2. Actualizar empleados existentes a 'operario'
            print("\n=== Actualizando empleados existentes a 'operario' ===")
            result = await db.execute(text("""
                UPDATE empleados SET tipo = 'operario' WHERE tipo IS NULL OR tipo = ''
            """))
            await db.commit()
            print(f"✓ Empleados actualizados: {result.rowcount}")

            # 3. Obtener municipio de Merlo para crear usuarios de prueba
            print("\n=== Buscando municipio de Merlo ===")
            result = await db.execute(text("""
                SELECT id FROM municipios WHERE nombre LIKE '%Merlo%' LIMIT 1
            """))
            municipio = result.fetchone()

            if not municipio:
                print("✗ No se encontró municipio de Merlo")
                return

            municipio_id = municipio[0]
            print(f"✓ Municipio encontrado: ID {municipio_id}")

            # 4. Crear empleado operario de prueba
            print("\n=== Creando empleado OPERARIO de prueba ===")
            email_operario = "operario@test.com"

            # Verificar si ya existe
            result = await db.execute(text(f"""
                SELECT id FROM users WHERE email = '{email_operario}'
            """))
            if result.fetchone():
                print(f"✓ Usuario {email_operario} ya existe")
            else:
                # Crear empleado
                await db.execute(text(f"""
                    INSERT INTO empleados (nombre, apellido, tipo, capacidad_maxima, activo, municipio_id)
                    VALUES ('Carlos', 'Operario', 'operario', 10, 1, {municipio_id})
                """))
                await db.commit()

                # Obtener ID del empleado
                result = await db.execute(text("""
                    SELECT id FROM empleados WHERE nombre = 'Carlos' AND apellido = 'Operario' ORDER BY id DESC LIMIT 1
                """))
                empleado_id = result.fetchone()[0]

                # Crear usuario
                password_hash = get_password_hash("test123")
                await db.execute(text(f"""
                    INSERT INTO users (email, hashed_password, nombre, apellido, rol, municipio_id, activo, empleado_id)
                    VALUES ('{email_operario}', '{password_hash}', 'Carlos', 'Operario', 'empleado', {municipio_id}, 1, {empleado_id})
                """))
                await db.commit()
                print(f"✓ Usuario {email_operario} creado (password: test123)")

            # 5. Crear empleado administrativo de prueba
            print("\n=== Creando empleado ADMINISTRATIVO de prueba ===")
            email_admin = "administrativo@test.com"

            # Verificar si ya existe
            result = await db.execute(text(f"""
                SELECT id FROM users WHERE email = '{email_admin}'
            """))
            if result.fetchone():
                print(f"✓ Usuario {email_admin} ya existe")
            else:
                # Crear empleado
                await db.execute(text(f"""
                    INSERT INTO empleados (nombre, apellido, tipo, capacidad_maxima, activo, municipio_id)
                    VALUES ('Maria', 'Administrativa', 'administrativo', 10, 1, {municipio_id})
                """))
                await db.commit()

                # Obtener ID del empleado
                result = await db.execute(text("""
                    SELECT id FROM empleados WHERE nombre = 'Maria' AND apellido = 'Administrativa' ORDER BY id DESC LIMIT 1
                """))
                empleado_id = result.fetchone()[0]

                # Crear usuario
                password_hash = get_password_hash("test123")
                await db.execute(text(f"""
                    INSERT INTO users (email, hashed_password, nombre, apellido, rol, municipio_id, activo, empleado_id)
                    VALUES ('{email_admin}', '{password_hash}', 'Maria', 'Administrativa', 'empleado', {municipio_id}, 1, {empleado_id})
                """))
                await db.commit()
                print(f"✓ Usuario {email_admin} creado (password: test123)")

            # 6. Mostrar resumen
            print("\n=== RESUMEN ===")
            result = await db.execute(text("""
                SELECT tipo, COUNT(*) as cantidad FROM empleados GROUP BY tipo
            """))
            for row in result.fetchall():
                print(f"  - {row[0]}: {row[1]} empleados")

            print("\n=== USUARIOS DE PRUEBA ===")
            print("  Operario: operario@test.com / test123")
            print("  Administrativo: administrativo@test.com / test123")
            print("\n✓ Script completado exitosamente")

        except Exception as e:
            print(f"\n✗ Error: {e}")
            await db.rollback()
            raise

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
