"""
Script para poblar municipio_tramites basándose en los tipos de trámite ya habilitados.
Ejecutar: python -m scripts.poblar_municipio_tramites
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
        print("POBLANDO MUNICIPIO_TRAMITES")
        print("=" * 60)

        # Obtener municipio_id (usar 7 para Chacabuco o el que corresponda)
        municipio_id = 7

        # Verificar tipos habilitados
        result = await db.execute(text("""
            SELECT mtt.tipo_tramite_id, tt.nombre
            FROM municipio_tipos_tramites mtt
            JOIN tipos_tramites tt ON tt.id = mtt.tipo_tramite_id
            WHERE mtt.municipio_id = :municipio_id AND mtt.activo = true
        """), {"municipio_id": municipio_id})
        tipos_habilitados = result.fetchall()
        print(f"\n[INFO] Tipos de trámite habilitados para municipio {municipio_id}: {len(tipos_habilitados)}")
        for tipo in tipos_habilitados:
            print(f"   - ID {tipo[0]}: {tipo[1]}")

        if not tipos_habilitados:
            print("\n[WARN] No hay tipos de trámite habilitados. Primero habilita los tipos.")
            return

        # Obtener trámites del catálogo para estos tipos
        tipo_ids = [t[0] for t in tipos_habilitados]

        result = await db.execute(text("""
            SELECT id, nombre, tipo_tramite_id, orden
            FROM tramites
            WHERE tipo_tramite_id = ANY(:tipo_ids) AND activo = true
        """), {"tipo_ids": tipo_ids})
        tramites_catalogo = result.fetchall()
        print(f"\n[INFO] Trámites en el catálogo para estos tipos: {len(tramites_catalogo)}")

        if not tramites_catalogo:
            print("\n[WARN] No hay trámites en el catálogo para los tipos habilitados.")
            return

        # Verificar cuántos ya existen
        result = await db.execute(text("""
            SELECT tramite_id FROM municipio_tramites
            WHERE municipio_id = :municipio_id
        """), {"municipio_id": municipio_id})
        ya_existentes = {row[0] for row in result.fetchall()}
        print(f"[INFO] Trámites ya habilitados: {len(ya_existentes)}")

        # Insertar los que faltan
        insertados = 0
        for tramite in tramites_catalogo:
            tramite_id = tramite[0]
            if tramite_id not in ya_existentes:
                await db.execute(text("""
                    INSERT INTO municipio_tramites (municipio_id, tramite_id, activo, orden, created_at)
                    VALUES (:municipio_id, :tramite_id, true, :orden, NOW())
                """), {
                    "municipio_id": municipio_id,
                    "tramite_id": tramite_id,
                    "orden": tramite[3] or 0
                })
                insertados += 1
                print(f"   + Habilitado: {tramite[1]}")

        await db.commit()

        print(f"\n[DONE] Trámites insertados: {insertados}")
        print(f"[DONE] Total trámites habilitados: {len(ya_existentes) + insertados}")

        # Verificar resultado
        result = await db.execute(text("""
            SELECT COUNT(*) FROM municipio_tramites WHERE municipio_id = :municipio_id
        """), {"municipio_id": municipio_id})
        total = result.scalar()
        print(f"\n[OK] Registros en municipio_tramites para municipio {municipio_id}: {total}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
