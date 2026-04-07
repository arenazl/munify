import asyncio
from core.database import AsyncSessionLocal
from sqlalchemy import select
from models.municipio import Municipio
from models.user import User
from models.enums import RolUsuario
from core.security import get_password_hash

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Municipio))
        municipios = result.scalars().all()
        
        for muni in municipios:
            # Check if admin exists
            email_admin = f"admin@{muni.codigo}.demo.com"
            res_admin = await db.execute(select(User).where(User.email == email_admin))
            if not res_admin.scalar_one_or_none():
                db.add(User(
                    email=email_admin,
                    nombre="Admin",
                    apellido="Demo",
                    password_hash=get_password_hash("123456"),
                    rol=RolUsuario.ADMIN,
                    municipio_id=muni.id,
                    activo=True
                ))
            
            # Check if vecino exists
            email_vecino = f"vecino@{muni.codigo}.demo.com"
            res_vecino = await db.execute(select(User).where(User.email == email_vecino))
            if not res_vecino.scalar_one_or_none():
                db.add(User(
                    email=email_vecino,
                    nombre="Vecino",
                    apellido="Demo",
                    password_hash=get_password_hash("123456"),
                    rol=RolUsuario.VECINO,
                    municipio_id=muni.id,
                    activo=True
                ))
        
        await db.commit()
        print("Usuarios creados exitosamente")

asyncio.run(main())
