"""
Borra TODOS los gastos y TODOS los contactos del muni san-pedro-norte.

NO toca: cajas, conceptos, tipos de concepto, tipos de empleado, parajes,
proyectos, agenda de pagos, movimientos de caja, usuarios, dependencias.

Orden respetando FKs:
  1. gastos_cuotas -> dependen de gastos
  2. tesoreria_gastos_proyectos (imputaciones) -> dependen de gastos
  3. gastos
  4. tesoreria_pagos_programados -> dependen de contactos (si referencian)
  5. contactos
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
        muni = (await conn.execute(text("""
            SELECT id, nombre FROM municipios WHERE codigo = 'san-pedro-norte' LIMIT 1
        """))).fetchone()
        if not muni:
            print("[!] No existe san-pedro-norte")
            return
        mid, nombre = muni
        print(f"Muni: {mid} ({nombre})")

        # 1. Cuotas (dependen de gastos)
        r = await conn.execute(text("""
            DELETE FROM gastos_cuotas
            WHERE gasto_id IN (SELECT id FROM gastos WHERE municipio_id = :mid)
        """), {"mid": mid})
        print(f"  gastos_cuotas borradas: {r.rowcount}")

        # 2. Imputaciones gasto -> proyecto
        try:
            r = await conn.execute(text("""
                DELETE FROM tesoreria_gastos_proyectos
                WHERE gasto_id IN (SELECT id FROM gastos WHERE municipio_id = :mid)
            """), {"mid": mid})
            print(f"  tesoreria_gastos_proyectos borradas: {r.rowcount}")
        except Exception as e:
            print(f"  [skip imputaciones] {e}")

        # 3. Gastos
        r = await conn.execute(text("""
            DELETE FROM gastos WHERE municipio_id = :mid
        """), {"mid": mid})
        print(f"  gastos borrados: {r.rowcount}")

        # 4. Pagos programados que referencien contactos del muni
        try:
            r = await conn.execute(text("""
                DELETE FROM tesoreria_pagos_programados WHERE municipio_id = :mid
            """), {"mid": mid})
            print(f"  pagos_programados borrados: {r.rowcount}")
        except Exception as e:
            print(f"  [skip pagos_programados] {e}")

        # 5. Contactos
        r = await conn.execute(text("""
            DELETE FROM contactos WHERE municipio_id = :mid
        """), {"mid": mid})
        print(f"  contactos borrados: {r.rowcount}")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
