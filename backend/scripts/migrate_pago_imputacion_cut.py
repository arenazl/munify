"""Migracion — agrega columnas de imputacion contable + CUT a pago_sesiones.

Campos:
  - codigo_cut_qr         — hash corto tipo "CUT-A3F2B1" (unique, indexed)
  - imputacion_estado     — enum no_aplica / pendiente / imputado / rechazado_imputacion
  - imputado_at           — fecha en que contaduria lo marco como imputado
  - imputado_por_usuario_id — quien hizo la imputacion (FK usuarios)
  - imputacion_observacion   — comentario libre (motivo rechazo, etc)
  - imputacion_referencia_externa — N° asiento RAFAM u otro

Backfill:
  - Sesiones APPROVED -> imputacion_estado = 'pendiente' + genera CUT si le falta.
  - Resto de estados -> imputacion_estado = NULL (todavia no aplica).

Ejecutar: python backend/scripts/migrate_pago_imputacion_cut.py
"""
import asyncio
import sys
from pathlib import Path
from secrets import token_hex

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


def _nuevo_cut() -> str:
    """Genera un CUT corto no-enumerable: CUT-A3F2B1 (6 chars hex upper)."""
    return f"CUT-{token_hex(3).upper()}"


async def _column_exists(conn, table: str, column: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})
    return (res.scalar() or 0) > 0


async def _index_exists(conn, table: str, index: str) -> bool:
    res = await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND INDEX_NAME = :i"
    ), {"t": table, "i": index})
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
        # 1) Columnas nuevas — check + add
        columnas = [
            ("codigo_cut_qr", "VARCHAR(30) NULL"),
            ("imputacion_estado",
             "ENUM('no_aplica','pendiente','imputado','rechazado_imputacion') NULL"),
            ("imputado_at", "DATETIME NULL"),
            ("imputado_por_usuario_id", "INT NULL"),
            ("imputacion_observacion", "VARCHAR(500) NULL"),
            ("imputacion_referencia_externa", "VARCHAR(100) NULL"),
        ]
        for col, tipo in columnas:
            if await _column_exists(conn, "pago_sesiones", col):
                print(f"SKIP columna {col} (ya existe)")
                continue
            await conn.execute(text(f"ALTER TABLE pago_sesiones ADD COLUMN {col} {tipo}"))
            print(f"OK   columna {col} agregada")

        # 2) Indices
        if not await _index_exists(conn, "pago_sesiones", "ix_pago_sesiones_cut"):
            await conn.execute(text(
                "CREATE UNIQUE INDEX ix_pago_sesiones_cut ON pago_sesiones(codigo_cut_qr)"
            ))
            print("OK   ix_pago_sesiones_cut creado")
        else:
            print("SKIP ix_pago_sesiones_cut (ya existe)")

        if not await _index_exists(conn, "pago_sesiones", "ix_pago_sesiones_imputacion"):
            await conn.execute(text(
                "CREATE INDEX ix_pago_sesiones_imputacion "
                "ON pago_sesiones(municipio_id, imputacion_estado, completed_at)"
            ))
            print("OK   ix_pago_sesiones_imputacion creado")
        else:
            print("SKIP ix_pago_sesiones_imputacion (ya existe)")

        # 3) FK imputado_por_usuario_id -> usuarios(id)
        if not await _constraint_exists(conn, "pago_sesiones", "fk_pago_sesiones_imputado_por"):
            try:
                await conn.execute(text(
                    "ALTER TABLE pago_sesiones "
                    "ADD CONSTRAINT fk_pago_sesiones_imputado_por "
                    "FOREIGN KEY (imputado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL"
                ))
                print("OK   FK fk_pago_sesiones_imputado_por creada")
            except Exception as e:
                print(f"SKIP FK fk_pago_sesiones_imputado_por -> {e}")
        else:
            print("SKIP FK fk_pago_sesiones_imputado_por (ya existe)")

    # 4) Backfill — en transaccion aparte asi las columnas quedan commiteadas
    async with engine.begin() as conn:
        res = await conn.execute(text(
            "UPDATE pago_sesiones "
            "SET imputacion_estado = 'pendiente' "
            "WHERE estado = 'approved' AND imputacion_estado IS NULL"
        ))
        print(f"OK   {res.rowcount} sesiones approved marcadas pendientes")

        res = await conn.execute(text(
            "SELECT id FROM pago_sesiones WHERE estado = 'approved' AND codigo_cut_qr IS NULL"
        ))
        ids = [row[0] for row in res.fetchall()]
        print(f"Generando {len(ids)} CUTs...")

        for sesion_id in ids:
            for _ in range(5):
                cut = _nuevo_cut()
                try:
                    await conn.execute(
                        text("UPDATE pago_sesiones SET codigo_cut_qr = :cut WHERE id = :id"),
                        {"cut": cut, "id": sesion_id},
                    )
                    break
                except Exception:
                    continue
        print(f"OK   CUTs generados para {len(ids)} sesiones")

    await engine.dispose()
    print("\nMigracion completada.")


if __name__ == "__main__":
    asyncio.run(migrate())
