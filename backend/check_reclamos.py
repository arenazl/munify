import asyncio
from datetime import datetime, timedelta
from core.database import get_db
from models.reclamo import Reclamo
from models.user import User
from sqlalchemy import select

async def check_recent_reclamos():
    async for db in get_db():
        # Últimos 10 reclamos
        result = await db.execute(
            select(Reclamo, User)
            .join(User, Reclamo.creador_id == User.id)
            .order_by(Reclamo.created_at.desc())
            .limit(10)
        )
        rows = result.all()

        print("\n" + "="*80)
        print("ÚLTIMOS 10 RECLAMOS EN LA BASE DE DATOS")
        print("="*80)

        if not rows:
            print("No hay reclamos en la base de datos")
        else:
            for reclamo, user in rows:
                print(f"\nID: {reclamo.id}")
                print(f"  Usuario: {user.email} (ID: {user.id})")
                print(f"  Título: {reclamo.titulo}")
                print(f"  Estado: {reclamo.estado}")
                print(f"  Categoría ID: {reclamo.categoria_id}")
                print(f"  Creado: {reclamo.created_at}")
                print(f"  Hace: {datetime.now() - reclamo.created_at}")

        # Reclamos de los últimos 5 minutos
        cinco_min_atras = datetime.now() - timedelta(minutes=5)
        result_recent = await db.execute(
            select(Reclamo)
            .where(Reclamo.created_at >= cinco_min_atras)
        )
        recent = result_recent.scalars().all()

        print(f"\n{'='*80}")
        print(f"RECLAMOS CREADOS EN LOS ÚLTIMOS 5 MINUTOS: {len(recent)}")
        print("="*80)

        break

if __name__ == "__main__":
    asyncio.run(check_recent_reclamos())
