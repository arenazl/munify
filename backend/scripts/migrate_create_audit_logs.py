"""
Crea la tabla audit_logs + índices en MySQL/Aiven.

Idempotente: si la tabla ya existe, no falla.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    usuario_id INT NULL,
    usuario_email VARCHAR(200) NULL,
    usuario_rol VARCHAR(20) NULL,
    municipio_id INT NULL,

    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    status_code INT NOT NULL,
    duracion_ms INT NOT NULL,

    action VARCHAR(100) NULL,
    entity_type VARCHAR(50) NULL,
    entity_id INT NULL,

    query_params JSON NULL,
    request_body JSON NULL,
    response_summary JSON NULL,
    error_message TEXT NULL,

    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,

    INDEX ix_audit_created_at (created_at),
    INDEX ix_audit_usuario_id (usuario_id),
    INDEX ix_audit_municipio_id (municipio_id),
    INDEX ix_audit_path (path),
    INDEX ix_audit_status_code (status_code),
    INDEX ix_audit_duracion_ms (duracion_ms),
    INDEX ix_audit_action (action),

    INDEX ix_audit_muni_created (municipio_id, created_at),
    INDEX ix_audit_action_created (action, created_at),
    INDEX ix_audit_status_created (status_code, created_at),

    CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TABLE_SQL))
        # Verificar que existe
        r = await conn.execute(
            text("SELECT COUNT(*) FROM information_schema.tables "
                 "WHERE table_schema = DATABASE() AND table_name = 'audit_logs'")
        )
        exists = r.scalar()
        print(f"audit_logs creada/verificada: {'OK' if exists else 'FAIL'}", flush=True)

        # Verificar índices
        r = await conn.execute(
            text("SELECT INDEX_NAME FROM information_schema.statistics "
                 "WHERE table_schema = DATABASE() AND table_name = 'audit_logs' "
                 "GROUP BY INDEX_NAME")
        )
        indexes = [row[0] for row in r.fetchall()]
        print(f"Índices: {indexes}", flush=True)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
