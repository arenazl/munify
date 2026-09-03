# -*- coding: utf-8 -*-
"""Borra los barrios y zonas que se llaman "Norte" / "Sur" / "Este" / "Oeste".

Regla (Lucas, 2026-09-03): un municipio TIENE barrios o NO tiene, y eso se
consulta con una query. Los cardinales sueltos eran relleno de seeds viejos
y ensuciaban esa cuenta. Se eliminan de la base y ningun generador los vuelve
a crear (services/geo_ciudad.es_cardinal filtra en la entrada).

Alcance: SOLO municipios `es_demo = 1`. San Pedro Norte (cliente productivo)
tiene 5 zonas cardinales con reclamos, cuadrillas y empleados asignados: eso
es una decision de producto con Bartolo, no una limpieza — se informa y no se
toca. Los censos por muni se imprimen antes de borrar.

Las referencias se sueltan antes de borrar (FKs reales de la base):
  barrios <- reclamos.barrio_id
  zonas   <- reclamos.zona_id, cuadrillas.zona_id, empleados.zona_id,
             usuarios.zona_id (a NULL); noticia_zonas, leaderboard_mensual (se borran)

    DATABASE_URL_QA="..." python scripts/geo/limpiar_barrios_cardinales.py --env qa
    ... --aplicar      # borra de verdad

En prod la corre Infra (o el SQL equivalente del paquete de promocion).
"""
from __future__ import annotations

import asyncio
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(AQUI)))
sys.path.insert(0, os.path.dirname(AQUI))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from _entorno import aplicar_o_seco, resolver_db  # noqa: E402

CARDINALES = ("Norte", "Sur", "Este", "Oeste")

SQL_BARRIOS = """
SELECT b.id, b.municipio_id, m.nombre, b.nombre,
       (SELECT COUNT(*) FROM reclamos r WHERE r.barrio_id = b.id) AS reclamos
FROM barrios b JOIN municipios m ON m.id = b.municipio_id
WHERE m.es_demo = 1 AND b.nombre IN :n ORDER BY b.municipio_id"""

SQL_ZONAS = """
SELECT z.id, z.municipio_id, m.nombre, z.nombre,
       (SELECT COUNT(*) FROM reclamos r WHERE r.zona_id = z.id) AS reclamos,
       (SELECT COUNT(*) FROM cuadrillas c WHERE c.zona_id = z.id) AS cuadrillas,
       (SELECT COUNT(*) FROM empleados e WHERE e.zona_id = z.id) AS empleados,
       (SELECT COUNT(*) FROM usuarios u WHERE u.zona_id = z.id) AS usuarios
FROM zonas z JOIN municipios m ON m.id = z.municipio_id
WHERE m.es_demo = 1 AND z.nombre IN :n ORDER BY z.municipio_id"""

SQL_FUERA_DE_ALCANCE = """
SELECT m.id, m.nombre, 'zona' AS que, z.nombre FROM zonas z JOIN municipios m ON m.id = z.municipio_id
WHERE m.es_demo = 0 AND z.nombre IN :n
UNION ALL
SELECT m.id, m.nombre, 'barrio', b.nombre FROM barrios b JOIN municipios m ON m.id = b.municipio_id
WHERE m.es_demo = 0 AND b.nombre IN :n"""


async def main() -> None:
    from sqlalchemy import bindparam

    cfg = resolver_db(descripcion=__doc__.splitlines()[0])
    aplicar = aplicar_o_seco()
    engine = create_async_engine(cfg.url)
    try:
        async with engine.begin() as conn:
            q = lambda s: text(s).bindparams(bindparam("n", expanding=True))  # noqa: E731
            barrios = (await conn.execute(q(SQL_BARRIOS), {"n": list(CARDINALES)})).fetchall()
            zonas = (await conn.execute(q(SQL_ZONAS), {"n": list(CARDINALES)})).fetchall()
            fuera = (await conn.execute(q(SQL_FUERA_DE_ALCANCE), {"n": list(CARDINALES)})).fetchall()

            print(f"\nBARRIOS cardinales en demos: {len(barrios)}")
            for b in barrios:
                print(f"  barrio {b[0]} muni {b[1]} {b[2]}: '{b[3]}' (reclamos={b[4]})")
            print(f"ZONAS cardinales en demos: {len(zonas)}")
            for z in zonas:
                print(f"  zona {z[0]} muni {z[1]} {z[2]}: '{z[3]}' (reclamos={z[4]} cuadrillas={z[5]} "
                      f"empleados={z[6]} usuarios={z[7]})")
            if fuera:
                print(f"FUERA DE ALCANCE (municipios productivos, NO se tocan): {len(fuera)}")
                for f in fuera:
                    print(f"  muni {f[0]} {f[1]}: {f[2]} '{f[3]}'")

            if not aplicar:
                print("\nEN SECO: nada borrado. Repetir con --aplicar.")
                return

            ids_b = [b[0] for b in barrios]
            ids_z = [z[0] for z in zonas]
            if ids_b:
                await conn.execute(q("UPDATE reclamos SET barrio_id = NULL WHERE barrio_id IN :n"), {"n": ids_b})
                await conn.execute(q("DELETE FROM barrios WHERE id IN :n"), {"n": ids_b})
            if ids_z:
                for tabla in ("reclamos", "cuadrillas", "empleados", "usuarios"):
                    await conn.execute(q(f"UPDATE {tabla} SET zona_id = NULL WHERE zona_id IN :n"), {"n": ids_z})
                for tabla in ("noticia_zonas", "leaderboard_mensual"):
                    await conn.execute(q(f"DELETE FROM {tabla} WHERE zona_id IN :n"), {"n": ids_z})
                await conn.execute(q("DELETE FROM zonas WHERE id IN :n"), {"n": ids_z})
            print(f"\nBORRADOS: {len(ids_b)} barrios, {len(ids_z)} zonas.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
