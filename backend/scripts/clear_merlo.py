"""
Script para limpiar todos los datos del municipio de Merlo.
PRECAUCIÓN: Este script elimina TODOS los datos relacionados con Merlo.
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

MUNICIPIO_NOMBRE = "Merlo"


async def main():
    print("🗑️  LIMPIEZA DE DATOS DE MERLO")
    print("=" * 60)
    print("⚠️  ADVERTENCIA: Este script eliminará TODOS los datos de Merlo")
    print("=" * 60)

    # Confirmación
    respuesta = input("\n¿Estás seguro de que deseas continuar? (escribe 'SI' para confirmar): ")
    if respuesta.upper() != "SI":
        print("\n❌ Operación cancelada")
        return

    print("\n🚀 Iniciando limpieza...")

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Buscar el municipio
        print("\n📍 Buscando municipio de Merlo...")
        result = await session.execute(
            select(Municipio).where(Municipio.nombre == MUNICIPIO_NOMBRE)
        )
        municipio = result.scalar_one_or_none()

        if not municipio:
            print(f"❌ No se encontró el municipio '{MUNICIPIO_NOMBRE}'")
            return

        print(f"✅ Municipio encontrado: ID {municipio.id}")
        municipio_id = municipio.id

        # 2. Contar registros antes de eliminar
        print("\n📊 Contando registros...")

        result = await session.execute(
            select(Reclamo).where(Reclamo.municipio_id == municipio_id)
        )
        total_reclamos = len(result.scalars().all())

        result = await session.execute(
            select(Empleado).where(Empleado.municipio_id == municipio_id)
        )
        total_empleados = len(result.scalars().all())

        result = await session.execute(
            select(Categoria).where(Categoria.municipio_id == municipio_id)
        )
        total_categorias = len(result.scalars().all())

        result = await session.execute(
            select(Zona).where(Zona.municipio_id == municipio_id)
        )
        total_zonas = len(result.scalars().all())

        result = await session.execute(
            select(User).where(User.municipio_id == municipio_id)
        )
        total_usuarios = len(result.scalars().all())

        print(f"  • Reclamos: {total_reclamos}")
        print(f"  • Empleados: {total_empleados}")
        print(f"  • Categorías: {total_categorias}")
        print(f"  • Zonas: {total_zonas}")
        print(f"  • Usuarios: {total_usuarios}")

        if total_reclamos + total_empleados + total_categorias + total_zonas + total_usuarios == 0:
            print("\n✅ No hay datos para eliminar")
            return

        print("\n⚠️  Última confirmación antes de eliminar...")
        respuesta2 = input("Escribe 'ELIMINAR' para proceder: ")
        if respuesta2.upper() != "ELIMINAR":
            print("\n❌ Operación cancelada")
            return

        # 3. Eliminar en orden (por dependencias)
        print("\n🗑️  Eliminando datos...")

        # 3.1 Eliminar reclamos
        if total_reclamos > 0:
            print(f"\n  → Eliminando {total_reclamos} reclamos...")
            await session.execute(
                delete(Reclamo).where(Reclamo.municipio_id == municipio_id)
            )
            await session.commit()
            print("  ✅ Reclamos eliminados")

        # 3.2 Eliminar empleados
        if total_empleados > 0:
            print(f"\n  → Eliminando {total_empleados} empleados...")
            await session.execute(
                delete(Empleado).where(Empleado.municipio_id == municipio_id)
            )
            await session.commit()
            print("  ✅ Empleados eliminados")

        # 3.3 Eliminar categorías
        if total_categorias > 0:
            print(f"\n  → Eliminando {total_categorias} categorías...")
            await session.execute(
                delete(Categoria).where(Categoria.municipio_id == municipio_id)
            )
            await session.commit()
            print("  ✅ Categorías eliminadas")

        # 3.4 Eliminar zonas
        if total_zonas > 0:
            print(f"\n  → Eliminando {total_zonas} zonas...")
            await session.execute(
                delete(Zona).where(Zona.municipio_id == municipio_id)
            )
            await session.commit()
            print("  ✅ Zonas eliminadas")

        # 3.5 Eliminar usuarios
        if total_usuarios > 0:
            print(f"\n  → Eliminando {total_usuarios} usuarios...")
            await session.execute(
                delete(User).where(User.municipio_id == municipio_id)
            )
            await session.commit()
            print("  ✅ Usuarios eliminados")

        # 3.6 Eliminar municipio
        print(f"\n  → Eliminando municipio '{MUNICIPIO_NOMBRE}'...")
        await session.delete(municipio)
        await session.commit()
        print("  ✅ Municipio eliminado")

        # Resumen final
        print("\n" + "=" * 60)
        print("✅ LIMPIEZA COMPLETADA")
        print("=" * 60)
        print(f"\nTOTAL DE REGISTROS ELIMINADOS:")
        print(f"  • Reclamos: {total_reclamos}")
        print(f"  • Empleados: {total_empleados}")
        print(f"  • Categorías: {total_categorias}")
        print(f"  • Zonas: {total_zonas}")
        print(f"  • Usuarios: {total_usuarios}")
        print(f"  • Municipio: 1")
        print("\n💡 Ahora puedes ejecutar 'python scripts/seed_merlo.py' para crear datos frescos")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
