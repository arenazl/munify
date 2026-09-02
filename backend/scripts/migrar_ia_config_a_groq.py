# -*- coding: utf-8 -*-
"""
AGENDADO — NO EJECUTADO todavia (2026-09-01).

Normaliza `municipio_ia_config`: las filas que quedaron con el proveedor y el
modelo de Gemini pasan a Groq. El codigo ya es resiliente (si lee un modelo de
Gemini lo ignora y usa el de Groq), asi que esto no es urgente: es limpieza
para que la pantalla del superadmin no muestre un modelo que no existe mas.

Por que no se corrio: el dueño pidio expresamente no ejecutar NADA contra la
base mientras Infra esta renombrando/ajustando las bases de QA y produccion.
Cuando Infra avise que termino, correr:

    python backend/scripts/migrar_ia_config_a_groq.py --aplicar

Sin --aplicar solo muestra que filas cambiarian (dry-run).

PRODUCCION: este script NO se corre contra produccion. Ahi la migracion la
ejecuta Infra junto con la promocion qa -> master.
"""
import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, "backend")

from core.config import settings  # noqa: E402

MODELO_GROQ = "openai/gpt-oss-120b"

SELECT_AFECTADAS = text(
    """
    SELECT municipio_id, provider, modelo
    FROM municipio_ia_config
    WHERE provider <> 'groq' OR modelo LIKE 'gemini%'
    """
)

UPDATE = text(
    """
    UPDATE municipio_ia_config
    SET provider = 'groq', modelo = :modelo
    WHERE provider <> 'groq' OR modelo LIKE 'gemini%'
    """
)


async def main(aplicar: bool) -> None:
    if "sugerenciasmun-qa" not in settings.DATABASE_URL:
        # Guarda dura: este script es de QA. Produccion la toca Infra.
        print("ABORTADO: la DATABASE_URL no apunta a la base de QA.")
        print("Este script no se corre contra produccion.")
        return

    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            filas = (await conn.execute(SELECT_AFECTADAS)).fetchall()
            if not filas:
                print("Nada que migrar: todas las filas ya estan en groq.")
                return
            print(f"Filas a migrar ({len(filas)}):")
            for muni_id, provider, modelo in filas:
                print(f"  municipio {muni_id}: {provider}/{modelo} -> groq/{MODELO_GROQ}")
            if not aplicar:
                print("\nDry-run. Volve a correrlo con --aplicar para escribir.")
                return
            await conn.execute(UPDATE, {"modelo": MODELO_GROQ})
            print(f"\nOK: {len(filas)} filas migradas a groq.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--aplicar" in sys.argv))
