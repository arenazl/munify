"""Script para asignar dependencia correcta al supervisor en producción"""
import asyncio
from sqlalchemy import select, update
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import AsyncSessionLocal
from models import User, MunicipioDependenciaCategoria

async def main():
    async with AsyncSessionLocal() as db:
        # Ver supervisor
        result = await db.execute(select(User).where(User.email == 'arenazl@gmail.com'))
        user = result.scalar_one_or_none()

        if not user:
            print('ERROR: Supervisor arenazl@gmail.com no existe')
            return

        print(f'Supervisor: {user.email}')
        print(f'  municipio_id: {user.municipio_id}')
        print(f'  municipio_dependencia_id: {user.municipio_dependencia_id}')

        # Ver qué dependencia maneja categoria 1
        result2 = await db.execute(
            select(MunicipioDependenciaCategoria)
            .where(
                MunicipioDependenciaCategoria.municipio_id == user.municipio_id,
                MunicipioDependenciaCategoria.categoria_id == 1,
                MunicipioDependenciaCategoria.activo == True
            )
        )
        asig = result2.scalar_one_or_none()

        if not asig:
            print('  ERROR: categoria 1 no tiene dependencia asignada')
            return

        print(f'  categoria 1 -> dependencia: {asig.municipio_dependencia_id}')

        if user.municipio_dependencia_id != asig.municipio_dependencia_id:
            print(f'  ASIGNANDO dependencia {asig.municipio_dependencia_id} al supervisor...')
            await db.execute(
                update(User)
                .where(User.email == 'arenazl@gmail.com')
                .values(municipio_dependencia_id=asig.municipio_dependencia_id)
            )
            await db.commit()
            print('  ✓ OK - Dependencia asignada')
        else:
            print('  ✓ Ya tiene la dependencia correcta')

if __name__ == '__main__':
    asyncio.run(main())
