"""
Script para agregar la columna es_anonimo a la tabla usuarios
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import engine

async def add_column():
    async with engine.begin() as conn:
        # Verificar si la columna existe
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'es_anonimo'
        """))
        exists = result.fetchone()

        if not exists:
            await conn.execute(text('ALTER TABLE usuarios ADD COLUMN es_anonimo BOOLEAN DEFAULT FALSE'))
            print('Columna es_anonimo agregada exitosamente')
        else:
            print('Columna es_anonimo ya existe')

if __name__ == "__main__":
    asyncio.run(add_column())
