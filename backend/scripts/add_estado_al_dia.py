"""
Migracion: agregar 'al_dia' al enum gastos.estado_pago.

Estado intermedio entre concretado y pendiente:
- al_dia = pago de hoy registrado, todavia no confirmado. NO descuenta caja.
- El operador despues lo cambia a concretado cuando se ejecute realmente.

Idempotente. En MySQL agregar un valor al ENUM requiere recrear la columna
(via ALTER MODIFY).
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
        # Verificar que el enum actual no incluye 'al_dia' (idempotencia)
        r = await conn.execute(text("""
            SELECT COLUMN_TYPE FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'gastos'
              AND COLUMN_NAME = 'estado_pago'
        """))
        row = r.fetchone()
        if not row:
            print("[ERR] No existe la columna gastos.estado_pago")
            return
        col_type = row[0]
        print(f"Tipo actual: {col_type}")

        if "'al_dia'" in col_type:
            print("[SKIP] al_dia ya esta en el ENUM")
        else:
            await conn.execute(text("""
                ALTER TABLE gastos
                MODIFY COLUMN estado_pago
                  ENUM('concretado','al_dia','pendiente')
                  NOT NULL DEFAULT 'concretado'
            """))
            print("[OK] ENUM extendido con 'al_dia'")
    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
