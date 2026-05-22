"""
Migracion: agregar columnas etapa_contable y fecha_devengado a ordenes_pago.

Etapa contable es una dimension independiente del estado operativo. Sigue
el ciclo del gasto publico: PREVENTIVO -> COMPROMISO -> DEVENGADO -> PAGADO.

Default por estado actual (backfill):
  estado=pendiente   -> etapa=preventivo
  estado=autorizada  -> etapa=compromiso
  estado=pagada      -> etapa=pagado
  estado=anulada     -> etapa=preventivo (congelada, se ignora)

Idempotente. Si la columna ya existe, no hace nada.
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
        # ============ etapa_contable ============
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ordenes_pago'
              AND COLUMN_NAME = 'etapa_contable'
        """))
        if check.fetchone():
            print("[SKIP] columna etapa_contable ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE ordenes_pago
                ADD COLUMN etapa_contable
                  ENUM('preventivo','compromiso','devengado','pagado')
                  NOT NULL DEFAULT 'preventivo'
                AFTER estado,
                ADD INDEX ix_ordenes_pago_etapa (etapa_contable)
            """))
            print("[OK] columna etapa_contable creada")
            # Backfill: derivar etapa del estado actual
            result = await conn.execute(text("""
                UPDATE ordenes_pago
                SET etapa_contable = CASE estado
                    WHEN 'pagada'      THEN 'pagado'
                    WHEN 'autorizada'  THEN 'compromiso'
                    ELSE 'preventivo'
                END
            """))
            print(f"[OK] backfill etapa_contable aplicado a {result.rowcount} filas")

        # ============ fecha_devengado ============
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ordenes_pago'
              AND COLUMN_NAME = 'fecha_devengado'
        """))
        if check.fetchone():
            print("[SKIP] columna fecha_devengado ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE ordenes_pago
                ADD COLUMN fecha_devengado DATETIME NULL
                AFTER fecha_pago
            """))
            print("[OK] columna fecha_devengado creada")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
