"""Script para analizar categorías por municipio"""
import asyncio
import sys
sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings


async def check_municipios():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Municipios
        print("=" * 60)
        print("MUNICIPIOS")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT m.id, m.nombre,
                   (SELECT COUNT(*) FROM reclamos r WHERE r.municipio_id = m.id) as total_reclamos,
                   (SELECT COUNT(*) FROM categorias c WHERE c.municipio_id = m.id) as total_categorias
            FROM municipios m
            ORDER BY m.id
        """))
        municipios = result.fetchall()

        for m in municipios:
            print(f"ID: {m[0]:3} | {m[1]:20} | Reclamos: {m[2]:5} | Categorias: {m[3]}")

        # 2. Categorías por municipio
        print("\n" + "=" * 60)
        print("CATEGORIAS POR MUNICIPIO (solo municipios con reclamos)")
        print("=" * 60)

        for mun in municipios:
            if mun[2] > 0:  # solo municipios con reclamos
                print(f"\n--- {mun[1]} (ID: {mun[0]}) ---")
                result = await db.execute(text(f"""
                    SELECT c.id, c.nombre, COUNT(r.id) as total
                    FROM categorias c
                    LEFT JOIN reclamos r ON r.categoria_id = c.id
                    WHERE c.municipio_id = {mun[0]}
                    GROUP BY c.id, c.nombre
                    ORDER BY c.nombre
                """))
                cats = result.fetchall()
                for cat in cats:
                    print(f"  ID: {cat[0]:3} | {cat[1]:30} | {cat[2]}")


if __name__ == "__main__":
    asyncio.run(check_municipios())
