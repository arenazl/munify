"""Migración: columna `canal` en `reclamos` (canal de ingreso, omnicanalidad).

- ALTER TABLE reclamos ADD COLUMN canal VARCHAR(30) NULL + índice.
- Backfill por EVIDENCIA (historial de creación):
    * comentario LIKE '%WhatsApp%'   -> canal='whatsapp'
    * comentario LIKE '%ventanilla%' -> canal='ventanilla_asistida'
- Backfill SOLO en municipios demo (es_demo=1): mezcla app/whatsapp/ventanilla
  para que las demos muestren la omnicanalidad. Los munis productivos (SPN)
  quedan NULL = legacy, sin inventar datos.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import engine  # noqa: E402


async def migrate():
    async with engine.begin() as conn:
        # 1. Columna (idempotente: chequear si ya existe)
        existe = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = 'reclamos' AND column_name = 'canal'"
        ))).scalar()
        if not existe:
            await conn.execute(text(
                "ALTER TABLE reclamos ADD COLUMN canal VARCHAR(30) NULL, "
                "ADD INDEX ix_reclamos_canal (canal)"
            ))
            print("OK: columna canal + indice creados")
        else:
            print("SKIP: columna canal ya existe")

        # 2. Backfill por evidencia en historial (accion='creado')
        r1 = await conn.execute(text(
            "UPDATE reclamos r "
            "JOIN historial_reclamos h ON h.reclamo_id = r.id AND h.accion = 'creado' "
            "SET r.canal = 'whatsapp' "
            "WHERE r.canal IS NULL AND h.comentario LIKE '%WhatsApp%'"
        ))
        r2 = await conn.execute(text(
            "UPDATE reclamos r "
            "JOIN historial_reclamos h ON h.reclamo_id = r.id AND h.accion = 'creado' "
            "SET r.canal = 'ventanilla_asistida' "
            "WHERE r.canal IS NULL AND h.comentario LIKE '%ventanilla%'"
        ))
        print(f"Backfill evidencia: whatsapp={r1.rowcount}, ventanilla={r2.rowcount}")

        # 3. Backfill munis DEMO (mezcla determinística por id)
        r3 = await conn.execute(text(
            "UPDATE reclamos r "
            "JOIN municipios m ON m.id = r.municipio_id "
            "SET r.canal = CASE r.id % 4 "
            "  WHEN 0 THEN 'whatsapp' "
            "  WHEN 1 THEN 'ventanilla_asistida' "
            "  ELSE 'app' END "
            "WHERE r.canal IS NULL AND m.es_demo = 1"
        ))
        print(f"Backfill demos: {r3.rowcount} reclamos")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
