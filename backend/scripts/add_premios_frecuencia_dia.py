"""
Migracion: cada premio tiene su propia frecuencia + dia (semana o del mes).

- tesoreria_premios.frecuencia (semanal/quincenal/mensual/bimestral/trimestral/anual)
- tesoreria_premios.dia_semana INT NULL (0=lunes..6=domingo) cuando frecuencia=semanal
- tesoreria_premios.dia_del_mes INT NULL (1..28) cuando frecuencia=mensual y siguientes
- tesoreria_pagos_programados.dia_semana INT NULL (cuando el pago programado es semanal)

Idempotente.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


COLS_PREMIOS = [
    ("frecuencia", "ENUM('semanal','quincenal','mensual','bimestral','trimestral','anual') NOT NULL DEFAULT 'mensual'"),
    ("dia_semana", "TINYINT NULL COMMENT '0=lunes..6=domingo, NULL si no es semanal'"),
    ("dia_del_mes", "TINYINT NULL COMMENT '1..28, NULL si es semanal'"),
]

COLS_PP = [
    ("dia_semana", "TINYINT NULL COMMENT '0=lunes..6=domingo, NULL si no es semanal'"),
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for col_name, col_def in COLS_PREMIOS:
            check = await conn.execute(text(f"""
                SELECT COLUMN_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tesoreria_premios'
                  AND COLUMN_NAME = '{col_name}'
            """))
            if check.fetchone():
                print(f"[SKIP] tesoreria_premios.{col_name} ya existe")
            else:
                await conn.execute(text(f"""
                    ALTER TABLE tesoreria_premios ADD COLUMN {col_name} {col_def}
                """))
                print(f"[OK] tesoreria_premios.{col_name} creada")

        for col_name, col_def in COLS_PP:
            check = await conn.execute(text(f"""
                SELECT COLUMN_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'tesoreria_pagos_programados'
                  AND COLUMN_NAME = '{col_name}'
            """))
            if check.fetchone():
                print(f"[SKIP] tesoreria_pagos_programados.{col_name} ya existe")
            else:
                await conn.execute(text(f"""
                    ALTER TABLE tesoreria_pagos_programados ADD COLUMN {col_name} {col_def}
                """))
                print(f"[OK] tesoreria_pagos_programados.{col_name} creada")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
