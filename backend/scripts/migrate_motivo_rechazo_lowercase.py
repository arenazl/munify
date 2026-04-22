"""Migracion: ENUM motivo_rechazo de NAMES uppercase a values lowercase.

La columna se habia creado con los NAMES del enum Python (OTRO, DUPLICADO, ...)
pero el codigo manda los VALUES (otro, duplicado, ...) generando 500 al rechazar
un reclamo.

Estrategia:
  1. ALTER TABLE con el ENUM ampliado (acepta ambos case) temporalmente
  2. UPDATE para pasar todos los existentes a lowercase
  3. ALTER TABLE final con solo los values lowercase
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        print("1. Convertir a VARCHAR temporalmente...")
        await conn.execute(text("""
            ALTER TABLE reclamos
            MODIFY motivo_rechazo VARCHAR(30) DEFAULT NULL
        """))

        print("2. UPDATE a lowercase (usando BINARY para distinguir case)...")
        r = await conn.execute(text("""
            UPDATE reclamos
            SET motivo_rechazo = LOWER(motivo_rechazo)
            WHERE motivo_rechazo IS NOT NULL
        """))
        print(f"   {r.rowcount} filas actualizadas a lowercase")

        print("3. ENUM final (solo lowercase)...")
        await conn.execute(text("""
            ALTER TABLE reclamos
            MODIFY motivo_rechazo
            ENUM('no_competencia', 'duplicado', 'info_insuficiente', 'fuera_jurisdiccion', 'otro')
            DEFAULT NULL
        """))

        print("4. Verificacion...")
        q = await conn.execute(text("SHOW CREATE TABLE reclamos"))
        row = q.fetchone()
        ddl = row[1] if row else ""
        for line in ddl.split("\n"):
            if "motivo_rechazo" in line:
                print(f"   {line.strip()}")

    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(migrate())
