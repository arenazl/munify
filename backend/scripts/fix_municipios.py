"""
Script para corregir datos que están en municipios incorrectos.
Permite mover reclamos y usuarios al municipio correcto.
"""
import asyncio
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, func
from core.config import settings
from models.municipio import Municipio
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.empleado import Empleado
from models.reclamo import Reclamo


async def main():
    print("=" * 70)
    print("  CORRECCION DE DATOS ENTRE MUNICIPIOS")
    print("=" * 70)

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Listar municipios
        print("\n[1] MUNICIPIOS DISPONIBLES")
        print("-" * 50)
        result = await session.execute(select(Municipio))
        municipios = {m.id: m for m in result.scalars().all()}

        for m_id, m in municipios.items():
            result = await session.execute(
                select(func.count(Reclamo.id)).where(Reclamo.municipio_id == m_id)
            )
            reclamos_count = result.scalar()
            print(f"  ID {m_id}: {m.nombre} ({reclamos_count} reclamos)")

        # 2. Preguntar municipio origen y destino
        print("\n" + "-" * 50)
        origen_id = input("\nID del municipio ORIGEN (con datos incorrectos): ").strip()
        if not origen_id.isdigit() or int(origen_id) not in municipios:
            print("ID de municipio no válido")
            return

        origen_id = int(origen_id)
        origen = municipios[origen_id]

        destino_id = input("ID del municipio DESTINO (donde deben ir los datos): ").strip()
        if not destino_id.isdigit() or int(destino_id) not in municipios:
            print("ID de municipio no válido")
            return

        destino_id = int(destino_id)
        destino = municipios[destino_id]

        if origen_id == destino_id:
            print("El municipio origen y destino son el mismo")
            return

        print(f"\n>> Mover datos de '{origen.nombre}' a '{destino.nombre}'")

        # 3. Mostrar opciones
        print("\n[2] OPCIONES DE MIGRACION")
        print("-" * 50)
        print("  1. Mover TODOS los reclamos")
        print("  2. Mover reclamos que mencionen el destino en la direccion")
        print("  3. Mover usuarios")
        print("  4. Solo mostrar lo que se moveria (sin hacer cambios)")
        print("  5. Cancelar")

        opcion = input("\nElige una opcion (1-5): ").strip()

        if opcion == "5":
            print("Cancelado")
            return

        # 4. Obtener datos del origen
        result = await session.execute(
            select(Reclamo).where(Reclamo.municipio_id == origen_id)
        )
        reclamos_origen = result.scalars().all()

        result = await session.execute(
            select(User).where(User.municipio_id == origen_id)
        )
        usuarios_origen = result.scalars().all()

        print(f"\n>> Datos en {origen.nombre}:")
        print(f"   - Reclamos: {len(reclamos_origen)}")
        print(f"   - Usuarios: {len(usuarios_origen)}")

        if opcion == "4":  # Solo mostrar
            print("\n[MODO VISTA - Sin hacer cambios]")

            # Mostrar reclamos que mencionan destino
            destino_nombre = destino.nombre.lower().replace("municipalidad de ", "").replace("municipio de ", "")
            reclamos_con_destino = [
                r for r in reclamos_origen
                if destino_nombre in (r.direccion or "").lower()
            ]

            print(f"\n>> Reclamos que mencionan '{destino_nombre}' en direccion: {len(reclamos_con_destino)}")
            for r in reclamos_con_destino[:10]:
                print(f"   #{r.id}: {r.titulo[:40]}...")
                print(f"      Direccion: {r.direccion}")

            if len(reclamos_con_destino) > 10:
                print(f"   ... y {len(reclamos_con_destino) - 10} más")

            print("\n>> Para mover estos datos, ejecuta el script de nuevo y elige opcion 1 o 2")
            return

        # Obtener categoria por defecto del destino
        result = await session.execute(
            select(Categoria).where(Categoria.municipio_id == destino_id).limit(1)
        )
        categoria_destino = result.scalar_one_or_none()

        if not categoria_destino:
            print(f"\nERROR: El municipio destino no tiene categorias. Crea categorias primero.")
            return

        print(f"\n>> Categoria por defecto para migracion: {categoria_destino.nombre} (ID: {categoria_destino.id})")

        # 5. Ejecutar migracion
        if opcion == "1":  # Mover todos
            print("\n>> Moviendo TODOS los reclamos...")
            confirmar = input(f"   Mover {len(reclamos_origen)} reclamos? (SI/NO): ").upper()
            if confirmar != "SI":
                print("Cancelado")
                return

            # Actualizar reclamos
            await session.execute(
                update(Reclamo)
                .where(Reclamo.municipio_id == origen_id)
                .values(
                    municipio_id=destino_id,
                    categoria_id=categoria_destino.id
                )
            )
            await session.commit()
            print(f"   ✅ {len(reclamos_origen)} reclamos movidos")

        elif opcion == "2":  # Mover solo los que mencionan destino
            destino_nombre = destino.nombre.lower().replace("municipalidad de ", "").replace("municipio de ", "")
            reclamos_a_mover = [
                r for r in reclamos_origen
                if destino_nombre in (r.direccion or "").lower()
            ]

            print(f"\n>> Moviendo {len(reclamos_a_mover)} reclamos que mencionan '{destino_nombre}'...")
            confirmar = input("   Confirmar? (SI/NO): ").upper()
            if confirmar != "SI":
                print("Cancelado")
                return

            for r in reclamos_a_mover:
                r.municipio_id = destino_id
                r.categoria_id = categoria_destino.id

            await session.commit()
            print(f"   ✅ {len(reclamos_a_mover)} reclamos movidos")

        elif opcion == "3":  # Mover usuarios
            print(f"\n>> Moviendo {len(usuarios_origen)} usuarios...")
            confirmar = input("   Confirmar? (SI/NO): ").upper()
            if confirmar != "SI":
                print("Cancelado")
                return

            await session.execute(
                update(User)
                .where(User.municipio_id == origen_id)
                .values(municipio_id=destino_id)
            )
            await session.commit()
            print(f"   ✅ {len(usuarios_origen)} usuarios movidos")

        print("\n" + "=" * 70)
        print("  MIGRACION COMPLETADA")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
