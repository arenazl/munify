"""
Script para limpiar categorías duplicadas del catálogo.
Ejecutar: python -m scripts.limpiar_categorias_duplicadas
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from core.config import settings

# Mapeo de duplicados: categoria_a_eliminar -> categoria_a_mantener
DUPLICADOS = {
    # "Alumbrado Publico" (17) -> "Iluminación Pública" (2)
    17: 2,
    # "Agua y Canerias" (21) -> "Agua y Cloacas" (5)
    21: 5,
    # "Desagues y Cloacas" (19) -> "Agua y Cloacas" (5)
    19: 5,
    # "Baches y Calles" (16) -> "Baches y Calzadas" (1)
    16: 1,
    # "Senalizacion" (18) -> "Semáforos y Señalización Vial" (6)
    18: 6,
    # "Veredas" (20) -> "Veredas y Baldíos" (8)
    20: 8,
    # "Animales Sueltos" (23) -> "Zoonosis y Animales" (7)
    23: 7,
}


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("LIMPIEZA DE CATEGORIAS DUPLICADAS")
        print("=" * 60)

        for cat_eliminar, cat_mantener in DUPLICADOS.items():
            # Obtener nombres para mostrar
            query = text("SELECT id, nombre FROM categorias WHERE id IN (:id1, :id2)")
            result = await db.execute(query, {"id1": cat_eliminar, "id2": cat_mantener})
            rows = {r.id: r.nombre for r in result.fetchall()}

            nombre_eliminar = rows.get(cat_eliminar, f"ID {cat_eliminar}")
            nombre_mantener = rows.get(cat_mantener, f"ID {cat_mantener}")

            if cat_eliminar not in rows:
                print(f"\n[SKIP] Categoria {cat_eliminar} ya no existe")
                continue

            print(f"\n[{cat_eliminar}] {nombre_eliminar} -> [{cat_mantener}] {nombre_mantener}")

            # 1. Actualizar reclamos que usen la categoria a eliminar
            query = text("""
                UPDATE reclamos
                SET categoria_id = :cat_mantener
                WHERE categoria_id = :cat_eliminar
            """)
            result = await db.execute(query, {"cat_mantener": cat_mantener, "cat_eliminar": cat_eliminar})
            if result.rowcount > 0:
                print(f"   - Actualizados {result.rowcount} reclamos")

            # 2. Migrar asignaciones de municipio_dependencia_categorias
            # Primero verificar si ya existe la asignacion destino
            query = text("""
                SELECT mdc1.id, mdc1.municipio_id, mdc1.dependencia_id
                FROM municipio_dependencia_categorias mdc1
                WHERE mdc1.categoria_id = :cat_eliminar
                AND NOT EXISTS (
                    SELECT 1 FROM municipio_dependencia_categorias mdc2
                    WHERE mdc2.municipio_id = mdc1.municipio_id
                    AND mdc2.dependencia_id = mdc1.dependencia_id
                    AND mdc2.categoria_id = :cat_mantener
                )
            """)
            result = await db.execute(query, {"cat_eliminar": cat_eliminar, "cat_mantener": cat_mantener})
            to_migrate = result.fetchall()

            for row in to_migrate:
                # Actualizar la asignacion existente
                query = text("""
                    UPDATE municipio_dependencia_categorias
                    SET categoria_id = :cat_mantener
                    WHERE id = :id
                """)
                await db.execute(query, {"cat_mantener": cat_mantener, "id": row.id})
                print(f"   - Migrada asignacion ID {row.id} (muni={row.municipio_id}, dep={row.dependencia_id})")

            # 3. Eliminar asignaciones duplicadas (las que ya existian con la categoria destino)
            query = text("""
                DELETE FROM municipio_dependencia_categorias
                WHERE categoria_id = :cat_eliminar
            """)
            result = await db.execute(query, {"cat_eliminar": cat_eliminar})
            if result.rowcount > 0:
                print(f"   - Eliminadas {result.rowcount} asignaciones duplicadas")

            # 4. Eliminar de municipio_categorias
            query = text("""
                DELETE FROM municipio_categorias
                WHERE categoria_id = :cat_eliminar
            """)
            result = await db.execute(query, {"cat_eliminar": cat_eliminar})
            if result.rowcount > 0:
                print(f"   - Eliminadas {result.rowcount} habilitaciones municipio_categorias")

            # 4.5 Migrar direccion_categorias (asignaciones por direccion)
            # Buscar IDs a migrar (los que no tienen conflicto)
            query = text("""
                SELECT dc1.id
                FROM direccion_categorias dc1
                WHERE dc1.categoria_id = :cat_eliminar
                AND NOT EXISTS (
                    SELECT 1 FROM direccion_categorias dc2
                    WHERE dc2.direccion_id = dc1.direccion_id
                    AND dc2.categoria_id = :cat_mantener
                )
            """)
            result = await db.execute(query, {"cat_eliminar": cat_eliminar, "cat_mantener": cat_mantener})
            ids_to_migrate = [r.id for r in result.fetchall()]

            if ids_to_migrate:
                ids_str = ','.join(str(i) for i in ids_to_migrate)
                query = text(f"""
                    UPDATE direccion_categorias
                    SET categoria_id = :cat_mantener
                    WHERE id IN ({ids_str})
                """)
                await db.execute(query, {"cat_mantener": cat_mantener})
                print(f"   - Migradas {len(ids_to_migrate)} direccion_categorias")

            # Eliminar las que quedaron duplicadas
            query = text("""
                DELETE FROM direccion_categorias
                WHERE categoria_id = :cat_eliminar
            """)
            result = await db.execute(query, {"cat_eliminar": cat_eliminar})
            if result.rowcount > 0:
                print(f"   - Eliminadas {result.rowcount} direccion_categorias duplicadas")

            # 5. Eliminar la categoria del catalogo
            query = text("DELETE FROM categorias WHERE id = :cat_eliminar")
            result = await db.execute(query, {"cat_eliminar": cat_eliminar})
            if result.rowcount > 0:
                print(f"   - Eliminada categoria del catalogo")

        await db.commit()
        print("\n" + "=" * 60)
        print("LIMPIEZA COMPLETADA")
        print("=" * 60)

        # Mostrar categorias restantes
        query = text("SELECT id, nombre FROM categorias ORDER BY nombre")
        result = await db.execute(query)
        categorias = result.fetchall()
        print(f"\nCATEGORIAS RESTANTES ({len(categorias)}):")
        for c in categorias:
            print(f"  [{c.id:2}] {c.nombre}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
