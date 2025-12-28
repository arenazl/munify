"""Script para analizar categorías duplicadas y reclamos huérfanos"""
import asyncio
import sys
sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings


async def check_categorias():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Ver todas las categorías
        print("=" * 60)
        print("CATEGORIAS EN LA BASE DE DATOS")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT c.id, c.nombre, COUNT(r.id) as total_reclamos
            FROM categorias c
            LEFT JOIN reclamos r ON r.categoria_id = c.id
            GROUP BY c.id, c.nombre
            ORDER BY c.nombre
        """))
        categorias = result.fetchall()

        for cat in categorias:
            print(f"ID: {cat[0]:3} | {cat[1]:30} | Reclamos: {cat[2]}")

        # 2. Buscar categorías con nombres similares (duplicados)
        print("\n" + "=" * 60)
        print("POSIBLES DUPLICADOS (nombres similares)")
        print("=" * 60)

        nombres = [c[1] for c in categorias]
        for i, n1 in enumerate(nombres):
            for j, n2 in enumerate(nombres):
                if i < j:
                    # Comparar ignorando tildes y mayusculas
                    n1_norm = n1.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
                    n2_norm = n2.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
                    if n1_norm == n2_norm or n1_norm in n2_norm or n2_norm in n1_norm:
                        print(f"  '{n1}' vs '{n2}'")

        # 3. Total de reclamos
        print("\n" + "=" * 60)
        print("TOTALES")
        print("=" * 60)
        result = await db.execute(text("SELECT COUNT(*) FROM reclamos"))
        total = result.scalar()
        print(f"Total reclamos: {total}")

        result = await db.execute(text("SELECT COUNT(*) FROM categorias"))
        total_cat = result.scalar()
        print(f"Total categorias: {total_cat}")

        # 4. Reclamos huérfanos (sin categoría válida)
        print("\n" + "=" * 60)
        print("RECLAMOS HUERFANOS")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT r.id, r.titulo, r.categoria_id
            FROM reclamos r
            LEFT JOIN categorias c ON c.id = r.categoria_id
            WHERE c.id IS NULL
        """))
        huerfanos = result.fetchall()

        if huerfanos:
            print(f"Encontrados {len(huerfanos)} reclamos huérfanos:")
            for h in huerfanos[:20]:  # mostrar solo primeros 20
                print(f"  ID: {h[0]} | Titulo: {h[1][:40]}... | categoria_id: {h[2]}")
        else:
            print("No hay reclamos huérfanos")

        # 5. Suma de reclamos por categoría vs total
        print("\n" + "=" * 60)
        print("VERIFICACION DE SUMA")
        print("=" * 60)
        suma_por_cat = sum(c[2] for c in categorias)
        print(f"Suma de reclamos por categoría: {suma_por_cat}")
        print(f"Total reclamos en tabla: {total}")
        if suma_por_cat != total:
            print(f"DIFERENCIA: {total - suma_por_cat} reclamos sin categoría válida!")


if __name__ == "__main__":
    asyncio.run(check_categorias())
