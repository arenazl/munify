"""Migracion: agrega 'pendiente_pago' al ENUM de solicitudes.estado.

Ejecutar: python -m scripts.migrate_pendiente_pago
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import AsyncSessionLocal


async def migrate():
    async with AsyncSessionLocal() as db:
        print("Modificando ENUM solicitudes.estado para incluir 'pendiente_pago'...")
        # MySQL: hay que re-declarar el ENUM completo
        await db.execute(text("""
            ALTER TABLE solicitudes
            MODIFY COLUMN estado ENUM(
                'recibido','pendiente_pago','en_curso','finalizado','pospuesto','rechazado',
                'INICIADO','EN_REVISION','REQUIERE_DOCUMENTACION','EN_PROCESO','APROBADO'
            ) NOT NULL DEFAULT 'recibido'
        """))

        # Tambien historial_solicitudes si tiene la columna estado
        try:
            await db.execute(text("""
                ALTER TABLE historial_solicitudes
                MODIFY COLUMN estado_anterior ENUM(
                    'recibido','pendiente_pago','en_curso','finalizado','pospuesto','rechazado',
                    'INICIADO','EN_REVISION','REQUIERE_DOCUMENTACION','EN_PROCESO','APROBADO'
                ) NULL
            """))
            await db.execute(text("""
                ALTER TABLE historial_solicitudes
                MODIFY COLUMN estado_nuevo ENUM(
                    'recibido','pendiente_pago','en_curso','finalizado','pospuesto','rechazado',
                    'INICIADO','EN_REVISION','REQUIERE_DOCUMENTACION','EN_PROCESO','APROBADO'
                ) NULL
            """))
        except Exception as e:
            print(f"  - historial_solicitudes: {e}")

        await db.commit()
        print("OK")


if __name__ == "__main__":
    asyncio.run(migrate())
