"""
Migracion: agregar
  - gastos.pago_programado_id (FK SET NULL) — para historico de pagos
  - tesoreria_pagos_programados.premios_default (JSON) — premios sugeridos

Idempotente.
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
        # ============ gastos.pago_programado_id ============
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'gastos'
              AND COLUMN_NAME = 'pago_programado_id'
        """))
        if check.fetchone():
            print("[SKIP] gastos.pago_programado_id ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE gastos
                ADD COLUMN pago_programado_id INT NULL,
                ADD INDEX ix_gastos_pp (pago_programado_id),
                ADD CONSTRAINT fk_gastos_pp
                  FOREIGN KEY (pago_programado_id)
                  REFERENCES tesoreria_pagos_programados(id)
                  ON DELETE SET NULL
            """))
            print("[OK] columna gastos.pago_programado_id creada (FK SET NULL)")

        # ============ pagos_programados.premios_default ============
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tesoreria_pagos_programados'
              AND COLUMN_NAME = 'premios_default'
        """))
        if check.fetchone():
            print("[SKIP] premios_default ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE tesoreria_pagos_programados
                ADD COLUMN premios_default JSON NULL
            """))
            print("[OK] columna premios_default creada")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
