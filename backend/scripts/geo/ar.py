"""Argentina: del IGN al formato canonico.

Fuentes (ya bajadas a docs/, capas WFS de wms.ign.gob.ar):
    ign_municipios_poligonos.geojson    2.114  capa ign:municipio
    ign_localidades_poligonos.geojson   3.350  capa de plantas urbanas

El IGN nombra los municipios como "Municipio X" / "Comuna Y" / "Comision Z",
asi que el prefijo se saca para que el nombre sea comparable con el catalogo.

`parent_code` de cada localidad sale por GEOMETRIA —en que municipio cae su
punto interior— y no por nombre: hay 47 "Santa Rosa" en el pais.
"""
import json
import os
import re

from shapely.geometry import shape
from shapely.prepared import prep
from shapely.strtree import STRtree

from common import (
    make_feature,
    save_geojson
)


COUNTRY = "AR"

# El IGN antepone el tipo de gobierno local al nombre.
PREFIJOS = re.compile(
    r"^(Municipio|Municipalidad|Comuna|Comision Municipal|Comisión Municipal"
    r"|Comision de Fomento|Comisión de Fomento|Junta de Gobierno"
    r"|Delegacion Municipal|Delegación Municipal)\s+",
    re.IGNORECASE
)


def limpiar(nombre):
    return PREFIJOS.sub("", (nombre or "").strip()).strip()


def leer(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f).get("features", [])


def import_argentina(input_dir, output_dir):

    municipios_raw = leer(
        os.path.join(input_dir, "ign_municipios_poligonos.geojson")
    )
    localidades_raw = leer(
        os.path.join(input_dir, "ign_localidades_poligonos.geojson")
    )

    # --- municipios ---------------------------------------------------------
    administrative = []
    geoms = []
    codigos = []

    for f in municipios_raw:
        props = f.get("properties") or {}
        nombre = limpiar(props.get("fna") or props.get("nam"))
        geometry = f.get("geometry")

        if not nombre or not geometry:
            continue

        # `in1` es el codigo INDEC; si falta, se usa el gid del IGN.
        code = str(props.get("in1") or f"ign-{props.get('gid')}")

        administrative.append(
            make_feature(
                code=code,
                name=nombre,
                level="municipality",
                country=COUNTRY,
                geometry=geometry
            )
        )

        try:
            geoms.append(shape(geometry))
            codigos.append(code)
        except Exception:
            geoms.append(None)
            codigos.append(code)

    validos = [(g, c) for g, c in zip(geoms, codigos) if g is not None]
    arbol = STRtree([g for g, _c in validos])
    listos = [prep(g) for g, _c in validos]

    # --- localidades, con su municipio como padre ---------------------------
    populated_places = []
    sin_padre = 0

    for f in localidades_raw:
        props = f.get("properties") or {}
        nombre = (props.get("fna") or props.get("nam") or "").strip()
        geometry = f.get("geometry")

        if not nombre or not geometry:
            continue

        parent_code = None

        try:
            punto = shape(geometry).representative_point()

            for idx in arbol.query(punto):
                if listos[int(idx)].contains(punto):
                    parent_code = validos[int(idx)][1]
                    break
        except Exception:
            pass

        if parent_code is None:
            sin_padre += 1

        populated_places.append(
            make_feature(
                code=str(props.get("gid")),
                name=nombre,
                level="populated_place",
                country=COUNTRY,
                parent_code=parent_code,
                geometry=geometry
            )
        )

    save_geojson(
        os.path.join(output_dir, "AR", "administrative.geojson"),
        administrative
    )
    save_geojson(
        os.path.join(output_dir, "AR", "populated_places.geojson"),
        populated_places
    )

    print(f"AR → {len(administrative)} unidades administrativas")
    print(f"AR → {len(populated_places)} localidades "
          f"({sin_padre} sin municipio)")


if __name__ == "__main__":
    import_argentina(
        r"D:\Code\sugerenciasMun\docs",
        r"D:\Code\sugerenciasMun\docs\geo"
    )
