"""Apaga el sub-flag de IA de Tesoreria (`tesoreria`) en TODOS los municipios.

La IA general (`habilitada`) queda como esta; solo se apaga el panel de IA de
los listados de Tesoreria (paneles operativos + banner Bartolo) para todos.

Idempotente. Imprime antes/despues.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        rows = (await conn.execute(text(
            "SELECT municipio_id, habilitada, tesoreria FROM municipio_ia_config ORDER BY municipio_id"
        ))).fetchall()
        print(f"[ANTES] {len(rows)} filas en municipio_ia_config:")
        for r in rows:
            print(f"  muni {r[0]}: habilitada={r[1]} tesoreria={r[2]}")

        res = await conn.execute(text(
            "UPDATE municipio_ia_config SET tesoreria = 0 WHERE tesoreria <> 0"
        ))
        print(f"[UPDATE] filas afectadas: {res.rowcount}")

        rows2 = (await conn.execute(text(
            "SELECT municipio_id, habilitada, tesoreria FROM municipio_ia_config ORDER BY municipio_id"
        ))).fetchall()
        print("[DESPUES]:")
        for r in rows2:
            print(f"  muni {r[0]}: habilitada={r[1]} tesoreria={r[2]}")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
