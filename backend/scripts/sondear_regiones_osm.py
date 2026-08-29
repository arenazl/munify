# -*- coding: utf-8 -*-
"""SONDEO: cuanta geografia real hay disponible para nuestros municipios.

QUE PREGUNTA RESPONDE
---------------------
"Si maniana quiero que las zonas de un municipio tengan su CONTORNO, ?lo puedo
bajar de OpenStreetMap, o no esta?"

Hace falta saberlo porque hoy la base tiene 494 zonas cargadas y CERO con
poligono: la segmentacion funciona por nombre, pero no se puede cruzar un
reclamo con coordenadas contra una zona. Sin contorno no hay geolocalizacion.

NO ESCRIBE NADA. Ni en la base ni en el cache de regiones: es una medicion.
Se corre, se lee el resumen, y con eso se decide si vale construir la carga.

DOS PASOS POR MUNICIPIO
-----------------------
  1. Nominatim: nombre + provincia + pais -> la relacion OSM del municipio.
     Hace falta porque `municipios_catalogo` tiene 5.122 filas y ninguna con
     `osm_id`.
  2. Overpass: las regiones administrativas DENTRO de esa relacion, contando
     cuales traen contorno.

RITMO
-----
Nominatim pide 1 consulta por segundo y un User-Agent que identifique a quien
llama; Overpass es un servicio publico que devuelve 429 si se lo apura. Por eso
el script duerme entre consultas: con 10 municipios tarda unos minutos y es a
proposito. Apurarlo es la forma de que te bloqueen la IP.

Uso:
    python scripts/sondear_regiones_osm.py --provincia Chubut --limite 10
    python scripts/sondear_regiones_osm.py --pais AR --limite 10
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = "https://overpass-api.de/api/interpreter"
# Nominatim exige identificarse. Sin esto devuelve 403.
AGENTE = "Munify/1.0 (sondeo de regiones administrativas; contacto: arenazl@gmail.com)"

PAUSA_NOMINATIM = 1.2   # su politica es 1 req/seg
PAUSA_OVERPASS = 3.0


def _pedir(url: str, datos: bytes | None = None, timeout: int = 120):
    r = urllib.request.Request(url, data=datos)
    r.add_header("User-Agent", AGENTE)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def osm_id_de(nombre: str, provincia: str, pais: str) -> str | None:
    """La relacion OSM del municipio, o None si Nominatim no la encuentra.

    Se piden relaciones y no puntos: un punto no tiene contorno, y lo que se
    esta midiendo es justamente si hay contorno."""
    q = urllib.parse.urlencode({
        "q": f"{nombre}, {provincia}, {pais}",
        "format": "json",
        "limit": 5,
    })
    try:
        for r in _pedir(f"{NOMINATIM}?{q}"):
            if r.get("osm_type") == "relation":
                return f"relation/{r['osm_id']}"
    except Exception as e:
        print(f"      nominatim fallo: {str(e)[:70]}")
    return None


def regiones_de(osm_id: str) -> tuple[int, int, str]:
    """(regiones encontradas, cuantas con contorno, detalle).

    Un solo nivel administrativo por consulta y `out geom` para que venga la
    geometria: pedir varios niveles juntos hace timeout."""
    rel = osm_id.split("/")[-1]
    area = 3600000000 + int(rel)
    total = con_geo = 0
    niveles = []
    for nivel in ("9", "10", "8"):
        consulta = (
            f'[out:json][timeout:120];'
            f'rel(area:{area})["boundary"="administrative"]["admin_level"="{nivel}"];'
            f'out geom;'
        )
        try:
            datos = _pedir(OVERPASS, consulta.encode())
        except Exception as e:
            print(f"      overpass nivel {nivel}: {str(e)[:60]}")
            time.sleep(PAUSA_OVERPASS)
            continue
        elementos = datos.get("elements", [])
        if elementos:
            geo = sum(1 for e in elementos
                      if any(m.get("geometry") for m in e.get("members", [])))
            total += len(elementos)
            con_geo += geo
            niveles.append(f"n{nivel}:{len(elementos)}({geo} con contorno)")
        time.sleep(PAUSA_OVERPASS)
    return total, con_geo, " ".join(niveles) or "sin regiones"


async def municipios(provincia: str | None, pais: str, limite: int):
    """Los municipios del CATALOGO, que es la lista de a quien se le puede
    vender — no los que ya son clientes."""
    import os
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    url = os.environ.get("DATABASE_URL") or sys.exit("FALTA DATABASE_URL")
    engine = create_async_engine(url)
    where = "pais = :pais"
    params = {"pais": pais, "limite": limite}
    if provincia:
        where += " AND provincia = :prov"
        params["prov"] = provincia
    async with engine.connect() as c:
        filas = (await c.execute(text(
            f"SELECT nombre, provincia, pais FROM municipios_catalogo "
            f"WHERE {where} ORDER BY nombre LIMIT :limite"), params)).fetchall()
    await engine.dispose()
    return [tuple(f) for f in filas]


async def municipios_por_nombre(nombres: list[str], pais: str):
    """Los del catalogo que coincidan por nombre, en el orden pedido."""
    import os
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    url = os.environ.get("DATABASE_URL") or sys.exit("FALTA DATABASE_URL")
    engine = create_async_engine(url)
    salida = []
    async with engine.connect() as c:
        for n in nombres:
            fila = (await c.execute(text(
                "SELECT nombre, provincia, pais FROM municipios_catalogo "
                "WHERE pais = :pais AND nombre = :n LIMIT 1"), {"pais": pais, "n": n})).fetchone()
            if fila:
                salida.append(tuple(fila))
            else:
                print(f"(no esta en el catalogo: {n})")
    await engine.dispose()
    return salida


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provincia")
    ap.add_argument("--pais", default="AR")
    ap.add_argument("--limite", type=int, default=10)
    # Para comparar ciudades concretas contra el barrido alfabetico: la
    # geometria disponible en OSM depende del TAMANIO del municipio, y el
    # barrido por orden alfabetico devuelve pueblos.
    ap.add_argument("--nombres", help="lista separada por comas")
    args = ap.parse_args()

    import asyncio
    if args.nombres:
        pedidos = [n.strip() for n in args.nombres.split(",") if n.strip()]
        lista = asyncio.run(municipios_por_nombre(pedidos, args.pais))
    else:
        lista = asyncio.run(municipios(args.provincia, args.pais, args.limite))
    if not lista:
        sys.exit("El catalogo no tiene municipios con ese filtro.")

    print(f"Sondeando {len(lista)} municipios "
          f"({args.provincia or args.pais}). Esto tarda unos minutos a proposito:\n"
          f"Nominatim pide 1 consulta por segundo y Overpass corta si se lo apura.\n")

    resumen = []
    for i, (nombre, provincia, pais) in enumerate(lista, 1):
        print(f"[{i}/{len(lista)}] {nombre} ({provincia})")
        oid = osm_id_de(nombre, provincia, pais)
        time.sleep(PAUSA_NOMINATIM)
        if not oid:
            print("      sin relacion en OSM")
            resumen.append((nombre, None, 0, 0, "no se encontro el municipio"))
            continue
        print(f"      {oid}")
        total, con_geo, detalle = regiones_de(oid)
        print(f"      {detalle}")
        resumen.append((nombre, oid, total, con_geo, detalle))

    print("\n" + "=" * 70)
    print(f"{'MUNICIPIO':<26} {'OSM':<18} {'REGIONES':>9} {'CON CONTORNO':>13}")
    print("-" * 70)
    for nombre, oid, total, geo, _ in resumen:
        print(f"{nombre[:25]:<26} {(oid or '-'):<18} {total:>9} {geo:>13}")
    print("-" * 70)

    hallados = [r for r in resumen if r[1]]
    con_regiones = [r for r in resumen if r[2] > 0]
    con_contorno = [r for r in resumen if r[3] > 0]
    n = len(resumen)
    print(f"Municipios encontrados en OSM ......... {len(hallados)}/{n}")
    print(f"Con regiones administrativas .......... {len(con_regiones)}/{n}")
    print(f"Con al menos un CONTORNO usable ....... {len(con_contorno)}/{n}")
    print(f"Regiones con contorno, en total ....... {sum(r[3] for r in resumen)}")
    print("\nLa ultima linea es la que decide: sin contorno no hay forma de "
          "\ncruzar un reclamo con coordenadas contra su zona.")


if __name__ == "__main__":
    main()
