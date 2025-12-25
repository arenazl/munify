"""
Script para agregar columna municipio_id a sla_config
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import engine

async def fix_sla_table():
    async with engine.begin() as conn:
        try:
            # Primero verificar si la columna existe
            result = await conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'sla_config'
                AND COLUMN_NAME = 'municipio_id'
            """))
            count = result.scalar()

            if count == 0:
                print("Agregando columna municipio_id a sla_config...")
                await conn.execute(text("""
                    ALTER TABLE sla_config
                    ADD COLUMN municipio_id INT NOT NULL DEFAULT 1
                """))
                print("[OK] Columna agregada")

                # Agregar FK
                try:
                    await conn.execute(text("""
                        ALTER TABLE sla_config
                        ADD CONSTRAINT fk_sla_config_municipio
                        FOREIGN KEY (municipio_id) REFERENCES municipios(id)
                    """))
                    print("[OK] FK agregada")
                except Exception as e:
                    print(f"[WARN] FK ya existe o error: {e}")

                # Agregar indice
                try:
                    await conn.execute(text("""
                        CREATE INDEX ix_sla_config_municipio_id ON sla_config(municipio_id)
                    """))
                    print("[OK] Indice agregado")
                except Exception as e:
                    print(f"[WARN] Indice ya existe: {e}")
            else:
                print("[OK] Columna municipio_id ya existe en sla_config")

        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(fix_sla_table())
