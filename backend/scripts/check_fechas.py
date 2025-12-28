"""Script para verificar fechas de resolución en reclamos"""
import asyncio
import sys
sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings


async def check_fechas():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Reclamos resueltos sin fecha_resolucion
        print("=" * 60)
        print("RECLAMOS RESUELTOS SIN FECHA DE RESOLUCION")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT id, titulo, estado, fecha_resolucion, created_at, updated_at
            FROM reclamos
            WHERE estado = 'resuelto' AND fecha_resolucion IS NULL
            LIMIT 20
        """))
        sin_fecha = result.fetchall()

        if sin_fecha:
            print(f"Encontrados {len(sin_fecha)} reclamos resueltos SIN fecha_resolucion:")
            for r in sin_fecha:
                print(f"  ID: {r[0]} | {r[1][:30]}... | created: {r[4]} | updated: {r[5]}")
        else:
            print("OK - Todos los reclamos resueltos tienen fecha_resolucion")

        # Reclamos resueltos con fecha_resolucion
        print("\n" + "=" * 60)
        print("RECLAMOS RESUELTOS CON FECHA DE RESOLUCION (muestra)")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT id, titulo, estado, fecha_resolucion, created_at
            FROM reclamos
            WHERE estado = 'resuelto' AND fecha_resolucion IS NOT NULL
            ORDER BY fecha_resolucion DESC
            LIMIT 10
        """))
        con_fecha = result.fetchall()

        for r in con_fecha:
            print(f"  ID: {r[0]} | Resuelto: {r[3]} | Creado: {r[4]}")

        # Conteo por estado
        print("\n" + "=" * 60)
        print("CONTEO POR ESTADO")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT estado, COUNT(*) as total,
                   SUM(CASE WHEN fecha_resolucion IS NOT NULL THEN 1 ELSE 0 END) as con_fecha
            FROM reclamos
            GROUP BY estado
        """))
        estados = result.fetchall()

        for e in estados:
            print(f"  {e[0]:25} | Total: {e[1]:5} | Con fecha_resolucion: {e[2]}")


if __name__ == "__main__":
    asyncio.run(check_fechas())
