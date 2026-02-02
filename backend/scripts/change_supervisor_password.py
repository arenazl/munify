"""
Cambiar contraseña del usuario supervisor arenazl@gmail.com
"""
import asyncio
from sqlalchemy import select
from core.database import AsyncSessionLocal
from models.user import User
from core.security import get_password_hash

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == 'arenazl@gmail.com')
        )
        user = result.scalar_one_or_none()

        if not user:
            print("Usuario no encontrado")
            return

        # Cambiar contraseña a 'supervisor123'
        user.password_hash = get_password_hash('supervisor123')
        await db.commit()

        print(f"Contraseña actualizada para {user.email}")
        print(f"Nueva contraseña: supervisor123")

if __name__ == "__main__":
    asyncio.run(main())
