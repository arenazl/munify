"""Corrige fechas de gastos de San Pedro Norte (muni 80).

Los Excel del 2025 se importaron con año desplazado 1 (los registros que
debian quedar en 2025 quedaron en 2026, los de 2025 final en 2027).

Esta migracion resta 1 año a TODOS los gastos del muni 80 con fecha
>= 2026-01-01. Antes hace backup CSV.
"""
import asyncio
import csv
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

MUNI_ID = 80
BACKUP_PATH = Path("/tmp/gastos_san_pedro_backup.csv")


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # 1) BACKUP de los que vamos a tocar
        rows = (await conn.execute(text("""
            SELECT id, fecha, concepto, monto_pesos
            FROM gastos
            WHERE municipio_id = :mid AND activo = 1 AND fecha >= '2026-01-01'
            ORDER BY fecha
        """), {"mid": MUNI_ID})).fetchall()
        print(f"Voy a tocar {len(rows)} gastos del muni {MUNI_ID}")
        with open(BACKUP_PATH, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id", "fecha_original", "concepto", "monto"])
            for r in rows:
                w.writerow([r.id, r.fecha, r.concepto, r.monto_pesos])
        print(f"Backup en {BACKUP_PATH}")

        # 2) UPDATE: restar 1 año
        result = await conn.execute(text("""
            UPDATE gastos
            SET fecha = DATE_SUB(fecha, INTERVAL 1 YEAR)
            WHERE municipio_id = :mid AND activo = 1 AND fecha >= '2026-01-01'
        """), {"mid": MUNI_ID})
        print(f"Actualizadas {result.rowcount} filas")

        # 3) Verificación post
        check = (await conn.execute(text("""
            SELECT YEAR(fecha) y, COUNT(*) c
            FROM gastos WHERE municipio_id = :mid AND activo = 1
            GROUP BY YEAR(fecha) ORDER BY y
        """), {"mid": MUNI_ID})).fetchall()
        print("\n=== Despues del fix ===")
        for x in check:
            print(f"  {x.y}: {x.c} gastos")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
