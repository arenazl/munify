"""
Script para asignar dependencias a solicitudes existentes.
Busca en municipio_dependencia_tramites qué dependencia maneja cada trámite
y actualiza las solicitudes que no tienen dependencia asignada.

Ejecutar: python -m scripts.asignar_dependencias_solicitudes
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from core.config import settings

MUNICIPIO_ID = 7  # Chacabuco


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("ASIGNANDO DEPENDENCIAS A SOLICITUDES")
        print("=" * 60)

        # Primero ver cuántas solicitudes no tienen dependencia
        result = await db.execute(text("""
            SELECT COUNT(*) FROM solicitudes
            WHERE municipio_id = :municipio_id
            AND municipio_dependencia_id IS NULL
        """), {"municipio_id": MUNICIPIO_ID})
        sin_dependencia = result.scalar()
        print(f"\n[INFO] Solicitudes sin dependencia: {sin_dependencia}")

        # Ver el mapeo de trámites a dependencias
        result = await db.execute(text("""
            SELECT
                t.id as tramite_id,
                t.nombre as tramite_nombre,
                mdt.municipio_dependencia_id,
                d.nombre as dependencia_nombre
            FROM tramites t
            JOIN municipio_dependencia_tramites mdt ON mdt.tramite_id = t.id
            JOIN municipio_dependencias md ON md.id = mdt.municipio_dependencia_id
            JOIN dependencias d ON d.id = md.dependencia_id
            WHERE md.municipio_id = :municipio_id
            AND mdt.activo = true
            ORDER BY d.nombre, t.nombre
        """), {"municipio_id": MUNICIPIO_ID})

        mapeo = result.fetchall()
        print(f"\n[INFO] Trámites mapeados a dependencias: {len(mapeo)}")

        # Crear diccionario de tramite_id -> municipio_dependencia_id
        tramite_to_dep = {}
        for row in mapeo:
            tramite_to_dep[row.tramite_id] = row.municipio_dependencia_id
            print(f"  T{row.tramite_id}: {row.tramite_nombre[:40]:<40} -> {row.dependencia_nombre}")

        # Actualizar solicitudes
        print(f"\n[INFO] Actualizando solicitudes...")

        actualizadas = 0
        for tramite_id, dep_id in tramite_to_dep.items():
            result = await db.execute(text("""
                UPDATE solicitudes
                SET municipio_dependencia_id = :dep_id
                WHERE municipio_id = :municipio_id
                AND tramite_id = :tramite_id
                AND municipio_dependencia_id IS NULL
            """), {
                "dep_id": dep_id,
                "municipio_id": MUNICIPIO_ID,
                "tramite_id": tramite_id
            })
            actualizadas += result.rowcount

        # También actualizar por servicio_id (campo legacy)
        for tramite_id, dep_id in tramite_to_dep.items():
            result = await db.execute(text("""
                UPDATE solicitudes
                SET municipio_dependencia_id = :dep_id
                WHERE municipio_id = :municipio_id
                AND servicio_id = :tramite_id
                AND municipio_dependencia_id IS NULL
            """), {
                "dep_id": dep_id,
                "municipio_id": MUNICIPIO_ID,
                "tramite_id": tramite_id
            })
            actualizadas += result.rowcount

        await db.commit()

        # Verificar resultado
        result = await db.execute(text("""
            SELECT COUNT(*) FROM solicitudes
            WHERE municipio_id = :municipio_id
            AND municipio_dependencia_id IS NULL
        """), {"municipio_id": MUNICIPIO_ID})
        sin_dependencia_despues = result.scalar()

        print(f"\n" + "=" * 60)
        print("RESUMEN")
        print("=" * 60)
        print(f"  Solicitudes actualizadas: {actualizadas}")
        print(f"  Solicitudes sin dependencia (antes): {sin_dependencia}")
        print(f"  Solicitudes sin dependencia (después): {sin_dependencia_despues}")

    await engine.dispose()
    print(f"\n[DONE] Proceso completado")


if __name__ == "__main__":
    asyncio.run(main())
