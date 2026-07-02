"""Read-only: dimensiona el pendiente de tipificacion/curacion de SPN (muni 80).

Responde: de los gastos 2024/2025/2026, cuantos estan tipificados de verdad
(concepto especifico + contacto enlazado) y cuantos quedaron genericos o
marcados [BARTOLO-DUDOSO]. Tambien el estado del staging bartolo_raw
(sugerencias IA aplicadas vs pendientes) si existe.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402

GENERICOS = ("Otros gastos", "Compras varias", "Otros", "General", "Varios")


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text("""
            SELECT YEAR(fecha) AS anio,
                   COUNT(*) AS total,
                   SUM(CASE WHEN observaciones LIKE '%[BARTOLO-DUDOSO]%' THEN 1 ELSE 0 END) AS dudosos,
                   SUM(CASE WHEN concepto IN :genericos THEN 1 ELSE 0 END) AS concepto_generico,
                   SUM(CASE WHEN destino_tipo = 'contacto' AND destino_contacto_id IS NOT NULL THEN 1 ELSE 0 END) AS con_contacto,
                   SUM(CASE WHEN destino_tipo = 'dependencia' THEN 1 ELSE 0 END) AS a_dependencia
            FROM gastos
            WHERE municipio_id = 80 AND activo = 1
            GROUP BY YEAR(fecha) ORDER BY anio
        """), {"genericos": GENERICOS})).mappings().all()
        print("=== GASTOS SPN POR AÑO (activos) ===")
        for r in rows:
            print(dict(r))

        top = (await db.execute(text("""
            SELECT concepto, COUNT(*) AS n
            FROM gastos
            WHERE municipio_id = 80 AND activo = 1
              AND observaciones LIKE '%[BARTOLO-DUDOSO]%'
            GROUP BY concepto ORDER BY n DESC LIMIT 8
        """))).mappings().all()
        print("\n=== LOS 1110 DUDOSOS: EN QUE CONCEPTO ESTAN HOY ===")
        for t in top:
            print(dict(t))

        existe = (await db.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = 'bartolo_raw'"
        ))).scalar()
        if existe:
            cols = (await db.execute(text(
                "SELECT COLUMN_NAME FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = 'bartolo_raw'"
            ))).scalars().all()
            print(f"\n=== bartolo_raw EXISTE, columnas: {cols} ===")
            tiene_sug = any(c.startswith("sugerencia") for c in cols)
            if tiene_sug:
                stats = (await db.execute(text("""
                    SELECT COUNT(*) AS total,
                           SUM(CASE WHEN sugerencia_concepto IS NOT NULL THEN 1 ELSE 0 END) AS con_sugerencia
                    FROM bartolo_raw
                """))).mappings().one()
                print(dict(stats))
        else:
            print("\n=== bartolo_raw NO existe en la BD (el staging fue local o se borro) ===")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
