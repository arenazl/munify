"""
Script para ejecutar el fix de la tabla usuarios
Agrega la columna 'direccion' que falta
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def fix_usuarios_table():
    async with engine.begin() as conn:
        # Lista de columnas a agregar
        columnas = [
            ("direccion", "VARCHAR(255) NULL AFTER dni"),
            ("es_anonimo", "BOOLEAN DEFAULT FALSE AFTER direccion"),
        ]

        for columna, definicion in columnas:
            try:
                print(f"Verificando columna '{columna}'...")
                await conn.execute(text(f"""
                    ALTER TABLE usuarios
                    ADD COLUMN {columna} {definicion}
                """))
                print(f"OK - Columna '{columna}' agregada exitosamente")
            except Exception as e:
                if "Duplicate column name" in str(e):
                    print(f"OK - La columna '{columna}' ya existe")
                else:
                    print(f"ERROR en '{columna}': {e}")
                    raise

if __name__ == "__main__":
    asyncio.run(fix_usuarios_table())
