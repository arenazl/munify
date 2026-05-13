"""Migracion + seed para Parajes (regiones del muni).

Crea tabla tesoreria_parajes + columna contactos.paraje_id (FK opcional).
Seed: 5 parajes tipicos para SPN con poligonos demo dibujados alrededor
del centro del pueblo (-30.265, -64.124).
"""
import asyncio
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select
from core.config import settings


SQL_TABLA = """
CREATE TABLE IF NOT EXISTS tesoreria_parajes (
    id INT NOT NULL AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NULL,
    color VARCHAR(20) NULL,
    icono VARCHAR(60) NULL,
    poligono TEXT NULL,
    centro_lat FLOAT NULL,
    centro_lon FLOAT NULL,
    orden INT NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    INDEX ix_paraje_muni (municipio_id),
    CONSTRAINT fk_paraje_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


async def _column_exists(conn, table: str, column: str) -> bool:
    r = await conn.execute(text(
        f"SELECT COUNT(*) FROM information_schema.COLUMNS "
        f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}'"
    ))
    row = r.fetchone()
    return row[0] > 0 if row else False


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text(SQL_TABLA))
        print("[OK] tesoreria_parajes creada o ya existia")
        # contactos.paraje_id
        if not await _column_exists(conn, 'contactos', 'paraje_id'):
            await conn.execute(text("ALTER TABLE contactos ADD COLUMN paraje_id INT NULL"))
            try:
                await conn.execute(text(
                    "ALTER TABLE contactos ADD CONSTRAINT fk_contacto_paraje "
                    "FOREIGN KEY (paraje_id) REFERENCES tesoreria_parajes(id) ON DELETE SET NULL"
                ))
            except Exception as e:
                print(f"  (FK contactos.paraje_id fallo: {e})")
            print("[OK] contactos.paraje_id agregado")
        else:
            print("[SKIP] contactos.paraje_id ya existia")
    await engine.dispose()


# ============================================================
# Seed para SPN: 5 parajes con poligonos demo alrededor del pueblo
# ============================================================
SPN = 'san-pedro-norte'
CENTRO_LAT = -30.265
CENTRO_LON = -64.124


def _poligono_circular(cx: float, cy: float, radio_km: float, vertices: int = 6, offset_grados: float = 0) -> list[list[float]]:
    """Genera un poligono regular de N vertices alrededor de (cx, cy) con
    radio en km. Para que cada paraje tenga un area visible aproximada."""
    coords = []
    for i in range(vertices):
        ang = (2 * math.pi * i / vertices) + math.radians(offset_grados)
        dlat = (radio_km / 111.0) * math.sin(ang)
        dlon = (radio_km / (111.0 * math.cos(math.radians(cx)))) * math.cos(ang)
        coords.append([round(cx + dlat, 6), round(cy + dlon, 6)])
    return coords


PARAJES = [
    {
        "nombre": "Santa Rita",
        "descripcion": "[DEMO] Paraje al norte del pueblo, sobre ruta 1.",
        "color": "#10b981",
        "icono": "Trees",
        "centro": (CENTRO_LAT + 0.04, CENTRO_LON + 0.02),
        "radio": 1.5,
    },
    {
        "nombre": "Los Alamos",
        "descripcion": "[DEMO] Zona oeste, principalmente productiva.",
        "color": "#a855f7",
        "icono": "TreePine",
        "centro": (CENTRO_LAT, CENTRO_LON - 0.06),
        "radio": 2.0,
    },
    {
        "nombre": "El Cerrito",
        "descripcion": "[DEMO] Al sur, sobre el camino al rio.",
        "color": "#f59e0b",
        "icono": "Mountain",
        "centro": (CENTRO_LAT - 0.05, CENTRO_LON),
        "radio": 1.2,
    },
    {
        "nombre": "La Esperanza",
        "descripcion": "[DEMO] Paraje agropecuario al este.",
        "color": "#06b6d4",
        "icono": "Wheat",
        "centro": (CENTRO_LAT + 0.01, CENTRO_LON + 0.07),
        "radio": 1.8,
    },
    {
        "nombre": "Don Pedro",
        "descripcion": "[DEMO] Paraje historico al noreste.",
        "color": "#ec4899",
        "icono": "Home",
        "centro": (CENTRO_LAT + 0.06, CENTRO_LON + 0.05),
        "radio": 1.4,
    },
]


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    from models import Municipio, TesoreriaParaje
    async with SessionLocal() as db:
        muni = (await db.execute(select(Municipio).where(Municipio.codigo == SPN))).scalar_one_or_none()
        if not muni:
            print(f"[!] muni '{SPN}' no existe"); return
        mid = muni.id

        for i, p in enumerate(PARAJES):
            exists = (await db.execute(
                select(TesoreriaParaje).where(
                    TesoreriaParaje.municipio_id == mid,
                    TesoreriaParaje.nombre == p["nombre"],
                )
            )).scalar_one_or_none()
            if exists:
                print(f"  [SKIP] {p['nombre']}")
                continue
            cx, cy = p["centro"]
            coords = _poligono_circular(cx, cy, p["radio"], vertices=8, offset_grados=i * 10)
            paraje = TesoreriaParaje(
                municipio_id=mid,
                nombre=p["nombre"],
                descripcion=p["descripcion"],
                color=p["color"],
                icono=p["icono"],
                poligono=json.dumps(coords),
                centro_lat=cx,
                centro_lon=cy,
                orden=i,
                activo=True,
            )
            db.add(paraje)
            print(f"  [OK] {p['nombre']}  centro ({cx}, {cy})  {len(coords)} vertices")
        await db.commit()
    await engine.dispose()


async def main():
    print("=== MIGRACION ==="); await migrate()
    print("\n=== SEED ==="); await seed()


if __name__ == '__main__':
    asyncio.run(main())
