"""
Script para eliminar usuarios demo existentes
"""
import asyncio
from sqlalchemy import select, delete
from core.database import AsyncSessionLocal
from models.user import User

async def delete_demo_users():
    async with AsyncSessionLocal() as db:
        # Eliminar usuarios con email @demo.com
        result = await db.execute(
            delete(User).where(User.email.like('%@demo.com'))
        )
        await db.commit()
        print(f"Eliminados {result.rowcount} usuarios demo")

if __name__ == "__main__":
    asyncio.run(delete_demo_users())
