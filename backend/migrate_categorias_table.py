"""
Script para agregar columnas faltantes a la tabla categorias
"""
import asyncio
from sqlalchemy import text
from core.database import AsyncSessionLocal

async def migrate_categorias():
    async with AsyncSessionLocal() as db:
        print("=== MIGRANDO TABLA categorias ===\n")

        # Lista de columnas a agregar
        columnas = [
            ("descripcion", "TEXT NULL AFTER nombre"),
            ("icono", "VARCHAR(50) NULL AFTER descripcion"),
            ("color", "VARCHAR(7) NULL AFTER icono"),
            ("ejemplos_reclamos", "TEXT NULL AFTER color"),
            ("tip_ayuda", "VARCHAR(255) NULL AFTER ejemplos_reclamos"),
            ("tiempo_resolucion_estimado", "INT DEFAULT 48 AFTER tip_ayuda"),
            ("prioridad_default", "INT DEFAULT 3 AFTER tiempo_resolucion_estimado"),
            ("orden", "INT DEFAULT 0 AFTER prioridad_default")
        ]

        for columna, tipo in columnas:
            try:
                sql = f"ALTER TABLE categorias ADD COLUMN {columna} {tipo}"
                await db.execute(text(sql))
                await db.commit()
                print(f"[OK] Agregada columna: {columna}")
            except Exception as e:
                error_msg = str(e)
                if "Duplicate column name" in error_msg:
                    print(f"[SKIP] Columna ya existe: {columna}")
                else:
                    print(f"[ERROR] {columna}: {error_msg}")

        # Verificar estructura final
        print("\n=== ESTRUCTURA FINAL ===")
        result = await db.execute(text("DESCRIBE categorias"))
        cols = result.fetchall()
        for col in cols:
            print(f"  {col[0]}: {col[1]}")

        print("\n[SUCCESS] Migración completada")

if __name__ == "__main__":
    asyncio.run(migrate_categorias())
