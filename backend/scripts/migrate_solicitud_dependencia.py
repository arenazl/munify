"""
Migración: Agregar municipio_dependencia_id a solicitudes

Agrega la columna para asignar trámites a dependencias en lugar de empleados.
"""
import asyncio
import sys
import os

# Agregar el directorio backend al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        # Verificar si la columna ya existe
        result = await conn.execute(text("""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'solicitudes'
            AND COLUMN_NAME = 'municipio_dependencia_id'
        """))
        exists = result.scalar_one_or_none()

        if exists:
            print("La columna municipio_dependencia_id ya existe en solicitudes")
        else:
            print("Agregando columna municipio_dependencia_id a solicitudes...")

            # Agregar columna
            await conn.execute(text("""
                ALTER TABLE solicitudes
                ADD COLUMN municipio_dependencia_id INT NULL
            """))
            print("  - Columna agregada")

            # Agregar índice
            await conn.execute(text("""
                CREATE INDEX ix_solicitudes_municipio_dependencia_id
                ON solicitudes(municipio_dependencia_id)
            """))
            print("  - Índice creado")

            # Agregar FK
            await conn.execute(text("""
                ALTER TABLE solicitudes
                ADD CONSTRAINT fk_solicitudes_municipio_dependencia
                FOREIGN KEY (municipio_dependencia_id)
                REFERENCES municipio_dependencias(id)
            """))
            print("  - Foreign key agregada")

            print("Migración completada exitosamente!")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
