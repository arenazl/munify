"""Migración C.1 del turnero consolidado. 100% ADITIVA:

- tramites.modo_atencion VARCHAR(30) NOT NULL DEFAULT 'online'
  (backfill: requiere_turno=1 -> 'presencial_con_turno')
- turnos.tramite_id INT NULL FK tramites (SET NULL) + index
- turnos.usuario_id INT NULL FK usuarios (SET NULL) + index

No toca tesorería ni nada del cliente productivo.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402


async def _col_existe(conn, tabla: str, col: str) -> bool:
    return bool((await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})).scalar())


async def migrate():
    async with engine.begin() as conn:
        if not await _col_existe(conn, "tramites", "modo_atencion"):
            await conn.execute(text(
                "ALTER TABLE tramites ADD COLUMN modo_atencion VARCHAR(30) "
                "NOT NULL DEFAULT 'online'"
            ))
            r = await conn.execute(text(
                "UPDATE tramites SET modo_atencion = 'presencial_con_turno' "
                "WHERE requiere_turno = 1"
            ))
            print(f"OK: tramites.modo_atencion (backfill requiere_turno: {r.rowcount})")
        else:
            print("SKIP: tramites.modo_atencion ya existe")

        if not await _col_existe(conn, "turnos", "tramite_id"):
            await conn.execute(text(
                "ALTER TABLE turnos ADD COLUMN tramite_id INT NULL, "
                "ADD INDEX ix_turnos_tramite (tramite_id), "
                "ADD CONSTRAINT fk_turnos_tramite FOREIGN KEY (tramite_id) "
                "REFERENCES tramites(id) ON DELETE SET NULL"
            ))
            print("OK: turnos.tramite_id")
        else:
            print("SKIP: turnos.tramite_id ya existe")

        if not await _col_existe(conn, "turnos", "usuario_id"):
            await conn.execute(text(
                "ALTER TABLE turnos ADD COLUMN usuario_id INT NULL, "
                "ADD INDEX ix_turnos_usuario (usuario_id), "
                "ADD CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id) "
                "REFERENCES usuarios(id) ON DELETE SET NULL"
            ))
            print("OK: turnos.usuario_id")
        else:
            print("SKIP: turnos.usuario_id ya existe")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
