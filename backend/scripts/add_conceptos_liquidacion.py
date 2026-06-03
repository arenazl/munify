"""
Migracion: catalogo de conceptos para pagos programados (liquidaciones).

1. Crea la tabla tesoreria_conceptos_liquidacion (idempotente).
2. Seedea SPN (municipio_id=80) con los 12 conceptos curados de los datos
   reales (sin typos).
3. Normaliza los pagos programados existentes de SPN: corrige typos
   (Auxliar -> Auxiliar, Tribuno de cuenta -> Tribuno de cuentas, etc).
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402


# Catalogo curado para SPN (orden importa para la UI)
SEED_SPN = [
    # nombre, color
    ("Sueldo mensual",                          "#3b82f6"),
    ("Presentismo",                             "#10b981"),
    ("Incentivo",                               "#f59e0b"),
    ("Incentivo salud",                         "#06b6d4"),
    ("Trabajo extra",                           "#ef4444"),
    ("Profesional",                             "#8b5cf6"),
    ("Concejo deliberante",                     "#ec4899"),
    ("Administrativo del concejo deliberante",  "#a855f7"),
    ("Tribuno de cuentas",                      "#14b8a6"),
    ("Turismo y Cultura",                       "#f97316"),
    ("Auxiliar provincial escolar",             "#84cc16"),
    ("Servicios",                               "#6b7280"),
]

# Mapping de typos -> nombre canonico para normalizar pagos_programados
TYPOS_FIX = {
    "Auxliar provincial escolar":   "Auxiliar provincial escolar",
    "Auxiliar provicial escolar":   "Auxiliar provincial escolar",
    "Tribuno de cuenta":            "Tribuno de cuentas",
    "Tusimo y cultura":             "Turismo y Cultura",
}


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # ============ Crear tabla ============
        check = await conn.execute(text("""
            SELECT TABLE_NAME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tesoreria_conceptos_liquidacion'
        """))
        if check.fetchone():
            print("[SKIP] tabla tesoreria_conceptos_liquidacion ya existe")
        else:
            await conn.execute(text("""
                CREATE TABLE tesoreria_conceptos_liquidacion (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    municipio_id INT NOT NULL,
                    nombre VARCHAR(100) NOT NULL,
                    descripcion TEXT,
                    color VARCHAR(20),
                    icono VARCHAR(60),
                    orden INT NOT NULL DEFAULT 0,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX ix_cl_muni (municipio_id),
                    INDEX ix_cl_nombre (nombre),
                    FOREIGN KEY (municipio_id) REFERENCES municipios(id)
                )
            """))
            print("[OK] tabla creada")

        # ============ Seed SPN ============
        count = await conn.execute(text("""
            SELECT COUNT(*) FROM tesoreria_conceptos_liquidacion WHERE municipio_id=80
        """))
        if count.scalar() > 0:
            print("[SKIP] SPN ya tiene conceptos cargados")
        else:
            for orden, (nombre, color) in enumerate(SEED_SPN):
                await conn.execute(text("""
                    INSERT INTO tesoreria_conceptos_liquidacion
                      (municipio_id, nombre, color, orden)
                    VALUES (80, :n, :c, :o)
                """), {"n": nombre, "c": color, "o": orden})
            print(f"[OK] seed: {len(SEED_SPN)} conceptos cargados para SPN")

        # ============ Normalizar typos en pagos_programados ============
        total_fixed = 0
        for typo, canonico in TYPOS_FIX.items():
            r = await conn.execute(text("""
                UPDATE tesoreria_pagos_programados
                SET concepto = :canon
                WHERE municipio_id=80 AND concepto = :typo
            """), {"canon": canonico, "typo": typo})
            if r.rowcount:
                print(f"  [{r.rowcount}] '{typo}' -> '{canonico}'")
                total_fixed += r.rowcount
        print(f"[OK] typos corregidos: {total_fixed}")

    await engine.dispose()
    print("[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
