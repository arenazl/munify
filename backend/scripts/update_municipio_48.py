"""
Script para actualizar las tablas intermedias reemplazando municipio_id 1 por 48 (Merlo)
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.config import settings


async def update_municipio():
    engine = create_async_engine(settings.DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        # Verificar tablas existentes
        result = await conn.execute(text("SHOW TABLES LIKE '%municipio%'"))
        tables = result.fetchall()
        table_names = [t[0] for t in tables]
        print(f"\nTablas con 'municipio' en el nombre: {table_names}")

        # Actualizar municipio_tipos_tramites
        if 'municipio_tipos_tramites' in table_names:
            print("\n=== Actualizando municipio_tipos_tramites ===")
            result = await conn.execute(text("SELECT COUNT(*) FROM municipio_tipos_tramites WHERE municipio_id = 1"))
            count_before = result.scalar()
            print(f"Registros con municipio_id=1 antes: {count_before}")

            await conn.execute(text("UPDATE municipio_tipos_tramites SET municipio_id = 48 WHERE municipio_id = 1"))

            result = await conn.execute(text("SELECT COUNT(*) FROM municipio_tipos_tramites WHERE municipio_id = 48"))
            count_after = result.scalar()
            print(f"Registros con municipio_id=48 después: {count_after}")

        # Actualizar municipio_tramites
        if 'municipio_tramites' in table_names:
            print("\n=== Actualizando municipio_tramites ===")
            result = await conn.execute(text("SELECT COUNT(*) FROM municipio_tramites WHERE municipio_id = 1"))
            count_before = result.scalar()
            print(f"Registros con municipio_id=1 antes: {count_before}")

            await conn.execute(text("UPDATE municipio_tramites SET municipio_id = 48 WHERE municipio_id = 1"))

            result = await conn.execute(text("SELECT COUNT(*) FROM municipio_tramites WHERE municipio_id = 48"))
            count_after = result.scalar()
            print(f"Registros con municipio_id=48 después: {count_after}")

        print("\n[OK] Actualizacion completada!")


if __name__ == "__main__":
    asyncio.run(update_municipio())
