import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT id, email, rol, activo FROM usuarios WHERE municipio_id = 80 ORDER BY rol, id"
        ))).fetchall()
        print(f"Usuarios de San Pedro Norte (muni 80): {len(rows)}\n")
        for r in rows:
            m = r._mapping
            es_demo = m['email'].endswith('.demo.com')
            tag = "  <- DEMO (pass demo123)" if es_demo else "  <- REAL"
            act = "activo" if m['activo'] else "INACTIVO"
            print(f"  [{m['rol']:>10}] {m['email']:<48} {act}{tag}")
    await engine.dispose()

asyncio.run(main())
