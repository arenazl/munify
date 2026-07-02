"""Forense parte 2 (read-only): ¿los movimientos de 17575/76/77 nunca se
crearon, o se crearon y alguien los borro?

Evidencia decisiva: secuencia de ids de tesoreria_movimientos_caja creados
alrededor de las 11:27-11:35 del 2026-05-21. Ids contiguos entre los vecinos
= nunca se crearon. Huecos = se borraron (DELETE hard).
Ademas: audit_logs de borrado de movimientos, y si los gastos borrados
(17564, 17590, 17592) explican duplicados.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402


async def main():
    async with AsyncSessionLocal() as db:
        # 1. Movimientos creados el 2026-05-21 entre 11:00 y 12:00 (todas las
        #    cajas / munis) ordenados por id — para ver la secuencia real
        movs = (await db.execute(text("""
            SELECT id, caja_id, gasto_id, tipo, monto, created_at
            FROM tesoreria_movimientos_caja
            WHERE created_at BETWEEN '2026-05-21 11:00:00' AND '2026-05-21 12:10:00'
            ORDER BY id
        """))).mappings().all()
        print("=== MOVIMIENTOS CREADOS 2026-05-21 11:00-12:10 (por id) ===")
        for m in movs:
            print(dict(m))

        # 2. Los gastos borrados con montos duplicados: detalle
        borrados = (await db.execute(text("""
            SELECT id, activo, created_at, updated_at, monto_pesos, caja_id,
                   concepto, LEFT(COALESCE(descripcion,''),80) AS descr
            FROM gastos WHERE id IN (17564, 17590, 17592)
        """))).mappings().all()
        print("\n=== GASTOS BORRADOS VECINOS (17564, 17590, 17592) ===")
        for b in borrados:
            print(dict(b))

        # 3. Estructura de audit_logs y si registra algo de movimientos/gastos
        cols = (await db.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = 'audit_logs'
        """))).scalars().all()
        print(f"\n=== COLUMNAS audit_logs: {cols} ===")
        if cols:
            audit = (await db.execute(text("""
                SELECT * FROM audit_logs
                WHERE created_at BETWEEN '2026-05-21 00:00:00' AND '2026-06-30 23:59:59'
                ORDER BY created_at LIMIT 40
            """))).mappings().all()
            print(f"filas en rango: {len(audit)}")
            for a in audit[:20]:
                print(dict(a))

        # 4. ¿17576 fue editado el 2026-06-16 (updated_at)? ¿Que endpoint pudo
        #    ser? Ver si su cuota cambio ese dia tambien
        cuota_upd = (await db.execute(text("""
            SELECT gasto_id, numero, estado, fecha_pago, created_at
            FROM gastos_cuotas WHERE gasto_id = 17576
        """))).mappings().all()
        print("\n=== CUOTA DE 17576 (editado 2026-06-16) ===")
        for c in cuota_upd:
            print(dict(c))

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
