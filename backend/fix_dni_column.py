"""
Script para arreglar la columna dni - cambiar de INT a VARCHAR
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def fix_dni_column():
    async with engine.begin() as conn:
        print("Cambiando columna 'dni' de INT a VARCHAR(20)...")

        try:
            await conn.execute(text("""
                ALTER TABLE usuarios
                MODIFY COLUMN dni VARCHAR(20) NULL
            """))
            print("OK - Columna 'dni' actualizada a VARCHAR(20)")
        except Exception as e:
            print(f"ERROR: {e}")
            raise

        # Verificar el cambio
        print("\nVerificando cambio...")
        result = await conn.execute(text("DESCRIBE usuarios"))
        for row in result:
            if row[0] == 'dni':
                print(f"Nueva definicion: {row}")

if __name__ == "__main__":
    asyncio.run(fix_dni_column())
