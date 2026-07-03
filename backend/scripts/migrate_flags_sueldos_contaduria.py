"""Reorg de modulos 2026-07: separa `sueldos` y `contaduria` del cluster `tesoreria`.

Siembra segun USO REAL verificado en BD:
- SPN (muni 80): sueldos ON (241 pagos programados vivos, ultimo 2026-07-01).
  contaduria queda sin fila = oculta (5 OPs de prueba de mayo, abandonadas).
- Munis demo (es_demo=1): sueldos + contaduria + ordenes_trabajo ON, para
  poder demostrar los tres modulos.
- Resto: sin fila = oculto (ambos flags son opt-in).
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402


async def upsert(db, muni_id: int, modulo: str) -> bool:
    row = (await db.execute(text(
        "SELECT id, activo FROM municipio_modulos WHERE municipio_id=:m AND modulo=:mod"
    ), {"m": muni_id, "mod": modulo})).fetchone()
    if row:
        if not row[1]:
            await db.execute(text(
                "UPDATE municipio_modulos SET activo=1 WHERE id=:i"), {"i": row[0]})
            return True
        return False
    await db.execute(text(
        "INSERT INTO municipio_modulos (municipio_id, modulo, activo) VALUES (:m, :mod, 1)"
    ), {"m": muni_id, "mod": modulo})
    return True


async def main():
    async with AsyncSessionLocal() as db:
        demos = [r[0] for r in (await db.execute(text(
            "SELECT id FROM municipios WHERE es_demo=1"))).fetchall()]
        cambios = 0
        cambios += await upsert(db, 80, "sueldos")
        for d in demos:
            for mod in ("sueldos", "contaduria", "ordenes_trabajo"):
                cambios += await upsert(db, d, mod)
        await db.commit()
        print(f"munis demo: {len(demos)} | filas creadas/activadas: {cambios}")
        print("SPN 80: sueldos ON, contaduria sin fila (oculta)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
