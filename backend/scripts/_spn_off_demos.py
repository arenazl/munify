import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        res = await conn.execute(text(
            "UPDATE usuarios SET activo = 0 "
            "WHERE municipio_id = 80 AND email LIKE '%.demo.com'"
        ))
        print(f"[OK] Cuentas demo desactivadas: {res.rowcount}")
        rows = (await conn.execute(text(
            "SELECT email, rol, activo FROM usuarios WHERE municipio_id = 80 ORDER BY activo DESC, rol"
        ))).fetchall()
        print("\nEstado final SPN:")
        for r in rows:
            m = r._mapping
            print(f"  [{'ON ' if m['activo'] else 'OFF'}] {m['rol']:>10}  {m['email']}")
    await engine.dispose()

asyncio.run(main())
