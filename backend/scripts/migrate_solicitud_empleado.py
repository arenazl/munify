"""Agrega solicitudes.empleado_id (FK a empleados)."""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        existe = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = DATABASE() "
                "  AND table_name = 'solicitudes' "
                "  AND column_name = 'empleado_id'"
            )
        )
        if existe.scalar() == 0:
            print("  + ALTER TABLE solicitudes ADD COLUMN empleado_id INT NULL")
            await conn.execute(text("ALTER TABLE solicitudes ADD COLUMN empleado_id INT NULL"))
        else:
            print("  = empleado_id ya existe")

        idx_existe = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema = DATABASE() "
                "  AND table_name = 'solicitudes' "
                "  AND index_name = 'ix_solicitudes_empleado_id'"
            )
        )
        if idx_existe.scalar() == 0:
            print("  + CREATE INDEX ix_solicitudes_empleado_id")
            await conn.execute(text("CREATE INDEX ix_solicitudes_empleado_id ON solicitudes (empleado_id)"))

        fk_existe = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.key_column_usage "
                "WHERE table_schema = DATABASE() "
                "  AND table_name = 'solicitudes' "
                "  AND column_name = 'empleado_id' "
                "  AND referenced_table_name = 'empleados'"
            )
        )
        if fk_existe.scalar() == 0:
            try:
                await conn.execute(
                    text(
                        "ALTER TABLE solicitudes "
                        "ADD CONSTRAINT fk_solicitudes_empleado "
                        "FOREIGN KEY (empleado_id) REFERENCES empleados(id) "
                        "ON DELETE SET NULL"
                    )
                )
                print("  + FK empleado_id -> empleados(id)")
            except Exception as e:
                print(f"  ! FK no agregada: {e}")

    await engine.dispose()
    print("OK")


if __name__ == "__main__":
    asyncio.run(main())
