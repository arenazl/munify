"""Migracion: crea tabla tesoreria_premios.

Catalogo global de premios/plus variables que se aplican al ejecutar
un pago programado (presentismo, trabajo extra, etc.).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

SQL = """
CREATE TABLE IF NOT EXISTS tesoreria_premios (
    id INT NOT NULL AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    monto DECIMAL(15,2) NOT NULL DEFAULT 0,
    descripcion TEXT NULL,
    color VARCHAR(20) NULL,
    icono VARCHAR(60) NULL,
    orden INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX ix_premios_muni (municipio_id),
    INDEX ix_premios_nombre (nombre),
    CONSTRAINT fk_premios_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


SPN_CODIGO = "san-pedro-norte"

PREMIOS_SEED = [
    {"nombre": "Presentismo",   "monto": 150000, "descripcion": "Plus por no tener faltas en el mes",       "color": "#10b981", "icono": "Award",    "orden": 0},
    {"nombre": "Trabajo extra", "monto": 150000, "descripcion": "Plus por trabajos fuera del horario habitual", "color": "#f59e0b", "icono": "Hammer", "orden": 1},
]


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(SQL))
        print("[OK] tabla tesoreria_premios creada (o ya existia)")

        # Seed para SPN
        muni = (await conn.execute(
            text("SELECT id FROM municipios WHERE codigo = :codigo"),
            {"codigo": SPN_CODIGO},
        )).fetchone()
        if not muni:
            print(f"[!] muni '{SPN_CODIGO}' no existe — skip seed")
        else:
            mid = muni[0]
            for p in PREMIOS_SEED:
                exists = (await conn.execute(
                    text(
                        "SELECT id FROM tesoreria_premios "
                        "WHERE municipio_id = :mid AND nombre = :nombre"
                    ),
                    {"mid": mid, "nombre": p["nombre"]},
                )).fetchone()
                if exists:
                    print(f"  [SKIP premio] {p['nombre']}")
                    continue
                await conn.execute(
                    text(
                        "INSERT INTO tesoreria_premios "
                        "(municipio_id, nombre, monto, descripcion, color, icono, orden, activo) "
                        "VALUES (:mid, :nombre, :monto, :descripcion, :color, :icono, :orden, 1)"
                    ),
                    {"mid": mid, **p},
                )
                print(f"  [OK premio] {p['nombre']}  ${p['monto']:,}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
