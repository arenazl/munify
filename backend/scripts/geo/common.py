import json
import os


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def save_geojson(path, features):
    ensure_dir(os.path.dirname(path))

    data = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def make_feature(
    code,
    name,
    level,
    country,
    parent_code=None,
    parent_name=None,
    parent_level=None,
    geometry=None,
    properties=None
):
    """Una unidad territorial en el formato canonico.

    `parent` va como OBJETO y no como codigo suelto: saber que Miraflores
    cuelga de "1501" no sirve de nada si despues hay que salir a buscar que es
    1501. Con {code, name, level} adentro, cada feature se entiende sola y el
    importador de cada pais no tiene que ordenar sus niveles.
    """
    props = {
        "country": country,
        "code": code,
        "name": name,
        "level": level,
        "parent": {
            "code": parent_code,
            "name": parent_name,
            "level": parent_level,
        } if parent_code or parent_name else None,
    }

    if properties:
        props.update(properties)

    return {
        "type": "Feature",
        "properties": props,
        "geometry": geometry
    }


def get_prop(properties, *names):
    for name in names:
        if name in properties:
            value = properties[name]

            if value is not None:
                return value

    return None
