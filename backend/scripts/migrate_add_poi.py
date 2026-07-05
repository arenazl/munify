"""Migración F6 · Etapa B (B1) — Puntos de Interés.

100% ADITIVA e idempotente:
  1. Tabla nueva `poi_tipos`      (catálogo configurable por muni).
  2. Tabla nueva `puntos_interes` (POIs con lat/long + radio en metros).
  3. Columna nueva `reclamos.poi_id`        (FK puntos_interes ON DELETE SET NULL).
  4. Columna nueva `ordenes_trabajo.poi_id` (FK puntos_interes ON DELETE SET NULL).

No toca ninguna columna existente. El código viejo sigue funcionando (las
columnas nuevas son nullable). Opt-in por `municipio_modulos.modulo = 'poi'`.

SEGURIDAD (igual que migrate_add_ot_origen): NO usa el engine de core.database
(que lee el .env → PROD). Construye su propio engine desde la env var
DATABASE_URL EXPLÍCITA. Sin esa env var → aborta. Imprime SELECT DATABASE()
para que se vea el objetivo.

USO:
    # dry-run (default): imprime qué haría, NO escribe nada
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_poi.py
    # aplica el schema
    DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_poi.py --aplicar
"""
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


DDL_POI_TIPOS = """
CREATE TABLE IF NOT EXISTS poi_tipos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(50) NULL,
    color VARCHAR(20) NULL,
    radio_default_metros INT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    orden INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_poi_tipo_muni_nombre (municipio_id, nombre),
    KEY ix_poi_tipo_municipio (municipio_id),
    CONSTRAINT fk_poi_tipo_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

DDL_PUNTOS_INTERES = """
CREATE TABLE IF NOT EXISTS puntos_interes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipio_id INT NOT NULL,
    tipo_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255) NULL,
    latitud FLOAT NOT NULL,
    longitud FLOAT NOT NULL,
    radio_metros INT NOT NULL DEFAULT 2000,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    notas TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    KEY ix_poi_municipio (municipio_id),
    KEY ix_poi_tipo (tipo_id),
    CONSTRAINT fk_poi_municipio FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_tipo FOREIGN KEY (tipo_id) REFERENCES poi_tipos(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

# ALTER atómico (columna + índice + FK en una sola sentencia): si fuera en pasos
# y el proceso se corta entre medio, el guard _col_existe skipearía para siempre
# y el índice/FK quedaría faltante de forma permanente.
ALTER_RECLAMOS = (
    "ALTER TABLE reclamos "
    "ADD COLUMN poi_id INT NULL, "
    "ADD KEY ix_reclamo_poi (poi_id), "
    "ADD CONSTRAINT fk_reclamo_poi FOREIGN KEY (poi_id) "
    "REFERENCES puntos_interes(id) ON DELETE SET NULL"
)
ALTER_ORDENES = (
    "ALTER TABLE ordenes_trabajo "
    "ADD COLUMN poi_id INT NULL, "
    "ADD KEY ix_ot_poi (poi_id), "
    "ADD CONSTRAINT fk_ot_poi FOREIGN KEY (poi_id) "
    "REFERENCES puntos_interes(id) ON DELETE SET NULL"
)


def _engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ABORT: exportá DATABASE_URL explícito (evita pegarle a prod por el .env).")
        print('   ej: DATABASE_URL="mysql+aiomysql://.../sugerenciasmun-qa" python scripts/migrate_add_poi.py')
        sys.exit(1)
    return create_async_engine(url)


async def _col_existe(conn, tabla: str, col: str) -> bool:
    row = (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"
    ), {"t": tabla, "c": col})).scalar()
    return bool(row)


async def _tabla_existe(conn, tabla: str) -> bool:
    row = (await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"
    ), {"t": tabla})).scalar()
    return bool(row)


async def migrate(aplicar: bool):
    engine = _engine()
    async with engine.begin() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        modo = "APLICAR" if aplicar else "DRY-RUN"
        print(f"== POI (B1) · DB objetivo: {db} · modo: {modo} ==\n")

        # 1) tabla poi_tipos
        if await _tabla_existe(conn, "poi_tipos"):
            print("SKIP: tabla poi_tipos ya existe")
        elif aplicar:
            await conn.execute(text(DDL_POI_TIPOS))
            print("OK: tabla poi_tipos creada")
        else:
            print("PLAN: crearía tabla poi_tipos")

        # 2) tabla puntos_interes (depende de poi_tipos por la FK)
        if await _tabla_existe(conn, "puntos_interes"):
            print("SKIP: tabla puntos_interes ya existe")
        elif aplicar:
            await conn.execute(text(DDL_PUNTOS_INTERES))
            print("OK: tabla puntos_interes creada")
        else:
            print("PLAN: crearía tabla puntos_interes")

        # 3) reclamos.poi_id (depende de puntos_interes por la FK)
        if await _col_existe(conn, "reclamos", "poi_id"):
            print("SKIP: reclamos.poi_id ya existe")
        elif aplicar:
            await conn.execute(text(ALTER_RECLAMOS))
            print("OK: columna reclamos.poi_id (+ índice + FK)")
        else:
            print("PLAN: agregaría columna reclamos.poi_id (+ índice + FK SET NULL)")

        # 4) ordenes_trabajo.poi_id
        if await _col_existe(conn, "ordenes_trabajo", "poi_id"):
            print("SKIP: ordenes_trabajo.poi_id ya existe")
        elif aplicar:
            await conn.execute(text(ALTER_ORDENES))
            print("OK: columna ordenes_trabajo.poi_id (+ índice + FK)")
        else:
            print("PLAN: agregaría columna ordenes_trabajo.poi_id (+ índice + FK SET NULL)")

        # En dry-run no se ejecuta ningún DDL: solo SELECTs de information_schema
        # (read-only). No hay nada que persista, así que no hace falta rollback.

    await engine.dispose()
    print("\nListo." + ("" if aplicar else "  (dry-run — nada persistido; corré con --aplicar para escribir)"))


if __name__ == "__main__":
    asyncio.run(migrate("--aplicar" in sys.argv))
