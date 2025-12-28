"""Script para corregir fecha_resolucion en reclamos resueltos/rechazados"""
import asyncio
import sys
sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings


async def fix_fechas():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Contar antes
        result = await db.execute(text("""
            SELECT COUNT(*) FROM reclamos
            WHERE estado IN ('resuelto', 'rechazado') AND fecha_resolucion IS NULL
        """))
        antes = result.scalar()
        print(f"Reclamos resueltos/rechazados sin fecha_resolucion: {antes}")

        if antes == 0:
            print("No hay nada que corregir")
            return

        # Actualizar: usar updated_at si existe, sino created_at
        result = await db.execute(text("""
            UPDATE reclamos
            SET fecha_resolucion = COALESCE(updated_at, created_at)
            WHERE estado IN ('resuelto', 'rechazado') AND fecha_resolucion IS NULL
        """))

        await db.commit()

        # Contar despues
        result = await db.execute(text("""
            SELECT COUNT(*) FROM reclamos
            WHERE estado IN ('resuelto', 'rechazado') AND fecha_resolucion IS NULL
        """))
        despues = result.scalar()

        print(f"Corregidos: {antes - despues} reclamos")
        print(f"Pendientes: {despues}")


if __name__ == "__main__":
    asyncio.run(fix_fechas())
