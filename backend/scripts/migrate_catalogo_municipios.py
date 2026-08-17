# -*- coding: utf-8 -*-
"""Catalogo de municipios MULTI-PAIS para el autocomplete del alta de demos.

QUE HACE
--------
1. Renombra `municipios_argentina` -> `municipios_catalogo`. El nombre viejo
   mentia apenas entra el primer municipio paraguayo.
2. Le agrega `pais`, `osm_id` y `alias`.
   - `pais`  : ISO-2 ('AR', 'PY'). Los 2.082 que ya estaban quedan en 'AR'.
   - `osm_id`: identidad reproducible en OpenStreetMap ('relation/3654543').
               Es lo que despues permite bajar SIEMPRE la misma geometria; una
               busqueda por nombre no da esa garantia.
   - `alias` : otros nombres del mismo municipio, separados por '|'. Quien crea
               la demo escribe "Campo 9", no "Doctor J. Eulogio Estigarribia".
3. Carga las 263 intendencias de Paraguay desde `datos/municipios_py.json`.

IDEMPOTENTE: se puede correr varias veces. La clave natural de Paraguay es
(pais, nombre, provincia).

FUENTES: ver el docstring de `datos/generar_municipios_py.py`.
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATOS = Path(__file__).parent / "datos" / "municipios_py.json"


def url_destino() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit(f"ABORTO: la URL no es de QA (base '{re.sub(r'.*/', '', url)}'). "
                 "Escribir en produccion no se hace desde aca.")
    return url


async def existe(conn, tabla: str) -> bool:
    return bool((await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"), {"t": tabla})).scalar())


async def tiene_columna(conn, tabla: str, col: str) -> bool:
    return bool((await conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = :t AND column_name = :c"),
        {"t": tabla, "c": col})).scalar())


async def main():
    engine = create_async_engine(url_destino())
    async with engine.begin() as conn:
        # ---- 1. Renombre ------------------------------------------------
        if await existe(conn, "municipios_argentina") and not await existe(conn, "municipios_catalogo"):
            await conn.execute(text(
                "RENAME TABLE municipios_argentina TO municipios_catalogo"))
            print("tabla renombrada -> municipios_catalogo")
        elif not await existe(conn, "municipios_catalogo"):
            sys.exit("No existe ni municipios_argentina ni municipios_catalogo")
        else:
            print("municipios_catalogo ya existe")

        # ---- 2. Columnas nuevas -----------------------------------------
        nuevas = {
            "pais": "VARCHAR(2) NOT NULL DEFAULT 'AR'",
            "osm_id": "VARCHAR(40) NULL",
            "alias": "VARCHAR(500) NULL",
        }
        for col, ddl in nuevas.items():
            if not await tiene_columna(conn, "municipios_catalogo", col):
                await conn.execute(text(f"ALTER TABLE municipios_catalogo ADD COLUMN {col} {ddl}"))
                print(f"columna agregada: {col}")

        # Indice para que el autocomplete filtre por pais sin escanear todo.
        idx = (await conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() AND table_name = 'municipios_catalogo' "
            "AND index_name = 'ix_catalogo_pais_nombre'"))).scalar()
        if not idx:
            await conn.execute(text(
                "CREATE INDEX ix_catalogo_pais_nombre ON municipios_catalogo (pais, nombre)"))
            print("indice creado: ix_catalogo_pais_nombre")

        # ---- 3. Paraguay -------------------------------------------------
        municipios = json.loads(DATOS.read_text(encoding="utf-8"))
        print(f"\nParaguay: {len(municipios)} municipios en el archivo")

        ya = {r[0] for r in (await conn.execute(text(
            "SELECT CONCAT(nombre, '|', provincia) FROM municipios_catalogo WHERE pais = 'PY'"
        ))).all()}

        nuevos = 0
        # `id` es varchar(20), asi que el identificador tiene que ser corto:
        #   - con codigo del INE  -> py-0101   (el oficial, legible)
        #   - sin codigo          -> py-z001   (secuencial por orden alfabetico,
        #     estable entre corridas porque el archivo viene ordenado)
        sin_codigo = 0
        for m in municipios:
            clave = f"{m['nombre']}|{m['departamento']}"
            if clave in ya:
                continue
            if m.get("cod_ine"):
                ident = f"py-{m['cod_ine']}"
            else:
                sin_codigo += 1
                ident = f"py-z{sin_codigo:03d}"
            await conn.execute(text("""
                INSERT INTO municipios_catalogo (id, nombre, provincia, lat, lng, pais, alias)
                VALUES (:id, :nombre, :prov, :lat, :lng, 'PY', :alias)
            """), {
                "id": ident,
                "nombre": m["nombre"],
                "prov": m["departamento"],
                # Sin coordenada propia todavia: la trae el cruce con OSM. NO se
                # inventa un punto para rellenar.
                "lat": 0, "lng": 0,
                "alias": "|".join(m["alias"]) if m.get("alias") else None,
            })
            nuevos += 1

        print(f"insertados: {nuevos}")

    async with engine.connect() as conn:
        for pais in ("AR", "PY"):
            n = (await conn.execute(text(
                "SELECT COUNT(*) FROM municipios_catalogo WHERE pais = :p"), {"p": pais})).scalar()
            print(f"  {pais}: {n}")
        print("\nprueba de busqueda 'asun' en PY:")
        for r in (await conn.execute(text(
            "SELECT nombre, provincia FROM municipios_catalogo "
            "WHERE pais = 'PY' AND nombre LIKE '%asun%' LIMIT 5"))).all():
            print(f"   {r[0]} — {r[1]}")
    await engine.dispose()


asyncio.run(main())
