import glob
import json
import os

from common import (
    make_feature,
    save_geojson,
    get_prop
)


COUNTRY = "PY"


def load_geojson_files(directory):
    features = []

    for filename in glob.glob(
        os.path.join(directory, "**", "*.geojson"),
        recursive=True
    ):
        with open(filename, "r", encoding="utf-8") as f:
            data = json.load(f)

        features.extend(data.get("features", []))

    return features


def import_paraguay(input_dir, output_dir):

    source_features = load_geojson_files(input_dir)

    administrative = []
    populated_places = []

    for feature in source_features:

        props = feature.get("properties", {})
        geometry = feature.get("geometry")

        name = get_prop(
            props,
            "NOMBRE",
            "nombre",
            "NAME",
            "name",
            "NOM_DIST",
            "NOM_LOC",
            "NOM_BARRIO"
        )

        code = get_prop(
            props,
            "CODIGO",
            "codigo",
            "COD",
            "code",
            "ID"
        )

        if not name:
            continue

        # ---------------------------------------
        # Detectar distritos
        # ---------------------------------------

        if any(
            key in props
            for key in [
                "COD_DIST",
                "CODIGO_DIST",
                "NOM_DIST"
            ]
        ):
            administrative.append(
                make_feature(
                    code=str(code) if code else None,
                    name=name,
                    level="district",
                    country=COUNTRY,
                    geometry=geometry
                )
            )

        # ---------------------------------------
        # Ciudades / localidades
        # ---------------------------------------

        if any(
            key in props
            for key in [
                "NOM_LOC",
                "NOM_BARRIO",
                "TIPO_LOC"
            ]
        ):
            populated_places.append(
                make_feature(
                    code=str(code) if code else None,
                    name=name,
                    level="populated_place",
                    country=COUNTRY,
                    geometry=geometry
                )
            )

    save_geojson(
        os.path.join(
            output_dir,
            "PY",
            "administrative.geojson"
        ),
        administrative
    )

    save_geojson(
        os.path.join(
            output_dir,
            "PY",
            "populated_places.geojson"
        ),
        populated_places
    )

    print(
        f"PY → {len(administrative)} unidades administrativas"
    )

    print(
        f"PY → {len(populated_places)} localidades"
    )
