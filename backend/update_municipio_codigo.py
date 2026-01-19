"""
Script para actualizar el codigo del municipio de 'demo' a 'merlo'
"""
import asyncio
from sqlalchemy import text
from core.database import AsyncSessionLocal

async def update_municipio_codigo():
    async with AsyncSessionLocal() as db:
        print("Actualizando codigo de municipio...")

        result = await db.execute(text("""
            UPDATE municipios
            SET codigo = 'merlo', nombre = 'Merlo'
            WHERE codigo = 'demo'
        """))

        await db.commit()

        print(f"OK - {result.rowcount} municipio(s) actualizado(s)")
        print("Codigo actualizado: demo -> merlo")
        print("Nombre actualizado: Municipalidad Demo -> Merlo")

if __name__ == "__main__":
    asyncio.run(update_municipio_codigo())
