"""
Ejecutar migración para tabla email_validations
"""
import asyncio
from pathlib import Path
from core.database import engine

async def run_migration():
    migration_file = Path(__file__).parent.parent / "migrations" / "create_email_validations.sql"

    with open(migration_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    async with engine.begin() as conn:
        await conn.exec_driver_sql(sql)

    print("[OK] Migracion create_email_validations ejecutada exitosamente")

if __name__ == "__main__":
    asyncio.run(run_migration())
