import json
import os

from common import (
    make_feature,
    save_geojson,
    get_prop
)


COUNTRY = "BO"


def import_bolivia(
    input_file,
    output_dir
):

    with open(
        input_file,
        "r",
        encoding="utf-8"
    ) as f:

        data = json.load(f)

    populated_places = []

    for feature in data.get("features", []):

        props = feature.get("properties", {})
        geometry = feature.get("geometry")

        name = get_prop(
            props,
            "nombre",
            "NOMBRE",
            "localidad",
            "LOCALIDAD",
            "comunidad",
            "COMUNIDAD",
            "centro_poblado"
        )

        code = get_prop(
            props,
            "codigo",
            "CODIGO",
            "cod_localidad",
            "COD_LOCALIDAD"
        )

        department = get_prop(
            props,
            "departamento",
            "DEPARTAMENTO"
        )

        province = get_prop(
            props,
            "provincia",
            "PROVINCIA"
        )

        municipality = get_prop(
            props,
            "municipio",
            "MUNICIPIO"
        )

        if not name:
            continue

        populated_places.append(
            make_feature(
                code=str(code) if code else None,
                name=name,
                level="populated_place",
                country=COUNTRY,
                geometry=geometry,
                properties={
                    "department": department,
                    "province": province,
                    "municipality": municipality
                }
            )
        )

    save_geojson(
        os.path.join(
            output_dir,
            "BO",
            "populated_places.geojson"
        ),
        populated_places
    )

    print(
        f"BO → {len(populated_places)} localidades"
    )
