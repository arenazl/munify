"""
Script para migrar creadores de reclamos existentes a la tabla reclamo_personas.
Cada reclamo existente tendrá un registro en reclamo_personas con su creador original.
"""
import asyncio
import sys
from pathlib import Path

# Agregar backend al path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import sessionmaker
from core.config import Settings
from models.reclamo import Reclamo
from models.reclamo_persona import ReclamoPersona

settings = Settings()
AsyncSessionLocal = sessionmaker(
    create_async_engine(settings.DATABASE_URL, echo=False),
    class_=AsyncSession,
    expire_on_commit=False
)


async def migrate_creadores():
    """Migra todos los creadores de reclamos a la tabla reclamo_personas"""
    async with AsyncSessionLocal() as db:
        try:
            # Obtener todos los reclamos con creador_id
            result = await db.execute(
                select(Reclamo).where(Reclamo.creador_id.isnot(None))
            )
            reclamos = result.scalars().all()
            print(f"📋 Se encontraron {len(reclamos)} reclamos con creador")

            # Para cada reclamo, crear entrada en reclamo_personas
            added = 0
            skipped = 0

            for reclamo in reclamos:
                # Verificar si ya existe
                existing = await db.execute(
                    select(ReclamoPersona).where(
                        (ReclamoPersona.reclamo_id == reclamo.id) &
                        (ReclamoPersona.usuario_id == reclamo.creador_id)
                    )
                )
                if existing.scalar():
                    skipped += 1
                    continue

                # Crear nueva entrada
                nueva_persona = ReclamoPersona(
                    reclamo_id=reclamo.id,
                    usuario_id=reclamo.creador_id,
                    es_creador_original=True
                )
                db.add(nueva_persona)
                added += 1

                if added % 100 == 0:
                    await db.commit()
                    print(f"  ✓ {added} registros insertados...")

            # Commit final
            await db.commit()
            print(f"✅ Migración completada: {added} nuevos registros, {skipped} saltados")

        except Exception as e:
            print(f"❌ Error durante la migración: {e}")
            await db.rollback()
            raise


if __name__ == "__main__":
    asyncio.run(migrate_creadores())
