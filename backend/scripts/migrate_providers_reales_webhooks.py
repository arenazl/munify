"""Migracion Fase 2 — providers reales + webhook eventos.

Cambios:
  1. municipio_proveedores_pago — agregar columnas para conectar a MP/MODO/GIRE:
       - access_token_encriptado (TEXT)       : credencial privada del muni (cifrada Fernet)
       - public_key              (VARCHAR(200)) : llave publica (seguro en frontend)
       - webhook_secret          (VARCHAR(100)) : para validar HMAC del webhook entrante
       - cuit_cobranza           (VARCHAR(11))  : CUIT visible en el comprobante
       - test_mode               (BOOL default TRUE) : sandbox vs produccion

  2. pago_webhook_eventos (tabla nueva) — bitacora de TODOS los eventos del provider:
       - id, provider, external_id, evento, payload JSON, firma_ok, session_id FK,
         procesado_at, created_at
       - unique (provider, external_id, evento) para idempotencia

Ejecutar: python backend/scripts/migrate_providers_reales_webhooks.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


async def _column_exists(conn, table: str, column: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    return (res.scalar() or 0) > 0


async def _table_exists(conn, table: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
    ), {"t": table})
    return (res.scalar() or 0) > 0


async def _index_exists(conn, table: str, index: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND INDEX_NAME = :i"
    ), {"t": table, "i": index})
    return (res.scalar() or 0) > 0


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # 1) Columnas en municipio_proveedores_pago
    async with engine.begin() as conn:
        cols = [
            ("access_token_encriptado", "TEXT NULL"),
            ("public_key", "VARCHAR(200) NULL"),
            ("webhook_secret", "VARCHAR(100) NULL"),
            ("cuit_cobranza", "VARCHAR(11) NULL"),
            ("test_mode", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ]
        for col, tipo in cols:
            if await _column_exists(conn, "municipio_proveedores_pago", col):
                print(f"SKIP columna {col} (ya existe)")
                continue
            await conn.execute(text(
                f"ALTER TABLE municipio_proveedores_pago ADD COLUMN {col} {tipo}"
            ))
            print(f"OK   columna {col} agregada")

    # 2) Tabla pago_webhook_eventos
    async with engine.begin() as conn:
        if not await _table_exists(conn, "pago_webhook_eventos"):
            await conn.execute(text(
                """
                CREATE TABLE pago_webhook_eventos (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    provider        VARCHAR(40)   NOT NULL,
                    external_id     VARCHAR(100)  NOT NULL,
                    evento          VARCHAR(60)   NOT NULL,
                    session_id      VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
                    payload         JSON          NULL,
                    firma_ok        BOOLEAN       NOT NULL DEFAULT FALSE,
                    procesado_at    DATETIME      NULL,
                    error           VARCHAR(500)  NULL,
                    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX ix_pwe_session (session_id),
                    INDEX ix_pwe_provider_external (provider, external_id),
                    UNIQUE KEY uq_pwe_dedup (provider, external_id, evento),
                    CONSTRAINT fk_pwe_session FOREIGN KEY (session_id)
                        REFERENCES pago_sesiones(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            ))
            print("OK   tabla pago_webhook_eventos creada")
        else:
            print("SKIP tabla pago_webhook_eventos (ya existe)")

    await engine.dispose()
    print("\nMigracion Fase 2 completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
