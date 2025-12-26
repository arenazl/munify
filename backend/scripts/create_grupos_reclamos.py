"""
Script para crear las tablas de agrupación de reclamos similares.
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings


async def main():
    print(">> Iniciando creación de tablas para agrupación de reclamos...")

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        # 1. Crear tabla grupos_reclamos
        print("\n>> Creando tabla grupos_reclamos...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS grupos_reclamos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reclamo_principal_id INT NOT NULL,
                nombre VARCHAR(200) NOT NULL,
                descripcion VARCHAR(500),
                municipio_id INT NOT NULL,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (reclamo_principal_id) REFERENCES reclamos(id) ON DELETE CASCADE,
                FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
                INDEX idx_municipio (municipio_id),
                INDEX idx_activo (activo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        print("[OK] Tabla grupos_reclamos creada")

        # 2. Crear tabla reclamos_agrupados
        print("\n>> Creando tabla reclamos_agrupados...")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS reclamos_agrupados (
                id INT AUTO_INCREMENT PRIMARY KEY,
                grupo_id INT NOT NULL,
                reclamo_id INT NOT NULL,
                es_principal BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (grupo_id) REFERENCES grupos_reclamos(id) ON DELETE CASCADE,
                FOREIGN KEY (reclamo_id) REFERENCES reclamos(id) ON DELETE CASCADE,
                UNIQUE KEY unique_reclamo_grupo (grupo_id, reclamo_id),
                INDEX idx_grupo (grupo_id),
                INDEX idx_reclamo (reclamo_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        print("[OK] Tabla reclamos_agrupados creada")

    print("\n" + "="*60)
    print("> RESUMEN")
    print("="*60)
    print("[OK] Tabla grupos_reclamos creada")
    print("[OK] Tabla reclamos_agrupados creada")
    print("="*60)
    print("\n[OK] Migracion completada con exito!")


if __name__ == "__main__":
    asyncio.run(main())
