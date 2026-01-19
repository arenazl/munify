"""
Script para verificar usuarios demo
"""
import asyncio
from sqlalchemy import select
from core.database import AsyncSessionLocal
from models.user import User

async def check_users():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email.like('%@demo.com'))
        )
        users = result.scalars().all()

        print(f"Usuarios demo encontrados: {len(users)}\n")
        for user in users:
            print(f"Email: {user.email}")
            print(f"  Nombre: {user.nombre} {user.apellido}")
            print(f"  DNI: {user.dni} (tipo: {type(user.dni).__name__})")
            print(f"  Rol: {user.rol.value}")
            print(f"  Municipio ID: {user.municipio_id}")
            print()

if __name__ == "__main__":
    asyncio.run(check_users())
