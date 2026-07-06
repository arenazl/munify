"""Migración T6 — tabla `historial_ordenes_trabajo` (auditoría de OT).

SCHEMA (idempotente): crea la tabla que registra cada transición de una orden
de trabajo (crear, iniciar, bloquear, completar, cancelar) — quién la movió,
estado_anterior → estado_nuevo y un comentario. Espeja `historial_reclamos`.
CREATE TABLE IF NOT EXISTS: re-correr el script no falla ni duplica nada.

Multi-tenant: no lleva municipio_id propio — se acota por la OT (FK
orden_trabajo_id, ON DELETE CASCADE). El ENUM de estado replica
EstadoOrdenTrabajo (mismo orden que ordenes_trabajo.estado).

SEGURIDAD (clave): NO usa el engine de core.database (que lee el .env, que
apunta a PROD). Construye su propio engine desde la env var DATABASE_URL
EXPLÍCITA. Sin esa env var → aborta. Así no hay forma de pegarle a prod por
accidente. Imprime SELECT DATABASE() para que se vea el objetivo.

USO:
    # qa:
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_historial_ot.py            # dry-run
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_historial_ot.py --aplicar  # aplica
    # prod (infra, otra sesión): DATABASE_URL de prod + --aplicar
"""
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

TABLE = "historial_ordenes_trabajo"

# ENUM de estado (mismo orden que EstadoOrdenTrabajo / ordenes_trabajo.estado).
_ESTADO_ENUM = "ENUM('pendiente','asignada','en_curso','bloqueada','completada','cancelada')"

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE} (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,

    orden_trabajo_id INT NOT NULL,
    usuario_id INT NOT NULL,

    estado_anterior {_ESTADO_ENUM} NULL,
    estado_nuevo {_ESTADO_ENUM} NULL,

    accion VARCHAR(100) NOT NULL,
    comentario TEXT NULL,

    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX ix_hot_orden_trabajo_id (orden_trabajo_id),
    INDEX ix_hot_usuario_id (usuario_id),

    CONSTRAINT fk_hot_orden FOREIGN KEY (orden_trabajo_id)
        REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
    CONSTRAINT fk_hot_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def _engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ABORT: exportá DATABASE_URL explícito (evita pegarle a prod por el .env).")
        print('   ej: DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_historial_ot.py')
        sys.exit(1)
    return create_async_engine(url)


async def _table_exists(conn, table: str) -> bool:
    n = (await conn.execute(text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
    ), {"t": table})).scalar()
    return bool(n)


async def migrar(conn, aplicar: bool):
    db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
    print(f"== SCHEMA · DB objetivo: {db} ==")

    if await _table_exists(conn, TABLE):
        print(f"SKIP: la tabla '{TABLE}' ya existe.")
        return

    if not aplicar:
        print(f"DRY-RUN: falta la tabla '{TABLE}'.")
        print("   DDL que se aplicaría: CREATE TABLE IF NOT EXISTS historial_ordenes_trabajo (...)")
        print("   Corré con --aplicar para ejecutarlo.")
        return

    await conn.execute(text(CREATE_TABLE_SQL))
    ok = await _table_exists(conn, TABLE)
    print(f"OK: tabla '{TABLE}' creada/verificada: {'OK' if ok else 'FAIL'}")


async def main():
    aplicar = "--aplicar" in sys.argv
    engine = _engine()
    async with engine.begin() as conn:
        await migrar(conn, aplicar)
    await engine.dispose()
    print("\nListo." + ("" if aplicar else "  (dry-run — nada persistido)"))


if __name__ == "__main__":
    asyncio.run(main())
