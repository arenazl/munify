"""Crea la tabla pago_sesiones para el gateway PayBridge."""
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings
from core.database import Base
from models.pago_sesion import PagoSesion  # noqa: F401


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        r = await conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = DATABASE() AND table_name = 'pago_sesiones'"
            )
        )
        if r.scalar() > 0:
            print("OK - pago_sesiones ya existe")
        else:
            print("Creando pago_sesiones...")
            await conn.run_sync(Base.metadata.create_all)
            print("OK - pago_sesiones creada")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
