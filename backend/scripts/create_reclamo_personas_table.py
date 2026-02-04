"""
Script para crear la tabla reclamo_personas (tabla intermedia de ReclamoPersona)
"""
import asyncio
import sys
from pathlib import Path

# Agregar backend al path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import Settings

settings = Settings()


async def create_table():
    """Crea la tabla reclamo_personas en la base de datos"""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    try:
        async with engine.begin() as conn:
            # Crear tabla reclamo_personas
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS reclamo_personas (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    reclamo_id INT NOT NULL,
                    usuario_id INT NOT NULL,
                    es_creador_original BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (reclamo_id) REFERENCES reclamos(id) ON DELETE CASCADE,
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                    UNIQUE KEY uq_reclamo_persona (reclamo_id, usuario_id),
                    INDEX idx_reclamo (reclamo_id),
                    INDEX idx_usuario (usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """))
            await conn.commit()
        print("✅ Tabla reclamo_personas creada exitosamente")
    except Exception as e:
        print(f"❌ Error al crear tabla: {e}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_table())
