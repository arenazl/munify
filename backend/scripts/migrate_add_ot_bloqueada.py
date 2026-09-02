"""Migración T6 — estado 'bloqueada' para la OT.

SCHEMA (idempotente): agrega el valor 'bloqueada' al ENUM de
`ordenes_trabajo.estado`, insertado entre 'en_curso' y 'completada'. El
circuito pasa a: pendiente → asignada → en_curso → (bloqueada) →
completada/cancelada. Aditivo y backward-compatible: ninguna fila existente
cambia de estado; el default sigue siendo 'pendiente'.

IDEMPOTENCIA: antes de alterar, lee el COLUMN_TYPE del ENUM en
information_schema y SKIPea si 'bloqueada' ya está presente. Re-correr el
script no hace nada.

SEGURIDAD (clave): NO usa el engine de core.database (que lee el .env, que
apunta a PROD). Construye su propio engine desde la env var DATABASE_URL
EXPLÍCITA. Sin esa env var → aborta. Así no hay forma de pegarle a prod por
accidente. Imprime SELECT DATABASE() para que se vea el objetivo.

USO:
    # qa:
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_ot_bloqueada.py            # dry-run
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_ot_bloqueada.py --aplicar  # aplica
    # prod (infra, otra sesión): DATABASE_URL de prod + --aplicar
"""
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# ENUM destino (mismo orden que EstadoOrdenTrabajo, 'bloqueada' tras 'en_curso').
ENUM_DESTINO = "ENUM('pendiente','asignada','en_curso','bloqueada','completada','cancelada')"
VALOR_NUEVO = "bloqueada"


def _engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ABORT: exportá DATABASE_URL explícito (evita pegarle a prod por el .env).")
        print('   ej: DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_ot_bloqueada.py')
        sys.exit(1)
    return create_async_engine(url)


async def _enum_has_value(conn, table: str, column: str, value: str) -> bool:
    col_type = (await conn.execute(text(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :c"
    ), {"t": table, "c": column})).scalar() or ""
    return f"'{value}'" in str(col_type)


async def migrar(conn, aplicar: bool):
    db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
    print(f"== SCHEMA · DB objetivo: {db} ==")

    if await _enum_has_value(conn, "ordenes_trabajo", "estado", VALOR_NUEVO):
        print(f"SKIP: ordenes_trabajo.estado ya incluye '{VALOR_NUEVO}'")
        return

    if not aplicar:
        print(f"DRY-RUN: falta '{VALOR_NUEVO}' en ordenes_trabajo.estado.")
        print(f"   ALTER que se aplicaría: MODIFY COLUMN estado {ENUM_DESTINO} NOT NULL DEFAULT 'pendiente'")
        print("   Corré con --aplicar para ejecutarlo.")
        return

    await conn.execute(text(
        f"ALTER TABLE ordenes_trabajo MODIFY COLUMN estado {ENUM_DESTINO} "
        "NOT NULL DEFAULT 'pendiente'"
    ))
    print(f"OK: ordenes_trabajo.estado extendido con '{VALOR_NUEVO}'")


async def main():
    aplicar = "--aplicar" in sys.argv
    engine = _engine()
    async with engine.begin() as conn:
        await migrar(conn, aplicar)
    await engine.dispose()
    print("\nListo." + ("" if aplicar else "  (dry-run — nada persistido)"))


if __name__ == "__main__":
    asyncio.run(main())
