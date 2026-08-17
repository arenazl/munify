# -*- coding: utf-8 -*-
"""Jerarquia geografica del municipio: DISTRITO -> BARRIO, con geometria.

POR QUE
-------
Hoy `zonas` y `barrios` son dos listas sueltas: un barrio no sabe a que distrito
pertenece, y ninguna de las dos guarda su forma — solo un punto. Con eso no se
puede ni dibujar un area en el mapa ni agrupar para un grafico gerencial.

Regla del modelo (confirmada con el dueño): **todo barrio tiene distrito**. No
existe el barrio suelto. Por eso la importacion carga primero los distritos y
despues los barrios colgando de ellos; al reves quedan huerfanos, que es
exactamente el problema actual.

QUE AGREGA
----------
  zonas.osm_id    identidad reproducible en OpenStreetMap ('relation/123').
                  Es lo que permite volver a pedir SIEMPRE la misma geometria;
                  una busqueda por nombre no da esa garantia.
  zonas.poligono  la forma, como GeoJSON. Sin esto el mapa dibuja un punto
                  donde deberia haber un area, y un reclamo se asocia por
                  cercania a un centroide en vez de por "cae adentro de".
  barrios.zona_id el distrito al que pertenece el barrio.
  barrios.osm_id  idem zonas.
  barrios.poligono idem zonas.

IDEMPOTENTE: se puede correr varias veces.
"""
import asyncio
import os
import re
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def url_destino() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit(f"ABORTO: la URL no es de QA (base '{re.sub(r'.*/', '', url)}')")
    return url


COLUMNAS = {
    "zonas": {
        "osm_id": "VARCHAR(40) NULL",
        "poligono": "LONGTEXT NULL",
    },
    "barrios": {
        "zona_id": "INT NULL",
        "osm_id": "VARCHAR(40) NULL",
        "poligono": "LONGTEXT NULL",
    },
}


async def tiene_columna(conn, tabla: str, col: str) -> bool:
    return bool((await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"),
        {"t": tabla, "c": col})).scalar())


async def main():
    engine = create_async_engine(url_destino())
    async with engine.begin() as conn:
        for tabla, cols in COLUMNAS.items():
            for col, ddl in cols.items():
                if await tiene_columna(conn, tabla, col):
                    print(f"  {tabla}.{col} ya existe")
                    continue
                await conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {col} {ddl}"))
                print(f"  {tabla}.{col} agregada")

        # Indice del vinculo barrio -> distrito (se recorre en cada agrupacion).
        idx = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = 'barrios' "
            "AND index_name = 'ix_barrios_zona'"))).scalar()
        if not idx:
            await conn.execute(text("CREATE INDEX ix_barrios_zona ON barrios (zona_id)"))
            print("  indice ix_barrios_zona creado")

    async with engine.connect() as conn:
        print("\nESTADO (muni 146, Asuncion)")
        r = (await conn.execute(text("""
            SELECT (SELECT COUNT(*) FROM zonas WHERE municipio_id = 146) zonas,
                   (SELECT COUNT(*) FROM zonas WHERE municipio_id = 146 AND poligono IS NOT NULL) z_geo,
                   (SELECT COUNT(*) FROM barrios WHERE municipio_id = 146) barrios,
                   (SELECT COUNT(*) FROM barrios WHERE municipio_id = 146 AND zona_id IS NOT NULL) b_con_zona,
                   (SELECT COUNT(*) FROM barrios WHERE municipio_id = 146 AND poligono IS NOT NULL) b_geo
        """))).mappings().first()
        for k, v in r.items():
            print(f"  {k:12} {v}")
    await engine.dispose()


asyncio.run(main())
