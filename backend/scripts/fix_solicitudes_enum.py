"""
Actualizar ENUM de estado en tabla solicitudes para incluir nuevos estados
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "mysql+aiomysql://avnadmin:AVNS_Fqe0qsChCHnqSnVsvoi@mysql-aiven-arenazl.e.aivencloud.com:23108/sugerenciasmun"

async def migrate():
    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        # Actualizar ENUM para incluir todos los estados
        await conn.execute(text("""
            ALTER TABLE solicitudes 
            MODIFY COLUMN estado ENUM(
                'recibido', 'en_curso', 'finalizado', 'pospuesto', 'rechazado',
                'INICIADO', 'EN_REVISION', 'REQUIERE_DOCUMENTACION', 'EN_PROCESO', 'APROBADO'
            ) DEFAULT 'recibido'
        """))
        print("[OK] ENUM de estado actualizado en solicitudes")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
