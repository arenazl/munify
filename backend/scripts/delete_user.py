"""Script para eliminar un usuario por email"""
import asyncio
import sys
import os

# Agregar el directorio padre al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def delete_user(email: str):
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        # Buscar el usuario (tabla usuarios)
        result = await conn.execute(
            text("SELECT id, email, nombre, apellido, rol FROM usuarios WHERE email = :email"),
            {"email": email}
        )
        user = result.fetchone()

        if not user:
            print(f"Usuario con email {email} no encontrado")
            return

        user_id = user[0]
        print(f"Usuario encontrado: ID={user_id}, {user[2]} {user[3]}, rol={user[4]}")

        # Eliminar registros relacionados
        await conn.execute(text("DELETE FROM push_subscriptions WHERE user_id = :id"), {"id": user_id})
        await conn.execute(text("DELETE FROM notificaciones WHERE user_id = :id"), {"id": user_id})

        # Eliminar el usuario
        await conn.execute(text("DELETE FROM usuarios WHERE id = :id"), {"id": user_id})
        print(f"Usuario {email} eliminado exitosamente")

    await engine.dispose()

if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "arenazl@gmail.com"
    asyncio.run(delete_user(email))
