"""
Script para agregar la columna es_anonimo a la tabla usuarios
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def migrate():
    async with engine.begin() as conn:
        try:
            # Verificar si la columna ya existe
            result = await conn.execute(text("""
                SELECT COUNT(*) as count
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'usuarios'
                AND COLUMN_NAME = 'es_anonimo'
            """))
            row = result.fetchone()

            if row[0] == 0:
                # Agregar columna
                await conn.execute(text("""
                    ALTER TABLE usuarios ADD COLUMN es_anonimo BOOLEAN DEFAULT FALSE;
                """))
                print("OK: Columna es_anonimo agregada a usuarios")
            else:
                print("INFO: Columna es_anonimo ya existe")

            # Actualizar usuarios existentes que tengan NULL
            await conn.execute(text("""
                UPDATE usuarios SET es_anonimo = FALSE WHERE es_anonimo IS NULL;
            """))

            print("OK: Migracion completada")
        except Exception as e:
            print(f"ERROR: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(migrate())
