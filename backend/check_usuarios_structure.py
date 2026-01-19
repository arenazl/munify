"""
Script para verificar la estructura de la tabla usuarios
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def check_structure():
    async with engine.begin() as conn:
        print("Estructura de la tabla usuarios:\n")
        result = await conn.execute(text("DESCRIBE usuarios"))
        for row in result:
            field, type_, null, key, default, extra = row
            print(f"{field:30} {type_:30} NULL={null} KEY={key}")

if __name__ == "__main__":
    asyncio.run(check_structure())
