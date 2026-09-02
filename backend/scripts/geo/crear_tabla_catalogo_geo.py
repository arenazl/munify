# -*- coding: utf-8 -*-
"""Crea `catalogo_geo_osm`: la cartografia fina PRECARGADA por municipio.

Decision de arquitectura (Lucas, 2026-09-03): la cartografia NO se busca
online durante el alta de una demo — nunca funciono, por delays y caidas de
Overpass. Esta tabla es el almacen offline: UNA fila por municipio del
catalogo (clave = `municipios_catalogo.id`) con el paquete geo completo
(barrios + calles + direcciones reales de OSM), su estado y sus numeros.

La llena el batch `curar_geo_catalogo.py` (masivo, offline, reentrante). El
alta solo LEE (`services/geo_ciudad.py`).

"Tenemos / no tenemos" sale de UNA query:

    SELECT estado, COUNT(*), SUM(barrios > 0) FROM catalogo_geo_osm GROUP BY estado;
    -- y los que faltan curar:
    SELECT c.id, c.nombre, c.provincia FROM municipios_catalogo c
      LEFT JOIN catalogo_geo_osm g ON g.municipio_catalogo_id = c.id
     WHERE c.pais = 'AR' AND g.municipio_catalogo_id IS NULL;

GUARDA: aborta contra produccion — alla la crea Infra (DDL en el paquete de
promocion de base-compartida/munify/).

    python backend/scripts/geo/crear_tabla_catalogo_geo.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from core.config import settings  # noqa: E402

BASES_PRODUCCION = ("sugerenciasmun", "munify_prod")

DDL = """
CREATE TABLE IF NOT EXISTS catalogo_geo_osm (
  municipio_catalogo_id VARCHAR(20) NOT NULL PRIMARY KEY,
  pais VARCHAR(2) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  provincia VARCHAR(60) NULL,
  -- ok | sin_datos_osm | error  (sin_datos tambien se guarda: un municipio
  -- que OSM no tiene mapeado no se vuelve a pedir en cada corrida)
  estado VARCHAR(20) NOT NULL,
  barrios INT NOT NULL DEFAULT 0,
  calles INT NOT NULL DEFAULT 0,
  direcciones INT NOT NULL DEFAULT 0,
  -- El paquete que consume el alta (mismo shape que osm_de_ciudad):
  -- {places, calles, direcciones}. Recortado por geo_ciudad.recortar_para_catalogo.
  datos LONGTEXT NULL,
  detalle VARCHAR(300) NULL,
  fuente VARCHAR(60) NOT NULL DEFAULT 'OpenStreetMap (Overpass API) -- ODbL',
  curado_en DATETIME NOT NULL,
  KEY ix_geo_estado (estado),
  KEY ix_geo_pais (pais, provincia)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
"""
# La collation es la de `municipios_catalogo` (general_ci): con la default de
# la base (unicode_ci) el JOIN por id tiraba "Illegal mix of collations".


async def main() -> None:
    base = settings.DATABASE_URL.rsplit("/", 1)[-1].split("?")[0]
    if base in BASES_PRODUCCION:
        print(f"ABORTADO: `{base}` es PRODUCCION. Alla la crea Infra (paquete de promocion).")
        return
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(DDL))
            n = (await conn.execute(text("SELECT COUNT(*) FROM catalogo_geo_osm"))).scalar()
            print(f"OK: catalogo_geo_osm lista en `{base}` ({n} municipios curados hasta ahora)")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
