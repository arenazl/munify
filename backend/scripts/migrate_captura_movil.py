"""Crea la tabla captura_movil_sesiones para el handoff PC ↔ celular."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings


SQL = """
CREATE TABLE IF NOT EXISTS captura_movil_sesiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    handoff_token VARCHAR(64) NOT NULL UNIQUE,
    operador_user_id INT NOT NULL,
    municipio_id INT NULL,
    vecino_user_id INT NULL,
    vecino_dni VARCHAR(20) NULL,
    modo ENUM('kyc_completo') NOT NULL DEFAULT 'kyc_completo',
    estado ENUM('esperando','en_curso','completada','rechazada','cancelada','expirada')
        NOT NULL DEFAULT 'esperando',
    didit_session_id VARCHAR(100) NULL,
    didit_url VARCHAR(500) NULL,
    didit_decision_json JSON NULL,
    payload_json JSON NULL,
    motivo_rechazo VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at DATETIME NOT NULL,
    completed_at DATETIME NULL,
    KEY idx_captura_movil_handoff (handoff_token),
    KEY idx_captura_movil_op (operador_user_id),
    KEY idx_captura_movil_op_estado (operador_user_id, estado),
    KEY idx_captura_movil_didit (didit_session_id),
    CONSTRAINT fk_capmov_operador FOREIGN KEY (operador_user_id)
        REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_capmov_vecino FOREIGN KEY (vecino_user_id)
        REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_capmov_muni FOREIGN KEY (municipio_id)
        REFERENCES municipios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(SQL))
        print("OK: captura_movil_sesiones lista")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
