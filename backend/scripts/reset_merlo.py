"""
Script para limpiar y recrear todos los datos de Merlo.
Ejecuta clear_merlo.py y luego seed_merlo.py
"""
import asyncio
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete
from core.config import settings
from models.municipio import Municipio
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.empleado import Empleado
from models.reclamo import Reclamo

# Importar funciones del seed
import seed_merlo

MUNICIPIO_NOMBRE = "Merlo"


async def clear_data(session):
    """Limpia todos los datos de Merlo"""
    print("\n🗑️  LIMPIANDO DATOS DE MERLO...")
    print("=" * 60)

    # 1. Buscar el municipio
    result = await session.execute(
        select(Municipio).where(Municipio.nombre == MUNICIPIO_NOMBRE)
    )
    municipio = result.scalar_one_or_none()

    if not municipio:
        print(f"ℹ️  No se encontró el municipio '{MUNICIPIO_NOMBRE}', se creará uno nuevo")
        return

    print(f"✅ Municipio encontrado: ID {municipio.id}")
    municipio_id = municipio.id

    # 2. Contar y eliminar registros
    print("\n📊 Limpiando registros...")

    # Reclamos
    result = await session.execute(
        select(Reclamo).where(Reclamo.municipio_id == municipio_id)
    )
    total_reclamos = len(result.scalars().all())
    if total_reclamos > 0:
        await session.execute(delete(Reclamo).where(Reclamo.municipio_id == municipio_id))
        print(f"  ✓ {total_reclamos} reclamos eliminados")

    # Empleados
    result = await session.execute(
        select(Empleado).where(Empleado.municipio_id == municipio_id)
    )
    total_empleados = len(result.scalars().all())
    if total_empleados > 0:
        await session.execute(delete(Empleado).where(Empleado.municipio_id == municipio_id))
        print(f"  ✓ {total_empleados} empleados eliminados")

    # Categorías
    result = await session.execute(
        select(Categoria).where(Categoria.municipio_id == municipio_id)
    )
    total_categorias = len(result.scalars().all())
    if total_categorias > 0:
        await session.execute(delete(Categoria).where(Categoria.municipio_id == municipio_id))
        print(f"  ✓ {total_categorias} categorías eliminadas")

    # Zonas
    result = await session.execute(
        select(Zona).where(Zona.municipio_id == municipio_id)
    )
    total_zonas = len(result.scalars().all())
    if total_zonas > 0:
        await session.execute(delete(Zona).where(Zona.municipio_id == municipio_id))
        print(f"  ✓ {total_zonas} zonas eliminadas")

    # Usuarios
    result = await session.execute(
        select(User).where(User.municipio_id == municipio_id)
    )
    total_usuarios = len(result.scalars().all())
    if total_usuarios > 0:
        await session.execute(delete(User).where(User.municipio_id == municipio_id))
        print(f"  ✓ {total_usuarios} usuarios eliminados")

    # Municipio
    await session.delete(municipio)
    print(f"  ✓ Municipio '{MUNICIPIO_NOMBRE}' eliminado")

    await session.commit()
    print("\n✅ Limpieza completada")


async def main():
    print("🔄 RESET COMPLETO DE MERLO")
    print("=" * 60)
    print("Este script eliminará todos los datos de Merlo y creará")
    print("1000 reclamos nuevos con datos de prueba")
    print("=" * 60)

    # Confirmación
    respuesta = input("\n¿Deseas continuar? (escribe 'SI' para confirmar): ")
    if respuesta.upper() != "SI":
        print("\n❌ Operación cancelada")
        return

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Paso 1: Limpiar
        await clear_data(session)

    # Paso 2: Cerrar y crear nueva sesión para el seed
    await engine.dispose()

    print("\n\n" + "=" * 60)
    print("🌱 INICIANDO SEED DE DATOS...")
    print("=" * 60)

    # Ejecutar el seed
    await seed_merlo.main()


if __name__ == "__main__":
    asyncio.run(main())
