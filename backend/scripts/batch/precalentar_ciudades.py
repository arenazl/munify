# -*- coding: utf-8 -*-
"""Precalienta varias ciudades de una, para que sus demos salgan al toque.

POR QUE NO SE PRECALIENTAN LAS 5.122
-------------------------------------
Cada ciudad son 30-50 segundos contra Nominatim, que es gratuito y comunitario y
admite un pedido por segundo. El catalogo entero serian unas 39 horas seguidas
martillandolo: no es una opcion, y no por lento sino porque esta mal. Se
precalientan las que se van a mostrar --- capitales y donde hay prospectos ---, y
el resto queda para cuando aparezca.

Una ciudad SIN precalentar crea su demo igual, con direcciones genericas. Esto
mejora la demo, no la habilita.

QUE HACE
--------
Corre `geo_demo` para cada ciudad de la lista, en SERIE (nunca en paralelo: dos
procesos contra Nominatim al mismo tiempo es la forma mas rapida de que nos
bloqueen el User-Agent). Saltea las que ya tienen cache, asi se puede cortar y
retomar sin perder lo hecho.

USO
---
    python scripts/precalentar_ciudades.py                  # la lista de abajo
    python scripts/precalentar_ciudades.py --archivo mis_ciudades.txt
    python scripts/precalentar_ciudades.py --rehacer        # ignora el cache

Formato del archivo: una ciudad por linea, `nombre|pais|cod_dpto` (los dos
ultimos opcionales).
"""
import argparse
import asyncio
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from _comun import codigo_pais, contorno_catalogo, motor  # noqa: E402
from services import geo_demo  # noqa: E402

# Lista de arranque: las capitales de los seis paises y las ciudades donde hoy
# hay conversaciones. Es una lista para editar, no una verdad --- si ventas
# apunta a otro lado, se cambia aca.
CIUDADES = [
    # Paraguay, que es el que quema
    ("Asuncion", "PY", "A"),
    ("Ciudad del Este", "PY", None),
    ("Encarnacion", "PY", None),
    ("Luque", "PY", None),
    ("San Lorenzo", "PY", None),
    ("Caacupe", "PY", None),
    ("Villarrica", "PY", None),
    # Argentina
    ("Villa Carlos Paz", "Argentina", None),
    ("Pergamino", "Argentina", None),
    ("Tandil", "Argentina", None),
    # Resto
    ("Valparaiso", "Chile", None),
    ("Maldonado", "Uruguay", None),
    ("Cusco", "Peru", None),
    ("Tarija", "Bolivia", None),
]


async def centro_del_catalogo(nombre: str, cod_pais: str):
    """Las coordenadas que el batch ya verifico para ese municipio."""
    from sqlalchemy import text

    engine = motor()
    try:
        async with engine.connect() as conn:
            fila = (await conn.execute(text(
                "SELECT lat, lng FROM municipios_catalogo "
                "WHERE pais = :p AND nombre = :n AND lat <> 0 LIMIT 1"),
                {"p": cod_pais, "n": nombre})).first()
    finally:
        await engine.dispose()
    return (float(fila[0]), float(fila[1])) if fila else None


def leer_archivo(ruta: str) -> list[tuple]:
    out = []
    for linea in io.open(ruta, encoding="utf-8"):
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        partes = [p.strip() or None for p in linea.split("|")]
        out.append((partes[0], partes[1] if len(partes) > 1 else None,
                    partes[2] if len(partes) > 2 else None))
    return out


async def main(a: argparse.Namespace) -> int:
    ciudades = leer_archivo(a.archivo) if a.archivo else CIUDADES
    print(f"{len(ciudades)} ciudades · ~{len(ciudades) * 50 // 60} min estimados\n")

    hechas, salteadas, fallidas = 0, 0, []
    t0 = time.time()
    for i, (nombre, pais, dpto) in enumerate(ciudades, 1):
        if not a.rehacer and geo_demo.leer_cache(nombre):
            print(f"[{i}/{len(ciudades)}] {nombre}: ya tiene cache, se saltea")
            salteadas += 1
            continue

        print(f"[{i}/{len(ciudades)}] {nombre} ({pais})")
        cod = codigo_pais(pais or "")

        # EL CENTRO SALE DEL CATALOGO, no de una busqueda por nombre.
        #
        # Preguntarle a Nominatim "Valparaiso, Chile" devuelve la REGION de
        # Valparaiso, que incluye Isla de Pascua: su centro cae en medio del
        # Pacifico. Sorteando alrededor de ahi salieron 2 direcciones de 60
        # gastando 470 llamadas. Lo mismo con "Tarija, Bolivia", que devuelve el
        # departamento. El catalogo ya tiene la coordenada del casco urbano,
        # verificada por el batch: no hay por que volver a preguntar.
        nucleo = await centro_del_catalogo(nombre, cod) if cod else None
        if nucleo is None:
            nucleo = await geo_demo.nucleo_urbano(nombre, pais or "")

        areas = []
        if cod == "PY":
            areas = geo_demo.areas_infona(nombre, cod_dpto=dpto)
        if not areas:
            # El limite oficial del municipio, si `contornos_municipios.py` ya
            # lo cargo. Es lo que evita sortear sobre el municipio vecino.
            areas = await contorno_catalogo(nombre, pais or "")
        if not areas and nucleo:
            areas = [{"nombre": nombre,
                      "anillo": geo_demo.circulo(nucleo[0], nucleo[1], a.radio)}]
        if not areas:
            print("    sin area ni centro: se omite")
            fallidas.append(nombre)
            continue

        datos = await geo_demo.generar(nombre, areas, cantidad=a.cantidad, nucleo=nucleo)
        datos["fuente_area"] = ("INFONA" if len(areas) > 1 or (pais or "").upper()
                               in ("PY", "PARAGUAY") else f"circulo de {a.radio} km")
        geo_demo.guardar_cache(nombre, datos)
        calles = len({p["calle"] for p in datos["puntos"]})
        print(f"    {datos['resueltos']}/{a.cantidad} direcciones · {calles} calles · "
              f"{datos['llamadas_nominatim']} llamadas")
        if not datos["resueltos"]:
            fallidas.append(nombre)
        else:
            hechas += 1

    print(f"\n{hechas} precalentadas · {salteadas} ya estaban · {len(fallidas)} sin datos "
          f"· {(time.time() - t0) / 60:.0f} min")
    if fallidas:
        print(f"  sin datos: {', '.join(fallidas)}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--archivo", help="Lista propia, una ciudad por linea")
    ap.add_argument("--cantidad", type=int, default=60)
    ap.add_argument("--radio", type=float, default=3.0)
    ap.add_argument("--rehacer", action="store_true", help="Ignora el cache existente")
    sys.exit(asyncio.run(main(ap.parse_args())))
