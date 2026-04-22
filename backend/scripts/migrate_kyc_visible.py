"""Migracion Fase 5 — KYC visible + assisted.

Cambios:
  - usuarios.kyc_modo          VARCHAR(20) NULL   -- "self_service" | "assisted"
  - usuarios.kyc_operador_id   INT NULL FK usuarios(id) ON DELETE SET NULL
  - tramites.requiere_kyc      BOOL NOT NULL DEFAULT FALSE
  - tramites.nivel_kyc_minimo  INT NULL   -- 1=email, 2=biometria

Backfill: users con `verificado_at IS NOT NULL` quedan con kyc_modo='self_service'.

Ejecutar: python backend/scripts/migrate_kyc_visible.py
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


async def _constraint_exists(conn, table: str, name: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND CONSTRAINT_NAME = :n"
    ), {"t": table, "n": name})
    return (res.scalar() or 0) > 0


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        # usuarios
        cols_users = [
            ("kyc_modo", "VARCHAR(20) NULL"),
            ("kyc_operador_id", "INT NULL"),
        ]
        for col, tipo in cols_users:
            if await _column_exists(conn, "usuarios", col):
                print(f"SKIP columna usuarios.{col}")
                continue
            await conn.execute(text(f"ALTER TABLE usuarios ADD COLUMN {col} {tipo}"))
            print(f"OK   columna usuarios.{col} agregada")

        if not await _constraint_exists(conn, "usuarios", "fk_usuarios_kyc_operador"):
            try:
                await conn.execute(text(
                    "ALTER TABLE usuarios "
                    "ADD CONSTRAINT fk_usuarios_kyc_operador "
                    "FOREIGN KEY (kyc_operador_id) REFERENCES usuarios(id) ON DELETE SET NULL"
                ))
                print("OK   FK fk_usuarios_kyc_operador creada")
            except Exception as e:
                print(f"SKIP FK fk_usuarios_kyc_operador -> {e}")

        # tramites
        cols_tram = [
            ("requiere_kyc", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("nivel_kyc_minimo", "INT NULL"),
        ]
        for col, tipo in cols_tram:
            if await _column_exists(conn, "tramites", col):
                print(f"SKIP columna tramites.{col}")
                continue
            await conn.execute(text(f"ALTER TABLE tramites ADD COLUMN {col} {tipo}"))
            print(f"OK   columna tramites.{col} agregada")

    # Backfill: users ya verificados por Didit -> self_service
    async with engine.begin() as conn:
        res = await conn.execute(text(
            "UPDATE usuarios SET kyc_modo = 'self_service' "
            "WHERE verificado_at IS NOT NULL AND kyc_modo IS NULL"
        ))
        print(f"OK   {res.rowcount} users backfilled -> self_service")

    await engine.dispose()
    print("\nMigracion Fase 5 completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
