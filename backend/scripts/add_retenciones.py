"""
Migracion: agregar tabla contaduria_retenciones (catalogo) y columnas
retenciones (JSON) + monto_neto a ordenes_pago.

Idempotente.

Seed inicial para San Pedro Norte: cuatro retenciones tipicas.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


SEED_SPN = [
    # (nombre, descripcion, porcentaje, color)
    ("Tasa Municipal", "Tasa muni de Comercio e Industria local", 1.0, "#3b82f6"),
    ("Ganancias",      "Retencion AFIP impuesto a las ganancias", 2.0, "#f59e0b"),
    ("IIBB Provincial","Ingresos Brutos provincia",               3.0, "#8b5cf6"),
    ("SUSS",           "Sistema Unico de Seguridad Social",       1.0, "#10b981"),
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # ============ tabla contaduria_retenciones ============
        check = await conn.execute(text("""
            SELECT TABLE_NAME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'contaduria_retenciones'
        """))
        if check.fetchone():
            print("[SKIP] tabla contaduria_retenciones ya existe")
        else:
            await conn.execute(text("""
                CREATE TABLE contaduria_retenciones (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    municipio_id INT NOT NULL,
                    nombre VARCHAR(100) NOT NULL,
                    descripcion VARCHAR(200),
                    porcentaje DECIMAL(6,3) NOT NULL DEFAULT 0,
                    color VARCHAR(20),
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    orden INT NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX ix_ret_muni (municipio_id),
                    FOREIGN KEY (municipio_id) REFERENCES municipios(id)
                )
            """))
            print("[OK] tabla contaduria_retenciones creada")

        # ============ columnas en ordenes_pago ============
        check = await conn.execute(text("""
            SELECT COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'ordenes_pago'
              AND COLUMN_NAME = 'retenciones'
        """))
        if check.fetchone():
            print("[SKIP] columna retenciones ya existe")
        else:
            await conn.execute(text("""
                ALTER TABLE ordenes_pago
                ADD COLUMN retenciones JSON NULL AFTER monto_pesos,
                ADD COLUMN monto_neto DECIMAL(15,2) NULL AFTER retenciones
            """))
            print("[OK] columnas retenciones + monto_neto creadas")
            # Backfill: monto_neto = monto_pesos para OPs viejas (sin retenciones)
            result = await conn.execute(text("""
                UPDATE ordenes_pago SET monto_neto = monto_pesos WHERE monto_neto IS NULL
            """))
            print(f"[OK] backfill monto_neto = monto_pesos en {result.rowcount} filas")

        # ============ seed para San Pedro Norte (id=2) ============
        # Solo si el muni existe y no tiene retenciones ya cargadas
        spn = await conn.execute(text("""
            SELECT id FROM municipios WHERE codigo = 'SPN' OR id = 2 LIMIT 1
        """))
        row = spn.fetchone()
        if row:
            spn_id = row[0]
            count = await conn.execute(text("""
                SELECT COUNT(*) FROM contaduria_retenciones WHERE municipio_id = :mid
            """), {"mid": spn_id})
            if count.scalar() == 0:
                for orden, (nombre, desc, pct, color) in enumerate(SEED_SPN):
                    await conn.execute(text("""
                        INSERT INTO contaduria_retenciones
                          (municipio_id, nombre, descripcion, porcentaje, color, orden)
                        VALUES (:mid, :n, :d, :p, :c, :o)
                    """), {"mid": spn_id, "n": nombre, "d": desc, "p": pct, "c": color, "o": orden})
                print(f"[OK] seed: {len(SEED_SPN)} retenciones cargadas para muni {spn_id}")
            else:
                print(f"[SKIP] muni {spn_id} ya tiene retenciones cargadas")
        else:
            print("[SKIP] muni SPN no encontrado, salteando seed")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
