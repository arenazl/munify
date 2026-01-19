"""
Script para verificar el ID del municipio Merlo
"""
import asyncio
from sqlalchemy import select
from core.database import AsyncSessionLocal
from models.municipio import Municipio

async def check_municipio():
    async with AsyncSessionLocal() as db:
        # Buscar municipio Merlo
        result = await db.execute(
            select(Municipio).where(Municipio.codigo == 'merlo')
        )
        municipio = result.scalar_one_or_none()

        if municipio:
            print(f"Municipio encontrado:")
            print(f"  ID: {municipio.id}")
            print(f"  Nombre: {municipio.nombre}")
            print(f"  Codigo: {municipio.codigo}")
            print(f"  Activo: {municipio.activo}")
        else:
            print("ERROR: No se encontro el municipio con codigo 'merlo'")

if __name__ == "__main__":
    asyncio.run(check_municipio())
