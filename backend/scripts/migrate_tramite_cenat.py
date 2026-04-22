"""Migracion Fase 3 — CENAT (licencias de conducir).

Agrega dos columnas a `tramites`:
  - requiere_cenat BOOL NOT NULL DEFAULT FALSE
  - monto_cenat_referencia FLOAT NULL  (solo informativo, no se cobra)

El pago del CENAT (Agencia Nacional de Seguridad Vial) es externo a Munify.
Lo que trackeamos acá es solo el adjunto del comprobante como
DocumentoSolicitud con tipo_documento='comprobante_cenat'.

Ejecutar: python backend/scripts/migrate_tramite_cenat.py
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


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        for col, tipo in [
            ("requiere_cenat", "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("monto_cenat_referencia", "FLOAT NULL"),
        ]:
            if await _column_exists(conn, "tramites", col):
                print(f"SKIP columna tramites.{col} (ya existe)")
                continue
            await conn.execute(text(f"ALTER TABLE tramites ADD COLUMN {col} {tipo}"))
            print(f"OK   columna tramites.{col} agregada")
    await engine.dispose()
    print("\nMigracion Fase 3 completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
