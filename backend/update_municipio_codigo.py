"""
Script para actualizar el codigo del municipio de 'demo' a 'chacabuco'
"""
import asyncio
from sqlalchemy import text
from core.database import AsyncSessionLocal

async def update_municipio_codigo():
    async with AsyncSessionLocal() as db:
        print("Actualizando codigo de municipio...")

        result = await db.execute(text("""
            UPDATE municipios
            SET codigo = 'chacabuco', nombre = 'Chacabuco'
            WHERE codigo = 'demo'
        """))

        await db.commit()

        print(f"OK - {result.rowcount} municipio(s) actualizado(s)")
        print("Codigo actualizado: demo -> chacabuco")
        print("Nombre actualizado: Municipalidad Demo -> Chacabuco")

if __name__ == "__main__":
    asyncio.run(update_municipio_codigo())
