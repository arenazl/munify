"""Forense read-only: por qué los gastos 17575/17576/17577 (SPN, caja 2)
estan concretados con caja pero SIN movimiento de egreso ($1.888.027,46).

Hipotesis a descartar con datos:
  A) los creo la importacion masiva (Bartolo) sin crear movimientos
  B) alguien borro los movimientos a mano (DELETE hard del endpoint)
  C) se editaron por un camino que salteo _sincronizar_movimiento_caja
  D) nacieron pendientes y pasaron a concretado sin sync
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402

IDS = (17575, 17576, 17577)


async def main():
    async with AsyncSessionLocal() as db:
        # 1. Los 3 gastos completos
        rows = (await db.execute(text("""
            SELECT id, created_at, updated_at, creador_id, tipo_financiacion,
                   estado_pago, forma_pago, caja_id, monto_pesos, concepto,
                   nro_factura, pago_programado_id,
                   LEFT(COALESCE(observaciones,''), 120) AS obs,
                   LEFT(COALESCE(descripcion,''), 120) AS descr
            FROM gastos WHERE id IN :ids
        """), {"ids": IDS})).mappings().all()
        print("=== LOS 3 GASTOS ===")
        for r in rows:
            print(dict(r))

        # 2. Cuotas de esos gastos (contado deberia tener 1 cuota pagada)
        cuotas = (await db.execute(text("""
            SELECT gasto_id, numero, monto, estado, fecha_pago, created_at
            FROM gastos_cuotas WHERE gasto_id IN :ids
        """), {"ids": IDS})).mappings().all()
        print("\n=== SUS CUOTAS ===")
        for c in cuotas:
            print(dict(c))

        # 3. Movimientos (confirmar cero)
        movs = (await db.execute(text("""
            SELECT id, caja_id, gasto_id, tipo, monto, fecha, created_at
            FROM tesoreria_movimientos_caja WHERE gasto_id IN :ids
        """), {"ids": IDS})).mappings().all()
        print(f"\n=== MOVIMIENTOS DE ESOS GASTOS: {len(movs)} ===")
        for m in movs:
            print(dict(m))

        # 4. Vecinos del mismo momento: gastos de muni 80 creados el 2026-05-21
        #    ± cercanos por id — ¿tienen movimiento? ¿mismo lote?
        vecinos = (await db.execute(text("""
            SELECT g.id, g.created_at, g.estado_pago, g.caja_id, g.monto_pesos,
                   g.tipo_financiacion,
                   (SELECT COUNT(*) FROM tesoreria_movimientos_caja m
                     WHERE m.gasto_id = g.id) AS n_movs,
                   LEFT(COALESCE(g.observaciones,''), 60) AS obs
            FROM gastos g
            WHERE g.municipio_id = 80 AND g.id BETWEEN 17560 AND 17595
            ORDER BY g.id
        """))).mappings().all()
        print("\n=== VECINOS (ids 17560-17595) ===")
        for v in vecinos:
            print(dict(v))

        # 5. Panorama del dia 2026-05-21 completo: cuantos gastos, cuantos con
        #    caja, cuantos con movimiento
        dia = (await db.execute(text("""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN caja_id IS NOT NULL THEN 1 ELSE 0 END) AS con_caja,
                   SUM(CASE WHEN caja_id IS NOT NULL AND estado_pago='concretado'
                            AND EXISTS (SELECT 1 FROM tesoreria_movimientos_caja m
                                        WHERE m.gasto_id = gastos.id)
                       THEN 1 ELSE 0 END) AS con_caja_y_mov
            FROM gastos
            WHERE municipio_id = 80 AND DATE(created_at) = '2026-05-21' AND activo = 1
        """))).mappings().one()
        print(f"\n=== DIA 2026-05-21 (muni 80): {dict(dia)} ===")

        # 6. Panorama global muni 80: concretado contado con caja, con vs sin mov,
        #    agrupado por fecha de creacion (top 15 dias)
        panorama = (await db.execute(text("""
            SELECT DATE(g.created_at) AS dia,
                   COUNT(*) AS concretados_con_caja,
                   SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM tesoreria_movimientos_caja m
                                             WHERE m.gasto_id = g.id)
                       THEN 1 ELSE 0 END) AS sin_mov
            FROM gastos g
            WHERE g.municipio_id = 80 AND g.activo = 1 AND g.caja_id IS NOT NULL
              AND g.estado_pago = 'concretado' AND g.tipo_financiacion = 'contado'
            GROUP BY DATE(g.created_at)
            ORDER BY dia
        """))).mappings().all()
        print("\n=== POR DIA: concretados contado con caja / cuantos SIN movimiento ===")
        for p in panorama:
            print(dict(p))

        # 7. ¿Que rango de ids de movimiento existe alrededor? Si hubo movs
        #    borrados, hay huecos en la secuencia de ids de movimientos de esa caja
        movs_caja2 = (await db.execute(text("""
            SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS n
            FROM tesoreria_movimientos_caja WHERE caja_id = 2
        """))).mappings().one()
        print(f"\n=== MOVIMIENTOS CAJA 2 (rango ids): {dict(movs_caja2)} ===")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
