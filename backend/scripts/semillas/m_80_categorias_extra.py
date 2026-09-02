"""Mas categorias, repartidas entre departamentos, con reclamos de verdad.

QUE PROBLEMA RESUELVE
El municipio tenia 10 categorias pero MAL REPARTIDAS: Servicios Publicos se
quedaba con cinco y Obras Publicas con UNA sola. Al filtrar el tablero por
Obras Publicas, la botonera de Concentracion mostraba un unico chip y el
grafico de categorias, una barra al 100% — daba la sensacion de que la app
tuviera un solo tipo de reclamo.

Este modulo suma siete categorias mas, elegidas para que CADA departamento
tenga varias cosas de que ocuparse, y les siembra reclamos para que aparezcan
en los graficos con volumen propio.

Las categorias son las que de verdad maneja una municipalidad, no relleno:
veredas y desagues son Obras; semaforos y estacionamiento son Transito;
vehiculos abandonados y cableado suelto son Seguridad; plazas y juegos son
Espacios Publicos.

COMO SIEMBRA
Igual que el resto del kit: via API, idempotente por clave natural (el nombre
de la categoria; el titulo del reclamo lleva la fecha), deterministico, con
direcciones y coordenadas REALES de OpenStreetMap del mismo cache que usan
m_60 y m_70. Cero coordenadas inventadas.

El volumen de cada categoria es fijo y distinto a proposito: un grafico donde
todas las barras miden lo mismo no dice nada. Los numeros salen escalonados
para que el ranking tenga una forma creible.
"""
from __future__ import annotations

import json
import unicodedata
from datetime import date
from pathlib import Path

from _api import ApiQA, ApiError

MARCA = "[cat_extra]"
CARPETA = Path(__file__).resolve().parent
CACHE_OSM = CARPETA / "datos" / "osm_asuncion.json"
TOKEN = "Set ampliado"

# ---------------------------------------------------------------------------
# Las categorias nuevas, cada una con SU departamento y su volumen.
#
# El departamento se referencia POR NOMBRE (clave natural): asi el modulo sirve
# para cualquier municipio que tenga dependencias equivalentes, sin ids fijos.
# ---------------------------------------------------------------------------
CATEGORIAS = [
    {
        "nombre": "Veredas en mal estado",
        "descripcion": "Baldosas flojas, rotas o veredas intransitables.",
        "icono": "Footprints",
        "dependencia": "Secretaria de Obras Publicas",
        "reclamos": 63,
        "titulo": "Vereda rota frente a una vivienda",
        "detalle": "Las baldosas estan sueltas y levantadas. Ya se cayo una persona mayor al pasar.",
    },
    {
        "nombre": "Desagues y pluviales",
        "descripcion": "Bocas de tormenta tapadas, anegamientos, agua servida en la calle.",
        "icono": "Waves",
        "dependencia": "Secretaria de Obras Publicas",
        "reclamos": 54,
        "titulo": "Boca de tormenta tapada",
        "detalle": "Con cada lluvia el agua no baja y la esquina se inunda hasta la mitad de la calzada.",
    },
    {
        "nombre": "Semaforos",
        "descripcion": "Semaforos apagados, intermitentes o descoordinados.",
        "icono": "TrafficCone",
        "dependencia": "Direccion de Transito y Seguridad Vial",
        "reclamos": 47,
        "titulo": "Semaforo apagado en un cruce con doble mano",
        "detalle": "Quedo sin luz desde el corte del jueves. En hora pico el cruce se traba.",
    },
    {
        "nombre": "Estacionamiento indebido",
        "descripcion": "Vehiculos sobre la vereda, en rampas o en doble fila.",
        "icono": "CircleParking",
        "dependencia": "Direccion de Transito y Seguridad Vial",
        "reclamos": 41,
        "titulo": "Autos sobre la vereda a la salida del colegio",
        "detalle": "Todos los mediodias estacionan sobre la vereda y los chicos tienen que bajar a la calle.",
    },
    {
        "nombre": "Vehiculos abandonados",
        "descripcion": "Autos o motos abandonados en la via publica.",
        "icono": "CarFront",
        "dependencia": "Secretaria de Seguridad",
        "reclamos": 36,
        "titulo": "Auto abandonado hace meses en la cuadra",
        "detalle": "Sin patente, con vidrios rotos y lleno de basura adentro. Junta agua cuando llueve.",
    },
    {
        "nombre": "Cableado suelto",
        "descripcion": "Cables colgando, postes inclinados o instalaciones a la vista.",
        "icono": "Cable",
        "dependencia": "Secretaria de Seguridad",
        "reclamos": 29,
        "titulo": "Cables colgando a la altura de la gente",
        "detalle": "Quedaron cables sueltos despues del temporal, a menos de dos metros de la vereda.",
    },
    {
        "nombre": "Plazas y juegos",
        "descripcion": "Juegos rotos, bancos danados o plazas sin mantenimiento.",
        "icono": "TreeDeciduous",
        "dependencia": "Secretaria de Servicios Publicos y Ambiente",
        "reclamos": 44,
        "titulo": "Juegos rotos en la plaza del barrio",
        "detalle": "La hamaca esta cortada y el tobogan tiene una chapa levantada. Es peligroso para los chicos.",
    },
]


def _norm(t) -> str:
    if t is None:
        return ""
    sin = unicodedata.normalize("NFKD", str(t))
    sin = "".join(c for c in sin if not unicodedata.combining(c))
    return " ".join(sin.lower().split())


def _esquinas(cantidad: int, salto: int) -> list[dict]:
    """Esquinas REALES del cache de OSM, deterministicas y dispersas.

    El `salto` distinto por categoria evita que dos categorias caigan en las
    MISMAS esquinas: si no, el mapa mostraria todos los focos superpuestos.
    """
    if not CACHE_OSM.exists():
        raise SystemExit(
            f"{MARCA} falta el cache {CACHE_OSM.name}.\n"
            f"                generalo con: python osm_asuncion_fetch.py"
        )
    osm = json.loads(CACHE_OSM.read_text(encoding="utf-8"))
    con_nombre = [e for e in osm["esquinas"] if e.get("a") and e.get("b")]
    return [con_nombre[(i * 97 + salto) % len(con_nombre)] for i in range(cantidad)]


def sembrar(api: ApiQA, hoy: date) -> dict:
    c = {"creados": 0, "existentes": 0, "errores": 0, "avisos": []}
    muni_id = (api.get("/users/me") or {}).get("municipio_id")
    if not muni_id:
        raise SystemExit(f"{MARCA} el usuario logueado no tiene municipio asignado.")

    dependencias = {_norm(d.get("nombre")): d for d in api.listar("/dependencias/municipio")}
    existentes_cat = {_norm(x.get("nombre")): x for x in api.listar("/categorias-reclamo")}

    # Vecinos reales: un reclamo cargado por el municipio necesita saber de
    # quien es (el backend lo exige, y con razon).
    padron = [u for u in api.listar("/users", params={"limit": 200})
              if u.get("rol") == "vecino" and u.get("dni") and not u.get("es_anonimo")]
    if not padron:
        c["avisos"].append("no hay vecinos con documento — no se pueden cargar reclamos")
        return {"creados": 0, "existentes": 0, "errores": 1}

    for indice, cat in enumerate(CATEGORIAS):
        clave = _norm(cat["nombre"])
        registro = existentes_cat.get(clave)

        if registro is None:
            try:
                registro = api.post("/categorias-reclamo", json={
                    "nombre": cat["nombre"],
                    "descripcion": cat["descripcion"],
                    "icono": cat["icono"],
                })
                c["creados"] += 1
            except ApiError as e:
                c["avisos"].append(f"'{cat['nombre']}': no se pudo crear — HTTP {e.status} {e.body[:110]}")
                c["errores"] += 1
                continue
        else:
            c["existentes"] += 1

        cat_id = (registro or {}).get("id")
        if not cat_id:
            continue

        # Colgarla de SU departamento: sin esto la categoria existe pero el
        # tablero filtrado por dependencia sigue sin verla.
        dep = dependencias.get(_norm(cat["dependencia"]))
        if dep:
            try:
                api.post(f"/dependencias/municipio/{dep['id']}/categorias",
                         json={"categoria_ids": [cat_id]})
            except ApiError as e:
                c["avisos"].append(
                    f"'{cat['nombre']}': no se pudo colgar de {cat['dependencia']} — HTTP {e.status}")
        else:
            c["avisos"].append(f"'{cat['nombre']}': no existe la dependencia '{cat['dependencia']}'")

        # ---- Reclamos de esa categoria ----
        sufijo = f"{TOKEN} · {cat['nombre']}"
        ya = {r.get("titulo") for r in api.listar(
            "/reclamos", params={"search": sufijo, "limit": 100, "categoria_id": cat_id})}

        esquinas = _esquinas(cat["reclamos"], salto=indice * 271)
        nuevos = 0
        for i, esq in enumerate(esquinas):
            titulo = f"[DEMO] {cat['titulo']} #{i + 1} · {sufijo}"
            if titulo in ya:
                c["existentes"] += 1
                continue
            try:
                api.post("/reclamos", json={
                    "titulo": titulo,
                    "descripcion": f"[DEMO] {cat['detalle']}",
                    "direccion": f"{esq['a']} y {esq['b']}",
                    "latitud": esq["lat"],
                    "longitud": esq["lon"],
                    "categoria_id": cat_id,
                    "actuando_como_user_id": padron[(i + indice) % len(padron)]["id"],
                })
                c["creados"] += 1
                nuevos += 1
            except ApiError as e:
                c["avisos"].append(f"'{cat['nombre']}' #{i + 1}: HTTP {e.status} {e.body[:90]}")
                c["errores"] += 1
                break  # si falla uno, los demas van a fallar igual: no insistir

        print(f"{MARCA} {cat['nombre']:28} dep={cat['dependencia'][:26]:28} nuevos={nuevos}")

    for aviso in c["avisos"][:12]:
        print(f"{MARCA} AVISO: {aviso}")

    print(f"[cat_extra] creados={c['creados']} existentes={c['existentes']} errores={c['errores']}")
    return {"creados": c["creados"], "existentes": c["existentes"], "errores": c["errores"]}
