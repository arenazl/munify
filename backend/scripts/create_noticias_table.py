import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from core.database import engine

async def create_noticias_table():

    async with engine.begin() as conn:
        # Crear tabla noticias (MySQL syntax)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS noticias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                municipio_id INT NOT NULL,
                titulo VARCHAR(200) NOT NULL,
                descripcion TEXT NOT NULL,
                imagen_url VARCHAR(500),
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
            )
        """))

        # Crear índices (MySQL no soporta IF NOT EXISTS en CREATE INDEX)
        try:
            await conn.execute(text("CREATE INDEX idx_noticias_municipio ON noticias(municipio_id)"))
        except:
            pass  # Índice ya existe

        try:
            await conn.execute(text("CREATE INDEX idx_noticias_activo ON noticias(activo)"))
        except:
            pass  # Índice ya existe

        print("OK - Tabla 'noticias' creada exitosamente")

if __name__ == "__main__":
    asyncio.run(create_noticias_table())
