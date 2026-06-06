"""Fase 1 turnos v2: generaliza el modelo Turno + crea tablas de agenda.

ADITIVO y 100% compatible:
  - Agrega columnas nullable a `turnos` (motivo_tipo, origen_id, *_solicitante).
  - Relaja turnos.solicitud_id de NOT NULL a NULL.
  - Backfill: motivo_tipo='tramite' y origen_id=solicitud_id en los turnos existentes
    (origen_id = fuente unica del vinculo polimorfico).
  - Crea agenda_configs (sin UNIQUE dep/dia -> soporta horario partido) y
    agenda_excepciones (overrides de hora en TIME, no string).

Idempotente: chequea information_schema antes de cada DDL. Safe para correr N veces.
Ejecutar desde backend/:  python scripts/migrar_turnos_v2.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from core.config import settings


async def _col_existe(conn, tabla, col):
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})
    return (r.scalar() or 0) > 0


async def _col_nullable(conn, tabla, col):
    r = await conn.execute(text(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})
    return (r.scalar() or "").upper() == "YES"


async def _index_existe(conn, tabla, idx):
    r = await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.statistics "
        "WHERE table_schema = DATABASE() AND table_name = :t AND index_name = :i"
    ), {"t": tabla, "i": idx})
    return (r.scalar() or 0) > 0


COLUMNAS_TURNO = [
    ("motivo_tipo", "VARCHAR(20) NULL DEFAULT 'tramite'"),
    ("origen_id", "INT NULL"),
    ("nombre_solicitante", "VARCHAR(120) NULL"),
    ("dni_solicitante", "VARCHAR(20) NULL"),
    ("telefono_solicitante", "VARCHAR(50) NULL"),
]


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # 1) Columnas nuevas en turnos
        for col, ddl in COLUMNAS_TURNO:
            if await _col_existe(conn, "turnos", col):
                print(f"  = turnos.{col} ya existe")
            else:
                print(f"  + turnos.{col}")
                await conn.execute(text(f"ALTER TABLE turnos ADD COLUMN {col} {ddl}"))

        # 2) Relajar solicitud_id NOT NULL -> NULL
        if await _col_nullable(conn, "turnos", "solicitud_id"):
            print("  = turnos.solicitud_id ya es nullable")
        else:
            print("  ~ turnos.solicitud_id -> NULL")
            await conn.execute(text("ALTER TABLE turnos MODIFY solicitud_id INT NULL"))

        # 3) Indice (motivo_tipo, origen_id)
        if await _index_existe(conn, "turnos", "idx_turno_tipo_origen"):
            print("  = idx_turno_tipo_origen ya existe")
        else:
            print("  + idx_turno_tipo_origen")
            await conn.execute(text(
                "CREATE INDEX idx_turno_tipo_origen ON turnos(motivo_tipo, origen_id)"
            ))

        # 4) Backfill (fuente unica del vinculo = origen_id)
        await conn.execute(text(
            "UPDATE turnos SET motivo_tipo='tramite' WHERE motivo_tipo IS NULL"
        ))
        res = await conn.execute(text(
            "UPDATE turnos SET origen_id = solicitud_id "
            "WHERE motivo_tipo='tramite' AND origen_id IS NULL AND solicitud_id IS NOT NULL"
        ))
        print(f"  ~ backfill origen_id en {res.rowcount} turnos de tramite")

        # 5) Tabla agenda_configs (sin UNIQUE dep/dia -> horario partido)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agenda_configs (
              id INT NOT NULL AUTO_INCREMENT,
              municipio_id INT NOT NULL,
              municipio_dependencia_id INT NOT NULL,
              dia_semana TINYINT NOT NULL,
              hora_inicio TIME NOT NULL,
              hora_fin TIME NOT NULL,
              cupo_max_por_slot INT NOT NULL DEFAULT 1,
              activo TINYINT(1) NOT NULL DEFAULT 1,
              created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              updated_at DATETIME(6) NULL ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (id),
              KEY idx_agenda_muni (municipio_id),
              KEY idx_agenda_dep_dia (municipio_dependencia_id, dia_semana),
              CONSTRAINT fk_agenda_dep  FOREIGN KEY (municipio_dependencia_id)
                REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
              CONSTRAINT fk_agenda_muni FOREIGN KEY (municipio_id)
                REFERENCES municipios(id)
            )
        """))
        print("  + agenda_configs (IF NOT EXISTS)")

        # 6) Tabla agenda_excepciones (overrides en TIME)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS agenda_excepciones (
              id INT NOT NULL AUTO_INCREMENT,
              municipio_id INT NOT NULL,
              municipio_dependencia_id INT NOT NULL,
              fecha DATE NOT NULL,
              tipo VARCHAR(20) NOT NULL DEFAULT 'cierre',
              motivo VARCHAR(200) NULL,
              hora_inicio_override TIME NULL,
              hora_fin_override TIME NULL,
              created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              updated_at DATETIME(6) NULL ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (id),
              UNIQUE KEY uq_excepcion_dep_fecha (municipio_dependencia_id, fecha),
              KEY idx_excepcion_fecha (fecha),
              CONSTRAINT fk_excep_dep  FOREIGN KEY (municipio_dependencia_id)
                REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
              CONSTRAINT fk_excep_muni FOREIGN KEY (municipio_id)
                REFERENCES municipios(id)
            )
        """))
        print("  + agenda_excepciones (IF NOT EXISTS)")

    await engine.dispose()
    print("Migracion turnos v2: OK")


if __name__ == "__main__":
    asyncio.run(migrate())
