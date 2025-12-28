"""Script para unificar categorías duplicadas y eliminar las vacías en Merlo"""
import asyncio
import sys
sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings

MUNICIPIO_MERLO_ID = 48

# Mapeo de categorías a unificar: origen_id -> destino_id
UNIFICAR = {
    244: 304,  # Arbolado (14) -> Arbolado Publico
    246: 306,  # Senalizacion (20) -> Senalizacion Vial
    243: 303,  # Basura y Limpieza (22) -> Limpieza Urbana
}

# No hay mas categorias vacias que eliminar, ya se borraron


async def unificar_categorias():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("UNIFICANDO CATEGORIAS DUPLICADAS")
        print("=" * 60)

        for origen_id, destino_id in UNIFICAR.items():
            # Verificar si la categoria origen existe
            result = await db.execute(text(f"SELECT nombre FROM categorias WHERE id = {origen_id}"))
            nombre_origen = result.scalar()
            if nombre_origen is None:
                print(f"\nCategoria ID {origen_id} ya no existe, saltando...")
                continue

            # Contar reclamos a mover
            result = await db.execute(text(f"SELECT COUNT(*) FROM reclamos WHERE categoria_id = {origen_id}"))
            count = result.scalar()

            result = await db.execute(text(f"SELECT nombre FROM categorias WHERE id = {destino_id}"))
            nombre_destino = result.scalar()

            print(f"\nProcesando categoria {origen_id} -> {destino_id}:")
            print(f"  De: {nombre_origen}")
            print(f"  A:  {nombre_destino}")

            # 1. Mover reclamos
            if count > 0:
                await db.execute(text(f"UPDATE reclamos SET categoria_id = {destino_id} WHERE categoria_id = {origen_id}"))
                print(f"  Movidos {count} reclamos")

            # 2. Actualizar empleado_categorias
            result = await db.execute(text(f"SELECT empleado_id FROM empleado_categorias WHERE categoria_id = {origen_id}"))
            empleados = [r[0] for r in result.fetchall()]
            for emp_id in empleados:
                result = await db.execute(text(f"SELECT 1 FROM empleado_categorias WHERE empleado_id = {emp_id} AND categoria_id = {destino_id}"))
                existe = result.scalar()
                if not existe:
                    await db.execute(text(f"UPDATE empleado_categorias SET categoria_id = {destino_id} WHERE empleado_id = {emp_id} AND categoria_id = {origen_id}"))
                else:
                    await db.execute(text(f"DELETE FROM empleado_categorias WHERE empleado_id = {emp_id} AND categoria_id = {origen_id}"))
            if empleados:
                print(f"  Actualizados {len(empleados)} empleado_categorias")

            # 3. Actualizar empleados.categoria_principal_id
            result = await db.execute(text(f"SELECT id FROM empleados WHERE categoria_principal_id = {origen_id}"))
            empleados_principal = [r[0] for r in result.fetchall()]
            if empleados_principal:
                await db.execute(text(f"UPDATE empleados SET categoria_principal_id = {destino_id} WHERE categoria_principal_id = {origen_id}"))
                print(f"  Actualizados {len(empleados_principal)} empleados (categoria_principal)")

            # 4. Eliminar categoria origen
            await db.execute(text(f"DELETE FROM categorias WHERE id = {origen_id}"))
            print(f"  Categoria {origen_id} eliminada")

        await db.commit()

        # Estado final
        print("\n" + "=" * 60)
        print("ESTADO FINAL - CATEGORIAS DE MERLO")
        print("=" * 60)
        result = await db.execute(text(f"""
            SELECT c.id, c.nombre, COUNT(r.id) as total
            FROM categorias c
            LEFT JOIN reclamos r ON r.categoria_id = c.id
            WHERE c.municipio_id = {MUNICIPIO_MERLO_ID}
            GROUP BY c.id, c.nombre
            ORDER BY c.nombre
        """))
        cats = result.fetchall()
        total = 0
        for cat in cats:
            print(f"  ID: {cat[0]:3} | {cat[1]:30} | {cat[2]}")
            total += cat[2]
        print(f"\nTotal categorias: {len(cats)}")
        print(f"Total reclamos: {total}")


if __name__ == "__main__":
    asyncio.run(unificar_categorias())
