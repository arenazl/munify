# -*- coding: utf-8 -*-
"""Deja lista la geografia de una ciudad para que su demo hable de SUS calles.

QUE HACE
--------
Sortea coordenadas dentro del area REAL del municipio, le pregunta a Nominatim
que hay en cada una, y guarda las direcciones que devuelve. El resultado queda
cacheado en `scripts/semillas/datos/puntos_<ciudad>.json` y a partir de ahi la
semilla de demos lo consume sin tocar la red.

POR QUE ES UN SCRIPT Y NO PARTE DEL ENDPOINT
--------------------------------------------
Nominatim admite un pedido por segundo: veinte puntos son ~40 segundos contando
los descartes. Meter eso adentro del request que crea la demo lo volveria un
timeout. Se corre UNA vez por ciudad, antes de necesitarla, y la creacion de la
demo sigue siendo instantanea.

DE DONDE SALE EL AREA (en orden de preferencia)
------------------------------------------------
1. **Las zonas del municipio en la base** (`--muni <id>`): si ya tiene sus
   distritos con poligono cargado, es la fuente mas fiel y no abre ningun
   archivo. Ademas cada punto sale con su `zona_id` ya resuelto.
2. **El GeoJSON del INFONA** (`--pais PY`): division oficial paraguaya, 267
   distritos. Asuncion trae sus 6; una ciudad chica, el suyo.
3. **Un circulo alrededor del centro** (`--lat --lng --radio`): fallback
   DECLARADO para cuando no hay limite oficial. Queda anotado en el archivo
   como `fuente_area: circulo` para que nadie lo confunda con un limite real.

USO
---
    python scripts/generar_puntos_demo.py --nombre "Asuncion" --pais PY --dpto A
    python scripts/generar_puntos_demo.py --nombre "Merlo" --muni 48
    python scripts/generar_puntos_demo.py --nombre "Villa Elisa" --lat -25.36 --lng -57.59
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import geo_demo  # noqa: E402


async def areas_de_la_base(muni_id: int) -> list[dict]:
    """Zonas con poligono del municipio. Vacio si no tiene ninguna cargada."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL")
    if not url:
        print("  (sin DATABASE_URL: no se pueden leer las zonas de la base)")
        return []
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            filas = (await conn.execute(text(
                "SELECT id, nombre, poligono FROM zonas "
                "WHERE municipio_id = :m AND activo = 1 AND poligono IS NOT NULL"),
                {"m": muni_id})).all()
        return geo_demo.areas_desde_zonas(
            [{"id": f[0], "nombre": f[1], "poligono": f[2]} for f in filas])
    finally:
        await engine.dispose()


async def main(a: argparse.Namespace) -> int:
    areas: list[dict] = []
    fuente_area = ""

    # El centro del casco urbano se resuelve UNA vez y sirve para las dos cosas:
    # sesgar el sorteo hacia donde hay calles, y --- si no hay limite oficial ---
    # ser el centro del circulo de fallback. Asi el script anda con solo el
    # nombre y el pais, que es lo unico que la pantalla de demos ya sabe.
    nucleo = (a.lat, a.lng) if a.lat is not None and a.lng is not None else None
    if nucleo is None:
        nucleo = await geo_demo.nucleo_urbano(a.nombre, a.pais or "")
    print(f"nucleo urbano: {nucleo or 'no resuelto'}")

    if a.muni:
        areas = await areas_de_la_base(a.muni)
        fuente_area = f"zonas del municipio {a.muni}"
    if not areas and (a.pais or "").upper() == "PY":
        areas = geo_demo.areas_infona(a.nombre, cod_dpto=a.dpto)
        fuente_area = "INFONA (division oficial de Paraguay)"
    if not areas and nucleo:
        areas = [{"nombre": a.nombre,
                  "anillo": geo_demo.circulo(nucleo[0], nucleo[1], radio_km=a.radio)}]
        fuente_area = f"circulo APROXIMADO de {a.radio} km (NO es un limite oficial)"
    if not areas:
        print("Sin area ni centro para este municipio. Pasar --lat/--lng a mano.")
        return 1

    print(f"area: {fuente_area}")
    for x in areas:
        print(f"  {x['nombre']:38} {len(x['anillo']):5} pts")

    datos = await geo_demo.generar(a.nombre, areas, cantidad=a.cantidad, verbose=True,
                                   pais=a.pais or "", nucleo=nucleo)
    datos["fuente_area"] = fuente_area
    ruta = geo_demo.guardar_cache(a.nombre, datos)

    print(f"\n{datos['resueltos']}/{a.cantidad} con direccion real "
          f"({datos['llamadas_nominatim']} llamadas a Nominatim)")
    calles = {p["calle"] for p in datos["puntos"]}
    barrios = {p["barrio"] for p in datos["puntos"] if p.get("barrio")}
    print(f"calles distintas: {len(calles)} · barrios reconocidos: {len(barrios)}")
    print(f"-> {ruta}")
    return 0 if datos["resueltos"] else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--nombre", required=True, help="Nombre del municipio (llave del cache)")
    ap.add_argument("--muni", type=int, help="Id del municipio, para leer sus zonas de la base")
    ap.add_argument("--pais", help="ISO del pais: PY habilita la fuente INFONA")
    ap.add_argument("--dpto", help="cod_dpto del INFONA (Asuncion = A)")
    ap.add_argument("--lat", type=float, help="Centro, para el fallback circular")
    ap.add_argument("--lng", type=float)
    ap.add_argument("--radio", type=float, default=3.0, help="Radio en km del fallback")
    ap.add_argument("--cantidad", type=int, default=60,
                    help="Puntos a resolver (60 alcanza para reclamos + tramites + vecinos)")
    sys.exit(asyncio.run(main(ap.parse_args())))
