# -*- coding: utf-8 -*-
"""Cierra las coordenadas que el batch no pudo resolver, preguntando por nombre.

POR QUE EXISTE
--------------
`cargar_catalogo_latam.py` resuelve las coordenadas cruzando fuentes offline, y
llega al 97% de Paraguay. El resto son municipios cuyo nombre esta escrito
distinto en cada fuente ("Yby Ya'u" / "Yvy Ya´U" / "Yby Yau") y ahi seguir
aflojando el umbral de similitud es como se termina poniendo un municipio en la
ciudad equivocada.

Para esa cola corta conviene preguntar: son unas pocas consultas a Nominatim
--- geocoding directo, "<municipio>, <departamento>, <pais>" --- y devuelven la
ubicacion real en vez de la mas parecida. Barato porque son pocas; si fueran
miles no seria una opcion.

El resultado se VERIFICA antes de guardarse: la respuesta tiene que caer dentro
del pais. Nominatim, ante un nombre que no conoce, contesta con lo mas parecido
que encuentra en el mundo, y sin ese control un municipio paraguayo podria
terminar en Espana. Lo que no pasa el control queda en 0,0 y se informa.

USO
---
    python scripts/completar_coords_faltantes.py --pais PY
"""
import argparse
import asyncio
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from services import geo_demo  # noqa: E402

# Caja de recorte por pais: una respuesta fuera de esto no es el municipio que
# se busco. (lat_min, lat_max, lon_min, lon_max), con margen.
CAJAS = {
    "PY": (-28.0, -19.0, -63.0, -54.0),
    "AR": (-56.0, -21.0, -74.0, -53.0),
    "CL": (-56.0, -17.0, -76.0, -66.0),
    "UY": (-35.5, -30.0, -59.0, -53.0),
    "PE": (-19.0, 0.5, -82.0, -68.0),
    "BO": (-23.0, -9.0, -70.0, -57.0),
}
NOMBRE_PAIS = {"PY": "Paraguay", "AR": "Argentina", "CL": "Chile",
               "UY": "Uruguay", "PE": "Peru", "BO": "Bolivia"}


def url_qa() -> str:
    url = os.getenv("DATABASE_URL_QA") or os.getenv("DATABASE_URL") or ""
    if not url:
        for linea in io.open(Path(__file__).resolve().parent.parent / ".env", encoding="utf-8"):
            if linea.startswith("DATABASE_URL="):
                url = linea.split("=", 1)[1].strip().strip('"')
                break
    if not url:
        sys.exit("Sin DATABASE_URL")
    if "-qa" not in url and "--prod-ok" not in sys.argv:
        sys.exit("ABORTO: la base no es QA.")
    return url


async def main(pais: str) -> int:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    caja = CAJAS.get(pais)
    if not caja:
        sys.exit(f"Sin caja de recorte para {pais}: no se puede validar la respuesta.")

    engine = create_async_engine(url_qa())
    async with engine.connect() as conn:
        faltan = (await conn.execute(text(
            "SELECT id, nombre, provincia, alias FROM municipios_catalogo "
            "WHERE pais = :p AND lat = 0 AND lng = 0 ORDER BY nombre"), {"p": pais})).all()
    print(f"{pais}: {len(faltan)} sin coordenadas")
    if not faltan:
        await engine.dispose()
        return 0

    resueltos, rechazados, sin_respuesta = [], [], []
    for mid, nombre, dpto, alias in faltan:
        # Se prueba el nombre oficial y despues cada alias: el registro civil
        # dice "Teniente 1o Manuel Irala Fernandez" y el mapa lo conoce como
        # "Irala Fernandez". Ambos son el mismo lugar y el alias ya esta cargado.
        par = None
        for como in [nombre] + [a for a in (alias or "").split("|") if a]:
            par = await geo_demo.nucleo_urbano(f"{como}, {dpto}", NOMBRE_PAIS.get(pais, pais))
            if par:
                break
        if not par:
            sin_respuesta.append(nombre)
            print(f"  {nombre:36} sin respuesta")
            continue
        la, lo = par
        if not (caja[0] <= la <= caja[1] and caja[2] <= lo <= caja[3]):
            rechazados.append((nombre, la, lo))
            print(f"  {nombre:36} RECHAZADO: {la}, {lo} cae fuera de {pais}")
            continue
        resueltos.append((mid, nombre, la, lo))
        print(f"  {nombre:36} {la:.5f}, {lo:.5f}")

    if resueltos:
        async with engine.begin() as conn:
            for mid, _n, la, lo in resueltos:
                await conn.execute(text(
                    "UPDATE municipios_catalogo SET lat = :la, lng = :lo WHERE id = :i"),
                    {"la": la, "lo": lo, "i": mid})

    async with engine.connect() as conn:
        quedan = (await conn.execute(text(
            "SELECT COUNT(*) FROM municipios_catalogo "
            "WHERE pais = :p AND lat = 0 AND lng = 0"), {"p": pais})).scalar()
    await engine.dispose()

    print(f"\n{len(resueltos)} resueltos · {len(rechazados)} rechazados por caer fuera "
          f"del pais · {len(sin_respuesta)} sin respuesta")
    print(f"{pais} queda con {quedan} municipios sin coordenadas")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pais", default="PY")
    a, _ = ap.parse_known_args()
    sys.exit(asyncio.run(main(a.pais.upper())))
