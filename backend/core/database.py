import os
import time

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from .config import settings

# Configuración del engine según el tipo de BD
engine_kwargs = {
    "echo": False,
}

# Pool options solo para MySQL/PostgreSQL (no SQLite)
if not settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
    })

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    """Sincroniza el schema (code-to-db) al arrancar.

    Corre en CADA worker de gunicorn y bloquea el arranque: `create_all` con
    `checkfirst` refleja tabla por tabla contra la base, así que su costo crece
    con el modelo y se paga en cada cold start de Cloud Run (que escala a cero).

    Queda ENCENDIDO por defecto para no cambiar el mecanismo de schema del
    proyecto — apagarlo a ciegas dejaría una tabla nueva sin crear en el próximo
    deploy. Para apagarlo donde el schema ya lo gobiernan las migraciones,
    setear `DB_AUTO_CREATE=false` en el ambiente. El tiempo se loguea para poder
    decidirlo con el número real a la vista, no de memoria.
    """
    if os.getenv("DB_AUTO_CREATE", "true").lower() in ("false", "0", "no"):
        print("init_db: create_all OMITIDO (DB_AUTO_CREATE=false)", flush=True)
        return
    inicio = time.monotonic()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"init_db: create_all tardó {time.monotonic() - inicio:.1f}s", flush=True)

async def close_db():
    """Cierra el pool de conexiones correctamente"""
    await engine.dispose()
