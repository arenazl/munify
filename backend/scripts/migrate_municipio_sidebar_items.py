"""Migracion — tabla para que el superadmin oculte items del sidebar por muni.

Guardamos SOLO los items que estan ocultos — si un muni no tiene filas,
ve el sidebar default. Cuando se oculta un item, se inserta una fila.

Ejecutar: python backend/scripts/migrate_municipio_sidebar_items.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


async def _table_exists(conn, table: str) -> bool:
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
    ), {"t": table})
    return (r.scalar() or 0) > 0


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        if await _table_exists(conn, "municipio_sidebar_items"):
            print("SKIP tabla ya existe")
        else:
            await conn.execute(text("""
                CREATE TABLE municipio_sidebar_items (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    municipio_id    INT          NOT NULL,
                    href            VARCHAR(200) NOT NULL,
                    oculto          BOOLEAN      NOT NULL DEFAULT TRUE,
                    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INT       NULL,
                    UNIQUE KEY uq_msi_muni_href (municipio_id, href),
                    INDEX ix_msi_muni (municipio_id),
                    CONSTRAINT fk_msi_muni FOREIGN KEY (municipio_id)
                        REFERENCES municipios(id) ON DELETE CASCADE,
                    CONSTRAINT fk_msi_user FOREIGN KEY (updated_by_user_id)
                        REFERENCES usuarios(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """))
            print("OK  tabla municipio_sidebar_items creada")
    await engine.dispose()
    print("\nMigracion completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
