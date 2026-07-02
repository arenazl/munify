import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        print("== Columnas de usuarios ==")
        rc = await conn.execute(text("SHOW COLUMNS FROM usuarios"))
        print([row._mapping['Field'] for row in rc.fetchall()])
        print()
        print("== Usuarios de muni 80 (San Pedro Norte) ==")
        ru = await conn.execute(text(
            "SELECT id, email, rol, activo, nombre, apellido FROM usuarios "
            "WHERE municipio_id = 80 ORDER BY rol, id"
        ))
        rows = ru.fetchall()
        for u in rows:
            print(dict(u._mapping))
        if not rows:
            print("(SPN no tiene usuarios)")
        print()
        print("== Existe el email munisanpedronorte@gmail.com? (global, unique) ==")
        re = await conn.execute(text(
            "SELECT id, email, rol, municipio_id, activo, nombre FROM usuarios "
            "WHERE LOWER(email) = 'munisanpedronorte@gmail.com'"
        ))
        ex = re.fetchall()
        for u in ex:
            print(dict(u._mapping))
        if not ex:
            print("(no existe, hay que crearlo)")
    await engine.dispose()

asyncio.run(main())
