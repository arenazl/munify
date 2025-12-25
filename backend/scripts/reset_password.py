"""
Script para resetear la contraseña de un usuario
Uso: python -m scripts.reset_password EMAIL PASSWORD
"""
import asyncio
import sys
from sqlalchemy import select, text
from core.database import engine
from core.security import get_password_hash
from models.user import User

async def reset_password(email: str, new_password: str):
    async with engine.begin() as conn:
        try:
            # Verificar si el usuario existe
            result = await conn.execute(
                text("SELECT id, nombre FROM usuarios WHERE email = :email"),
                {"email": email}
            )
            row = result.fetchone()

            if not row:
                print(f"ERROR: Usuario con email {email} no encontrado")
                return

            user_id, nombre = row
            print(f"Usuario encontrado: {nombre} (ID: {user_id})")

            # Actualizar contraseña
            password_hash = get_password_hash(new_password)
            await conn.execute(
                text("UPDATE usuarios SET password_hash = :hash WHERE id = :id"),
                {"hash": password_hash, "id": user_id}
            )

            print(f"OK: Contraseña actualizada para {email}")
            print(f"Nueva contraseña: {new_password}")

        except Exception as e:
            print(f"ERROR: {e}")
            raise

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python -m scripts.reset_password EMAIL PASSWORD")
        print("Ejemplo: python -m scripts.reset_password user@example.com newpass123")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]
    asyncio.run(reset_password(email, password))
