"""
Script completo para validar y arreglar la tabla usuarios
Verifica todas las columnas del modelo y las agrega si faltan
"""
import asyncio
from sqlalchemy import text
from core.database import engine

async def validate_and_fix_usuarios_table():
    async with engine.begin() as conn:
        # Obtener columnas actuales de la tabla
        print("Verificando estructura de la tabla usuarios...")
        result = await conn.execute(text("DESCRIBE usuarios"))
        columnas_existentes = {row[0] for row in result}
        print(f"Columnas existentes: {sorted(columnas_existentes)}")

        # Definir todas las columnas esperadas según el modelo
        columnas_esperadas = {
            "id": "INT AUTO_INCREMENT PRIMARY KEY",
            "municipio_id": "INT NULL",
            "email": "VARCHAR(255) NOT NULL UNIQUE",
            "password_hash": "VARCHAR(255) NOT NULL",
            "nombre": "VARCHAR(100) NOT NULL",
            "apellido": "VARCHAR(100) NOT NULL",
            "telefono": "VARCHAR(20) NULL",
            "dni": "VARCHAR(20) NULL",
            "direccion": "VARCHAR(255) NULL",
            "es_anonimo": "BOOLEAN DEFAULT FALSE",
            "rol": "ENUM('vecino', 'empleado', 'supervisor', 'admin') DEFAULT 'vecino' NOT NULL",
            "activo": "BOOLEAN DEFAULT TRUE",
            "notificacion_preferencias": "JSON NULL",
            "empleado_id": "INT NULL",
            "created_at": "DATETIME DEFAULT CURRENT_TIMESTAMP",
            "updated_at": "DATETIME NULL ON UPDATE CURRENT_TIMESTAMP",
        }

        # Columnas faltantes
        columnas_faltantes = set(columnas_esperadas.keys()) - columnas_existentes

        if not columnas_faltantes:
            print("\nOK - Todas las columnas estan presentes")
            return

        print(f"\nColumnas faltantes: {sorted(columnas_faltantes)}")
        print("\nAgregando columnas faltantes...")

        # Agregar columnas en orden
        orden_columnas = [
            "direccion",
            "es_anonimo",
            "notificacion_preferencias",
            "empleado_id",
        ]

        for columna in orden_columnas:
            if columna in columnas_faltantes:
                try:
                    print(f"  Agregando columna '{columna}'...")
                    definicion = columnas_esperadas[columna]
                    await conn.execute(text(f"""
                        ALTER TABLE usuarios
                        ADD COLUMN {columna} {definicion}
                    """))
                    print(f"  OK - Columna '{columna}' agregada")
                except Exception as e:
                    if "Duplicate column name" in str(e):
                        print(f"  SKIP - La columna '{columna}' ya existe")
                    else:
                        print(f"  ERROR en '{columna}': {e}")
                        raise

        print("\nValidacion completada!")

if __name__ == "__main__":
    asyncio.run(validate_and_fix_usuarios_table())
