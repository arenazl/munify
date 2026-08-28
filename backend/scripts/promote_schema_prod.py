"""Schema de la promocion qa -> master (2026-08-28): lo que create_all NO hace.

Por que existe: el pase trae columnas NUEVAS sobre tablas EXISTENTES
(`municipios.pais`, `municipios.demo_protegido`, etc.). `create_all` del
arranque solo crea tablas enteras que falten — jamas agrega una columna. Sin
estos ALTERs, el backend nuevo rompe TODO query de municipios (login incluido).

Que hace (y nada mas):
  1. Crea `poi_tipos` y `puntos_interes` si faltan (las necesitan las FKs de
     abajo; las otras tablas nuevas las crea solo el create_all del deploy).
  2. ALTERs ADITIVOS sobre 6 tablas existentes: columnas nuevas nullable o con
     default, indices y FKs. Compatible con el backend VIEJO corriendo: se
     puede ejecutar ANTES del deploy sin cortar nada.

Todo el contenido fue VALIDADO contra `sugerenciasmun-ensayo` (copia real de
prod del 2026-08-28): despues de correrlo, paridad de columnas total con el
schema de qa. No toca datos, no borra nada, no modifica columnas existentes
(el unico MODIFY es agregar el valor 'bloqueada' al enum de estado de OT, que
no altera filas).

Uso:
    python promote_schema_prod.py                        # PLAN: muestra que falta, no escribe
    python promote_schema_prod.py --apply --si-estoy-seguro   # ejecuta

Requiere DATABASE_URL en el entorno (formato mysql+aiomysql://...). La corre
quien tenga la credencial de la base destino (en prod: Infra).

Post-deploy (aparte, opcional para POI): `migrate_catalogo_municipios.py`
llena `municipios_catalogo` desde `municipios_argentina` (prod la tiene).
"""
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.environ.get("DATABASE_URL") or sys.exit(
    "FALTA DATABASE_URL en el entorno (mysql+aiomysql://...). Sin fallback: corto aca.")

APLICAR = "--apply" in sys.argv and "--si-estoy-seguro" in sys.argv

DDL_TABLAS = {
    "poi_tipos": """
CREATE TABLE `poi_tipos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `icono` varchar(50) DEFAULT NULL,
  `color` varchar(20) DEFAULT NULL,
  `radio_default_metros` int DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `orden` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_poi_tipo_muni_nombre` (`municipio_id`,`nombre`),
  KEY `ix_poi_tipo_municipio` (`municipio_id`),
  CONSTRAINT `fk_poi_tipo_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
""",
    "puntos_interes": """
CREATE TABLE `puntos_interes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `tipo_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `latitud` float NOT NULL,
  `longitud` float NOT NULL,
  `radio_metros` int NOT NULL DEFAULT '2000',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `notas` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_poi_municipio` (`municipio_id`),
  KEY `ix_poi_tipo` (`tipo_id`),
  CONSTRAINT `fk_poi_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_poi_tipo` FOREIGN KEY (`tipo_id`)
    REFERENCES `poi_tipos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
""",
}

# (tabla, columna_o_indice, tipo, sql) — cada pieza se aplica solo si falta.
COLUMNAS = [
    ("barrios", "osm_id", "ALTER TABLE `barrios` ADD COLUMN `osm_id` varchar(40) NULL"),
    ("barrios", "poligono", "ALTER TABLE `barrios` ADD COLUMN `poligono` longtext NULL"),
    ("barrios", "zona_id", "ALTER TABLE `barrios` ADD COLUMN `zona_id` int NULL"),
    ("categorias_reclamo", "interna",
     "ALTER TABLE `categorias_reclamo` ADD COLUMN `interna` tinyint(1) NOT NULL DEFAULT 0"),
    ("municipios", "demo_protegido",
     "ALTER TABLE `municipios` ADD COLUMN `demo_protegido` tinyint(1) NOT NULL DEFAULT 0"),
    ("municipios", "pais",
     "ALTER TABLE `municipios` ADD COLUMN `pais` varchar(2) NOT NULL DEFAULT 'AR'"),
    ("ordenes_trabajo", "categoria_id",
     "ALTER TABLE `ordenes_trabajo` ADD COLUMN `categoria_id` int NULL"),
    ("ordenes_trabajo", "origen",
     "ALTER TABLE `ordenes_trabajo` ADD COLUMN `origen` "
     "enum('manual','implicita','consolidada_poi') NOT NULL DEFAULT 'manual'"),
    ("ordenes_trabajo", "poi_id",
     "ALTER TABLE `ordenes_trabajo` ADD COLUMN `poi_id` int NULL"),
    ("reclamos", "poi_id", "ALTER TABLE `reclamos` ADD COLUMN `poi_id` int NULL"),
    ("reclamos", "ubicacion_origen",
     "ALTER TABLE `reclamos` ADD COLUMN `ubicacion_origen` varchar(15) NULL"),
    ("zonas", "osm_id", "ALTER TABLE `zonas` ADD COLUMN `osm_id` varchar(40) NULL"),
    ("zonas", "poligono", "ALTER TABLE `zonas` ADD COLUMN `poligono` longtext NULL"),
]

INDICES = [
    ("barrios", "ix_barrios_zona", "ALTER TABLE `barrios` ADD INDEX `ix_barrios_zona` (`zona_id`)"),
    ("ordenes_trabajo", "ix_ot_categoria",
     "ALTER TABLE `ordenes_trabajo` ADD INDEX `ix_ot_categoria` (`categoria_id`)"),
    ("ordenes_trabajo", "ix_ot_origen",
     "ALTER TABLE `ordenes_trabajo` ADD INDEX `ix_ot_origen` (`origen`)"),
    ("ordenes_trabajo", "ix_ot_poi", "ALTER TABLE `ordenes_trabajo` ADD INDEX `ix_ot_poi` (`poi_id`)"),
    ("reclamos", "ix_reclamo_poi", "ALTER TABLE `reclamos` ADD INDEX `ix_reclamo_poi` (`poi_id`)"),
]

FKS = [
    ("ordenes_trabajo", "fk_ot_categoria",
     "ALTER TABLE `ordenes_trabajo` ADD CONSTRAINT `fk_ot_categoria` FOREIGN KEY (`categoria_id`) "
     "REFERENCES `categorias_reclamo` (`id`) ON DELETE SET NULL"),
    ("ordenes_trabajo", "fk_ot_poi",
     "ALTER TABLE `ordenes_trabajo` ADD CONSTRAINT `fk_ot_poi` FOREIGN KEY (`poi_id`) "
     "REFERENCES `puntos_interes` (`id`) ON DELETE SET NULL"),
    ("reclamos", "fk_reclamo_poi",
     "ALTER TABLE `reclamos` ADD CONSTRAINT `fk_reclamo_poi` FOREIGN KEY (`poi_id`) "
     "REFERENCES `puntos_interes` (`id`) ON DELETE SET NULL"),
]

ENUM_ESTADO_OT = (
    "ALTER TABLE `ordenes_trabajo` MODIFY COLUMN `estado` "
    "enum('pendiente','asignada','en_curso','bloqueada','completada','cancelada') "
    "NOT NULL DEFAULT 'pendiente'"
)


async def main():
    engine = create_async_engine(DATABASE_URL)
    pendientes = []
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")

        async def existe(sql, **kw):
            return (await conn.execute(text(sql), kw)).scalar() > 0

        for t, ddl in DDL_TABLAS.items():
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema=DATABASE() AND table_name=:t", t=t):
                pendientes.append((f"CREATE TABLE {t}", ddl))

        for t, col, sql in COLUMNAS:
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c", t=t, c=col):
                pendientes.append((f"{t}.{col}", sql))

        if not await existe(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema=DATABASE() AND table_name='ordenes_trabajo' "
            "AND column_name='estado' AND column_type LIKE '%bloqueada%'"):
            pendientes.append(("ordenes_trabajo.estado + 'bloqueada'", ENUM_ESTADO_OT))

        for t, idx, sql in INDICES:
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema=DATABASE() AND table_name=:t AND index_name=:i", t=t, i=idx):
                pendientes.append((f"INDEX {t}.{idx}", sql))

        for t, fk, sql in FKS:
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.table_constraints "
                "WHERE table_schema=DATABASE() AND table_name=:t AND constraint_name=:f", t=t, f=fk):
                pendientes.append((f"FK {t}.{fk}", sql))

    if not pendientes:
        print("Nada que hacer: el schema ya esta al dia.")
        await engine.dispose()
        return

    print(f"{len(pendientes)} piezas faltantes:")
    for nombre, _ in pendientes:
        print(f"  - {nombre}")

    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply --si-estoy-seguro")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        for nombre, sql in pendientes:
            await conn.execute(text(sql))
            print(f"OK: {nombre}")
    await engine.dispose()
    print("\nListo. Re-correr el script debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
