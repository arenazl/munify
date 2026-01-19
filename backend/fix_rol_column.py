"""
Script para arreglar la columna rol en la tabla usuarios
El problema es que la columna es muy corta
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def fix_rol_column():
    async with engine.begin() as conn:
        # Ver la definición actual
        print("Verificando columna 'rol'...")
        result = await conn.execute(text("DESCRIBE usuarios"))
        for row in result:
            if row[0] == 'rol':
                print(f"Definicion actual: {row}")

        # Paso 1: Cambiar temporalmente a VARCHAR
        print("\nCambiando columna a VARCHAR...")
        await conn.execute(text("""
            ALTER TABLE usuarios
            MODIFY COLUMN rol VARCHAR(20) NOT NULL
        """))
        print("OK - Columna es VARCHAR ahora")

        # Paso 2: Actualizar valores antiguos
        print("\nActualizando valores 'usuario' a 'vecino'...")
        result = await conn.execute(text("""
            UPDATE usuarios SET rol = 'vecino' WHERE rol = 'usuario'
        """))
        print(f"OK - {result.rowcount} filas actualizadas")

        # Paso 3: Convertir a ENUM con los valores correctos
        print("\nConvirtiendo a ENUM con valores correctos...")
        await conn.execute(text("""
            ALTER TABLE usuarios
            MODIFY COLUMN rol ENUM('vecino', 'empleado', 'supervisor', 'admin')
            DEFAULT 'vecino' NOT NULL
        """))
        print("OK - ENUM creado exitosamente")

        # Verificar el cambio
        print("\nVerificando cambio...")
        result = await conn.execute(text("DESCRIBE usuarios"))
        for row in result:
            if row[0] == 'rol':
                print(f"Nueva definicion: {row}")

if __name__ == "__main__":
    asyncio.run(fix_rol_column())
