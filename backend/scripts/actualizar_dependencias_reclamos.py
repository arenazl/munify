"""
Script para actualizar reclamos sin dependencia asignada.
Asigna la dependencia basándose en la categoría del reclamo.
Ejecutar: python -m scripts.actualizar_dependencias_reclamos
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from core.config import settings


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("ACTUALIZANDO DEPENDENCIAS EN RECLAMOS")
        print("=" * 60)

        # Contar reclamos sin dependencia
        result = await db.execute(text("""
            SELECT COUNT(*) FROM reclamos WHERE municipio_dependencia_id IS NULL
        """))
        sin_dependencia = result.scalar()
        print(f"\n[INFO] Reclamos sin dependencia asignada: {sin_dependencia}")

        if sin_dependencia == 0:
            print("[OK] Todos los reclamos tienen dependencia asignada")
            return

        # Actualizar reclamos basándose en la asignación categoría-dependencia
        result = await db.execute(text("""
            UPDATE reclamos r
            SET municipio_dependencia_id = (
                SELECT mdc.municipio_dependencia_id
                FROM municipio_dependencia_categorias mdc
                WHERE mdc.categoria_id = r.categoria_id
                AND mdc.municipio_id = r.municipio_id
                AND mdc.activo = true
                LIMIT 1
            )
            WHERE r.municipio_dependencia_id IS NULL
            AND EXISTS (
                SELECT 1 FROM municipio_dependencia_categorias mdc
                WHERE mdc.categoria_id = r.categoria_id
                AND mdc.municipio_id = r.municipio_id
                AND mdc.activo = true
            )
        """))
        actualizados = result.rowcount
        await db.commit()

        print(f"[UPDATE] Reclamos actualizados: {actualizados}")

        # Verificar resultado
        result = await db.execute(text("""
            SELECT COUNT(*) FROM reclamos WHERE municipio_dependencia_id IS NULL
        """))
        restantes = result.scalar()
        print(f"[INFO] Reclamos que aún no tienen dependencia: {restantes}")

        if restantes > 0:
            print("\n[WARN] Algunos reclamos no pudieron asignarse porque su categoría no tiene dependencia configurada:")
            result = await db.execute(text("""
                SELECT r.id, r.titulo, c.nombre as categoria, r.municipio_id
                FROM reclamos r
                LEFT JOIN categorias c ON c.id = r.categoria_id
                WHERE r.municipio_dependencia_id IS NULL
                ORDER BY r.municipio_id, c.nombre
                LIMIT 20
            """))
            for row in result.fetchall():
                print(f"   - #{row.id} [{row.municipio_id}] {row.categoria}: {row.titulo[:40]}")

        # Mostrar resumen por dependencia
        print("\n" + "=" * 60)
        print("RESUMEN POR DEPENDENCIA")
        print("=" * 60)
        result = await db.execute(text("""
            SELECT
                d.nombre as dependencia,
                COUNT(r.id) as total_reclamos
            FROM reclamos r
            JOIN municipio_dependencias md ON md.id = r.municipio_dependencia_id
            JOIN dependencias d ON d.id = md.dependencia_id
            GROUP BY d.nombre
            ORDER BY total_reclamos DESC
        """))
        for row in result.fetchall():
            print(f"  {row.dependencia}: {row.total_reclamos} reclamos")

    await engine.dispose()
    print("\n[DONE] Actualización completada")


if __name__ == "__main__":
    asyncio.run(main())
