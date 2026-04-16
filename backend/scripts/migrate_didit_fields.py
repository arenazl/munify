"""Agrega a `usuarios` los campos de KYC Didit (nivel_verificacion y biografia).

Idempotente: chequea antes de agregar cada columna.
"""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings


COLUMNAS = [
    ("nivel_verificacion", "INT NOT NULL DEFAULT 0"),
    ("sexo", "VARCHAR(1) NULL"),
    ("fecha_nacimiento", "DATE NULL"),
    ("nacionalidad", "VARCHAR(10) NULL"),
    ("didit_session_id", "VARCHAR(100) NULL"),
    ("verificado_at", "DATETIME NULL"),
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for nombre, definicion in COLUMNAS:
            existe = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema = DATABASE() "
                    "  AND table_name = 'usuarios' "
                    "  AND column_name = :col"
                ),
                {"col": nombre},
            )
            if existe.scalar() == 0:
                print(f"  + ALTER TABLE usuarios ADD COLUMN {nombre} {definicion}")
                await conn.execute(text(f"ALTER TABLE usuarios ADD COLUMN {nombre} {definicion}"))
            else:
                print(f"  = {nombre} ya existe, salteando")

        # Indice para buscar por didit_session_id rapido (si no existe).
        idx_existe = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema = DATABASE() "
                "  AND table_name = 'usuarios' "
                "  AND index_name = 'ix_usuarios_didit_session_id'"
            )
        )
        if idx_existe.scalar() == 0:
            print("  + CREATE INDEX ix_usuarios_didit_session_id")
            await conn.execute(
                text("CREATE INDEX ix_usuarios_didit_session_id ON usuarios (didit_session_id)")
            )

    await engine.dispose()
    print("OK - migracion Didit completada")


if __name__ == "__main__":
    asyncio.run(main())
