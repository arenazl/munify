"""Revierte el reclamo 4679 al estado nuevo sin empleado (rollback smoke test)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def run():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("""
            UPDATE reclamos SET
              estado = 'nuevo',
              empleado_id = NULL,
              fecha_recibido = NULL,
              fecha_estimada_resolucion = NULL,
              tiempo_estimado_dias = 0,
              tiempo_estimado_horas = 0,
              fecha_programada = NULL,
              hora_inicio = NULL,
              hora_fin = NULL
             WHERE id = 4679
        """))
        await conn.execute(text("""
            DELETE FROM historial_reclamos
             WHERE reclamo_id = 4679
               AND created_at >= NOW() - INTERVAL 30 MINUTE
               AND accion IN ('asignacion', 'cambio_estado', 'empleado_asignado', 'asignado')
        """))
        row = (await conn.execute(text(
            "SELECT id, estado, empleado_id, municipio_dependencia_id, fecha_recibido "
            "FROM reclamos WHERE id = 4679"
        ))).first()
        print(f"Post-rollback: {row}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
