"""Crea la tabla tarjetas_credito (Tesoreria). Idempotente. Ejecutar desde backend/."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tarjetas_credito (
              id            INT          NOT NULL AUTO_INCREMENT,
              municipio_id  INT          NOT NULL,
              denominacion  VARCHAR(100) NOT NULL,
              marca         VARCHAR(30)  NOT NULL DEFAULT 'Visa',
              ultimos_4     VARCHAR(4)   NULL,
              dia_cierre    INT          NULL,
              color         VARCHAR(20)  NULL,
              icono         VARCHAR(60)  NULL,
              orden         INT          NOT NULL DEFAULT 0,
              activo        TINYINT(1)   NOT NULL DEFAULT 1,
              created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              updated_at    DATETIME(6)  NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (id),
              KEY idx_tarjeta_muni (municipio_id),
              CONSTRAINT fk_tarjeta_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id)
            )
        """))
    await engine.dispose()
    print("tabla tarjetas_credito: OK")


if __name__ == "__main__":
    asyncio.run(migrate())
