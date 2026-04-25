"""
Backfill de descripciones en `categorias_reclamo` y `categorias_tramite` para
todos los municipios existentes.

El seed `services/categorias_seed.py` antes no cargaba `descripcion`, así que
los munis creados antes de este cambio quedaron con descripcion=NULL en las
categorías iniciales. Este script hace UPDATE matching por nombre exacto,
sin pisar las descripciones que el admin ya haya editado a mano (solo escribe
si está NULL o vacía).

Ejecutar:
    cd backend && python -m scripts.migrate_categorias_descripciones
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings
from services.categorias_seed import (
    CATEGORIAS_RECLAMO_DEFAULT,
    CATEGORIAS_TRAMITE_DEFAULT,
)


async def run() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    actualizadas_reclamo = 0
    actualizadas_tramite = 0

    async with engine.begin() as conn:
        for c in CATEGORIAS_RECLAMO_DEFAULT:
            r = await conn.execute(
                text("""
                    UPDATE categorias_reclamo
                    SET descripcion = :desc,
                        tiempo_resolucion_estimado = COALESCE(tiempo_resolucion_estimado, :tiempo),
                        prioridad_default = COALESCE(prioridad_default, :prio)
                    WHERE nombre = :nombre
                      AND (descripcion IS NULL OR descripcion = '')
                """),
                {
                    "desc": c["descripcion"],
                    "tiempo": c.get("tiempo_resolucion_estimado", 48),
                    "prio": c.get("prioridad_default", 3),
                    "nombre": c["nombre"],
                },
            )
            actualizadas_reclamo += r.rowcount or 0

        for c in CATEGORIAS_TRAMITE_DEFAULT:
            r = await conn.execute(
                text("""
                    UPDATE categorias_tramite
                    SET descripcion = :desc
                    WHERE nombre = :nombre
                      AND (descripcion IS NULL OR descripcion = '')
                """),
                {"desc": c["descripcion"], "nombre": c["nombre"]},
            )
            actualizadas_tramite += r.rowcount or 0

    print(f"[OK] descripciones backfilleadas — reclamo: {actualizadas_reclamo} filas, tramite: {actualizadas_tramite} filas")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
