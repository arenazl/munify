"""Agrega columnas de rechazo a documentos_solicitudes."""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


COLUMNAS = [
    ("rechazado_at", "DATETIME NULL"),
    ("motivo_rechazo", "TEXT NULL"),
    ("rechazado_por_id", "INT NULL"),
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for nombre, definicion in COLUMNAS:
            existe = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema = DATABASE() "
                    "  AND table_name = 'documentos_solicitudes' "
                    "  AND column_name = :col"
                ),
                {"col": nombre},
            )
            if existe.scalar() == 0:
                print(f"  + {nombre} {definicion}")
                await conn.execute(
                    text(f"ALTER TABLE documentos_solicitudes ADD COLUMN {nombre} {definicion}")
                )
            else:
                print(f"  = {nombre} ya existe")

        # FK para rechazado_por_id (solo si no existe).
        fk_existe = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.key_column_usage "
                "WHERE table_schema = DATABASE() "
                "  AND table_name = 'documentos_solicitudes' "
                "  AND column_name = 'rechazado_por_id' "
                "  AND referenced_table_name = 'usuarios'"
            )
        )
        if fk_existe.scalar() == 0:
            try:
                await conn.execute(
                    text(
                        "ALTER TABLE documentos_solicitudes "
                        "ADD CONSTRAINT fk_doc_sol_rechazado_por "
                        "FOREIGN KEY (rechazado_por_id) REFERENCES usuarios(id) "
                        "ON DELETE SET NULL"
                    )
                )
                print("  + FK rechazado_por_id -> usuarios(id)")
            except Exception as e:
                print(f"  ! FK no agregada: {e}")

    await engine.dispose()
    print("OK")


if __name__ == "__main__":
    asyncio.run(main())
