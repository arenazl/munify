"""
Script para ejecutar el fix de la tabla usuarios
Agrega la columna 'direccion' que falta
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def fix_usuarios_table():
    async with engine.begin() as conn:
        try:
            print("Agregando columna 'direccion' a la tabla usuarios...")
            await conn.execute(text("""
                ALTER TABLE usuarios
                ADD COLUMN direccion VARCHAR(255) NULL AFTER dni
            """))
            print("OK - Columna 'direccion' agregada exitosamente")
        except Exception as e:
            if "Duplicate column name" in str(e):
                print("OK - La columna 'direccion' ya existe")
            else:
                print(f"ERROR: {e}")
                raise

if __name__ == "__main__":
    asyncio.run(fix_usuarios_table())
